(() => {
'use strict';
/* CryptoChart Terminal · Mobile — JS vanilla, sin dependencias.
   Pestañas: Seguimiento · Gráfico · Indicadores · Ajustes. Datos reales de Binance Spot (REST + WebSocket). */

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const API = 'https://api.binance.com/api/v3';
const IV_MS = {'1m':6e4,'5m':3e5,'15m':9e5,'30m':18e5,'1h':36e5,'4h':144e5,'1d':864e5,'1w':6048e5,'1M':2592e6};
const INTERVALS = Object.keys(IV_MS);
const STORE = 'cct_mobile_v1';
const FIB = [0, .236, .382, .5, .618, .786, 1];

/* ───────── Estado persistente ───────── */
const defaults = {
  symbols: ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT'],
  symbol: 'BTCUSDT', interval: '1h',
  indicators: {ema20:true, ema50:false, sma200:false, bollinger:false, rsi:true, volume:true, nnIa:true, nnEma:true, nnTp:true, nnRules:false},
  light: false, drawings: {}
};
function merge(s) {
  const o = {...structuredClone(defaults), ...s};
  o.indicators = {...defaults.indicators, ...(s.indicators || {})};
  if (!o.drawings || typeof o.drawings !== 'object' || Array.isArray(o.drawings)) o.drawings = {};
  if (!Array.isArray(o.symbols) || !o.symbols.length) o.symbols = [...defaults.symbols];
  if (!INTERVALS.includes(o.interval)) o.interval = '1h';
  if (typeof o.symbol !== 'string') o.symbol = o.symbols[0];
  return o;
}
/* Cuenta de Google (Firebase) — opcional: se activa si firebase-config.js define window.CCT_FIREBASE */
const CFG = window.CCT_FIREBASE, cloudEnabled = !!(CFG && CFG.apiKey && CFG.projectId);
const LASTUID = 'cct_last_uid', CLOUD_DOC = u => `users/${u}/data/cct_mobile`;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
let uid = cloudEnabled ? lsGet(LASTUID) : null, fbUser = null, auth = null, db = null, unsubCloud = null, pushTimer = 0, lastRemote = '', syncStatus = '';
const storeKey = () => uid ? `${STORE}_${uid}` : STORE;
const readLocal = key => { try { return JSON.parse(lsGet(key) || '{}'); } catch { return {}; } };
let state = merge(readLocal(storeKey()));
const save = () => { try { localStorage.setItem(storeKey(), JSON.stringify(state)); } catch {} cloudPush(); };

/* ───────── Utilidades ───────── */
const catalog = {BTC:['Bitcoin','₿'],ETH:['Ethereum','Ξ'],SOL:['Solana','◎'],BNB:['BNB','◆'],XRP:['XRP','✕'],DOGE:['Dogecoin','Ð'],ADA:['Cardano','₳'],AVAX:['Avalanche','▲'],LINK:['Chainlink','⬡'],DOT:['Polkadot','●'],LTC:['Litecoin','Ł'],TRX:['TRON','◈'],SUI:['Sui','≋'],NEAR:['NEAR','N'],ATOM:['Cosmos','⚛'],UNI:['Uniswap','🦄'],ARB:['Arbitrum','A'],OP:['Optimism','O'],APT:['Aptos','A'],PEPE:['Pepe','P']};
const base = s => s.replace(/USDT$/, '');
const meta = s => catalog[base(s)] || [base(s), base(s).slice(0, 1)];
const fmt = n => !Number.isFinite(n) ? '—' : n >= 1000 ? n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : n >= 1 ? n.toFixed(2) : n.toFixed(n < .01 ? 8 : 4);
const pct = n => !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.style.display = 'none', 2400); }
function updateStatus(ok, msg) { $('#connection').textContent = '● ' + msg; $('#connection').className = 'connection ' + (ok ? 'online' : 'offline'); }
async function getJSON(url, signal) { const r = await fetch(url, {signal}); if (!r.ok) throw Error('Binance HTTP ' + r.status); return r.json(); }

/* ───────── Variables de ejecución ───────── */
let tickers = {}, candles = [], ind = {}, visible = 70, pan = 0, fetchCtl = null;
let currentView = 'watchView', sheetMode = 'select', editMode = false;
let drawTool = '', pending = null, preview = null, selectedId = null, cross = null, geo = null;
let ws = null, wsGen = 0, wsOpen = false, wsRetry = 0;
const lastShown = {};

/* ───────── Navegación ───────── */
function switchView(id) {
  currentView = id;
  $$('.view').forEach(x => x.classList.toggle('active', x.id === id));
  $$('.bottom-nav button').forEach(x => x.classList.toggle('active', x.dataset.view === id));
  document.body.classList.toggle('chart-mode', id === 'chartView');
  if (id !== 'chartView') document.body.classList.remove('expanded');
  if (id === 'chartView') requestAnimationFrame(() => { if (!candles.length) loadCandles(); render(); });
  if (id === 'watchView') renderWatch();
  syncFullscreenLabel();
}
$$('.bottom-nav button').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

/* ───────── 1 · Seguimiento ───────── */
function coinBadge(s) {
  const b = base(s);
  return `<span class="coin-icon ${b === 'ETH' ? 'eth' : b === 'SOL' ? 'sol' : b === 'BNB' ? 'bnb' : b === 'XRP' ? 'xrp' : b === 'BTC' ? '' : 'other'}">${esc(meta(s)[1])}</span>`;
}
function renderWatch() {
  const q = $('#searchCoins').value.trim().toUpperCase();
  const list = state.symbols.filter(s => s.includes(q) || meta(s)[0].toUpperCase().includes(q));
  $('#watchRows').innerHTML = list.map(s => {
    const t = tickers[s], change = Number(t?.priceChangePercent), price = Number(t?.lastPrice);
    let flash = '';
    if (Number.isFinite(price) && lastShown[s] != null && price !== lastShown[s]) flash = price > lastShown[s] ? ' flash-up' : ' flash-down';
    if (Number.isFinite(price)) lastShown[s] = price;
    const main = `${coinBadge(s)}<span class="row-main"><strong>${esc(base(s))}</strong><small>${esc(meta(s)[0])}</small></span>`;
    if (editMode) return `<div class="watch-row editing" data-symbol="${s}">${main}<span class="row-edit"><button data-move="${s}" aria-label="Subir ${esc(base(s))}">▲</button><button data-remove="${s}" class="danger" aria-label="Quitar ${esc(base(s))}">✕</button></span></div>`;
    return `<button class="watch-row" data-symbol="${s}">${main}<span class="row-prices"><strong class="${flash}">${fmt(price)}</strong><small class="${change >= 0 ? 'positive' : 'negative'}">${pct(change)}</small></span></button>`;
  }).join('') || '<p class="small-note">No hay activos con ese nombre.</p>';
  $('#totalAssets').textContent = state.symbols.length;
  $('#winners').textContent = state.symbols.filter(s => Number(tickers[s]?.priceChangePercent) > 0).length;
  $('#losers').textContent = state.symbols.filter(s => Number(tickers[s]?.priceChangePercent) < 0).length;
  $('#editWatch').textContent = editMode ? 'Listo' : 'Editar';
}
$('#watchRows').addEventListener('click', e => {
  const rm = e.target.closest('[data-remove]'), mv = e.target.closest('[data-move]'), row = e.target.closest('.watch-row');
  if (rm) { state.symbols = state.symbols.filter(s => s !== rm.dataset.remove); if (!state.symbols.length) editMode = false; save(); renderWatch(); return; }
  if (mv) { const i = state.symbols.indexOf(mv.dataset.move); if (i > 0) { [state.symbols[i - 1], state.symbols[i]] = [state.symbols[i], state.symbols[i - 1]]; save(); renderWatch(); } return; }
  if (row && !editMode) selectSymbol(row.dataset.symbol);
});
$('#editWatch').onclick = () => { editMode = !editMode; renderWatch(); };

