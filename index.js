let cards = {};
let currentCard = null;
let isPracticeVisible = false;

const synth = window.speechSynthesis;
let practiceHanziWriter = null;
let chineseVoicePromise = null;

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

function searchForChar() {
  const charToFindRaw = prompt("Enter a character to search for:");
  if (!charToFindRaw || charToFindRaw.trim().length !== 1) {
    if (charToFindRaw !== null) alert("Please enter a single character.");
    return;
  }
  
  const charToFind = charToFindRaw.trim();
  const foundCard = cards[charToFind];

  if (foundCard) {
    if (isPracticeVisible) showStrokeOrder(); 
    
    currentCard = foundCard;
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
      cards[charToFind] = { char: charToFind, interval: 0, ease: 250, due: Date.now() };
      saveProgress();
      updateStatus();
      alert(`Character "${charToFind}" has been added to your deck!`);
      
      if (isPracticeVisible) showStrokeOrder(); 
      currentCard = cards[charToFind];
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

async function saveToCloud() {
  if (!accessToken || !gistId) return;
  try {
    const response = await fetch(`${GIST_API_BASE}${gistId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${accessToken}`, 'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(cards) } } })
    });
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    updateSyncStatus('Synced', false);
  } catch (error) {
    console.error('Failed to save to Gist:', error);
    updateSyncStatus('Sync Failed', true);
  }
}

async function loadFromCloud() {
  if (!accessToken || !gistId) return false;
  try {
    const response = await fetch(`${GIST_API_BASE}${gistId}`, {
      method: 'GET',
      headers: { 'Authorization': `token ${accessToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data = await response.json();
    if (data.files && data.files[GIST_FILENAME]) {
        const content = data.files[GIST_FILENAME].content;
        cards = content ? JSON.parse(content) : {};
    }
    updateSyncStatus('Connected', false);
    return true;
  } catch (error) {
    console.error('Failed to load from Gist:', error);
    updateSyncStatus('Connection Failed', true);
    return false;
  }
}

function loadCredentials() {
  accessToken = localStorage.getItem('ankiAccessToken') || '';
  gistId = localStorage.getItem('ankiGistId') || '';
}

function getChineseVoice() {
  if (chineseVoicePromise) {
    return chineseVoicePromise;
  }

  chineseVoicePromise = new Promise((resolve) => {
    const findVoice = () => {
      const voices = synth.getVoices();
      if (voices.length > 0) {
        const foundVoice =
          voices.find(v => v.name === 'Google 國語（台灣）') ||
          voices.find(v => v.lang === 'zh-TW') ||
          voices.find(v => v.lang.startsWith('zh-')) ||
          voices.find(v => v.lang === 'zh');
        resolve(foundVoice || null);
      }
    };
    
    findVoice();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = findVoice;
    }
  });

  return chineseVoicePromise;
}

async function speakCharacter() {
    if (!currentCard || !currentCard.char) return;
    if (synth.speaking) synth.cancel();

    const chineseVoice = await getChineseVoice();

    const utterance = new SpeechSynthesisUtterance(currentCard.char);
    if (chineseVoice) {
        utterance.voice = chineseVoice;
    }
    utterance.lang = 'zh-TW';
    utterance.rate = 0.8;
    synth.speak(utterance);
    
    if (!isPracticeVisible) {
        fetchAndDisplayDetails(currentCard.char);
    }
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

  if (!char) {
    container.innerHTML = '<h4>Character missing</h4>';
    return;
  }

  try {
    const resp = await fetch(MOEDICT_API_BASE + encodeURIComponent(char));
    if (!resp.ok) {
      container.innerHTML = `<h4>API Error: HTTP ${resp.status}</h4>`;
      return;
    }
    const data = await resp.json();
    renderDefinitions(data);
  } catch (error) {
    console.error("Moedict API failed:", error);
    container.innerHTML = `<h4>API call failed</h4>`;
  }
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
      practiceHanziWriter = HanziWriter.create('stroke-order-animation', currentCard.char, {
        width: size, height: size, padding: 5, showOutline: true,
        strokeAnimationSpeed: 0.5, delayBetweenStrokes: 100,
        strokeColor: '#000000', drawingWidth: 40
      });
    } else {
      practiceHanziWriter.setCharacter(currentCard.char);
    }
    practiceHanziWriter.animateCharacter();
    practiceContainer.style.display = 'flex';
    isPracticeVisible = true;
  }
}

function animateAllStrokes() {
    if (practiceHanziWriter) practiceHanziWriter.animateCharacter();
}
function startQuiz() {
    if (practiceHanziWriter) practiceHanziWriter.quiz();
}
    
function displayCharacter(character) {
    const charEl = document.getElementById('char');
    charEl.innerHTML = ''; 
    charEl.style.fontSize = 'var(--char-size-desktop)';
    
    if (character) {
        const size = window.innerWidth < 768 ? 280 : 350;
        HanziWriter.create('char', character, {
            width: size, height: size, padding: 0, showOutline: false,
            strokeColor: '#000000'
        });
    } else {
        charEl.style.fontSize = '24px';
        charEl.textContent = "All cards reviewed for now!";
    }
}

function minutesToMs(mins) { return mins * 60 * 1000; }
function formatInterval(minutes) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

async function saveProgress() {
  if (accessToken && gistId) {
    await saveToCloud();
  } else {
    localStorage.setItem("ankiCards", JSON.stringify(cards));
  }
}

async function loadProgress() {
  const cloudSuccess = await loadFromCloud();
  if (!cloudSuccess) {
    const saved = localStorage.getItem("ankiCards");
    if (saved) cards = JSON.parse(saved);
  }
  updateSyncStatus();
}

function calculateNextState(card, action) {
    let newInterval, newEase = card.ease;
    const good = card.interval < CONSTANTS.MIN_GOOD_INTERVAL ? CONSTANTS.MIN_GOOD_INTERVAL : card.interval * (card.ease / 100);
    switch(action) {
        case "again": newInterval = CONSTANTS.AGAIN_INTERVAL; newEase = Math.max(CONSTANTS.MIN_EASE, newEase - CONSTANTS.EASE_PENALTY_AGAIN); break;
        case "hard": newInterval = (CONSTANTS.AGAIN_INTERVAL + good) / 2 * CONSTANTS.HARD_MULTIPLIER; newEase = Math.max(CONSTANTS.MIN_EASE, newEase - CONSTANTS.EASE_PENALTY_HARD); break;
        case "good": newInterval = good; break;
        case "easy": newInterval = (card.interval < CONSTANTS.MIN_DAY_INTERVAL ? CONSTANTS.MIN_DAY_INTERVAL * CONSTANTS.EASY_INITIAL_DAYS : good * CONSTANTS.EASY_MULTIPLIER); newEase += CONSTANTS.EASE_BONUS_EASY; break;
    }
    return { interval: Math.round(newInterval), ease: newEase };
}

function updateButtonLabels() {
    ['again', 'hard', 'good', 'easy'].forEach(action => {
        const small = document.getElementById(`btn-${action}`).querySelector('small');
        small.textContent = currentCard ? formatInterval(calculateNextState(currentCard, action).interval) : '---';
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

  const needsCleanup = Object.values(cards).some(card => card.hasOwnProperty('definitions'));

  if (needsCleanup) {
    console.log("Old definition data found. Performing one-time cleanup...");
    alert("您的存檔資料將被自動清理以縮小檔案大小，這是一個一次性的操作。");

    for (const char in cards) {
      if (cards[char].hasOwnProperty('definitions')) {
        delete cards[char].definitions;
      }
    }

    await saveProgress();
    console.log("Cleanup complete and data saved.");
  }

  try {
    const response = await fetch("chars.txt");
    if (response.ok) {
        const text = await response.text();
        const chars = text.split(/\r?\n/).map(c => c.trim()).filter(c => c.length === 1);
        let newCardsAdded = chars.reduce((count, c) => {
          if (!cards[c]) { cards[c] = { char: c, interval: 0, ease: 250, due: Date.now() }; return count + 1; }
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
  const dueNow = Object.values(cards).filter(c => c.due <= Date.now()).length;
  document.getElementById("status").textContent = `Due: ${dueNow} / Total: ${total}`;
}

function showNextCard() {
  if (isPracticeVisible) {
    showStrokeOrder();
  }
  
  const definitionsEl = document.getElementById('definitions-container');
  definitionsEl.style.display = 'none';
  definitionsEl.innerHTML = '';
  
  const dueCards = Object.values(cards).filter(c => c.due <= Date.now());
  if (dueCards.length > 0) {
    currentCard = dueCards[Math.floor(Math.random() * dueCards.length)];
  } else if (Object.keys(cards).length > 0) {
    currentCard = Object.values(cards).sort((a, b) => a.due - b.due)[0];
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
  const { interval, ease } = calculateNextState(currentCard, action);
  currentCard.interval = interval; currentCard.ease = ease;
  currentCard.due = Date.now() + minutesToMs(interval);
  saveProgress(); 
  showNextCard();
}

// Initial page load sequence
loadCredentials();
document.getElementById('search-btn').addEventListener('click', searchForChar);
getChineseVoice(); // Start loading voices immediately
initializeDeck();