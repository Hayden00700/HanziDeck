let cards = {};
let currentCard = null;
let isPracticeVisible = false;

const synth = window.speechSynthesis;
let practiceHanziWriter = null;
let chineseVoicePromise = null;

// ETag is no longer used for conflict checks.
let lastKnownETag = null;

const INTERVAL = 0, EASE = 1, DUE = 2;
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

// NEW: 台灣「為」字形的筆順數據
const WEI_CUSTOM_STROKE_DATA = {"character":"為","strokes":["M315,643C327,631 339,615 352,597C358,590 366,584 377,582C382,582 389,585 393,593C397,601 397,616 394,634C391,651 364,668 316,687C298,694 291,696 291,676C290,670 299,660 315,643Z","M573,786C549,813 505,824 493,820C484,818 481,812 484,801C497,748 461,629 418,549C401,518 401,518 393,503C287,310 181,188 68,52C31,9 94,41 121,66C190,133 242,188 289,249C306,271 306,271 314,282C338,315 361,348 384,384C400,409 400,409 408,422C422,445 450,495 464,520C479,549 479,549 487,563C502,592 544,692 575,746C586,767 582,777 573,786Z","M553,446C561,465 569,487 576,511C582,537 564,537 546,534C514,530 487,526 464,520C417,509 417,509 393,503C333,489 284,469 231,483C155,503 151,526 260,529C291,531 354,538 418,549C441,554 464,559 487,563C525,571 579,591 606,579C623,571 642,560 664,540C674,532 672,515 659,506C644,497 628,483 614,459C602,442 545,427 553,446Z","M621,333C631,362 640,385 644,406C649,433 615,428 592,423C529,412 464,399 384,384C369,382 393,419 408,422C468,429 498,435 553,446C594,455 594,455 614,459C640,465 658,469 672,460C706,441 727,426 731,415C732,408 729,401 723,395C711,384 698,369 684,343C673,325 613,313 621,333Z","M739,-82C726,-60 697,-30 653,12C637,28 627,43 658,35C677,31 698,30 722,26C746,22 764,31 773,60C787,108 793,176 797,261C797,280 793,293 775,303C751,317 475,274 348,246C319,240 301,243 289,249C276,254 300,279 314,282C418,301 532,319 621,333C663,340 663,340 684,343C807,363 790,375 835,348C860,333 879,320 892,308C900,302 900,294 887,279C877,268 871,251 868,229C845,106 828,29 817,-6C808,-30 796,-53 781,-74C766,-92 751,-104 739,-82Z","M284,152C292,107 301,73 316,54C321,48 331,47 340,51C347,55 354,62 357,72C364,98 348,134 312,176C305,185 298,189 293,190C288,191 285,188 283,181C280,175 281,166 284,152Z","M398,189C415,147 430,120 449,114C456,112 466,115 472,125C475,133 475,146 472,158C466,180 443,196 408,213C402,216 399,214 396,206C393,202 395,197 398,189Z","M504,210C526,170 544,145 562,140C569,138 578,142 583,153C586,161 584,172 580,184C570,207 546,223 512,234C505,236 503,234 501,226C499,222 500,218 504,210Z","M634,196C647,180 659,161 675,140C680,132 687,126 697,124C702,123 709,127 713,133C717,141 719,155 718,171C717,185 708,197 692,208C651,235 627,247 620,243C616,242 614,237 614,229C613,223 621,212 634,196Z"],"medians":[[[300,682],[363,630],[380,588]],[[490,815],[533,761],[435,524],[257,247],[65,38]],[[184,511],[283,505],[576,559],[623,517],[559,444]],[[385,391],[649,443],[687,408],[632,326]],[[294,255],[800,329],[846,279],[790,17],[745,-41],[646,30]],[[293,186],[331,52]],[[404,207],[462,119]],[[508,226],[567,143]],[[622,238],[705,131]]]}

