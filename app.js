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
const FIBEXT = [0, .618, 1, 1.272, 1.618, 2.618];
const ONEPT = ['horizontal', 'vertical', 'text', 'marker'], THREEPT = ['channel', 'fibext'];

/* ───────── Estado persistente ───────── */
const defaults = {
  symbols: ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT'],
  symbol: 'BTCUSDT', interval: '1h',
  indicators: {ema20:true, ema50:false, sma200:false, wma20:false, bollinger:false, vwap:false, supertrend:false, cross:false, rsi:true, macd:false, stoch:false, atr:false, obv:false, volume:true, nnIa:false, nnEma:false, nnTp:false, nnRules:false, nnSmc:false, nnOb:false, nnTrail:false, nnRev:false, nnSR:false, nnPiv:false, nnLiq:false, nnLiqBars:false, nnVP:false},
  light: false, chartStyle: {}, stdParams: {}, drawings: {}, brush: {c: '#e9c36e', w: 3}, pine: [], novaSaved: null, novaParams: {}, alerts: []
};
function sanAlert(a) {
  if (!a || typeof a.id !== 'string' || !/^[A-Z0-9]{3,20}$/.test(a.symbol)) return null;
  const base0 = {id: a.id, symbol: a.symbol, on: a.on !== false, note: String(a.note || '').slice(0, 80), created: +a.created || 0, firedAt: +a.firedAt || 0};
  if (a.kind === 'ind') {
    if (!(a.interval in IV_MS) || !['pine', 'std', 'nova'].includes(a.src) || !a.spec || typeof a.spec !== 'object' || JSON.stringify(a.spec).length > 400) return null;
    return Object.assign(base0, {kind: 'ind', interval: a.interval, src: a.src, sid: typeof a.sid === 'string' ? a.sid.slice(0, 40) : '', spec: JSON.parse(JSON.stringify(a.spec)), label: String(a.label || '').slice(0, 120), repeat: a.repeat === 'every' ? 'every' : 'once', lastBar: +a.lastBar || 0, firedInfo: String(a.firedInfo || '').slice(0, 200)});
  }
  if (!Number.isFinite(a.price) || !(a.price > 0) || (a.dir !== 'up' && a.dir !== 'down')) return null;
  return Object.assign(base0, {price: a.price, dir: a.dir, firedPrice: Number.isFinite(a.firedPrice) ? a.firedPrice : null});
}
const CHART_DEF = {bg: '', grid: '', gridH: true, gridV: true, up: '#20bf9f', down: '#f06b79', upBorder: '', downBorder: '', upWick: '', downWick: '', hollow: false};
function sanChartStyle(c) {
  const o = {}; if (!c || typeof c !== 'object' || Array.isArray(c)) return o;
  for (const k of ['bg', 'grid', 'up', 'down', 'upBorder', 'downBorder', 'upWick', 'downWick']) if (typeof c[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(c[k])) o[k] = c[k];
  for (const k of ['gridH', 'gridV', 'hollow']) if (typeof c[k] === 'boolean') o[k] = c[k];
  return o;
}
const STD_SCHEMA = {
  ema20: [['len', 'Período', 'int', 20, 1, 500], ['color', 'Color y opacidad', 'color', '#f5c568'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Sólida', 0, 0, ['Sólida', 'Guiones', 'Puntos']]], ema50: [['len', 'Período', 'int', 50, 1, 500], ['color', 'Color y opacidad', 'color', '#6ca5f9'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Sólida', 0, 0, ['Sólida', 'Guiones', 'Puntos']]],
  sma200: [['len', 'Período', 'int', 200, 1, 1000], ['color', 'Color y opacidad', 'color', '#b58dff'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Sólida', 0, 0, ['Sólida', 'Guiones', 'Puntos']]], wma20: [['len', 'Período', 'int', 20, 1, 500], ['color', 'Color y opacidad', 'color', '#4dd0e1'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Sólida', 0, 0, ['Sólida', 'Guiones', 'Puntos']]],
  bollinger: [['len', 'Período', 'int', 20, 2, 500], ['mult', 'Desviaciones', 'float', 2, .1, 10], ['color', 'Color y opacidad', 'color', '#748bab'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Guiones', 0, 0, ['Sólida', 'Guiones', 'Puntos']], ['fill', 'Relleno entre bandas', 'color', '#748bab00']],
  rsi: [['len', 'Período', 'int', 14, 2, 200], ['color', 'Color y opacidad', 'color', '#bb9cff'], ['width', 'Grosor', 'int', 2, 1, 6], ['ob', 'Nivel sobrecompra', 'int', 70, 50, 100], ['os', 'Nivel sobreventa', 'int', 30, 0, 50]],
  macd: [['fast', 'Rápida', 'int', 12, 1, 200], ['slow', 'Lenta', 'int', 26, 2, 400], ['sig', 'Señal', 'int', 9, 1, 100], ['cLine', 'Color línea MACD', 'color', '#548fff'], ['cSig', 'Color señal', 'color', '#f5a623'], ['hUp', 'Histograma positivo', 'color', '#20bf9f'], ['hDn', 'Histograma negativo', 'color', '#f06b79'], ['width', 'Grosor', 'int', 1, 1, 6]],
  stoch: [['k', 'Longitud %K', 'int', 14, 1, 200], ['ks', 'Suavizado %K', 'int', 3, 1, 50], ['d', 'Suavizado %D', 'int', 3, 1, 50], ['cK', 'Color %K', 'color', '#548fff'], ['cD', 'Color %D', 'color', '#f5a623'], ['lo', 'Nivel inferior', 'int', 20, 0, 50], ['hi', 'Nivel superior', 'int', 80, 50, 100], ['width', 'Grosor', 'int', 1, 1, 6]],
  atr: [['len', 'Período', 'int', 14, 1, 200], ['color', 'Color y opacidad', 'color', '#e07b53'], ['width', 'Grosor', 'int', 1, 1, 6]],
  supertrend: [['len', 'Período ATR', 'int', 10, 1, 200], ['factor', 'Factor', 'float', 3, .1, 20], ['up', 'Color alcista', 'color', '#20bf9f'], ['down', 'Color bajista', 'color', '#f06b79'], ['width', 'Grosor', 'int', 1, 1, 6]],
  vwap: [['color', 'Color y opacidad', 'color', '#ff8a65'], ['width', 'Grosor', 'int', 1, 1, 6], ['dash', 'Estilo de línea', 'string', 'Sólida', 0, 0, ['Sólida', 'Guiones', 'Puntos']]], obv: [['color', 'Color y opacidad', 'color', '#2ec4b6'], ['width', 'Grosor', 'int', 1, 1, 6]],
  volume: [['up', 'Color alcista y opacidad', 'color', '#20bf9faa'], ['down', 'Color bajista y opacidad', 'color', '#f06b79aa']]
};
const sp = (key, name) => { const v = state.stdParams && state.stdParams[key] && state.stdParams[key][name]; if (v !== undefined) return v; const e = (STD_SCHEMA[key] || []).find(x => x[0] === name); return e ? e[3] : undefined; };
function sanStdParams(p) {
  const o = {}; if (!p || typeof p !== 'object' || Array.isArray(p)) return o;
  for (const key of Object.keys(STD_SCHEMA)) { const src = p[key]; if (!src || typeof src !== 'object') continue; const q = {};
    for (const [nm, , type, def, mn, mx, opts] of STD_SCHEMA[key]) { const v = src[nm]; if (type === 'color') { if (typeof v === 'string' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v) && v !== def) q[nm] = v; } else if (type === 'string') { if (typeof v === 'string' && opts && opts.includes(v) && v !== def) q[nm] = v; } else if (Number.isFinite(v)) { const x = type === 'int' ? Math.round(v) : v; if (x >= mn && x <= mx && x !== def) q[nm] = x; } }
    if (Object.keys(q).length) o[key] = q; }
  return o;
}
const DASHES = {'Sólida': [], 'Guiones': [6, 4], 'Puntos': [1.5, 3]};
const lineSty = key => ({w: sp(key, 'width') || 1.4, d: DASHES[sp(key, 'dash')] || []});
const cstyle = () => Object.assign({}, CHART_DEF, state.chartStyle || {});
function merge(s) {
  const o = {...structuredClone(defaults), ...s};
  o.indicators = {...defaults.indicators, ...(s.indicators || {})};
  if (!o.drawings || typeof o.drawings !== 'object' || Array.isArray(o.drawings)) o.drawings = {};
  { // pincel: solo trazos bien formados y de tamaño acotado (el estado completo viaja en un documento de Firestore de máx. 1 MB)
    const okPt = q => Array.isArray(q) && q.length === 2 && Number.isFinite(q[0]) && Number.isFinite(q[1]);
    for (const k of Object.keys(o.drawings)) {
      const arr = Array.isArray(o.drawings[k]) ? o.drawings[k] : [];
      const clean = arr.filter(d => d && typeof d === 'object' && (d.type !== 'brush' || (Array.isArray(d.pts) && d.pts.length >= 2 && d.pts.length <= 400 && d.pts.every(okPt)))).slice(-300)
        .map(d => d.type === 'brush' ? {id: String(d.id || '').slice(0, 16), type: 'brush', pts: d.pts, a: {t: d.pts[0][0], p: d.pts[0][1]}, col: /^#[0-9a-f]{6}$/i.test(d.col) ? d.col : '#e9c36e', w: Math.max(1, Math.min(14, +d.w || 3))} : d);
      if (clean.length) o.drawings[k] = clean; else delete o.drawings[k];
    }
    const bq = o.brush && typeof o.brush === 'object' ? o.brush : {};
    o.brush = {c: /^#[0-9a-f]{6}$/i.test(bq.c) ? bq.c : '#e9c36e', w: [2, 4, 7].includes(+bq.w) ? +bq.w : 3};
  }
  o.novaParams = o.novaParams && typeof o.novaParams === 'object' && !Array.isArray(o.novaParams) ? Object.fromEntries(Object.entries(o.novaParams).filter(([k, v]) => /^[a-zA-Z0-9]{1,24}$/.test(k) && (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || (typeof v === 'string' && v.length < 400))).slice(0, 120)) : {};
  o.novaSaved = o.novaSaved && typeof o.novaSaved === 'object' && !Array.isArray(o.novaSaved) ? o.novaSaved : null;
  o.pine = Array.isArray(o.pine) ? o.pine.filter(p => p && typeof p.sid === 'string').slice(0, 12).map(p => Object.assign({sid: p.sid, on: p.on !== false, inputs: p.inputs && typeof p.inputs === 'object' && !Array.isArray(p.inputs) ? p.inputs : {}}, p.style && typeof p.style === 'object' && !Array.isArray(p.style) ? {style: p.style} : {}, p.vis && typeof p.vis === 'object' && !Array.isArray(p.vis) ? {vis: p.vis} : {}, ['main', 'top', 'bottom'].includes(p.pane) ? {pane: p.pane} : {}, p.hide === true ? {hide: true} : {})) : [];
  { // Nova Nexus: queda un solo indicador, el completo (Pine, en Mis indicadores). El módulo nativo antiguo se apaga y, si estaba encendido, se pasa al completo para no perderlo
    const nnKeys = Object.keys(o.indicators).filter(k => /^nn[A-Z]/.test(k)), nnWasOn = nnKeys.some(k => o.indicators[k]);
    nnKeys.forEach(k => { o.indicators[k] = false; }); o.novaSaved = null;
    if (nnWasOn && !o.pine.some(p => p.sid === 'cat:nova-nexus') && o.pine.length < 12) o.pine.unshift({sid: 'cat:nova-nexus', on: true, inputs: {}});
  }
  o.chartStyle = sanChartStyle(o.chartStyle); o.stdParams = sanStdParams(o.stdParams);
  o.alerts = Array.isArray(o.alerts) ? o.alerts.map(sanAlert).filter(Boolean).slice(0, 50) : [];
  if (!Array.isArray(o.symbols) || !o.symbols.length) o.symbols = [...defaults.symbols];
  if (!INTERVALS.includes(o.interval)) o.interval = '1h';
  if (typeof o.symbol !== 'string') o.symbol = o.symbols[0];
  return o;
}
/* Cuenta de Google (Firebase) — opcional: se activa si firebase-config.js define window.CCT_FIREBASE */
const CFG = window.CCT_FIREBASE, cloudEnabled = !!(CFG && CFG.apiKey && CFG.projectId);
const LASTUID = 'cct_last_uid', CLOUD_DOC = u => `users/${u}/data/cct_mobile`;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
let uid = cloudEnabled ? lsGet(LASTUID) : null, fbUser = null, auth = null, db = null, unsubCloud = null, unsubScripts = null, pushTimer = 0, lastRemote = '', syncStatus = '';
const storeKey = () => uid ? `${STORE}_${uid}` : STORE;
const readLocal = key => { try { return JSON.parse(lsGet(key) || '{}'); } catch { return {}; } };
let state = merge(readLocal(storeKey()));
const dirtyKey = () => uid ? `${STORE}_dirty_${uid}` : null;
const save = () => { try { localStorage.setItem(storeKey(), JSON.stringify(state)); const dk = dirtyKey(); if (dk) localStorage.setItem(dk, String(Date.now())); } catch {} cloudPush(); };

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
let pineLastMs = 0, pineRes = {}, pineBusy = {}, pineDirty = {}, pineLast = 0, pineTimer = 0, pineKey = '', pineDraft = {name: '', code: ''}, pineSetSid = null, pineWorker = null, pineNoWorker = false, pineSeq = 0;
const PINE_MAX = 6;
let drawTool = '', pending = null, pending2 = null, preview = null, selectedId = null, cross = null, geo = null;
let priceMan = null, lastAxisTap = 0; // escala de precio manual {min,max}; null = automática
let ws = null, wsGen = 0, wsOpen = false, wsRetry = 0;
const lastShown = {};

/* ───────── Navegación ───────── */
const deskMQ = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : {matches: false};
const isDesktop = () => deskMQ.matches;
function setSide(id) {
  document.body.dataset.side = id;
  $$('.side-tabs button').forEach(b => b.classList.toggle('active', b.dataset.side === id));
}
function switchView(id) {
  if (isDesktop()) { // computadora: seguimiento + gráfico siempre visibles; Indicadores/Ajustes en el panel derecho
    if (id === 'newsView' || id === 'aiView' || id === 'settingsView' || id === 'alertsView') { setSide(id); if (id === 'alertsView') { renderAlerts(); checkAlertsPoll(); } return; }
    id = 'chartView';
  }
  currentView = id;
  $$('.view').forEach(x => x.classList.toggle('active', x.id === id));
  $$('.bottom-nav button').forEach(x => x.classList.toggle('active', x.dataset.view === id));
  document.body.classList.toggle('chart-mode', id === 'chartView');
  if (id !== 'chartView') document.body.classList.remove('expanded');
  if (id === 'chartView') requestAnimationFrame(() => { if (!candles.length) loadCandles(); render(); });
  if (id === 'watchView') renderWatch();
  if (id === 'alertsView') { renderAlerts(); checkAlertsPoll(); }
  if (isDesktop()) renderWatch();
  syncFullscreenLabel();
}
$$('.bottom-nav button').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
$('#settingsBtn').onclick = () => switchView('settingsView');
$$('.side-tabs button').forEach(b => b.addEventListener('click', () => setSide(b.dataset.side)));
function onLayoutChange() {
  if (isDesktop()) { setSide(document.body.dataset.side || 'newsView'); switchView('chartView'); }
  else { delete document.body.dataset.side; document.body.classList.remove('expanded'); switchView('watchView'); }
  requestAnimationFrame(() => { if (candles.length) { visible = defaultVisible(); pan = 0; } render(); });
}
if (deskMQ.addEventListener) deskMQ.addEventListener('change', onLayoutChange);

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
    renderWatch(); updateChartHeader(); checkAlertsPoll();
  } catch {
    updateStatus(false, 'Sin conexión'); renderWatch();
    if (!candles.length) setFeedback('No hay datos. Revisa tu conexión o posibles restricciones de Binance en tu país.');
  }
}


/* ───────── Alertas de precio ───────── */
const alertPrice = {}; // último precio conocido por símbolo (para alertas fuera del seguimiento)
function alertBeep() { try { const A = window.AudioContext || window.webkitAudioContext, c = new A(), o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.setValueAtTime(.2, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .6); o.start(); o.stop(c.currentTime + .6); } catch {} }
function fireAlert(a, price) {
  a.on = false; a.firedAt = Date.now(); a.firedPrice = price;
  const msg = `${base(a.symbol)} ${a.dir === 'up' ? 'subió a' : 'bajó a'} ${fmt(a.price)} (ahora ${fmt(price)})${a.note ? ' · ' + a.note : ''}`;
  toast('🔔 ' + msg); alertBeep(); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
  try { if (window.Notification && Notification.permission === 'granted') new Notification('CryptoChart · Alerta', {body: msg}); } catch {}
}
function checkAlerts(sym, price) {
  if (!Number.isFinite(price)) return;
  alertPrice[sym] = price; let hit = false;
  for (const a of state.alerts) if (a.kind !== 'ind' && a.on && a.symbol === sym && (a.dir === 'up' ? price >= a.price : price <= a.price)) { fireAlert(a, price); hit = true; }
  if (hit) { save(); renderAlerts(); }
}
async function checkAlertsPoll() {
  const syms = [...new Set(state.alerts.filter(a => a.kind !== 'ind' && a.on).map(a => a.symbol))]; if (!syms.length) return;
  try {
    const data = await getJSON(`${API}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(syms))}`);
    for (const t of data) checkAlerts(t.symbol, +t.price);
  } catch {}
  if (currentView === 'alertsView') renderAlerts();
}
function curPrice(sym) { const t = tickers[sym]; return Number.isFinite(+t?.lastPrice) && t ? +t.lastPrice : alertPrice[sym]; }
function renderAlerts() {
  const el = $('#alertList'); if (!el) return;
  const act = state.alerts.filter(a => a.on), done = state.alerts.filter(a => !a.on);
  const row = a => { if (a.kind === 'ind') { const missing = a.src === 'pine' && !scripts.some(s => s.id === a.sid);
      return `<div class="setting-row alert-row ${a.on ? '' : 'dim'}"><div><b>${esc(a.label)}</b><small>${esc(base(a.symbol))} · ${a.interval} · ${a.repeat === 'every' ? 'cada vez' : 'una vez'}${missing ? ' · <span class="pine-err">el script ya no existe</span>' : ''}${a.firedAt ? ` · última: ${new Date(a.firedAt).toLocaleString()}${a.firedInfo ? ' (' + esc(a.firedInfo) + ')' : ''}` : ''}${a.note ? ' · ' + esc(a.note) : ''}</small></div><div class="alert-btns">${a.on ? '' : `<button class="small-button" data-al-re="${a.id}">Reactivar</button>`}<button class="small-button" data-al-del="${a.id}" aria-label="Eliminar">✕</button></div></div>`; }
    const p = curPrice(a.symbol), dist = Number.isFinite(p) ? ((a.price - p) / p * 100) : NaN;
    return `<div class="setting-row alert-row ${a.on ? '' : 'dim'}"><div><b>${esc(base(a.symbol))} ${a.dir === 'up' ? '≥' : '≤'} ${fmt(a.price)}</b><small>${a.on ? `Ahora ${fmt(p)}${Number.isFinite(dist) ? ` · a ${Math.abs(dist).toFixed(2)}%` : ''}` : `Se disparó ${new Date(a.firedAt).toLocaleString()} a ${fmt(a.firedPrice)}`}${a.note ? ' · ' + esc(a.note) : ''}</small></div><div class="alert-btns">${a.on ? '' : `<button class="small-button" data-al-re="${a.id}">Reactivar</button>`}<button class="small-button" data-al-del="${a.id}" aria-label="Eliminar">✕</button></div></div>`; };
  el.innerHTML = (act.length ? `<div class="section-label">ACTIVAS (${act.length})</div>` + act.map(row).join('') : '<div class="soon"><div class="soon-ic">◔</div><b>Sin alertas activas</b><small>Crea una abajo y te avisaremos cuando el precio llegue.</small></div>') + (done.length ? `<div class="section-label">DISPARADAS</div>` + done.map(row).join('') : '');
  const sel = $('#alSym'); if (sel && !sel.dataset.ready) { sel.dataset.ready = 1; sel.innerHTML = state.symbols.map(s => `<option value="${s}">${esc(base(s))}/USDT</option>`).join(''); }
  if (sel) { const s = state.symbols; if ([...sel.options].map(o => o.value).join() !== s.join()) { const v = sel.value; sel.innerHTML = s.map(x => `<option value="${x}">${esc(base(x))}/USDT</option>`).join(''); if (s.includes(v)) sel.value = v; } }
}
$('#alInd').onclick = openIndAlertDialog;
$('#alAdd').onclick = async () => {
  const sym = $('#alSym').value, price = parseFloat(String($('#alPrice').value).replace(',', '.')), note = $('#alNote').value.trim();
  if (!sym || !(price > 0)) { toast('Escribe un precio válido'); return; }
  let p = curPrice(sym);
  if (!Number.isFinite(p)) { try { p = +(await getJSON(`${API}/ticker/price?symbol=${sym}`)).price; } catch {} }
  if (!Number.isFinite(p)) { toast('No pude leer el precio actual; revisa tu conexión'); return; }
  if (price === p) { toast('El precio ya está en ese nivel'); return; }
  if (state.alerts.length >= 50) { toast('Máximo 50 alertas'); return; }
  state.alerts.unshift({id: 'al' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), symbol: sym, price, dir: price > p ? 'up' : 'down', on: true, note: note.slice(0, 80), created: Date.now(), firedAt: 0, firedPrice: null});
  alertPrice[sym] = p; $('#alPrice').value = ''; $('#alNote').value = ''; save(); renderAlerts(); toast('Alerta creada');
  try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch {}
};
$('#alertsView').addEventListener('click', e => {
  const d = e.target.closest('[data-al-del]'), r = e.target.closest('[data-al-re]');
  if (d) { state.alerts = state.alerts.filter(a => a.id !== d.dataset.alDel); save(); renderAlerts(); }
  if (r) { const a = state.alerts.find(x => x.id === r.dataset.alRe), p = curPrice(a?.symbol); if (a && a.kind === 'ind') { a.on = true; a.firedAt = 0; a.firedInfo = ''; lastClosedBar(a.symbol, a.interval).then(t => { if (t != null) a.lastBar = t; save(); renderAlerts(); }); } else if (a) { a.dir = Number.isFinite(p) ? (a.price > p ? 'up' : 'down') : a.dir; a.on = true; a.firedAt = 0; a.firedPrice = null; save(); renderAlerts(); checkAlertsPoll(); } }
});

/* ───────── Alertas con indicadores ─────────
   Se evalúan sobre la ÚLTIMA VELA CERRADA (sin repintado) del símbolo y temporalidad elegidos, aunque no estén en el gráfico.
   Fuentes: indicadores comunes, Nova Nexus (señales) y cualquier script Pine (alertcondition, alert(), formas y cruces de líneas). */
const STD_CONDS = [
  ['ema_x_up', 'EMA 20 cruza al alza la EMA 50'], ['ema_x_dn', 'EMA 20 cruza a la baja la EMA 50'],
  ['px_ema20_up', 'Precio cruza al alza la EMA 20'], ['px_ema20_dn', 'Precio cruza a la baja la EMA 20'],
  ['px_sma200_up', 'Precio cruza al alza la SMA 200'], ['px_sma200_dn', 'Precio cruza a la baja la SMA 200'],
  ['rsi_up', 'RSI cruza al alza el nivel'], ['rsi_dn', 'RSI cruza a la baja el nivel'],
  ['macd_up', 'MACD cruza al alza su señal'], ['macd_dn', 'MACD cruza a la baja su señal'],
  ['bb_up', 'Cierre rompe por encima la banda superior de Bollinger'], ['bb_dn', 'Cierre rompe por debajo la banda inferior de Bollinger'],
  ['st_up', 'Supertrend cambia a alcista'], ['st_dn', 'Supertrend cambia a bajista']
];
const crossUp = (a, b, k) => k > 0 && a[k] != null && b[k] != null && a[k - 1] != null && b[k - 1] != null && a[k - 1] <= b[k - 1] && a[k] > b[k];
const crossDn = (a, b, k) => k > 0 && a[k] != null && b[k] != null && a[k - 1] != null && b[k - 1] != null && a[k - 1] >= b[k - 1] && a[k] < b[k];
function stdHit(cs, k, spec) {
  const c = cs.map(x => x.c), T = window.CCTIndicators, K = spec.k, flat = v => c.map(() => v);
  if (K === 'ema_x_up' || K === 'ema_x_dn') { const a = ema(c, 20), b = ema(c, 50); return (K === 'ema_x_up' ? crossUp : crossDn)(a, b, k); }
  if (K === 'px_ema20_up' || K === 'px_ema20_dn') return (K.endsWith('up') ? crossUp : crossDn)(c, ema(c, 20), k);
  if (K === 'px_sma200_up' || K === 'px_sma200_dn') return (K.endsWith('up') ? crossUp : crossDn)(c, sma(c, 200), k);
  if (K === 'rsi_up' || K === 'rsi_dn') { const r = rsi(c, 14), L = Number.isFinite(+spec.lvl) ? +spec.lvl : (K === 'rsi_up' ? 70 : 30); return (K === 'rsi_up' ? crossUp : crossDn)(r, flat(L), k); }
  if (K === 'macd_up' || K === 'macd_dn') { if (!T) return false; const m = T.macd(c); return (K === 'macd_up' ? crossUp : crossDn)(m.macd || m.line, m.signal || m.sig, k); }
  if (K === 'bb_up' || K === 'bb_dn') { const m = sma(c, 20), band = i => { if (i < 19 || m[i] == null) return null; let s = 0; for (let q = i - 19; q <= i; q++) { const d = c[q] - m[i]; s += d * d; } return Math.sqrt(s / 20) * 2; }, d1 = band(k), d0 = band(k - 1); if (d1 === null || d0 === null) return false; return K === 'bb_up' ? (c[k] > m[k] + d1 && c[k - 1] <= m[k - 1] + d0) : (c[k] < m[k] - d1 && c[k - 1] >= m[k - 1] - d0); } // primer cierre fuera de la banda
  if (K === 'st_up' || K === 'st_dn') { if (!T) return false; const st = T.supertrend(cs, 10, 3), d = st && st.dir; if (!d || k < 1 || d[k] == null || d[k - 1] == null) return false; return K === 'st_up' ? (d[k] < 0 && d[k - 1] >= 0) : (d[k] > 0 && d[k - 1] <= 0); } // en Supertrend dir = -1 es tendencia alcista
  return false;
}
function novaOpts() {
  const I = state.indicators, NP = novaP;
  return {smc: !!(I.nnSmc || I.nnOb), emaLen: NP('emaLen'), emaMult: NP('emaMult'), minScore: NP('minScore'), cooldown: NP('cooldown'), cdBoth: NP('cdBoth'), slMult: NP('slMult'), tp1Mult: NP('tp1'), tp2Mult: NP('tp2'), tp3Mult: NP('tp3'), tpBars: NP('tpBars'), smcOpts: {mslen: NP('smcLen'), window: NP('smcWindow'), swingLimit: NP('smcSwing'), sweep: NP('smcSweep'), oblast: NP('obLast'), obmiti: NP('obMiti')}};
}
function pineSeriesAt(res, s, cs, k) { // s: {p: idPlot} | {price:1} | {n: número}
  if (s.price) return cs[k] ? cs[k].c : null;
  if (s.n !== undefined) return +s.n;
  const pl = res.plots.find(x => x.id === s.p); const v = pl && pl.values ? pl.values[k] : null; return v === undefined || v === null || Number.isNaN(v) ? null : v;
}
function pineHit(res, spec, cs, k) { // → {hit, msg}
  if (spec.t === 'ac') {
    const it = (res.alerts || []).find(x => x.kind === spec.kind && x.title === spec.title) || (res.alerts || [])[spec.i];
    if (!it) return {hit: false}; const hit = it.bars.includes(k); return {hit, msg: hit ? (it.msgs[k] || it.message || it.title) : ''};
  }
  if (spec.t === 'sh') { const sh = res.shapes.find(x => x.title === spec.title && x.kind === spec.kind) || res.shapes[spec.i]; const hit = !!(sh && sh.pts.some(p => p[0] === k)); return {hit, msg: hit ? (sh.title || 'Señal') : ''}; }
  if (spec.t === 'x') {
    const A = i => pineSeriesAt(res, spec.a, cs, i), B = i => pineSeriesAt(res, spec.b, cs, i), a0 = A(k - 1), a1 = A(k), b0 = B(k - 1), b1 = B(k);
    if ([a0, a1, b0, b1].some(v => v === null)) return {hit: false};
    const hit = spec.dir === 'up' ? (a0 <= b0 && a1 > b1) : (a0 >= b0 && a1 < b1); return {hit, msg: ''};
  }
  return {hit: false};
}
function indSummary(a) { // texto legible de una alerta de indicador
  return a.label || 'Indicador';
}
const alGroups = new Map(); let alBusy = false;
function closedIdx(cs, lastClosedT) { for (let i = cs.length - 1; i >= 0; i--) if (cs[i].t === lastClosedT) return i; return -1; }
function fireInd(a, info) {
  a.firedAt = Date.now(); a.firedInfo = info; if (a.repeat === 'once') a.on = false;
  const msg = `${base(a.symbol)} ${a.interval} · ${a.label}${info ? ' · ' + info : ''}${a.note ? ' · ' + a.note : ''}`;
  toast('🔔 ' + msg); alertBeep(); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {}
  try { if (window.Notification && Notification.permission === 'granted') new Notification('CryptoChart · Alerta', {body: msg}); } catch {}
}
async function lastClosedBar(sym, itv) {
  const raw = await getJSON(`${API}/klines?symbol=${sym}&interval=${itv}&limit=2`), now = Date.now(), cl = raw.filter(d => d[6] < now);
  return cl.length ? cl[cl.length - 1][0] : null;
}
async function indAlertTick(force) {
  if (alBusy) return; const act = state.alerts.filter(a => a.kind === 'ind' && a.on); if (!act.length) return;
  alBusy = true; let changed = false;
  try {
    const groups = new Map(); for (const a of act) { const key = a.symbol + '|' + a.interval; (groups.get(key) || groups.set(key, []).get(key)).push(a); }
    for (const [key, list] of groups) {
      const [sym, itv] = key.split('|'), g = alGroups.get(key) || {next: 0, at: 0}, now = Date.now();
      if (!force && now < g.next && now - g.at < 300000) continue;
      let lc; try { lc = await lastClosedBar(sym, itv); } catch { continue; }
      if (lc === null) continue;
      g.at = now; g.next = lc + 2 * IV_MS[itv] + 2000; alGroups.set(key, g);
      const due = list.filter(a => a.lastBar < lc); if (!due.length) continue;
      const cs = await pineSecCandles(sym, itv), k = closedIdx(cs, lc); if (k < 1) continue;
      const runs = new Map(); let nova = null;
      for (const a of due) {
        const from = Math.max(1, k - 4), bars = []; for (let i = from; i <= k; i++) if (cs[i].t > a.lastBar) bars.push(i);
        let hitInfo = null;
        try {
          if (a.src === 'std') { for (const i of bars) if (stdHit(cs, i, a.spec)) hitInfo = fmt(cs[i].c); }
          else if (a.src === 'nova') {
            if (!nova) nova = NovaNexus.compute(cs, novaOpts());
            for (const i of bars) { const sg = nova.bySignal[i]; if (sg && (a.spec.side === 'any' || sg.side === a.spec.side) && sg.score >= (a.spec.minScore || 0)) hitInfo = `${sg.side === 'buy' ? 'COMPRA' : 'VENTA'} ★${sg.score} @ ${fmt(sg.price)}`; }
          } else if (a.src === 'pine') {
            const s = scripts.find(x => x.id === a.sid), p = state.pine.find(x => x.sid === a.sid);
            if (s) {
              if (!runs.has(a.sid)) runs.set(a.sid, await pineRunFull(s.code, {inputs: (p && p.inputs) || {}, interval: itv, symbol: sym, name: s.name, cs, timeLimitMs: 12000}));
              const res = runs.get(a.sid);
              if (res && res.ok) for (const i of bars) { const r = pineHit(res, a.spec, cs, i); if (r.hit) hitInfo = r.msg || ''; }
            }
          }
        } catch (e) { console.warn('alerta', e); }
        a.lastBar = lc; changed = true;
        if (hitInfo !== null) fireInd(a, hitInfo);
      }
    }
  } finally { alBusy = false; }
  if (changed) { save(); renderAlerts(); }
}
window.CCTAlerts = {stdHit, pineHit, STD_CONDS}; // expuesto para pruebas
setInterval(() => { if (!document.hidden) indAlertTick(); }, 15000);
setTimeout(indAlertTick, 4000);

/* Diálogo "Alerta con indicador" */
function openIndAlertDialog() {
  const pines = state.pine.filter(p => scripts.some(s => s.id === p.sid));
  const el = document.createElement('div'); el.className = 'cfg-overlay';
  const inds = [['std', 'Indicadores comunes (EMA, RSI, MACD…)'], ['nova', 'Nova Nexus (señales)']].concat(pines.map(p => ['pine:' + p.sid, 'Script: ' + pineName(p.sid)]));
  el.innerHTML = `<div class="cfg-dlg" role="dialog" aria-modal="true" aria-label="Alerta con indicador"><div class="cfg-head"><strong>Alerta con indicador</strong><button class="cfg-x" aria-label="Cerrar">✕</button></div>
    <div class="cfg-body"><div class="cfg-sec">
      <label class="al-f">Indicador<select id="aiSrc">${inds.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>
      <label class="al-f">Condición<select id="aiCond"></select></label>
      <div id="aiExtra"></div>
      <label class="al-f">Activo<select id="aiSym">${state.symbols.map(s => `<option value="${s}" ${s === state.symbol ? 'selected' : ''}>${esc(base(s))}/USDT</option>`).join('')}</select></label>
      <label class="al-f">Temporalidad<select id="aiTf">${INTERVALS.map(t => `<option ${t === state.interval ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="al-f">Frecuencia<select id="aiRep"><option value="once">Solo una vez</option><option value="every">Cada vez que ocurra (al cerrar la vela)</option></select></label>
      <label class="al-f">Nota (opcional)<input id="aiNote" maxlength="80"></label>
      <p class="cfg-note" id="aiHint">Se evalúa al cierre de cada vela, así evita falsas señales por repintado.</p>
    </div></div>
    <div class="cfg-foot"><span class="cfg-sp"></span><button class="cfg-btn" data-act="cancel">Cancelar</button><button class="cfg-btn cfg-ok" data-act="ok">Crear alerta</button></div></div>`;
  document.body.appendChild(el);
  const $e = s => el.querySelector(s), close = () => el.remove();
  let opts = []; // [{v, label, spec}]
  const fillCond = () => {
    const src = $e('#aiSrc').value, extra = $e('#aiExtra'); extra.innerHTML = ''; opts = [];
    if (src === 'std') opts = STD_CONDS.map(([k, l]) => ({label: l, spec: {k}}));
    else if (src === 'nova') opts = [{label: 'Señal de COMPRA', spec: {side: 'buy'}}, {label: 'Señal de VENTA', spec: {side: 'sell'}}, {label: 'Cualquier señal', spec: {side: 'any'}}];
    else {
      const sid = src.slice(5), r = pineRes[sid];
      if (!r || !r.ok) { $e('#aiCond').innerHTML = '<option value="">(abre el gráfico para que el script se calcule)</option>'; $e('#aiHint').textContent = 'El script aún no se ha calculado o tiene errores. Actívalo en el gráfico e inténtalo de nuevo.'; return; }
      (r.alerts || []).forEach((x, i) => opts.push({label: (x.kind === 'cond' ? 'alertcondition: ' : 'alert(): ') + x.title + (x.message && x.kind === 'cond' ? ` — ${x.message.slice(0, 40)}` : ''), spec: {t: 'ac', kind: x.kind, title: x.title, i}}));
      r.shapes.forEach((x, i) => { if (x.pts.length || true) opts.push({label: 'Señal/forma: ' + (x.title || 'sin título'), spec: {t: 'sh', kind: x.kind, title: x.title || '', i}}); });
      opts.push({label: 'Cruce de líneas del indicador…', spec: {t: 'x'}, cross: true});
      $e('#aiHint').textContent = `Condiciones leídas de este script: ${(r.alerts || []).length} alertcondition/alert(), ${r.shapes.length} forma(s) y cruces entre sus ${r.plots.length} línea(s).`;
    }
    $e('#aiCond').innerHTML = opts.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('');
    condChange();
  };
  const condChange = () => {
    const o = opts[+$e('#aiCond').value], extra = $e('#aiExtra'); extra.innerHTML = '';
    if (!o) return;
    if (o.spec.k === 'rsi_up' || o.spec.k === 'rsi_dn') extra.innerHTML = `<label class="al-f">Nivel RSI<input id="aiLvl" inputmode="decimal" value="${o.spec.k === 'rsi_up' ? 70 : 30}"></label>`;
    if (o.spec.side) extra.innerHTML = `<label class="al-f">Puntuación mínima (★)<select id="aiScore">${[0, 2, 3, 4, 5].map(n => `<option value="${n}">${n ? '≥ ' + n : 'Cualquiera'}</option>`).join('')}</select></label>`;
    if (o.cross) {
      const r = pineRes[$e('#aiSrc').value.slice(5)], pl = r.plots.map(p => `<option value="p:${p.id}">${esc(p.title || 'Línea ' + p.id)}</option>`).join('');
      extra.innerHTML = `<label class="al-f">Línea A<select id="aiA">${pl}<option value="price">Precio (cierre)</option></select></label><label class="al-f">Cruza<select id="aiDir"><option value="up">al alza</option><option value="dn">a la baja</option></select></label><label class="al-f">Línea B<select id="aiB"><option value="price">Precio (cierre)</option>${pl}<option value="n">Nivel fijo…</option></select></label><label class="al-f" id="aiNWrap" style="display:none">Nivel<input id="aiN" inputmode="decimal" placeholder="Ej. 50"></label>`;
      const ab = $e('#aiB'); if (r.plots.length > 1) ab.value = 'p:' + r.plots[1].id; ab.onchange = () => { $e('#aiNWrap').style.display = ab.value === 'n' ? '' : 'none'; };
    }
  };
  $e('#aiSrc').onchange = fillCond; $e('#aiCond').onchange = condChange; fillCond();
  const ser = v => v === 'price' ? {price: 1} : v.startsWith('p:') ? {p: +v.slice(2)} : {n: parseFloat(String($e('#aiN').value).replace(',', '.'))};
  el.addEventListener('click', async e => {
    if (e.target === el || e.target.closest('.cfg-x') || e.target.closest('[data-act=cancel]')) return close();
    if (!e.target.closest('[data-act=ok]')) return;
    const src = $e('#aiSrc').value, o = opts[+$e('#aiCond').value]; if (!o) { toast('Elige una condición'); return; }
    const spec = JSON.parse(JSON.stringify(o.spec)); let label = o.label, kind = src.startsWith('pine:') ? 'pine' : src;
    if (spec.k === 'rsi_up' || spec.k === 'rsi_dn') { const L = parseFloat(String($e('#aiLvl').value).replace(',', '.')); if (!Number.isFinite(L)) { toast('Nivel de RSI inválido'); return; } spec.lvl = L; label += ' ' + L; }
    if (spec.side) { spec.minScore = +$e('#aiScore').value; label += spec.minScore ? ` (★≥${spec.minScore})` : ''; label = 'Nova Nexus · ' + label; }
    if (o.cross) {
      spec.a = ser($e('#aiA').value); spec.b = ser($e('#aiB').value); spec.dir = $e('#aiDir').value;
      if (spec.b.n !== undefined && !Number.isFinite(spec.b.n)) { toast('Escribe el nivel fijo'); return; }
      const nm = s => s.price ? 'Precio' : s.n !== undefined ? String(s.n) : ((pineRes[src.slice(5)].plots.find(p => p.id === s.p) || {}).title || 'Línea');
      label = `${nm(spec.a)} cruza ${spec.dir === 'up' ? 'al alza' : 'a la baja'} ${nm(spec.b)}`;
    }
    if (kind === 'pine') label = pineName(src.slice(5)) + ' · ' + label.replace(/^(alertcondition|alert\(\)|Señal\/forma): /, '').replace(/ — .*$/, '');
    if (kind === 'std') label = 'Indicador · ' + label;
    const sym = $e('#aiSym').value, itv = $e('#aiTf').value;
    if (state.alerts.length >= 50) { toast('Máximo 50 alertas'); return; }
    let lc; try { lc = await lastClosedBar(sym, itv); } catch {}
    if (lc == null) { toast('No pude leer las velas; revisa tu conexión'); return; }
    state.alerts.unshift({id: 'al' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: 'ind', src: kind, sid: kind === 'pine' ? src.slice(5) : '', spec, label, symbol: sym, interval: itv, repeat: $e('#aiRep').value, on: true, note: $e('#aiNote').value.trim().slice(0, 80), created: Date.now(), firedAt: 0, lastBar: lc, firedInfo: ''});
    alGroups.delete(sym + '|' + itv); save(); renderAlerts(); close(); toast('Alerta con indicador creada');
    try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch {}
  });
}

/* ───────── Velas y datos en vivo ───────── */
function setFeedback(t) { $('#chartFeedback').textContent = t; }
function defaultVisible() { const w = $('#chartArea').clientWidth || 360; return clamp(Math.round((w - 70) / (isDesktop() ? 7 : 5.5)), 40, 260); }
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
  recalc(); updateChartHeader(); checkAlerts(state.symbol, k.c);
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
  ['wma20','WMA 20','Media móvil ponderada de 20 períodos','#4dd0e1'],
  ['vwap','VWAP','Precio medio ponderado por volumen, reinicia cada día UTC (solo intradía)','#ff8a65'],
  ['supertrend','Supertrend','ATR 10 · factor 3 · verde = alcista, rojo = bajista','#20bf9f'],
  ['cross','Cruces EMA 20/50','Marca los cruces de la EMA 20 con la EMA 50','#f5c568'],
  ['macd','MACD 12 26 9','Línea, señal e histograma en panel inferior','#548fff'],
  ['stoch','Estocástico 14 3 3','%K y %D en panel inferior (niveles 20/80)','#548fff'],
  ['atr','ATR 14','Rango verdadero medio (Wilder) en panel inferior','#e07b53'],
  ['obv','OBV','Volumen en balance en panel inferior','#2ec4b6'],
  ['volume','Volumen','Barras de volumen por vela','#8294a8'],
  ['nnIa','Nova Nexus · Señales IA','BUY/SELL con score ⭐, cooldown y divergencias (v2.7)','#11cf77'],
  ['nnEma','Nova Nexus · EMA Cloud','Nube EMA 55 ± 0.6 ATR','#8a97b3'],
  ['nnTp','Nova Nexus · TP / SL','Niveles de la última señal (SL 1 · TP 1.5 / 2.5 / 4 ATR)','#ff9900'],
  ['nnSmc','Nova Nexus · Estructura SMC','BOS / CHoCH con barridos (swing, longitud 5)','#089981'],
  ['nnOb','Nova Nexus · Order Blocks','Order Blocks volumétricos con actividad compra/venta (últimos 5)','#f23645'],
  ['nnTrail','Nova Nexus · Smooth Trail','Trailing stop EMA 30 ± 2 ATR(20), suavizado 2 · verde alcista, morado bajista','#119c7e'],
  ['nnRev','Nova Nexus · Reversal Bands','SMA 70 ± 6/7/8 ATR(70): zonas de posible reversión','#f23645'],
  ['nnVP','Nova Nexus · Volume Profile','Perfil de volumen (25 filas, últimas 200 velas): nodos, sentimiento y zona POC en un margen a la derecha','#ffeb3b'],
  ['nnLiq','Nova Nexus · Liquidaciones','Niveles de liquidación 5x/10x/25x/50x/100x desde pivotes con filtro de volumen, y tabla de niveles activos','#22ab94'],
  ['nnLiqBars','Nova Nexus · Liquidaciones: velas lima','Opcional: colorea todas las velas de lima, como el barcolor del Pine al activar Liquidaciones (requiere Liquidaciones)','#00e676'],
  ['nnPiv','Nova Nexus · Pivots','Zigzag de pivotes (50), pivotes perdidos y niveles fantasma','#26a69a'],
  ['nnSR','Nova Nexus · Soporte y Resistencia','Cajas de soporte/resistencia con Break y Retest (pivotes de 20 velas)','#ff5252'],
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
  const c = candles.map(x => x.c), n = c.length, bl = sp('bollinger', 'len'), bm = sp('bollinger', 'mult'), m = sma(c, bl);
  const up = Array(n).fill(null), lo = Array(n).fill(null);
  for (let i = bl - 1; i < n; i++) { let s = 0; for (let j = i - bl + 1; j <= i; j++) { const d = c[j] - m[i]; s += d * d; } const sd = Math.sqrt(s / bl); up[i] = m[i] + bm * sd; lo[i] = m[i] - bm * sd; }
  ind = {ema20: ema(c, sp('ema20', 'len')), ema50: ema(c, sp('ema50', 'len')), sma200: sma(c, sp('sma200', 'len')), bbU: up, bbL: lo, rsi: rsi(c, sp('rsi', 'len'))};
  ind.nn = null; calcNova(); calcExtra(); schedulePine();
}
const PANELS = ['macd', 'stoch', 'atr', 'obv'];
function calcExtra() { // indicadores de la fase 2: solo se calculan los activados
  const I = state.indicators, T = window.CCTIndicators, n = candles.length;
  if (!T || !n) return;
  const c = candles.map(x => x.c), iv = IV_MS[state.interval];
  ind.wma20 = I.wma20 ? T.wma(c, sp('wma20', 'len')) : null;
  ind.vwap = I.vwap ? T.vwap(candles, iv) : null;
  const st = I.supertrend ? T.supertrend(candles, sp('supertrend', 'len'), sp('supertrend', 'factor')) : null; ind.stUp = st && st.up; ind.stDn = st && st.dn; ind.stDir = st && st.dir;
  ind.cross = I.cross ? T.crosses(ind.ema20, ind.ema50) : null;
  ind.macd = I.macd ? T.macd(c, sp('macd', 'fast'), sp('macd', 'slow'), sp('macd', 'sig')) : null;
  ind.stoch = I.stoch ? T.stoch(candles, sp('stoch', 'k'), sp('stoch', 'ks'), sp('stoch', 'd')) : null;
  ind.atr = I.atr ? T.atr(candles, sp('atr', 'len')) : null;
  ind.obv = I.obv ? T.obv(candles) : null;
  const NP = novaP;
  ind.trail = I.nnTrail ? T.smoothTrail(candles, NP('trailLen'), NP('trailAtr'), NP('trailMult'), NP('trailSmooth')) : null;
  ind.rev = I.nnRev ? T.reversalBands(candles, NP('revLen')) : null;
  ind.sr = I.nnSR ? T.supportResistance(candles, {lookback: NP('srLookback'), retSince: NP('srSince'), retValid: NP('srLimit')}) : null;
  ind.piv = I.nnPiv ? T.pivots(candles, NP('pivLen')) : null;
  ind.liq = I.nnLiq ? T.liquidations(candles, iv, {lookback: NP('liqLookback')}) : null;
  ind.vp = I.nnVP ? T.volumeProfile(candles, {rows: NP('vpRows'), lookback: NP('vpLookback'), hiThr: NP('vpHi'), loThr: NP('vpLo')}) : null;
}
// Parámetros de Nova Nexus editables (misma presentación que la ventana de TradingView: grupos, filas y ayudas)
const NOVA_STRATS = {'Ninguna (usar módulos)': null, '📱 Mobile (IA + Smooth Trail + Reversal Bands)': ['nnIa', 'nnTrail', 'nnRev'], '☁️ Cloud (IA + EMA Cloud + Volume Profile + S/R)': ['nnIa', 'nnEma', 'nnVP', 'nnSR'], '🏛 SMC (IA + SMC + Pivots + Volume Profile)': ['nnIa', 'nnSmc', 'nnOb', 'nnPiv', 'nnVP']};
const NOVA_SCHEMA = [
  {key: 'emaLen', title: 'EMA Periodos', type: 'int', def: 55, min: 2, max: 500, group: '☁️ EMA CLOUD'},
  {key: 'emaMult', title: 'Multiplicador ATR', type: 'float', def: 0.6, min: 0.1, max: 10, step: 0.1, group: '☁️ EMA CLOUD'},
  {key: 'trailLen', title: 'Longitud EMA Base', type: 'int', def: 30, min: 2, max: 500, group: '🧵 SMOOTH TRAIL'},
  {key: 'trailAtr', title: 'ATR Length', type: 'int', def: 20, min: 1, max: 500, group: '🧵 SMOOTH TRAIL'},
  {key: 'trailMult', title: 'Multiplicador ATR', type: 'float', def: 2, min: 0.1, max: 20, step: 0.1, group: '🧵 SMOOTH TRAIL'},
  {key: 'trailSmooth', title: 'Suavizado', type: 'int', def: 2, min: 1, max: 50, group: '🧵 SMOOTH TRAIL'},
  {key: 'pivLen', title: 'Pivot Length', type: 'int', def: 50, min: 2, max: 200, group: '📍 PIVOTS (High/Low & Missed)'},
  {key: 'revLen', title: 'Length', type: 'int', def: 70, min: 2, max: 500, group: 'REVERSAL BANDS'},
  {key: 'smcLen', title: 'Longitud del swing', type: 'int', def: 5, min: 2, max: 50, group: 'MARKET STRUCTURE'},
  {key: 'smcWindow', title: 'Window', type: 'int', def: 500, min: 50, max: 1000, group: 'MARKET STRUCTURE', tooltip: 'Cantidad de velas recientes donde se busca la estructura.'},
  {key: 'smcSwing', title: 'Swing', type: 'int', def: 100, min: 10, max: 500, group: 'MARKET STRUCTURE'},
  {key: 'smcSweep', title: 'Build Sweep (x)', type: 'bool', def: true, group: 'MARKET STRUCTURE'},
  {key: 'obLast', title: 'Show Last', type: 'int', def: 5, min: 1, max: 20, group: 'VOLUMETRIC ORDER BLOCKS'},
  {key: 'obMiti', title: 'Mitigación', type: 'string', def: 'Close', options: ['Close', 'Wick', 'Avg'], group: 'VOLUMETRIC ORDER BLOCKS'},
  {key: 'vpRows', title: 'Number of Rows', type: 'int', def: 25, min: 5, max: 100, group: 'Volume Profile'},
  {key: 'vpLookback', title: 'Lookback Length', type: 'int', def: 200, min: 10, max: 1000, group: 'Volume Profile'},
  {key: 'vpHi', title: 'High Traded Nodes Threshold %', type: 'float', def: 53, min: 0, max: 100, group: 'Volume Profile'},
  {key: 'vpLo', title: 'Low Traded Nodes Threshold %', type: 'float', def: 37, min: 0, max: 100, group: 'Volume Profile'},
  {key: 'liqLookback', title: 'Lookback Period', type: 'int', def: 40, min: 5, max: 500, group: 'LIQUIDATIONS'},
  {key: 'srLookback', title: 'Lookback Range', type: 'int', def: 20, min: 2, max: 200, group: '🧱 Support and Resistance'},
  {key: 'srSince', title: 'Bars Since Breakout', type: 'int', def: 2, min: 1, max: 50, group: '🧱 Support and Resistance'},
  {key: 'srLimit', title: 'Retest Detection Limiter', type: 'int', def: 2, min: 1, max: 50, group: '🧱 Support and Resistance'},
  {key: 'slMult', title: 'SL x ATR', type: 'float', def: 1, min: 0.1, max: 20, step: 0.1, group: '⚡ IA Signals — TP / SL'},
  {key: 'tp1', title: 'TP1 x ATR', type: 'float', def: 1.5, min: 0.1, max: 50, step: 0.1, group: '⚡ IA Signals — TP / SL'},
  {key: 'tp2', title: 'TP2 x ATR', type: 'float', def: 2.5, min: 0.1, max: 50, step: 0.1, group: '⚡ IA Signals — TP / SL'},
  {key: 'tp3', title: 'TP3 x ATR', type: 'float', def: 4, min: 0.1, max: 50, step: 0.1, group: '⚡ IA Signals — TP / SL'},
  {key: 'tpBars', title: 'Velas de vigencia TP / SL', type: 'int', def: 40, min: 5, max: 500, group: '⚡ IA Signals — TP / SL'},
  {key: 'minScore', title: 'Score mínimo para mostrar señal', type: 'int', def: 1, min: 1, max: 5, group: '⚡ IA Signals — Score'},
  {key: 'cooldown', title: 'Velas mínimas entre señales', type: 'int', def: 10, min: 0, max: 200, group: '⚡ IA Signals — Cooldown'},
  {key: 'cdBoth', title: 'Cooldown compartido (BUY y SELL)', type: 'bool', def: false, group: '⚡ IA Signals — Cooldown'},
  {key: 'cloudBull', title: 'EMA Cloud alcista', type: 'color', def: '#8c9bb933', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'cloudBear', title: 'EMA Cloud bajista', type: 'color', def: '#78828c33', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'cloudEdge', title: 'EMA Cloud bordes', type: 'color', def: '#c8d2e64d', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'trailBull', title: 'Smooth Trail alcista', type: 'color', def: '#119c7e', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'trailBear', title: 'Smooth Trail bajista', type: 'color', def: '#7c3cf3', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'revUp', title: 'Reversal Bands superior', type: 'color', def: '#f23645', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'revDn', title: 'Reversal Bands inferior', type: 'color', def: '#089981', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'revOp', title: 'Reversal Bands · opacidad %', type: 'int', def: 100, min: 0, max: 200, group: '🎨 COLORES Y OPACIDAD'},
  {key: 'srSup', title: 'Soporte', type: 'color', def: '#ff5252', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'srRes', title: 'Resistencia', type: 'color', def: '#089981', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'srOp', title: 'Soporte/Resistencia · opacidad %', type: 'int', def: 100, min: 0, max: 300, group: '🎨 COLORES Y OPACIDAD'},
  {key: 'vpHvc', title: 'Volume Profile · nodo de alto volumen', type: 'color', def: '#ffeb3b80', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'vpAvc', title: 'Volume Profile · nodo promedio', type: 'color', def: '#2962ff80', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'vpLvc', title: 'Volume Profile · nodo de bajo volumen', type: 'color', def: '#f2364580', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'vpBlc', title: 'Volume Profile · compras', type: 'color', def: '#26a69aff', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'vpBrc', title: 'Volume Profile · ventas', type: 'color', def: '#ef5350ff', group: '🎨 COLORES Y OPACIDAD'},
  {key: 'vpOp', title: 'Volume Profile · opacidad %', type: 'int', def: 100, min: 0, max: 100, group: '🎨 COLORES Y OPACIDAD'},
  {key: 'strat', title: 'Estrategia', type: 'string', def: 'Ninguna (usar módulos)', options: Object.keys(NOVA_STRATS), group: '📱 ESTRATEGIAS', tooltip: 'Como en el Pine original: Mobile / Cloud / SMC activan un conjunto fijo de módulos y desactivan el resto. «Ninguna» devuelve tus módulos.'},
  {key: 'rulesText', title: 'Texto de Reglas', type: 'string', def: '', group: '📋 REGLAS', tooltip: 'Una regla por línea separada con «|». Vacío = reglas por defecto.'}
];
const novaDef = k => { const e = NOVA_SCHEMA.find(x => x.key === k); return e ? e.def : undefined; };
function novaP(k) { const v = state.novaParams && state.novaParams[k]; const d = novaDef(k); if (k === 'rulesText') return v ? String(v).split('|').map(x => '• ' + x.trim().replace(/^•\s*/, '')).join('\n') : undefined; return v === undefined ? d : v; }
function openNovaDialog() {
  const mods = NOVA_GROUPS.flatMap(([t, ks]) => ks.map(k => ({key: 'mod:' + k, title: novaTitle(k), type: 'bool', def: NOVA_DEFAULT.includes(k), value: !!state.indicators[k], group: '🧩 MÓDULOS (ON/OFF)', tooltip: novaDesc(k)})));
  const params = NOVA_SCHEMA.map(e => Object.assign({}, e, {value: state.novaParams[e.key] !== undefined ? state.novaParams[e.key] : e.def}));
  const values = {}; for (const i of mods.concat(params)) values[i.key] = i.value;
  CCTSettings.open({title: 'Nova Nexus', tabs: ['in'], note: 'Estos son los parámetros que el indicador ya permite cambiar. Para tener TODOS los parámetros del Pine original, pega su código en «Scripts de Pine».', inputs: mods.concat(params), values, plots: [], hlines: [], objects: [], shapes: [], onApply: res => {
    const get = i => res.inputs[i.key] !== undefined ? res.inputs[i.key] : i.def;
    const prevStrat = state.novaParams.strat, strat = NOVA_STRATS[get(params.find(p => p.key === 'strat'))];
    if (strat) {
      if (!prevStrat || !NOVA_STRATS[prevStrat]) state.novaSaved = Object.fromEntries(mods.map(i => [i.key.slice(4), !!get(i)]));
      for (const k of NN_KEYS) state.indicators[k] = strat.includes(k);
    } else if (prevStrat && NOVA_STRATS[prevStrat] && state.novaSaved) { for (const k of NN_KEYS) state.indicators[k] = !!state.novaSaved[k]; if (!novaOn()) NOVA_DEFAULT.forEach(k => state.indicators[k] = true); state.novaSaved = null; }
    else { for (const i of mods) state.indicators[i.key.slice(4)] = !!get(i); state.novaSaved = null; } const np = {}; for (const i of params) { const v = get(i); if (JSON.stringify(v) !== JSON.stringify(i.def)) np[i.key] = v; } state.novaParams = np;
    save(); renderIndicators(); countIndicators(); calcNova(); calcExtra(); scheduleRender(); toast('Configuración aplicada');
  }});
}
function calcNova() {
  const I = state.indicators;
  if (!window.NovaNexus || !candles.length || !(I.nnIa || I.nnEma || I.nnTp || I.nnRules || I.nnSmc || I.nnOb)) { ind.nn = null; return; }
  const NP = novaP;
  try { ind.nn = NovaNexus.compute(candles, {smc: !!(I.nnSmc || I.nnOb), emaLen: NP('emaLen'), emaMult: NP('emaMult'), minScore: NP('minScore'), cooldown: NP('cooldown'), cdBoth: NP('cdBoth'), slMult: NP('slMult'), tp1Mult: NP('tp1'), tp2Mult: NP('tp2'), tp3Mult: NP('tp3'), tpBars: NP('tpBars'), smcOpts: {mslen: NP('smcLen'), window: NP('smcWindow'), swingLimit: NP('smcSwing'), sweep: NP('smcSweep'), oblast: NP('obLast'), obmiti: NP('obMiti')}}); } catch (e) { ind.nn = null; console.warn('Nova Nexus:', e); }
}
const NN_KEYS = indicatorMeta.map(m => m[0]).filter(k => k.startsWith('nn')), novaOn = () => NN_KEYS.some(k => state.indicators[k]);
let indTab = 'std';
const indTabs = () => `<div class="ind-tabs"><button data-indtab="std" class="${indTab === 'std' ? 'active' : ''}">Comunes</button><button data-indtab="mine" class="${indTab === 'mine' ? 'active' : ''}">Mis indicadores</button></div>`;
const indicatorRows = () => { document.body.dataset.indtab = indTab; return indTabs() + (indTab === 'std'
  ? indicatorMeta.filter(m => !m[0].startsWith('nn')).map(([key, title, desc]) =>
    `<div class="setting-row"><div><b>${title}</b><small>${desc}</small></div><div class="script-btns">${STD_SCHEMA[key] ? `<button class="small-button" data-std-set="${key}" aria-label="Ajustes de ${title}">⚙</button>` : ''}<button class="toggle ${state.indicators[key] ? 'on' : ''}" data-ind="${key}" aria-label="${title}" aria-pressed="${!!state.indicators[key]}"></button></div></div>`).join('')
  : catalogCards() + pineSection()); };
document.addEventListener('change', e => { const s = e.target.closest('[data-pine-pane]'); if (!s) return; const p = state.pine.find(x => x.sid === s.dataset.pinePane); if (!p) return; if (s.value) p.pane = s.value; else delete p.pane; save(); renderIndicators(); if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) $('#sheetList').innerHTML = indicatorRows(); scheduleRender(); });
document.addEventListener('click', e => { const t = e.target.closest('[data-indtab]'); if (!t) return; indTab = t.dataset.indtab; renderIndicators(); if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) $('#sheetList').innerHTML = indicatorRows(); });
function renderIndicators() { $('#indicatorList').innerHTML = indicatorRows(); }
function countIndicators() { const n = Object.entries(state.indicators).filter(([k, v]) => v && !k.startsWith('nn')).length + (novaOn() ? 1 : 0); $('#indicatorCount').textContent = n ? `Indicadores (${n})` : 'Indicadores'; }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ind]'); if (!b) return;
  state.indicators[b.dataset.ind] = !state.indicators[b.dataset.ind];
  save(); renderIndicators(); countIndicators(); if (candles.length) { calcNova(); calcExtra(); }
  if (['indicators', 'novaSet'].includes(sheetMode) && $('#sheet').classList.contains('open')) renderSheet();
  scheduleRender();
});

/* ───────── Hojas inferiores (activo / añadir / dibujar / indicadores) ───────── */
function openSheet(mode = 'select') {
  sheetMode = mode;
  $('#sheetTitle').textContent = {add: 'Añadir a seguimiento', tools: 'Herramientas de dibujo', indicators: 'Indicadores', select: 'Seleccionar criptomoneda', script: 'Código del script', paste: 'Pegar script de Pine', pine: 'Convertir script de Pine', pineSet: 'Script de Pine', novaSet: 'Nova Nexus'}[mode];
  $('#sheetSearch').style.display = ['tools', 'indicators', 'script', 'paste', 'pine', 'pineSet', 'novaSet'].includes(mode) ? 'none' : 'block';
  $('#sheetSearch').value = '';
  $('#sheetBackdrop').classList.add('open'); $('#sheet').classList.add('open');
  renderSheet();
}
function closeSheet() { $('#sheetBackdrop').classList.remove('open'); $('#sheet').classList.remove('open'); }
const TOOLS = [
  ['trend', '↗ Línea de tendencia', 'Arrastra o toca dos puntos'],
  ['ray', '⟶ Rayo', 'Dos puntos; la línea sigue hacia la derecha'],
  ['horizontal', '— Línea horizontal', 'Toca un precio'],
  ['vertical', '| Línea vertical', 'Toca una vela'],
  ['rect', '▭ Rectángulo', 'Arrastra o toca dos esquinas'],
  ['channel', '⫽ Canal paralelo', 'Dos puntos y un tercero para el ancho'],
  ['arrow', '➚ Flecha', 'Arrastra o toca inicio y punta'],
  ['text', 'T Texto', 'Toca dónde quieres escribir'],
  ['measure', '↔ Medición', 'Precio, % y velas entre dos puntos'],
  ['fib', '≋ Retroceso de Fibonacci', 'Arrastra o toca inicio y fin del movimiento'],
  ['fibext', '≋ Extensión de Fibonacci', 'Tres puntos: inicio, fin y retroceso'],
  ['marker', '◆ Marcador de máximo/mínimo', 'Toca un máximo o mínimo'],
  ['long', '▲ Posición Long', 'Entrada y objetivo arriba (stop a 2:1)'],
  ['short', '▼ Posición Short', 'Entrada y objetivo abajo (stop a 2:1)'],
  ['brush', '🖌 Pincel', 'Dibuja a mano alzada sobre el gráfico'],
  ['clear', '✕ Borrar todos los dibujos', 'Solo de este activo']
];
function renderSheet() {
  const list = $('#sheetList');
  if (sheetMode === 'indicators') { list.innerHTML = indicatorRows(); return; }
  if (sheetMode === 'novaSet') { renderNovaSettings(list); return; }
  if (sheetMode === 'pine') { renderPineEditor(list); return; }
  if (sheetMode === 'pineSet') { renderPineSettings(list); return; }
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
function clearTransient() { drawTool = ''; pending = null; pending2 = null; preview = null; selectedId = null; cross = null; priceMan = null; updateAutoBtn(); updateDrawUI(); }
const two = (first, second) => p => p ? second : first;
const HINTS = {
  trend: two('Arrastra o toca el primer punto', 'Toca el segundo punto'),
  ray: two('Arrastra o toca el primer punto', 'Toca el segundo punto'),
  arrow: two('Arrastra o toca el inicio de la flecha', 'Toca la punta de la flecha'),
  measure: two('Arrastra o toca el punto de partida', 'Toca el punto final'),
  brush: () => 'Pincel: dibuja con el dedo o el ratón',
  horizontal: () => 'Toca el precio donde quieres la línea',
  vertical: () => 'Toca la vela donde quieres la línea',
  text: () => 'Toca dónde quieres el texto',
  marker: () => 'Toca el máximo o mínimo a marcar',
  rect: two('Arrastra o toca la primera esquina', 'Toca la esquina opuesta'),
  fib: two('Arrastra o toca el inicio del movimiento', 'Toca el final del movimiento'),
  long: two('Arrastra o toca la entrada', 'Toca el objetivo (arriba de la entrada)'),
  short: two('Arrastra o toca la entrada', 'Toca el objetivo (abajo de la entrada)'),
  channel: (p, p2) => p2 ? 'Toca el tercer punto (ancho del canal)' : p ? 'Toca el segundo punto' : 'Arrastra o toca el primer punto',
  fibext: (p, p2) => p2 ? 'Toca el punto del retroceso' : p ? 'Toca el final del movimiento' : 'Arrastra o toca el inicio del movimiento'
};
function startTool(k) { drawTool = k; pending = null; pending2 = null; preview = null; selectedId = null; updateDrawUI(); scheduleRender(); }
const BRUSH_COLORS = ['#e9c36e', '#f06b79', '#20bf9f', '#548fff', '#ffffff'], BRUSH_W = [2, 4, 7];
function brushOptsHtml() { return `<span id="brushOpts">${BRUSH_COLORS.map(c => `<button class="bsw${state.brush.c === c ? ' on' : ''}" data-bc="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}${BRUSH_W.map(w => `<button class="bw${state.brush.w === w ? ' on' : ''}" data-bw="${w}" aria-label="Grosor ${w}"><i style="height:${w}px"></i></button>`).join('')}</span>`; }
document.addEventListener('click', e => {
  const c = e.target.closest('[data-bc]'), w = e.target.closest('[data-bw]'); if (!c && !w) return;
  if (c) state.brush.c = c.dataset.bc; else state.brush.w = +w.dataset.bw; save(); updateDrawUI();
});
function updateDrawUI() {
  $('#drawHint').hidden = !drawTool;
  { const bo = $('#brushOpts'), want = drawTool === 'brush'; if (bo && !want) bo.remove(); else if (want) { const h = brushOptsHtml(); if (bo) bo.outerHTML = h; else $('#drawHintText').insertAdjacentHTML('afterend', h); } $('#cancelDraw').textContent = want ? 'Listo' : 'Cancelar'; }
  if (drawTool) $('#drawHintText').textContent = HINTS[drawTool](pending, pending2);
  $('#deleteDraw').hidden = !selectedId;
  $('#undoDraw').disabled = !getDrawings().length;
  $('#chartArea').classList.toggle('drawing', !!drawTool); $('#chartArea').dataset.tool = drawTool;
}
$('#cancelDraw').onclick = () => { drawTool = ''; pending = null; pending2 = null; preview = null; updateDrawUI(); scheduleRender(); };
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
  if (d.type === 'brush') return [];
  if (d.type === 'horizontal') return [{key: 'a', x: geo.left + geo.plotW / 2, y: Y(d.a.p)}];
  if (d.type === 'vertical') return [{key: 'a', x: X(idxOfTime(d.a.t)), y: geo.plotTop + geo.plotH / 2}];
  if (ONEPT.includes(d.type)) return [{key: 'a', ...px(d.a)}];
  const hs = [{key: 'a', ...px(d.a)}, {key: 'b', ...px(d.b)}];
  if (d.c) hs.push({key: 'c', ...px(d.c)});
  return hs;
}
/* Geometría de herramientas compuestas */
function channelOff(d) { // desplazamiento vertical (en precio) de la paralela que pasa por c
  const ia = idxOfTime(d.a.t), ib = idxOfTime(d.b.t), ic = idxOfTime(d.c.t), slope = ib === ia ? 0 : (d.b.p - d.a.p) / (ib - ia);
  return d.c.p - (d.a.p + slope * (ic - ia));
}
function posBox(d) { // Long/Short: entrada = a, objetivo = b, stop espejo a 2:1
  const A = px(d.a), B = px(d.b), x1 = Math.min(A.x, B.x); let x2 = Math.max(A.x, B.x); if (x2 - x1 < 40) x2 = x1 + 40;
  const risk = (d.b.p - d.a.p) / 2;
  return {x1, x2, entry: d.a.p, target: d.b.p, stop: d.a.p - risk, yE: Y(d.a.p), yT: Y(d.b.p), yS: Y(d.a.p - risk)};
}
function fmtDur(ms) { const m = Math.round(Math.abs(ms) / 6e4), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60; return d ? `${d} d ${h} h` : h ? `${h} h ${mm} min` : `${mm} min`; }
function markerKind(d) { const c = candles[clamp(Math.round(idxOfTime(d.a.t)), 0, candles.length - 1)]; return c && Math.abs(d.a.p - c.h) <= Math.abs(d.a.p - c.l) ? 'high' : 'low'; }
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distToDrawing(d, pt) {
  if (d.type === 'brush') { let m = 1e9, prev = null; for (const q of d.pts) { const c = {x: X(idxOfTime(q[0])), y: Y(q[1])}; m = Math.min(m, prev ? segDist(pt, prev, c) : Math.hypot(pt.x - c.x, pt.y - c.y)); prev = c; } return Math.max(0, m - (d.w || 3) / 2); }
  if (d.type === 'horizontal') return Math.abs(pt.y - Y(d.a.p));
  if (d.type === 'vertical') return Math.abs(pt.x - X(idxOfTime(d.a.t)));
  if (d.type === 'text' || d.type === 'marker') {
    const A = px(d.a);
    if (d.type === 'text' && pt.x >= A.x - 4 && pt.x <= A.x + (d.text || '').length * 7 + 10 && pt.y >= A.y - 16 && pt.y <= A.y + 4) return 0;
    return Math.hypot(pt.x - A.x, pt.y - A.y);
  }
  const a = px(d.a), b = px(d.b);
  if (d.type === 'trend' || d.type === 'arrow') return segDist(pt, a, b);
  if (d.type === 'ray') { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; return segDist(pt, a, {x: a.x + dx / L * 5000, y: a.y + dy / L * 5000}); }
  if (d.type === 'channel') {
    if (!d.c) return segDist(pt, a, b);
    const off = channelOff(d); return Math.min(segDist(pt, a, b), segDist(pt, px({t: d.a.t, p: d.a.p + off}), px({t: d.b.t, p: d.b.p + off})));
  }
  if (d.type === 'long' || d.type === 'short') {
    const q = posBox(d), y1 = Math.min(q.yT, q.yS), y2 = Math.max(q.yT, q.yS);
    return pt.x >= q.x1 && pt.x <= q.x2 && pt.y >= y1 && pt.y <= y2 ? 0 : Math.min(Math.abs(pt.y - q.yT), Math.abs(pt.y - q.yS), Math.abs(pt.y - q.yE)) + (pt.x < q.x1 ? q.x1 - pt.x : pt.x > q.x2 ? pt.x - q.x2 : 0);
  }
  if (d.type === 'fibext') {
    if (!d.c) return segDist(pt, a, b);
    const c = px(d.c); if (pt.x < Math.min(a.x, c.x) - 10) return 1e9;
    return Math.min(...FIBEXT.map(lv => Math.abs(pt.y - Y(d.c.p + (d.b.p - d.a.p) * lv))));
  }
  if (d.type === 'rect' || d.type === 'measure') {
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
    if (pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2) return 0;
    return Math.min(segDist(pt, {x: x1, y: y1}, {x: x2, y: y1}), segDist(pt, {x: x2, y: y1}, {x: x2, y: y2}), segDist(pt, {x: x2, y: y2}, {x: x1, y: y2}), segDist(pt, {x: x1, y: y2}, {x: x1, y: y1}));
  }
  const xs = Math.min(a.x, b.x); if (pt.x < xs - 10) return 1e9;
  return Math.min(...FIB.map(lv => Math.abs(pt.y - Y(b_price(d, lv)))));
}
const b_price = (d, lv) => d.b.p - (d.b.p - d.a.p) * lv;
function hitTest(pt) { const arr = getDrawings(); for (let i = arr.length - 1; i >= 0; i--) if (distToDrawing(arr[i], pt) < 13) return arr[i]; return null; }
function commitDrawing(a, b, c) {
  const one = ONEPT.includes(drawTool), three = THREEPT.includes(drawTool);
  if (!one) {
    const A = px(a), B = px(b); if (Math.hypot(A.x - B.x, A.y - B.y) < 8) { toast('Los puntos están muy cerca'); pending = null; preview = null; updateDrawUI(); scheduleRender(); return; }
    if (drawTool === 'long' && b.p <= a.p) { toast('Para Long, el objetivo debe quedar arriba de la entrada'); pending = null; preview = null; updateDrawUI(); scheduleRender(); return; }
    if (drawTool === 'short' && b.p >= a.p) { toast('Para Short, el objetivo debe quedar abajo de la entrada'); pending = null; preview = null; updateDrawUI(); scheduleRender(); return; }
  }
  if (three && !c) { pending2 = {a, b}; pending = null; preview = null; updateDrawUI(); scheduleRender(); return; }
  const d = {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: drawTool, a, ...(one ? {} : {b}), ...(three ? {c} : {})};
  if (drawTool === 'text') {
    const txt = (prompt('Texto del dibujo:') || '').trim().slice(0, 80);
    if (!txt) { drawTool = ''; pending = null; preview = null; updateDrawUI(); render(); return; }
    d.text = txt;
  }
  setDrawings([...getDrawings(), d]);
  selectedId = d.id; drawTool = ''; pending = null; pending2 = null; preview = null; updateDrawUI(); render();
}

// Simplificación Ramer–Douglas–Peucker en píxeles: trazos livianos (el estado viaja entero a la cuenta) sin perder la forma
function rdp(P, eps) {
  if (P.length < 3) return P; const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]];
  while (st.length) { const [i, j] = st.pop(); let m = 0, k = -1; for (let n = i + 1; n < j; n++) { const d = segDist(P[n], P[i], P[j]); if (d > m) { m = d; k = n; } } if (k >= 0 && m > eps) { keep[k] = 1; st.push([i, k], [k, j]); } }
  return P.filter((_, i) => keep[i]);
}
function commitBrush(live) {
  if (!live || live.length < 2 || !geo) return;
  const P = live.map(q => ({x: X(idxOfTime(q[0])), y: Y(q[1]), q}));
  let eps = 1.1, out = rdp(P, eps); while (out.length > 300 && eps < 20) out = rdp(P, eps *= 1.5);
  if (out.length < 2) return;
  const pts = out.map(o => [Math.round(o.q[0]), +(+o.q[1].toPrecision(8))]);
  const d = {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: 'brush', pts, a: {t: pts[0][0], p: pts[0][1]}, col: state.brush.c, w: state.brush.w};
  setDrawings([...getDrawings(), d]); updateDrawUI();
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
let legRows = [], legSig = '', legStruct = '', grips = [], gripDrag = false;
let paneH = (() => { try { const o = JSON.parse(localStorage.getItem('cct_paneH_v1') || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } })();
const savePaneH = () => { try { localStorage.setItem('cct_paneH_v1', JSON.stringify(paneH)); } catch {} };
const paneScale0 = () => { try { const v = parseFloat(localStorage.getItem('cct_paneScale')); return v >= .6 && v <= 3 ? v : 1.25; } catch { return 1.25; } };
let paneScale = paneScale0();
const LEG_FONT = '600 13px system-ui';
const legBtnH = () => (window.matchMedia && matchMedia('(max-width:760px)').matches ? 26 : 22);
const legStep = () => legBtnH() + 4; // separación vertical entre filas con botones
function legAt(text, x, y, act, dim) { legRows.push({x: x + g.measureText(text).width + 8, y: y - Math.round(legBtnH() / 2 + 5), act, dim: !!dim}); }
function legLabel(text, x, y, act, dim) { const f = g.font; g.font = LEG_FONT; g.fillText(text, x, y); legAt(text, x, y, act, dim); g.font = f; }
function syncLegend() {
  const box = $('#legendBox'); if (!box || gripDrag) return;
  const sig = grips.map(q => q.key + ':' + Math.round(q.y)).join(',') + '#' + legRows.map(r => [Math.round(r.x), Math.round(r.y), r.act.t, r.act.sid || r.act.key || '', r.dim ? 1 : 0, r.act.pane || ''].join(':')).join('|');
  if (sig === legSig) return; legSig = sig;
  const gw = geo ? Math.max(40, geo.w - geo.left - geo.right + 2) : 100;
  // misma estructura (solo se movieron/cambió el texto): se recolocan los elementos existentes en vez de recrearlos,
  // así un clic en curso no pierde su botón por un tick de precio en vivo
  const struct = grips.map(q => q.key + ':' + q.dir).join(',') + '#' + legRows.map(r => [r.act.t, r.act.sid || r.act.key || '', r.dim ? 1 : 0, r.act.pane || ''].join(':')).join('|');
  if (struct === legStruct && box.children.length === grips.length + legRows.length) {
    grips.forEach((q, i) => { const el = box.children[i]; el.style.top = (Math.round(q.y) - 10) + 'px'; el.style.left = (geo ? geo.left : 6) + 'px'; el.style.width = gw + 'px'; el.dataset.gh = q.h; });
    legRows.forEach((r, i) => { const el = box.children[grips.length + i]; el.style.left = Math.round(r.x) + 'px'; el.style.top = Math.round(r.y) + 'px'; });
    return;
  }
  legStruct = struct;
  box.innerHTML = grips.map(q => `<div class="pane-grip" data-gk="${esc(q.key)}" data-gd="${q.dir}" data-gh="${q.h}" style="top:${Math.round(q.y) - 10}px;left:${geo ? geo.left : 6}px;width:${gw}px" title="Arrastra para cambiar la altura (doble toque: automática)"></div>`).join('') + legRows.map(r => { const a = r.act, id = a.sid || a.key || '', d = `data-leg="${a.t}" data-id="${esc(id)}"`;
    return `<div class="leg-row" style="left:${Math.round(r.x)}px;top:${Math.round(r.y)}px"><button ${d} data-do="eye" title="${r.dim ? 'Mostrar' : 'Ocultar'}" aria-label="${r.dim ? 'Mostrar' : 'Ocultar'}">${r.dim ? '🙈' : '👁'}</button><button ${d} data-do="set" title="Ajustes" aria-label="Ajustes">⚙</button>${a.t === 'pine' ? `<button ${d} data-do="move" title="Mover de panel" aria-label="Mover de panel">⇅</button>` : ''}<button ${d} data-do="del" title="Eliminar del gráfico" aria-label="Eliminar">✕</button></div>`; }).join('');
}
document.addEventListener('click', e => {
  const m = e.target.closest('[data-leg-pane]');
  if (m) { const p = state.pine.find(x => x.sid === m.dataset.id); if (p) { if (m.dataset.legPane) p.pane = m.dataset.legPane; else delete p.pane; save(); renderIndicators(); scheduleRender(); } $('#legMenu')?.remove(); return; }
  const b = e.target.closest('[data-leg]'); if (!b) { $('#legMenu')?.remove(); return; }
  const t = b.dataset.leg, id = b.dataset.id, act = b.dataset.do; $('#legMenu')?.remove();
  if (t === 'pine') {
    const p = state.pine.find(x => x.sid === id); if (!p) return;
    if (act === 'eye') { if (p.hide) delete p.hide; else p.hide = true; save(); scheduleRender(); }
    else if (act === 'set') { pineSetSid = id; openPineDialog(id); }
    else if (act === 'del') { state.pine = state.pine.filter(x => x !== p); delete pineRes[p.sid]; save(); renderIndicators(); countIndicators(); scheduleRender(); toast('Quitado del gráfico (sigue en Mis indicadores)'); }
    else if (act === 'move') {
      const r = pineRes[id], cur = p.pane || (r && r.meta && r.meta.overlay ? 'main' : 'bottom'), r0 = b.getBoundingClientRect();
      const mk = (v, tx) => `<button data-leg-pane="${v}" data-id="${esc(id)}" class="${cur === (v || (r && r.meta && r.meta.overlay ? 'main' : 'bottom')) ? 'cur' : ''}">${tx}</button>`;
      const el = document.createElement('div'); el.id = 'legMenu'; el.innerHTML = mk('main', 'Sobre el gráfico') + mk('top', 'Panel arriba') + mk('bottom', 'Panel abajo');
      el.style.cssText = `left:${Math.min(r0.left, innerWidth - 170)}px;top:${r0.bottom + 4}px`; document.body.appendChild(el);
    }
    return;
  }
  if (t === 'nova') { if (act === 'set') openNovaDialog(); else if (act === 'eye' || act === 'del') { novaToggleAll(false); novaAfter(); toast('Nova Nexus apagado: actívalo en Indicadores → Mis indicadores'); } return; }
  if (t === 'std') {
    if (act === 'set') { openStdDialog(id); return; }
    state.indicators[id] = false; save(); renderIndicators(); countIndicators(); if (candles.length) { calcNova(); calcExtra(); } scheduleRender(); toast('Indicador apagado: puedes volver a activarlo en Indicadores');
  }
});
function render() { renderCore(); syncLegend(); }
(() => {
  const box = $('#legendBox'); if (!box) return; let drag = null;
  box.addEventListener('pointerdown', e => {
    const el = e.target.closest('.pane-grip'); if (!el) return; e.preventDefault(); e.stopPropagation();
    drag = {el, key: el.dataset.gk, dir: el.dataset.gd, h0: +el.dataset.gh, y0: e.clientY, top0: parseFloat(el.style.top), max: +el.dataset.gh + Math.max(0, (geo ? geo.plotH : 200) - 80)};
    gripDrag = true; box.classList.add('dragging'); el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch {}
  });
  box.addEventListener('pointermove', e => {
    if (!drag) return; let dy = e.clientY - drag.y0, nh = Math.round(drag.dir === 'up' ? drag.h0 - dy : drag.h0 + dy);
    nh = Math.max(36, Math.min(drag.max, nh)); dy = drag.dir === 'up' ? drag.h0 - nh : nh - drag.h0;
    paneH[drag.key] = nh; drag.el.style.top = (drag.top0 + dy) + 'px'; scheduleRender();
  });
  const end = () => { if (!drag) return; drag.el.classList.remove('on'); drag = null; gripDrag = false; box.classList.remove('dragging'); savePaneH(); legSig = ''; scheduleRender(); };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  box.addEventListener('dblclick', e => { const el = e.target.closest('.pane-grip'); if (!el) return; delete paneH[el.dataset.gk]; savePaneH(); legSig = ''; scheduleRender(); toast('Altura automática'); });
})();
function openStdDialog(key) {
  const meta = indicatorMeta.find(m => m[0] === key), schema = STD_SCHEMA[key];
  if (!schema) { toast('Este indicador no tiene parámetros'); return; }
  const inputs = schema.map(([nm, title, type, def, mn, mx, opts]) => Object.assign({key: nm, title, type, def, min: mn, max: mx, value: sp(key, nm), group: type === 'color' || nm === 'width' || nm === 'dash' ? 'ESTILO' : 'PARÁMETROS'}, opts ? {options: opts} : {}));
  CCTSettings.open({title: meta ? meta[1] : key, tabs: ['in'], note: 'Parámetros del indicador. Las alertas con este indicador siguen usando los valores clásicos.', inputs, values: Object.fromEntries(inputs.map(i => [i.key, i.value])), plots: [], hlines: [], objects: [], shapes: [], onApply: res => {
    const q = {}; for (const i of inputs) { let v = res.inputs[i.key]; if (v === undefined) continue; if (i.type === 'string') { if (!i.options.includes(v) || v === i.def) continue; } else if (i.type !== 'color') { v = +v; if (!Number.isFinite(v)) continue; v = Math.max(i.min, Math.min(i.max, v)); if (i.type === 'int') v = Math.round(v); } if (v !== i.def) q[i.key] = v; }
    const sps = Object.assign({}, state.stdParams); if (Object.keys(q).length) sps[key] = q; else delete sps[key]; state.stdParams = sanStdParams(sps);
    save(); if (candles.length) recalc(); scheduleRender(); toast('Configuración aplicada');
  }});
}
function openChartStyle() {
  const cs = cstyle(); let bgDef = '#101725'; try { let n = $('#chartArea'); while (n) { const c = getComputedStyle(n).backgroundColor, m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c); if (m && (m[4] === undefined || +m[4] > 0)) { bgDef = '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join(''); break; } n = n.parentElement; } } catch {}
  const lineDef = '#263244', P = (key, title, type, def, group, extra) => Object.assign({key, title, type, def, value: state.chartStyle && state.chartStyle[key] !== undefined ? state.chartStyle[key] : def, group}, extra || {});
  const inputs = [
    P('bg', 'Color de fondo', 'color', bgDef, '🖼 FONDO Y CUADRÍCULA'), P('gridH', 'Líneas horizontales', 'bool', true, '🖼 FONDO Y CUADRÍCULA'), P('gridV', 'Líneas verticales', 'bool', true, '🖼 FONDO Y CUADRÍCULA'), P('grid', 'Color de la cuadrícula', 'color', lineDef, '🖼 FONDO Y CUADRÍCULA'),
    P('up', 'Vela alcista · cuerpo', 'color', CHART_DEF.up, '🕯 VELAS'), P('down', 'Vela bajista · cuerpo', 'color', CHART_DEF.down, '🕯 VELAS'),
    P('upBorder', 'Alcista · borde', 'color', cs.upBorder || cs.up, '🕯 VELAS'), P('downBorder', 'Bajista · borde', 'color', cs.downBorder || cs.down, '🕯 VELAS'),
    P('upWick', 'Alcista · mecha', 'color', cs.upWick || cs.up, '🕯 VELAS'), P('downWick', 'Bajista · mecha', 'color', cs.downWick || cs.down, '🕯 VELAS'),
    P('hollow', 'Velas alcistas huecas', 'bool', false, '🕯 VELAS'), {key: 'reset', title: 'Restablecer todo a los valores por defecto', type: 'bool', def: false, value: false, group: '↺ RESTABLECER'}];
  CCTSettings.open({title: 'Aspecto del gráfico', tabs: ['in'], note: 'Colores y cuadrícula del gráfico. Se guardan en este dispositivo y en tu cuenta de Google si iniciaste sesión.', inputs, values: Object.fromEntries(inputs.map(i => [i.key, i.value])), plots: [], hlines: [], objects: [], shapes: [], onApply: res => {
    const v = res.inputs, o = {};
    if (!v.reset) for (const i of inputs) { if (i.key === 'reset') continue; const x = v[i.key]; if (x === undefined) continue; const dflt = i.key === 'bg' ? bgDef : i.key === 'grid' ? lineDef : (i.key === 'upBorder' ? (v.up || CHART_DEF.up) : i.key === 'downBorder' ? (v.down || CHART_DEF.down) : i.key === 'upWick' ? (v.up || CHART_DEF.up) : i.key === 'downWick' ? (v.down || CHART_DEF.down) : i.def); if (x !== dflt) o[i.key] = x; }
    state.chartStyle = sanChartStyle(o); save(); scheduleRender(); toast(v.reset ? 'Aspecto restablecido' : 'Aspecto aplicado');
  }});
}
$('#chartStyleBtn').onclick = openChartStyle;
function renderCore() {
  if (currentView !== 'chartView') return;
  const el = $('#priceCanvas'); if (!el.getBoundingClientRect().width) return;
  const {w, h} = setupCanvas();
  const css = getComputedStyle(document.body);
  const text = css.getPropertyValue('--muted').trim(), line = css.getPropertyValue('--line').trim(), bg = css.getPropertyValue('--bg').trim(), drawCol = css.getPropertyValue('--draw').trim() || '#e9c36e', fg = css.getPropertyValue('--text').trim();
  syncNovaCols(); const CS = cstyle(), up = CS.up, down = CS.down;
  g.clearRect(0, 0, w, h); if (CS.bg) { g.fillStyle = CS.bg; g.fillRect(0, 0, w, h); }
  const gridCol = CS.grid || line; grips = [];
  const n = candles.length; if (!n) { geo = null; return; }

  const pineKeyNow = `${state.symbol}|${state.interval}|${candles[0].t}`;
  legRows = [];
  const prAll = activePine().filter(p => pineVisibleOn(p, state.interval)).map(p => ({p, r: pineStyled(pineRes[p.sid], p)})).filter(x => x.r && x.r.ok && x.r._key === pineKeyNow), pr = prAll.filter(x => !x.p.hide), pHid = prAll.filter(x => x.p.hide);
  const paneOf = x => x.p.pane || (x.r.meta.overlay ? 'main' : 'bottom'); // dónde se dibuja cada script: sobre el precio, en un panel arriba o en un panel abajo
  const pOver = pr.filter(x => paneOf(x) === 'main'), pSub = pr.filter(x => paneOf(x) === 'bottom'), pTop = pr.filter(x => paneOf(x) === 'top');
  const left = 6, right = 64, axisH = 22, top0 = 6;
  const psc = paneScale, hasTbl = prAll.some(x => x.r.tables && x.r.tables.length && !x.r.plots.length && !(x.r.shapes || []).length && !x.p.hide), rsiH0 = state.indicators.rsi ? Math.round(Math.max(70, h * (hasTbl ? .1 : .16))) : 0, volH0 = state.indicators.volume ? Math.round(Math.max(40, h * (hasTbl ? .07 : .12))) : 0;
  const cap = Math.max(40, h - axisH - 80 - top0); let rsiH = rsiH0 && paneH.rsi ? clamp(paneH.rsi, 40, cap) : rsiH0, volH = volH0 && paneH.vol ? clamp(paneH.vol, 36, cap) : volH0;
  const panelKeys = [...PANELS.filter(k => state.indicators[k] && ind[k]), ...pSub.map(x => 'pine:' + x.p.sid)];
  const isC = k => paneH[k] > 0;
  const tblOnly = x => !!(x && x.r && x.r.tables && x.r.tables.length && !x.r.plots.length && !(x.r.shapes || []).length);
  const tblW = panelKeys.length + pTop.length > 3 ? 2 : 4, wBot = panelKeys.map(k => k.startsWith('pine:') && tblOnly(pr.find(x => 'pine:' + x.p.sid === k)) ? tblW : 1), wTop = pTop.map(x => tblOnly(x) ? tblW : 1), wSum = wBot.map((x, i) => isC(panelKeys[i]) ? 0 : x).concat(wTop.map((x, i) => isC('pine:' + pTop[i].p.sid) ? 0 : x)).reduce((a, b) => a + b, 0), nAuto = panelKeys.filter(k => !isC(k)).length + pTop.filter(x => !isC('pine:' + x.p.sid)).length, customSum = panelKeys.filter(isC).reduce((s2, k) => s2 + clamp(paneH[k], 40, cap), 0) + pTop.filter(x => isC('pine:' + x.p.sid)).reduce((s2, x) => s2 + clamp(paneH['pine:' + x.p.sid], 40, cap), 0);
  const panelBudget = Math.max(0, Math.min(h - axisH - (wSum > nAuto ? 120 : 170) - rsiH - volH - customSum, h * Math.min(.85, .6 + (psc - 1) * .25 + (wSum > nAuto ? .2 : 0)) - rsiH - volH - customSum));
  const unitH = wSum ? Math.max(56, Math.min(clamp(h * .16, 52, 110) * psc, panelBudget / wSum)) : 0; let hBot = wBot.map((x, i) => isC(panelKeys[i]) ? Math.round(clamp(paneH[panelKeys[i]], 40, cap)) : Math.round(Math.max(56, unitH * x))), hTop = wTop.map((x, i) => isC('pine:' + pTop[i].p.sid) ? Math.round(clamp(paneH['pine:' + pTop[i].p.sid], 40, cap)) : Math.round(Math.max(56, unitH * x)));
  { // todos los paneles (volumen, RSI, los de abajo y los de arriba) deben caber en el lienzo: si no, el último (p. ej. el oscilador) quedaba fuera de pantalla y parecía que no se había agregado
    const sum = a => a.reduce((x, y) => x + y, 0), minPlot = Math.max(110, Math.round(h * .3)), room = Math.max(0, h - axisH - top0 - minPlot), tot = rsiH + volH + sum(hBot) + sum(hTop);
    if (tot > room && tot > 0) {
      const k = room / tot, fl = (v, f) => v ? Math.max(f, Math.round(v * k)) : 0;
      let f = 36; const apply = () => { rsiH = fl(rsiH0 && rsiH, f); volH = fl(volH0 && volH, f); hBot = hBot.map(v => fl(v, f)); hTop = hTop.map(v => fl(v, f)); };
      const r0 = rsiH, v0 = volH, b0 = hBot.slice(), t0 = hTop.slice(); apply();
      if (rsiH + volH + sum(hBot) + sum(hTop) > Math.max(room, h - axisH - top0 - 80)) { f = 24; rsiH = r0; volH = v0; hBot = b0; hTop = t0; apply(); } // muchos paneles: se reduce el mínimo antes de dejar que alguno desaparezca
    }
  }
  const offOf = arr => arr.map((_, i) => arr.slice(0, i).reduce((a, b) => a + b, 0)), oBot = offOf(hBot), oTop = offOf(hTop);
  const extraH = hBot.reduce((a, b) => a + b, 0), topH = hTop.reduce((a, b) => a + b, 0), plotTop = top0 + topH;
  const vpOn = !!(state.indicators.nnVP && ind.vp), gutter = vpOn ? clamp(Math.round((w - left - right) * .4), 110, 300) : 0; // margen derecho para el perfil
  const plotH = Math.max(80, h - axisH - rsiH - volH - extraH - plotTop), plotW = w - left - right - gutter;
  const count = clamp(visible, 15, 400);
  pan = clamp(pan, -Math.floor(count * .4), Math.max(0, n - Math.ceil(count * .3)));
  const end = n - pan, start = end - count, step = plotW / count;
  const lo = Math.max(0, Math.floor(start)), hi = Math.min(n, Math.ceil(end));
  if (hi <= lo) return;

  let min = Infinity, max = -Infinity;
  for (let i = lo; i < hi; i++) { if (candles[i].l < min) min = candles[i].l; if (candles[i].h > max) max = candles[i].h; }
  const pineOff = [];
  for (const {r} of pOver) { const c = CCTPineDraw.contrib(r, lo, hi, min, max); if (Number.isFinite(c.min)) { min = Math.min(min, c.min); max = Math.max(max, c.max); } pineOff.push(...c.off); }
  const overlays = [];
  if (state.indicators.ema20) overlays.push([`EMA ${sp('ema20', 'len')}`, ind.ema20, sp('ema20', 'color'), false, 'ema20', lineSty('ema20')]);
  if (state.indicators.ema50) overlays.push([`EMA ${sp('ema50', 'len')}`, ind.ema50, sp('ema50', 'color'), false, 'ema50', lineSty('ema50')]);
  if (state.indicators.sma200) overlays.push([`SMA ${sp('sma200', 'len')}`, ind.sma200, sp('sma200', 'color'), false, 'sma200', lineSty('sma200')]);
  if (state.indicators.wma20 && ind.wma20) overlays.push([`WMA ${sp('wma20', 'len')}`, ind.wma20, sp('wma20', 'color'), false, 'wma20', lineSty('wma20')]);
  if (state.indicators.vwap && ind.vwap) overlays.push(['VWAP', ind.vwap, sp('vwap', 'color'), false, 'vwap', lineSty('vwap')]);
  if (state.indicators.supertrend && ind.stUp) overlays.push(['Supertrend ↑', ind.stUp, sp('supertrend', 'up'), false, null, {w: sp('supertrend', 'width'), d: []}], ['Supertrend ↓', ind.stDn, sp('supertrend', 'down'), false, null, {w: sp('supertrend', 'width'), d: []}]);
  if (state.indicators.bollinger) overlays.push(['BB sup', ind.bbU, sp('bollinger', 'color'), false, 'bollinger', lineSty('bollinger')], ['BB inf', ind.bbL, sp('bollinger', 'color'), false, null, lineSty('bollinger')]);
  for (const [, arr] of overlays) for (let i = lo; i < hi; i++) if (arr[i] != null) { if (arr[i] < min) min = arr[i]; if (arr[i] > max) max = arr[i]; }
  if (state.indicators.nnTrail && ind.trail) for (let i = lo; i < hi; i++) { const v = ind.trail.trail[i]; if (v != null) { if (v < min) min = v; if (v > max) max = v; } }
  const nn = ind.nn;
  if (nn && state.indicators.nnEma) for (let i = lo; i < hi; i++) { const a = nn.emaTop[i], b = nn.emaBot[i]; if (Number.isFinite(a) && a > max) max = a; if (Number.isFinite(b) && b < min) min = b; }
  const range = Math.max(max - min, Math.abs(max) * 1e-5), pad = range * .08; min -= pad; max += pad;
  if (priceMan) { min = priceMan.min; max = priceMan.max; }
  { const lb = document.querySelector('.chart-label'); if (lb) lb.style.top = (topH + 8) + 'px'; } // la leyenda del precio baja si hay paneles arriba
  geo = {w, h, left, right, gutter, axisH, plotTop, plotH, plotW, count, start, end, step, min, max, volTop: plotTop + plotH, rsiTop: plotTop + plotH + volH, extraTop: plotTop + plotH + volH + rsiH};

  if (volH) grips.push({key: 'vol', y: geo.volTop, dir: 'up', h: volH});
  if (rsiH) grips.push({key: 'rsi', y: geo.rsiTop, dir: 'up', h: rsiH});
  panelKeys.forEach((k, i) => grips.push({key: k, y: geo.extraTop + oBot[i], dir: 'up', h: hBot[i]}));
  pTop.forEach((x, i) => grips.push({key: 'pine:' + x.p.sid, y: top0 + oTop[i] + hTop[i], dir: 'down', h: hTop[i]}));
  // cuadrícula y escala de precios
  g.font = '10px system-ui'; g.textAlign = 'left'; g.lineWidth = .6;
  for (let i = 0; i <= 4; i++) {
    const yy = plotTop + i * plotH / 4, pr = max - (max - min) * i / 4;
    if (CS.gridH) { g.strokeStyle = gridCol; g.beginPath(); g.moveTo(left, yy); g.lineTo(w - right + 2, yy); g.stroke(); }
    g.fillStyle = text; g.fillText(fmt(pr), w - right + 6, yy + 3);
  }
  // eje de tiempo
  const stride = Math.max(1, Math.ceil(70 / step));
  g.fillStyle = text; g.textAlign = 'center';
  for (let i = Math.ceil(lo / stride) * stride; i < hi; i += stride) {
    const xx = X(i); if (xx < left + 14 || xx > w - right - 14) continue;
    if (CS.gridV) { g.strokeStyle = gridCol; g.beginPath(); g.moveTo(xx, top0); g.lineTo(xx, plotTop + plotH + volH + rsiH + extraH); g.stroke(); }
    g.fillText(timeLabel(candles[i].t, i > 0 ? candles[i - 1].t : null), xx, h - 7);
  }
  g.textAlign = 'left';

  g.save(); g.beginPath(); g.rect(left, plotTop, plotW + 2, plotH); g.clip();
  // Nova Nexus · EMA Cloud (detrás de las velas)
  if (nn && state.indicators.nnEma) drawNovaCloud(nn, lo, hi, css);
  if (nn && nn.smc && state.indicators.nnOb) drawNovaOB(nn.smc);
  if (state.indicators.nnRev && ind.rev) drawNovaRev(ind.rev, lo, hi);
  if (state.indicators.nnSR && ind.sr) drawNovaSRBoxes(ind.sr, lo, hi);
  if (state.indicators.nnPiv && ind.piv) drawNovaPivots(ind.piv, lo, hi);
  if (state.indicators.nnLiq && ind.liq) drawNovaLiq(ind.liq, lo, hi, fg);
  if (vpOn) drawNovaVPZone(ind.vp);
  if (state.indicators.nnTrail && ind.trail) drawNovaTrailFill(ind.trail, lo, hi);
  // velas
  const barW = clamp(step * .66, 1.5, 16), limeBars = !!(state.indicators.nnLiq && state.indicators.nnLiqBars && ind.liq);
  const pineBar = {};
  for (const {r} of pr) for (const e of r.barcolors) for (const [bar, ci] of e.pts) pineBar[bar + (e.offset || 0)] = r.palette[ci];
  for (let i = lo; i < hi; i++) {
    const d = candles[i], xx = X(i), col = pineBar[i] || (limeBars && d.t > ind.liq.after ? '#00e676' : d.c >= d.o ? up : down), yo = Y(d.o), yc = Y(d.c);
    const isUp = d.c >= d.o, custom = !pineBar[i] && !(limeBars && d.t > ind.liq.after), wk = custom ? (isUp ? CS.upWick : CS.downWick) || col : col, bd = custom ? (isUp ? CS.upBorder : CS.downBorder) || col : col;
    g.lineWidth = 1; g.strokeStyle = wk; g.beginPath(); g.moveTo(xx, Y(d.h)); g.lineTo(xx, Y(d.l)); g.stroke();
    if (custom && CS.hollow && isUp) { g.strokeStyle = bd; g.strokeRect(xx - barW / 2 + .5, Math.min(yo, yc) + .5, Math.max(1, barW - 1), Math.max(1, Math.abs(yo - yc) - 1)); }
    else { g.fillStyle = col; g.fillRect(xx - barW / 2, Math.min(yo, yc), barW, Math.max(1, Math.abs(yo - yc))); if (custom && bd !== col) { g.strokeStyle = bd; g.strokeRect(xx - barW / 2 + .5, Math.min(yo, yc) + .5, Math.max(1, barW - 1), Math.max(1, Math.abs(yo - yc) - 1)); } }
  }
  // medias y bandas
  if (state.indicators.bollinger && ind.bbU && sp('bollinger', 'fill') !== '#748bab00') fillBetween(ind.bbU, ind.bbL, lo, hi, sp('bollinger', 'fill'), 1);
  for (const [, arr, col, , , sty] of overlays) {
    g.strokeStyle = col; g.lineWidth = sty ? sty.w : 1.4; g.setLineDash(sty ? sty.d : []); g.beginPath();
    let on = false;
    for (let i = lo; i < hi; i++) { if (arr[i] == null) { on = false; continue; } const xx = X(i), yy = Y(arr[i]); if (!on) { g.moveTo(xx, yy); on = true; } else g.lineTo(xx, yy); }
    g.stroke(); g.setLineDash([]);
  }
  for (const {r} of pOver) CCTPineDraw.draw(g, r, {X, Y, lo, hi, left, right: left + plotW, top: plotTop, bottom: plotTop + plotH, step, candles, overlay: true});
  for (const {r} of pSub.concat(pTop)) if (r.strategy) CCTPineDraw.drawTrades(g, r.strategy, {X, Y, lo, hi, candles}); // estrategias con panel propio: las operaciones se marcan igual sobre el precio
  if (state.indicators.nnTrail && ind.trail) drawNovaTrailLine(ind.trail, lo, hi);
  if (state.indicators.nnSR && ind.sr) drawNovaSRLabels(ind.sr, lo, hi);
  // cruces EMA 20 / EMA 50
  if (state.indicators.cross && ind.cross) {
    g.font = 'bold 11px system-ui'; g.textAlign = 'center';
    for (let i = lo; i < hi; i++) {
      const k = ind.cross[i]; if (!k) continue;
      g.fillStyle = k > 0 ? '#20bf9f' : '#f06b79';
      g.fillText(k > 0 ? '▲' : '▼', X(i), k > 0 ? Y(candles[i].l) + 14 : Y(candles[i].h) - 6);
    }
    g.textAlign = 'left';
  }
  // Nova Nexus · señales y niveles TP/SL
  if (nn && (state.indicators.nnIa || state.indicators.nnTp)) drawNovaSignals(nn, lo, hi, n);
  if (nn && nn.smc && state.indicators.nnSmc) drawNovaStruct(nn.smc);
  // dibujos del usuario
  for (const d of getDrawings()) drawShape(d, d.id === selectedId, drawCol, text);
  if (pending2) drawShape({id: '_', type: 'trend', a: pending2.a, b: pending2.b}, false, drawCol, text);
  if (preview) drawShape({id: '_', type: drawTool, a: preview.a, b: preview.b, c: preview.c}, false, drawCol, text);
  if (brushLive && brushLive.length > 1) drawBrush({pts: brushLive, col: state.brush.c, w: state.brush.w}, false, drawCol);
  if (pending) { const P = px(pending); g.fillStyle = drawCol; g.beginPath(); g.arc(P.x, P.y, 5, 0, 7); g.fill(); }
  g.restore();

  // asas de agarre: barra derecha (escala de precio) e inferior (escala de tiempo)
  g.fillStyle = priceMan ? '#548fff' : text; g.globalAlpha = priceMan ? .95 : .55;
  roundRect(w - 7, plotTop + plotH / 2 - 22, 4, 44, 2); g.fill();
  g.fillStyle = text; g.globalAlpha = .55; roundRect(left + plotW / 2 - 22, h - 6, 44, 4, 2); g.fill(); g.globalAlpha = 1;
  // etiqueta de último precio
  const lastC = candles[n - 1], ly = Y(lastC.c);
  if (ly > plotTop && ly < plotTop + plotH) {
    const col = lastC.c >= lastC.o ? up : down;
    g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(left, ly); g.lineTo(w - right + 2, ly); g.stroke(); g.setLineDash([]);
    g.fillStyle = col; g.fillRect(w - right + 2, ly - 9, right - 3, 18); g.fillStyle = '#fff'; g.fillText(fmt(lastC.c), w - right + 5, ly + 3.5);
  }
  // leyenda de indicadores
  let ly2 = plotTop + 54; g.font = '12px system-ui'; const LS = legStep();
  for (const [name, arr, col, , okey] of overlays) { if (/^BB inf|^Supertrend/.test(name)) continue; const v = [...arr].reverse().find(x => x != null); const tx = `${name.replace('BB sup', 'Bollinger')}  ${v != null ? fmt(v) : '—'}`; g.fillStyle = col; if (okey) legLabel(tx, left + 8, ly2, {t: 'std', key: okey}); else g.fillText(tx, left + 8, ly2); ly2 += LS; }

  for (const {p, r} of pOver) { g.fillStyle = text; { const tx = `ƒ ${(r.meta.short || r.meta.title || '').slice(0, 28)}`; legLabel(tx, left + 8, ly2, {t: 'pine', sid: p.sid, pane: 'main'}); } ly2 += LS; for (const it of CCTPineDraw.legend(r, n - 1).slice(0, 4)) { g.fillStyle = it.color; g.fillText(it.text, left + 8, ly2); ly2 += 17; } }
  for (const {p, r} of pHid) { const tx = `ƒ ${(r.meta.short || r.meta.title || '').slice(0, 24)} (oculto)`; g.globalAlpha = .5; g.fillStyle = text; legLabel(tx, left + 8, ly2, {t: 'pine', sid: p.sid, pane: 'main'}, true); g.globalAlpha = 1; ly2 += LS; }
  if (novaOn() && ind.nn) { const tx = 'Nova Nexus'; g.fillStyle = '#11cf77'; legLabel(tx, left + 8, ly2, {t: 'nova'}); ly2 += LS; }
  if (state.indicators.supertrend && ind.stDir) { const j = ind.stDir.length - 1, dv = ind.stDir[j]; if (dv != null) { g.fillStyle = dv < 0 ? '#20bf9f' : '#f06b79'; { const tx = `Supertrend ${dv < 0 ? '↑' : '↓'}  ${fmt((dv < 0 ? ind.stUp : ind.stDn)[j])}`; legLabel(tx, left + 8, ly2, {t: 'std', key: 'supertrend'}); } ly2 += LS; } }

  // volumen
  if (volH) {
    const top = geo.volTop + 4, height = volH - 8; let maxV = 1;
    for (let i = lo; i < hi; i++) maxV = Math.max(maxV, candles[i].v);
    g.strokeStyle = line; g.beginPath(); g.moveTo(left, geo.volTop); g.lineTo(w - right + 2, geo.volTop); g.stroke();
    g.fillStyle = text; legLabel('VOL', left + 4, top + 16, {t: 'std', key: 'volume'});
    for (let i = lo; i < hi; i++) { const d = candles[i]; g.fillStyle = d.c >= d.o ? (sp('volume', 'up') === '#20bf9faa' ? up + 'aa' : sp('volume', 'up')) : (sp('volume', 'down') === '#f06b79aa' ? down + 'aa' : sp('volume', 'down')); const bh = Math.max(1, d.v / maxV * height); g.fillRect(X(i) - barW / 2, top + height - bh, barW, bh); }
  }
  // RSI
  if (rsiH) {
    const top = geo.rsiTop + 4, height = rsiH - 12;
    g.strokeStyle = line; g.beginPath(); g.moveTo(left, geo.rsiTop); g.lineTo(w - right + 2, geo.rsiTop); g.stroke();
    const lastR = [...ind.rsi].reverse().find(x => x != null);
    { const tx = `RSI ${sp('rsi', 'len')}  ${lastR != null ? lastR.toFixed(1) : '—'}`; g.fillStyle = text; legLabel(tx, left + 4, top + 16, {t: 'std', key: 'rsi'}); }
    g.setLineDash([2, 3]);
    for (const r of [sp('rsi', 'os'), sp('rsi', 'ob')]) { const yy = top + (100 - r) / 100 * height; g.strokeStyle = line; g.beginPath(); g.moveTo(left, yy); g.lineTo(w - right, yy); g.stroke(); g.fillStyle = text; g.fillText(String(r), w - right + 6, yy + 3); }
    g.setLineDash([]);
    g.strokeStyle = sp('rsi', 'color'); g.lineWidth = sp('rsi', 'width'); g.beginPath(); let on = false;
    for (let i = lo; i < hi; i++) { const v = ind.rsi[i]; if (v == null) { on = false; continue; } const yy = top + (100 - v) / 100 * height; if (!on) { g.moveTo(X(i), yy); on = true; } else g.lineTo(X(i), yy); }
    g.stroke();
  }
  panelKeys.forEach((k, idx) => k.startsWith('pine:') ? drawPinePane(pr.find(x => 'pine:' + x.p.sid === k), geo.extraTop + oBot[idx], hBot[idx], lo, hi, {left, w, right, line, text, step, plotW}) : drawSubPanel(k, geo.extraTop + oBot[idx], hBot[idx], lo, hi, {left, w, right, line, text}));
  pTop.forEach((x, idx) => drawPinePane(x, top0 + oTop[idx], hTop[idx], lo, hi, {left, w, right, line, text, step, plotW}));
  if (pTop.length) { g.strokeStyle = line; g.lineWidth = .6; g.setLineDash([]); g.beginPath(); g.moveTo(left, plotTop); g.lineTo(w - right + 2, plotTop); g.stroke(); }
  if (vpOn) drawNovaVP(ind.vp, fg);
  if (state.indicators.nnLiq && ind.liq) drawNovaLiqTable(fg);
  if (nn && state.indicators.nnRules) drawNovaRules();
  if (nn && state.indicators.nnIa && nn.last) drawNovaScore(nn.last);
  // retícula (mantener pulsado)
  let shown = candles[hi - 1];
  if (cross) {
    const i = clamp(Math.round(IDX(cross.x)), 0, n - 1), c = candles[i]; shown = c;
    const cx = X(i), cy = clamp(cross.y, plotTop, plotTop + plotH);
    g.strokeStyle = fg; g.globalAlpha = .55; g.lineWidth = 1; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(cx, top0); g.lineTo(cx, h - axisH); g.moveTo(left, cy); g.lineTo(w - right + 2, cy); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
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
/* ───────── Paneles inferiores: MACD · Estocástico · ATR · OBV ───────── */
function drawSubPanel(key, top0, H, lo, hi, o) {
  const {left, w, right, line, text} = o, top = top0 + 4, height = H - 10, fmtV = v => v == null ? '—' : Math.abs(v) >= 1000 ? v.toLocaleString('en-US', {maximumFractionDigits: 0}) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(6);
  const D = ind[key]; if (!D) return;
  const series = key === 'macd' ? [[D.line, sp('macd', 'cLine')], [D.signal, sp('macd', 'cSig')]] : key === 'stoch' ? [[D.k, sp('stoch', 'cK')], [D.d, sp('stoch', 'cD')]] : [[D, key === 'atr' ? sp('atr', 'color') : sp('obv', 'color')]];
  const hist = key === 'macd' ? D.hist : null;
  let mn = Infinity, mx = -Infinity;
  const take = arr => { for (let i = lo; i < hi; i++) { const v = arr[i]; if (v != null) { if (v < mn) mn = v; if (v > mx) mx = v; } } };
  if (key === 'stoch') { mn = 0; mx = 100; } else { series.forEach(([a]) => take(a)); if (hist) take(hist); }
  if (!Number.isFinite(mn) || !Number.isFinite(mx)) return;
  if (key === 'macd') { const m = Math.max(Math.abs(mn), Math.abs(mx)) || 1; mn = -m; mx = m; } // el cero queda al centro
  if (mx === mn) { mx += 1; mn -= 1; }
  const pad = key === 'stoch' ? 0 : (mx - mn) * .08; mn -= pad; mx += pad;
  const Yp = v => top + (mx - v) / (mx - mn) * height;
  g.save(); g.beginPath(); g.rect(left, top0, w - left, H); g.clip(); // incluye el eje derecho para que se vean los niveles y la escala
  g.strokeStyle = line; g.lineWidth = .6; g.setLineDash([]); g.beginPath(); g.moveTo(left, top0); g.lineTo(w - right + 2, top0); g.stroke();
  g.font = '10px system-ui';
  const last = a => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };
  const label = {macd: `MACD ${sp('macd', 'fast')} ${sp('macd', 'slow')} ${sp('macd', 'sig')}`, stoch: `Estoc ${sp('stoch', 'k')} ${sp('stoch', 'ks')} ${sp('stoch', 'd')}`, atr: `ATR ${sp('atr', 'len')}`, obv: 'OBV'}[key];
  { const tx = `${label}  ${series.map(([a]) => fmtV(last(a))).join('  ')}`; g.fillStyle = text; legLabel(tx, left + 4, top + 16, {t: 'std', key}); }
  if (key === 'stoch') {
    g.setLineDash([2, 3]);
    for (const r of [sp('stoch', 'lo'), sp('stoch', 'hi')]) { const yy = Yp(r); g.strokeStyle = line; g.beginPath(); g.moveTo(left, yy); g.lineTo(w - right, yy); g.stroke(); g.fillStyle = text; g.fillText(String(r), w - right + 6, yy + 3); }
    g.setLineDash([]);
  } else if (key === 'macd') {
    const y0 = Yp(0); g.setLineDash([2, 3]); g.strokeStyle = line; g.beginPath(); g.moveTo(left, y0); g.lineTo(w - right, y0); g.stroke(); g.setLineDash([]);
    const bw = clamp(geo.step * .6, 1, 12);
    for (let i = lo; i < hi; i++) { const v = hist[i]; if (v == null) continue; const pv = i > 0 ? hist[i - 1] : null; g.globalAlpha = (v >= 0 ? (pv != null && v < pv) : (pv != null && v > pv)) ? .55 : .85; g.fillStyle = v >= 0 ? sp('macd', 'hUp') : sp('macd', 'hDn'); g.fillRect(X(i) - bw / 2, Math.min(y0, Yp(v)), bw, Math.max(1, Math.abs(Yp(v) - y0))); }
    g.globalAlpha = 1;
  } else { g.fillStyle = text; g.fillText(fmtV(mx), w - right + 6, top + 9); g.fillText(fmtV(mn), w - right + 6, top + height); }
  g.lineWidth = sp(key, 'width') || 1.4;
  for (const [a, col] of series) {
    g.strokeStyle = col; g.beginPath(); let on = false;
    for (let i = lo; i < hi; i++) { const v = a[i]; if (v == null) { on = false; continue; } if (!on) { g.moveTo(X(i), Yp(v)); on = true; } else g.lineTo(X(i), Yp(v)); }
    g.stroke();
  }
  g.restore();
}
/* ───────── Nova Nexus: dibujo ───────── */
const NN_COL = {buy: '#11cf77', sell: '#d11645', range: '#9b59b6', sl: '#ff4444', tp1: '#11cf77', tp2: '#00aaff', tp3: '#ff9900'};
function drawNovaCloud(nn, lo, hi, css) {
  const light = document.body.classList.contains('light');
  const bullFill = light ? 'rgba(70,95,150,.16)' : 'rgba(140,155,185,.20)', bearFill = light ? 'rgba(110,110,125,.16)' : 'rgba(120,125,140,.20)';
  const edge = light ? 'rgba(30,40,60,.35)' : 'rgba(200,210,230,.30)';
  const cB = novaP('cloudBull'), cR = novaP('cloudBear'), cE = novaP('cloudEdge'), dB = novaDef('cloudBull'), dR = novaDef('cloudBear'), dE = novaDef('cloudEdge');
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
    g.closePath(); g.fillStyle = bull ? (cB !== dB ? cB : bullFill) : (cR !== dR ? cR : bearFill); g.fill();
    i = j + 1;
  }
  g.strokeStyle = cE !== dE ? cE : edge; g.lineWidth = 1; g.setLineDash([]);
  for (const arr of [nn.emaTop, nn.emaBot]) {
    g.beginPath(); let on = false;
    for (let k = lo; k < hi; k++) { const v = arr[k]; if (!Number.isFinite(v)) { on = false; continue; } if (!on) { g.moveTo(X(k), Y(v)); on = true; } else g.lineTo(X(k), Y(v)); }
    g.stroke();
  }
}

/* ───────── Nova Nexus: Smooth Trail y Reversal Bands ───────── */
const TRAIL_COL = {bull: '#119c7e', bear: '#7c3cf3'}, REV_COL = {up: '#f23645', dn: '#089981'};
const hexArr = h => { const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(h || ''); return m ? [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), m[2] ? parseInt(m[2], 16) / 255 : 1] : [128, 128, 128, 1]; };
function syncNovaCols() { TRAIL_COL.bull = novaP('trailBull'); TRAIL_COL.bear = novaP('trailBear'); REV_COL.up = novaP('revUp'); REV_COL.dn = novaP('revDn'); SR_COL.sup = novaP('srSup'); SR_COL.res = novaP('srRes'); }
function vpPal(vp) { const o = {HVC: 'vpHvc', AVC: 'vpAvc', LVC: 'vpLvc', BLC: 'vpBlc', BRC: 'vpBrc'}, k = novaP('vpOp') / 100, m = new Map(), C = {}; for (const n in o) { const c = hexArr(novaP(o[n])); c[3] *= k; C[n] = c; m.set(vp.colors[n], c); } return {C, map: c => m.get(c) || c}; }
function fillBetween(top, bot, lo, hi, color, alpha) { // relleno entre dos series por tramos continuos
  g.fillStyle = color; g.globalAlpha = alpha;
  let i = lo;
  while (i < hi) {
    if (top[i] == null || bot[i] == null) { i++; continue; }
    let j = i; while (j + 1 < hi && top[j + 1] != null && bot[j + 1] != null) j++;
    g.beginPath(); g.moveTo(X(i), Y(top[i])); for (let k = i + 1; k <= j; k++) g.lineTo(X(k), Y(top[k])); for (let k = j; k >= i; k--) g.lineTo(X(k), Y(bot[k])); g.closePath(); g.fill();
    i = j + 1;
  }
  g.globalAlpha = 1;
}
function drawNovaRev(r, lo, hi) { // bandas 6-7 (suave) y 7-8 (fuerte), como los fill del Pine
  const ro = novaP('revOp') / 100;
  fillBetween(r.up[0], r.up[1], lo, hi, REV_COL.up, Math.min(1, .2 * ro)); fillBetween(r.up[1], r.up[2], lo, hi, REV_COL.up, Math.min(1, .5 * ro));
  fillBetween(r.dn[2], r.dn[1], lo, hi, REV_COL.dn, Math.min(1, .5 * ro)); fillBetween(r.dn[1], r.dn[0], lo, hi, REV_COL.dn, Math.min(1, .2 * ro));
}
function drawNovaTrailFill(t, lo, hi) {
  let i = lo;
  while (i < hi) {
    if (t.trail[i] == null || t.basis[i] == null) { i++; continue; }
    const bull = t.trend[i] === 1; let j = i; while (j + 1 < hi && t.trail[j + 1] != null && t.basis[j + 1] != null && (t.trend[j + 1] === 1) === bull) j++;
    const a = i > lo && t.trail[i - 1] != null ? i - 1 : i; // une con la barra anterior para no dejar huecos
    g.fillStyle = bull ? TRAIL_COL.bull : TRAIL_COL.bear; g.globalAlpha = .1;
    g.beginPath(); g.moveTo(X(a), Y(t.trail[a])); for (let k = a + 1; k <= j; k++) g.lineTo(X(k), Y(t.trail[k])); for (let k = j; k >= a; k--) g.lineTo(X(k), Y(t.basis[k])); g.closePath(); g.fill();
    g.globalAlpha = 1; i = j + 1;
  }
}
function drawNovaTrailLine(t, lo, hi) { // cada tramo toma el color de la tendencia de su barra final
  g.lineWidth = 1.4; g.setLineDash([]);
  for (let i = Math.max(lo, 1); i < hi; i++) {
    if (t.trail[i] == null || t.trail[i - 1] == null) continue;
    g.strokeStyle = t.trend[i] === 1 ? TRAIL_COL.bull : TRAIL_COL.bear;
    g.beginPath(); g.moveTo(X(i - 1), Y(t.trail[i - 1])); g.lineTo(X(i), Y(t.trail[i])); g.stroke();
  }
}

/* ───────── Nova Nexus: Volume Profile ───────── */
const rgbaOf = (c, a = c[3]) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+a.toFixed(3)})`;
function fmtVolPine(v) { // aproxima format.volume: 1.23K · 4.5M · 2B
  const a = Math.abs(v), sg = v < 0 ? '-' : '', t = x => String(+x.toFixed(2));
  return sg + (a >= 1e12 ? t(a / 1e12) + 'T' : a >= 1e9 ? t(a / 1e9) + 'B' : a >= 1e6 ? t(a / 1e6) + 'M' : a >= 1e3 ? t(a / 1e3) + 'K' : t(a));
}
function drawNovaVPZone(vp) { // zona del POC (Last(Zone)): caja y línea punteada sobre las velas del perfil
  const C = vpPal(vp).C, x1 = X(vp.from), x2 = X(vp.to), yT = Y(vp.pocTop), yB = Y(vp.pocBot), yc = Y(vp.pocPrice);
  g.fillStyle = rgbaOf(C.HVC, .27); g.fillRect(x1, yT, x2 - x1, yB - yT);
  g.strokeStyle = rgbaOf(C.HVC); g.lineWidth = 1; g.setLineDash([]); g.strokeRect(x1, yT, x2 - x1, yB - yT);
  g.setLineDash([1, 3]); g.beginPath(); g.moveTo(x1, yc); g.lineTo(x2, yc); g.stroke(); g.setLineDash([]);
}
function drawNovaVP(vp, fg) {
  const pal = vpPal(vp); // columnas del perfil: sentimiento | precios | volumen, en el margen derecho (mismo orden que el Pine)
  const G = geo.gutter, x0 = geo.left + geo.plotW, small = geo.w < 480;
  const Wp = clamp(Math.round(G * .30), 38, 56), R = G - Wp - 8, Ws = Math.round(R * .42), Wv = R - Ws;
  const sb = x0 + 4 + Ws, pc = sb + 1, vb = pc + Wp; // base del sentimiento (crece a la izquierda), columna de precios, base del volumen (crece a la derecha)
  g.save(); g.beginPath(); g.rect(x0, geo.plotTop, G, geo.plotH); g.clip();
  g.font = `${small ? 8 : 9}px system-ui`; g.textBaseline = 'alphabetic';
  const fits = (txt, wMax) => g.measureText(txt).width + 6 <= wMax;
  const pctTxt = v => `(${+v.toFixed(2)}%)`;
  for (const r of vp.rows) {
    const yT = Y(r.bot + vp.step * .9), yB = Y(r.bot + vp.step * .1), h = yB - yT;
    if (yB < geo.plotTop || yT > geo.plotTop + geo.plotH) continue;
    const ty = yT + h / 2 + 3, tall = h >= 8;
    // columna de precios
    g.fillStyle = 'rgba(41,98,255,.063)'; g.fillRect(pc, yT, Wp, h); g.strokeStyle = 'rgba(41,98,255,.5)'; g.lineWidth = 1; g.strokeRect(pc, yT, Wp, h);
    if (tall) { g.fillStyle = fg; g.textAlign = 'center'; g.fillText(fmt(r.center), pc + Wp / 2, ty); }
    // volumen (hacia la derecha)
    const wv = r.lpm * Wv;
    if (wv >= .5) {
      g.fillStyle = rgbaOf(pal.map(r.vcol)); g.fillRect(vb, yT, wv, h); g.strokeStyle = rgbaOf(pal.map(r.vcol)); g.strokeRect(vb, yT, wv, h);
      if (tall) { const full = `${fmtVolPine(r.quote)} USDT ${pctTxt(r.pct)}`, txt = fits(full, wv) ? full : fits(pctTxt(r.pct), wv) ? pctTxt(r.pct) : ''; if (txt) { g.fillStyle = fg; g.textAlign = 'left'; g.fillText(txt, vb + 3, ty); } }
    }
    // sentimiento (hacia la izquierda)
    const ws = r.dpm * Ws;
    if (r.scol && ws >= .5) {
      g.fillStyle = rgbaOf(pal.map(r.scol)); g.fillRect(sb - ws, yT, ws, h); g.strokeStyle = rgbaOf(pal.map(r.scol)); g.strokeRect(sb - ws, yT, ws, h);
      if (tall) { const full = `${fmtVolPine(r.bbp)} ${pctTxt(r.bpct)}`, txt = fits(full, ws) ? full : fits(pctTxt(r.bpct), ws) ? pctTxt(r.bpct) : ''; if (txt) { g.fillStyle = fg; g.textAlign = 'right'; g.fillText(txt, sb - 3, ty); } }
    }
  }
  g.restore(); g.textAlign = 'left';
}

/* ───────── Nova Nexus: Liquidaciones ───────── */
const LIQ_RGB = {up: '34,171,148', dn: '247,82,95'}, LIQ_ALPHA = {5: .10, 10: .20, 25: .30, 50: .40, 100: .50}; // transparencias 90/80/70/60/50 del Pine
function drawNovaLiq(liq, lo, hi, fg) {
  // fondo tenue en las velas anteriores a la fecha de inicio (bgcolor del Pine con chart.fg_color al 95 % de transparencia)
  g.fillStyle = fg; g.globalAlpha = .05;
  for (let i = lo; i < hi; i++) if (candles[i].t <= liq.after) g.fillRect(X(i) - geo.step / 2, geo.plotTop, geo.step, geo.plotH);
  g.globalAlpha = 1; g.lineWidth = 3; g.setLineDash([]); g.lineCap = 'butt';
  for (const L of liq.levels) for (const l of L.lines) {
    if (l.x2 < lo - 1 || l.x1 > hi + 1) continue;
    const y = Y(l.y); if (y < geo.plotTop - 4 || y > geo.plotTop + geo.plotH + 4) continue;
    g.strokeStyle = `rgba(${LIQ_RGB[l.side]},${LIQ_ALPHA[L.lev]})`;
    g.beginPath(); g.moveTo(X(l.x1), y); g.lineTo(X(l.x2), y); g.stroke();
  }
}
function drawNovaLiqTable(fg) { // tabla "Active Liquidation Levels" (centro-derecha); los cinco apalancamientos van activos por defecto
  const rows = [5, 10, 25, 50, 100], small = geo.w < 480, lh = small ? 14 : 17, w = small ? 96 : 118, hdr = lh * 2 + 4, h = hdr + rows.length * lh + 6;
  const x = geo.left + geo.plotW - w - 4, y = geo.plotTop + (geo.plotH - h) / 2;
  g.save(); g.fillStyle = 'rgba(0,0,0,.35)'; roundRect(x, y, w, h, 4); g.fill();
  g.font = `${small ? 8 : 10}px system-ui`; g.textAlign = 'left'; g.fillStyle = fg; g.globalAlpha = .5;
  g.fillText('Active', x + 6, y + lh - 3); g.fillText('Liquidation Levels', x + 6, y + lh * 2 - 3); g.globalAlpha = 1;
  rows.forEach((r, k) => { const yy = y + hdr + (k + 1) * lh - 3; g.fillStyle = fg; g.fillText(r + 'X', x + 6, yy); g.fillStyle = '#00e676'; g.fillText('⬤', x + w - (small ? 20 : 24), yy); });
  g.restore();
}

/* ───────── Nova Nexus: Pivots ───────── */
const PIV_COL = {miss_pl: 'rgba(38,166,153,.46)', miss_ph: 'rgba(239,83,80,.47)', ghost_pl: 'rgba(38,166,153,.5)', ghost_ph: 'rgba(239,83,80,.5)', proj_h: 'rgba(239,83,80,.5)', proj_l: 'rgba(38,166,153,.5)'};
function drawNovaPivots(pv, lo, hi) {
  for (const l of pv.lines) {
    if (Math.max(l.x1, l.x2) < lo - 1 || Math.min(l.x1, l.x2) > hi + 1) continue;
    g.strokeStyle = PIV_COL[l.col]; g.lineWidth = l.width; g.setLineDash(l.dash ? [5, 4] : []);
    g.beginPath(); g.moveTo(X(l.x1), Y(l.y1)); g.lineTo(X(l.x2), Y(l.y2)); g.stroke();
  }
  g.setLineDash([]);
}

/* ───────── Nova Nexus: Soporte y Resistencia ───────── */
const SR_COL = {sup: '#ff5252', res: '#089981'};
function drawNovaSRBoxes(sr, lo, hi) {
  g.lineWidth = 1;
  for (const b of sr.boxes) {
    if (b.right < lo - 1 || b.left > hi + 1) continue;
    const x1 = X(b.left), x2 = X(b.right), yT = Y(b.top), yB = Y(b.bot), h = Math.max(1, yB - yT);
    g.fillStyle = SR_COL[b.kind]; g.globalAlpha = Math.min(1, .1 * novaP('srOp') / 100); g.fillRect(x1, yT, x2 - x1, h); g.globalAlpha = 1;
    g.strokeStyle = SR_COL[b.kind]; g.setLineDash([1, 3]); g.strokeRect(x1, yT, x2 - x1, h); g.setLineDash([]);
  }
}
function drawNovaSRLabels(sr, lo, hi) { // Break / Potential Retest / Retest, con el ancla como en los estilos de label del Pine
  g.font = '9px system-ui'; g.textAlign = 'left';
  for (const l of sr.labels) {
    if (l.i < lo || l.i >= hi) continue;
    const col = SR_COL[l.side], x = X(l.i), y = Y(l.price), w = g.measureText(l.text).width + 8, hh = 14;
    // Break: a la izquierda del punto (soporte abajo, resistencia arriba) · Retest: a la derecha (resistencia abajo, soporte arriba)
    const left = l.kind === 'brk', below = l.kind === 'brk' ? l.side === 'sup' : l.side === 'res';
    const bx = left ? x - w : x, by = below ? y : y - hh;
    g.fillStyle = col; g.globalAlpha = .5; roundRect(bx, by, w, hh, 3); g.fill(); g.globalAlpha = 1;
    g.fillStyle = col; g.fillText(l.text, bx + 4, by + 10);
  }
}

/* ───────── Nova Nexus: SMC (estructura + Order Blocks) ───────── */
const SMC_COL = {up: '#089981', dn: '#f23645'};
function tIdx(t) { // tiempo (ms) → índice fraccionario de vela (extrapola con el paso de la última vela)
  const n = candles.length; if (!n || !Number.isFinite(t)) return NaN;
  if (t >= candles[n - 1].t) { const st = n > 1 ? candles[n - 1].t - candles[n - 2].t : 1; return n - 1 + (t - candles[n - 1].t) / st; }
  let a = 0, b = n - 1; while (a < b) { const m = (a + b) >> 1; if (candles[m].t < t) a = m + 1; else b = m; }
  return a;
}
function drawNovaOB(sm) {
  const xr = geo.w - geo.right, light = document.body.classList.contains('light');
  g.font = '9px system-ui';
  for (const side of ['bull', 'bear']) {
    const col = SMC_COL[side === 'bull' ? 'up' : 'dn'], arr = sm.obs[side], mt = sm.metrics[side];
    arr.forEach((ob, k) => {
      const x1 = Math.max(geo.left, X(tIdx(ob.loc))), yT = Y(ob.top), yB = Y(ob.btm), h = yB - yT, mid = (yT + yB) / 2;
      if (x1 >= xr || !Number.isFinite(x1)) return;
      g.globalAlpha = .10; g.fillStyle = col; g.fillRect(x1, yT, xr - x1, h);
      g.globalAlpha = .5; // actividad: compras (arriba) y ventas (abajo) proporcionales a las barras acumuladas
      const xb = Math.min(xr, Math.max(x1, X(tIdx(ob.xlocbl)))), xs = Math.min(xr, Math.max(x1, X(Number.isFinite(ob.xlocbr) ? tIdx(ob.xlocbr) : tIdx(ob.loc))));
      g.fillStyle = SMC_COL.up; g.fillRect(x1, yT, xb - x1, h / 2);
      g.fillStyle = SMC_COL.dn; g.fillRect(x1, mid, xs - x1, h / 2);
      g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([]); g.strokeRect(x1, yT, xr - x1, h);
      g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x1, mid); g.lineTo(xr, mid); g.stroke(); g.setLineDash([]);
      const txt = mt[k] + '%'; g.fillStyle = light ? '#222' : '#e8edf5'; g.textAlign = 'right'; g.fillText(txt, xr - 4, Math.max(yT + 10, mid - 3)); g.textAlign = 'left';
    });
  }
  g.globalAlpha = 1;
}
function drawNovaStruct(sm) {
  const xr = geo.w - geo.right; g.font = 'bold 9px system-ui'; g.textAlign = 'center';
  for (const side of ['bull', 'bear']) for (const l of sm[side]) {
    if (!l || !Number.isFinite(l.x1)) continue;
    const i1 = tIdx(l.x1), i2 = tIdx(l.x2); if (i2 < geo.start - 1 || i1 > geo.end + 1 || i2 - i1 < 0.01) continue;
    const xa = X(i1), xb = X(i2), y = Y(l.y), col = SMC_COL[l.col];
    g.strokeStyle = col; g.lineWidth = 1; g.setLineDash(l.style === 'solid' ? [] : l.style === 'dotted' ? [1, 3] : [5, 4]);
    g.beginPath(); g.moveTo(Math.max(geo.left, xa), y); g.lineTo(Math.min(xr, xb), y); g.stroke(); g.setLineDash([]);
    if (l.style === 'dashed') continue; // los niveles aún no rotos no llevan etiqueta
    const xm = Math.min(xr - 14, Math.max(geo.left + 14, (xa + xb) / 2)), up = l.col === 'up';
    g.fillStyle = col; g.textBaseline = 'alphabetic'; g.fillText(l.txt, xm, up ? y - 3 : y + 10);
  }
  g.textAlign = 'left';
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
  const txt = (novaP('rulesText') || NovaNexus.defaults.rulesText).split('\n'), x2 = geo.left + geo.plotW - 4, small = geo.w < 480, y0 = geo.plotTop + (small ? 58 : 44);
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
  g.font = 'bold 10px system-ui'; const w = g.measureText(txt).width + 14, x = geo.left + geo.plotW - w - 4, y = geo.plotTop + geo.plotH - 20;
  g.fillStyle = 'rgba(0,0,0,.6)'; roundRect(x, y, w, 17, 4); g.fill(); g.fillStyle = col; g.textAlign = 'left'; g.fillText(txt, x + 7, y + 12);
}
/* Herramientas de la fase 2: rayo, vertical, canal, flecha, texto, medición, extensión Fib, marcador, Long/Short */
function arrowHead(from, to, size = 9) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  g.beginPath(); g.moveTo(to.x, to.y); g.lineTo(to.x - size * Math.cos(ang - .45), to.y - size * Math.sin(ang - .45)); g.lineTo(to.x - size * Math.cos(ang + .45), to.y - size * Math.sin(ang + .45)); g.closePath(); g.fill();
}
function tag(txt, x, y, fill, align = 'left') { // etiqueta con fondo
  g.font = 'bold 10px system-ui'; const w = g.measureText(txt).width + 10; let x0 = align === 'right' ? x - w : x;
  const rx = geo.left + geo.plotW; x0 = Math.max(geo.left, Math.min(x0, rx - w)); // dentro del área del gráfico
  g.fillStyle = fill; roundRect(x0, y - 9, w, 17, 3); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(txt, x0 + 5, y + 3.5);
}
function drawShapeExtra(d, a, b, rightX, col) {
  const t = d.type; g.setLineDash([]); g.globalAlpha = 1; g.textAlign = 'left';
  if (t === 'vertical') { g.beginPath(); g.moveTo(a.x, geo.plotTop); g.lineTo(a.x, geo.h - geo.axisH); g.stroke(); }
  else if (t === 'ray') { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x + dx / L * 5000, a.y + dy / L * 5000); g.stroke(); }
  else if (t === 'arrow') { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.fillStyle = col; arrowHead(a, b, 11); }
  else if (t === 'text') { g.font = 'bold 12px system-ui'; g.fillStyle = col; g.fillText(d.text || '', a.x, a.y); }
  else if (t === 'marker') {
    const hi = markerKind(d) === 'high'; g.font = 'bold 11px system-ui'; g.fillStyle = col; g.textAlign = 'center';
    g.fillText(hi ? '▼' : '▲', a.x, hi ? a.y - 3 : a.y + 12); g.font = 'bold 10px system-ui'; g.fillText(fmt(d.a.p), a.x, hi ? a.y - 15 : a.y + 24); g.textAlign = 'left';
  }
  else if (t === 'channel') {
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    if (!d.c) return;
    const off = channelOff(d), a2 = px({t: d.a.t, p: d.a.p + off}), b2 = px({t: d.b.t, p: d.b.p + off});
    g.beginPath(); g.moveTo(a2.x, a2.y); g.lineTo(b2.x, b2.y); g.stroke();
    g.globalAlpha = .1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(b2.x, b2.y); g.lineTo(a2.x, a2.y); g.closePath(); g.fill(); g.globalAlpha = 1;
  }
  else if (t === 'measure') {
    const dp = d.b.p - d.a.p, up = dp >= 0, mc = up ? '#20bf9f' : '#f06b79', bars = Math.round(idxOfTime(d.b.t) - idxOfTime(d.a.t));
    const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    g.fillStyle = mc; g.strokeStyle = mc; g.globalAlpha = .12; g.fillRect(x1, y1, w, h); g.globalAlpha = 1; g.setLineDash([4, 3]); g.strokeRect(x1, y1, w, h); g.setLineDash([]);
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); arrowHead(a, b, 8);
    const l1 = `${dp >= 0 ? '+' : ''}${fmt(dp)} (${pct(dp / d.a.p * 100)})`, l2 = `${Math.abs(bars)} velas · ${fmtDur(d.b.t - d.a.t)}`;
    g.font = 'bold 10px system-ui'; const tw = Math.max(g.measureText(l1).width, g.measureText(l2).width) + 12, tx = clamp(x1 + w / 2 - tw / 2, geo.left, rightX - tw), ty = up ? Math.max(geo.plotTop + 2, y1 - 34) : Math.min(geo.plotTop + geo.plotH - 34, y1 + h + 4);
    g.fillStyle = mc; roundRect(tx, ty, tw, 30, 4); g.fill(); g.fillStyle = '#fff'; g.fillText(l1, tx + 6, ty + 12); g.fillText(l2, tx + 6, ty + 25);
  }
  else if (t === 'fibext') {
    g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    if (!d.c) { g.setLineDash([]); return; }
    const c = px(d.c); g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(c.x, c.y); g.stroke(); g.setLineDash([]);
    const x1 = Math.min(a.x, c.x); g.font = '10px system-ui';
    FIBEXT.forEach(lv => {
      const pr = d.c.p + (d.b.p - d.a.p) * lv, yy = Y(pr);
      g.globalAlpha = lv === 0 || lv === 1 ? 1 : .8; g.fillStyle = col; g.beginPath(); g.moveTo(x1, yy); g.lineTo(rightX, yy); g.stroke(); g.globalAlpha = 1;
      g.fillText(`${lv} (${fmt(pr)})`, Math.min(x1 + 4, rightX - 90), yy - 3);
    });
  }
  else if (t === 'long' || t === 'short') {
    const q = posBox(d), lg = t === 'long', gc = '#20bf9f', rc = '#f06b79', w = q.x2 - q.x1;
    g.globalAlpha = .16; g.fillStyle = gc; g.fillRect(q.x1, Math.min(q.yE, q.yT), w, Math.abs(q.yT - q.yE));
    g.fillStyle = rc; g.fillRect(q.x1, Math.min(q.yE, q.yS), w, Math.abs(q.yS - q.yE)); g.globalAlpha = 1;
    g.lineWidth = 1.2; g.strokeStyle = gc; g.strokeRect(q.x1, Math.min(q.yE, q.yT), w, Math.abs(q.yT - q.yE));
    g.strokeStyle = rc; g.strokeRect(q.x1, Math.min(q.yE, q.yS), w, Math.abs(q.yS - q.yE));
    g.strokeStyle = 'rgba(160,170,185,.9)'; g.beginPath(); g.moveTo(q.x1, q.yE); g.lineTo(q.x2, q.yE); g.stroke();
    const pc = v => pct((v - q.entry) / q.entry * 100);
    tag(`${lg ? 'Long' : 'Short'} · R:R 2.00`, q.x1, q.yE, '#5b6b83');
    tag(`Objetivo ${fmt(q.target)} (${pc(q.target)})`, q.x1, q.yT + (q.yT < q.yE ? -11 : 11), gc);
    tag(`Stop ${fmt(q.stop)} (${pc(q.stop)})`, q.x1, q.yS + (q.yS < q.yE ? -11 : 11), rc);
  }
}
function drawBrush(d, selected, col) {
  const P = d.pts.map(q => ({x: X(idxOfTime(q[0])), y: Y(q[1])})); if (P.length < 2) return;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([]);
  const trace = () => { g.beginPath(); g.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length - 1; i++) g.quadraticCurveTo(P[i].x, P[i].y, (P[i].x + P[i + 1].x) / 2, (P[i].y + P[i + 1].y) / 2); g.lineTo(P[P.length - 1].x, P[P.length - 1].y); };
  if (selected) { g.strokeStyle = '#fff'; g.globalAlpha = .35; g.lineWidth = d.w + 6; trace(); g.stroke(); g.globalAlpha = 1; }
  g.strokeStyle = d.col || col; g.lineWidth = d.w || 3; trace(); g.stroke(); g.restore();
}
function drawShape(d, selected, col, textCol) {
  if (d.type === 'brush') { drawBrush(d, selected, col); return; }
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
  drawShapeExtra(d, a, b, rightX, col);
  if (selected) for (const hnd of handlesOf(d)) { g.fillStyle = '#fff'; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(hnd.x, hnd.y, 7, 0, 7); g.fill(); g.stroke(); }
}

/* ───────── Gestos: pan, pellizco, retícula, dibujo ───────── */
const area = $('#chartArea'), ptrs = new Map();
let gest = null, pinch = null, lastTap = null, brushLive = null;
const local = e => { const r = $('#priceCanvas').getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
area.addEventListener('pointerdown', e => {
  if (e.target.closest('.chart-controls,.draw-hint,.leg-row')) return;
  try { area.setPointerCapture(e.pointerId); } catch {} ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (!geo) return;
  if (ptrs.size === 2) { startPinch(); return; }
  if (ptrs.size > 2) return;
  const pt = local(e);
  gest = {id: e.pointerId, x0: e.clientX, y0: e.clientY, pan0: pan, moved: false, mode: 'pending', start: null, handle: null, timer: 0};
  const onPriceAxis = pt.x >= geo.w - geo.right - 4 && pt.y <= geo.plotTop + geo.plotH + 8, onTimeAxis = pt.y >= geo.h - 34 && pt.x < geo.w - geo.right;
  if (onPriceAxis || onTimeAxis) { // arrastrar la barra derecha = escala de precio · barra inferior = escala de tiempo
    gest.mode = onPriceAxis ? 'scaleY' : 'scaleX'; gest.min0 = geo.min; gest.max0 = geo.max; gest.vis0 = visible; gest.pan1 = pan; cross = null;
  } else if (drawTool === 'brush' && (pt.y < geo.plotTop || pt.y > geo.plotTop + geo.plotH || pt.x < geo.left || pt.x > geo.left + geo.plotW)) { gest.mode = 'ignore'; toast('El pincel dibuja sobre el gráfico de precio'); }
  else if (drawTool === 'brush') { gest.mode = 'brush'; selectedId = null; brushLive = [[timeOfIdx(IDX(pt.x)), PRICE(pt.y)]]; gest.lx = pt.x; gest.ly = pt.y; updateDrawUI(); scheduleRender(); }
  else if (drawTool) gest.start = snapPoint(pt);
  else if (selectedId && gest.mode === 'pending') {
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
  if (gest.mode === 'ignore') return;
  if (gest.mode === 'brush') { // los eventos agrupados del navegador dan trazos más suaves en pantallas táctiles de alta frecuencia
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) { const q = local(ev); q.x = clamp(q.x, geo.left, geo.left + geo.plotW); q.y = clamp(q.y, geo.plotTop, geo.plotTop + geo.plotH); if (Math.hypot(q.x - gest.lx, q.y - gest.ly) < 2.5 || brushLive.length >= 1500) continue; gest.lx = q.x; gest.ly = q.y; brushLive.push([timeOfIdx(IDX(q.x)), PRICE(q.y)]); }
    scheduleRender(); return;
  }
  if (gest.mode === 'cross') { cross = pt; scheduleRender(); }
  else if (gest.mode === 'handle') {
    const arr = getDrawings(), d = arr.find(x => x.id === selectedId); if (!d) return;
    const s = snapPoint(pt);
    if (d.type === 'horizontal') d.a = {t: d.a.t, p: s.p}; else if (d.type === 'vertical') d.a = {t: s.t, p: d.a.p}; else d[gest.handle] = s;
    scheduleRender();
  }
  else if (gest.mode === 'scaleY') { // arriba = agrandar · abajo = achicar
    const f = clamp(Math.exp(-(e.clientY - gest.y0) / 160), .05, 25), c = (gest.min0 + gest.max0) / 2, half = (gest.max0 - gest.min0) / 2 / f;
    priceMan = {min: c - half, max: c + half}; updateAutoBtn(); scheduleRender();
  }
  else if (gest.mode === 'scaleX') { // derecha = más grande · izquierda = más chico
    const f = clamp(Math.exp((e.clientX - gest.x0) / 180), .1, 12); visible = clamp(gest.vis0 / f, 15, 400); scheduleRender();
  }
  else if (gest.mode === 'pan') {
    pan = gest.pan0 + (e.clientX - gest.x0) / geo.step;
    if (priceMan) { if (gest.pm0 == null) gest.pm0 = {min: priceMan.min, max: priceMan.max}; const dy = (e.clientY - gest.y0) / geo.plotH * (gest.pm0.max - gest.pm0.min); priceMan = {min: gest.pm0.min + dy, max: gest.pm0.max + dy}; } // con escala manual también se mueve en vertical
    scheduleRender();
  }
  else if (drawTool && gest.moved && !ONEPT.includes(drawTool)) { preview = pending2 ? {a: pending2.a, b: pending2.b, c: snapPoint(pt)} : {a: gest.start, b: snapPoint(pt)}; scheduleRender(); }
});
function endPointer(e, cancelled) {
  const had = ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; if (!ptrs.size) gest = null; return; }
  if (!had || !gest || e.pointerId !== gest.id) return;
  const gs = gest; gest = null; clearTimeout(gs.timer);
  if (gs.mode === 'ignore') return;
  if (gs.mode === 'brush') { const live = brushLive; brushLive = null; if (!cancelled) commitBrush(live); scheduleRender(); return; }
  if (cancelled) { cross = null; preview = null; scheduleRender(); return; }
  if (gs.mode === 'cross') { cross = null; scheduleRender(); return; }
  if (gs.mode === 'handle') { save(); render(); return; }
  if (gs.mode === 'scaleY' || gs.mode === 'scaleX') {
    if (!gs.moved) { const now = Date.now(); if (now - lastAxisTap < 320) { lastAxisTap = 0; if (gs.mode === 'scaleY') { priceMan = null; updateAutoBtn(); } else visible = defaultVisible(); render(); } else lastAxisTap = now; }
    return;
  }
  if (gs.mode === 'pan') return;
  if (!geo) return;
  const pt = local(e);
  if (drawTool) {
    if (pending2) { const {a, b} = pending2; pending2 = null; preview = null; commitDrawing(a, b, snapPoint(pt)); return; }
    if (ONEPT.includes(drawTool)) { commitDrawing(snapPoint(pt)); return; }
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
  if (gest) clearTimeout(gest.timer); gest = null; cross = null; preview = null; brushLive = null;
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
area.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !geo) return;
  if (ptrs.has(e.pointerId)) { if (cross && gest && gest.mode !== 'cross') { cross = null; scheduleRender(); } return; }
  cross = local(e); scheduleRender();
});
area.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptrs.size && cross) { cross = null; scheduleRender(); } });
area.addEventListener('wheel', e => { e.preventDefault(); visible = clamp(visible * (e.deltaY > 0 ? 1.12 : .89), 15, 400); scheduleRender(); }, {passive: false});
function fit() { visible = defaultVisible(); pan = 0; priceMan = null; updateAutoBtn(); render(); }
function updateAutoBtn() { const b = $('#autoScale'); if (b) b.hidden = !priceMan; }
$('#autoScale').onclick = () => { priceMan = null; updateAutoBtn(); render(); };
$('#zoomIn').onclick = () => { visible = clamp(visible / 1.3, 15, 400); render(); };
$('#zoomOut').onclick = () => { visible = clamp(visible * 1.3, 15, 400); render(); };
$('#fitChart').onclick = fit;
function syncFullscreenLabel() { $('#fullscreen').textContent = document.body.classList.contains('expanded') ? '⤓ Reducir' : '⛶ Expandir'; }
const setPaneScale = v => { paneScale = Math.max(.6, Math.min(3, Math.round(v * 100) / 100)); try { localStorage.setItem('cct_paneScale', String(paneScale)); } catch {} scheduleRender(); toast(`Altura de paneles ${Math.round(paneScale * 100)}%`); };
$('#paneBig').onclick = () => setPaneScale(paneScale * 1.2); $('#paneSmall').onclick = () => setPaneScale(paneScale / 1.2);
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
  closeSheet(); if (drawTool) { drawTool = ''; pending = null; pending2 = null; preview = null; updateDrawUI(); }
  document.body.classList.remove('expanded'); syncFullscreenLabel(); requestAnimationFrame(render);
});



/* ───────── Mis scripts (Pine): guardado local + cuenta ───────── */
const SCRIPTS_KEY = 'cct_scripts_v1', SCRIPTS_MAX = 600 * 1024;
const scriptsKey = () => uid ? `${SCRIPTS_KEY}_${uid}` : SCRIPTS_KEY;
const readScripts = () => { const o = readLocal(scriptsKey()); return Array.isArray(o.items) ? o.items : []; };
const catalogScripts = () => (window.CCTCatalog || []).map(c => ({id: 'cat:' + c.id, name: c.name, code: c.code, size: 0, lines: c.code.split('\n').length, addedAt: 0, builtin: true}));
const withCatalog = arr => catalogScripts().concat((Array.isArray(arr) ? arr : []).filter(x => x && !x.builtin && !String(x.id).startsWith('cat:')));
const userScripts = () => scripts.filter(x => !x.builtin);
let scripts = withCatalog(readScripts()), viewScriptId = null, scriptsRemote = '', scriptsTimer = 0;
const scriptsBytes = arr => arr.reduce((a, x) => a + (x.size || 0), 0);
function saveScripts() {
  try { localStorage.setItem(scriptsKey(), JSON.stringify({items: userScripts()})); } catch { toast('No se pudo guardar en este dispositivo (almacenamiento lleno)'); }
  pushScripts();
}
function pushScripts() {
  if (!uid || !db || !fbUser) return;
  clearTimeout(scriptsTimer);
  scriptsTimer = setTimeout(async () => {
    const str = JSON.stringify(userScripts()); if (str === scriptsRemote) return; scriptsRemote = str;
    try { await db.doc(`users/${uid}/data/scripts`).set({items: str, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); }
    catch { scriptsRemote = ''; toast('No se pudieron guardar los scripts en tu cuenta'); }
  }, 1200);
}
function addScript(code, fallbackName) {
  code = String(code || '').replace(/\r\n?/g, '\n');
  if (!code.trim()) { toast('El script está vacío'); return false; }
  const same = scripts.find(x => x.code === code); if (same) { toast('Ese script ya estaba guardado'); return same.id; }
  const size = new Blob([code]).size;
  if (scriptsBytes(scripts) + size > SCRIPTS_MAX) { toast('Se pasa del límite de 600 KB de scripts por cuenta'); return false; }
  const m = code.match(/indicator\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/) || code.match(/strategy\s*\(\s*(?:title\s*=\s*)?["']([^"']+)["']/);
  const sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  scripts.push({id: sid, name: (m ? m[1] : fallbackName || 'Script').slice(0, 80), code, size, lines: code.split('\n').length, addedAt: Date.now()});
  saveScripts(); renderScripts(); toast('Script guardado'); return sid;
}
function migrateCatalog() { // copias antiguas (pegadas a mano) de los scripts incluidos: pasan a la versión integrada, sin tocar sus ajustes
  const cat = scripts.filter(x => x.builtin); let changed = false;
  for (const p of state.pine.slice()) { const s = scripts.find(x => x.id === p.sid && !x.builtin), c = s && cat.find(x => x.code === s.code); if (!c) continue;
    if (state.pine.some(q => q.sid === c.id)) state.pine = state.pine.filter(q => q !== p); else p.sid = c.id; changed = true; }
  const dup = scripts.filter(x => !x.builtin && cat.some(c => c.code === x.code) && !state.pine.some(p => p.sid === x.id));
  if (dup.length) { scripts = scripts.filter(x => !dup.includes(x)); changed = true; }
  if (changed) { save(); saveScripts(); }
}
function renderScripts() {
  migrateCatalog();
  const mine = userScripts();
  $('#scriptList').innerHTML = mine.length ? mine.map(x => `<div class="setting-row script-row"><div><b>${esc(x.name)}</b><small>${x.lines} líneas · ${Math.max(1, Math.round(x.size / 1024))} KB · guardado</small></div><div class="script-btns"><button class="small-button" data-pine-add="${x.id}">Al gráfico</button><button class="small-button" data-view-script="${x.id}">Ver</button><button class="small-button danger" data-del-script="${x.id}" aria-label="Eliminar">✕</button></div></div>`).join('')
    : '<div class="setting-row"><div><b>Sin scripts guardados</b><small>Importa un archivo .pine o pega el código.</small></div></div>';
  renderIndicators(); pineKey = ''; schedulePine();
}
$('#scriptList').addEventListener('click', e => {
  const v = e.target.closest('[data-view-script]'), d = e.target.closest('[data-del-script]');
  if (v) { viewScriptId = v.dataset.viewScript; openSheet('script'); }
  if (d) { const x = scripts.find(y => y.id === d.dataset.delScript); if (x && confirm(`¿Eliminar "${x.name}"?`)) { scripts = scripts.filter(y => y.id !== x.id); state.pine = state.pine.filter(q => q.sid !== x.id); delete pineRes[x.id]; save(); saveScripts(); renderScripts(); scheduleRender(); } }
});
/* ───────── Nova Nexus: un solo indicador con todos sus módulos ───────── */
const NOVA_GROUPS = [
  ['Señales', ['nnIa', 'nnTp', 'nnRules']],
  ['Tendencia y bandas', ['nnEma', 'nnTrail', 'nnRev']],
  ['Estructura y niveles', ['nnSmc', 'nnOb', 'nnPiv', 'nnSR']],
  ['Liquidez y volumen', ['nnLiq', 'nnLiqBars', 'nnVP']]
], NOVA_DEFAULT = ['nnIa', 'nnEma', 'nnTp'];
const novaTitle = k => (indicatorMeta.find(m => m[0] === k) || [])[1].replace('Nova Nexus · ', '');
const novaDesc = k => (indicatorMeta.find(m => m[0] === k) || [])[2];
function novaPreviewSvg() {
  let c = '', tag = (x, y, t, f) => `<rect x="${x}" y="${y}" width="${t.length * 5.6 + 8}" height="12" rx="3" fill="${f}"/><text x="${x + 4}" y="${y + 9}" font-size="8" font-weight="700" fill="#fff">${t}</text>`;
  const cs = []; let v = 78; for (let i = 0; i < 26; i++) { const o = v, d = Math.sin(i / 3.1) * 5 - 1.2 + (i % 3) * .8, cl = o - d; v = cl; cs.push([o, cl, Math.max(o, cl) + 2 + (i % 4), Math.min(o, cl) - 2 - (i % 3)]); }
  const X = i => 14 + i * 9.6;
  const top = cs.map((k, i) => `${X(i)},${(k[0] + k[1]) / 2 + 9}`).join(' '), bot = cs.slice().reverse().map((k, i) => `${X(cs.length - 1 - i)},${(k[0] + k[1]) / 2 + 17}`).join(' ');
  c += `<polygon points="${top} ${bot}" fill="#8a97b3" opacity=".22"/>`;
  c += `<rect x="150" y="26" width="86" height="14" fill="#ff5252" opacity=".18"/><rect x="150" y="26" width="86" height="14" fill="none" stroke="#ff5252" stroke-width=".8" opacity=".6"/>`;
  c += `<rect x="40" y="84" width="70" height="12" fill="#26a69a" opacity=".18"/>`;
  [18, 50, 66].forEach((y, i) => c += `<line x1="14" x2="262" y1="${y}" y2="${y}" stroke="#22ab94" stroke-width=".9" opacity="${.55 - i * .12}"/>`);
  c += `<polyline points="${cs.map((k, i) => `${X(i)},${k[1] + 17}`).join(' ')}" fill="none" stroke="#119c7e" stroke-width="1.6"/>`;
  cs.forEach((k, i) => { const up = k[1] <= k[0], col = up ? '#20bf9f' : '#f06b79'; c += `<line x1="${X(i)}" x2="${X(i)}" y1="${k[2]}" y2="${k[3]}" stroke="${col}" stroke-width="1"/><rect x="${X(i) - 2.8}" y="${Math.min(k[0], k[1])}" width="5.6" height="${Math.max(1.5, Math.abs(k[0] - k[1]))}" fill="${col}"/>`; });
  c += tag(34, 100, 'BUY 4★', '#11cf77') + tag(150, 8, 'SELL 3★', '#d11645');
  c += `<line x1="196" x2="262" y1="92" y2="92" stroke="#ff4444" stroke-dasharray="3 2"/><line x1="196" x2="262" y1="60" y2="60" stroke="#11cf77" stroke-dasharray="3 2"/><line x1="196" x2="262" y1="48" y2="48" stroke="#00aaff" stroke-dasharray="3 2"/>`;
  [[12, 40], [22, 30], [32, 52], [42, 44], [52, 24], [62, 36], [72, 16]].forEach(([y, w], i) => c += `<rect x="${316 - w}" y="${y + 6}" width="${w}" height="7" fill="${i === 4 ? '#ffeb3b' : '#8294a8'}" opacity="${i === 4 ? .85 : .45}"/>`);
  return `<svg class="nova-prev" viewBox="0 0 320 120" role="img" aria-label="Vista previa de lo que dibuja Nova Nexus: velas, nube EMA, señales BUY/SELL, niveles TP/SL, soporte y resistencia, liquidaciones y perfil de volumen"><rect width="320" height="120" rx="10" fill="#0d1421"/>${c}</svg>`;
}
function novaCard() {
  const on = novaOn(), act = NN_KEYS.filter(k => state.indicators[k]).length;
  return `<div class="nova-card ${on ? 'on' : ''}">${novaPreviewSvg()}<div class="nova-body"><div><b>Nova Nexus</b><small>${on ? `${act} de ${NN_KEYS.length} módulos activos` : 'Apagado'} · señales IA, nube EMA, SMC, liquidaciones, perfil de volumen y más</small></div><div class="script-btns"><button class="small-button" data-nova-set="1">⚙ Configurar</button><button class="toggle ${on ? 'on' : ''}" data-nova-tog="1" aria-pressed="${on}" aria-label="Activar Nova Nexus"></button></div></div></div>`;
}
function novaToggleAll(on) {
  if (on) { const sv = state.novaSaved; for (const k of NN_KEYS) state.indicators[k] = sv ? !!sv[k] : NOVA_DEFAULT.includes(k); if (!novaOn()) NOVA_DEFAULT.forEach(k => state.indicators[k] = true); state.novaSaved = null; }
  else { state.novaSaved = Object.fromEntries(NN_KEYS.map(k => [k, !!state.indicators[k]])); for (const k of NN_KEYS) state.indicators[k] = false; }
}
function novaAfter() { save(); renderIndicators(); countIndicators(); if (candles.length) { calcNova(); calcExtra(); } if (['indicators', 'novaSet'].includes(sheetMode) && $('#sheet').classList.contains('open')) renderSheet(); scheduleRender(); }
function renderNovaSettings(list) {
  const on = novaOn(), row = k => { const dis = k === 'nnLiqBars' && !state.indicators.nnLiq; return `<div class="setting-row ${dis ? 'dim' : ''}"><div><b>${novaTitle(k)}</b><small>${novaDesc(k)}</small></div><button class="toggle ${state.indicators[k] ? 'on' : ''}" data-ind="${k}" aria-label="${novaTitle(k)}" aria-pressed="${!!state.indicators[k]}"></button></div>`; };
  list.innerHTML = `${novaPreviewSvg()}<div class="setting-row"><div><b>Nova Nexus</b><small>Un solo indicador: elige abajo qué módulos se dibujan. Los parámetros de cada módulo usan los valores por defecto del Pine.</small></div><button class="toggle ${on ? 'on' : ''}" data-nova-tog="1" aria-pressed="${on}" aria-label="Activar Nova Nexus"></button></div>`
    + `<div class="pine-actions"><button class="small-button" data-nova-all="1">Activar todos</button><button class="small-button" data-nova-all="0">Desactivar todos</button></div>`
    + NOVA_GROUPS.map(([t, ks]) => `<div class="pine-head"><b>${t}</b></div>${ks.map(row).join('')}`).join('');
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-nova-set],[data-nova-tog],[data-nova-all]'); if (!t) return;
  if (t.dataset.novaSet) { openNovaDialog(); return; }
  if (t.dataset.novaTog) { novaToggleAll(!novaOn()); novaAfter(); return; }
  if (t.dataset.novaAll !== undefined) { if (t.dataset.novaAll === '1') { for (const k of NN_KEYS) state.indicators[k] = k !== 'nnLiqBars'; } else for (const k of NN_KEYS) state.indicators[k] = false; state.novaSaved = null; novaAfter(); }
});
/* ───────── Scripts de Pine en el gráfico (intérprete propio: pine.js; dibujo: pine-draw.js) ───────── */
const activePine = () => state.pine.filter(p => p.on && scripts.some(s => s.id === p.sid));
const pineName = sid => { const s = scripts.find(x => x.id === sid); return s ? s.name : 'Script'; };
function pineInline(code, opts) {
  try { return window.CCTPine ? CCTPine.run(code, opts.cs || candles, opts) : {ok: false, error: {msg: 'El motor de Pine no está disponible', line: 0}}; }
  catch (e) { return {ok: false, error: {msg: String(e && e.message || e), line: 0}}; }
}
const pineWorkers = [], pineQueue = [], PINE_POOL = Math.max(2, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
function pineDispatch() {
  while (pineQueue.length) {
    let w = pineWorkers.find(x => !x.job);
    if (!w && pineWorkers.length < PINE_POOL) { w = {job: null, wk: null}; pineWorkers.push(w); }
    if (!w) return;
    const j = pineQueue.shift();
    try {
      if (!w.wk) {
        w.wk = new Worker('pine.js');
        w.wk.onmessage = e => { const cur = w.job; if (cur && cur.id === e.data.id) { clearTimeout(cur.t); w.job = null; cur.ok(e.data.result); pineDispatch(); } };
        w.wk.onerror = () => { pineNoWorker = true; try { w.wk.terminate(); } catch {} w.wk = null; const cur = w.job; w.job = null; if (cur) { clearTimeout(cur.t); cur.ok(pineInline(cur.code, cur.opts)); } pineDispatch(); };
      }
      j.id = ++pineSeq; w.job = j;
      j.t = setTimeout(() => { try { w.wk.terminate(); } catch {} w.wk = null; w.job = null; j.ok({ok: false, error: {msg: 'El script tardó demasiado y se detuvo (límite de tiempo en este dispositivo)', line: 0}}); pineDispatch(); }, 45000);
      const o2 = Object.assign({}, j.opts); delete o2.cs; w.wk.postMessage({id: j.id, code: j.code, candles: j.opts.cs || candles, opts: o2});
    } catch { pineNoWorker = true; w.job = null; j.ok(pineInline(j.code, j.opts)); }
  }
}
function pineRunRaw(code, opts) { // Workers aislados (un grupo pequeño: un script pesado no bloquea a los demás), con tiempo límite por script
  if (typeof Worker === 'undefined' || pineNoWorker) return Promise.resolve(pineInline(code, opts));
  return new Promise(ok => { pineQueue.push({code, opts, ok}); pineDispatch(); });
}
// request.security: la app descarga las velas de Binance que pide el script y repite la corrida una vez
const pineSecCache = new Map();
async function pineSecCandles(sym, itv) {
  const key = sym + '|' + itv, hit = pineSecCache.get(key); if (hit && Date.now() - hit.at < 30000) return hit.data;
  let data = [];
  try {
    const agg = itv === '3M' ? 'q' : itv === '12M' ? 'y' : null, raw = await getJSON(`${API}/klines?symbol=${sym}&interval=${agg ? '1M' : itv}&limit=1000`);
    let cs = raw.map(d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]}));
    if (agg) { const out = [], bucket = t => { const d = new Date(t); return agg === 'y' ? d.getUTCFullYear() : d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3); }; for (const c of cs) { const b = bucket(c.t), last = out[out.length - 1]; if (last && last.b === b) { last.h = Math.max(last.h, c.h); last.l = Math.min(last.l, c.l); last.c = c.c; last.v += c.v; } else out.push({b, t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v}); } cs = out.map(({b, ...r}) => r); }
    data = cs;
  } catch {}
  pineSecCache.set(key, {at: Date.now(), data}); return data;
}
async function pineRunFull(code, opts) {
  let res = await pineRunRaw(code, opts);
  if (res && res.ok && res.needs && res.needs.length) {
    const sec = Object.assign({}, opts.sec);
    const need = res.needs.slice(0, 40);
    for (let i = 0; i < need.length; i += 8) await Promise.all(need.slice(i, i + 8).map(async n => { sec[n.symbol + '|' + n.interval] = await pineSecCandles(n.symbol, n.interval); }));
    res = await pineRunRaw(code, Object.assign({}, opts, {sec, timeLimitMs: need.length > 6 ? 26000 : opts.timeLimitMs}));
  }
  return res;
}
async function pineRunOne(p) {
  if (pineBusy[p.sid]) { pineDirty[p.sid] = true; return; }
  const code = (scripts.find(x => x.id === p.sid) || {}).code; if (!code || !candles.length) return;
  const key = `${state.symbol}|${state.interval}|${candles[0].t}`; pineBusy[p.sid] = true;
  const res = await pineRunFull(code, {inputs: p.inputs, interval: state.interval, symbol: state.symbol, name: pineName(p.sid), timeLimitMs: 12000});
  pineBusy[p.sid] = false; res._key = key; pineRes[p.sid] = res;
  if (!res.ok && /tard/.test((res.error && res.error.msg) || '') && !pineRetried.has(p.sid)) { pineRetried.add(p.sid); setTimeout(() => { pineKey = ''; schedulePine(); }, 3000); } else if (res.ok) pineRetried.delete(p.sid); if (res.stats) pineLastMs = Math.max(pineLastMs * .5, res.stats.ms); // los scripts pesados se recalculan con menos frecuencia
  if (pineDirty[p.sid]) { pineDirty[p.sid] = false; pineKey = ''; schedulePine(); }
  if ((sheetMode === 'indicators' && $('#sheet').classList.contains('open'))) { renderIndicators(); if (sheetMode === 'indicators') $('#sheetList').innerHTML = indicatorRows(); }
  scheduleRender();
}
// Estilo y visibilidad elegidos en la ventana de configuración (no obligan a recalcular el script)
function pineVisibleOn(p, iv) {
  const v = p.vis; if (!v) return true; const m = /^(\d+)([mhdwM])$/.exec(iv); if (!m) return true;
  const o = v[m[2]]; if (!o) return true; if (o.on === false) return false;
  const n = +m[1]; return !((o.min != null && n < o.min) || (o.max != null && n > o.max));
}
function pineStyled(res, p) {
  if (!res || !res.ok || !p.style || !Object.keys(p.style).length) return res;
  const sig = JSON.stringify(p.style); if (res._stSig === sig) return res._st;
  const st = p.style, pal = res.palette.slice(), idxOf = c => { const k = CCTSettings.hexOf(c.color), a = ((c.op != null ? c.op : k.op) / 100).toFixed(3), col = `rgba(${parseInt(k.hex.slice(1, 3), 16)},${parseInt(k.hex.slice(3, 5), 16)},${parseInt(k.hex.slice(5, 7), 16)},${a})`; let i = pal.indexOf(col); if (i < 0) { pal.push(col); i = pal.length - 1; } return i; };
  const out = Object.assign({}, res, {palette: pal});
  out.plots = res.plots.map((pl, i) => { const o = (st.plots || {})[pl.id !== undefined ? pl.id : i]; if (!o) return pl; const q = Object.assign({}, pl); if (o.on === false) q.hidden = true; if (o.lw) q.lw = o.lw; if (o.type) q.style = o.type; if (o.dash) q.dash = o.dash; if (o.color) { const ci = idxOf(o); if (pl.cc !== undefined) q.cc = ci; else q.ci = pl.ci.map(x => x === null ? null : ci); } return q; });
  out.hlines = res.hlines.map((h, i) => { const o = (st.hlines || {})[i]; if (!o) return h; const q = Object.assign({}, h); if (o.on === false) q.hidden = true; if (o.lw) q.lw = o.lw; if (o.dash) q.style = o.dash; if (o.color) q.ci = idxOf(o); return q; });
  out.candles = (res.candles || []).map((k, i) => { const o = (st.plots || {})['c' + i]; return o && o.on === false ? Object.assign({}, k, {hidden: true}) : k; });
  for (const k of ['labels', 'lines', 'boxes', 'tables', 'polylines', 'linefills', 'bgcolors', 'barcolors']) if (st.objs && st.objs[k] && st.objs[k].on === false) out[k] = [];
  if (st.shapes) out.shapes = res.shapes.map((s2, i) => { const o = st.shapes[i]; if (!o) return s2; if (o.on === false) return null; const q = Object.assign({}, s2); if (o.size) q.size = o.size; if (o.color || o.tcolor) { const ci = o.color ? idxOf(o) : null, ti = o.tcolor ? idxOf({color: o.tcolor, op: 100}) : null; q.pts = s2.pts.map(pt => { const r = pt.slice(); if (ci !== null) r[2] = ci; if (ti !== null && r.length > 3) r[3] = ti; return r; }); } return q; }).filter(Boolean);
  out.fills = res.fills.map((f, i) => { const o = (st.fills || {})[i]; if (!o) return f; const q = Object.assign({}, f); if (o.on === false) q.hidden = true; if (o.color) { delete q.ci; q.cc = idxOf(o); } return q; });
  const G = st.general && st.general.g; if (G) { if (typeof G.prec === 'number') out._prec = G.prec; if (G.vals === false) out._noVals = true; } res._stSig = sig; res._st = out; return out;
}
function pineDialogData(p, r) {
  const colorOf = ci => ci === null || ci === undefined || ci < 0 ? null : r.palette[ci];
  const toHex = c => { const m = /rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?/.exec(c || ''); return m ? '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('') + (m[4] !== undefined && +m[4] < 1 ? Math.round(+m[4] * 255).toString(16).padStart(2, '0') : '') : '#2962ff'; };
  const plots = r.plots.map((pl, i) => { const u = pl.cc !== undefined ? [pl.cc] : [...new Set((pl.ci || []).filter(x => x !== null))]; return {key: pl.id !== undefined ? pl.id : i, title: pl.title, color: toHex(colorOf(u[0])), dynamic: u.length > 1, lw: pl.lw || 2, canWidth: true, type: /^(line|stepline|histogram|columns|area|areabr|circles|cross|linebr|steplinebr|stepline_diamond)$/.test(pl.style) ? pl.style : 'line', dash: 'solid'}; })
    .concat((r.candles || []).map((k, i) => ({key: 'c' + i, title: k.title, color: toHex(colorOf(k.ci.find(x => x !== null && x !== undefined))), dynamic: true, lw: 1, canWidth: false})));
  const objects = [['labels', 'Etiquetas'], ['lines', 'Líneas'], ['boxes', 'Cajas'], ['polylines', 'Polilíneas'], ['linefills', 'Rellenos entre líneas'], ['tables', 'Tablas'], ['bgcolors', 'Fondo coloreado (bgcolor)'], ['barcolors', 'Velas coloreadas (barcolor)']].map(([key, label]) => ({key, label, count: key === 'bgcolors' || key === 'barcolors' ? (r[key] || []).filter(e => e.pts && e.pts.length).length : (r[key] || []).length}));
  return {title: pineName(p.sid), inputs: r.inputs, values: p.inputs || {}, plots, hlines: r.hlines.map((h, i) => ({key: i, title: h.title, price: h.price, color: toHex(colorOf(h.ci)), lw: h.lw || 1, dash: h.style || 'dashed'})), fills: r.fills.map((f, i) => ({key: i, title: 'Relleno ' + (i + 1), color: toHex(colorOf(f.cc !== undefined ? f.cc : (f.ci || []).find(x => x !== null && x !== undefined))), dynamic: f.cc === undefined})), objects, shapes: r.shapes.map((s2, i) => ({key: i, title: s2.title, kind: s2.kind, color: toHex(colorOf((s2.pts[0] || [])[2])), tcolor: toHex(colorOf((s2.pts[0] || [])[3])), size: s2.size || 'auto'})), style: p.style || {}, vis: p.vis || {}};
}
function openPineDialog(sid) {
  const p = state.pine.find(x => x.sid === sid), r = pineRes[sid];
  if (!p) return; if (!r || !r.ok) { toast(r ? 'Error del script: ' + ((r.error && r.error.msg) || 'desconocido') + (r.error && r.error.line ? ' (línea ' + r.error.line + ')' : '') : 'Espera a que termine de calcularse'); return; }
  CCTSettings.open(Object.assign(pineDialogData(p, r), {onApply: res => {
    const inChanged = JSON.stringify(res.inputs) !== JSON.stringify(p.inputs || {});
    p.inputs = res.inputs; p.style = res.style; p.vis = res.vis; if (!Object.keys(p.style).length) delete p.style; if (!Object.keys(p.vis).length) delete p.vis;
    save(); if (inChanged) { pineKey = ''; schedulePine(); } renderIndicators(); scheduleRender(); toast('Configuración aplicada');
  }}));
}
const pineRetried = new Set();
function schedulePine() {
  if (!candles.length || !activePine().length) return;
  const key = `${state.symbol}|${state.interval}|${candles[0].t}|${candles.length}`, wait = key !== pineKey ? 0 : Math.max(0, Math.max(1500, 6 * pineLastMs) - (Date.now() - pineLast));
  clearTimeout(pineTimer);
  pineTimer = setTimeout(() => { pineKey = key; pineLast = Date.now(); activePine().forEach(pineRunOne); }, wait);
}

/* ───────── Catálogo: indicadores Pine listos para añadir ───────── */
const CAT_SYMS = 'BTC ETH BNB SOL XRP DOGE ADA AVAX LINK DOT TRX LTC BCH ATOM UNI NEAR APT ARB OP FIL INJ SUI SEI TIA RUNE AAVE MKR ALGO XLM HBAR ETC SAND MANA GALA IMX PEPE SHIB WLD FET RNDR'.split(' ').map(x => 'BINANCE:' + x + 'USDT');
function catPreviewSvg(id) {
  if (id === 'nova-nexus') return novaPreviewSvg();
  const bg = '<rect width="300" height="130" fill="#0b0e14"/>';
  if (id === 'nova-osc') {
    let a = '', b = '', f = ''; const n = 40, X = i => 8 + i * 7.1;
    const flux = i => 65 - Math.sin(i / 4.2) * 30 - Math.cos(i / 9) * 10, mom = i => 65 - Math.sin((i - 3) / 4.2) * 24 - Math.cos(i / 9) * 8;
    for (let i = 0; i < n; i++) { a += `${i ? 'L' : 'M'}${X(i).toFixed(1)},${flux(i).toFixed(1)}`; b += `${i ? 'L' : 'M'}${X(i).toFixed(1)},${mom(i).toFixed(1)}`; }
    f = `${a}L${X(n - 1)},65L${X(0)},65Z`;
    return `<svg class="nova-prev" viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg">${bg}<line x1="0" x2="300" y1="30" y2="30" stroke="#444" stroke-dasharray="3 3"/><line x1="0" x2="300" y1="100" y2="100" stroke="#444" stroke-dasharray="3 3"/><line x1="0" x2="300" y1="65" y2="65" stroke="#333"/><path d="${f}" fill="rgba(0,230,118,.22)"/><path d="${a}" fill="none" stroke="#00e676" stroke-width="1.6"/><path d="${b}" fill="none" stroke="#ff9800" stroke-width="1.2"/><circle cx="${X(10)}" cy="${flux(10)}" r="3" fill="#ff2d55"/><circle cx="${X(29)}" cy="${flux(29)}" r="3" fill="#00e676"/><rect x="0" y="120" width="300" height="10" fill="#1c1c3d"/><rect x="${X(20)}" y="120" width="60" height="10" fill="#00e676" opacity=".7"/><text x="8" y="12" font-size="9" fill="#a5a5ff" font-weight="700">Nova Oscillator · Flux + Momentum</text></svg>`;
  }
  let rows = ''; const names = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA'], sg = [1, 0, -1, 2, 0, -2, 1];
  names.forEach((nm, i) => { const y = 26 + i * 14, c = sg[i] > 0 ? '#00e676' : sg[i] < 0 ? '#ff2d55' : '#40405c', t = sg[i] > 0 ? 'LONG' : sg[i] < 0 ? 'SHORT' : '—'; rows += `<rect x="40" y="${y - 10}" width="220" height="13" fill="${i % 2 ? '#0c0c16' : '#13131f'}"/><text x="48" y="${y}" font-size="9" fill="#eaeaff" font-weight="700">${nm}</text><text x="130" y="${y}" font-size="9" fill="${c}" font-weight="700">${t}</text><text x="200" y="${y}" font-size="9" fill="#b366ff">${sg[i] ? Math.abs(sg[i]) + 2 + '/5' : ''}</text>`; });
  return `<svg class="nova-prev" viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg">${bg}<rect x="39" y="5" width="222" height="120" fill="none" stroke="#8a6bff"/><rect x="40" y="6" width="220" height="13" fill="#1c1c3d"/><text x="48" y="16" font-size="9" fill="#a5a5ff" font-weight="700">SÍMBOLO</text><text x="130" y="16" font-size="9" fill="#a5a5ff" font-weight="700">SEÑAL</text><text x="200" y="16" font-size="9" fill="#a5a5ff" font-weight="700">SCORE</text>${rows}</svg>`;
}
const catPineOf = c => state.pine.find(p => p.sid === 'cat:' + c.id);
function catalogCards() {
  return (window.CCTCatalog || []).map(c => {
    const p = catPineOf(c);
    return `<div class="nova-card ${p && p.on ? 'on' : ''}">${catPreviewSvg(c.id)}<div class="nova-body"><div><b>${esc(c.name)}</b><small>${esc(c.desc)}</small>${p ? (pineRes[p.sid] ? (pineRes[p.sid].ok ? '' : `<small class="pine-err">Error${pineRes[p.sid].error.line ? ' · línea ' + pineRes[p.sid].error.line : ''}: ${esc(pineRes[p.sid].error.msg)}</small><button class="small-button" data-pine-retry="${p.sid}">↻ Reintentar</button>`) : '<small>Calculando…</small>') : ''}</div><div class="script-btns">${p ? `<button class="small-button" data-pine-set="${p.sid}">⚙ Configurar</button><button class="toggle ${p.on ? 'on' : ''}" data-pine-tog="${p.sid}" aria-pressed="${!!p.on}" aria-label="Activar ${esc(c.name)}"></button>` : `<button class="small-button" data-cat-add="${c.id}">＋ Añadir</button>`}</div></div></div>`;
  }).join('');
}
document.addEventListener('click', e => { const b = e.target.closest('[data-std-set]'); if (b) openStdDialog(b.dataset.stdSet); const r = e.target.closest('[data-pine-retry]'); if (r) { delete pineRes[r.dataset.pineRetry]; pineKey = ''; schedulePine(); renderIndicators(); if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) $('#sheetList').innerHTML = indicatorRows(); } });
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-cat-add]'); if (!b) return;
  const c = (window.CCTCatalog || []).find(x => x.id === b.dataset.catAdd); if (!c) return;
  if (activePine().length >= PINE_MAX) { toast(`Máximo ${PINE_MAX} scripts activos`); return; }
  const sid = 'cat:' + c.id;
  const inputs = {};
  if (c.id === 'nova-scr') { const r = await pineRunRaw(c.code, {interval: state.interval, symbol: state.symbol, timeLimitMs: 12000}); if (r && r.ok) r.inputs.filter(i => i.type === 'symbol').forEach((i, k) => { inputs[i.key] = CAT_SYMS[k] || ''; }); }
  if (!state.pine.some(p => p.sid === sid)) state.pine.push({sid, on: true, inputs});
  save(); renderIndicators(); countIndicators(); pineKey = ''; schedulePine(); toast(c.id === 'nova-scr' ? 'Añadido: calcula 40 símbolos, puede tardar unos segundos' : 'Añadido al gráfico');
  if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) $('#sheetList').innerHTML = indicatorRows();
});

