let cards = {};
let currentCard = null;
let isPracticeVisible = false;

const synth = window.speechSynthesis;
let practiceHanziWriter = null;
let chineseVoicePromise = null;
let saveTimeout = null;
const SAVE_DEBOUNCE_DELAY = 1500;

// --- NEW: For conflict detection ---
let lastKnownETag = null;

const INTERVAL = 0, EASE = 1, DUE = 2;
const MOEDICT_API_BASE = 'https://www.moedict.tw/raw/';
const GIST_FILENAME = 'progress.json';
const CONSTANTS = {
  AGAIN_INTERVAL: 1, MIN_GOOD_INTERVAL: 10, MIN_EASE: 130, EASY_INITIAL_DAYS: 3,
  EASY_MULTIPLIER: 1.3, HARD_MULTIPLIER: 1.2, MIN_DAY_INTERVAL: 1440,
  EASE_PENALTY_AGAIN: 20, EASE_PENALTY_HARD: 15, EASE_BONUS_EASY: 20
};
const GIST_API_BASE = 'https://api.github.com/gists/';
let accessToken = '';
let gistId = '';

const footerControls = document.querySelector('.footer-controls');

// ... searchForChar is unchanged ...
function searchForChar() {
  const charToFindRaw = prompt("Enter a character to search for:");
  if (!charToFindRaw || charToFindRaw.trim().length !== 1) {
    if (charToFindRaw !== null) alert("Please enter a single character.");
    return;
  }
  const charToFind = charToFindRaw.trim();
  const foundCardData = cards[charToFind];
  if (foundCardData) {
    if (isPracticeVisible) showStrokeOrder(); 
    currentCard = { char: charToFind, data: foundCardData };
    displayCharacter(currentCard.char);
    document.getElementById('definitions-container').style.display = 'none';
    document.getElementById('definitions-container').innerHTML = '';
    document.getElementById('main-display-wrapper').style.display = 'flex';
    document.getElementById('practice-container').style.display = 'none';
    footerControls.style.display = 'flex';
    toggleControls(true);
    updateButtonLabels();
  } else {
    if (confirm(`Character "${charToFind}" not found. Would you like to add it?`)) {
      cards[charToFind] = [0, 250, Date.now()];
      saveProgress();
      updateStatus();
      alert(`Character "${charToFind}" has been added to your deck!`);
      if (isPracticeVisible) showStrokeOrder(); 
      currentCard = { char: charToFind, data: cards[charToFind] };
      displayCharacter(currentCard.char);
      document.getElementById('definitions-container').style.display = 'none';
      document.getElementById('definitions-container').innerHTML = '';
      document.getElementById('main-display-wrapper').style.display = 'flex';
      document.getElementById('practice-container').style.display = 'none';
      footerControls.style.display = 'flex';
      toggleControls(true);
      updateButtonLabels();
    }
  }
}
function updateSyncStatus(message, isError = false) {
  const statusEl = document.getElementById('sync-status-indicator');
  if (!accessToken || !gistId) {
    statusEl.textContent = 'Local';
    statusEl.style.color = '#f39c12';
    return;
  }
  statusEl.textContent = 'Sync';
  statusEl.style.color = isError ? '#e74c3c' : '#2ecc71';
}