async function fetchTicker() {
  try {
    let data;
    try { data = await getJSON(`${API}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(state.symbols))}`); }
    catch { data = await getJSON(`${API}/ticker/24hr`); } // por si algún símbolo añadido a mano no existe
    for (const t of data) tickers[t.symbol] = t;
    updateStatus(true, 'Binance en línea');
    renderWatch(); updateChartHeader();
  } catch {
    updateStatus(false, 'Sin conexión'); renderWatch();
    if (!candles.length) setFeedback('No hay datos. Revisa tu conexión o posibles restricciones de Binance en tu país.');
  }
}

/* ───────── Velas y datos en vivo ───────── */
function setFeedback(t) { $('#chartFeedback').textContent = t; }
function defaultVisible() { const w = $('#chartArea').clientWidth || 360; return clamp(Math.round((w - 70) / 5.5), 40, 120); }
function renderFrames() {
  $('#timeframes').innerHTML = INTERVALS.map(t => `<button class="${t === state.interval ? 'active' : ''}" data-tf="${t}">${t}</button>`).join('');
}
$('#timeframes').addEventListener('click', e => {
  const b = e.target.closest('[data-tf]'); if (!b) return;
  state.interval = b.dataset.tf; save(); renderFrames(); clearTransient(); loadCandles();
});
function updateChartHeader() {
  const b = base(state.symbol), t = tickers[state.symbol];
  const last = candles.length ? candles[candles.length - 1].c : Number(t?.lastPrice);
  const ch = Number(t?.priceChangePercent);
  $('#coinIcon').textContent = meta(state.symbol)[1];
  $('#coinTitle').textContent = `${b} / USDT`;
  $('#chartLabel').textContent = state.symbol;
  $('#intervalLabel').textContent = state.interval;
  $('#lastPrice').textContent = fmt(last);
  $('#dayChange').textContent = pct(ch);
  $('#dayChange').className = ch >= 0 ? 'positive' : 'negative';
}
async function loadCandles(silent = false) {
  if (fetchCtl) fetchCtl.abort();
  fetchCtl = new AbortController();
  const sym = state.symbol, tf = state.interval;
  if (!silent) { candles = []; ind = {}; setFeedback('Cargando velas reales de Binance…'); render(); }
  try {
    const data = await getJSON(`${API}/klines?symbol=${sym}&interval=${tf}&limit=1000`, fetchCtl.signal);
    if (sym !== state.symbol || tf !== state.interval) return;
    candles = data.map(d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]}));
    recalc();
    if (!silent) { visible = defaultVisible(); pan = 0; }
    setFeedback(''); updateChartHeader(); render(); connectWS();
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (!silent) { setFeedback('No se pudieron cargar las velas de Binance. No se muestran datos simulados.'); render(); }
  }
}
function setLive(on) { $('#liveDot').classList.toggle('on', !!on); }
function closeWS() { wsGen++; wsOpen = false; if (ws) { ws.onclose = ws.onmessage = ws.onopen = ws.onerror = null; try { ws.close(); } catch {} } ws = null; setLive(false); }
function connectWS() {
  closeWS();
  if (typeof WebSocket === 'undefined') return;
  const gen = wsGen, sym = state.symbol, tf = state.interval;
  try { ws = new WebSocket(`wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@kline_${tf}`); } catch { return; }
  ws.onopen = () => { if (gen === wsGen) { wsOpen = true; wsRetry = 0; setLive(true); } };
  ws.onmessage = e => {
    if (gen !== wsGen) return;
    let k; try { k = JSON.parse(e.data).k; } catch { return; }
    if (k) applyKline({t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v});
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
  ws.onclose = () => {
    if (gen !== wsGen) return;
    wsOpen = false; setLive(false);
    setTimeout(() => { if (gen === wsGen && !document.hidden) connectWS(); }, Math.min(30000, 4000 * ++wsRetry));
  };
}
function applyKline(k) {
  const n = candles.length; if (!n) return;
  const last = candles[n - 1];
  if (k.t === last.t) candles[n - 1] = k;
  else if (k.t > last.t) { candles.push(k); if (pan > 0) pan += 1; }
  else return;
  recalc(); updateChartHeader();
  if (currentView === 'chartView') scheduleRender();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  fetchTicker();
  if (currentView === 'chartView' && candles.length) { loadCandles(true); }
});