function pineSection() {
  const rows = state.pine.map(p => {
    const s = scripts.find(x => x.id === p.sid); if (!s) return ''; if ((window.CCTCatalog || []).some(c => c.code === s.code)) return ''; const r = pineRes[p.sid]; let st;
    if (!p.on) st = 'Apagado'; else if (!r) st = 'Calculando…';
    else if (!r.ok) st = `<span class="pine-err">Error${r.error.line ? ' · línea ' + r.error.line : ''}: ${esc(r.error.msg)}</span>`;
    else { const u = r.warnings.filter(w => w.level === 'unsupported').length; st = `${r.plots.length} plot${r.plots.length === 1 ? '' : 's'} · ` + (u ? `<span class="pine-warn">⚠ ${u} aviso${u > 1 ? 's' : ''} de no soportado</span>` : r.warnings.length ? `${r.warnings.length} aviso${r.warnings.length > 1 ? 's' : ''}` : 'sin avisos') + (r.meta.overlay ? '' : ' · panel propio') + (r.strategy ? ` · <b class="${r.strategy.stats.net >= 0 ? 'positive' : 'negative'}">Estrategia ${r.strategy.stats.net >= 0 ? '+' : ''}${r.strategy.stats.netPct.toFixed(2)}% · ${r.strategy.tradesTotal} ops</b>` : ''); }
    return `<div class="setting-row pine-row"><div><b>${esc(s.name)}</b><small>${st}</small>${r && r.ok ? `<select class="pane-sel" data-pine-pane="${p.sid}" aria-label="Panel"><option value="" ${!p.pane ? 'selected' : ''}>Panel: automático (${r.meta.overlay ? 'sobre el gráfico' : 'abajo'})</option><option value="main" ${p.pane === 'main' ? 'selected' : ''}>Panel: sobre el gráfico</option><option value="top" ${p.pane === 'top' ? 'selected' : ''}>Panel: arriba (propio)</option><option value="bottom" ${p.pane === 'bottom' ? 'selected' : ''}>Panel: abajo (propio)</option></select>` : ''}</div><div class="script-btns">${r && r.ok && r.strategy ? `<button class="small-button" data-pine-rep="${p.sid}" aria-label="Informe">📊</button>` : ''}<button class="small-button" data-pine-set="${p.sid}" aria-label="Ajustes">⚙</button><button class="small-button danger" data-pine-del="${p.sid}" aria-label="Quitar">✕</button><button class="toggle ${p.on ? 'on' : ''}" data-pine-tog="${p.sid}" aria-pressed="${p.on}" aria-label="Activar"></button></div></div>`;
  }).join('');
  return `<div class="pine-head"><b>Scripts de Pine</b><small>Pega código de TradingView: se interpreta aquí y se dibuja en el gráfico</small></div>${rows}<div class="setting-row"><button class="primary" data-pine-new="1">＋ Pegar / convertir Pine</button></div>`;
}

