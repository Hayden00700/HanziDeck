// Universal Anki Flashcard App
let cards = {};
let currentCard = null;
let decks = [];
let activeDeckId = null;

const synth = window.speechSynthesis;
let englishVoicePromise = null;

const INTERVAL = 0, EASE = 1, DUE = 2;
const GIST_API_BASE = 'https://api.github.com/gists/';
const DECK_MANIFEST_FILENAME = '_deck_manifest.json';

const CONSTANTS = {
  AGAIN_INTERVAL: 1, MIN_GOOD_INTERVAL: 10, MIN_EASE: 130, EASY_INITIAL_DAYS: 3,
  EASY_MULTIPLIER: 1.3, EASE_PENALTY_AGAIN: 20, EASE_BONUS_EASY: 20,
  MIN_DAY_INTERVAL: 1440
};

let accessToken = '';
let gistId = '';

// --- Gist & Local Storage Sync (Logic is similar to edit.js) ---

function loadCredentials() {
  accessToken = localStorage.getItem('ankiAccessToken') || '';
  gistId = localStorage.getItem('ankiGistId') || '';
}

async function loadDecks() {
    const localDecks = localStorage.getItem('ankiDecks');
    if (localDecks) decks = JSON.parse(localDecks);

    if (accessToken && gistId) {
        try {
            const response = await fetch(`${GIST_API_BASE}${gistId}`, { headers: { 'Authorization': `token ${accessToken}` } });
            if (!response.ok) throw new Error('Failed to fetch Gist');
            const data = await response.json();
            if (data.files && data.files[DECK_MANIFEST_FILENAME]) {
                const manifestDecks = JSON.parse(data.files[DECK_MANIFEST_FILENAME].content);
                decks = manifestDecks;
                localStorage.setItem('ankiDecks', JSON.stringify(decks));
            }
        } catch (error) {
            console.error('Failed to load decks from Gist, using local version.', error);
        }
    }
}

async function saveProgress() {
  if (!activeDeckId) return;

  const isCloudEnabled = accessToken && gistId;
  updateSyncStatus(isCloudEnabled ? 'syncing' : 'local');

  const base_time_ms = Date.now();
  const cardsWithOffsets = {};
  for (const id in cards) {
      const card = cards[id];
      const offsetMinutes = Math.round((card.data[DUE] - base_time_ms) / 60000);
      cardsWithOffsets[id] = {
          question: card.question,
          answer: card.answer,
          data: [card.data[INTERVAL], card.data[EASE], offsetMinutes]
      };
  }
  const contentToSave = JSON.stringify({ base_time_ms, cards: cardsWithOffsets });
  
  localStorage.setItem(`ankiCards_${activeDeckId}`, contentToSave);

  if (isCloudEnabled) {
    try {
      const deckFilename = `${activeDeckId}.json`;
      const response = await fetch(`${GIST_API_BASE}${gistId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `token ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { [deckFilename]: { content: contentToSave } } })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      updateSyncStatus('success');
    } catch (error) {
      console.error('Gist save failed:', error);
      updateSyncStatus('error');
    }
  }
}

