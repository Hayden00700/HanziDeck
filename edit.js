const GIST_FILENAME = 'progress.json';
const GIST_API_BASE = 'https://api.github.com/gists/';
let cards = {};
let sortState = { column: 'char', direction: 'asc' };

// --- NEW: Data structure indices for readability ---
const INTERVAL = 0, EASE = 1, DUE = 2;

function formatInterval(minutes) {
  if (minutes < 1) return 'New';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

// MODIFIED: Updated to handle new data structure
function renderCardTable() {
  const tbody = document.getElementById('card-list-body');
  tbody.innerHTML = ''; 

  // Convert entries to an array of objects for easier sorting/rendering
  const cardArray = Object.entries(cards).map(([char, data]) => ({
    char: char,
    data: data
  }));

  cardArray.sort((a, b) => {
      let valA, valB;
      if (sortState.column === 'char') {
          valA = a.char;
          valB = b.char;
      } else if (sortState.column === 'interval') {
          valA = a.data[INTERVAL]; // Use array index
          valB = b.data[INTERVAL]; // Use array index
      }
      
      if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
      return 0;
  });

  if (cardArray.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">No cards in your deck yet.</td></tr>';
    return;
  }

  cardArray.forEach(card => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="char-cell">${card.char}</td>
      <td>${formatInterval(card.data[INTERVAL])}</td> <!-- Use array index -->
      <td class="action-cell">
        <button class="btn btn-red" onclick="deleteCard('${card.char}')">Delete</button>
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
        sortState.direction = 'asc';
    }
    
    document.querySelectorAll('th.sortable').forEach(th => th.innerText = th.innerText.replace(' ▲', '').replace(' ▼', ''));
    const currentHeader = document.getElementById(`sort-${column}`);
    currentHeader.innerText += sortState.direction === 'asc' ? ' ▲' : ' ▼';
    
    renderCardTable();
}

function deleteCard(char) {
  if (confirm(`Are you sure you want to delete the character "${char}"?`)) {
    delete cards[char];
    saveProgress();
    renderCardTable();
  }
}

function handleBulkAdd() {
    const text = document.getElementById('bulk-add-text').value;
    if (!text.trim()) {
        alert('Text area is empty.');
        return;
    }

    const chars = text.split('');
    let addedCount = 0;
    let resetCount = 0;
    
    chars.forEach(char => {
        if (char.trim().length !== 1 || !/\p{Script=Han}/u.test(char)) return;

        if (cards[char]) {
            resetCount++;
        } else {
            addedCount++;
        }
        // MODIFIED: Create card in new array format
        cards[char] = [0, 250, Date.now()]; // [interval, ease, due]
    });
    
    saveProgress();
    renderCardTable();
    alert(`Process complete.\nNew cards added: ${addedCount}\nExisting cards reset: ${resetCount}`);
    document.getElementById('bulk-add-text').value = '';
}

// ... All functions from saveCredentials onwards are unchanged ...
async function saveCredentials() {
  const token = document.getElementById('accessToken').value.trim();
  const id = document.getElementById('gistId').value.trim();
  localStorage.setItem('ankiAccessToken', token);
  localStorage.setItem('ankiGistId', id);
  await updateSyncStatus();
}
function loadCredentials() {
  document.getElementById('accessToken').value = localStorage.getItem('ankiAccessToken') || '';
  document.getElementById('gistId').value = localStorage.getItem('ankiGistId') || '';
}
async function updateSyncStatus() {
    const statusEl = document.getElementById('sync-status');
    const token = localStorage.getItem('ankiAccessToken');
    const id = localStorage.getItem('ankiGistId');
    if (!token || !id) {
        statusEl.textContent = 'Please provide Token and Gist ID.';
        statusEl.style.color = '#f39c12';
        return;
    }
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
// MODIFIED: Saves data in the new space-efficient format
async function saveProgress() {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');

  const base_time_ms = Date.now();
  const cardsWithOffsets = {};
  for (const char in cards) {
      const data = cards[char];
      const offsetMinutes = Math.round((data[DUE] - base_time_ms) / 60000);
      cardsWithOffsets[char] = [data[INTERVAL], data[EASE], offsetMinutes];
  }
  const contentToSave = JSON.stringify({ base_time_ms, cards: cardsWithOffsets });

  if (token && id) {
    try {
      await fetch(`${GIST_API_BASE}${id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { [GIST_FILENAME]: { content: contentToSave } } })
      });
    } catch (error) {
      console.error('Failed to save to Gist:', error);
      alert('Failed to sync with Gist. Changes saved locally for now.');
    }
  }
  localStorage.setItem("ankiCards", contentToSave);
}

// MODIFIED: Loads and processes both old and new data formats
async function loadProgress() {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');
  let dataLoaded = false;

  if (token && id) {
    try {
      const response = await fetch(`${GIST_API_BASE}${id}`, { headers: { 'Authorization': `token ${token}` } });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.files && data.files[GIST_FILENAME] && data.files[GIST_FILENAME].content) {
        const parsedData = JSON.parse(data.files[GIST_FILENAME].content);
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
        dataLoaded = true;
      }
    } catch (error) { console.error('Failed to load from Gist, falling back to local.'); }
  }
  
  if (!dataLoaded) {
      const localData = localStorage.getItem("ankiCards");
      if (localData) {
          const parsedData = JSON.parse(localData);
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
      } else {
          cards = {};
      }
  }
}
async function initializePage() {
  loadCredentials();
  await updateSyncStatus();
  await loadProgress();
  renderCardTable();
}
document.addEventListener('DOMContentLoaded', initializePage);