/* ───────── Informe de estrategia (backtest) ───────── */
async function fetchKlinesPaged(sym, itv, count) { // hasta 10 000 velas, de 1000 en 1000 hacia atrás
  let out = [], end = null; count = Math.min(10000, count);
  while (out.length < count) {
    const raw = await getJSON(`${API}/klines?symbol=${sym}&interval=${itv}&limit=1000${end ? '&endTime=' + end : ''}`);
    if (!raw.length) break; out = raw.map(d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5]})).concat(out); end = raw[0][0] - 1; if (raw.length < 1000) break;
  }
  return out.slice(-count);
}
function downloadText(name, text, mime = 'text/csv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: mime + ';charset=utf-8'})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function openStrategyReport(sid) {
  const r0 = pineRes[sid]; if (!r0 || !r0.ok || !r0.strategy) { toast('Esta estrategia aún no tiene resultados'); return; }
  let S = r0.strategy, rc = candles, rsym = state.symbol, ritv = state.interval, nBars = candles.length, busy = false;
  const money = v => v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', {maximumFractionDigits: 2}), pc = v => v == null || !Number.isFinite(v) ? '—' : v.toFixed(2) + '%', cls = v => v > 0 ? 'positive' : v < 0 ? 'negative' : '';
  const card = (l, v, c) => `<div class="rep-card"><small>${l}</small><b class="${c || ''}">${v}</b></div>`;
  const el = document.createElement('div'); el.className = 'cfg-overlay';
  el.innerHTML = `<div class="cfg-dlg" role="dialog" aria-modal="true" aria-label="Informe de estrategia"><div class="cfg-head"><strong>${esc(S.title || pineName(sid))}</strong><button class="cfg-x" aria-label="Cerrar">✕</button></div>
    <div class="rep-ctl"><select id="rpSym" aria-label="Activo">${[...new Set([state.symbol, ...state.symbols])].map(s => `<option value="${s}" ${s === rsym ? 'selected' : ''}>${esc(base(s))}</option>`).join('')}</select><select id="rpTf" aria-label="Temporalidad">${INTERVALS.map(t => `<option ${t === ritv ? 'selected' : ''}>${t}</option>`).join('')}</select><select id="rpN" aria-label="Historial">${[500, 1000, 3000, 5000, 10000].map(n => `<option value="${n}" ${n === 1000 ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="small-button" id="rpGo">Recalcular</button></div>
    <div class="cfg-tabs"><button data-rt="sum" class="on">Resumen</button><button data-rt="tr">Operaciones</button><button data-rt="par">Supuestos</button></div>
    <div class="cfg-body" id="repBody"></div><div class="cfg-foot"><button class="cfg-btn" data-act="csvT">⬇ Operaciones</button><button class="cfg-btn" data-act="csvE">⬇ Capital</button><span class="cfg-sp"></span><button class="cfg-btn cfg-ok" data-act="cancel">Cerrar</button></div></div>`;
  document.body.appendChild(el);
  const body = el.querySelector('#repBody'); let tab = 'sum';
  const drawEq = cv => {
    const eq = S.equity, n = eq.length, st = S.stats, w = cv.clientWidth || 320, h = 150, dpr = window.devicePixelRatio || 1; cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const vals = eq.filter(v => v != null); if (vals.length < 2) return; let mn = Math.min(...vals, st.init), mx = Math.max(...vals, st.init); if (mx === mn) { mx += 1; mn -= 1; }
    const X = i => 4 + i / (n - 1) * (w - 8), Y = v => h - 8 - (v - mn) / (mx - mn) * (h - 16), css = getComputedStyle(document.body);
    g.strokeStyle = css.getPropertyValue('--line') || '#263244'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(0, Y(st.init)); g.lineTo(w, Y(st.init)); g.stroke(); g.setLineDash([]);
    g.strokeStyle = vals[vals.length - 1] >= st.init ? '#26a69a' : '#ef5350'; g.lineWidth = 2; g.beginPath(); let started = false; eq.forEach((v, i) => { if (v == null) return; if (!started) { g.moveTo(X(i), Y(v)); started = true; } else g.lineTo(X(i), Y(v)); }); g.stroke();
  };
  const show = () => {
    const st = S.stats, cur = S.currency || 'USDT'; el.querySelectorAll('.cfg-tabs button').forEach(b => b.classList.toggle('on', b.dataset.rt === tab));
    const span = rc.length ? `${new Date(rc[0].t).toLocaleDateString()} → ${new Date(rc[rc.length - 1].t).toLocaleDateString()} · ${rc.length} velas · ${base(rsym)} ${ritv}` : '';
    if (tab === 'sum') {
      body.innerHTML = `<p class="cfg-note">${span}</p><canvas id="repEq" style="width:100%;height:150px;display:block;margin-bottom:12px"></canvas><div class="rep-grid">`
        + card('Beneficio neto', `${money(st.net)} ${cur}<br><small>${pc(st.netPct)}</small>`, cls(st.net)) + card('Capital final', money(st.equity), cls(st.equity - st.init)) + card('Operaciones cerradas', st.trades) + card('% ganadoras', st.winRate == null ? '—' : pc(st.winRate))
        + card('Factor de beneficio', st.profitFactor == null ? '—' : st.profitFactor === Infinity ? '∞' : st.profitFactor.toFixed(2)) + card('Reducción máx. (drawdown)', `${money(st.maxDD)}<br><small>${pc(st.maxDDpct)}</small>`, 'negative')
        + card('Ganancia media', money(st.avgWin), 'positive') + card('Pérdida media', money(st.avgLoss), 'negative') + card('Mayor ganancia', money(st.largestWin), 'positive') + card('Mayor pérdida', money(st.largestLoss), 'negative')
        + card('Largos / Cortos', `${st.longs} / ${st.shorts}`) + card('Comisiones', money(st.commission)) + card('Abiertas ahora', `${st.openTrades}<br><small>${money(st.openProfit)}</small>`, cls(st.openProfit)) + card('Comprar y mantener', pc(st.buyHoldPct), cls(st.buyHoldPct)) + `</div>`;
      drawEq(body.querySelector('#repEq'));
    } else if (tab === 'tr') {
      const rows = S.open.map(t => [...t, 1]).concat([...S.trades].reverse().map(t => [...t, 0])).slice(0, 300);
      const dt = i => { const c = rc[i]; return c ? new Date(c.t).toLocaleDateString() : ''; };
      body.innerHTML = rows.length ? `<p class="cfg-note">Mostrando ${rows.length} de ${S.tradesTotal + S.open.length} (más recientes primero). Descarga el CSV para ver todas.</p><div class="rep-tbl"><table><thead><tr><th>#</th><th>Lado</th><th>Entrada</th><th>Salida</th><th>Cant.</th><th>Resultado</th></tr></thead><tbody>${rows.map(t => `<tr><td>${esc(t[0])}</td><td>${t[1] === 1 ? 'Largo' : 'Corto'}</td><td>${fmt(t[3])}<small>${dt(t[4])}</small></td><td>${t[9] ? '<i>abierta</i>' : fmt(t[5]) + `<small>${dt(t[6])} · ${esc(t[8])}</small>`}</td><td>${(+t[2].toFixed(6))}</td><td class="${cls(t[7])}">${money(t[7])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="cfg-empty">La estrategia no hizo operaciones en estas velas.</p>';
    } else {
      const P = S.params, qt = {fixed: 'contratos fijos', cash: 'efectivo fijo', percent_of_equity: '% del capital'}[P.qtyType];
      body.innerHTML = `<div class="rep-note"><p><b>Capital inicial:</b> ${money(st.init)} ${cur} · <b>Tamaño:</b> ${P.qtyVal} (${qt}) · <b>Pyramiding:</b> ${P.pyramiding} · <b>Comisión:</b> ${P.commVal} (${P.commType}) · <b>Deslizamiento:</b> ${P.slippage} ticks · <b>Ejecución:</b> ${P.onClose ? 'al cierre de la vela' : 'en la apertura de la vela siguiente'}</p>
      <p>Cómo se simula: las órdenes de mercado se ejecutan en la apertura de la vela siguiente (nunca con datos futuros); límites y stops dentro de la vela siguiendo la ruta O→H→L→C (o O→L→H→C si el mínimo está más cerca de la apertura); trailing stop aproximado. No se simulan margen, liquidaciones, calc_on_every_tick ni datos intravela. Los resultados son reproducibles: mismo script, mismos datos y mismos ajustes dan el mismo informe. Es un backtest histórico: <b>no garantiza resultados futuros ni coincide exactamente con TradingView</b>. Solo análisis; no se ejecutan órdenes reales.</p></div>`;
    }
  };
  const csvEsc = v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const iso = i => rc[i] ? new Date(rc[i].t).toISOString() : '';
  el.addEventListener('click', async e => {
    if (e.target === el || e.target.closest('.cfg-x') || e.target.closest('[data-act=cancel]')) { el.remove(); return; }
    const b = e.target.closest('[data-rt]'); if (b) { tab = b.dataset.rt; show(); return; }
    const nm = `${base(rsym)}_${ritv}_${(pineName(sid) || 'estrategia').replace(/[^\w-]+/g, '_')}`;
    if (e.target.closest('[data-act=csvT]')) {
      const head = ['n', 'entrada_id', 'lado', 'cantidad', 'entrada_fecha_utc', 'entrada_precio', 'salida_fecha_utc', 'salida_precio', 'resultado', 'salida_motivo'];
      const rows = S.trades.map((t, i) => [S.tradesTotal - S.trades.length + i + 1, t[0], t[1] === 1 ? 'largo' : 'corto', t[2], iso(t[4]), t[3], iso(t[6]), t[5], t[7], t[8]]).concat(S.open.map(t => ['', t[0], t[1] === 1 ? 'largo' : 'corto', t[2], iso(t[4]), t[3], '', '', t[7], 'abierta']));
      downloadText(nm + '_operaciones.csv', [head, ...rows].map(r => r.map(csvEsc).join(',')).join('\n')); return;
    }
    if (e.target.closest('[data-act=csvE]')) { downloadText(nm + '_capital.csv', ['fecha_utc,capital', ...S.equity.map((v, i) => v == null ? null : `${iso(i)},${v}`).filter(Boolean)].join('\n')); return; }
    if (e.target.closest('#rpGo')) {
      if (busy) return; busy = true; const go = el.querySelector('#rpGo'); go.textContent = 'Calculando…'; go.disabled = true;
      try {
        const sym = el.querySelector('#rpSym').value, itv = el.querySelector('#rpTf').value, n = +el.querySelector('#rpN').value;
        const cs = await fetchKlinesPaged(sym, itv, n); if (cs.length < 30) throw new Error('Pocas velas disponibles');
        const s = scripts.find(x => x.id === sid), p = state.pine.find(x => x.sid === sid);
        const res = await pineRunFull(s.code, {inputs: (p && p.inputs) || {}, interval: itv, symbol: sym, name: s.name, cs, timeLimitMs: 25000});
        if (!res || !res.ok) throw new Error(res && res.error ? res.error.msg : 'Error al calcular');
        if (!res.strategy) throw new Error('El script no produjo un backtest');
        S = res.strategy; rc = cs; rsym = sym; ritv = itv; show(); if (!res.complete) toast('Aviso: hay partes del script sin soporte; el resultado puede diferir');
      } catch (err) { toast('No se pudo recalcular: ' + (err.message || err)); }
      busy = false; go.textContent = 'Recalcular'; go.disabled = false;
    }
  });
  show();
}
function pineMsgHtml(res, code) {
  if (!res.ok) { const src = (code || '').split('\n')[res.error.line - 1]; return `<div class="pine-box err"><b>No se pudo interpretar</b><div>${res.error.line ? 'Línea ' + res.error.line + ': ' : ''}${esc(res.error.msg)}</div>${src ? `<pre>${esc(src.trim().slice(0, 160))}</pre>` : ''}</div>`; }
  const un = res.warnings.filter(w => w.level === 'unsupported'), fx = res.warnings.filter(w => w.level === 'fix'), rest = res.warnings.filter(w => w.level !== 'unsupported' && w.level !== 'fix');
  const li = w => `<li>${w.line ? 'Línea ' + w.line + ' · ' : ''}${esc(w.msg)}</li>`;
  return `<div class="pine-box ${res.complete ? 'ok' : 'warn'}"><b>${res.complete ? '✓ Interpretado: no se detectó nada sin soporte' : '⚠ Interpretado con partes SIN soporte: el resultado puede diferir de TradingView'}</b>`
    + `<div>${res.plots.length + (res.candles || []).length} plot(s) · ${res.shapes.length} forma(s) · ${res.labels.length + res.lines.length + res.boxes.length + (res.polylines || []).length + (res.tables || []).length + (res.linefills || []).length} objeto(s) · ${res.stats.ms} ms</div>`
    + (fx.length ? `<div class="pine-fix"><b>🔧 Reparado automáticamente (${fx.length})</b><ul class="info">${fx.map(li).join('')}</ul></div>` : '') + (un.length ? `<ul>${un.map(li).join('')}</ul>` : '') + (rest.length ? `<ul class="info">${rest.map(li).join('')}</ul>` : '') + '</div>';
}
const PINE_EXAMPLE = `//@version=5
indicator("Cruce de EMAs (ejemplo)", overlay=true)
fast = input.int(9, "EMA rápida", minval=1)
slow = input.int(21, "EMA lenta", minval=1)
emaF = ta.ema(close, fast)
emaS = ta.ema(close, slow)
plot(emaF, "Rápida", color.aqua, 2)
plot(emaS, "Lenta", color.orange, 2)
up = ta.crossover(emaF, emaS)
dn = ta.crossunder(emaF, emaS)
plotshape(up, "Compra", shape.triangleup, location.belowbar, color.lime, size=size.small)
plotshape(dn, "Venta", shape.triangledown, location.abovebar, color.red, size=size.small)
bgcolor(emaF > emaS ? color.new(color.green, 92) : color.new(color.red, 92))
`;
function renderPineEditor(list) {
  list.innerHTML = `<input id="pineName" class="paste-name" placeholder="Nombre (opcional)" autocomplete="off"><textarea id="pineCode" placeholder="Pega aquí tu código de Pine Script (v5 o anterior)…" spellcheck="false" autocapitalize="off"></textarea>
    <div class="pine-actions"><button class="primary" id="pineRun">Añadir al gráfico</button><button class="small-button" id="pineExample">Ejemplo</button><button class="small-button" id="pineFile">Abrir archivo</button></div>
    <div id="pineMsg"></div>
    <p class="small-note">Es un intérprete propio, no TradingView: soporta una parte de Pine (indicadores, ta.*, plot/plotshape/bgcolor/fill/hline, label/line/box, input.*, arrays, funciones). Lo que no soporta se avisa con su línea; no se omite en silencio. Solo análisis: no se ejecutan órdenes.</p>`;
  $('#pineName').value = pineDraft.name; $('#pineCode').value = pineDraft.code;
  $('#pineCode').oninput = () => { pineDraft.code = $('#pineCode').value; }; $('#pineName').oninput = () => { pineDraft.name = $('#pineName').value; };
  $('#pineExample').onclick = () => { pineDraft.code = PINE_EXAMPLE; $('#pineCode').value = PINE_EXAMPLE; };
  $('#pineFile').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.pine,.txt,text/plain'; i.onchange = async () => { const f = i.files[0]; if (!f) return; if (f.size > 600000) { toast('Archivo demasiado grande'); return; } pineDraft.code = await f.text(); if (!pineDraft.name) pineDraft.name = f.name.replace(/\.[^.]+$/, ''); renderPineEditor(list); }; i.click(); };
  $('#pineRun').onclick = async () => {
    const code = $('#pineCode').value, msg = $('#pineMsg'), btn = $('#pineRun');
    if (!code.trim()) { msg.innerHTML = '<div class="pine-box err">Pega primero el código.</div>'; return; }
    if (!candles.length) { msg.innerHTML = '<div class="pine-box err">Abre un gráfico y espera a que carguen las velas.</div>'; return; }
    if (activePine().length >= PINE_MAX) { msg.innerHTML = `<div class="pine-box err">Máximo ${PINE_MAX} scripts activos a la vez. Apaga o quita alguno.</div>`; return; }
    btn.disabled = true; btn.textContent = 'Interpretando…';
    const key = `${state.symbol}|${state.interval}|${candles[0].t}`;
    const res = await pineRunFull(code, {interval: state.interval, symbol: state.symbol, name: pineDraft.name || 'Script', timeLimitMs: 12000});
    btn.disabled = false; btn.textContent = 'Añadir al gráfico';
    msg.innerHTML = pineMsgHtml(res, code);
    if (!res.ok) return;
    const sid = addScript(code, pineDraft.name.trim() || 'Script de Pine'); if (!sid) return;
    res._key = key; pineRes[sid] = res;
    const ex = state.pine.find(p => p.sid === sid); if (ex) ex.on = true; else state.pine.push({sid, on: true, inputs: {}});
    save(); renderIndicators(); countIndicators(); scheduleRender(); toast('Script añadido al gráfico');
    if (res.complete && !res.warnings.length) closeSheet();
  };
}
function renderPineSettings(list) {
  const p = state.pine.find(x => x.sid === pineSetSid), s = scripts.find(x => x.id === pineSetSid), r = pineRes[pineSetSid];
  if (!p || !s) { list.innerHTML = ''; return; }
  const inputs = r && r.ok ? r.inputs : [];
  const ctl = i => {
    const v = i.value, id = 'pin_' + i.key;
    if (i.options && i.options.length) return `<select id="${id}" data-k="${i.key}" data-t="${i.type}">${i.options.map(o => `<option value="${esc(o)}" ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (i.type === 'bool') return `<button class="toggle ${v ? 'on' : ''}" id="${id}" data-k="${i.key}" data-t="bool" data-on="${v ? 1 : 0}" aria-pressed="${!!v}"></button>`;
    if (i.type === 'color') return `<input type="color" id="${id}" data-k="${i.key}" data-t="color" value="${esc(String(v).slice(0, 7))}">`;
    if (i.type === 'int' || i.type === 'float') return `<input type="number" id="${id}" data-k="${i.key}" data-t="${i.type}" value="${esc(v)}" ${i.min != null ? `min="${i.min}"` : ''} ${i.max != null ? `max="${i.max}"` : ''} step="${i.step || (i.type === 'int' ? 1 : 'any')}">`;
    return `<input type="text" id="${id}" data-k="${i.key}" data-t="${i.type}" value="${esc(v)}">`;
  };
  list.innerHTML = `<p class="small-note"><b>${esc(s.name)}</b> · ${s.lines} líneas</p>${r ? pineMsgHtml(r, s.code) : '<p class="small-note">Calculando…</p>'}`
    + (inputs.length ? `<div class="pine-head"><b>Parámetros</b></div>` + inputs.map(i => `<div class="setting-row pine-in"><label for="pin_${i.key}"><b>${esc(i.title)}</b>${i.group ? `<small>${esc(i.group)}</small>` : ''}</label>${ctl(i)}</div>`).join('') + `<div class="pine-actions"><button class="primary" id="pineApply">Aplicar</button><button class="small-button" id="pineReset">Restablecer</button></div>` : '')
    + `<div class="pine-actions"><button class="small-button" id="pineView">Ver código</button></div>`;
  $$('#sheetList .toggle[data-k]').forEach(b => b.onclick = () => { const on = b.dataset.on !== '1'; b.dataset.on = on ? 1 : 0; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  const ap = $('#pineApply'); if (ap) ap.onclick = () => {
    const o = {}; $$('#sheetList [data-k]').forEach(el => { const t = el.dataset.t; o[el.dataset.k] = t === 'bool' ? el.dataset.on === '1' : (t === 'int' || t === 'float' || t === 'time') ? (el.value === '' ? null : +el.value) : el.value; });
    p.inputs = o; save(); pineKey = ''; schedulePine(); toast('Parámetros aplicados'); closeSheet();
  };
  const rs = $('#pineReset'); if (rs) rs.onclick = () => { p.inputs = {}; save(); pineKey = ''; schedulePine(); toast('Parámetros restablecidos'); closeSheet(); };
  $('#pineView').onclick = () => { viewScriptId = pineSetSid; openSheet('script'); };
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-pine-new],[data-pine-set],[data-pine-del],[data-pine-tog],[data-pine-add],[data-pine-rep]'); if (!t) return;
  const d = t.dataset;
  if (d.pineRep) { openStrategyReport(d.pineRep); return; }
  if (d.pineNew) { openSheet('pine'); return; }
  if (d.pineSet) { pineSetSid = d.pineSet; openPineDialog(d.pineSet); return; }
  if (d.pineAdd) {
    if (state.pine.some(p => p.sid === d.pineAdd)) { toast('Ya está en el gráfico'); return; }
    if (activePine().length >= PINE_MAX) { toast(`Máximo ${PINE_MAX} scripts activos`); return; }
    state.pine.push({sid: d.pineAdd, on: true, inputs: {}}); save(); renderIndicators(); pineKey = ''; schedulePine(); toast('Añadido al gráfico: revisa Indicadores'); return;
  }
  const p = state.pine.find(x => x.sid === (d.pineDel || d.pineTog)); if (!p) return;
  if (d.pineDel) { state.pine = state.pine.filter(x => x !== p); delete pineRes[p.sid]; }
  else { if (!p.on && activePine().length >= PINE_MAX) { toast(`Máximo ${PINE_MAX} scripts activos`); return; } p.on = !p.on; if (p.on) { pineKey = ''; schedulePine(); } }
  save(); renderIndicators(); if (sheetMode === 'indicators' && $('#sheet').classList.contains('open')) $('#sheetList').innerHTML = indicatorRows(); scheduleRender();
});
function drawPinePane(x, top0, H, lo, hi, o) {
  if (!x) return; const {left, w, right, line, text, step, plotW} = o, r = x.r, top = top0 + 4, height = H - 10;
  const rg = CCTPineDraw.range(r, lo, hi); let mn = rg ? rg.min : 0, mx = rg ? rg.max : 1;
  if (mx === mn) { mx += 1; mn -= 1; } const pad = (mx - mn) * .08; mn -= pad; mx += pad;
  const Yp = v => top + (mx - v) / (mx - mn) * height;
  g.save(); g.beginPath(); g.rect(left, top0, w - left, H); g.clip();
  g.strokeStyle = line; g.lineWidth = .6; g.setLineDash([]); g.beginPath(); g.moveTo(left, top0); g.lineTo(w - right + 2, top0); g.stroke();
  g.font = '10px system-ui'; g.fillStyle = text; g.textAlign = 'left';
  { const tx = `${(r.meta.short || r.meta.title || '').slice(0, 22)}  ${CCTPineDraw.legend(r, candles.length - 1).slice(0, 2).map(i => i.text.replace(/^.* /, '')).join('  ')}`; legLabel(tx, left + 4, top + 16, {t: 'pine', sid: x.p.sid, pane: x.p.pane || 'bottom'}); }
  g.fillText(CCTPineDraw.fmtV(mx - pad), w - right + 6, top + 9); g.fillText(CCTPineDraw.fmtV(mn + pad), w - right + 6, top + height);
  g.beginPath(); g.rect(left, top0, plotW + 2, H); g.clip();
  CCTPineDraw.draw(g, r, {X, Y: Yp, lo, hi, left, right: left + plotW, top: top0 + 2, bottom: top0 + H - 2, step, candles, overlay: false});
  g.restore();
}

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
  if (unsubScripts) { unsubScripts(); unsubScripts = null; }
  clearTimeout(pushTimer); fbUser = user;
  if (!user) {
    try { localStorage.removeItem(LASTUID); } catch {}
    if (uid) { uid = null; lastRemote = ''; scriptsRemote = ''; applyState(readLocal(STORE)); scripts = withCatalog(readScripts()); renderScripts(); } // vuelve al estado local sin sesión; los datos de la cuenta no se quedan visibles
    syncStatus = ''; renderAccount(); return;
  }
  uid = user.uid; try { localStorage.setItem(LASTUID, uid); } catch {}
  const anonScripts = (readLocal(SCRIPTS_KEY).items || []).filter(x => x && typeof x.id === 'string'); // scripts guardados antes de iniciar sesión
  scripts = withCatalog(readScripts()); scriptsRemote = ''; renderScripts();
  syncStatus = 'Sincronizando…'; renderAccount();
  const ref = db.doc(CLOUD_DOC(uid));
  try {
    const snap = await ref.get();
    const pendingLocal = (() => { try { return !!localStorage.getItem(dirtyKey()); } catch { return false; } })();
    if (snap.exists && snap.data().state && pendingLocal) { lastRemote = snap.data().state; await cloudPushNow(); } // cambios hechos aquí que aún no habían subido: se conservan y se suben
    else if (snap.exists && snap.data().state) { lastRemote = snap.data().state; applyState(JSON.parse(lastRemote)); save(); try { localStorage.removeItem(dirtyKey()); } catch {} }
    else { // primera vez en esta cuenta: se sube lo que ya había en este dispositivo
      const mine = JSON.stringify(state); lastRemote = mine; save();
      await ref.set({state: mine, updatedAt: firebase.firestore.FieldValue.serverTimestamp()});
    }
    unsubCloud = ref.onSnapshot(sn => { // cambios hechos desde otro dispositivo
      if (sn.metadata.hasPendingWrites || !sn.exists) return;
      const str = sn.data().state; if (!str || str === lastRemote) return;
      lastRemote = str; try { applyState(JSON.parse(str), true); save(); refreshPineAfterSync(); } catch {}
    }, () => {});
    const sref = db.doc(`users/${uid}/data/scripts`), ssnap = await sref.get();
    if (ssnap.exists && ssnap.data().items) { scriptsRemote = ssnap.data().items; try { scripts = withCatalog(JSON.parse(scriptsRemote)); localStorage.setItem(scriptsKey(), JSON.stringify({items: userScripts()})); renderScripts(); } catch {} }
    else { // la cuenta aún no tiene scripts: se suben los de este dispositivo (los de la cuenta local + los guardados antes de iniciar sesión)
      const have = new Set(scripts.map(x => x.id)); for (const x of anonScripts) if (!have.has(x.id)) scripts.push(x);
      if (scripts.length) { scriptsRemote = JSON.stringify(scripts); try { localStorage.setItem(scriptsKey(), JSON.stringify({items: scripts})); } catch {} await sref.set({items: scriptsRemote, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); renderScripts(); }
    }
    unsubScripts = sref.onSnapshot(sn => { // scripts cambiados desde otro dispositivo
      if (sn.metadata.hasPendingWrites || !sn.exists) return;
      const str = sn.data().items; if (!str || str === scriptsRemote) return;
      try { const arr = JSON.parse(str); if (!Array.isArray(arr)) return; scriptsRemote = str; scripts = withCatalog(arr); localStorage.setItem(scriptsKey(), JSON.stringify({items: userScripts()})); renderScripts(); refreshPineAfterSync(); } catch {}
    }, () => {});
    refreshPineAfterSync();
    syncStatus = 'Guardado en tu cuenta · ' + syncSummary();
  } catch (e) {
    const hint = ['permission-denied', 'failed-precondition', 'unavailable', 'not-found'].includes(e.code) ? ' Revisa en Firebase Console que Firestore esté creado y que las reglas de firestore.rules estén publicadas.' : '';
    syncStatus = 'No se pudo sincronizar (' + (e.code || 'error') + '). Tus datos siguen guardados en este dispositivo.' + hint;
  }
  renderAccount();
}
const syncSummary = () => `${state.pine.length} script${state.pine.length === 1 ? '' : 's'} en el gráfico · ${scripts.length} guardado${scripts.length === 1 ? '' : 's'} · ${state.alerts.length} alerta${state.alerts.length === 1 ? '' : 's'}`;
function refreshPineAfterSync() { renderIndicators(); countIndicators(); renderAlerts(); pineKey = ''; for (const k of Object.keys(pineRes)) if (!scripts.some(s => s.id === k)) delete pineRes[k]; schedulePine(); scheduleRender(); }
const CLOUD_MAX = 950000; // Firestore limita cada documento a 1 MiB
async function cloudPushNow() {
  if (!uid || !db || !fbUser) return;
  const str = JSON.stringify(state);
  if (str === lastRemote) { try { localStorage.removeItem(dirtyKey()); } catch {} return; }
  if (str.length > CLOUD_MAX) { syncStatus = 'Tu configuración es demasiado grande para la nube (' + Math.round(str.length / 1024) + ' KB). Borra algunos trazos del pincel: siguen guardados en este dispositivo.'; renderAccount(); return; }
  const mine = uid; lastRemote = str;
  try { await db.doc(CLOUD_DOC(mine)).set({state: str, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}); if (uid === mine) { try { localStorage.removeItem(dirtyKey()); } catch {} syncStatus = 'Guardado en tu cuenta · ' + syncSummary(); } }
  catch { syncStatus = 'No se pudo guardar en la nube. Se reintentará al próximo cambio.'; lastRemote = ''; }
  renderAccount();
}
function cloudPush() {
  if (!uid || !db || !fbUser) return;
  clearTimeout(pushTimer); pushTimer = setTimeout(cloudPushNow, 1200);
}
// al cerrar o mandar la pestaña a segundo plano (móvil) se sube de inmediato lo pendiente, sin esperar el retardo
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(pushTimer); cloudPushNow(); } });
window.addEventListener('pagehide', () => { clearTimeout(pushTimer); cloudPushNow(); });
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

