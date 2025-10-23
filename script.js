// Game configuration and state variables
const FILL_PER_CAN = 20;        // percent per can
let containerPercent = 0;       // 0..100
let collects = 0;               // number of cans clicked
let gameActive = false;         // Tracks if game is currently running
let spawnInterval;              // Holds the interval for spawning items
let timerInterval;
let timerSeconds = 30;          // default time
let goalPercent = 100;
let endlessMode = false;
let totalPercent = 0;          // accumulates percent across fills (used for goal checks)
let goalReachedNotified = false; // whether we've already shown the goal reached message
// runtime spawn settings (adjusted by difficulty)
let CURRENT_NEGATIVE_CHANCE = 0.4; // will be overridden by difficulty
let CURRENT_SPAWN_COUNT = 1; // how many cans to try to spawn each tick
let CURRENT_SPAWN_INTERVAL_MS = 600; // spawn tick interval (ms)

// DOM references
const gridEl = document.querySelector('.game-grid');
const clickedCansEl = document.getElementById('clicked-cans');
const filledCansEl = document.getElementById('filled-cans');
const timerEl = document.getElementById('timer');
const achievementsEl = document.getElementById('achievements');
const waterFillEl = document.querySelector('.water-fill');
const containerPercentEl = document.getElementById('container-percent');
const startBtn = document.getElementById('start-game');
const resetBtn = document.getElementById('reset-game');
const endlessToggle = document.getElementById('endless-toggle');
const goalInput = document.getElementById('goal-percent');
const difficultySelect = document.getElementById('difficulty-select');
const confettiRoot = document.getElementById('confetti-root');
// Goal badge element (created dynamically)
let goalBadgeEl = null;
// Simple WebAudio-based sounds (no external assets required)
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      audioCtx = null;
    }
  }
}

function playClickSound() {
  ensureAudio();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.value = 900;
  g.gain.value = 0.06;
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.06);
}

function playNegativeSound() {
  ensureAudio();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sawtooth';
  o.frequency.value = 240;
  g.gain.value = 0.06;
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.08);
}

