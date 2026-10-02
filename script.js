const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const W = cv.width, H = cv.height;

const SORTS = {
  bubble:    { name: 'Bubble Sort',    gen: () => bubble(),    c: ['O(n)', 'O(n²)', 'O(n²)', 'O(1)'],
    info: 'Compares neighbouring roads and swaps them if out of order.', city: 'Like a traffic officer comparing two adjacent junctions at a time.' },
  selection: { name: 'Selection Sort', gen: () => selection(), c: ['O(n²)', 'O(n²)', 'O(n²)', 'O(1)'],
    info: 'Finds the lightest road in the unsorted part and moves it to the front.', city: 'Like picking the clearest road first, then the next clearest.' },
  insertion: { name: 'Insertion Sort', gen: () => insertion(), c: ['O(n)', 'O(n²)', 'O(n²)', 'O(1)'],
    info: 'Takes each road and inserts it into its place in the sorted part.', city: 'Good for live feeds where new road readings arrive one by one.' },
  merge:     { name: 'Merge Sort',     gen: () => msort(0, arr.length - 1), c: ['O(n log n)', 'O(n log n)', 'O(n log n)', 'O(n)'],
    info: 'Splits roads into halves, sorts each half, then merges them.', city: 'Like each zone ranking its own roads, then the city merging the lists.' },
  quick:     { name: 'Quick Sort',     gen: () => qsort(0, arr.length - 1), c: ['O(n log n)', 'O(n log n)', 'O(n²)', 'O(log n)'],
    info: 'Picks a pivot road and splits the rest into lighter and heavier traffic.', city: 'Fast for big city-wide data, such as thousands of sensor readings.' }
};
const PATHS = {
  bfs:      { name: 'Breadth-First Search', gen: () => bfs(), c: ['O(V+E)', 'O(V+E)', 'O(V+E)', 'O(V)'],
    info: 'Explores junction by junction in rings. Finds the route with the fewest roads.', city: 'Ignores traffic, so the route can still be slow.' },
  dfs:      { name: 'Depth-First Search',   gen: () => dfs(), c: ['O(V+E)', 'O(V+E)', 'O(V+E)', 'O(V)'],
    info: 'Follows one road as far as it goes, then backtracks. Finds a route, not the best.', city: 'Useful to check whether two areas are connected at all.' },
  dijkstra: { name: "Dijkstra's Algorithm", gen: () => dijkstra(), c: ['O(V²)', 'O(V²)', 'O(V²)', 'O(V)'],
    info: 'Always expands the cheapest junction next. Finds the lowest total delay.', city: 'This is how navigation apps pick the fastest route.' }
};

let mode = 'sort', arr = [], hl = [], done = false, token = 0, steps = 0, running = false, cmp = 0, swp = 0, t0 = 0;
const ROWS = 7, COLS = 12, S = 0, T = ROWS * COLS - 1;
let adj = [], edges = [], vis = new Set(), cur = -1, path = [], pathCost = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const delay = () => 600 / $('speed').value;
const list = () => mode === 'sort' ? SORTS : PATHS;

/* ---------- setup ---------- */
function fillAlgs() {
  $('alg').innerHTML = Object.entries(list()).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  $('sizeBox').style.display = mode === 'sort' ? '' : 'none';
  $('newBtn').textContent = mode === 'sort' ? 'New traffic data' : 'New road map';
  $('k2l').textContent = mode === 'sort' ? 'Comparisons' : 'Junctions visited';
  $('k3l').textContent = mode === 'sort' ? 'Swaps / writes' : 'Route delay (min)';
  $('legend').textContent = mode === 'sort'
    ? 'Bar height = vehicles on a road. Green = light, red = heavy. White = being compared. Blue = sorted.'
    : 'Number on a road = delay in minutes. A = start, B = destination. Click a road to close it (accident). Blue = visited, cyan = route.';
  updateInfo();
}
function updateInfo() {
  const a = list()[$('alg').value];
  $('sName').textContent = a.name; $('desc').textContent = a.info; $('city').textContent = a.city;
  ['cBest', 'cAvg', 'cWorst', 'cSpace'].forEach((id, i) => $(id).textContent = a.c[i]);
}
function buildGuide() {
  $('cards').innerHTML = [...Object.values(SORTS), ...Object.values(PATHS)].map(a =>
    `<div class="card"><h3>${a.name}</h3><p>${a.info}</p><p>Average: ${a.c[1]} · Space: ${a.c[3]}</p><p>${a.city}</p></div>`).join('');
}
function counters() { steps = cmp = swp = 0; showKpi(0); }
function showKpi(ms) {
  $('k1').textContent = steps;
  $('k2').textContent = mode === 'sort' ? cmp : vis.size;
  $('k3').textContent = mode === 'sort' ? swp : pathCost;
  $('k4').textContent = (ms / 1000).toFixed(1) + 's';
}
function rebuildAdj() {
  adj = Array.from({ length: ROWS * COLS }, () => []);
  edges.forEach(e => { if (!e.blocked) { adj[e.a].push({ to: e.b, w: e.w }); adj[e.b].push({ to: e.a, w: e.w }); } });
}
function resetSearch() { vis = new Set(); cur = -1; path = []; pathCost = 0; done = false; hl = []; }
function newData() {
  token++; counters(); resetSearch();
  if (mode === 'sort') {
    arr = Array.from({ length: +$('size').value }, () => 5 + Math.floor(Math.random() * 96));
  } else {
    edges = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const a = r * COLS + c;
      if (c + 1 < COLS) edges.push({ a, b: a + 1, w: 1 + Math.floor(Math.random() * 9) });
      if (r + 1 < ROWS) edges.push({ a, b: a + COLS, w: 1 + Math.floor(Math.random() * 9) });
    }
    rebuildAdj();
  }
  setBusy(false); draw(); $('stats').textContent = 'Press Start.';
}
function setBusy(b) {
  running = b;
  ['startBtn', 'alg', 'newBtn', 'size'].forEach(id => $(id).disabled = b);
  document.querySelectorAll('.tabs button').forEach(x => x.disabled = b);
}