/* ───────── Ancho de los paneles laterales (solo escritorio): arrastrar, doble clic para ocultar ───────── */
(function layoutSplit() {
  const main = document.querySelector('main'), KEY = 'cct_layout_v1', LIM = {wl: [230, 520, 270], side: [260, 680, 310]};
  let L = {}; try { L = JSON.parse(lsGet(KEY) || '{}') || {}; } catch {}
  const wide = () => window.innerWidth;
  const apply = () => {
    const mx = k => Math.min(LIM[k][1], Math.max(LIM[k][0], wide() * (k === 'wl' ? .4 : .45)));
    for (const [k, v] of [['wl', '--wl-w'], ['side', '--side-w']]) {
      const off = L[k + 'Off'], w = L[k] ? Math.min(mx(k), Math.max(LIM[k][0], L[k])) : null;
      document.body.classList.toggle(k + '-off', !!off);
      if (off) main.style.setProperty(v, '0px'); else if (w) main.style.setProperty(v, w + 'px'); else main.style.removeProperty(v);
    }
    const sl = document.getElementById('splitL'), sr = document.getElementById('splitR');
    sl.classList.toggle('collapsed', !!L.wlOff); sr.classList.toggle('collapsed', !!L.sideOff);
    document.getElementById('splitLBtn').textContent = L.wlOff ? '›' : '‹'; document.getElementById('splitRBtn').textContent = L.sideOff ? '‹' : '›';
    scheduleRender();
  };
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch {} };
  const curW = k => { const el = document.getElementById(k === 'wl' ? 'watchView' : (document.body.dataset.side || 'newsView')); return Math.round(el.getBoundingClientRect().width) || LIM[k][2]; };
  const bind = (id, k) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.split-btn') || !isDesktop()) return; e.preventDefault();
      const x0 = e.clientX, w0 = L[k + 'Off'] ? 0 : curW(k); el.setPointerCapture(e.pointerId); el.classList.add('drag');
      const mv = ev => { const d = ev.clientX - x0, w = k === 'wl' ? w0 + d : w0 - d; if (w < 90) { L[k + 'Off'] = true; } else { L[k + 'Off'] = false; L[k] = Math.round(Math.min(LIM[k][1], Math.max(LIM[k][0], w))); } apply(); };
      const up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); store(); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    const toggle = () => { L[k + 'Off'] = !L[k + 'Off']; store(); apply(); };
    el.addEventListener('dblclick', e => { if (!e.target.closest('.split-btn')) toggle(); });
    el.querySelector('.split-btn').addEventListener('click', toggle);
  };
  bind('splitL', 'wl'); bind('splitR', 'side');
  // al cambiar de panel derecho (indicadores / alertas / ajustes) se mantiene el ancho; si estaba oculto, se muestra al elegir una pestaña
  document.querySelectorAll('.side-tabs button').forEach(b => b.addEventListener('click', () => { if (L.sideOff) { L.sideOff = false; store(); apply(); } }));
  window.addEventListener('resize', () => { if (isDesktop()) apply(); });
  apply();
})();

/* ───────── Arranque ───────── */
renderFrames(); renderIndicators(); countIndicators(); renderWatch(); updateChartHeader(); updateDrawUI(); theme(); syncFullscreenLabel(); renderScripts(); renderAlerts();
if (isDesktop()) onLayoutChange();
fetchTicker(); loadCandles(); initCloud();
setInterval(fetchTicker, 30000);
setInterval(() => { if (!document.hidden) checkAlertsPoll(); }, 10000);
setInterval(() => { if (currentView === 'chartView' && !wsOpen && candles.length && !document.hidden) loadCandles(true); }, 20000);
})();
