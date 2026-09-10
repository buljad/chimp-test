/* ==========================================================
   CHIMP TEST // MONKEY MEMORY BENCHMARK
   Smart Auto-Increment & Clickable Nick Suggestion (Strict Unique)
   ========================================================== */

const GRID_SIZE = 25; // 5x5
const MAX_LIVES = 3;
const CHIMP_CLICK_SPEED_MS = 190;

const state = {
  playerNick: '',
  level: 4,
  maxCleared: 0,
  lives: MAX_LIVES,
  expectedNext: 1,
  cellsMap: {},
  isRoundRunning: false,
  phase: 'idle',
  memorizeTimeout: null,
  recallStartTime: null,
  totalClickTime: 0,
  totalCorrectClicks: 0,
  soundEnabled: true,
  prevScreen: 'start',
  cachedDb: []
};

// DOM элементы
const screens = {
  start:       document.getElementById('screen-start'),
  game:        document.getElementById('screen-game'),
  result:      document.getElementById('screen-result'),
  leaderboard: document.getElementById('screen-leaderboard')
};

const playerNickInput  = document.getElementById('player-nick');
const userTip          = document.getElementById('user-tip');
const btnStart         = document.getElementById('btn-start');

const hudLevel         = document.getElementById('hud-level');
const hudLives         = document.getElementById('hud-lives');
const hudPhase         = document.getElementById('hud-phase');
const timerBar         = document.getElementById('timer-bar');
const gameGrid         = document.getElementById('game-grid');
const gameHint         = document.getElementById('game-hint');
const btnReadyNow      = document.getElementById('btn-ready-now');

const resPilotName     = document.getElementById('res-pilot-name');
const resRankTitle     = document.getElementById('result-rank-title');
const resScore         = document.getElementById('res-score');
const resClickSpeed    = document.getElementById('res-click-speed');
const resTime          = document.getElementById('res-time');
const playerDuelBar    = document.getElementById('player-duel-bar');
const playerDuelSpeed  = document.getElementById('player-duel-speed');
const duelVerdict      = document.getElementById('duel-verdict');
const recordAlert      = document.getElementById('record-notification');

const btnAgain         = document.getElementById('btn-again');
const btnOpenLb        = document.getElementById('btn-open-lb');
const btnShowLb        = document.getElementById('btn-show-lb');
const btnLbBack        = document.getElementById('btn-lb-back');
const btnLbClear       = document.getElementById('btn-lb-clear');
const lbBody           = document.getElementById('lb-body');
const lbEmpty          = document.getElementById('lb-empty');

const btnSound         = document.getElementById('btn-sound');
const btnHelp          = document.getElementById('btn-help');
const btnHelpClose     = document.getElementById('btn-help-close');
const modalHelp        = document.getElementById('modal-help');

// Аудиосинтезатор (Web Audio API)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTileTone(stepIndex) {
  if (!state.soundEnabled) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const freq = 320 * Math.pow(1.08, stepIndex);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.12);
}

function playMistakeSound() {
  if (!state.soundEnabled) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.28);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.28);
}

function playVictoryJingle() {
  if (!state.soundEnabled) return;
  [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
    setTimeout(() => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(f, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    }, i * 85);
  });
}

function showScreen(name) {
  Object.values(screens).forEach(s => {
    if (s) s.classList.remove('active');
  });
  if (screens[name]) screens[name].classList.add('active');
}

// ── Безопасный парсинг сущностей лидерборда ───────────────
function getItemNick(item) {
  if (!item) return '';
  return String(item.handle || item.name || item.nick || '').trim();
}

function getItemScore(item) {
  if (!item) return 0;
  return Number(item.score ?? item.cpm ?? 0);
}

function getItemSpeed(item) {
  if (!item) return 999;
  return Number(item.clickSpeed ?? 999);
}

// Извлечение корня никнейма без суффиксов
function getBaseNick(rawNick) {
  if (!rawNick || typeof rawNick !== 'string') return '';
  const cleaned = rawNick.trim().replace(/(_\d+)+$/i, '').trim();
  return cleaned || rawNick.trim();
}

