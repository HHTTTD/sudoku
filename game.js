/* ════════════════════════════════════════
   Sudoku — game.js
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
let won = false;
let paused = false;
let noteMode = false;
let hints = 3;
const MAX_ERR = 5;

// ── Solver ─────────────────────────────────────────────────────────────────
function solve(g) {
  for (let i = 0; i < 81; i++) {
    if (g[i] === 0) {
      const r = Math.floor(i / 9), c = i % 9;
      const used = new Set();
      for (let x = 0; x < 9; x++) { used.add(g[r * 9 + x]); used.add(g[x * 9 + c]); }
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) used.add(g[(br + x) * 9 + bc + y]);
      const candidates = [1,2,3,4,5,6,7,8,9].filter(n => !used.has(n)).sort(() => Math.random() - 0.5);
      for (const n of candidates) { g[i] = n; if (solve(g)) return true; g[i] = 0; }
      return false;
    }
  }
  return true;
}

// ── Puzzle generation ───────────────────────────────────────────────────────
function generate() {
  const g = new Array(81).fill(0);
  solve(g);
  const s = [...g];
  const removeCount = { easy: 36, medium: 49, hard: 57 }[diff];
  [...Array(81).keys()]
    .sort(() => Math.random() - 0.5)
    .slice(0, removeCount)
    .forEach(i => g[i] = 0);
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

function saveHistory() {
  history.push({ grid: [...grid], notes: notes.map(s => new Set(s)) });
}

function fmtTime(totalSecs) {
  const m = Math.floor(totalSecs / 60), s = totalSecs % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

// ── New game ─────────────────────────────────────────────────────────────────
function newGame() {
  clearInterval(tInt);
  secs = 0; mistakes = 0; won = false; paused = false;
  sel = null; noteMode = false; hints = 3; history = [];

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
  renderAll();

  tInt = setInterval(() => {
    if (won || paused) return;
    secs++;
    document.getElementById('timer').textContent = fmtTime(secs);
  }, 1000);
}

// ── Difficulty ───────────────────────────────────────────────────────────────
function setDiff(d) {
  const map = { easy: 'ง่าย', medium: 'กลาง', hard: 'ยาก' };
  document.querySelectorAll('.pill').forEach(b => b.classList.toggle('active', map[d] === b.textContent.trim()));
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
function renderHearts() {
  const h = document.getElementById('hearts');
  h.innerHTML = '';
  for (let i = 0; i < MAX_ERR; i++) {
    const s = document.createElement('span');
    s.className = 'ht';
    s.textContent = i < mistakes ? '🖤' : '❤️';
    h.appendChild(s);
  }
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
    cell.addEventListener('click', () => { if (paused || won) return; sel = i; renderBoard(); });

    if (puz[i] !== 0) {
      // Given cell
      cell.classList.add('given');
      const span = document.createElement('span');
      span.className = 'cell-big';
      span.textContent = puz[i];
      cell.appendChild(span);
    } else {
      // User cell
      cell.classList.add('user');
      if (grid[i] !== 0 && grid[i] !== sol[i]) cell.classList.add('error');

      if (grid[i] !== 0) {
        const span = document.createElement('span');
        span.className = 'cell-big';
        span.textContent = grid[i];
        if (pendingPop && pendingPop.idx === i) cell.classList.add(pendingPop.cls);
        cell.appendChild(span);
      } else if (notes[i].size > 0) {
        // Pencil notes
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
    if (!paused) {
      if (sel === i) {
        cell.classList.add('selected');
      } else if (sel !== null) {
        const sr = Math.floor(sel / 9), sc2 = sel % 9;
        const sameBox = Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(c / 3) === Math.floor(sc2 / 3);
        if (r === sr || c === sc2 || sameBox) cell.classList.add('highlight');
        if (grid[sel] !== 0 && grid[i] === grid[sel] && !done.has(grid[sel])) cell.classList.add('same-num');
      }
    }

    board.appendChild(cell);
  }

  pendingPop = null;

  // Mode badge
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
      b.innerHTML = `<span class="np-num">${n}</span>`;
      b.onclick = () => enterNum(n);
    }
    np.appendChild(b);
  }

  const e = document.createElement('button');
  e.className = 'np-btn';
  e.innerHTML = '<i class="ti ti-backspace" style="font-size:16px" aria-hidden="true"></i>';
  e.onclick = () => doErase();
  np.appendChild(e);
}

// ── Enter number ─────────────────────────────────────────────────────────────
function enterNum(n) {
  if (won || paused || sel === null || puz[sel] !== 0) return;

  if (noteMode) {
    saveHistory();
    notes[sel].has(n) ? notes[sel].delete(n) : notes[sel].add(n);
    renderAll();
    return;
  }

  const done = completedNums();
  if (done.has(n)) return;

  saveHistory();
  grid[sel] = n;
  notes[sel].clear();

  if (n !== sol[sel]) {
    mistakes++;
    renderHearts();
  } else {
    pendingPop = { idx: sel, cls: 'just-placed' };
  }

  if (mistakes >= MAX_ERR) {
    won = true;
    clearInterval(tInt);
    document.getElementById('footer').innerHTML = '<span class="dead-msg">💀 หมดชีวิต! กด ↻ เพื่อเล่นใหม่</span>';
    renderAll();
    return;
  }

  if (grid.every((v, i) => v === sol[i])) {
    won = true;
    clearInterval(tInt);
    document.getElementById('footer').innerHTML = '<span class="win-msg">🎉 เยี่ยมมาก! ทำสำเร็จแล้ว!</span>';
  }

  renderAll();
}

// ── Erase ────────────────────────────────────────────────────────────────────
function doErase() {
  if (won || paused || sel === null || puz[sel] !== 0) return;
  saveHistory();
  grid[sel] = 0;
  notes[sel].clear();
  renderAll();
}

// ── Undo ─────────────────────────────────────────────────────────────────────
function doUndo() {
  if (!history.length || won || paused) return;
  const prev = history.pop();
  grid = prev.grid;
  notes = prev.notes;
  renderAll();
}

// ── Hint ─────────────────────────────────────────────────────────────────────
function doHint() {
  if (won || paused || hints <= 0) return;
  const empties = [];
  for (let i = 0; i < 81; i++) if (puz[i] === 0 && grid[i] === 0) empties.push(i);
  if (!empties.length) return;

  saveHistory();
  const idx = empties[Math.floor(Math.random() * empties.length)];
  grid[idx] = sol[idx];
  notes[idx].clear();
  hints--;
  document.getElementById('hint-ct').textContent = '(' + hints + ')';

  sel = idx;
  pendingPop = { idx, cls: 'hint-placed' };
  renderAll();
}

// ── Note mode ─────────────────────────────────────────────────────────────────
function toggleNote() {
  noteMode = !noteMode;
  document.getElementById('note-btn').classList.toggle('active-mode', noteMode);
  renderBoard();
}

// ── Pause ─────────────────────────────────────────────────────────────────────
function togglePause() {
  if (won) return;
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
    sel = null;
  } else {
    ov.classList.add('hidden');
    lbl.textContent = 'หยุด';
    ic.className = 'ti ti-player-pause';
    pb.classList.remove('on');
  }
  renderBoard();
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (won || paused || sel === null) return;

  if (e.key >= '1' && e.key <= '9') { enterNum(parseInt(e.key)); return; }
  if (e.key === 'Backspace' || e.key === 'Delete') { doErase(); return; }
  if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) { toggleNote(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); return; }

  const r = Math.floor(sel / 9), c = sel % 9;
  if (e.key === 'ArrowRight' && c < 8) { sel++; renderBoard(); }
  if (e.key === 'ArrowLeft'  && c > 0) { sel--; renderBoard(); }
  if (e.key === 'ArrowDown'  && r < 8) { sel += 9; renderBoard(); }
  if (e.key === 'ArrowUp'    && r > 0) { sel -= 9; renderBoard(); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
newGame();
