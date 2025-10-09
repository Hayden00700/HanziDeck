const GIST_PROGRESS_FILENAME = 'oxford_progress.json';
const LOCAL_STORAGE_KEY = 'vocabularyProgress';
const OXFORD5000_FILENAME = 'oxford5000.json'; 
const GIST_API_BASE = 'https://api.github.com/gists/';

let cards = {};
let vocabulary = [];
let wordToLevelMap = {};
let sortState = { column: 'word', direction: 'asc' };

const INTERVAL = 0, EASE = 1, DUE = 2;

function formatInterval(minutes) {
  if (minutes < 1) return 'New';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

function renderCardTable() {
  const tbody = document.getElementById('card-list-body');
  tbody.innerHTML = ''; 

  const cardArray = Object.entries(cards).map(([word, data]) => ({ 
      word, 
      data,
      level: wordToLevelMap[word] || 'N/A' 
  }));

  cardArray.sort((a, b) => {
      let valA, valB;
      if (sortState.column === 'word') valA = a.word, valB = b.word;
      else if (sortState.column === 'interval') valA = a.data[INTERVAL], valB = b.data[INTERVAL];
      else if (sortState.column === 'level') {
          // 修正: 確保 Level 排序是依照 CEFR 順序 (A1, A2, B1...) 而非純文字順序
          const levelOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'N/A'];
          valA = levelOrder.indexOf(a.level);
          valB = levelOrder.indexOf(b.level);
      }
      
      if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
      return 0;
  });

  if (cardArray.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Your deck is empty.</td></tr>';
    return;
  }

  cardArray.forEach(card => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="word-cell">${card.word}</td>
      <td>${card.level}</td>
      <td>${formatInterval(card.data[INTERVAL])}</td>
      <td class="action-cell">
        <button class="btn btn-red btn-small" onclick="deleteCard('${card.word}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function sortTable(column) {
    if (sortState.column === column) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.column = column;
        sortState.direction = (column === 'word' || column === 'level') ? 'asc' : 'desc'; // Word 和 Level 預設升序
    }
    document.querySelectorAll('th.sortable').forEach(th => th.innerText = th.innerText.replace(' ▲', '').replace(' ▼', ''));
    const currentHeader = document.getElementById(`sort-${column}`);
    currentHeader.innerText += sortState.direction === 'asc' ? ' ▲' : ' ▼';
    renderCardTable();
}

function deleteCard(word) {
  if (confirm(`Are you sure you want to delete the word "${word}"?`)) {
    delete cards[word];
    saveProgress();
    renderCardTable();
  }
}

function handleBulkAddOrReset() {
    const text = document.getElementById('bulk-add-text').value;
    if (!text.trim()) {
        alert('Text area is empty.');
        return;
    }
    const words = text.split('\n').map(w => w.trim()).filter(Boolean);
    let addedCount = 0;
    let resetCount = 0;
    words.forEach(word => {
        if (cards[word]) resetCount++;
        else addedCount++;
        cards[word] = [0, 250, Date.now()];
    });
    saveProgress();
    renderCardTable();
    alert(`Process complete.\nNew words added: ${addedCount}\nExisting words reset: ${resetCount}`);
    document.getElementById('bulk-add-text').value = '';
}

async function saveCredentials() {
  const token = document.getElementById('accessToken').value.trim();
  const id = document.getElementById('gistId').value.trim();
  if (!token || !id) {
    alert('Please provide both a Personal Access Token and a Gist ID.');
    return;
  }
  localStorage.setItem('ankiAccessToken', token);
  localStorage.setItem('ankiGistId', id);
  await updateSyncStatus();
}

function loadCredentials() {
  document.getElementById('accessToken').value = localStorage.getItem('ankiAccessToken') || '';
  document.getElementById('gistId').value = localStorage.getItem('ankiGistId') || '';
}

function disconnect() {
  if (confirm('Are you sure you want to disconnect from GitHub Gist? Your progress will no longer be synced.')) {
    localStorage.removeItem('ankiAccessToken');
    localStorage.removeItem('ankiGistId');
    loadCredentials();
    updateSyncStatus();
  }
}

async function updateSyncStatus() {
    const statusEl = document.getElementById('sync-status');
    const formEl = document.getElementById('credentials-form');
    const connectedEl = document.getElementById('connected-view');
    const token = localStorage.getItem('ankiAccessToken');
    const id = localStorage.getItem('ankiGistId');

    if (!token || !id) {
        statusEl.textContent = 'Please provide Token and Gist ID.';
        statusEl.style.color = '#f39c12';
        formEl.style.display = 'block';
        connectedEl.style.display = 'none';
        return;
    }

    formEl.style.display = 'none';
    connectedEl.style.display = 'block';
    statusEl.textContent = 'Connecting...';
    statusEl.style.color = '#555';

    try {
        const response = await fetch(`${GIST_API_BASE}${id}`, {
            method: 'GET',
            headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        statusEl.textContent = 'Successfully connected to Gist.';
        statusEl.style.color = '#2ecc71';
    } catch (error) {
        statusEl.textContent = `Connection failed: ${error.message}`;
        statusEl.style.color = '#e74c3c';
    }
}

async function saveProgress() {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');
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
    } catch (error) {
      console.error('Failed to save to Gist:', error);
      alert('Failed to sync with Gist. Changes saved locally for now.');
    }
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, contentToSave);
}

async function loadProgress() {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');
  let dataLoaded = false;
  
  // 1. Try to load from Gist if credentials exist
  if (token && id) {
    try {
      const response = await fetch(`${GIST_API_BASE}${id}`, { headers: { 'Authorization': `token ${token}` } });
      if (!response.ok) throw new Error("Gist fetch failed.");
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
            cards = parsedData || {}; // Fallback for old format
        }
        dataLoaded = true;
      }
    } catch (error) { console.error('Failed to load from Gist, falling back to local.', error); }
  }
  
  // 2. Fallback to local storage if Gist failed or no credentials
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
  }
}

// 新增載入單字列表的函數
async function loadVocabulary() {
    try {
        const response = await fetch(OXFORD5000_FILENAME);
        if (!response.ok) {
             throw new Error(`HTTP Status: ${response.status} (${response.statusText}).`);
        }
        const jsonText = await response.text();
        vocabulary = JSON.parse(jsonText);
        
        // 將單字和 Level 映射到 wordToLevelMap
        vocabulary.forEach(item => {
            // 假設 item 格式為 [word, chinese, level]
            wordToLevelMap[item[0]] = item[2]; 
        });
    } catch (error) {
        console.error(`[Vocab Error] Failed to load vocabulary file (${OXFORD5000_FILENAME}):`, error);
        alert('Error: Could not load vocabulary list. Level information will not be available.');
    }
}


async function initializePage() {
  await loadVocabulary(); // 首先載入單字列表
  loadCredentials();
  await updateSyncStatus();
  await loadProgress(); // 其次載入進度
  renderCardTable();
}
document.addEventListener('DOMContentLoaded', initializePage);