// --- MODIFIED: Heavily updated with ETag conflict detection ---
async function saveToCloud() {
  if (!accessToken || !gistId) return;

  // MODIFIED: Prepare data with base time and offset for saving
  const base_time_ms = Date.now();
  const cardsWithOffsets = {};
  for (const char in cards) {
      const data = cards[char];
      const offsetMinutes = Math.round((data[DUE] - base_time_ms) / 60000);
      cardsWithOffsets[char] = [data[INTERVAL], data[EASE], offsetMinutes];
  }
  const contentToSave = JSON.stringify({ base_time_ms, cards: cardsWithOffsets });

  try {
    const headResponse = await fetch(`${GIST_API_BASE}${gistId}`, {
      method: 'HEAD',
      headers: { 'Authorization': `token ${accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!headResponse.ok) throw new Error(`Failed to check remote status: ${headResponse.status}`);
    
    const currentRemoteETag = headResponse.headers.get('ETag');

    if (lastKnownETag && currentRemoteETag !== lastKnownETag) {
      alert("Sync Conflict!\n\nYour data on the cloud was updated by another device. To prevent data loss, this save has been cancelled.\n\nPlease reload the page to get the latest data.");
      updateSyncStatus('Conflict', true);
      return; 
    }

    const patchResponse = await fetch(`${GIST_API_BASE}${gistId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `token ${accessToken}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: contentToSave } } })
    });

    if (!patchResponse.ok) throw new Error(`HTTP error! Status: ${patchResponse.status}`);
    
    lastKnownETag = patchResponse.headers.get('ETag');
    updateSyncStatus('Synced', false);

  } catch (error) {
    console.error('Failed to save to Gist:', error);
    updateSyncStatus('Sync Failed', true);
  }
}

// --- MODIFIED: Now saves the ETag and handles new data format ---
async function loadFromCloud() {
  if (!accessToken || !gistId) return false;
  try {
    const response = await fetch(`${GIST_API_BASE}${gistId}`, {
      method: 'GET',
      headers: { 'Authorization': `token ${accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    
    lastKnownETag = response.headers.get('ETag');

    const data = await response.json();
    if (data.files && data.files[GIST_FILENAME]) {
      const content = data.files[GIST_FILENAME].content;
      
      // MODIFIED: Process loaded data to handle both old (absolute) and new (offset) formats
      if (content) {
        const parsedData = JSON.parse(content);
        if (parsedData && parsedData.base_time_ms && parsedData.cards) {
          // New format with base time and offsets
          const baseTime = parsedData.base_time_ms;
          const loadedCards = parsedData.cards;
          const processedCards = {};
          for (const char in loadedCards) {
            const cardData = loadedCards[char];
            const dueTimestamp = baseTime + (cardData[DUE] * 60000); // offset is in minutes
            processedCards[char] = [cardData[INTERVAL], cardData[EASE], dueTimestamp];
          }
          cards = processedCards;
        } else {
          // Old format, or empty object
          cards = parsedData || {};
        }
      } else {
        cards = {};
      }
    }
    updateSyncStatus('Connected', false);
    return true;
  } catch (error) {
    console.error('Failed to load from Gist:', error);
    updateSyncStatus('Connection Failed', true);
    lastKnownETag = null; 
    return false;
  }
}
function loadCredentials() {
  accessToken = localStorage.getItem('ankiAccessToken') || '';
  gistId = localStorage.getItem('ankiGistId') || '';
}

// ... getChineseVoice and other display functions are unchanged ...
function getChineseVoice() {
  if (chineseVoicePromise) { return chineseVoicePromise; }
  chineseVoicePromise = new Promise((resolve) => {
    const findVoice = () => {
      const voices = synth.getVoices();
      if (voices.length > 0) {
        const foundVoice = voices.find(v => v.name === 'Google 國語（台灣）') || voices.find(v => v.lang === 'zh-TW') || voices.find(v => v.lang.startsWith('zh-')) || voices.find(v => v.lang === 'zh');
        resolve(foundVoice || null);
      }
    };
    findVoice();
    if (synth.onvoiceschanged !== undefined) { synth.onvoiceschanged = findVoice; }
  });
  return chineseVoicePromise;
}
async function speakCharacter() {
  if (!currentCard || !currentCard.char) return;
  if (synth.speaking) synth.cancel();
  const chineseVoice = await getChineseVoice();
  const utterance = new SpeechSynthesisUtterance(currentCard.char);
  if (chineseVoice) { utterance.voice = chineseVoice; }
  utterance.lang = 'zh-TW';
  utterance.rate = 0.8;
  synth.speak(utterance);
  if (!isPracticeVisible) { fetchAndDisplayDetails(currentCard.char); }
}
function renderDefinitions(data) {
  const container = document.getElementById('definitions-container');
  container.innerHTML = '';
  if (!data || !data.heteronyms) return;
  let content = '';
  data.heteronyms.forEach(h => {
    if (!h.definitions || h.definitions.length === 0) return;
    content += `<h4>${h.bopomofo}</h4><ol>`;
    h.definitions.forEach(def => {
      content += `<li>`;
      if (def.type) content += `<span class="part-of-speech">[${def.type}]</span> `;
      content += def.def;
      if (def.example) def.example.forEach(ex => { content += `<span class="example">例：${ex}</span>`; });
      if (def.quote) def.quote.forEach(q => { content += `<span class="example">引：${q}</span>`; });
      content += `</li>`;
    });
    content += `</ol>`;
  });
  if (content) { container.innerHTML = content; container.style.display = 'block'; }
  else { container.style.display = 'none'; }
}
async function fetchAndDisplayDetails(char) {
  const container = document.getElementById('definitions-container');
  container.innerHTML = '<h4>Loading...</h4>';
  container.style.display = 'block';
  if (!char) { container.innerHTML = '<h4>Character missing</h4>'; return; }
  try {
    const resp = await fetch(MOEDICT_API_BASE + encodeURIComponent(char));
    if (!resp.ok) { container.innerHTML = `<h4>API Error: HTTP ${resp.status}</h4>`; return; }
    const data = await resp.json();
    renderDefinitions(data);
  } catch (error) { console.error("Moedict API failed:", error); container.innerHTML = `<h4>API call failed</h4>`; }
}
function showStrokeOrder() {
  const mainDisplayWrapper = document.getElementById('main-display-wrapper');
  const practiceContainer = document.getElementById('practice-container');
  const definitionsEl = document.getElementById('definitions-container');
  if (isPracticeVisible) {
    practiceContainer.style.display = 'none';
    mainDisplayWrapper.style.display = 'flex';
    footerControls.style.display = 'flex';
    isPracticeVisible = false;
  } else {
    if (!currentCard || !currentCard.char) return;
    mainDisplayWrapper.style.display = 'none';
    footerControls.style.display = 'none';
    definitionsEl.style.display = 'none';
    const size = window.innerWidth < 768 ? 280 : 300;
    if (!practiceHanziWriter) {
      practiceHanziWriter = HanziWriter.create('stroke-order-animation', currentCard.char, { width: size, height: size, padding: 5, showOutline: true, strokeAnimationSpeed: 0.5, delayBetweenStrokes: 100, strokeColor: '#000000', drawingWidth: 40 });
    } else { practiceHanziWriter.setCharacter(currentCard.char); }
    practiceHanziWriter.animateCharacter();
    practiceContainer.style.display = 'flex';
    isPracticeVisible = true;
  }
}
function animateAllStrokes() { if (practiceHanziWriter) practiceHanziWriter.animateCharacter(); }
function startQuiz() { if (practiceHanziWriter) practiceHanziWriter.quiz(); }
function displayCharacter(character) {
    const charEl = document.getElementById('char');
    charEl.innerHTML = ''; 
    charEl.style.fontSize = 'var(--char-size-desktop)';
    if (character) {
        const size = window.innerWidth < 768 ? 280 : 350;
        HanziWriter.create('char', character, { width: size, height: size, padding: 0, showOutline: false, strokeColor: '#000000' });
    } else { charEl.style.fontSize = '24px'; charEl.textContent = "All cards reviewed for now!"; }
}
function minutesToMs(mins) { return mins * 60 * 1000; }
function formatInterval(minutes) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

// MODIFIED: Handles new data format for local storage fallback
function saveProgress() {
  // Clear any existing timer to reset the debounce period
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // Set a new timer to execute the save operation after the delay
  saveTimeout = setTimeout(async () => {
    if (accessToken && gistId) { 
      await saveToCloud(); 
    } else {
      // Also debounce local saving
      const base_time_ms = Date.now();
      const cardsWithOffsets = {};
      for (const char in cards) {
          const data = cards[char];
          const offsetMinutes = Math.round((data[DUE] - base_time_ms) / 60000);
          cardsWithOffsets[char] = [data[INTERVAL], data[EASE], offsetMinutes];
      }
      localStorage.setItem("ankiCards", JSON.stringify({ base_time_ms, cards: cardsWithOffsets }));
    }
  }, SAVE_DEBOUNCE_DELAY);
}

// MODIFIED: Handles new data format for local storage
async function loadProgress() {
  const cloudSuccess = await loadFromCloud();
  if (!cloudSuccess) {
    lastKnownETag = null;
    const saved = localStorage.getItem("ankiCards");
    if (saved) {
        const parsedData = JSON.parse(saved);
        if (parsedData && parsedData.base_time_ms && parsedData.cards) {
            // New format
            const baseTime = parsedData.base_time_ms;
            const loadedCards = parsedData.cards;
            const processedCards = {};
            for (const char in loadedCards) {
                const cardData = loadedCards[char];
                const dueTimestamp = baseTime + (cardData[DUE] * 60000);
                processedCards[char] = [cardData[INTERVAL], cardData[EASE], dueTimestamp];
            }
            cards = processedCards;
        } else {
            // Old format
            cards = parsedData || {};
        }
    }
  }
  updateSyncStatus();
}
function calculateNextState(cardData, action) {
    let newInterval, newEase = cardData[EASE];
    const good = cardData[INTERVAL] < CONSTANTS.MIN_GOOD_INTERVAL ? CONSTANTS.MIN_GOOD_INTERVAL : cardData[INTERVAL] * (cardData[EASE] / 100);
    switch(action) {
        case "again": newInterval = CONSTANTS.AGAIN_INTERVAL; newEase = Math.max(CONSTANTS.MIN_EASE, newEase - CONSTANTS.EASE_PENALTY_AGAIN); break;
        case "hard": newInterval = (CONSTANTS.AGAIN_INTERVAL + good) / 2 * CONSTANTS.HARD_MULTIPLIER; newEase = Math.max(CONSTANTS.MIN_EASE, newEase - CONSTANTS.EASE_PENALTY_HARD); break;
        case "good": newInterval = good; break;
        case "easy": newInterval = (cardData[INTERVAL] < CONSTANTS.MIN_DAY_INTERVAL ? CONSTANTS.MIN_DAY_INTERVAL * CONSTANTS.EASY_INITIAL_DAYS : good * CONSTANTS.EASY_MULTIPLIER); newEase += CONSTANTS.EASE_BONUS_EASY; break;
    }
    return { interval: Math.round(newInterval), ease: newEase };
}
function updateButtonLabels() {
    ['again', 'hard', 'good', 'easy'].forEach(action => {
        const small = document.getElementById(`btn-${action}`).querySelector('small');
        small.textContent = currentCard ? formatInterval(calculateNextState(currentCard.data, action).interval) : '---';
    });
}
function toggleControls(enabled) {
  [document.getElementById('speak-btn'), document.getElementById('stroke-btn')].forEach(btn => {
    btn.disabled = !enabled; btn.style.opacity = enabled ? 1.0 : 0.5;
    btn.style.cursor = enabled ? 'pointer' : 'default';
  });
}

async function initializeDeck() {
  await loadProgress();

  if (Object.keys(cards).length > 0) {
    const firstCard = Object.values(cards)[0];
    const needsMigration = firstCard && !Array.isArray(firstCard);
    if (needsMigration) {
      console.log("Old object format found. Migrating to array format...");
      alert("Your save file is being optimized to a smaller format. This is a one-time process.");
      const newCards = {};
      for (const char in cards) {
        const oldCard = cards[char];
        newCards[char] = [ oldCard.interval || 0, oldCard.ease || 250, oldCard.due || Date.now() ];
      }
      cards = newCards;
      await saveProgress();
      console.log("Migration to array format complete.");
    }
  }

  try {
    const response = await fetch("chars.txt");
    if (response.ok) {
        const text = await response.text();
        const chars = text.split(/\r?\n/).map(c => c.trim()).filter(c => c.length === 1);
        let newCardsAdded = chars.reduce((count, c) => {
          if (!cards[c]) { 
            cards[c] = [0, 250, Date.now()];
            return count + 1; 
          }
          return count;
        }, 0);
        if (newCardsAdded > 0) await saveProgress();
    }
  } catch (error) { 
    console.error("chars.txt not found or failed to load.", error);
  } finally {
    updateStatus();
    if (Object.keys(cards).length > 0) {
        showNextCard();
    } else {
        const charEl = document.getElementById("char");
        charEl.innerHTML = '';
        charEl.style.fontSize = '24px';
        charEl.textContent = "Deck is empty. Add cards in \"Edit Deck & Settings\".";
        currentCard = null;
        toggleControls(false);
        updateButtonLabels();
    }
    document.querySelector('.main-content').style.opacity = 1;
  }
}

function updateStatus() {
  const total = Object.keys(cards).length;
  const dueNow = Object.values(cards).filter(c => c[DUE] <= Date.now()).length;
  document.getElementById("status").textContent = `Due: ${dueNow} / Total: ${total}`;
}
function showNextCard() {
  if (isPracticeVisible) { showStrokeOrder(); }
  const definitionsEl = document.getElementById('definitions-container');
  definitionsEl.style.display = 'none';
  definitionsEl.innerHTML = '';
  const dueCardsEntries = Object.entries(cards).filter(([char, data]) => data[DUE] <= Date.now());
  if (dueCardsEntries.length > 0) {
    const [char, data] = dueCardsEntries[Math.floor(Math.random() * dueCardsEntries.length)];
    currentCard = { char, data };
  } else if (Object.keys(cards).length > 0) {
    const [char, data] = Object.entries(cards).sort((a, b) => a[1][DUE] - b[1][DUE])[0];
    currentCard = { char, data };
  } else {
    currentCard = null;
  }
  if (currentCard) {
    displayCharacter(currentCard.char);
    toggleControls(true);
  } else {
    displayCharacter(null);
    toggleControls(false);
  }
  updateStatus(); 
  updateButtonLabels();
}
function rate(action) {
  if (!currentCard) return;
  const { interval, ease } = calculateNextState(currentCard.data, action);
  currentCard.data[INTERVAL] = interval;
  currentCard.data[EASE] = ease;
  currentCard.data[DUE] = Date.now() + minutesToMs(interval);
  cards[currentCard.char] = currentCard.data;
  saveProgress(); 
  showNextCard();
}

// Initial page load sequence
loadCredentials();
document.getElementById('search-btn').addEventListener('click', searchForChar);
getChineseVoice();
initializeDeck();