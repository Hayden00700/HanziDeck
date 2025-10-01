const GIST_FILENAME = 'progress.json';
const GIST_API_BASE = 'https://api.github.com/gists/';
let cards = {};
let sortState = { column: 'char', direction: 'asc' };

function formatInterval(minutes) {
  if (minutes < 1) return 'New';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

function renderCardTable() {
  const tbody = document.getElementById('card-list-body');
  tbody.innerHTML = ''; 

  const cardArray = Object.values(cards);

  cardArray.sort((a, b) => {
      let valA, valB;
      if (sortState.column === 'char') {
          valA = a.char;
          valB = b.char;
      } else if (sortState.column === 'interval') {
          valA = a.interval;
          valB = b.interval;
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
      <td>${formatInterval(card.interval)}</td>
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
        cards[char] = { char: char, interval: 0, ease: 250, due: Date.now() };
    });
    
    saveProgress();
    renderCardTable();
    alert(`Process complete.\nNew cards added: ${addedCount}\nExisting cards reset: ${resetCount}`);
    document.getElementById('bulk-add-text').value = '';
}

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

async function saveProgress() {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');
  if (token && id) {
    try {
      await fetch(`${GIST_API_BASE}${id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(cards) } } })
      });
    } catch (error) {
      console.error('Failed to save to Gist:', error);
      alert('Failed to sync with Gist. Changes saved locally for now.');
    }
  }
  localStorage.setItem("ankiCards", JSON.stringify(cards));
}

async function loadProgress() {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');
  if (token && id) {
    try {
      const response = await fetch(`${GIST_API_BASE}${id}`, {
        headers: { 'Authorization': `token ${token}` }
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.files && data.files[GIST_FILENAME] && data.files[GIST_FILENAME].content) {
        cards = JSON.parse(data.files[GIST_FILENAME].content);
        return;
      }
    } catch (error) {
      console.error('Failed to load from Gist, falling back to local.');
    }
  }
  cards = JSON.parse(localStorage.getItem("ankiCards") || '{}');
}

async function initializePage() {
  loadCredentials();
  await updateSyncStatus();
  await loadProgress();
  renderCardTable();
}

document.addEventListener('DOMContentLoaded', initializePage);