// Поиск следующего свободного имени вида nick_2, nick_3 без повторов
function getNextAvailableNick(rawNick, existingList) {
  const base = getBaseNick(rawNick);
  const escapeBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapeBase}(_(\\d+))?$`, 'i');

  let maxNum = 1;
  let baseFound = false;

  existingList.forEach(item => {
    const nick = getItemNick(item);
    const match = nick.match(regex);
    if (match) {
      if (!match[2]) {
        baseFound = true;
      } else {
        const num = parseInt(match[2], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  });

  if (!baseFound && maxNum === 1) {
    return base;
  }
  return `${base}_${maxNum + 1}`;
}

// ── Работа с бэкендом и локальным кэшем ──────────────────
async function fetchLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) throw new Error('API unavailable');
    const text = await res.text();
    const data = text && text.trim() ? JSON.parse(text) : [];
    if (Array.isArray(data)) {
      state.cachedDb = data;
      localStorage.setItem('ayumu_leaderboard_stable', JSON.stringify(data));
    }
  } catch {
    state.cachedDb = JSON.parse(localStorage.getItem('ayumu_leaderboard_stable') || '[]');
  }
  return state.cachedDb;
}

async function commitLeaderboard(data) {
  state.cachedDb = data;
  const payload = data.slice(0, 200);
  localStorage.setItem('ayumu_leaderboard_stable', JSON.stringify(payload));
  try {
    await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('Сервер недоступен, результат сохранен локально:', e);
  }
}

// Проверка уникальности никнейма с кликабельной подсказкой
async function checkUserStatus() {
  if (!playerNickInput || !userTip) return false;
  const raw = playerNickInput.value.trim();
  if (!raw) {
    userTip.className = 'user-status-tip';
    userTip.textContent = 'Укажи ник или @ник_в_тг для участия в турнире';
    return false;
  }

  await fetchLeaderboard();
  const lower = raw.toLowerCase();
  const existing = state.cachedDb.find(e => getItemNick(e).toLowerCase() === lower);

  if (existing) {
    const bestScore = getItemScore(existing);
    const nextAvailable = getNextAvailableNick(raw, state.cachedDb);

    userTip.className = 'user-status-tip error';
    userTip.innerHTML = `Занят (${bestScore} цифр). Жми для выбора: <b id="suggested-nick-btn" style="cursor:pointer; text-decoration:underline; color:var(--gold); padding:2px 6px; background:rgba(250,204,21,0.15); border-radius:6px;">${nextAvailable}</b>`;

    const suggestBtn = document.getElementById('suggested-nick-btn');
    if (suggestBtn) {
      suggestBtn.onclick = () => {
        playerNickInput.value = nextAvailable;
        checkUserStatus();
        playerNickInput.focus();
      };
    }
    return false;
  } else {
    userTip.className = 'user-status-tip new-user';
    userTip.textContent = 'Никнейм свободен! Можно начинать тест.';
    return true;
  }
}

if (playerNickInput) {
  playerNickInput.addEventListener('input', checkUserStatus);
  playerNickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && btnStart) btnStart.click();
  });
}

if (btnStart) {
  btnStart.addEventListener('click', async () => {
    const nick = playerNickInput.value.trim();
    if (!nick) {
      playerNickInput.focus();
      if (userTip) {
        userTip.className = 'user-status-tip error';
        userTip.textContent = 'Введи никнейм для участия!';
      }
      return;
    }

    const isAvailable = await checkUserStatus();
    if (!isAvailable) {
      playerNickInput.focus();
      return;
    }

    state.playerNick = nick;
    startFullGame();
  });
}

function startFullGame() {
  state.level = 4;
  state.maxCleared = 0;
  state.lives = MAX_LIVES;
  state.totalClickTime = 0;
  state.totalCorrectClicks = 0;
  showScreen('game');
  startRound();
}

function updateHUD() {
  if (hudLevel) hudLevel.textContent = `${state.level} цифр`;
  if (hudLives) hudLives.textContent = '❤️'.repeat(state.lives) + '🖤'.repeat(MAX_LIVES - state.lives);
}

function getMemorizeTimeSeconds(level) {
  // Градация от 3.0 до 7.0 секунд по мере роста количества цифр
  switch (level) {
    case 4:  return 3.0; // Стартовый уровень: 4 цифры
    case 5:  return 3.5;
    case 6:  return 4.2;
    case 7:  return 5.0;
    case 8:  return 5.8;
    case 9:  return 6.4; // Уровень эталона Аюму
    default: return 7.0; // 10 и более цифр (максимум)
  }
}

function startRound() {
  state.expectedNext = 1;
  state.cellsMap = {};
  state.isRoundRunning = true;
  state.phase = 'memorize';

  updateHUD();
  if (hudPhase) {
    hudPhase.className = 'hud-val gold';
    hudPhase.textContent = 'Запоминай';
  }
  if (gameHint) gameHint.textContent = `Запомни позиции ${state.level} цифр на сетке!`;
  if (btnReadyNow) btnReadyNow.disabled = false;

  if (state.memorizeTimeout) clearTimeout(state.memorizeTimeout);

  const indexes = Array.from({ length: GRID_SIZE }, (_, i) => i);
  for (let i = indexes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }

  const selectedSlots = indexes.slice(0, state.level);
  selectedSlots.forEach((slot, idx) => {
    state.cellsMap[slot] = idx + 1;
  });

  renderGrid('memorize');

  const memDuration = getMemorizeTimeSeconds(state.level);
  if (timerBar) {
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';

    requestAnimationFrame(() => {
      timerBar.style.transition = `width ${memDuration}s linear`;
      timerBar.style.width = '0%';
    });
  }

  state.memorizeTimeout = setTimeout(() => {
    switchToRecallPhase();
  }, memDuration * 1000);
}

function renderGrid(phase) {
  if (!gameGrid) return;
  gameGrid.innerHTML = '';
  for (let i = 0; i < GRID_SIZE; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;

    const num = state.cellsMap[i];

    if (phase === 'memorize') {
      if (num !== undefined) {
        cell.classList.add('memorize-target');
        cell.textContent = num;
      }
    } else if (phase === 'recall') {
      cell.classList.add('hidden-tile');
      cell.textContent = '';
    }

    cell.addEventListener('pointerdown', () => handleCellClick(i));
    gameGrid.appendChild(cell);
  }
}

function switchToRecallPhase() {
  if (state.phase !== 'memorize') return;

  clearTimeout(state.memorizeTimeout);
  state.phase = 'recall';
  if (btnReadyNow) btnReadyNow.disabled = true;

  if (timerBar) {
    timerBar.style.transition = 'none';
    timerBar.style.width = '0%';
  }

  if (hudPhase) {
    hudPhase.className = 'hud-val green';
    hudPhase.textContent = 'Кликай!';
  }
  if (gameHint) gameHint.textContent = 'Жми по порядку: 1 ➔ 2 ➔ 3... Пустые клетки ошибочны!';

  renderGrid('recall');
  state.recallStartTime = performance.now();
}

if (btnReadyNow) {
  btnReadyNow.addEventListener('click', () => {
    if (state.phase === 'memorize') switchToRecallPhase();
  });
}

function handleCellClick(index) {
  if (!state.isRoundRunning) return;

  if (state.phase === 'memorize') {
    switchToRecallPhase();
    return;
  }

  const clickedNumber = state.cellsMap[index];
  const cellEl = gameGrid.querySelector(`[data-index="${index}"]`);

  if (clickedNumber === state.expectedNext) {
    playTileTone(clickedNumber);
    if (cellEl) {
      cellEl.className = 'cell solved';
      cellEl.textContent = clickedNumber;
    }

    state.expectedNext++;
    state.totalCorrectClicks++;

    if (state.expectedNext > state.level) {
      state.isRoundRunning = false;
      const duration = (performance.now() - state.recallStartTime) / 1000;
      state.totalClickTime += duration;

      state.maxCleared = Math.max(state.maxCleared, state.level);
      state.level++;

      playVictoryJingle();
      if (gameHint) gameHint.textContent = `🎉 Уровень ${state.maxCleared} пройден за ${duration.toFixed(1)}с!`;

      setTimeout(() => {
        startRound();
      }, 1000);
    }
  } else {
    state.isRoundRunning = false;
    playMistakeSound();
    state.lives--;
    updateHUD();

    if (cellEl) {
      cellEl.className = 'cell mistake';
      if (clickedNumber !== undefined) cellEl.textContent = clickedNumber;
    }

    document.querySelectorAll('.cell').forEach(c => {
      const idx = parseInt(c.dataset.index);
      const val = state.cellsMap[idx];
      if (val !== undefined && idx !== index) {
        c.className = 'cell revealed-hint';
        c.textContent = val;
      }
    });

    if (state.lives > 0) {
      if (gameHint) gameHint.textContent = `❌ Ошибка! Осталось жизней: ${state.lives}. Повтор уровня...`;
      setTimeout(() => {
        startRound();
      }, 2000);
    } else {
      if (gameHint) gameHint.textContent = '💀 Все жизни израсходованы! Подведение итогов...';
      setTimeout(() => {
        finishGame();
      }, 2000);
    }
  }
}

async function finishGame() {
  const finalScore = state.maxCleared;
  const finalRecallTime = parseFloat(state.totalClickTime.toFixed(1));

  const avgClickMs = state.totalCorrectClicks > 0
    ? Math.round((state.totalClickTime * 1000) / state.totalCorrectClicks)
    : 999;

  if (resPilotName) resPilotName.textContent = state.playerNick;
  if (resScore) resScore.textContent = `${finalScore} цифр`;
  if (resClickSpeed) resClickSpeed.textContent = `${avgClickMs} мс/клик`;
  if (resTime) resTime.textContent = `${finalRecallTime} сек`;

  if (playerDuelSpeed) playerDuelSpeed.textContent = `${avgClickMs} мс/клик`;
  const duelPct = Math.max(10, Math.min(100, Math.round((CHIMP_CLICK_SPEED_MS / avgClickMs) * 100)));
  if (playerDuelBar) playerDuelBar.style.width = `${duelPct}%`;

  const speedRatio = (avgClickMs / CHIMP_CLICK_SPEED_MS).toFixed(1);
  if (duelVerdict) {
    if (avgClickMs <= CHIMP_CLICK_SPEED_MS && finalScore >= 9) {
      duelVerdict.innerHTML = `🔥 <span style="color:var(--cyan)">НЕВЕРОЯТНО!</span> Ты быстрее шимпанзе Аюму на <b>${CHIMP_CLICK_SPEED_MS - avgClickMs} мс</b>!`;
    } else {
      duelVerdict.innerHTML = `🍌 Шимпанзе Аюму был быстрее тебя в <b style="color:var(--gold)">${speedRatio} раза</b>! Отличная попытка.`;
    }
  }

  // ── Append-Only: каждый заезд — отдельная уникальная строка ─────────
  const list = await fetchLeaderboard();
  const newEntry = {
    handle: state.playerNick.trim(),
    score: finalScore,
    clickSpeed: avgClickMs,
    time: finalRecallTime,
    speedRatio: speedRatio,
    date: new Date().toLocaleDateString('ru-RU')
  };

  list.push(newEntry);
  list.sort((a, b) => {
    const scoreDiff = getItemScore(b) - getItemScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return getItemSpeed(a) - getItemSpeed(b);
  });
  await commitLeaderboard(list);

  if (recordAlert) {
    recordAlert.className = 'record-alert new-record';
    recordAlert.textContent = '🎉 Твой результат зафиксирован в общем рейтинге!';
  }

  const finalRank = list.indexOf(newEntry) + 1;
  const totalCount = list.length;

  if (resRankTitle) {
    resRankTitle.className = 'rank-title';
    if (finalRank === 1) {
      resRankTitle.classList.add('rank-1');
      resRankTitle.textContent = `🥇 1-е место из ${totalCount} участников!`;
    } else if (finalRank === 2) {
      resRankTitle.classList.add('rank-2');
      resRankTitle.textContent = `🥈 2-е место из ${totalCount} участников!`;
    } else if (finalRank === 3) {
      resRankTitle.classList.add('rank-3');
      resRankTitle.textContent = `🥉 3-е место из ${totalCount} участников!`;
    } else {
      resRankTitle.classList.add('rank-general');
      resRankTitle.textContent = `🏁 ${finalRank}-е место из ${totalCount} участников`;
    }
  }

  showScreen('result');
}

function rankSymbol(i) { return ['🥇', '🥈', '🥉'][i] ?? (i + 1); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function renderLeaderboard() {
  if (!lbBody) return;
  lbBody.innerHTML = '<tr><td colspan="6" style="color:var(--muted);padding:24px">Загрузка данных…</td></tr>';
  if (lbEmpty) lbEmpty.classList.add('hidden');
  const rows = await fetchLeaderboard();

  if (!rows || rows.length === 0) {
    lbBody.innerHTML = '';
    if (lbEmpty) lbEmpty.classList.remove('hidden');
    return;
  }
  if (lbEmpty) lbEmpty.classList.add('hidden');

  lbBody.innerHTML = rows.map((item, i) => {
    const nick = getItemNick(item);
    const score = getItemScore(item);
    const speed = getItemSpeed(item);
    const date = item.date || '—';

    return `
      <tr class="${i < 3 ? 'rank-' + (i + 1) : ''}">
        <td>${rankSymbol(i)}</td>
        <td><b>${esc(nick)}</b></td>
        <td><span class="lb-score">${score} цифр</span></td>
        <td>${speed} мс</td>
        <td style="color:${speed <= CHIMP_CLICK_SPEED_MS ? 'var(--cyan)' : 'var(--gold)'}">
          ${speed <= CHIMP_CLICK_SPEED_MS ? 'Быстрее 🐵' : 'x' + (item.speedRatio || (speed / CHIMP_CLICK_SPEED_MS).toFixed(1)) + ' медленнее'}
        </td>
        <td style="font-size:0.85rem;color:var(--muted)">${date}</td>
      </tr>
    `;
  }).join('');
}

async function openLeaderboard(from) {
  state.prevScreen = from;
  showScreen('leaderboard');
  await renderLeaderboard();
}

if (btnAgain) {
  btnAgain.addEventListener('click', () => {
    if (playerNickInput) playerNickInput.value = '';
    checkUserStatus();
    showScreen('start');
  });
}

if (btnOpenLb) btnOpenLb.addEventListener('click', () => openLeaderboard('start'));
if (btnShowLb) btnShowLb.addEventListener('click', () => openLeaderboard('result'));
if (btnLbBack) btnLbBack.addEventListener('click', () => showScreen(state.prevScreen));

if (btnLbClear) {
  btnLbClear.addEventListener('click', async () => {
    if (!confirm('Внимание! Это очистит все результаты участников. Продолжить?')) return;
    await commitLeaderboard([]);
    localStorage.removeItem('ayumu_leaderboard_stable');
    renderLeaderboard();
  });
}

if (btnSound) {
  btnSound.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    btnSound.textContent = state.soundEnabled ? '🔊' : '🔇';
  });
}

if (btnHelp && modalHelp) {
  btnHelp.addEventListener('click', () => modalHelp.classList.remove('hidden'));
}
if (btnHelpClose && modalHelp) {
  btnHelpClose.addEventListener('click', () => modalHelp.classList.add('hidden'));
}
if (modalHelp) {
  modalHelp.addEventListener('click', (e) => {
    if (e.target === modalHelp) modalHelp.classList.add('hidden');
  });
}

// Первоначальная загрузка
fetchLeaderboard();