// NEW: 台灣「黃」字形的筆順數據
const HUANG_CUSTOM_STROKE_DATA = {"character":"黃","strokes":["M614,700C664,706 710,712 753,713C759,714 767,715 772,723C774,730 766,740 752,745C706,763 664,751 625,743C588,736 588,736 569,732C522,723 472,716 430,710C398,706 398,706 382,704C366,703 315,699 249,695C231,695 228,689 242,676C248,670 256,663 266,657C274,652 285,653 299,655C327,661 357,666 389,670C418,674 418,674 433,676C474,682 517,691 565,695C598,698 598,698 614,700Z","M430,710C428,729 427,749 429,767C430,780 428,788 421,792C410,799 397,805 381,809C368,813 354,811 343,802C336,798 340,792 349,782C363,766 374,739 382,704C387,681 387,681 389,670C397,629 411,548 421,540C437,527 437,539 440,560C441,570 441,581 441,590C438,626 435,650 433,676C431,699 431,699 430,710Z","M593,616C599,645 606,673 614,700C621,729 621,729 625,743C632,773 640,798 652,818C655,825 651,835 640,844C622,860 604,869 590,873C581,876 574,875 568,871C562,867 560,861 565,851C572,837 576,824 576,813C574,787 572,760 569,732C566,707 566,707 565,695C562,671 557,644 553,616C551,603 590,603 593,616Z","M440,560Q447,559 460,561Q508,571 613,580Q623,581 624,589Q624,596 596,615Q595,616 593,616C581,622 566,618 553,616C552,616 552,616 552,616Q491,600 441,590C431,588 430,560 440,560Z","M497,471Q602,481 918,481Q940,481 947,490Q954,503 935,520Q875,563 832,556Q624,517 79,461Q54,460 72,439Q105,406 151,415Q290,451 460,467C485,470 485,470 497,471Z","M327,377Q317,383 280,388Q268,391 265,385Q259,379 268,363Q302,297 323,189Q327,156 347,135Q366,113 371,130Q372,134 372,138C373,155 373,155 373,164Q372,180 368,201Q346,301 338,340C335,353 339,372 327,377Z","M631,163C631,161 632,157 634,152C637,142 642,137 652,137C660,138 666,144 673,154C681,168 694,204 711,264C720,299 740,327 766,348C778,359 779,370 768,380C755,392 732,407 698,425C689,430 662,426 614,419C570,413 354,381 327,377C314,374 326,336 338,340C364,349 407,356 474,366C504,371 504,371 519,373C597,386 652,387 664,378C670,374 673,360 669,338C655,262 643,213 636,191C632,182 629,172 631,163Z","M524,270Q570,277 610,281Q632,285 625,297Q615,310 591,316Q569,320 530,310Q527,310 526,309C494,301 494,301 478,297Q438,288 403,280Q387,277 406,262Q416,255 437,258Q458,262 479,264C509,268 509,268 524,270Z","M474,366C480,352 477,321 478,297C479,275 479,275 479,264C479,241 478,207 479,179C479,165 521,172 521,186C521,215 522,243 524,270C525,296 525,296 526,309C528,354 529,357 519,373C511,386 468,380 474,366Z","M372,138Q382,137 395,138Q530,156 631,163C640,163 644,186 636,191Q632,195 624,196Q600,202 521,186C493,181 493,181 479,179Q422,173 373,164C364,163 363,138 372,138Z","M372,104Q348,41 175,-53Q151,-63 179,-66Q260,-70 387,20Q421,45 438,55Q451,65 450,75Q449,88 425,102Q398,118 386,117Q377,117 372,104Z","M599,81Q657,35 727,-36Q745,-55 761,-59Q770,-60 777,-49Q789,-36 773,9Q758,63 598,113Q588,117 587,105Q587,92 599,81Z"],"medians":[[[239,688],[293,676],[693,732],[766,724]],[[344,800],[398,764],[426,540]],[[569,864],[614,813],[572,609]],[[435,573],[616,589]],[[73,453],[138,440],[839,519],[944,502]],[[270,383],[307,352],[363,129]],[[325,369],[691,395],[723,346],[647,141]],[[406,272],[620,296]],[[487,376],[495,175]],[[371,148],[636,181]],[[384,110],[395,63],[269,-24],[172,-58]],[[594,105],[730,12],[761,-53]]]}

// NEW: 自訂筆順數據的映射表
const CUSTOM_STROKE_DATA_MAP = {
    '為': WEI_CUSTOM_STROKE_DATA,
    '黃': HUANG_CUSTOM_STROKE_DATA
};

