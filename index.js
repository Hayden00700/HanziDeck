let cards = {};
let currentCard = null;
let isPracticeVisible = false;

const synth = window.speechSynthesis;
let practiceHanziWriter = null;
let chineseVoicePromise = null;
let lastKnownETag = null;

// MODIFIED: Added profile variables
let currentProfile = 'Default';
let profiles = ['Default'];

const INTERVAL = 0, EASE = 1, DUE = 2;
const MOEDICT_API_BASE = 'https://www.moedict.tw/raw/';
const CONSTANTS = {
  AGAIN_INTERVAL: 1, MIN_GOOD_INTERVAL: 10, MIN_EASE: 130, EASY_INITIAL_DAYS: 3,
  EASY_MULTIPLIER: 1.3, HARD_MULTIPLIER: 1.2, MIN_DAY_INTERVAL: 1440,
  EASE_PENALTY_AGAIN: 20, EASE_PENALTY_HARD: 15, EASE_BONUS_EASY: 20
};
const GIST_API_BASE = 'https://api.github.com/gists/';
let accessToken = '';
let gistId = '';

// NEW: Debounce and Max Delay variables
let saveProgressTimer = null;
let lastSyncTime = 0; // Tracks the timestamp of the last *successful* cloud sync
let hasPendingChanges = false; // Tracks if there are local changes waiting for sync

const SAVE_PROGRESS_DELAY_MS = 5000; // 5 seconds debounce delay
const SAVE_PROGRESS_MAX_DELAY_MS = 20000; // 20 seconds max delay

const customStrokeDataCache = {};
const CUSTOM_STROKE_DATA_BASE_PATH = './strokesZhHant/'; 
const HANZI_WRITER_CDN_BASE_PATH = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/';

function getCustomStrokeFilePath(char) {
    if (!char || char.length !== 1) return null;
    const unicodeDecimal = char.codePointAt(0).toString(10);
    return `${CUSTOM_STROKE_DATA_BASE_PATH}${unicodeDecimal}.json`;
}

const getHanziWriterOptions = (char, forPractice) => {
  let options = {};
  if (char && char.length === 1) {
    options.charDataLoader = (character, onComplete) => {
      if (character !== char) return onComplete(null);
      if (customStrokeDataCache[char]) {
		  setTimeout(() => onComplete(customStrokeDataCache[char]), 0);
		  return; 
		}
      fetch(getCustomStrokeFilePath(char))
        .then(response => {
          if (!response.ok) throw new Error(`Custom file not found: ${response.status}`);
          return response.json();
        })
        .then(data => {
          if (data && data.character === char) {
            console.log(`[HanziWriter] Loaded custom stroke data for ${char}.`);
            customStrokeDataCache[char] = data;
            onComplete(data);
          } else {
            throw new Error('Custom file data invalid.');
          }
        })
        .catch(error => {
          console.info(`[HanziWriter] Custom data for ${char} not found. Falling back to CDN.`);
          const officialFilePath = `${HANZI_WRITER_CDN_BASE_PATH}${char}.json`;
          fetch(officialFilePath)
            .then(response => response.json())
            .then(data => {
              customStrokeDataCache[char] = data;
              onComplete(data);
            })
            .catch(cdnError => {
              console.error(`[HanziWriter] FATAL: Failed to load both custom and CDN data for ${char}.`, cdnError);
              onComplete(null);
            });
        });
    };
  }
  if (forPractice) {
    options = {
      ...options,
      width: window.innerWidth < 768 ? 280 : 300,
      height: window.innerWidth < 768 ? 280 : 300,
      padding: 5, showOutline: true, strokeAnimationSpeed: 0.5,
      delayBetweenStrokes: 100, strokeColor: '#000000', drawingWidth: 40
    };
  } else {
    options = {
      ...options,
      width: window.innerWidth < 768 ? 280 : 350,
      height: window.innerWidth < 768 ? 280 : 350,
      padding: 0, showOutline: false, strokeColor: '#000000'
    };
  }
  return options;
};

const footerControls = document.querySelector('.footer-controls');