/* ───────── Indicadores ───────── */
const indicatorMeta = [
  ['ema20','EMA 20','Media móvil exponencial de 20 períodos','#f5c568'],
  ['ema50','EMA 50','Media móvil exponencial de 50 períodos','#6ca5f9'],
  ['sma200','SMA 200','Media móvil simple de 200 períodos','#b58dff'],
  ['bollinger','Bandas de Bollinger','20 períodos · 2 desviaciones','#a3b0c3'],
  ['rsi','RSI 14','Índice de fuerza relativa en panel inferior','#bb9cff'],
  ['volume','Volumen','Barras de volumen por vela','#8294a8'],
  ['nnIa','Nova Nexus · Señales IA','BUY/SELL con score ⭐, cooldown y divergencias (v2.7)','#11cf77'],
  ['nnEma','Nova Nexus · EMA Cloud','Nube EMA 55 ± 0.6 ATR','#8a97b3'],
  ['nnTp','Nova Nexus · TP / SL','Niveles de la última señal (SL 1 · TP 1.5 / 2.5 / 4 ATR)','#ff9900'],
  ['nnRules','Nova Nexus · Reglas','Panel de reglas de trading sobre el gráfico','#4361cf']
];
function ema(xs, n) {
  const out = Array(xs.length).fill(null); if (xs.length < n) return out;
  const k = 2 / (n + 1); let e = xs.slice(0, n).reduce((a, b) => a + b, 0) / n; out[n - 1] = e;
  for (let i = n; i < xs.length; i++) { e = xs[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
function sma(xs, n) {
  const out = Array(xs.length).fill(null); let s = 0;
  for (let i = 0; i < xs.length; i++) { s += xs[i]; if (i >= n) s -= xs[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}
function rsi(xs, n = 14) {
  const out = Array(xs.length).fill(null); if (xs.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) { const d = xs[i] - xs[i - 1]; gain += Math.max(0, d); loss += Math.max(0, -d); }
  gain /= n; loss /= n; out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    gain = (gain * (n - 1) + Math.max(0, d)) / n; loss = (loss * (n - 1) + Math.max(0, -d)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}
function recalc() {
  const c = candles.map(x => x.c), n = c.length, m = sma(c, 20);
  const up = Array(n).fill(null), lo = Array(n).fill(null);
  for (let i = 19; i < n; i++) { let s = 0; for (let j = i - 19; j <= i; j++) { const d = c[j] - m[i]; s += d * d; } const sd = Math.sqrt(s / 20); up[i] = m[i] + 2 * sd; lo[i] = m[i] - 2 * sd; }
  ind = {ema20: ema(c, 20), ema50: ema(c, 50), sma200: sma(c, 200), bbU: up, bbL: lo, rsi: rsi(c, 14)};
  ind.nn = null; calcNova();
}
function calcNova() {
  const I = state.indicators;
  if (!window.NovaNexus || !candles.length || !(I.nnIa || I.nnEma || I.nnTp || I.nnRules)) { ind.nn = null; return; }
  try { ind.nn = NovaNexus.compute(candles, {}); } catch (e) { ind.nn = null; console.warn('Nova Nexus:', e); }
}
const indicatorRows = () => indicatorMeta.map(([key, title, desc]) =>
  `<div class="setting-row"><div><b>${title}</b><small>${desc}</small></div><button class="toggle ${state.indicators[key] ? 'on' : ''}" data-ind="${key}" aria-label="${title}" aria-pressed="${!!state.indicators[key]}"></button></div>`).join('');
function renderIndicators() { $('#indicatorList').innerHTML = indicatorRows(); }
function countIndicators() { const n = Object.values(state.indicators).filter(Boolean).length; $('#indicatorCount').textContent = n ? `Indicadores (${n})` : 'Indicadores'; }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ind]'); if (!b) return;
  state.indicators[b.dataset.ind] = !state.indicators[b.dataset.ind];
  save(); renderIndicators(); countIndicators(); if (candles.length) { calcNova(); }
  if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) $('#sheetList').innerHTML = indicatorRows();
  scheduleRender();
});

/* ───────── Hojas inferiores (activo / añadir / dibujar / indicadores) ───────── */
function openSheet(mode = 'select') {
  sheetMode = mode;
  $('#sheetTitle').textContent = {add: 'Añadir a seguimiento', tools: 'Herramientas de dibujo', indicators: 'Indicadores', select: 'Seleccionar criptomoneda', script: 'Código del script', paste: 'Pegar script de Pine'}[mode];
  $('#sheetSearch').style.display = ['tools', 'indicators', 'script', 'paste'].includes(mode) ? 'none' : 'block';
  $('#sheetSearch').value = '';
  $('#sheetBackdrop').classList.add('open'); $('#sheet').classList.add('open');
  renderSheet();
}
function closeSheet() { $('#sheetBackdrop').classList.remove('open'); $('#sheet').classList.remove('open'); }
const TOOLS = [
  ['trend', '↗ Línea de tendencia', 'Arrastra o toca dos puntos'],
  ['horizontal', '— Línea horizontal', 'Toca un precio'],
  ['rect', '▭ Rectángulo', 'Arrastra o toca dos esquinas'],
  ['fib', '≋ Fibonacci', 'Arrastra o toca inicio y fin del movimiento'],
  ['clear', '✕ Borrar todos los dibujos', 'Solo de este activo']
];
function renderSheet() {
  const list = $('#sheetList');
  if (sheetMode === 'indicators') { list.innerHTML = indicatorRows(); return; }
  if (sheetMode === 'script') {
    const sc = scripts.find(x => x.id === viewScriptId); if (!sc) { list.innerHTML = ''; return; }
    const MAXV = 30000, shown = sc.code.length > MAXV ? sc.code.slice(0, MAXV) : sc.code;
    list.innerHTML = `<p class="small-note">${esc(sc.name)} · ${sc.lines} líneas${sc.code.length > MAXV ? ' · se muestran los primeros 30,000 caracteres (el script completo está guardado)' : ''}</p><pre class="code">${esc(shown)}</pre>`; return;
  }
  if (sheetMode === 'paste') {
    list.innerHTML = `<input id="pasteName" class="paste-name" placeholder="Nombre (opcional)" autocomplete="off"><textarea id="pasteCode" placeholder="Pega aquí tu código Pine…" spellcheck="false"></textarea><button class="primary" id="pasteSave">Guardar script</button>`;
    $('#pasteSave').onclick = () => { const code = $('#pasteCode').value; if (addScript(code, $('#pasteName').value.trim() || 'Script pegado')) closeSheet(); };
    return;
  }
  if (sheetMode === 'tools') {
    list.innerHTML = TOOLS.map(([k, t, d]) => `<button class="sheet-item" data-tool="${k}"><span>${t}</span><small>${d}</small></button>`).join('');
    $$('[data-tool]').forEach(b => b.onclick = () => {
      const k = b.dataset.tool; closeSheet();
      if (k === 'clear') { setDrawings([]); selectedId = null; updateDrawUI(); render(); toast('Dibujos borrados'); }
      else startTool(k);
    });
    return;
  }
  const search = $('#sheetSearch').value.trim().toUpperCase();
  const pool = sheetMode === 'add' ? Object.keys(catalog).map(s => s + 'USDT') : state.symbols;
  const syms = pool.filter(s => s.includes(search) || meta(s)[0].toUpperCase().includes(search));
  if (sheetMode === 'add' && search && !syms.length && /^[A-Z0-9]{2,15}$/.test(search)) syms.push(search.endsWith('USDT') ? search : search + 'USDT');
  list.innerHTML = syms.map(s => `<button class="sheet-item" data-pick="${s}"><span>${esc(base(s))} <small>${esc(meta(s)[0])}</small></span><span>${state.symbols.includes(s) ? (sheetMode === 'add' ? '✓' : '→') : '＋'}</span></button>`).join('') || '<p class="small-note">No se encontraron monedas.</p>';
  $$('[data-pick]').forEach(b => b.onclick = async () => {
    const s = b.dataset.pick;
    if (sheetMode !== 'add') { selectSymbol(s); return; }
    if (state.symbols.includes(s)) { closeSheet(); return; }
    if (!catalog[base(s)]) { // símbolo escrito a mano: comprobar que existe en Binance
      try { await getJSON(`${API}/ticker/price?symbol=${s}`); } catch { toast(`${s} no existe en Binance Spot`); return; }
    }
    state.symbols.push(s); save(); renderWatch(); fetchTicker(); toast(`${base(s)} añadido`); closeSheet();
  });
}
$('#closeSheet').onclick = closeSheet; $('#sheetBackdrop').onclick = closeSheet; $('#sheetSearch').oninput = renderSheet;
$('#symbolButton').onclick = () => openSheet(); $('#addAsset').onclick = () => openSheet('add'); $('#searchCoins').oninput = renderWatch;
$$('[data-panel]').forEach(b => b.onclick = () => openSheet(b.dataset.panel === 'tools' ? 'tools' : 'indicators'));
$('#goChart').onclick = () => switchView('chartView');
function selectSymbol(s) {
  state.symbol = s; save(); closeSheet(); clearTransient(); closeWS(); candles = []; ind = {};
  updateChartHeader(); switchView('chartView'); loadCandles();
}

/* ───────── Dibujos (anclados a tiempo y precio, guardados por activo) ───────── */
const getDrawings = () => state.drawings[state.symbol] || [];
const setDrawings = arr => { if (arr.length) state.drawings[state.symbol] = arr; else delete state.drawings[state.symbol]; save(); };
function clearTransient() { drawTool = ''; pending = null; preview = null; selectedId = null; cross = null; updateDrawUI(); }
const HINTS = {
  trend: p => p ? 'Toca el segundo punto' : 'Arrastra o toca el primer punto',
  horizontal: () => 'Toca el precio donde quieres la línea',
  rect: p => p ? 'Toca la esquina opuesta' : 'Arrastra o toca la primera esquina',
  fib: p => p ? 'Toca el final del movimiento' : 'Arrastra o toca el inicio del movimiento'
};
function startTool(k) { drawTool = k; pending = null; preview = null; selectedId = null; updateDrawUI(); scheduleRender(); }
function updateDrawUI() {
  $('#drawHint').hidden = !drawTool;
  if (drawTool) $('#drawHintText').textContent = HINTS[drawTool](pending);
  $('#deleteDraw').hidden = !selectedId;
  $('#undoDraw').disabled = !getDrawings().length;
  $('#chartArea').classList.toggle('drawing', !!drawTool);
}
$('#cancelDraw').onclick = () => { drawTool = ''; pending = null; preview = null; updateDrawUI(); scheduleRender(); };
$('#undoDraw').onclick = () => { const a = getDrawings().slice(); if (!a.length) return; a.pop(); setDrawings(a); selectedId = null; updateDrawUI(); render(); };
$('#deleteDraw').onclick = () => { setDrawings(getDrawings().filter(d => d.id !== selectedId)); selectedId = null; updateDrawUI(); render(); };

function idxOfTime(t) {
  const n = candles.length; if (!n) return 0; const iv = IV_MS[state.interval];
  if (t <= candles[0].t) return (t - candles[0].t) / iv;
  if (t >= candles[n - 1].t) return n - 1 + (t - candles[n - 1].t) / iv;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (candles[m].t <= t) lo = m; else hi = m; }
  return lo + (t - candles[lo].t) / (candles[lo + 1].t - candles[lo].t);
}
function timeOfIdx(i) {
  const n = candles.length, iv = IV_MS[state.interval];
  if (i <= 0) return candles[0].t + i * iv;
  if (i >= n - 1) return candles[n - 1].t + (i - (n - 1)) * iv;
  const lo = Math.floor(i); return candles[lo].t + (i - lo) * (candles[lo + 1].t - candles[lo].t);
}
const X = i => geo.left + (i - geo.start + .5) * geo.step;
const IDX = x => (x - geo.left) / geo.step + geo.start - .5;
const Y = p => geo.plotTop + (geo.max - p) / (geo.max - geo.min) * geo.plotH;
const PRICE = y => geo.max - (y - geo.plotTop) / geo.plotH * (geo.max - geo.min);
function snapPoint(pt) {
  const i = Math.round(IDX(pt.x)); let p = PRICE(pt.y);
  const c = candles[i];
  if (c) { let best = null, bd = 14; for (const v of [c.o, c.h, c.l, c.c]) { const dd = Math.abs(Y(v) - pt.y); if (dd < bd) { bd = dd; best = v; } } if (best != null) p = best; }
  return {t: timeOfIdx(i), p};
}
const px = a => ({x: X(idxOfTime(a.t)), y: Y(a.p)});
function handlesOf(d) {
  if (d.type === 'horizontal') return [{key: 'a', x: geo.left + geo.plotW / 2, y: Y(d.a.p)}];
  return [{key: 'a', ...px(d.a)}, {key: 'b', ...px(d.b)}];
}
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distToDrawing(d, pt) {
  if (d.type === 'horizontal') return Math.abs(pt.y - Y(d.a.p));
  const a = px(d.a), b = px(d.b);
  if (d.type === 'trend') return segDist(pt, a, b);
  if (d.type === 'rect') {
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
    if (pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2) return 0;
    return Math.min(segDist(pt, {x: x1, y: y1}, {x: x2, y: y1}), segDist(pt, {x: x2, y: y1}, {x: x2, y: y2}), segDist(pt, {x: x2, y: y2}, {x: x1, y: y2}), segDist(pt, {x: x1, y: y2}, {x: x1, y: y1}));
  }
  const xs = Math.min(a.x, b.x); if (pt.x < xs - 10) return 1e9;
  return Math.min(...FIB.map(lv => Math.abs(pt.y - Y(b_price(d, lv)))));
}
const b_price = (d, lv) => d.b.p - (d.b.p - d.a.p) * lv;
function hitTest(pt) { const arr = getDrawings(); for (let i = arr.length - 1; i >= 0; i--) if (distToDrawing(arr[i], pt) < 13) return arr[i]; return null; }
function commitDrawing(a, b) {
  if (drawTool !== 'horizontal') { const A = px(a), B = px(b); if (Math.hypot(A.x - B.x, A.y - B.y) < 8) { toast('Los puntos están muy cerca'); return; } }
  const d = {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: drawTool, a, ...(drawTool === 'horizontal' ? {} : {b})};
  setDrawings([...getDrawings(), d]);
  selectedId = d.id; drawTool = ''; pending = null; preview = null; updateDrawUI(); render();
}

/* ───────── Render del gráfico ───────── */
let raf = 0;
function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
let g = null;
function setupCanvas() {
  const el = $('#priceCanvas'), r = el.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 3);
  const W = Math.round(r.width * d), H = Math.round(r.height * d);
  if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }
  g = el.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
  return {w: r.width, h: r.height};
}
function timeLabel(t, prev) {
  const d = new Date(t), p2 = n => String(n).padStart(2, '0'), iv = state.interval;
  if (iv === '1M') return d.toLocaleString('es', {month: 'short', year: '2-digit'});
  if (iv === '1d' || iv === '1w') return `${d.getDate()}/${d.getMonth() + 1}`;
  if (prev != null && new Date(prev).getDate() !== d.getDate()) return `${d.getDate()}/${d.getMonth() + 1}`;
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
function render() {
  if (currentView !== 'chartView') return;
  const el = $('#priceCanvas'); if (!el.getBoundingClientRect().width) return;
  const {w, h} = setupCanvas();
  const css = getComputedStyle(document.body);
  const text = css.getPropertyValue('--muted').trim(), line = css.getPropertyValue('--line').trim(), bg = css.getPropertyValue('--bg').trim(), drawCol = css.getPropertyValue('--draw').trim() || '#e9c36e', fg = css.getPropertyValue('--text').trim();
  const up = '#20bf9f', down = '#f06b79';
  g.clearRect(0, 0, w, h);
  const n = candles.length; if (!n) { geo = null; return; }

  const left = 6, right = 64, axisH = 22, plotTop = 6;
  const rsiH = state.indicators.rsi ? Math.round(Math.max(70, h * .18)) : 0, volH = state.indicators.volume ? Math.round(Math.max(40, h * .12)) : 0;
  const plotH = Math.max(80, h - axisH - rsiH - volH - plotTop), plotW = w - left - right;
  const count = clamp(visible, 15, 400);
  pan = clamp(pan, -Math.floor(count * .4), Math.max(0, n - Math.ceil(count * .3)));
  const end = n - pan, start = end - count, step = plotW / count;
  const lo = Math.max(0, Math.floor(start)), hi = Math.min(n, Math.ceil(end));
  if (hi <= lo) return;

  let min = Infinity, max = -Infinity;
  for (let i = lo; i < hi; i++) { if (candles[i].l < min) min = candles[i].l; if (candles[i].h > max) max = candles[i].h; }
  const overlays = [];
  if (state.indicators.ema20) overlays.push(['EMA 20', ind.ema20, '#f5c568']);
  if (state.indicators.ema50) overlays.push(['EMA 50', ind.ema50, '#6ca5f9']);
  if (state.indicators.sma200) overlays.push(['SMA 200', ind.sma200, '#b58dff']);
  if (state.indicators.bollinger) overlays.push(['BB sup', ind.bbU, '#748bab', true], ['BB inf', ind.bbL, '#748bab', true]);
  for (const [, arr] of overlays) for (let i = lo; i < hi; i++) if (arr[i] != null) { if (arr[i] < min) min = arr[i]; if (arr[i] > max) max = arr[i]; }
  const nn = ind.nn;
  if (nn && state.indicators.nnEma) for (let i = lo; i < hi; i++) { const a = nn.emaTop[i], b = nn.emaBot[i]; if (Number.isFinite(a) && a > max) max = a; if (Number.isFinite(b) && b < min) min = b; }
  const range = Math.max(max - min, Math.abs(max) * 1e-5), pad = range * .08; min -= pad; max += pad;
  geo = {w, h, left, right, axisH, plotTop, plotH, plotW, count, start, end, step, min, max, volTop: plotTop + plotH, rsiTop: plotTop + plotH + volH};

  // cuadrícula y escala de precios
  g.font = '10px system-ui'; g.textAlign = 'left'; g.lineWidth = .6;
  for (let i = 0; i <= 4; i++) {
    const yy = plotTop + i * plotH / 4, pr = max - (max - min) * i / 4;
    g.strokeStyle = line; g.beginPath(); g.moveTo(left, yy); g.lineTo(w - right + 2, yy); g.stroke();
    g.fillStyle = text; g.fillText(fmt(pr), w - right + 6, yy + 3);
  }
  // eje de tiempo
  const stride = Math.max(1, Math.ceil(70 / step));
  g.fillStyle = text; g.textAlign = 'center';
  for (let i = Math.ceil(lo / stride) * stride; i < hi; i += stride) {
    const xx = X(i); if (xx < left + 14 || xx > w - right - 14) continue;
    g.strokeStyle = line; g.beginPath(); g.moveTo(xx, plotTop); g.lineTo(xx, plotTop + plotH + volH + rsiH); g.stroke();
    g.fillText(timeLabel(candles[i].t, i > 0 ? candles[i - 1].t : null), xx, h - 7);
  }
  g.textAlign = 'left';

  g.save(); g.beginPath(); g.rect(left, plotTop, plotW + 2, plotH); g.clip();
  // Nova Nexus · EMA Cloud (detrás de las velas)
  if (nn && state.indicators.nnEma) drawNovaCloud(nn, lo, hi, css);
  // velas
  const barW = clamp(step * .66, 1.5, 16);
  for (let i = lo; i < hi; i++) {
    const d = candles[i], xx = X(i), col = d.c >= d.o ? up : down, yo = Y(d.o), yc = Y(d.c);
    g.strokeStyle = g.fillStyle = col; g.lineWidth = 1;
    g.beginPath(); g.moveTo(xx, Y(d.h)); g.lineTo(xx, Y(d.l)); g.stroke();
    g.fillRect(xx - barW / 2, Math.min(yo, yc), barW, Math.max(1, Math.abs(yo - yc)));
  }
  // medias y bandas
  for (const [, arr, col, dashed] of overlays) {
    g.strokeStyle = col; g.lineWidth = 1.4; g.setLineDash(dashed ? [4, 3] : []); g.beginPath();
    let on = false;
    for (let i = lo; i < hi; i++) { if (arr[i] == null) { on = false; continue; } const xx = X(i), yy = Y(arr[i]); if (!on) { g.moveTo(xx, yy); on = true; } else g.lineTo(xx, yy); }
    g.stroke(); g.setLineDash([]);
  }
  // Nova Nexus · señales y niveles TP/SL
  if (nn && (state.indicators.nnIa || state.indicators.nnTp)) drawNovaSignals(nn, lo, hi, n);
  // dibujos del usuario
  for (const d of getDrawings()) drawShape(d, d.id === selectedId, drawCol, text);
  if (preview) drawShape({id: '_', type: drawTool, a: preview.a, b: preview.b}, false, drawCol, text);
  if (pending) { const P = px(pending); g.fillStyle = drawCol; g.beginPath(); g.arc(P.x, P.y, 5, 0, 7); g.fill(); }
  g.restore();

  // etiqueta de último precio
  const lastC = candles[n - 1], ly = Y(lastC.c);
  if (ly > plotTop && ly < plotTop + plotH) {
    const col = lastC.c >= lastC.o ? up : down;
    g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(left, ly); g.lineTo(w - right + 2, ly); g.stroke(); g.setLineDash([]);
    g.fillStyle = col; g.fillRect(w - right + 2, ly - 9, right - 3, 18); g.fillStyle = '#fff'; g.fillText(fmt(lastC.c), w - right + 5, ly + 3.5);
  }
  // leyenda de indicadores
  let ly2 = plotTop + 48; g.font = '10px system-ui';
  for (const [name, arr, col] of overlays) { if (/^BB inf/.test(name)) continue; const v = [...arr].reverse().find(x => x != null); g.fillStyle = col; g.fillText(`${name.replace('BB sup', 'Bollinger')}  ${v != null ? fmt(v) : '—'}`, left + 8, ly2); ly2 += 13; }

  // volumen
  if (volH) {
    const top = geo.volTop + 4, height = volH - 8; let maxV = 1;
    for (let i = lo; i < hi; i++) maxV = Math.max(maxV, candles[i].v);
    g.strokeStyle = line; g.beginPath(); g.moveTo(left, geo.volTop); g.lineTo(w - right + 2, geo.volTop); g.stroke();
    g.fillStyle = text; g.fillText('VOL', left + 4, top + 9);
    for (let i = lo; i < hi; i++) { const d = candles[i]; g.fillStyle = d.c >= d.o ? '#1b8c78aa' : '#d45a6aaa'; const bh = Math.max(1, d.v / maxV * height); g.fillRect(X(i) - barW / 2, top + height - bh, barW, bh); }
  }
  // RSI
  if (rsiH) {
    const top = geo.rsiTop + 4, height = rsiH - 12;
    g.strokeStyle = line; g.beginPath(); g.moveTo(left, geo.rsiTop); g.lineTo(w - right + 2, geo.rsiTop); g.stroke();
    const lastR = [...ind.rsi].reverse().find(x => x != null);
    g.fillStyle = text; g.fillText(`RSI 14  ${lastR != null ? lastR.toFixed(1) : '—'}`, left + 4, top + 9);
    g.setLineDash([2, 3]);
    for (const r of [30, 70]) { const yy = top + (100 - r) / 100 * height; g.strokeStyle = line; g.beginPath(); g.moveTo(left, yy); g.lineTo(w - right, yy); g.stroke(); g.fillStyle = text; g.fillText(String(r), w - right + 6, yy + 3); }
    g.setLineDash([]);
    g.strokeStyle = '#bb9cff'; g.lineWidth = 1.5; g.beginPath(); let on = false;
    for (let i = lo; i < hi; i++) { const v = ind.rsi[i]; if (v == null) { on = false; continue; } const yy = top + (100 - v) / 100 * height; if (!on) { g.moveTo(X(i), yy); on = true; } else g.lineTo(X(i), yy); }
    g.stroke();
  }
  if (nn && state.indicators.nnRules) drawNovaRules();
  if (nn && state.indicators.nnIa && nn.last) drawNovaScore(nn.last);
  // retícula (mantener pulsado)
  let shown = candles[hi - 1];
  if (cross) {
    const i = clamp(Math.round(IDX(cross.x)), 0, n - 1), c = candles[i]; shown = c;
    const cx = X(i), cy = clamp(cross.y, plotTop, plotTop + plotH);
    g.strokeStyle = fg; g.globalAlpha = .55; g.lineWidth = 1; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(cx, plotTop); g.lineTo(cx, h - axisH); g.moveTo(left, cy); g.lineTo(w - right + 2, cy); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    g.fillStyle = fg; g.fillRect(w - right + 2, cy - 9, right - 3, 18); g.fillStyle = bg; g.fillText(fmt(PRICE(cy)), w - right + 5, cy + 3.5);
    const tl = new Date(c.t).toLocaleString('es', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
    const tw = g.measureText(tl).width + 12, tx = clamp(cx - tw / 2, left, w - right - tw);
    g.fillStyle = fg; g.fillRect(tx, h - axisH + 1, tw, 18); g.fillStyle = bg; g.fillText(tl, tx + 6, h - 8);
  }
  if (shown) {
    const chg = (shown.c - shown.o) / shown.o * 100;
    const sgAt = cross && nn && state.indicators.nnIa ? nn.bySignal[clamp(Math.round(IDX(cross.x)), 0, n - 1)] : null;
    $('#ohlcText').textContent = `O ${fmt(shown.o)}  H ${fmt(shown.h)}  L ${fmt(shown.l)}  C ${fmt(shown.c)}  ${pct(chg)}` + (sgAt ? `\n${NovaNexus.tooltip(sgAt)}` : '');
    $('#ohlcText').style.color = shown.c >= shown.o ? up : down;
  }
}
/* ───────── Nova Nexus: dibujo ───────── */
const NN_COL = {buy: '#11cf77', sell: '#d11645', range: '#9b59b6', sl: '#ff4444', tp1: '#11cf77', tp2: '#00aaff', tp3: '#ff9900'};
function drawNovaCloud(nn, lo, hi, css) {
  const light = document.body.classList.contains('light');
  const bullFill = light ? 'rgba(70,95,150,.16)' : 'rgba(140,155,185,.20)', bearFill = light ? 'rgba(110,110,125,.16)' : 'rgba(120,125,140,.20)';
  const edge = light ? 'rgba(30,40,60,.35)' : 'rgba(200,210,230,.30)';
  // relleno por tramos del mismo color (alcista/bajista)
  let i = lo;
  while (i < hi) {
    if (!Number.isFinite(nn.emaTop[i])) { i++; continue; }
    const bull = nn.bull[i]; let j = i;
    while (j + 1 < hi && Number.isFinite(nn.emaTop[j + 1]) && nn.bull[j + 1] === bull) j++;
    const a = Math.max(lo, i - 1 >= lo && Number.isFinite(nn.emaTop[i - 1]) ? i - 1 : i);
    g.beginPath(); g.moveTo(X(a), Y(nn.emaTop[a]));
    for (let k = a + 1; k <= j; k++) g.lineTo(X(k), Y(nn.emaTop[k]));
    for (let k = j; k >= a; k--) g.lineTo(X(k), Y(nn.emaBot[k]));
    g.closePath(); g.fillStyle = bull ? bullFill : bearFill; g.fill();
    i = j + 1;
  }
  g.strokeStyle = edge; g.lineWidth = 1; g.setLineDash([]);
  for (const arr of [nn.emaTop, nn.emaBot]) {
    g.beginPath(); let on = false;
    for (let k = lo; k < hi; k++) { const v = arr[k]; if (!Number.isFinite(v)) { on = false; continue; } if (!on) { g.moveTo(X(k), Y(v)); on = true; } else g.lineTo(X(k), Y(v)); }
    g.stroke();
  }
}
function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function drawNovaSignals(nn, lo, hi, n) {
  const I = state.indicators, small = geo.step < 5;
  if (I.nnIa) {
    g.font = `bold ${small ? 8 : 9}px system-ui`; g.textAlign = 'center';
    for (const sg of nn.signals) {
      if (sg.i < lo || sg.i >= hi) continue;
      const c = candles[sg.i], x = X(sg.i), buy = sg.side === 'buy';
      const col = sg.div ? NN_COL[sg.side] : sg.range ? NN_COL.range : NN_COL[sg.side];
      const tw = Math.max(18, g.measureText(sg.label).width + 10), th = 15, ar = 5;
      let y = buy ? Y(c.l) + 6 : Y(c.h) - 6 - th; // etiqueta: debajo del mínimo (BUY) o encima del máximo (SELL)
      g.fillStyle = col; roundRect(x - tw / 2, buy ? y + ar : y, tw, th, 4); g.fill();
      g.beginPath(); // flecha
      if (buy) { g.moveTo(x - 4, y + ar); g.lineTo(x + 4, y + ar); g.lineTo(x, y); } else { g.moveTo(x - 4, y + th); g.lineTo(x + 4, y + th); g.lineTo(x, y + th + ar); }
      g.fill();
      g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(sg.label, x, (buy ? y + ar : y) + th / 2 + .5); g.textBaseline = 'alphabetic';
    }
    g.textAlign = 'left';
  }
  const sg = nn.last;
  if (I.nnTp && sg) { // solo la última señal conserva sus niveles (igual que el script original)
    const x1 = X(sg.i), x2 = Math.min(X(sg.i + 40), geo.w - geo.right), lv = [['entry', sg.price, 'rgba(150,150,150,.6)', [4, 3], ''], ['sl', sg.sl, NN_COL.sl, [], 'SL'], ['tp1', sg.tp1, NN_COL.tp1, [4, 3], 'TP1'], ['tp2', sg.tp2, NN_COL.tp2, [4, 3], 'TP2'], ['tp3', sg.tp3, NN_COL.tp3, [4, 3], 'TP3']];
    g.font = 'bold 8px system-ui';
    for (const [, price, col, dash, name] of lv) {
      const y = Y(price); g.strokeStyle = col; g.lineWidth = 1; g.setLineDash(dash);
      g.beginPath(); g.moveTo(Math.max(geo.left, x1), y); g.lineTo(x2, y); g.stroke(); g.setLineDash([]);
      if (name) { const tw = 26, lx = x2 - tw - 2; g.fillStyle = col; roundRect(lx, y - 7, tw, 14, 3); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(name, lx + tw / 2, y + 3); g.textAlign = 'left'; }
    }
  }
}
function drawNovaRules() {
  const txt = NovaNexus.defaults.rulesText.split('\n'), x2 = geo.w - geo.right - 4, small = geo.w < 480, y0 = geo.plotTop + (small ? 58 : 44);
  g.font = `${small ? 8 : 10}px system-ui`; const lh = small ? 11 : 14, wText = Math.max(...txt.map(t => g.measureText(t).width)) + 14, w = Math.max(wText, 70), x = x2 - w;
  g.save(); g.globalAlpha = .92;
  g.fillStyle = '#4361cf'; g.fillRect(x, y0, w, small ? 16 : 20);
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, y0 + (small ? 16 : 20), w, txt.length * lh + 8);
  g.globalAlpha = 1; g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `bold ${small ? 9 : 12}px system-ui`; g.fillText('REGLAS', x + w / 2, y0 + (small ? 12 : 14));
  g.textAlign = 'left'; g.font = `${small ? 8 : 10}px system-ui`;
  txt.forEach((t, i) => g.fillText(t, x + 6, y0 + (small ? 16 : 20) + 12 + i * lh));
  g.restore();
}
function drawNovaScore(sg) {
  const buy = sg.side === 'buy', col = NN_COL[buy ? 'buy' : 'sell'], txt = `${buy ? '▲ BUY' : '▼ SELL'}  ${sg.score} ${'★'.repeat(sg.score)}`;
  g.font = 'bold 10px system-ui'; const w = g.measureText(txt).width + 14, x = geo.w - geo.right - w - 4, y = geo.plotTop + geo.plotH - 20;
  g.fillStyle = 'rgba(0,0,0,.6)'; roundRect(x, y, w, 17, 4); g.fill(); g.fillStyle = col; g.textAlign = 'left'; g.fillText(txt, x + 7, y + 12);
}
function drawShape(d, selected, col, textCol) {
  const a = d.type === 'horizontal' ? {x: 0, y: Y(d.a.p)} : px(d.a), b = d.b ? px(d.b) : null;
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = selected ? 2.2 : 1.5; g.setLineDash([]);
  const rightX = geo.w - geo.right;
  if (d.type === 'horizontal') {
    g.beginPath(); g.moveTo(geo.left, a.y); g.lineTo(rightX, a.y); g.stroke();
    g.font = '10px system-ui'; g.fillRect(rightX + 2, a.y - 9, geo.right - 3, 18); g.fillStyle = '#10151f'; g.fillText(fmt(d.a.p), rightX + 5, a.y + 3.5);
  } else if (d.type === 'trend') {
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  } else if (d.type === 'rect') {
    g.globalAlpha = .13; g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); g.globalAlpha = 1;
    g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  } else if (d.type === 'fib') {
    const x1 = Math.min(a.x, b.x); g.font = '10px system-ui';
    FIB.forEach((lv, k) => {
      const pr = b_price(d, lv), yy = Y(pr);
      g.globalAlpha = lv === 0 || lv === 1 ? 1 : .75; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x1, yy); g.lineTo(rightX, yy); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = col; g.fillText(`${lv} (${fmt(pr)})`, Math.min(x1 + 4, rightX - 90), yy - 3);
      if (k < FIB.length - 1) { g.globalAlpha = .06; g.fillRect(x1, Math.min(yy, Y(b_price(d, FIB[k + 1]))), rightX - x1, Math.abs(Y(b_price(d, FIB[k + 1])) - yy)); g.globalAlpha = 1; }
    });
    g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
  }
  if (selected) for (const hnd of handlesOf(d)) { g.fillStyle = '#fff'; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(hnd.x, hnd.y, 7, 0, 7); g.fill(); g.stroke(); }
}

