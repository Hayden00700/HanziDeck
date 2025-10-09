let cards = {}; // To store user progress: { "word": [interval, ease, due] }
let vocabulary = []; // To store the full list from JSON
let currentCard = null;
let isFlipped = false;
let currentCefrLevel = 'A1';
const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1'];

const synth = window.speechSynthesis;

// Constants for Gist Sync and Spaced Repetition System
const GIST_PROGRESS_FILENAME = 'oxford_progress.json';
const LOCAL_STORAGE_KEY = 'vocabularyProgress';
const GIST_API_BASE = 'https://api.github.com/gists/';
const VOCABULARY_FILENAME = 'oxford5000.json'; 

const INTERVAL = 0, EASE = 1, DUE = 2;
const CONSTANTS = {
  AGAIN_INTERVAL: 1, MIN_GOOD_INTERVAL: 10, MIN_EASE: 130, EASY_INITIAL_DAYS: 3,
  EASY_MULTIPLIER: 1.3, MIN_DAY_INTERVAL: 1440,
  EASE_PENALTY_AGAIN: 20, EASE_BONUS_EASY: 20
};

// --- Sync Status Function ---
function updateSyncStatus(status) {
    const statusEl = document.getElementById('sync-status-indicator');
    if (!statusEl) return;

    const token = localStorage.getItem('ankiAccessToken');
    const id = localStorage.getItem('ankiGistId');
    const isConnected = token && id;

    if (!isConnected) {
        statusEl.style.backgroundColor = '#f39c12';
        statusEl.title = 'Local Mode (Not Synced)';
        return;
    }

    switch (status) {
        case 'syncing':
            statusEl.style.backgroundColor = '#f1c40f'; // 黃色
            statusEl.title = 'Syncing...';
            break;
        case 'success':
            statusEl.style.backgroundColor = '#2ecc71'; // 綠色
            statusEl.title = 'Synced';
            break;
        case 'error':
            statusEl.style.backgroundColor = '#e74c3c'; // 紅色
            statusEl.title = 'Sync Failed';
            break;
        default:
            statusEl.style.backgroundColor = '#2ecc71';
            statusEl.title = 'Connected';
    }
}

// --- UI Functions ---

function displayCard() {
  const cardFront = document.getElementById('card-front');
  const cardBack = document.getElementById('card-back');
  const ratingButtons = document.getElementById('rating-buttons');
  const flashcard = document.getElementById('flashcard');
  const definitionEl = document.getElementById('dictionary-definition');
  
  // 圖示按鈕
  const speakBtn = document.getElementById('speak-btn'); 
  const deleteBtn = document.getElementById('delete-btn');
  const dictionaryLinkBtn = document.getElementById('dictionary-link-btn');

  isFlipped = false;
  
  // 重設卡片狀態
  cardFront.style.display = 'block';
  cardBack.style.display = 'none'; 
  cardBack.style.opacity = 0; 
  ratingButtons.style.visibility = 'hidden';
  flashcard.classList.remove('flipped'); 
  definitionEl.style.display = 'none';
  definitionEl.innerHTML = '';
  
  // 重設圖示可見性
  deleteBtn.style.visibility = 'hidden';
  dictionaryLinkBtn.style.visibility = 'hidden';

  if (currentCard) {
    cardFront.textContent = currentCard.english;
    cardBack.textContent = currentCard.chinese;
    speakBtn.style.visibility = 'visible'; // 卡片正面只顯示發音按鈕
    
    if (currentCard.fromSearch) {
        ratingButtons.style.visibility = 'hidden';
    }
  } else {
    cardFront.textContent = `All cards reviewed for now!`; 
    cardBack.textContent = '';
    speakBtn.style.visibility = 'hidden'; // 沒有卡片時隱藏
  }
}