function searchForChar() {
  const charToFindRaw = prompt("Enter a character to search for:");
  if (!charToFindRaw || charToFindRaw.trim().length !== 1) {
    if (charToFindRaw !== null) alert("Please enter a single character.");
    return;
  }
  const charToFind = charToFindRaw.trim();
  if (cards[charToFind]) {
    if (isPracticeVisible) showStrokeOrder(); 
    currentCard = { char: charToFind, data: cards[charToFind] };
    displayCharacter(currentCard.char);
    document.getElementById('definitions-container').style.display = 'none';
    document.getElementById('practice-container').style.display = 'none';
    document.getElementById('main-display-wrapper').style.display = 'flex';
    footerControls.style.display = 'flex';
    toggleControls(true);
    updateButtonLabels();
  } else {
    if (confirm(`Character "${charToFind}" not found. Would you like to add it?`)) {
      cards[charToFind] = [0, 250, Date.now()];
      saveProgress();
      updateStatus();
      alert(`Character "${charToFind}" added!`);
      currentCard = { char: charToFind, data: cards[charToFind] };
      displayCharacter(currentCard.char);
      toggleControls(true);
      updateButtonLabels();
    }
  }
}

function updateSyncStatus(status) {
  const statusEl = document.getElementById('sync-status-indicator');
  if (!accessToken || !gistId) {
    statusEl.style.backgroundColor = '#f39c12';
    statusEl.title = 'Local Mode (Not Synced)';
    return;
  }
  switch (status) {
    case 'syncing': statusEl.style.backgroundColor = '#f39c12'; statusEl.title = 'Syncing...'; break;
    case 'success': statusEl.style.backgroundColor = '#2ecc71'; statusEl.title = 'Synced'; break;
    case 'error': statusEl.style.backgroundColor = '#e74c3c'; statusEl.title = 'Sync Failed'; break;
    default: statusEl.style.backgroundColor = '#2ecc71'; statusEl.title = 'Connected';
  }
}

