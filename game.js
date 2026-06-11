/* ════════════════════════════════════════
   Sudoku — game.js (fixed & improved)
   ════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────────────────
let sol = [];        // solution grid (81 numbers)
let puz = [];        // puzzle grid   (0 = empty)
let grid = [];       // current user grid
let notes = [];      // notes[i] = Set of pencil numbers for cell i
let history = [];    // undo stack: [{grid, notes}]
let sel = null;      // selected cell index
let mistakes = 0;
let diff = 'easy';
let tInt = null;     // timer interval
let secs = 0;
let gameOver = false;   // true when won OR lost  (FIX: was misusing `won`)
let won = false;        // true only when actually won
let paused = false;
let noteMode = false;
let hints = 3;
const MAX_ERR = 5;

// ── Solver helpers ──────────────────────────────────────────────────────────
function candidatesFor(g, i) {
  const r = Math.floor(i / 9), c = i % 9;
  const used = new Set();
  for (let x = 0; x < 9; x++) { used.add(g[r * 9 + x]); used.add(g[x * 9 + c]); }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) used.add(g[(br + x) * 9 + bc + y]);
  const out = [];
  for (let n = 1; n <= 9; n++) if (!used.has(n)) out.push(n);
  return out;
}

function solve(g) {
  for (let i = 0; i < 81; i++) {
    if (g[i] === 0) {
      const cands = candidatesFor(g, i).sort(() => Math.random() - 0.5);
      for (const n of cands) { g[i] = n; if (solve(g)) return true; g[i] = 0; }
      return false;
    }
  }
  return true;
}

// FIX: solution counter (early exit at `limit`) so puzzles are guaranteed unique
function countSolutions(g, limit = 2) {
  let best = -1, bestCands = null;
  for (let i = 0; i < 81; i++) {
    if (g[i] === 0) {
      const cands = candidatesFor(g, i);
      if (cands.length === 0) return 0;
      if (best === -1 || cands.length < bestCands.length) {
        best = i; bestCands = cands;
        if (cands.length === 1) break;
      }
    }
  }
  if (best === -1) return 1; // solved
  let total = 0;
  for (const n of bestCands) {
    g[best] = n;
    total += countSolutions(g, limit - total);
    g[best] = 0;
    if (total >= limit) break;
  }
  return total;
}

// ── Puzzle generation ───────────────────────────────────────────────────────
// FIX: only remove a cell if the puzzle still has exactly ONE solution.
function generate() {
  const g = new Array(81).fill(0);
  solve(g);
  const s = [...g];
  const target = { easy: 36, medium: 47, hard: 54 }[diff];
  const order = [...Array(81).keys()].sort(() => Math.random() - 0.5);
  let removed = 0;
  for (const i of order) {
    if (removed >= target) break;
    const backup = g[i];
    g[i] = 0;
    if (countSolutions([...g], 2) !== 1) {
      g[i] = backup;            // removing this cell breaks uniqueness → keep it
    } else {
      removed++;
    }
  }
  return { s, g };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function completedNums() {
  const cnt = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) if (grid[i] && grid[i] === sol[i]) cnt[grid[i]]++;
  const done = new Set();
  for (let n = 1; n <= 9; n++) if (cnt[n] === 9) done.add(n);
  return done;
}

function remainingOf(n) {
  let correct = 0;
  for (let i = 0; i < 81; i++) if (grid[i] === n && grid[i] === sol[i]) correct++;
  return 9 - correct;
}

// FIX: a user cell that already matches the solution is "locked"
function isLocked(i) {
  return puz[i] !== 0 || (grid[i] !== 0 && grid[i] === sol[i]);
}

function saveHistory() {
  history.push({ grid: [...grid], notes: notes.map(s => new Set(s)) });
  if (history.length > 200) history.shift();
}

function fmtTime(totalSecs) {
  const m = Math.floor(totalSecs / 60), s = totalSecs % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

// QoL: after placing n correctly, erase pencil-note n from its row/col/box
function clearPeerNotes(idx, n) {
  const r = Math.floor(idx / 9), c = idx % 9;
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let x = 0; x < 9; x++) {
    notes[r * 9 + x].delete(n);
    notes[x * 9 + c].delete(n);
  }
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) notes[(br + x) * 9 + bc + y].delete(n);
}

// ── Effects ──────────────────────────────────────────────────────────────────
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function launchConfetti() {
  if (reducedMotion) return;
  const colors = ['#185FA5', '#0F6E56', '#E0A526', '#C2542F', '#7B5CC6', '#3FA0D8'];
  const wrap = document.createElement('div');
  wrap.className = 'confetti-wrap';
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('span');
    p.className = 'confetti';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = (Math.random() * 0.7) + 's';
    p.style.animationDuration = (2.2 + Math.random() * 1.6) + 's';
    p.style.setProperty('--drift', (Math.random() * 160 - 80) + 'px');
    p.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
    if (Math.random() < 0.4) p.style.borderRadius = '50%';
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4800);
}

function winWave() {
  if (reducedMotion) return;
  document.querySelectorAll('.cell').forEach((cell, i) => {
    const r = Math.floor(i / 9), c = i % 9;
    cell.style.animationDelay = ((r + c) * 40) + 'ms';
    cell.classList.add('win-wave');
  });
}

function shakeBoard() {
  if (reducedMotion) return;
  const b = document.querySelector('.board-grid');
  b.classList.remove('shake');
  void b.offsetWidth; // restart animation
  b.classList.add('shake');
}

// ── End-game modal ────────────────────────────────────────────────────────────
function showEndModal(type) {
  const existing = document.getElementById('endgame-modal');
  if (existing) existing.remove();

  const hintsUsed = 3 - hints;
  const timeStr = fmtTime(secs);
  const filled = grid.filter(v => v !== 0).length;
  const pct = Math.round(filled / 81 * 100);
  const isWin = type === 'win';

  let stars = '';
  if (isWin) {
    const starCount = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    stars = '⭐'.repeat(starCount) + '✩'.repeat(3 - starCount);
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'endgame-backdrop';
  backdrop.id = 'endgame-modal';

  backdrop.innerHTML = `
    <div class="endgame-card">
      <div class="endgame-top">
        <div class="endgame-icon-wrap ${isWin ? 'win' : 'lose'}">
          <i class="ti ${isWin ? 'ti-trophy' : 'ti-heart-off'}" aria-hidden="true"></i>
        </div>
        <div class="endgame-stars">${stars}</div>
        <p class="endgame-title ${isWin ? 'win' : 'lose'}">${isWin ? 'สำเร็จแล้ว! 🎉' : 'หมดชีวิต!'}</p>
        <p class="endgame-sub">${isWin ? 'ยอดเยี่ยม! แก้โจทย์ได้เรียบร้อย' : 'ผิดพลาดเกินไป — ลองอีกครั้งนะ'}</p>
        <div class="endgame-stats">
          <div class="endgame-stat">
            <div class="endgame-stat-val">${timeStr}</div>
            <div class="endgame-stat-lbl">เวลา</div>
          </div>
          <div class="endgame-stat">
            <div class="endgame-stat-val">${mistakes}</div>
            <div class="endgame-stat-lbl">ผิดพลาด</div>
          </div>
          <div class="endgame-stat">
            ${isWin
              ? `<div class="endgame-stat-val">${hintsUsed}</div><div class="endgame-stat-lbl">คำใบ้ใช้</div>`
              : `<div class="endgame-stat-val">${pct}%</div><div class="endgame-stat-lbl">กรอกแล้ว</div>`
            }
          </div>
        </div>
        <button class="endgame-main-btn ${isWin ? 'win' : 'lose'}" onclick="closeModalAnd(newGame)">
          <i class="ti ti-refresh" aria-hidden="true"></i>
          ${isWin ? 'เล่นอีกครั้ง' : 'ลองอีกครั้ง'}
        </button>
      </div>
      <hr class="endgame-divider">
      <div class="endgame-bottom">
        ${isWin
          ? `<button class="endgame-sec-btn" onclick="closeModalAnd(() => setDiff({easy:'medium',medium:'hard',hard:'hard'}[diff]))">
               <i class="ti ti-arrow-up" aria-hidden="true"></i> ยากขึ้น
             </button>`
          : `<button class="endgame-sec-btn" onclick="closeModalAnd(revealSolution)">
               <i class="ti ti-eye" aria-hidden="true"></i> ดูเฉลย
             </button>`
        }
        <button class="endgame-sec-btn" onclick="closeModalAnd(() => setDiff(diff))">
          <i class="ti ti-layout-grid" aria-hidden="true"></i> ระดับเดิม
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
}

function closeModalAnd(fn) {
  const m = document.getElementById('endgame-modal');
  if (m) m.remove();
  fn();
}

function revealSolution() {
  for (let i = 0; i < 81; i++) grid[i] = sol[i];
  notes = Array.from({ length: 81 }, () => new Set());
  sel = null;
  renderAll();
  document.getElementById('footer').innerHTML = '<span class="dead-msg">เฉลยทั้งหมด — กด ↻ เพื่อเริ่มเกมใหม่</span>';
}

// ── New game ─────────────────────────────────────────────────────────────────
function newGame() {
  clearInterval(tInt);
  secs = 0; mistakes = 0; won = false; gameOver = false; paused = false;
  noteMode = false; hints = 3; history = [];

  document.getElementById('timer').textContent = '00:00';
  document.getElementById('footer').innerHTML = '';
  document.getElementById('overlay').classList.add('hidden');

  const pb = document.getElementById('pause-btn');
  pb.classList.remove('on');
  document.getElementById('pause-lbl').textContent = 'หยุด';
  pb.querySelector('i').className = 'ti ti-player-pause';
  document.getElementById('note-btn').classList.remove('active-mode');
  document.getElementById('hint-ct').textContent = '(3)';

  const r = generate();
  sol = r.s; puz = r.g; grid = [...r.g];
  notes = Array.from({ length: 81 }, () => new Set());

  // FIX: pre-select the first empty cell so keyboard works immediately
  sel = puz.indexOf(0);
  if (sel === -1) sel = null;

  renderAll();

  tInt = setInterval(() => {
    if (gameOver || paused) return;
    secs++;
    document.getElementById('timer').textContent = fmtTime(secs);
  }, 1000);
}

// ── Difficulty ───────────────────────────────────────────────────────────────
// FIX: match buttons by data-diff attribute, not by Thai label text
function setDiff(d) {
  document.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', b.dataset.diff === d));
  diff = d;
  newGame();
}

// ── Render all ───────────────────────────────────────────────────────────────
function renderAll() {
  renderBoard();
  renderNumpad();
  renderHearts();
  renderProgress();
}

// ── Hearts ───────────────────────────────────────────────────────────────────
let lastMistakes = 0;
function renderHearts() {
  const h = document.getElementById('hearts');
  h.innerHTML = '';
  for (let i = 0; i < MAX_ERR; i++) {
    const s = document.createElement('span');
    s.className = 'ht';
    s.textContent = i < mistakes ? '🖤' : '❤️';
    // Effect: pop the heart that was just lost
    if (i === mistakes - 1 && mistakes > lastMistakes) s.classList.add('ht-lost');
    h.appendChild(s);
  }
  lastMistakes = mistakes;
}

// ── Progress bar ─────────────────────────────────────────────────────────────
function renderProgress() {
  const givenFilled = puz.filter(v => v !== 0).length;
  const userCorrect = grid.filter((v, i) => puz[i] === 0 && v !== 0 && v === sol[i]).length;
  const filled = givenFilled + userCorrect;
  document.getElementById('prog-fill').style.width = (filled / 81 * 100).toFixed(1) + '%';
  document.getElementById('prog-lbl').textContent = filled + ' / 81';
}

// ── Board ────────────────────────────────────────────────────────────────────
let pendingPop = null; // { idx, cls }

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  const done = completedNums();

  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9), c = i % 9;
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.addEventListener('click', () => {
      if (paused || gameOver) return;
      sel = i;
      renderBoard();
    });

    // FIX: while paused render an empty board — no peeking through the blur
    if (paused) { board.appendChild(cell); continue; }

    if (puz[i] !== 0) {
      cell.classList.add('given');
      const span = document.createElement('span');
      span.className = 'cell-big';
      span.textContent = puz[i];
      cell.appendChild(span);
    } else {
      cell.classList.add('user');
      if (grid[i] !== 0 && grid[i] !== sol[i]) cell.classList.add('error');
      if (grid[i] !== 0 && grid[i] === sol[i]) cell.classList.add('locked');

      if (grid[i] !== 0) {
        const span = document.createElement('span');
        span.className = 'cell-big';
        span.textContent = grid[i];
        if (pendingPop && pendingPop.idx === i) cell.classList.add(pendingPop.cls);
        cell.appendChild(span);
      } else if (notes[i].size > 0) {
        const ng = document.createElement('div');
        ng.className = 'cell-notes';
        for (let n = 1; n <= 9; n++) {
          const ns = document.createElement('span');
          ns.className = 'note-num';
          ns.textContent = notes[i].has(n) ? n : '';
          ng.appendChild(ns);
        }
        cell.appendChild(ng);
      }
    }

    // Highlighting
    if (sel === i) {
      cell.classList.add('selected');
    } else if (sel !== null) {
      const sr = Math.floor(sel / 9), sc2 = sel % 9;
      const sameBox = Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc2 / 3);
      if (r === sr || c === sc2 || sameBox) cell.classList.add('highlight');
      if (grid[sel] !== 0 && grid[i] === grid[sel]) cell.classList.add('same-num');
    }

    board.appendChild(cell);
  }

  pendingPop = null;

  const badge = document.getElementById('mode-badge');
  badge.textContent = noteMode ? 'โหมดโน้ต' : 'กรอกตัวเลข';
  badge.className = 'mode-badge' + (noteMode ? ' note-on' : '');
}

// ── Numpad ────────────────────────────────────────────────────────────────────
function renderNumpad() {
  const np = document.getElementById('numpad');
  np.innerHTML = '';
  const done = completedNums();

  for (let n = 1; n <= 9; n++) {
    const b = document.createElement('button');
    b.className = 'np-btn';
    if (done.has(n)) {
      b.innerHTML = `<span class="np-num">${n}</span><span class="np-check"><i class="ti ti-check" style="font-size:10px"></i></span>`;
      b.disabled = true;
    } else {
      // QoL: show how many of this digit are left to place
      b.innerHTML = `<span class="np-num">${n}</span><span class="np-left">${remainingOf(n)}</span>`;
      b.onclick = () => enterNum(n);
    }
    np.appendChild(b);
  }

  const e = document.createElement('button');
  e.className = 'np-btn';
  e.setAttribute('aria-label', 'ลบ');
  e.innerHTML = '<i class="ti ti-backspace" style="font-size:16px" aria-hidden="true"></i>';
  e.onclick = () => doErase();
  np.appendChild(e);
}

// ── Enter number ─────────────────────────────────────────────────────────────
function enterNum(n) {
  if (gameOver || paused || sel === null) return;
  if (isLocked(sel)) return;                 // FIX: can't overwrite correct cells

  if (noteMode) {
    if (grid[sel] !== 0) return;             // FIX: no notes on filled cells
    saveHistory();
    notes[sel].has(n) ? notes[sel].delete(n) : notes[sel].add(n);
    renderAll();
    return;
  }

  if (completedNums().has(n)) return;
  if (grid[sel] === n) return;               // FIX: same value again = no-op, no double mistake

  saveHistory();
  grid[sel] = n;
  notes[sel].clear();

  if (n !== sol[sel]) {
    mistakes++;
    pendingPop = { idx: sel, cls: 'err-flash' };
    shakeBoard();
    renderHearts();
  } else {
    pendingPop = { idx: sel, cls: 'just-placed' };
    clearPeerNotes(sel, n);                  // QoL: clean stale notes in peers
  }

  if (mistakes >= MAX_ERR) {
    gameOver = true;
    clearInterval(tInt);
    renderAll();
    setTimeout(() => showEndModal('lose'), 450);
    return;
  }

  if (grid.every((v, i) => v === sol[i])) {
    won = true; gameOver = true;
    clearInterval(tInt);
    sel = null;
    renderAll();
    winWave();
    launchConfetti();
    setTimeout(() => showEndModal('win'), 900);
    return;
  }

  renderAll();
}

// ── Erase ────────────────────────────────────────────────────────────────────
function doErase() {
  if (gameOver || paused || sel === null || isLocked(sel)) return;
  if (grid[sel] === 0 && notes[sel].size === 0) return; // nothing to erase
  saveHistory();
  grid[sel] = 0;
  notes[sel].clear();
  renderAll();
}

// ── Undo ─────────────────────────────────────────────────────────────────────
function doUndo() {
  if (!history.length || gameOver || paused) return;
  const prev = history.pop();
  grid = prev.grid;
  notes = prev.notes;
  renderAll();
}

// ── Hint ─────────────────────────────────────────────────────────────────────
function doHint() {
  if (gameOver || paused || hints <= 0) return;

  // FIX: prefer the selected empty cell, fall back to random
  let idx = null;
  if (sel !== null && puz[sel] === 0 && grid[sel] !== sol[sel]) {
    idx = sel;
  } else {
    const empties = [];
    for (let i = 0; i < 81; i++) if (puz[i] === 0 && grid[i] !== sol[i]) empties.push(i);
    if (!empties.length) return;
    idx = empties[Math.floor(Math.random() * empties.length)];
  }

  saveHistory();
  grid[idx] = sol[idx];
  notes[idx].clear();
  clearPeerNotes(idx, sol[idx]);
  hints--;
  document.getElementById('hint-ct').textContent = '(' + hints + ')';

  sel = idx;
  pendingPop = { idx, cls: 'hint-placed' };

  // Hint can complete the board too (FIX: previously unreachable win via hint)
  if (grid.every((v, i) => v === sol[i])) {
    won = true; gameOver = true;
    clearInterval(tInt);
    sel = null;
    renderAll();
    winWave();
    launchConfetti();
    setTimeout(() => showEndModal('win'), 900);
    return;
  }

  renderAll();
}

// ── Note mode ─────────────────────────────────────────────────────────────────
function toggleNote() {
  if (gameOver || paused) return;
  noteMode = !noteMode;
  document.getElementById('note-btn').classList.toggle('active-mode', noteMode);
  renderBoard();
}

// ── Pause ─────────────────────────────────────────────────────────────────────
function togglePause() {
  if (gameOver) return;
  paused = !paused;
  const pb  = document.getElementById('pause-btn');
  const ov  = document.getElementById('overlay');
  const lbl = document.getElementById('pause-lbl');
  const ic  = pb.querySelector('i');
  if (paused) {
    ov.classList.remove('hidden');
    lbl.textContent = 'ดำเนินต่อ';
    ic.className = 'ti ti-player-play';
    pb.classList.add('on');
  } else {
    ov.classList.add('hidden');
    lbl.textContent = 'หยุด';
    ic.className = 'ti ti-player-pause';
    pb.classList.remove('on');
  }
  renderBoard();
}

// FIX: auto-pause when the tab is hidden so the timer is fair
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !paused && !gameOver) togglePause();
});

// Clicking the pause overlay resumes the game
document.getElementById('overlay').addEventListener('click', () => { if (paused) togglePause(); });

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key.toLowerCase() === 'p') {
    e.preventDefault();
    togglePause();
    return;
  }
  if (gameOver || paused || sel === null) return;

  if (e.key >= '1' && e.key <= '9') { enterNum(parseInt(e.key)); return; }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { doErase(); return; }
  if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) { toggleNote(); return; }
  if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey) { doHint(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }

  const r = Math.floor(sel / 9), c = sel % 9;
  if (e.key === 'ArrowRight' && c < 8) { e.preventDefault(); sel++; renderBoard(); }
  if (e.key === 'ArrowLeft'  && c > 0) { e.preventDefault(); sel--; renderBoard(); }
  if (e.key === 'ArrowDown'  && r < 8) { e.preventDefault(); sel += 9; renderBoard(); }
  if (e.key === 'ArrowUp'    && r > 0) { e.preventDefault(); sel -= 9; renderBoard(); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
newGame();