function playWinSound() {
  ensureAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const o1 = audioCtx.createOscillator();
  const o2 = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o1.type = 'sine'; o2.type = 'triangle';
  o1.frequency.value = 660; o2.frequency.value = 880;
  g.gain.value = 0.08;
  o1.connect(g); o2.connect(g); g.connect(audioCtx.destination);
  o1.start(now); o2.start(now);
  o1.stop(now + 0.18); o2.stop(now + 0.28);
  g.gain.setValueAtTime(0.08, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
}

// Creates the 3x3 game grid where items will appear
// Creates the game grid where items will appear. Size is number of columns/rows (e.g. 3 for 3x3)
function createGrid(size = 3) {
  gridEl.innerHTML = ''; // Clear any existing grid cells
  // Set CSS grid columns dynamically and a sensible max-width so cells stay square-ish
  gridEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  // approximate per-cell width to keep layout stable
  const perCell = 90; // px per cell (approx)
  gridEl.style.maxWidth = (size * perCell) + 'px';
  const total = size * size;
  for (let i = 0; i < total; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell'; // Each cell represents a grid square
    gridEl.appendChild(cell);
  }
}

// Helper: map difficulty to grid size
function getGridSizeForDifficulty(diff) {
  if (!diff) return 4; // default normal
  if (diff === 'easy') return 3;
  if (diff === 'hard') return 5;
  return 4; // normal
}

// Ensure the grid is created when the page loads using selected difficulty
const initialDifficulty = (typeof difficultySelect !== 'undefined' && difficultySelect && difficultySelect.value) ? difficultySelect.value : 'normal';
createGrid(getGridSizeForDifficulty(initialDifficulty));

// Spawns a new item in a random grid cell
function spawnWaterCan() {
  if (!gameActive) return; // Stop if the game is not active
  const cells = Array.from(document.querySelectorAll('.grid-cell'));
  // pick only empty cells (no .water-can present)
  const empty = cells.filter(c => !c.querySelector('.water-can'));
  if (empty.length === 0) return; // no room
  // Select a random empty cell
  const randomCell = empty[Math.floor(Math.random() * empty.length)];

  // Create the water can element with a click handler
  const wrapper = document.createElement('div');
  wrapper.className = 'water-can-wrapper';
  // decide whether this is a negative (red) jug
  const negative = Math.random() < CURRENT_NEGATIVE_CHANCE;
  wrapper.dataset.negative = negative ? '1' : '0';
  wrapper.innerHTML = `<div class="water-can${negative ? ' negative' : ''}" role="button" aria-label="water can"></div>`;
  // progress bar
  const progress = document.createElement('div');
  progress.className = 'cell-progress';
  progress.innerHTML = '<i></i>';
  // lifetime for a can in ms
  const CAN_LIFETIME_MS = 4000;

  // Clicking the can collects it
  wrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    // clear auto-expire if any
    if (wrapper._expireTimeout) clearTimeout(wrapper._expireTimeout);
    collectCan(wrapper);
  }, { once: true });

  randomCell.appendChild(wrapper);
  // highlight the cell while the can is present (red if negative)
  if (negative) randomCell.classList.add('negative-cell'); else randomCell.classList.add('has-can');
  // attach progress bar to the cell and animate it
  randomCell.appendChild(progress);
  // ensure CSS transition duration matches lifetime
  const bar = progress.querySelector('i');
  if (negative) progress.classList.add('negative');
  if (bar) {
    // force reflow then set width to 100% so transition animates
    bar.style.transitionDuration = (CAN_LIFETIME_MS / 1000) + 's';
    requestAnimationFrame(() => { bar.style.width = '100%'; });
  }
  // auto-expire the can after lifetime
  wrapper._expireTimeout = setTimeout(() => {
    // remove the can and progress if still present
    if (wrapper.parentNode) {
      const parent = wrapper.parentNode;
      parent.classList.remove('has-can');
      parent.classList.remove('negative-cell');
      // remove progress bar if present
      const p = parent.querySelector('.cell-progress');
      if (p) p.remove();
      wrapper.remove();
    }
  }, CAN_LIFETIME_MS);
}

// Spawn tick: attempt to spawn CURRENT_SPAWN_COUNT cans each tick
function spawnTick() {
  for (let i = 0; i < CURRENT_SPAWN_COUNT; i++) {
    spawnWaterCan();
  }
}

// Collect a can: fill container percentally and update UI
function collectCan(wrapperEl) {
  if (!gameActive) return;
  // Animate removal of the can
  // remove immediately for responsiveness and clear highlight
  if (wrapperEl.parentNode) {
    const parent = wrapperEl.parentNode;
    parent.classList.remove('has-can');
    parent.classList.remove('negative-cell');
    // remove progress bar if present
    const p = parent.querySelector('.cell-progress');
    if (p) p.remove();
    parent.removeChild(wrapperEl);
  }
  // small click sound
  try { playClickSound(); } catch (e) {}

  // Update clicked cans counter (every click)
  if (clickedCansEl) clickedCansEl.textContent = (parseInt(clickedCansEl.textContent || '0', 10) + 1);

  // Determine effect: positive or negative
  const isNegative = wrapperEl.dataset && wrapperEl.dataset.negative === '1';
  if (isNegative) {
    // subtract percent
    containerPercent = Math.max(0, containerPercent - FILL_PER_CAN);
    totalPercent = Math.max(0, totalPercent - FILL_PER_CAN);
    try { playNegativeSound(); } catch (e) {}
  } else {
    // Increase both the current container percent and the session total percent
    containerPercent = Math.min(100, containerPercent + FILL_PER_CAN);
    totalPercent = Math.min(10000, totalPercent + FILL_PER_CAN); // cap to a large number to avoid runaway
  }
  updateContainerUI();

  // When the current container reaches 100%, that counts as one collected container
  // If after this click the visible container reached 100% (only possible on positive fills)
  if (!isNegative && containerPercent >= 100) {
    collects += 1;
    if (filledCansEl) filledCansEl.textContent = collects;

    // Briefly show the full container, then reset it for the next one
    setTimeout(() => {
      containerPercent = 0;
      updateContainerUI();
    }, 500);
  }

  // Check win condition in normal mode using the accumulated totalPercent
  if (!endlessMode && totalPercent >= goalPercent && !goalReachedNotified) {
    // Notify the player they've reached the goal, but keep playing until timer ends
    goalReachedNotified = true;
    achievementsEl.textContent = 'Goal reached! Keep going until time runs out.';
    showConfetti(true);
    try { playWinSound(); } catch (e) {}
    // show badge
    showGoalBadge();
  }
}