// MODIFIED: saveToCloud is now profile-aware and updates sync state
async function saveToCloud() {
  if (!accessToken || !gistId) return;

  const base_time_ms = Date.now();
  const cardsWithOffsets = {};
  for (const char in cards) {
      const data = cards[char];
      const offsetMinutes = Math.round((data[DUE] - base_time_ms) / 60000);
      cardsWithOffsets[char] = [data[INTERVAL], data[EASE], offsetMinutes];
  }
  const contentToSave = JSON.stringify({ base_time_ms, cards: cardsWithOffsets });
  const fileName = `${currentProfile}.json`;

  try {
    const patchResponse = await fetch(`${GIST_API_BASE}${gistId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `token ${accessToken}`, 'Accept': 'application/vnd.github.com.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [fileName]: { content: contentToSave } } })
    });
    if (!patchResponse.ok) throw new Error(`HTTP error! Status: ${patchResponse.status}`);
    lastKnownETag = patchResponse.headers.get('ETag');
    updateSyncStatus('success');
    
    // NEW: Update tracking variables on successful sync
    lastSyncTime = Date.now();
    hasPendingChanges = false; 

  } catch (error) {
    console.error('Failed to save to Gist:', error);
    updateSyncStatus('error');
  }
}

// MODIFIED: loadFromCloud is now profile-aware
async function loadFromCloud() {
  if (!accessToken || !gistId) return false;
  const fileName = `${currentProfile}.json`;
  try {
    const response = await fetch(`${GIST_API_BASE}${gistId}`, {
      method: 'GET',
      headers: { 'Authorization': `token ${accessToken}`, 'Accept': 'application/vnd.github.com.v3+json' }
    });
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    lastKnownETag = response.headers.get('ETag');
    const data = await response.json();
    if (data.files && data.files[fileName]) {
      const content = data.files[fileName].content;
      if (content) {
        const parsedData = JSON.parse(content);
        if (parsedData && parsedData.base_time_ms && parsedData.cards) {
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
          cards = parsedData || {};
        }
      } else { cards = {}; } // File not found in Gist, start with an empty deck for this profile
    } else { cards = {}; } // File not found in Gist, start with an empty deck for this profile
    updateSyncStatus('success');
    return true;
  } catch (error) {
    console.error('Failed to load from Gist:', error);
    updateSyncStatus('error');
    lastKnownETag = null; 
    return false;
  }
}

function loadCredentials() {
  accessToken = localStorage.getItem('ankiAccessToken') || '';
  gistId = localStorage.getItem('ankiGistId') || '';
}

// NEW: Function to load profile settings (consistent with edit.js)
function loadProfileData() {
    const savedProfiles = localStorage.getItem('ankiProfiles');
    if (savedProfiles) {
        profiles = JSON.parse(savedProfiles);
    } else {
        // Should only happen if user has never visited the edit page
        profiles = ['Default']; 
    }
    currentProfile = localStorage.getItem('ankiCurrentProfile') || profiles[0] || 'Default';

    // A safety check in case the stored current profile was deleted on another device
    if (!profiles.includes(currentProfile)) {
        currentProfile = profiles[0];
        localStorage.setItem('ankiCurrentProfile', currentProfile);
    }
    
    const profileDisplay = document.getElementById('profile-display');
    if (profileDisplay) {
        profileDisplay.textContent = `Profile: ${currentProfile}`;
    }
}

// MODIFIED: getChineseVoice with timeout/race condition to prevent hanging
function getChineseVoice() {
  if (chineseVoicePromise) return chineseVoicePromise;
  
  chineseVoicePromise = new Promise((resolve) => {
    let resolved = false;

    const findVoice = () => {
      if (resolved) return;
      const voices = synth.getVoices();
      if (voices.length > 0) {
        // 嘗試匹配 'Google 國語（台灣）' 或 'zh-TW'
        const foundVoice = voices.find(v => v.name === 'Google 國語（台灣）') || voices.find(v => v.lang.startsWith('zh-TW'));
        // Fallback: 找不到特定中文語音時，退回到第一個中文語音或 null
        resolved = true;
        if (foundVoice) {
            resolve(foundVoice);
        } else {
            const zhVoice = voices.find(v => v.lang.startsWith('zh'));
            resolve(zhVoice || null);
        }
      }
    };
    
    // 1. Check immediately
    findVoice();

    // 2. Wait for event
    if (!resolved) {
        if (synth.onvoiceschanged !== undefined) {
             synth.onvoiceschanged = findVoice;
        }
        // Fallback check
        const intervalId = setInterval(() => {
             if (resolved) clearInterval(intervalId);
             else findVoice();
        }, 100);
    }

    // 3. Timeout safety: If voices don't load in 500ms, just use default
    setTimeout(() => {
        if (!resolved) {
            resolved = true;
            console.warn("Voice loading timed out, using default.");
            resolve(null);
        }
    }, 500);
  });
  
  return chineseVoicePromise;
}

// MODIFIED: speakCharacter with enhanced robustness and error handler
async function speakCharacter() {
  if (!currentCard || !currentCard.char) return;
  
  // Cancel any current speech immediately
  synth.cancel();
  
  const utterance = new SpeechSynthesisUtterance(currentCard.char);
  
  try {
      // Await the voice promise to ensure the voice object is loaded
      const chineseVoice = await getChineseVoice(); 
      if (chineseVoice) {
          utterance.voice = chineseVoice;
          utterance.lang = chineseVoice.lang; // Use the actual voice's language setting
      } else {
          // Fallback if no specific Chinese voice is found
          utterance.lang = 'zh-TW'; 
      }
  } catch (e) {
      // Safety fallback
      utterance.lang = 'zh-TW';
  }

  utterance.rate = 0.8;
  
  // NEW: Add event listener to debug
  utterance.onerror = (event) => {
    console.error('SpeechSynthesis Utterance failed:', event.error);
  };

  synth.speak(utterance);
  if (!isPracticeVisible) fetchAndDisplayDetails(currentCard.char);
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
      if (def.example) def.example.forEach(ex => { content += `<span class="example">Example: ${ex}</span>`; });
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

// MODIFIED: Fix for blank practice screen
function showStrokeOrder() {
  const mainDisplayWrapper = document.getElementById('main-display-wrapper');
  const practiceContainer = document.getElementById('practice-container');
  const definitionsEl = document.getElementById('definitions-container');
  
  if (isPracticeVisible) {
    // Close Practice Mode
    practiceContainer.style.display = 'none';
    mainDisplayWrapper.style.display = 'flex';
    footerControls.style.display = 'flex';
    isPracticeVisible = false;
    if (practiceHanziWriter) practiceHanziWriter.cancelQuiz();
  } else {
    // Open Practice Mode
    if (!currentCard || !currentCard.char) return;
    
    mainDisplayWrapper.style.display = 'none';
    footerControls.style.display = 'none';
    definitionsEl.style.display = 'none';
    
    // CRITICAL FIX: Display container BEFORE creating/setting writer
    // HanziWriter needs the container to be visible to calculate dimensions
    practiceContainer.style.display = 'flex';
    
    const char = currentCard.char;
    const options = getHanziWriterOptions(char, true);
    
    if (!practiceHanziWriter) {
      document.getElementById('stroke-order-animation').innerHTML = '';
      practiceHanziWriter = HanziWriter.create('stroke-order-animation', char, options);
    } else { 
        practiceHanziWriter.setCharacter(char, options); 
    }
    
    resetPracticeView();
    isPracticeVisible = true;
  }
}

function resetPracticeView() {
    practiceHanziWriter.showCharacter();
    practiceHanziWriter.showOutline();
    document.getElementById('practice-controls-main').style.display = 'flex';
    document.getElementById('practice-controls-quiz').style.display = 'none';
    animateAllStrokes();
}

function startPracticeQuiz() {
    document.getElementById('practice-controls-main').style.display = 'none';
    document.getElementById('practice-controls-quiz').style.display = 'flex';
    const hintToggle = document.getElementById('hint-toggle-checkbox');
    hintToggle.checked = false;
    if (practiceHanziWriter) practiceHanziWriter.hideOutline();
    practiceHanziWriter.quiz({
        showHintAfterMisses: 1,
        onComplete: (summaryData) => setTimeout(resetPracticeView, 1000)
    });
}

function endPracticeQuiz() {
    if (practiceHanziWriter) practiceHanziWriter.cancelQuiz();
    resetPracticeView();
}

function animateAllStrokes() { if (practiceHanziWriter) practiceHanziWriter.animateCharacter(); }

function displayCharacter(character) {
    const charEl = document.getElementById('char');
    charEl.innerHTML = ''; 
    charEl.style.fontSize = 'var(--char-size-desktop)';
    if (character) {
        const options = getHanziWriterOptions(character, false);
        charEl.innerHTML = ''; 
        HanziWriter.create('char', character, options);
    } else { 
        charEl.style.fontSize = '24px'; charEl.textContent = "All cards reviewed for now!"; 
    }
}

function minutesToMs(mins) { return mins * 60 * 1000; }
function formatInterval(minutes) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

// MODIFIED: saveProgress logic for Debounce and Max Delay
async function saveProgress(syncToCloud = true) {
  // 1. Always save to local storage immediately
  const base_time_ms = Date.now();
  const cardsWithOffsets = {};
  for (const char in cards) {
      const data = cards[char];
      const offsetMinutes = Math.round((data[DUE] - base_time_ms) / 60000);
      cardsWithOffsets[char] = [data[INTERVAL], data[EASE], offsetMinutes];
  }
  // Save to a profile-specific key
  localStorage.setItem(`ankiCards_${currentProfile}`, JSON.stringify({ base_time_ms, cards: cardsWithOffsets }));

  // 2. Manage Gist sync
  if (syncToCloud && accessToken && gistId) {
    hasPendingChanges = true; // Mark that a change is waiting for cloud sync
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTime;
    
    // Check for max delay condition
    if (timeSinceLastSync >= SAVE_PROGRESS_MAX_DELAY_MS) {
        // Max delay reached, force immediate sync (clear timer, then run)
        clearTimeout(saveProgressTimer);
        updateSyncStatus('syncing');
        await saveToCloud(); // Await forced sync to ensure it happens before next check
        return; 
    }
    
    // Standard debounce logic
    clearTimeout(saveProgressTimer); // Reset the debounce timer
    updateSyncStatus('syncing');     // Immediately show syncing status
    saveProgressTimer = setTimeout(async () => {
      await saveToCloud();
    }, SAVE_PROGRESS_DELAY_MS);
    
  } else if (!syncToCloud && accessToken && gistId) {
    // This handles forced sync (e.g., initialization or beforeunload)
    await saveToCloud();
  }
}

// MODIFIED: loadProgress is now profile-aware
async function loadProgress() {
  const cloudSuccess = await loadFromCloud();
  if (!cloudSuccess) {
    lastKnownETag = null;
    // Load from a profile-specific key
    const saved = localStorage.getItem(`ankiCards_${currentProfile}`);
    if (saved) {
        const parsedData = JSON.parse(saved);
        if (parsedData && parsedData.base_time_ms && parsedData.cards) {
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
            cards = parsedData || {};
        }
    } else {
        cards = {}; // No local data for this profile
    }
  }
  if (!cloudSuccess) updateSyncStatus();
}

function calculateNextState(cardData, action) {
    let newInterval, newEase = cardData[EASE];
    const good = cardData[INTERVAL] < CONSTANTS.MIN_GOOD_INTERVAL ? CONSTANTS.MIN_GOOD_INTERVAL : cardData[INTERVAL] * (cardData[EASE] / 100);
    switch(action) {
        case "again": newInterval = CONSTANTS.AGAIN_INTERVAL; newEase = Math.max(CONSTANTS.MIN_EASE, newEase - CONSTANTS.EASE_PENALTY_AGAIN); break;
        case "good": newInterval = good; break;
        case "easy": newInterval = (cardData[INTERVAL] < CONSTANTS.MIN_DAY_INTERVAL ? CONSTANTS.MIN_DAY_INTERVAL * CONSTANTS.EASY_INITIAL_DAYS : good * CONSTANTS.EASY_MULTIPLIER); newEase += CONSTANTS.EASE_BONUS_EASY; break;
    }
    return { interval: Math.round(newInterval), ease: newEase };
}

function updateButtonLabels() {
    ['again', 'good', 'easy'].forEach(action => {
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
  // Migration logic can remain, it will apply per-profile if needed
  if (Object.keys(cards).length > 0) {
    const firstCard = Object.values(cards)[0];
    if (firstCard && !Array.isArray(firstCard)) {
      console.log("Old format found. Migrating profile data...");
      alert("Optimizing save file for this profile. This is a one-time process.");
      const newCards = {};
      for (const char in cards) {
        const oldCard = cards[char];
        newCards[char] = [ oldCard.interval || 0, oldCard.ease || 250, oldCard.due || Date.now() ];
      }
      cards = newCards;
      await saveProgress(false); // Force immediate save/sync after migration
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
        if (newCardsAdded > 0) await saveProgress(false); // Force immediate save/sync for new cards
    }
  } catch (error) { console.error("chars.txt not found.", error); } 
  finally {
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
  if (isPracticeVisible) showStrokeOrder();
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
  
  // MODIFIED: saveProgress now calls with syncToCloud = true (default)
  // This will save locally immediately and set a debounce/max-delay timer for Gist sync
  saveProgress(); 
  showNextCard();
}

// NEW: Function to handle page closure or backgrounding to prevent data loss
function handlePageUnload() {
    if (hasPendingChanges && accessToken && gistId) {
        // Clear any pending debounced sync
        if (saveProgressTimer) {
             clearTimeout(saveProgressTimer);
        }
        // Force an immediate, non-debounced sync
        // Using `saveProgress(false)` here forces the immediate cloud save path in saveProgress.
        saveProgress(false); 
    }
}

// Initial page load sequence
loadCredentials();
// MODIFIED: Load profile data first
loadProfileData();

// NEW: Preload voices immediately on page load to avoid delay on first click
getChineseVoice();

// NEW: Reset lastSyncTime on load to ensure max-delay works right away if needed
lastSyncTime = Date.now(); 

// Attach listeners to prevent data loss:
// 1. Beforeunload (for closing tab/browser)
window.addEventListener('beforeunload', handlePageUnload);

// 2. Visibility change (for switching tabs/apps on mobile)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        handlePageUnload();
    }
});

document.getElementById('search-btn').addEventListener('click', searchForChar);
initializeDeck();

document.getElementById('hint-toggle-checkbox').addEventListener('change', (event) => {
  if (practiceHanziWriter) {
    if (event.target.checked) practiceHanziWriter.showOutline();
    else practiceHanziWriter.hideOutline();
  }
});