async function flipCard() {
  if (!currentCard || isFlipped) return;

  const cardFront = document.getElementById('card-front');
  const cardBack = document.getElementById('card-back');
  const ratingButtons = document.getElementById('rating-buttons');
  const flashcard = document.getElementById('flashcard');
  
  // 圖示按鈕
  const deleteBtn = document.getElementById('delete-btn');
  const dictionaryLinkBtn = document.getElementById('dictionary-link-btn');

  isFlipped = true;
  
  // 翻轉卡片
  cardFront.style.display = 'block'; 
  cardBack.style.display = 'block';
  cardBack.style.opacity = 1; 
  flashcard.classList.add('flipped');
  
  // 顯示卡片背面的控制項
  ratingButtons.style.visibility = 'visible';
  deleteBtn.style.visibility = 'visible'; 
  dictionaryLinkBtn.style.visibility = 'visible';

  updateButtonLabels();
  fetchAndShowDefinition();
}

function formatDefinitionHtml(data) {
    const entry = data[0];
    if (!entry) return '<p>No definition found.</p>';

    let html = '';
    const phonetic = entry.phonetics.find(p => p.text)?.text;
    if (phonetic) {
        html += `<p class="phonetic">${phonetic}</p>`;
    }

    entry.meanings.forEach(meaning => {
        html += `<div class="meaning">`;
        html += `<strong class="part-of-speech">${meaning.partOfSpeech}</strong>`;
        if (meaning.definitions.length > 0) {
            html += `<ol class="definitions-list">`;
            meaning.definitions.slice(0, 3).forEach(def => {
                html += `<li>${def.definition}</li>`;
            });
            html += `</ol>`;
        }
        html += `</div>`;
    });

    return html;
}

async function fetchAndShowDefinition() {
    if (!currentCard || !currentCard.english) return;

    const word = currentCard.english;
    const definitionEl = document.getElementById('dictionary-definition');

    definitionEl.style.display = 'block';
    definitionEl.innerHTML = '<i>Loading definition...</i>';

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        if (!response.ok) {
            throw new Error('Definition not found in the dictionary.');
        }
        const data = await response.json();
        definitionEl.innerHTML = formatDefinitionHtml(data);

    } catch (error) {
        console.error('Dictionary API Error:', error);
        definitionEl.innerHTML = `<p>Could not load definition.</p>`;
    }
}

