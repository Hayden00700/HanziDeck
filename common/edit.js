// Deck Editor and Settings
let cards = {};
let decks = [];
let activeDeckId = null;

const INTERVAL = 0, EASE = 1, DUE = 2;
const GIST_API_BASE = 'https://api.github.com/gists/';
const DECK_MANIFEST_FILENAME = '_deck_manifest.json';

// --- Card Management ---

function addCard() {
    if (!activeDeckId) {
        alert('Please select or create a deck first.');
        return;
    }
    const question = document.getElementById('new-question').value.trim();
    const answer = document.getElementById('new-answer').value.trim();
    if (!question || !answer) {
        alert('Please fill in both question and answer.');
        return;
    }
    const newId = 'card_' + Date.now();
    cards[newId] = {
        question,
        answer,
        data: [0, 250, Date.now()] // New cards are due immediately
    };
    saveProgress();
    document.getElementById('new-question').value = '';
    document.getElementById('new-answer').value = '';
    renderCardTable();
}

function deleteCard(id) {
    if (confirm(`Are you sure you want to delete the card: "${cards[id].question}"?`)) {
        delete cards[id];
        saveProgress();
        renderCardTable();
    }
}

function renderCardTable() {
    const tbody = document.getElementById('card-list-body');
    tbody.innerHTML = '';

    if (!activeDeckId) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">Please select or create a deck.</td></tr>';
        return;
    }

    const cardArray = Object.entries(cards).sort((a, b) => a[1].question.localeCompare(b[1].question));

    if (cardArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">This deck is empty.</td></tr>';
        return;
    }

    cardArray.forEach(([id, card]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td data-label="Question">${card.question}</td>
            <td data-label="Answer">${card.answer}</td>
            <td data-label="Interval">${formatInterval(card.data[INTERVAL])}</td>
            <td data-label="Action">
                <button class="btn btn-red btn-small" onclick="deleteCard('${id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function formatInterval(minutes) {
    if (minutes < 1) return 'New';
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = minutes / 60;
    return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

// --- Gist, Local Storage & Deck Management ---

async function saveProgress(options = { isDeletingDeck: false, deckIdToDelete: null }) {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');
  
  if (options.isDeletingDeck && options.deckIdToDelete) {
     localStorage.removeItem(`ankiCards_${options.deckIdToDelete}`);
  } else if(activeDeckId) {
    const base_time_ms = Date.now();
    const cardsWithOffsets = {};
    for (const cardId in cards) {
        const card = cards[cardId];
        const offsetMinutes = Math.round((card.data[DUE] - base_time_ms) / 60000);
        cardsWithOffsets[cardId] = { question: card.question, answer: card.answer, data: [card.data[INTERVAL], card.data[EASE], offsetMinutes] };
    }
    const contentToSave = JSON.stringify({ base_time_ms, cards: cardsWithOffsets });
    localStorage.setItem(`ankiCards_${activeDeckId}`, contentToSave);
  }

  if (token && id) {
    try {
      let filesPayload = {};
      if (options.isDeletingDeck && options.deckIdToDelete) {
        filesPayload[`${options.deckIdToDelete}.json`] = null; // Gist API to delete a file
      } else if (activeDeckId) {
         const contentToSave = localStorage.getItem(`ankiCards_${activeDeckId}`);
         filesPayload[`${activeDeckId}.json`] = { content: contentToSave };
      }
      
      if (Object.keys(filesPayload).length > 0) {
         await fetch(`${GIST_API_BASE}${id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: filesPayload })
         });
      }
    } catch (error) {
      console.error('Failed to save to Gist:', error);
      alert('Failed to sync with Gist. Changes saved locally.');
    }
  }
}

async function loadCardsForActiveDeck() {
    cards = {};
    if (!activeDeckId) {
        renderCardTable();
        return;
    }
    const localData = localStorage.getItem(`ankiCards_${activeDeckId}`);
    if (localData) processLoadedData(localData);

    const token = localStorage.getItem('ankiAccessToken');
    const id = localStorage.getItem('ankiGistId');
    if (token && id) {
        try {
            const deckFilename = `${activeDeckId}.json`;
            const response = await fetch(`${GIST_API_BASE}${id}`, { headers: { 'Authorization': `token ${token}` } });
            if (!response.ok) throw new Error();
            const data = await response.json();
            if (data.files && data.files[deckFilename] && data.files[deckFilename].content) {
                processLoadedData(data.files[deckFilename].content);
                localStorage.setItem(`ankiCards_${activeDeckId}`, data.files[deckFilename].content);
            }
        } catch (error) { console.error('Gist card load failed, using local version.'); }
    }
    renderCardTable();
}

function processLoadedData(jsonData) {
  try {
    const parsedData = JSON.parse(jsonData);
    if (parsedData && parsedData.base_time_ms && parsedData.cards) {
        const baseTime = parsedData.base_time_ms;
        const loadedCards = parsedData.cards;
        const processedCards = {};
        for (const cardId in loadedCards) {
            const card = loadedCards[cardId];
            const dueTimestamp = baseTime + (card.data[DUE] * 60000);
            processedCards[cardId] = { question: card.question, answer: card.answer, data: [card.data[INTERVAL], card.data[EASE], dueTimestamp] };
        }
        cards = processedCards;
    } else { cards = {}; }
  } catch(e) { cards = {}; }
}

async function loadDecks() {
    const localDecks = localStorage.getItem('ankiDecks');
    if (localDecks) decks = JSON.parse(localDecks);
    
    const token = localStorage.getItem('ankiAccessToken');
    const id = localStorage.getItem('ankiGistId');
    if (token && id) {
        try {
            const response = await fetch(`${GIST_API_BASE}${id}`, { headers: { 'Authorization': `token ${token}` } });
            if (!response.ok) throw new Error('Failed to fetch Gist');
            const data = await response.json();
            if (data.files && data.files[DECK_MANIFEST_FILENAME]) {
                decks = JSON.parse(data.files[DECK_MANIFEST_FILENAME].content);
            } else {
                // If no manifest on Gist, but we have local decks, upload them.
                if (decks.length > 0) await saveDecks();
            }
        } catch (error) {
            console.error('Failed to load decks from Gist, using local version.', error);
        }
    }
    localStorage.setItem('ankiDecks', JSON.stringify(decks));
}

async function saveDecks() {
    localStorage.setItem('ankiDecks', JSON.stringify(decks));
    const token = localStorage.getItem('ankiAccessToken');
    const id = localStorage.getItem('ankiGistId');
    if (token && id) {
        try {
            await fetch(`${GIST_API_BASE}${id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: { [DECK_MANIFEST_FILENAME]: { content: JSON.stringify(decks) } } })
            });
        } catch (error) {
            console.error('Failed to save deck list to Gist:', error);
            alert('Failed to sync deck list with Gist.');
        }
    }
}

function populateDeckSelector() {
    const selector = document.getElementById('deck-selector');
    selector.innerHTML = '';
    if (decks.length === 0) {
        selector.innerHTML = '<option>No decks available</option>';
        document.getElementById('add-card-container').style.display = 'none';
        document.getElementById('deck-list-container').style.display = 'none';
        return;
    }
    
    document.getElementById('add-card-container').style.display = 'block';
    document.getElementById('deck-list-container').style.display = 'block';

    decks.forEach(deck => {
        const option = document.createElement('option');
        option.value = deck.id;
        option.textContent = deck.name;
        if (deck.id === activeDeckId) {
            option.selected = true;
        }
        selector.appendChild(option);
    });

    const deckName = decks.find(d => d.id === activeDeckId)?.name || '';
    document.getElementById('add-card-title').textContent = `Add New Card to "${deckName}"`;
    document.getElementById('deck-list-title').textContent = `Cards in "${deckName}"`;
}

// MODIFIED: This function is now async to handle saving properly
async function addNewDeck() {
    const nameInput = document.getElementById('new-deck-name');
    const name = nameInput.value.trim();
    if (!name) { alert('Deck name cannot be empty.'); return; }
    if (decks.some(d => d.name === name)) { alert('A deck with this name already exists.'); return; }

    const newId = 'deck_' + Date.now();
    decks.push({ id: newId, name: name });
    activeDeckId = newId;
    localStorage.setItem('ankiActiveDeckId', activeDeckId);
    
    nameInput.value = '';
    cards = {}; // Start with a clean slate for the new deck
    
    // Await the save operations to ensure they complete before updating the UI
    await saveDecks(); 
    await saveProgress();
    
    populateDeckSelector();
    renderCardTable();
}

async function deleteCurrentDeck() {
    if (!activeDeckId) { alert("No deck selected to delete."); return; }
    const deckName = decks.find(d => d.id === activeDeckId)?.name;
    if (confirm(`Are you sure you want to permanently delete the deck "${deckName}" and all its cards?`)) {
        const deckIdToDelete = activeDeckId;
        decks = decks.filter(d => d.id !== deckIdToDelete);
        
        if (decks.length > 0) {
            activeDeckId = decks[0].id;
        } else {
            activeDeckId = null;
        }
        localStorage.setItem('ankiActiveDeckId', activeDeckId);

        await saveDecks();
        await saveProgress({ isDeletingDeck: true, deckIdToDelete: deckIdToDelete });
        
        populateDeckSelector();
        await loadCardsForActiveDeck();
    }
}

async function switchDeck(deckId) {
    activeDeckId = deckId;
    localStorage.setItem('ankiActiveDeckId', activeDeckId);
    populateDeckSelector();
    await loadCardsForActiveDeck();
}

// --- Gist Credentials UI ---

function saveCredentials() {
  const token = document.getElementById('accessToken').value.trim();
  const id = document.getElementById('gistId').value.trim();
  if (!token || !id) {
    alert('Please provide both a Personal Access Token and a Gist ID.');
    return;
  }
  localStorage.setItem('ankiAccessToken', token);
  localStorage.setItem('ankiGistId', id);
  updateSyncStatusUI();
  // Attempt to re-sync everything after connecting
  initializePage();
}

function loadCredentials() {
  document.getElementById('accessToken').value = localStorage.getItem('ankiAccessToken') || '';
  document.getElementById('gistId').value = localStorage.getItem('ankiGistId') || '';
}

function disconnect() {
  if (confirm('Disconnect from Gist? Your progress will only be saved locally.')) {
    localStorage.removeItem('ankiAccessToken');
    localStorage.removeItem('ankiGistId');
    loadCredentials();
    updateSyncStatusUI();
  }
}

async function updateSyncStatusUI() {
    const statusEl = document.getElementById('sync-status');
    const token = localStorage.getItem('ankiAccessToken');
    const id = localStorage.getItem('ankiGistId');
    document.getElementById('credentials-form').style.display = (token && id) ? 'none' : 'block';
    document.getElementById('connected-view').style.display = (token && id) ? 'block' : 'none';

    if (!token || !id) {
        statusEl.textContent = 'Not connected. Progress is saved locally.';
        statusEl.style.color = '#6c757d';
        return;
    }
    statusEl.textContent = 'Checking connection...'; statusEl.style.color = '#6c757d';
    try {
        const response = await fetch(`${GIST_API_BASE}${id}`, { headers: { 'Authorization': `token ${token}` } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        statusEl.textContent = 'Successfully connected to Gist.'; statusEl.style.color = '#28a745';
    } catch (error) {
        statusEl.textContent = `Connection failed: ${error.message}`; statusEl.style.color = '#dc3545';
    }
}

// --- Initialization ---

async function initializePage() {
  loadCredentials();
  await updateSyncStatusUI();
  await loadDecks();

  const savedDeckId = localStorage.getItem('ankiActiveDeckId');
  if (savedDeckId && decks.some(d => d.id === savedDeckId)) {
      activeDeckId = savedDeckId;
  } else if (decks.length > 0) {
      activeDeckId = decks[0].id;
      localStorage.setItem('ankiActiveDeckId', activeDeckId);
  } else {
      activeDeckId = null;
  }

  populateDeckSelector();
  await loadCardsForActiveDeck();
}

document.addEventListener('DOMContentLoaded', initializePage);