async function loadCardsForActiveDeck() {
    cards = {};
    const localData = localStorage.getItem(`ankiCards_${activeDeckId}`);
    if (localData) processLoadedData(localData);

    let cloudDataLoaded = false;
    if (accessToken && gistId && activeDeckId) {
        try {
            const deckFilename = `${activeDeckId}.json`;
            const response = await fetch(`${GIST_API_BASE}${gistId}`, { headers: { 'Authorization': `token ${accessToken}` } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.files && data.files[deckFilename] && data.files[deckFilename].content) {
                processLoadedData(data.files[deckFilename].content);
                localStorage.setItem(`ankiCards_${activeDeckId}`, data.files[deckFilename].content);
                cloudDataLoaded = true;
                updateSyncStatus('success');
            } else {
                 updateSyncStatus('success'); // Connected, but no file for this deck yet.
            }
        } catch (error) {
            console.error('Gist card load failed, falling back to local:', error);
            updateSyncStatus('error');
        }
    }
    if (!cloudDataLoaded) {
        updateSyncStatus((accessToken && gistId) ? 'error' : 'local');
    }
}


function processLoadedData(jsonData) {
  try {
    const parsedData = JSON.parse(jsonData);
    if (parsedData && parsedData.base_time_ms && parsedData.cards) {
      const baseTime = parsedData.base_time_ms;
      const loadedCards = parsedData.cards;
      const processedCards = {};
      for (const id in loadedCards) {
          const card = loadedCards[id];
          const dueTimestamp = baseTime + (card.data[DUE] * 60000);
          processedCards[id] = {
              question: card.question,
              answer: card.answer,
              data: [card.data[INTERVAL], card.data[EASE], dueTimestamp]
          };
      }
      cards = processedCards;
    } else { cards = {}; }
  } catch (e) {
    console.error("Failed to parse card data:", e);
    cards = {};
  }
}

// --- Speech Synthesis ---

function getEnglishVoice() {
  if (englishVoicePromise) return englishVoicePromise;
  englishVoicePromise = new Promise((resolve) => {
    const findVoice = () => {
      const voices = synth.getVoices();
      if (voices.length) {
        const voice = voices.find(v => v.name === 'Google US English') || voices.find(v => v.lang.startsWith('en-'));
        resolve(voice || null);
      }
    };
    findVoice();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = findVoice;
  });
  return englishVoicePromise;
}

async function speakSentence(sentence) {
    if (!sentence) return;
    if(synth.speaking) synth.cancel();
    const voice = await getEnglishVoice();
    const utterance = new SpeechSynthesisUtterance(sentence);
    if (voice) utterance.voice = voice;
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    synth.speak(utterance);
}

// --- UI & Card Logic ---

function showNextCard() {
    toggleAnswerState(false);
    const now = Date.now();
    const allCards = Object.entries(cards);

    if (!activeDeckId || decks.length === 0) {
        currentCard = null;
        document.getElementById('question-display').innerHTML = `<span id="no-cards-message">No decks found. Please create one in settings.</span>`;
        updateStatus();
        updateButtonLabels();
        return;
    }

    if (allCards.length === 0) {
        currentCard = null;
        document.getElementById('question-display').innerHTML = `<span id="no-cards-message">This deck is empty. Add some cards in settings.</span>`;
        updateStatus();
        updateButtonLabels();
        return;
    }

    const dueCards = allCards.filter(([id, card]) => card.data[DUE] <= now);
    let nextCardToShow;

    if (dueCards.length > 0) {
        nextCardToShow = dueCards[Math.floor(Math.random() * dueCards.length)];
    } else {
        const sortedCards = allCards.sort((a, b) => a[1].data[DUE] - b[1].data[DUE]);
        nextCardToShow = sortedCards[0];
    }

    const [id, cardData] = nextCardToShow;
    currentCard = { id, ...cardData };
    document.getElementById('question-display').textContent = currentCard.question;

    updateStatus();
    updateButtonLabels();
}

function showAnswer() {
  if (!currentCard) return;
  document.getElementById('answer-text').textContent = currentCard.answer;
  toggleAnswerState(true);
}

function handleSpeakButtonClick() {
    if (currentCard && currentCard.answer) { speakSentence(currentCard.answer); }
}

function handleCardClick(event) {
    if (event.target.tagName === 'BUTTON' || event.target.parentElement.tagName === 'BUTTON') return;
    const isAnswerVisible = document.getElementById('answer-display').style.display !== 'none';
    if (!isAnswerVisible && currentCard) { showAnswer(); }
}

function rate(action) {
  if (!currentCard) return;
  
  let [interval, ease, due] = currentCard.data;
  let newInterval, newEase = ease;
  const goodInterval = interval < CONSTANTS.MIN_GOOD_INTERVAL ? CONSTANTS.MIN_GOOD_INTERVAL : interval * (ease / 100);
  
  switch(action) {
      case "again": newInterval = CONSTANTS.AGAIN_INTERVAL; newEase = Math.max(CONSTANTS.MIN_EASE, ease - CONSTANTS.EASE_PENALTY_AGAIN); break;
      case "good": newInterval = goodInterval; break;
      case "easy": newInterval = goodInterval * CONSTANTS.EASY_MULTIPLIER; newEase += CONSTANTS.EASE_BONUS_EASY; break;
  }

  currentCard.data = [Math.round(newInterval), newEase, Date.now() + (newInterval * 60000)];
  cards[currentCard.id] = {
      question: currentCard.question,
      answer: currentCard.answer,
      data: currentCard.data
  };
  
  saveProgress();
  showNextCard();
}

// --- UI Helpers ---

function toggleAnswerState(isAnswerVisible) {
  const cardContainer = document.querySelector('.card-container');
  document.getElementById('answer-display').style.display = isAnswerVisible ? 'flex' : 'none';
  document.getElementById('btn-show-answer').style.display = isAnswerVisible ? 'none' : 'block';
  document.getElementById('btn-again').style.display = isAnswerVisible ? 'inline-block' : 'none';
  document.getElementById('btn-good').style.display = isAnswerVisible ? 'inline-block' : 'none';
  document.getElementById('btn-easy').style.display = isAnswerVisible ? 'inline-block' : 'none';

  if (isAnswerVisible) cardContainer.classList.remove('clickable');
  else cardContainer.classList.add('clickable');
}

function updateStatus() {
  const total = Object.keys(cards).length;
  const dueNow = Object.values(cards).filter(c => c.data[DUE] <= Date.now()).length;
  document.getElementById("status").textContent = `Due: ${dueNow} / Total: ${total}`;
}

function updateButtonLabels() {
    ['again', 'good', 'easy'].forEach(action => {
        const btn = document.getElementById(`btn-${action}`);
        if (!btn) return;
        const small = btn.querySelector('small');
        if (currentCard) {
            let [interval, ease] = currentCard.data;
            const goodInterval = interval < CONSTANTS.MIN_GOOD_INTERVAL ? CONSTANTS.MIN_GOOD_INTERVAL : interval * (ease / 100);
            let nextInterval;
            if(action === 'again') nextInterval = CONSTANTS.AGAIN_INTERVAL;
            if(action === 'good') nextInterval = goodInterval;
            if(action === 'easy') nextInterval = goodInterval * CONSTANTS.EASY_MULTIPLIER;
            small.textContent = formatInterval(nextInterval);
        } else { small.textContent = '...'; }
    });
}

function formatInterval(minutes) {
    if (minutes < 1) return '<1m';
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = minutes / 60;
    return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

function updateSyncStatus(status) {
  const el = document.getElementById('sync-status-indicator');
  switch (status) {
    case 'syncing': el.style.backgroundColor = '#ffc107'; el.title = 'Syncing...'; break;
    case 'success': el.style.backgroundColor = '#28a745'; el.title = 'Synced with Gist'; break;
    case 'error': el.style.backgroundColor = '#dc3545'; el.title = 'Sync Failed'; break;
    case 'local': default: el.style.backgroundColor = '#6c757d'; el.title = 'Local Mode (Not Synced)'; break;
  }
}

// --- Initialization ---
async function initializeApp() {
  getEnglishVoice(); 
  loadCredentials();
  await loadDecks();
  
  const savedDeckId = localStorage.getItem('ankiActiveDeckId');
  if (savedDeckId && decks.some(d => d.id === savedDeckId)) {
      activeDeckId = savedDeckId;
  } else if (decks.length > 0) {
      activeDeckId = decks[0].id;
      localStorage.setItem('ankiActiveDeckId', activeDeckId);
  }
  
  const activeDeck = decks.find(d => d.id === activeDeckId);
  document.getElementById('deck-name-display').textContent = activeDeck ? activeDeck.name : "No Deck";

  await loadCardsForActiveDeck();
  document.querySelector('.card-container').addEventListener('click', handleCardClick);
  showNextCard();
}

document.addEventListener('DOMContentLoaded', initializeApp);