/* ───────── Gestos: pan, pellizco, retícula, dibujo ───────── */
const area = $('#chartArea'), ptrs = new Map();
let gest = null, pinch = null, lastTap = null;
const local = e => { const r = $('#priceCanvas').getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
area.addEventListener('pointerdown', e => {
  if (e.target.closest('.chart-controls,.draw-hint')) return;
  try { area.setPointerCapture(e.pointerId); } catch {} ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (!geo) return;
  if (ptrs.size === 2) { startPinch(); return; }
  if (ptrs.size > 2) return;
  const pt = local(e);
  gest = {id: e.pointerId, x0: e.clientX, y0: e.clientY, pan0: pan, moved: false, mode: 'pending', start: null, handle: null, timer: 0};
  if (drawTool) gest.start = snapPoint(pt);
  else if (selectedId) {
    const d = getDrawings().find(x => x.id === selectedId);
    const hnd = d && handlesOf(d).find(hh => Math.hypot(hh.x - pt.x, hh.y - pt.y) < 24);
    if (hnd) { gest.mode = 'handle'; gest.handle = hnd.key; }
  }
  if (gest.mode === 'pending' && !drawTool)
    gest.timer = setTimeout(() => { if (gest && !gest.moved && gest.mode === 'pending') { gest.mode = 'cross'; cross = pt; navigator.vibrate?.(8); scheduleRender(); } }, 380);
});
area.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (pinch && ptrs.size >= 2) { doPinch(); return; }
  if (!gest || e.pointerId !== gest.id || !geo) return;
  const pt = local(e);
  if (!gest.moved && Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0) > 8) { gest.moved = true; clearTimeout(gest.timer); if (gest.mode === 'pending' && !drawTool) gest.mode = 'pan'; }
  if (gest.mode === 'cross') { cross = pt; scheduleRender(); }
  else if (gest.mode === 'handle') {
    const arr = getDrawings(), d = arr.find(x => x.id === selectedId); if (!d) return;
    const s = snapPoint(pt);
    if (d.type === 'horizontal') d.a = {t: d.a.t, p: s.p}; else d[gest.handle] = s;
    scheduleRender();
  }
  else if (gest.mode === 'pan') { pan = gest.pan0 + (e.clientX - gest.x0) / geo.step; scheduleRender(); }
  else if (drawTool && gest.moved && drawTool !== 'horizontal') { preview = {a: gest.start, b: snapPoint(pt)}; scheduleRender(); }
});
function endPointer(e, cancelled) {
  const had = ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; if (!ptrs.size) gest = null; return; }
  if (!had || !gest || e.pointerId !== gest.id) return;
  const gs = gest; gest = null; clearTimeout(gs.timer);
  if (cancelled) { cross = null; preview = null; scheduleRender(); return; }
  if (gs.mode === 'cross') { cross = null; scheduleRender(); return; }
  if (gs.mode === 'handle') { save(); render(); return; }
  if (gs.mode === 'pan') return;
  if (!geo) return;
  const pt = local(e);
  if (drawTool) {
    if (drawTool === 'horizontal') { commitDrawing(snapPoint(pt)); return; }
    if (gs.moved && !pending) { preview = null; commitDrawing(gs.start, snapPoint(pt)); return; }
    if (!pending) { pending = gs.start; updateDrawUI(); scheduleRender(); return; }
    const a = pending; pending = null; commitDrawing(a, snapPoint(pt)); return;
  }
  // toque simple: doble toque ajusta; un toque selecciona/deselecciona un dibujo
  const now = Date.now();
  if (lastTap && now - lastTap.t < 300 && Math.hypot(pt.x - lastTap.x, pt.y - lastTap.y) < 24) { lastTap = null; fit(); return; }
  lastTap = {t: now, x: pt.x, y: pt.y};
  const hit = hitTest(pt); selectedId = hit ? hit.id : null; updateDrawUI(); render();
}
area.addEventListener('pointerup', e => endPointer(e, false));
area.addEventListener('pointercancel', e => endPointer(e, true));
function startPinch() {
  if (gest) clearTimeout(gest.timer); gest = null; cross = null; preview = null;
  const [a, b] = [...ptrs.values()], r = $('#priceCanvas').getBoundingClientRect(), cx = (a.x + b.x) / 2 - r.left;
  pinch = {d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, v0: visible, idx: IDX(cx)};
}
function doPinch() {
  const [a, b] = [...ptrs.values()], r = $('#priceCanvas').getBoundingClientRect(), cx = (a.x + b.x) / 2 - r.left;
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  visible = clamp(pinch.v0 * pinch.d0 / d, 15, 400);
  const step = geo.plotW / visible, start = pinch.idx + .5 - (cx - geo.left) / step;
  pan = candles.length - (start + visible); scheduleRender();
}
area.addEventListener('wheel', e => { e.preventDefault(); visible = clamp(visible * (e.deltaY > 0 ? 1.12 : .89), 15, 400); scheduleRender(); }, {passive: false});
function fit() { visible = defaultVisible(); pan = 0; render(); }
$('#zoomIn').onclick = () => { visible = clamp(visible / 1.3, 15, 400); render(); };
$('#zoomOut').onclick = () => { visible = clamp(visible * 1.3, 15, 400); render(); };
$('#fitChart').onclick = fit;
function syncFullscreenLabel() { $('#fullscreen').textContent = document.body.classList.contains('expanded') ? '⤓ Reducir' : '⛶ Expandir'; }
$('#fullscreen').onclick = () => { document.body.classList.toggle('expanded'); syncFullscreenLabel(); requestAnimationFrame(render); };
if (window.ResizeObserver) new ResizeObserver(() => scheduleRender()).observe(area);
window.addEventListener('resize', scheduleRender);