// Update visual container and percent text
function updateContainerUI() {
  // height in percent equal to containerPercent
  waterFillEl.style.height = containerPercent + '%';
  containerPercentEl.textContent = Math.round(containerPercent) + '%';
}

// Initializes and starts a new game
function startGame() {
  if (gameActive) return; // Prevent starting a new game if one is already active

  // Read settings
  endlessMode = endlessToggle.checked;
  // Determine goal based on difficulty mode (containers * 100). If endless mode is set, goal input is ignored.
  const difficulty = (difficultySelect && difficultySelect.value) ? difficultySelect.value : 'normal';
  const containersForDifficulty = (difficulty === 'easy') ? 1 : (difficulty === 'hard') ? 5 : 3;
  goalPercent = containersForDifficulty * 100;
  // reflect the goal in the input field for clarity (but keep it disabled in endless mode)
  if (goalInput) goalInput.value = goalPercent;
  if (goalPercent < FILL_PER_CAN) goalPercent = FILL_PER_CAN;

  // Reset state
  containerPercent = 0;
  collects = 0;
  if (clickedCansEl) clickedCansEl.textContent = '0';
  if (filledCansEl) filledCansEl.textContent = '0';
  timerSeconds = 30;
  timerEl.textContent = timerSeconds;
  achievementsEl.textContent = '';
  goalReachedNotified = false;
  // remove badge if any
  if (goalBadgeEl) {
    goalBadgeEl.remove();
    goalBadgeEl = null;
  }
  updateContainerUI();
  // create grid sized for selected difficulty
  const gridSize = getGridSizeForDifficulty(difficulty);
  createGrid(gridSize);
  gameActive = true;

  // Read difficulty and configure spawn parameters
  // Default settings
  const settings = {
    easy: { interval: 900, count: 1, negative: 0.2 },
    normal: { interval: 600, count: 1, negative: 0.4 },
    hard: { interval: 350, count: 2, negative: 0.55 }
  };
  const cfg = settings[difficulty] || settings.normal;
  CURRENT_SPAWN_INTERVAL_MS = cfg.interval;
  CURRENT_SPAWN_COUNT = cfg.count;
  CURRENT_NEGATIVE_CHANCE = cfg.negative;

  // Spawn water cans on an interval using spawnTick
  spawnInterval = setInterval(spawnTick, CURRENT_SPAWN_INTERVAL_MS);
  // Immediately spawn according to current count
  spawnTick();

  // Timer countdown
  timerInterval = setInterval(() => {
    timerSeconds -= 1;
    timerEl.textContent = timerSeconds;
    if (timerSeconds <= 0) {
      // Timer ran out
      if (endlessMode) {
        endGame(true, 'Good job! Time ran out (Endless).');
      } else if (totalPercent >= goalPercent) {
        endGame(true, 'You reached the goal!');
      } else {
        endGame(false, 'Time is up! You ran out of time.');
      }
    }
  }, 1000);

  // UI toggles
  startBtn.style.display = 'none';
  resetBtn.style.display = 'inline-block';
  goalInput.disabled = endlessMode;
  endlessToggle.disabled = true;
  if (difficultySelect) difficultySelect.disabled = true;
}