async function speakWord(event) {
  if (event) event.stopPropagation();
  if (!currentCard || !currentCard.english) return;

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${currentCard.english}`);
    const data = await res.json();
    const audioUrl = data[0]?.phonetics?.find(p => p.audio)?.audio;
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play();
    } else {
      alert("No audio found for this word.");
    }
  } catch (err) {
    alert("Failed to load pronunciation.");
    console.error(err);
  }
}

function searchWord(event) {
    if (event) {
        event.stopPropagation();
    }
    if (!currentCard || !currentCard.english) return;
    const word = currentCard.english;
    const searchUrl = `https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${word}`;
    window.open(searchUrl, '_blank');
}

function promptSearch() {
    const searchWordRaw = prompt("請輸入要查詢的單字 (Enter word to search):");
    if (!searchWordRaw) return;
    
    const searchWord = searchWordRaw.trim();
    if (searchWord.length > 0) {
        searchSpecificWord(searchWord);
    } else {
        alert("輸入無效！");
    }
}

function searchSpecificWord(searchWord) {
    const word = searchWord.toLowerCase();
    const vocabEntry = vocabulary.find(item => item[0].toLowerCase() === word);
    
    if (vocabEntry) {
        const wordKey = vocabEntry[0];
        if (!cards[wordKey]) {
            cards[wordKey] = [0, 250, Date.now()];
            saveProgress();
        }
        currentCard = {
            english: wordKey,
            chinese: vocabEntry[1],
            cefr: vocabEntry[2],
            data: cards[wordKey],
            fromSearch: true
        };
        displayCard();
        isFlipped = false;
    } else {
        alert(`找不到單字 "${searchWord}"，請檢查拼寫。`);
    }
}

function deleteCurrentCard(event) {
    if (event) event.stopPropagation();
    if (!currentCard || !currentCard.english) return;
    const wordToDelete = currentCard.english;
    if (confirm(`確定要永久刪除 "${wordToDelete}" 及其所有學習進度嗎？`)) {
        delete cards[wordToDelete];
        saveProgress();
        showNextCard();
    }
}

function updateButtonLabels() {
    ['again', 'good', 'easy'].forEach(action => {
        const small = document.getElementById(`btn-${action}`).querySelector('small');
        if (currentCard) { 
            const nextState = calculateNextState(currentCard.data.slice(), action);
            small.textContent = formatInterval(nextState.interval);
        } else {
            small.textContent = '---';
        }
    });
}

function updateStatus() {
  const levelWords = vocabulary.filter(v => v[2] === currentCefrLevel); 
  const dueNowInLevel = levelWords.filter(v => cards[v[0]] && cards[v[0]][DUE] <= Date.now()).length;
  const totalDue = Object.values(cards).filter(c => c[DUE] <= Date.now()).length;
  const totalCards = vocabulary.length;
  document.getElementById("status").textContent = 
    `Due: ${dueNowInLevel} / ${levelWords.length} | Total Due: ${totalDue}`;
}

// --- SRS & Level Progression Logic ---

function formatInterval(minutes) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

function calculateNextState(cardData, action) {
    let newInterval, newEase = cardData[EASE];
    const currentInterval = cardData[INTERVAL];
    const good = currentInterval < CONSTANTS.MIN_GOOD_INTERVAL ? CONSTANTS.MIN_GOOD_INTERVAL : currentInterval * (cardData[EASE] / 100);
    switch(action) {
        case "again": 
            newInterval = CONSTANTS.AGAIN_INTERVAL; 
            newEase = Math.max(CONSTANTS.MIN_EASE, newEase - CONSTANTS.EASE_PENALTY_AGAIN); 
            break;
        case "good": 
            newInterval = good; 
            break;
        case "easy": 
            const baseInterval = currentInterval < CONSTANTS.MIN_DAY_INTERVAL ? CONSTANTS.MIN_DAY_INTERVAL * CONSTANTS.EASY_INITIAL_DAYS : good * CONSTANTS.EASY_MULTIPLIER;
            newInterval = baseInterval;
            newEase += CONSTANTS.EASE_BONUS_EASY; 
            break;
    }
    return { interval: Math.round(newInterval), ease: newEase };
}

function rate(action) {
  if (!currentCard) return;
  const { interval, ease } = calculateNextState(currentCard.data, action);
  currentCard.data[INTERVAL] = interval;
  currentCard.data[EASE] = ease;
  currentCard.data[DUE] = Date.now() + (interval * 60 * 1000);
  cards[currentCard.english] = currentCard.data;
  saveProgress();
  checkAndAdvanceLevel(); 
  showNextCard();
}

function checkAndAdvanceLevel() {
    const levelWords = vocabulary.filter(v => v[2] === currentCefrLevel);
    const allReviewed = levelWords.every(v => cards[v[0]] && cards[v[0]][INTERVAL] > 0);
    if (allReviewed) {
        const currentIndex = cefrLevels.indexOf(currentCefrLevel);
        if (currentIndex < cefrLevels.length - 1) {
            const nextLevel = cefrLevels[currentIndex + 1];
            currentCefrLevel = nextLevel;
            localStorage.setItem("currentCefrLevel", currentCefrLevel);
        }
    }
}

// --- Data & State Management ---

async function saveProgress() {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');
  if (token && id) { updateSyncStatus('syncing'); }
  const base_time_ms = Date.now();
  const cardsWithOffsets = {};
  for (const word in cards) {
      const data = cards[word];
      const offsetMinutes = Math.round((data[DUE] - base_time_ms) / 60000); 
      cardsWithOffsets[word] = [data[INTERVAL], data[EASE], offsetMinutes];
  }
  const contentToSave = JSON.stringify({ base_time_ms, cards: cardsWithOffsets });
  if (token && id) {
    try {
      await fetch(`${GIST_API_BASE}${id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { [GIST_PROGRESS_FILENAME]: { content: contentToSave } } })
      });
      updateSyncStatus('success');
    } catch (error) {
      console.error('[Sync Error] Failed to save to Gist:', error);
      updateSyncStatus('error');
    }
  } 
  localStorage.setItem(LOCAL_STORAGE_KEY, contentToSave);
  localStorage.setItem("currentCefrLevel", currentCefrLevel);
}