/* ───────── Tema, exportar e importar ───────── */
function theme() { document.body.classList.toggle('light', !!state.light); document.documentElement.style.colorScheme = state.light ? 'light' : 'dark'; render(); }
$('#themeBtn').onclick = $('#themeSetting').onclick = () => { state.light = !state.light; save(); theme(); };
$('#exportData').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'cryptochart-mobile-config.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
};
$('#importFile').onchange = async e => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(data.symbols) || typeof data.symbol !== 'string') throw Error();
    applyState(data); save(); toast('Configuración importada');
  } catch { toast('Archivo de configuración inválido'); }
  e.target.value = '';
};
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeSheet(); if (drawTool) { drawTool = ''; pending = null; preview = null; updateDrawUI(); }
  document.body.classList.remove('expanded'); syncFullscreenLabel(); requestAnimationFrame(render);
});



/* ───────── Mis scripts (Pine): guardado local + cuenta ───────── */
const SCRIPTS_KEY = 'cct_scripts_v1', SCRIPTS_MAX = 600 * 1024;
const scriptsKey = () => uid ? `${SCRIPTS_KEY}_${uid}` : SCRIPTS_KEY;
const readScripts = () => { const o = readLocal(scriptsKey()); return Array.isArray(o.items) ? o.items : []; };
let scripts = readScripts(), viewScriptId = null, scriptsRemote = '', scriptsTimer = 0;
const scriptsBytes = arr => arr.reduce((a, x) => a + (x.size || 0), 0);
function saveScripts() {
  try { localStorage.setItem(scriptsKey(), JSON.stringify({items: scripts})); } catch { toast('No se pudo guardar en este dispositivo (almacenamiento lleno)'); }
  pushScripts();
}
function pushScripts() {
  if (!uid || !db || !fbUser) return;
  clearTimeout(scriptsTimer);
  scriptsTimer = setTimeout(async () => {
    const str = JSON.stringify(scripts); if (str === scriptsRemote) return; scriptsRemote = str;
    try { await db.doc(`users/${uid}/data/scripts`).set({items: str, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); }
    catch { scriptsRemote = ''; toast('No se pudieron guardar los scripts en tu cuenta'); }
  }, 1200);
}
function addScript(code, fallbackName) {
  code = String(code || '').replace(/\r\n?/g, '\n');
  if (!code.trim()) { toast('El script está vacío'); return false; }
  const size = new Blob([code]).size;
  if (scriptsBytes(scripts) + size > SCRIPTS_MAX) { toast('Se pasa del límite de 600 KB de scripts por cuenta'); return false; }
  const m = code.match(/indicator\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/) || code.match(/strategy\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/);
  scripts.push({id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: (m ? m[1] : fallbackName || 'Script').slice(0, 80), code, size, lines: code.split('\n').length, addedAt: Date.now()});
  saveScripts(); renderScripts(); toast('Script guardado'); return true;
}
function renderScripts() {
  $('#scriptList').innerHTML = scripts.length ? scripts.map(x => `<div class="setting-row script-row"><div><b>${esc(x.name)}</b><small>${x.lines} líneas · ${Math.max(1, Math.round(x.size / 1024))} KB · guardado</small></div><div class="script-btns"><button class="small-button" data-view-script="${x.id}">Ver</button><button class="small-button danger" data-del-script="${x.id}" aria-label="Eliminar">✕</button></div></div>`).join('')
    : '<div class="setting-row"><div><b>Sin scripts guardados</b><small>Importa un archivo .pine o pega el código.</small></div></div>';
}
$('#scriptList').addEventListener('click', e => {
  const v = e.target.closest('[data-view-script]'), d = e.target.closest('[data-del-script]');
  if (v) { viewScriptId = v.dataset.viewScript; openSheet('script'); }
  if (d) { const x = scripts.find(y => y.id === d.dataset.delScript); if (x && confirm(`¿Eliminar "${x.name}"?`)) { scripts = scripts.filter(y => y.id !== x.id); saveScripts(); renderScripts(); } }
});
$('#pasteScript').onclick = () => openSheet('paste');
$('#scriptFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > SCRIPTS_MAX) { toast('El archivo es demasiado grande (máx. 600 KB)'); return; }
  addScript(await f.text(), f.name.replace(/\.[^.]+$/, ''));
};

/* ───────── Aplicar estado completo (importar / nube) ───────── */
function applyState(data, soft = false) {
  const sameChart = soft && data.symbol === state.symbol && data.interval === state.interval;
  state = merge(data); clearTransient(); theme(); renderIndicators(); countIndicators(); renderFrames(); renderWatch(); updateChartHeader();
  if (!sameChart) { closeWS(); candles = []; ind = {}; loadCandles(); }
}

/* ───────── Cuenta de Google + guardado en la nube (Firebase Auth + Firestore) ───────── */
function loadScript(src) { return new Promise((ok, fail) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = () => fail(Error('No se pudo cargar ' + src)); document.head.appendChild(el); }); }
function renderAccount() {
  const box = $('#accountBox'), top = $('#accountBtn');
  if (!cloudEnabled) {
    top.hidden = true;
    box.innerHTML = `<div class="setting-row"><div><b>Cuenta de Google</b><small>No configurada. Tus datos se guardan solo en este dispositivo. Quien administra la app debe completar <code>firebase-config.js</code>.</small></div><span class="pill">Desactivada</span></div>`;
    return;
  }
  if (fbUser) {
    top.hidden = false; top.innerHTML = fbUser.photoURL ? `<img src="${esc(fbUser.photoURL)}" alt="" referrerpolicy="no-referrer">` : '👤'; top.title = 'Cuenta';
    box.innerHTML = `<div class="setting-row account-row">${fbUser.photoURL ? `<img class="avatar" src="${esc(fbUser.photoURL)}" alt="" referrerpolicy="no-referrer">` : '<span class="avatar">👤</span>'}<div><b>${esc(fbUser.displayName || 'Cuenta de Google')}</b><small>${esc(fbUser.email || '')}<br>${esc(syncStatus)}</small></div></div><button class="setting-row action-row" id="signOutBtn"><span>Cerrar sesión</span><span>⏻</span></button>`;
    $('#signOutBtn').onclick = signOut;
  } else {
    top.hidden = false; top.textContent = 'Iniciar sesión'; top.title = 'Iniciar sesión con Google';
    box.innerHTML = `<div class="setting-row"><div><b>Guarda todo en tu cuenta</b><small>${esc(syncStatus) || 'Inicia sesión con Google para conservar tu seguimiento, indicadores y dibujos en cualquier dispositivo.'}</small></div></div><button class="google-btn" id="signInBtn"><span class="g">G</span> Iniciar sesión con Google</button>`;
    $('#signInBtn').onclick = signIn;
  }
}
$('#accountBtn').onclick = () => { if (fbUser) switchView('settingsView'); else signIn(); };
async function signIn() {
  if (!auth) { toast('El servicio de cuentas no está disponible'); return; }
  const provider = new firebase.auth.GoogleAuthProvider(); provider.setCustomParameters({prompt: 'select_account'});
  try { await auth.signInWithPopup(provider); }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) { auth.signInWithRedirect(provider); return; }
    if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) toast('No se pudo iniciar sesión: ' + (e.code || e.message));
  }
}
function signOut() { if (auth) auth.signOut(); }
async function onUser(user) {
  if (unsubCloud) { unsubCloud(); unsubCloud = null; }
  clearTimeout(pushTimer); fbUser = user;
  if (!user) {
    try { localStorage.removeItem(LASTUID); } catch {}
    if (uid) { uid = null; lastRemote = ''; scriptsRemote = ''; applyState(readLocal(STORE)); scripts = readScripts(); renderScripts(); } // vuelve al estado local sin sesión; los datos de la cuenta no se quedan visibles
    syncStatus = ''; renderAccount(); return;
  }
  uid = user.uid; try { localStorage.setItem(LASTUID, uid); } catch {}
  scripts = readScripts(); scriptsRemote = ''; renderScripts();
  syncStatus = 'Sincronizando…'; renderAccount();
  const ref = db.doc(CLOUD_DOC(uid));
  try {
    const snap = await ref.get();
    if (snap.exists && snap.data().state) { lastRemote = snap.data().state; applyState(JSON.parse(lastRemote)); save(); }
    else { // primera vez en esta cuenta: se sube lo que ya había en este dispositivo
      const mine = JSON.stringify(state); lastRemote = mine; save();
      await ref.set({state: mine, updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
    }
    unsubCloud = ref.onSnapshot(sn => { // cambios hechos desde otro dispositivo
      if (sn.metadata.hasPendingWrites || !sn.exists) return;
      const str = sn.data().state; if (!str || str === lastRemote) return;
      lastRemote = str; try { applyState(JSON.parse(str), true); save(); } catch {}
    }, () => {});
    const sref = db.doc(`users/${uid}/data/scripts`), ssnap = await sref.get();
    if (ssnap.exists && ssnap.data().items) { scriptsRemote = ssnap.data().items; try { scripts = JSON.parse(scriptsRemote); localStorage.setItem(scriptsKey(), JSON.stringify({items: scripts})); renderScripts(); } catch {} }
    else if (scripts.length) { scriptsRemote = JSON.stringify(scripts); await sref.set({items: scriptsRemote, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); }
    syncStatus = 'Guardado en tu cuenta';
  } catch (e) { syncStatus = 'No se pudo sincronizar (' + (e.code || 'error') + '). Tus datos siguen guardados en este dispositivo.'; }
  renderAccount();
}
function cloudPush() {
  if (!uid || !db || !fbUser) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const str = JSON.stringify(state); if (str === lastRemote) return;
    lastRemote = str;
    try { await db.doc(CLOUD_DOC(uid)).set({state: str, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); syncStatus = 'Guardado en tu cuenta'; }
    catch { syncStatus = 'No se pudo guardar en la nube. Se reintentará al próximo cambio.'; lastRemote = ''; }
    renderAccount();
  }, 1200);
}
async function initCloud() {
  renderAccount();
  if (!cloudEnabled) return;
  try {
    const B = 'https://www.gstatic.com/firebasejs/10.12.2/';
    await loadScript(B + 'firebase-app-compat.js');
    await Promise.all([loadScript(B + 'firebase-auth-compat.js'), loadScript(B + 'firebase-firestore-compat.js')]);
    firebase.initializeApp(CFG); auth = firebase.auth(); db = firebase.firestore();
    auth.getRedirectResult().catch(e => toast('No se pudo iniciar sesión: ' + (e.code || e.message)));
    auth.onAuthStateChanged(onUser);
  } catch { syncStatus = 'No se pudo contactar con el servicio de cuentas.'; renderAccount(); }
}

/* ───────── Arranque ───────── */
renderFrames(); renderIndicators(); countIndicators(); renderWatch(); updateChartHeader(); updateDrawUI(); theme(); syncFullscreenLabel(); renderScripts();
fetchTicker(); loadCandles(); initCloud();
setInterval(fetchTicker, 30000);
setInterval(() => { if (currentView === 'chartView' && !wsOpen && candles.length && !document.hidden) loadCandles(true); }, 20000);
})();