/* ---------- drawing ---------- */
function draw() { ctx.clearRect(0, 0, W, H); mode === 'sort' ? drawBars() : drawMap(); }
function drawBars() {
  const n = arr.length, bw = W / n;
  arr.forEach((v, i) => {
    const h = v / 100 * (H - 30);
    ctx.fillStyle = hl.includes(i) ? '#ffffff' : done ? '#3b9edd' : `hsl(${120 - v * 1.2},70%,50%)`;
    ctx.fillRect(i * bw + 1, H - h, bw - 2, h);
    if (n <= 25) { ctx.fillStyle = '#101215'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(v, i * bw + bw / 2, H - 6); }
  });
}
const pos = id => ({ x: 60 + (id % COLS) * (W - 120) / (COLS - 1), y: 45 + Math.floor(id / COLS) * (H - 90) / (ROWS - 1) });
function drawMap() {
  ctx.textAlign = 'center'; ctx.font = '11px sans-serif';
  edges.forEach(e => {
    const p = pos(e.a), q = pos(e.b), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    if (e.blocked) {
      ctx.strokeStyle = '#d9453d'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#d9453d'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('✕', mx, my + 5); ctx.font = '11px sans-serif';
      return;
    }
    ctx.strokeStyle = `hsl(${120 - e.w * 13},65%,40%)`; ctx.lineWidth = 2 + e.w / 3;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    ctx.fillStyle = '#e9e6dc'; ctx.fillText(e.w, mx, my - 5);
  });
  ctx.strokeStyle = '#27e0d0'; ctx.lineWidth = 6; ctx.beginPath();
  path.forEach((id, i) => { const p = pos(id); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.stroke();
  for (let id = 0; id < ROWS * COLS; id++) {
    const p = pos(id);
    ctx.fillStyle = id === cur ? '#f2c230' : vis.has(id) ? '#3b9edd' : '#8b919a';
    ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 7); ctx.fill();
  }
  [[S, 'A', '#2e9e5b'], [T, 'B', '#d9453d']].forEach(([id, t, col]) => {
    const p = pos(id); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(t, p.x, p.y + 5);
  });
}
cv.onclick = ev => {
  if (mode !== 'path' || running) return;
  const r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width, y = (ev.clientY - r.top) * H / r.height;
  let best = null, bd = 18;
  edges.forEach(e => { const p = pos(e.a), q = pos(e.b), d = Math.hypot((p.x + q.x) / 2 - x, (p.y + q.y) / 2 - y); if (d < bd) { bd = d; best = e; } });
  if (best) { best.blocked = !best.blocked; rebuildAdj(); resetSearch(); counters(); draw(); $('stats').textContent = 'Road updated. Press Start.'; }
};

/* ---------- sorting algorithms (each yield = one visible step) ---------- */
function* bubble() {
  for (let i = 0; i < arr.length - 1; i++)
    for (let j = 0; j < arr.length - i - 1; j++) {
      hl = [j, j + 1]; cmp++; yield;
      if (arr[j] > arr[j + 1]) { [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]]; swp++; yield; }
    }
}
function* selection() {
  for (let i = 0; i < arr.length - 1; i++) {
    let m = i;
    for (let j = i + 1; j < arr.length; j++) { hl = [m, j]; cmp++; yield; if (arr[j] < arr[m]) m = j; }
    if (m !== i) { [arr[i], arr[m]] = [arr[m], arr[i]]; swp++; hl = [i, m]; yield; }
  }
}
function* insertion() {
  for (let i = 1; i < arr.length; i++) {
    const key = arr[i]; let j = i - 1;
    while (j >= 0 && arr[j] > key) { cmp++; arr[j + 1] = arr[j]; swp++; hl = [j, j + 1]; yield; j--; }
    arr[j + 1] = key; hl = [j + 1]; yield;
  }
}
function* msort(l, r) {
  if (l >= r) return;
  const m = (l + r) >> 1;
  yield* msort(l, m); yield* msort(m + 1, r);
  const L = arr.slice(l, m + 1), R = arr.slice(m + 1, r + 1);
  let i = 0, j = 0, k = l;
  while (i < L.length || j < R.length) {
    if (i < L.length && j < R.length) cmp++;
    arr[k] = (j >= R.length || (i < L.length && L[i] <= R[j])) ? L[i++] : R[j++];
    swp++; hl = [k++]; yield;
  }
}
function* qsort(lo, hi) {
  if (lo >= hi) return;
  const p = arr[hi]; let i = lo;
  for (let j = lo; j < hi; j++) {
    hl = [j, hi]; cmp++; yield;
    if (arr[j] < p) { [arr[i], arr[j]] = [arr[j], arr[i]]; swp++; i++; }
  }
  [arr[i], arr[hi]] = [arr[hi], arr[i]]; swp++; hl = [i]; yield;
  yield* qsort(lo, i - 1); yield* qsort(i + 1, hi);
}