async function loadProgress() {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');
  let dataLoaded = false;
  if (token && id) {
    try {
      const response = await fetch(`${GIST_API_BASE}${id}`, { headers: { 'Authorization': `token ${token}` } });
      if (!response.ok) throw new Error(`Gist fetch failed. HTTP Status: ${response.status}`);
      const data = await response.json();
      if (data.files && data.files[GIST_PROGRESS_FILENAME] && data.files[GIST_PROGRESS_FILENAME].content) {
        const parsedData = JSON.parse(data.files[GIST_PROGRESS_FILENAME].content);
        if (parsedData && parsedData.base_time_ms && parsedData.cards) {
            const baseTime = parsedData.base_time_ms;
            const loadedCards = parsedData.cards;
            const processedCards = {};
            for (const word in loadedCards) {
                const cardData = loadedCards[word];
                const dueTimestamp = baseTime + (cardData[DUE] * 60000); 
                processedCards[word] = [cardData[INTERVAL], cardData[EASE], dueTimestamp];
            }
            cards = processedCards;
        } else {
            cards = parsedData || {};
        }
        dataLoaded = true;
      }
    } catch (error) { 
        console.error('[Sync Error] Failed to load from Gist, falling back to local.', error);
        updateSyncStatus('error');
    }
  }
  if (!dataLoaded) {
      const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localData) {
          const parsedData = JSON.parse(localData);
          if (parsedData && parsedData.base_time_ms && parsedData.cards) {
              const baseTime = parsedData.base_time_ms;
              const loadedCards = parsedData.cards;
              const processedCards = {};
              for (const word in loadedCards) {
                  const cardData = loadedCards[word];
                  const dueTimestamp = baseTime + (cardData[DUE] * 60000);
                  processedCards[word] = [cardData[INTERVAL], cardData[EASE], dueTimestamp];
              }
              cards = processedCards;
          } else {
              cards = parsedData || {};
          }
      } else {
          cards = {};
      }
      updateSyncStatus();
  }
  const savedLevel = localStorage.getItem("currentCefrLevel");
  if (savedLevel && cefrLevels.includes(savedLevel)) {
    currentCefrLevel = savedLevel;
  }
}

function showNextCard() {
  currentCard = currentCard ? { ...currentCard, fromSearch: false } : null; 
  const currentLevelVocab = vocabulary.filter(v => v[2] === currentCefrLevel);
  const dueCards = currentLevelVocab.filter(v => {
    const word = v[0];
    return cards[word] && cards[word][DUE] <= Date.now();
  });
  if (dueCards.length > 0) {
    const vocabEntry = dueCards[Math.floor(Math.random() * dueCards.length)];
    const wordKey = vocabEntry[0];
    currentCard = { 
      english: wordKey,
      chinese: vocabEntry[1],
      cefr: vocabEntry[2],
      data: cards[wordKey],
      fromSearch: false
    };
  } else {
    const allReviewed = currentLevelVocab.every(v => cards[v[0]] && cards[v[0]][INTERVAL] > 0);
    if (allReviewed) {
        const oldLevel = currentCefrLevel;
        checkAndAdvanceLevel(); 
        if (currentCefrLevel !== oldLevel) {
            setTimeout(showNextCard, 0); 
            return;
        }
    }
    currentCard = null; 
  }
  displayCard();
  updateStatus();
  updateButtonLabels();
}

async function initializeDeck() {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');
  if (token && id) { updateSyncStatus('syncing'); } else { updateSyncStatus('local'); }
  await loadProgress(); 
  try {
    const response = await fetch(VOCABULARY_FILENAME);
    if (!response.ok) {
        throw new Error(`HTTP Status: ${response.status} (${response.statusText}). Check if the file is in the correct directory.`);
    }
    const jsonText = await response.text();
    vocabulary = JSON.parse(jsonText);
    if (Object.keys(cards).length === 0) { 
        let newCardsAdded = 0;
        vocabulary.forEach(item => {
          if (!cards[item[0]]) { 
            cards[item[0]] = [0, 250, Date.now()];
            newCardsAdded++;
          }
        });
        if (newCardsAdded > 0) {
            saveProgress();
        }
    }
  } catch (error) {
    console.error(`[Vocab Error] Failed to load vocabulary file (${VOCABULARY_FILENAME}):`, error);
    document.getElementById('card-front').textContent = `Error: Could not load vocabulary. See console for details.`;
  } finally {
    showNextCard();
    document.querySelector('.main-content').style.opacity = 1;
  }
}

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', initializeDeck);