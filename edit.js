const GIST_API_BASE = 'https://api.github.com/gists/';
let cards = {};
let sortState = { column: 'char', direction: 'asc' };

// --- Profile Management Variables ---
let currentProfile = 'Default';
let profiles = ['Default'];

const INTERVAL = 0, EASE = 1, DUE = 2;

// ... (formatInterval, renderCardTable, sortTable, deleteCard, handleBulkAdd, etc. functions remain the same)
function formatInterval(minutes) {
  if (minutes < 1) return 'New';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

function renderCardTable() {
  const tbody = document.getElementById('card-list-body');
  tbody.innerHTML = ''; 
  const cardArray = Object.entries(cards).map(([char, data]) => ({ char, data }));
  cardArray.sort((a, b) => {
      let valA, valB;
      if (sortState.column === 'char') valA = a.char, valB = b.char;
      else if (sortState.column === 'interval') valA = a.data[INTERVAL], valB = b.data[INTERVAL];
      if (valA < valB) return sortState.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortState.direction === 'asc' ? 1 : -1;
      return 0;
  });
  if (cardArray.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 20px;">This profile deck is empty.</td></tr>';
    return;
  }
  cardArray.forEach(card => {
    const row = document.createElement('tr');
    row.innerHTML = `<td class="char-cell">${card.char}</td><td>${formatInterval(card.data[INTERVAL])}</td><td class="action-cell"><button class="btn btn-red btn-small" onclick="deleteCard('${card.char}')">Delete</button></td>`;
    tbody.appendChild(row);
  });
}

function sortTable(column) {
    if (sortState.column === column) sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    else { sortState.column = column; sortState.direction = 'asc'; }
    document.querySelectorAll('th.sortable').forEach(th => th.innerText = th.innerText.replace(' ▲', '').replace(' ▼', ''));
    document.getElementById(`sort-${column}`).innerText += sortState.direction === 'asc' ? ' ▲' : ' ▼';
    renderCardTable();
}

function deleteCard(char) {
  if (confirm(`Are you sure you want to delete "${char}" from the "${currentProfile}" profile?`)) {
    delete cards[char];
    // Keep saveProgress() call without arguments (syncToCloud=true by default)
    saveProgress(); 
    renderCardTable();
  }
}

// MODIFIED: Updated handleBulkAdd to only add NEW cards, not reset existing ones.
function handleBulkAdd() {
    const text = document.getElementById('bulk-add-text').value;
    if (!text.trim()) return alert('Text area is empty.');
    // 使用 Set 確保字符唯一性，並將其轉換為陣列
    const chars = [...new Set(text.split(''))]; 
    let addedCount = 0;
    let ignoredCount = 0; // 追蹤被忽略的現有卡片

    chars.forEach(char => {
        // 過濾非單一漢字
        if (char.trim().length !== 1 || !/\p{Script=Han}/u.test(char)) return; 
        
        if (cards[char]) {
            // If card exists, do NOT reset it, just ignore.
            ignoredCount++;
            return; // 跳過此輪，保持現有卡片的進度
        } else {
            // Card is new
            addedCount++;
            // Add new card with initial state (Interval: 0, Ease: 250, Due: now)
            cards[char] = [0, 250, Date.now()];
        }
    });

    // Keep saveProgress() call without arguments (syncToCloud=true by default)
    saveProgress();
    renderCardTable();
    
    // MODIFIED: Simplified the alert message
    if (addedCount > 0) {
        if (ignoredCount > 0) {
             alert(`Process complete for profile "${currentProfile}".\nNew cards added: ${addedCount}\nCharacters already in deck: ${ignoredCount}`);
        } else {
             alert(`Process complete for profile "${currentProfile}".\nNew cards added: ${addedCount}`);
        }
    } else if (ignoredCount > 0) {
        alert(`Process complete for profile "${currentProfile}".\nAll ${ignoredCount} characters were already in the deck.`);
    } else {
        alert('No valid new characters were found in the input.');
    }
    
    document.getElementById('bulk-add-text').value = '';
}

async function saveCredentials() {
  const token = document.getElementById('accessToken').value.trim();
  const id = document.getElementById('gistId').value.trim();
  if (!token || !id) return alert('Please provide both Token and Gist ID.');
  localStorage.setItem('ankiAccessToken', token);
  localStorage.setItem('ankiGistId', id);
  // After saving credentials, reload the page to re-trigger the Gist-first profile loading
  location.reload(); 
}

function loadCredentials() {
  document.getElementById('accessToken').value = localStorage.getItem('ankiAccessToken') || '';
  document.getElementById('gistId').value = localStorage.getItem('ankiGistId') || '';
}

function disconnect() {
  if (confirm('Disconnect from GitHub Gist? Your progress will no longer be synced across devices.')) {
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
        statusEl.textContent = 'Not connected. Profiles and progress will only be saved locally.';
        statusEl.style.color = '#f39c12';
        formEl.style.display = 'block'; connectedEl.style.display = 'none'; return;
    }
    formEl.style.display = 'none'; connectedEl.style.display = 'block';
    statusEl.textContent = 'Connecting...'; statusEl.style.color = '#555';
    try {
        const response = await fetch(`${GIST_API_BASE}${id}`, {
            method: 'GET', headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        statusEl.textContent = 'Successfully connected to Gist.'; statusEl.style.color = '#2ecc71';
    } catch (error) {
        statusEl.textContent = `Connection failed: ${error.message}`; statusEl.style.color = '#e74c3c';
    }
}

// MODIFIED: saveProgress for edit.js is designed for immediate sync (syncToCloud=true by default)
async function saveProgress(syncToCloud = true) {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');
  const base_time_ms = Date.now();
  const cardsWithOffsets = {};
  for (const char in cards) {
      const data = cards[char];
      // Note: data[DUE] is timestamp, cardData[DUE] in offsetMinutes is the minute offset
      const offsetMinutes = Math.round((data[DUE] - base_time_ms) / 60000); 
      cardsWithOffsets[char] = [data[INTERVAL], data[EASE], offsetMinutes];
  }
  const contentToSave = JSON.stringify({ base_time_ms, cards: cardsWithOffsets });
  const fileName = `${currentProfile}.json`;

  if (syncToCloud && token && id) {
    try {
      await fetch(`${GIST_API_BASE}${id}`, {
        method: 'PATCH', headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { [fileName]: { content: contentToSave } } })
      });
    } catch (error) {
      console.error('Failed to save to Gist:', error);
      alert('Failed to sync progress. Changes saved locally.');
    }
  }
  // Always save locally
  localStorage.setItem(`ankiCards_${currentProfile}`, contentToSave);
}

async function loadProgress() {
  const token = localStorage.getItem('ankiAccessToken');
  const id = localStorage.getItem('ankiGistId');
  const fileName = `${currentProfile}.json`;
  let dataLoaded = false;
  
  if (token && id) {
    try {
      const response = await fetch(`${GIST_API_BASE}${id}`, { headers: { 'Authorization': `token ${token}` } });
      if (!response.ok) throw new Error('Gist fetch failed');
      const data = await response.json();
      if (data.files && data.files[fileName] && data.files[fileName].content) {
        const parsedData = JSON.parse(data.files[fileName].content);
        if (parsedData && parsedData.base_time_ms && parsedData.cards) {
            const baseTime = parsedData.base_time_ms;
            const loadedCards = parsedData.cards;
            cards = {};
            for (const char in loadedCards) {
                const cardData = loadedCards[char];
                const dueTimestamp = baseTime + (cardData[DUE] * 60000);
                cards[char] = [cardData[INTERVAL], cardData[EASE], dueTimestamp];
            }
        } else { cards = parsedData || {}; }
        dataLoaded = true;
      }
    } catch (error) { console.error('Failed to load progress from Gist, falling back to local.'); }
  }
  
  if (!dataLoaded) {
      const localData = localStorage.getItem(`ankiCards_${currentProfile}`);
      if (localData) {
          const parsedData = JSON.parse(localData);
          if (parsedData && parsedData.base_time_ms && parsedData.cards) {
              const baseTime = parsedData.base_time_ms;
              const loadedCards = parsedData.cards;
              cards = {};
              for (const char in loadedCards) {
                  const cardData = loadedCards[char];
                  const dueTimestamp = baseTime + (cardData[DUE] * 60000);
                  cards[char] = [cardData[INTERVAL], cardData[EASE], dueTimestamp];
              }
          } else { cards = parsedData || {}; }
      } else { cards = {}; }
  }
}

// --- MODIFIED: Profile Management Logic with Sync ---

// NEW: Function to sync the profile list TO the Gist
async function syncProfilesToGist() {
    const token = localStorage.getItem('ankiAccessToken');
    const id = localStorage.getItem('ankiGistId');
    if (!token || !id) return; // Cannot sync without credentials

    try {
        await fetch(`${GIST_API_BASE}${id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: { 'profiles.json': { content: JSON.stringify(profiles) } } })
        });
        console.log("Profile list successfully synced to Gist.");
    } catch (error) {
        console.error("Failed to sync profile list to Gist:", error);
        alert("Warning: Could not sync profile changes to the cloud.");
    }
}

// MODIFIED: This function now prioritizes loading profiles from the Gist.
async function loadProfileData() {
    const token = localStorage.getItem('ankiAccessToken');
    const id = localStorage.getItem('ankiGistId');

    let profilesLoadedFromGist = false;

    if (token && id) {
        try {
            const response = await fetch(`${GIST_API_BASE}${id}`, { headers: { 'Authorization': `token ${token}` } });
            if (!response.ok) throw new Error('Gist fetch for profiles failed');
            const data = await response.json();
            if (data.files && data.files['profiles.json'] && data.files['profiles.json'].content) {
                const parsedProfiles = JSON.parse(data.files['profiles.json'].content);
                if (Array.isArray(parsedProfiles) && parsedProfiles.length > 0) {
                    profiles = parsedProfiles;
                    profilesLoadedFromGist = true;
                    console.log("Profiles loaded from Gist:", profiles);
                }
            }
        } catch (error) {
            console.warn("Could not load profiles from Gist. Will use or create local profiles.", error);
        }
    }

    // Fallback to local storage if Gist loading fails or is not configured
    if (!profilesLoadedFromGist) {
        const savedProfiles = localStorage.getItem('ankiProfiles');
        if (savedProfiles) {
            profiles = JSON.parse(savedProfiles);
        } else {
            profiles = ['Default'];
        }
    }

    // After loading, save the authoritative list back to local storage
    localStorage.setItem('ankiProfiles', JSON.stringify(profiles));

    // Load the current active profile for this device
    currentProfile = localStorage.getItem('ankiCurrentProfile') || profiles[0];
    if (!profiles.includes(currentProfile)) {
        currentProfile = profiles[0];
        localStorage.setItem('ankiCurrentProfile', currentProfile);
    }
}


function populateProfileSelector() {
    const select = document.getElementById('profile-select');
    select.innerHTML = '';
    profiles.forEach(p => {
        const option = document.createElement('option');
        option.value = p;
        option.textContent = p;
        if (p === currentProfile) option.selected = true;
        select.appendChild(option);
    });
}

function switchProfile() {
    const select = document.getElementById('profile-select');
    const newProfile = select.value;
    localStorage.setItem('ankiCurrentProfile', newProfile);
    location.reload();
}

async function createProfile() {
    const input = document.getElementById('new-profile-name');
    const newName = input.value.trim();
    if (!newName) return alert('Profile name cannot be empty.');
    if (profiles.includes(newName)) return alert('This profile name already exists.');
    
    profiles.push(newName);
    localStorage.setItem('ankiProfiles', JSON.stringify(profiles));
    localStorage.setItem('ankiCurrentProfile', newName);
    
    // Create an empty local deck for the new profile
    // Note: The structure here is simplified compared to the full card structure, 
    // but the next loadProgress will correct the profile if needed.
    localStorage.setItem(`ankiCards_${newName}`, JSON.stringify({}));
    
    // MODIFIED: Sync the updated profile list to the Gist
    await syncProfilesToGist();

    alert(`Profile "${newName}" created and synced. The page will now reload.`);
    location.reload();
}

async function deleteProfile() {
    if (profiles.length <= 1) return alert('You cannot delete the last profile.');
    if (!confirm(`PERMANENTLY DELETE the profile "${currentProfile}" and all its cards from local storage AND from the Gist? This cannot be undone.`)) return;

    const token = localStorage.getItem('ankiAccessToken');
    const id = localStorage.getItem('ankiGistId');
    const fileName = `${currentProfile}.json`;

    // 1. Delete the profile's card data file from Gist
    if (token && id) {
        try {
            await fetch(`${GIST_API_BASE}${id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: { [fileName]: null } }) // Setting to null deletes it
            });
        } catch (error) {
            alert(`Could not delete card data from Gist: ${error.message}.`);
        }
    }

    // 2. Update the local profile list and local storage
    localStorage.removeItem(`ankiCards_${currentProfile}`);
    const profileIndex = profiles.indexOf(currentProfile);
    profiles.splice(profileIndex, 1);
    const newCurrentProfile = profiles[0];
    localStorage.setItem('ankiProfiles', JSON.stringify(profiles));
    localStorage.setItem('ankiCurrentProfile', newCurrentProfile);
    
    // 3. Sync the NEW profile list (with the deleted one removed) back to the Gist
    await syncProfilesToGist();

    alert(`Profile "${currentProfile}" deleted and synced. Switched to "${newCurrentProfile}". The page will now reload.`);
    location.reload();
}

async function initializePage() {
  loadCredentials();
  // MODIFIED: Initialization order is now critical
  await loadProfileData(); // 1. Load profiles (Gist first)
  populateProfileSelector(); // 2. Build UI with loaded profiles
  await updateSyncStatus();  // 3. Check Gist connection status
  await loadProgress();      // 4. Load card data for the current profile
  renderCardTable();         // 5. Render the card table
}

document.addEventListener('DOMContentLoaded', initializePage);