// MODIFIED: 判斷是否需要載入自訂數據
const getHanziWriterOptions = (char, forPractice) => {
    let options = {};
    const customData = CUSTOM_STROKE_DATA_MAP[char];

    if (customData) {
        // 使用 charDataLoader 注入自訂數據
        options.charDataLoader = (charToLoad, onComplete) => {
            if (charToLoad === char) {
                setTimeout(() => onComplete(customData), 0);
            } else {
                onComplete(null); // 讓 HanziWriter 嘗試使用預設載入器
            }
        };
    }
    
    // 設定練習模式或主顯示模式的特定選項
    if (forPractice) {
        options = {
            ...options,
            width: window.innerWidth < 768 ? 280 : 300, 
            height: window.innerWidth < 768 ? 280 : 300,
            padding: 5, showOutline: true, strokeAnimationSpeed: 0.5, delayBetweenStrokes: 100, strokeColor: '#000000', drawingWidth: 40 
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
// ... (searchForChar function remains the same)
  const charToFindRaw = prompt("Enter a character to search for:");
  if (!charToFindRaw || charToFindRaw.trim().length !== 1) {
    if (charToFindRaw !== null) alert("Please enter a single character.");
    return;
  }
  const charToFind = charToFindRaw.trim();
  const foundCardData = cards[charToFind];
  if (foundCardData) {
    if (isPracticeVisible) showStrokeOrder(); 
    currentCard = { char: charToFind, data: foundCardData };
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
      cards[charToFind] = [0, 250, Date.now()];
      saveProgress(); // This now saves immediately
      updateStatus();
      alert(`Character "${charToFind}" has been added to your deck!`);
      if (isPracticeVisible) showStrokeOrder(); 
      currentCard = { char: charToFind, data: cards[charToFind] };
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
function updateSyncStatus(status) {
// ... (updateSyncStatus function remains the same)
  const statusEl = document.getElementById('sync-status-indicator');
  statusEl.textContent = '';

  if (!accessToken || !gistId) {
    statusEl.style.backgroundColor = '#f39c12';
    statusEl.title = 'Local Mode (Not Synced)';
    return;
  }

  switch (status) {
    case 'syncing':
      statusEl.style.backgroundColor = '#f39c12';
      statusEl.title = 'Syncing...';
      break;
    case 'success':
      statusEl.style.backgroundColor = '#2ecc71';
      statusEl.title = 'Synced';
      break;
    case 'error':
      statusEl.style.backgroundColor = '#e74c3c';
      statusEl.title = 'Sync Failed';
      break;
    default:
      statusEl.style.backgroundColor = '#2ecc71';
      statusEl.title = 'Connected';
  }
}

async function saveToCloud() {
// ... (saveToCloud function remains the same)
  if (!accessToken || !gistId) return;

  const base_time_ms = Date.now();
  const cardsWithOffsets = {};
  for (const char in cards) {
      const data = cards[char];
      const offsetMinutes = Math.round((data[DUE] - base_time_ms) / 60000);
      cardsWithOffsets[char] = [data[INTERVAL], data[EASE], offsetMinutes];
  }
  const contentToSave = JSON.stringify({ base_time_ms, cards: cardsWithOffsets });

  try {
    const patchResponse = await fetch(`${GIST_API_BASE}${gistId}`, {
      method: 'PATCH',
      headers: { 
        'Authorization': `token ${accessToken}`, 
        'Accept': 'application/vnd.github.com.v3+json', 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: contentToSave } } })
    });

    if (!patchResponse.ok) {
      throw new Error(`HTTP error! Status: ${patchResponse.status}`);
    }
    
    lastKnownETag = patchResponse.headers.get('ETag');
    updateSyncStatus('success');

  } catch (error) {
    console.error('Failed to save to Gist:', error);
    updateSyncStatus('error');
  }
}

async function loadFromCloud() {
// ... (loadFromCloud function remains the same)
  if (!accessToken || !gistId) return false;
  try {
    const response = await fetch(`${GIST_API_BASE}${gistId}`, {
      method: 'GET',
      headers: { 'Authorization': `token ${accessToken}`, 'Accept': 'application/vnd.github.com.v3+json' }
    });
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    
    lastKnownETag = response.headers.get('ETag');

    const data = await response.json();
    if (data.files && data.files[GIST_FILENAME]) {
      const content = data.files[GIST_FILENAME].content;
      
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
      } else {
        cards = {};
      }
    }
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
// ... (loadCredentials function remains the same)
  accessToken = localStorage.getItem('ankiAccessToken') || '';
  gistId = localStorage.getItem('ankiGistId') || '';
}

function getChineseVoice() {
// ... (getChineseVoice function remains the same)
  if (chineseVoicePromise) { return chineseVoicePromise; }
  chineseVoicePromise = new Promise((resolve) => {
    const findVoice = () => {
      const voices = synth.getVoices();
      if (voices.length > 0) {
        const foundVoice = voices.find(v => v.name === 'Google 國語（台灣）') || voices.find(v => v.lang === 'zh-TW') || voices.find(v => v.lang.startsWith('zh-')) || voices.find(v => v.lang === 'zh');
        resolve(foundVoice || null);
      }
    };
    findVoice();
    if (synth.onvoiceschanged !== undefined) { synth.onvoiceschanged = findVoice; }
  });
  return chineseVoicePromise;
}
async function speakCharacter() {
// ... (speakCharacter function remains the same)
  if (!currentCard || !currentCard.char) return;
  if (synth.speaking) synth.cancel();
  const chineseVoice = await getChineseVoice();
  const utterance = new SpeechSynthesisUtterance(currentCard.char);
  if (chineseVoice) { utterance.voice = chineseVoice; }
  utterance.lang = 'zh-TW';
  utterance.rate = 0.8;
  synth.speak(utterance);
  if (!isPracticeVisible) { fetchAndDisplayDetails(currentCard.char); }
}
function renderDefinitions(data) {
// ... (renderDefinitions function remains the same)
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
      if (def.quote) def.quote.forEach(q => { content += `<span class="example">Quote: ${q}</span>`; });
      content += `</li>`;
    });
    content += `</ol>`;
  });
  if (content) { container.innerHTML = content; container.style.display = 'block'; }
  else { container.style.display = 'none'; }
}
async function fetchAndDisplayDetails(char) {
// ... (fetchAndDisplayDetails function remains the same)
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

// MODIFIED: showStrokeOrder 邏輯，使用 getHanziWriterOptions 注入自訂數據
function showStrokeOrder() {
  const mainDisplayWrapper = document.getElementById('main-display-wrapper');
  const practiceContainer = document.getElementById('practice-container');
  const definitionsEl = document.getElementById('definitions-container');
  
  if (isPracticeVisible) {
    practiceContainer.style.display = 'none';
    mainDisplayWrapper.style.display = 'flex';
    footerControls.style.display = 'flex';
    isPracticeVisible = false;
    if (practiceHanziWriter) practiceHanziWriter.cancelQuiz();
  } else {
    if (!currentCard || !currentCard.char) return;
    
    mainDisplayWrapper.style.display = 'none';
    footerControls.style.display = 'none';
    definitionsEl.style.display = 'none';
    
    const char = currentCard.char;
    const options = getHanziWriterOptions(char, true);
    
    // HanziWriter Logic
    if (!practiceHanziWriter) {
      document.getElementById('stroke-order-animation').innerHTML = ''; // Ensure container is clean
      practiceHanziWriter = HanziWriter.create('stroke-order-animation', char, options);
    } else { 
        // 重新設置 character 和 options
        practiceHanziWriter.setCharacter(char, options); 
    }
    
    resetPracticeView();
    practiceContainer.style.display = 'flex';
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

// MODIFIED: Explicitly hide outline on quiz start to match the toggle state
function startPracticeQuiz() {
    document.getElementById('practice-controls-main').style.display = 'none';
    document.getElementById('practice-controls-quiz').style.display = 'flex';
    
    const hintToggle = document.getElementById('hint-toggle-checkbox');
    hintToggle.checked = false;

    // Ensure the visual state matches the control state at the start of the quiz
    if (practiceHanziWriter) {
        practiceHanziWriter.hideOutline();
    }

    practiceHanziWriter.quiz({
        showHintAfterMisses: 1,
        onComplete: (summaryData) => {
            setTimeout(resetPracticeView, 1000);
        }
    });
}

function endPracticeQuiz() {
    if (practiceHanziWriter) practiceHanziWriter.cancelQuiz();
    resetPracticeView();
}

function animateAllStrokes() { if (practiceHanziWriter) practiceHanziWriter.animateCharacter(); }

// MODIFIED: displayCharacter 邏輯，使用 getHanziWriterOptions 注入自訂數據
function displayCharacter(character) {
    const charEl = document.getElementById('char');
    charEl.innerHTML = ''; 
    charEl.style.fontSize = 'var(--char-size-desktop)';
    
    if (character) {
        const options = getHanziWriterOptions(character, false); // false = not for practice
        // 確保在創建 HanziWriter 前清空 DOM
        charEl.innerHTML = ''; 
        HanziWriter.create('char', character, options);
    } else { 
        charEl.style.fontSize = '24px'; charEl.textContent = "All cards reviewed for now!"; 
    }
}
function minutesToMs(mins) { return mins * 60 * 1000; }
function formatInterval(minutes) {
// ... (formatInterval function remains the same)
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  return hours < 24 ? `${Math.round(hours)}h` : `${Math.round(hours / 24)}d`;
}

async function saveProgress() {
// ... (saveProgress function remains the same)
  if (accessToken && gistId) {
    updateSyncStatus('syncing');
    await saveToCloud();
  } else {
    const base_time_ms = Date.now();
    const cardsWithOffsets = {};
    for (const char in cards) {
        const data = cards[char];
        const offsetMinutes = Math.round((data[DUE] - base_time_ms) / 60000);
        cardsWithOffsets[char] = [data[INTERVAL], data[EASE], offsetMinutes];
    }
    localStorage.setItem("ankiCards", JSON.stringify({ base_time_ms, cards: cardsWithOffsets }));
  }
}

async function loadProgress() {
// ... (loadProgress function remains the same)
  const cloudSuccess = await loadFromCloud();
  if (!cloudSuccess) {
    lastKnownETag = null;
    const saved = localStorage.getItem("ankiCards");
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
    }
  }
  if (!cloudSuccess) { updateSyncStatus(); }
}
function calculateNextState(cardData, action) {
// ... (calculateNextState function remains the same)
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
// ... (updateButtonLabels function remains the same)
    ['again', 'good', 'easy'].forEach(action => {
        const small = document.getElementById(`btn-${action}`).querySelector('small');
        small.textContent = currentCard ? formatInterval(calculateNextState(currentCard.data, action).interval) : '---';
    });
}
function toggleControls(enabled) {
// ... (toggleControls function remains the same)
  [document.getElementById('speak-btn'), document.getElementById('stroke-btn')].forEach(btn => {
    btn.disabled = !enabled; btn.style.opacity = enabled ? 1.0 : 0.5;
    btn.style.cursor = enabled ? 'pointer' : 'default';
  });
}

async function initializeDeck() {
// ... (initializeDeck function remains the same)
  await loadProgress();

  if (Object.keys(cards).length > 0) {
    const firstCard = Object.values(cards)[0];
    const needsMigration = firstCard && !Array.isArray(firstCard);
    if (needsMigration) {
      console.log("Old object format found. Migrating to array format...");
      alert("Your save file is being optimized to a smaller format. This is a one-time process.");
      const newCards = {};
      for (const char in cards) {
        const oldCard = cards[char];
        newCards[char] = [ oldCard.interval || 0, oldCard.ease || 250, oldCard.due || Date.now() ];
      }
      cards = newCards;
      saveProgress(); 
      console.log("Migration to array format complete.");
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
// ... (updateStatus function remains the same)
  const total = Object.keys(cards).length;
  const dueNow = Object.values(cards).filter(c => c[DUE] <= Date.now()).length;
  document.getElementById("status").textContent = `Due: ${dueNow} / Total: ${total}`;
}
function showNextCard() {
// ... (showNextCard function remains the same)
  if (isPracticeVisible) { showStrokeOrder(); }
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
// ... (rate function remains the same)
  if (!currentCard) return;
  const { interval, ease } = calculateNextState(currentCard.data, action);
  currentCard.data[INTERVAL] = interval;
  currentCard.data[EASE] = ease;
  currentCard.data[DUE] = Date.now() + minutesToMs(interval);
  cards[currentCard.char] = currentCard.data;
  
  saveProgress(); 
  
  showNextCard();
}

// Initial page load sequence
loadCredentials();
document.getElementById('search-btn').addEventListener('click', searchForChar);
getChineseVoice();
initializeDeck();

document.getElementById('hint-toggle-checkbox').addEventListener('change', (event) => {
  if (practiceHanziWriter) {
    if (event.target.checked) {
      practiceHanziWriter.showOutline();
    } else {
      practiceHanziWriter.hideOutline();
    }
  }
});