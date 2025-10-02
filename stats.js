// A minimal set of constants and functions needed for loading and processing data
const GIST_FILENAME = 'progress.json';
const GIST_API_BASE = 'https://api.github.com/gists/';
const INTERVAL = 0, EASE = 1, DUE = 2;
let cards = {};

// --- Chart Rendering Logic ---
function renderStatistics() {
    const cardValues = Object.values(cards);
    
    if (cardValues.length === 0) {
        document.getElementById('charts-card').style.display = 'none';
        document.getElementById('no-data-card').style.display = 'block';
        return;
    }

    // 1. Maturity Chart
    const maturityCounts = { new: 0, learning: 0, young: 0, mature: 0 };
    const ONE_DAY_IN_MINUTES = 1440;
    
    cardValues.forEach(card => {
        const interval = card[INTERVAL];
        if (interval < 1) maturityCounts.new++;
        else if (interval < ONE_DAY_IN_MINUTES) maturityCounts.learning++;
        else if (interval < 21 * ONE_DAY_IN_MINUTES) maturityCounts.young++;
        else maturityCounts.mature++;
    });

    const maturityCtx = document.getElementById('maturity-chart').getContext('2d');
    new Chart(maturityCtx, {
        type: 'bar',
        data: {
            labels: ['New', 'Learning', 'Young', 'Mature'],
            datasets: [{
                label: 'Card Count',
                data: [maturityCounts.new, maturityCounts.learning, maturityCounts.young, maturityCounts.mature],
                backgroundColor: ['#3498db', '#f1c40f', '#2ecc71', '#9b59b6']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Card Maturity Distribution' },
                legend: { display: false }
            },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });

    // 2. Forecast Chart
    const forecastDays = 7;
    const forecastCounts = Array(forecastDays).fill(0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now_ms = today.getTime();

    cardValues.forEach(card => {
        const due_ms = card[DUE];
        if (due_ms >= now_ms) {
            const diff_ms = due_ms - now_ms;
            const dayIndex = Math.floor(diff_ms / (1000 * 60 * 60 * 24));
            if (dayIndex < forecastDays) forecastCounts[dayIndex]++;
        }
    });

    const forecastCtx = document.getElementById('forecast-chart').getContext('2d');
    new Chart(forecastCtx, {
        type: 'bar',
        data: {
            labels: ['Today', 'Tomorrow', '+2 days', '+3 days', '+4 days', '+5 days', '+6 days'],
            datasets: [{
                label: 'Reviews',
                data: forecastCounts,
                backgroundColor: '#e74c3c'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: '7-Day Review Forecast' },
                legend: { display: false }
            },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

// --- Data Loading Logic ---
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
        dataLoaded = true;
      }
    } catch (error) { console.error('Failed to load from Gist, falling back to local.'); }
  }
  
  if (!dataLoaded) {
      const localData = localStorage.getItem("ankiCards");
      if (localData) {
          const parsedData = JSON.parse(localData);
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
          cards = {};
      }
  }
}

async function initializePage() {
  await loadProgress();
  renderStatistics();
}

document.addEventListener('DOMContentLoaded', initializePage);