// End the game and present message
function endGame(success, message) {
  gameActive = false;
  clearInterval(spawnInterval);
  clearInterval(timerInterval);
  spawnInterval = null;
  timerInterval = null;

  achievementsEl.textContent = message;
  if (success) {
    try { playWinSound(); } catch (e) {}
    showConfetti(true);
  }
  startBtn.style.display = 'none';
  resetBtn.style.display = 'inline-block';
  endlessToggle.disabled = false;
  goalInput.disabled = false;
  if (difficultySelect) difficultySelect.disabled = false;
}

// Reset the game back to original state
function resetGame() {
  gameActive = false;
  clearInterval(spawnInterval);
  clearInterval(timerInterval);
  spawnInterval = null;
  timerInterval = null;
  containerPercent = 0;
  collects = 0;
  if (clickedCansEl) clickedCansEl.textContent = '0';
  if (filledCansEl) filledCansEl.textContent = '0';
  timerSeconds = 30;
  timerEl.textContent = timerSeconds;
  achievementsEl.textContent = '';
  goalReachedNotified = false;
  totalPercent = 0;
  updateContainerUI();
  // recreate grid at default/selected size on reset
  const resetSize = getGridSizeForDifficulty((difficultySelect && difficultySelect.value) ? difficultySelect.value : 'normal');
  createGrid(resetSize);
  startBtn.style.display = 'inline-block';
  resetBtn.style.display = 'none';
  endlessToggle.disabled = false;
  goalInput.disabled = false;
  if (difficultySelect) difficultySelect.disabled = false;
  confettiRoot.innerHTML = '';
  if (goalBadgeEl) {
    goalBadgeEl.remove();
    goalBadgeEl = null;
  }
}

// Enhanced confetti generator; if `big` is true produce a larger, longer burst
function showConfetti(big = false) {
  confettiRoot.innerHTML = '';
  const colors = ['#FFC907', '#2E9DF7', '#8BD1CB', '#4FCB53', '#FF902A', '#F5402C', '#F16061'];
  const count = big ? 80 : 30;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    const sizeType = Math.random() > 0.7 ? 'large' : (Math.random() > 0.8 ? 'small' : '');
    piece.className = `confetti-piece ${sizeType}`.trim();
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.left = (Math.random() * 100) + '%';
    piece.style.transform = `translateY(0) rotate(${Math.random() * 720}deg)`;
    piece.style.animationDelay = (Math.random() * 0.6) + 's';
    // random horizontal drift via CSS variable
    piece.style.setProperty('--drift', (Math.random() * 60 - 30) + 'px');
    confettiRoot.appendChild(piece);
  }
  // remove after 5s
  setTimeout(() => confettiRoot.innerHTML = '', big ? 5500 : 3500);
}

// Show a small badge in the UI when reaching the goal
function showGoalBadge() {
  if (goalBadgeEl) return;
  goalBadgeEl = document.createElement('div');
  goalBadgeEl.className = 'goal-badge';
  goalBadgeEl.textContent = 'GOAL!';
  document.querySelector('.container').appendChild(goalBadgeEl);
  // trigger show
  requestAnimationFrame(() => goalBadgeEl.classList.add('show'));
  // hide after some time
  setTimeout(() => {
    if (!goalBadgeEl) return;
    goalBadgeEl.classList.remove('show');
    setTimeout(() => {
      if (goalBadgeEl) {
        goalBadgeEl.remove();
        goalBadgeEl = null;
      }
    }, 350);
  }, 4500);
}

// Wire controls
startBtn.addEventListener('click', startGame);
resetBtn.addEventListener('click', resetGame);
endlessToggle.addEventListener('change', () => {
  goalInput.disabled = endlessToggle.checked;
});

// When difficulty changes and the game is not active, resize the grid immediately for preview
if (difficultySelect) {
  difficultySelect.addEventListener('change', () => {
    if (!gameActive) {
      createGrid(getGridSizeForDifficulty(difficultySelect.value));
    }
  });
}