/* ---------- graph algorithms ---------- */
function buildPath(prev) {
  path = []; pathCost = 0;
  if (prev[T] === undefined) return;
  for (let v = T; v !== -1; v = prev[v]) path.push(v);
  path.reverse();
  for (let i = 0; i < path.length - 1; i++) pathCost += adj[path[i]].find(x => x.to === path[i + 1]).w;
}
function* bfs() {
  const q = [S], prev = { [S]: -1 }; vis = new Set([S]);
  while (q.length) {
    const u = q.shift(); cur = u; yield;
    if (u === T) break;
    for (const { to } of adj[u]) if (!vis.has(to)) { vis.add(to); prev[to] = u; q.push(to); }
  }
  buildPath(prev);
}
function* dfs() {
  const st = [S], prev = { [S]: -1 }; vis = new Set();
  while (st.length) {
    const u = st.pop(); if (vis.has(u)) continue;
    vis.add(u); cur = u; yield;
    if (u === T) break;
    for (const { to } of adj[u]) if (!vis.has(to)) { prev[to] = u; st.push(to); }
  }
  buildPath(prev);
}
function* dijkstra() {
  const n = ROWS * COLS, dist = Array(n).fill(Infinity), prev = {}, seen = Array(n).fill(false);
  dist[S] = 0; prev[S] = -1; vis = new Set();
  for (let c = 0; c < n; c++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!seen[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    seen[u] = true; vis.add(u); cur = u; yield;
    if (u === T) break;
    for (const { to, w } of adj[u]) if (dist[u] + w < dist[to]) { dist[to] = dist[u] + w; prev[to] = u; }
  }
  buildPath(prev);
}

/* ---------- run ---------- */
async function start() {
  if (running) return;
  if (done && mode === 'sort') newData();
  if (mode === 'path') resetSearch();
  const t = ++token; counters(); setBusy(true); t0 = performance.now();
  for (const _ of list()[$('alg').value].gen()) {
    if (t !== token) return;
    steps++; draw(); showKpi(performance.now() - t0);
    $('stats').textContent = 'Running...';
    await sleep(delay());
  }
  if (t !== token) return;
  hl = []; cur = -1; done = true; setBusy(false); draw(); showKpi(performance.now() - t0);
  $('stats').textContent = mode === 'sort'
    ? `Done: roads ranked from light to heavy traffic in ${steps} steps.`
    : path.length ? `Route found: ${path.length - 1} roads, ${pathCost} min total delay.` : 'No route: closed roads block every path.';
}
function setMode(m) {
  mode = m; $('tabSort').classList.toggle('on', m === 'sort'); $('tabPath').classList.toggle('on', m === 'path');
  fillAlgs(); newData();
}

$('tabSort').onclick = () => setMode('sort');
$('tabPath').onclick = () => setMode('path');
$('alg').onchange = updateInfo;
$('size').oninput = () => { if (!running) newData(); };
$('newBtn').onclick = newData;
$('startBtn').onclick = start;
$('stopBtn').onclick = () => { if (!running) return; token++; setBusy(false); $('stats').textContent = 'Stopped. Press Start or New data.'; };
buildGuide(); fillAlgs(); newData();