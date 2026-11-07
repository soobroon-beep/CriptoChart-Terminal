/* NOVA BOT LAB · interfaz. Usa botlab-engine.js (motor real de backtest) y llm.js (IA con modelos abiertos y gratuitos).
   Todo lo que se muestra sale de backtests reales sobre velas cerradas de Binance; sin datos suficientes se dice claramente. Fase 1: backtest + validación por tramos + biblioteca + gráfico.
   No ejecuta órdenes reales ni toca fondos. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const B = window.CCTBotLab, LLM = window.CCTLLM; if (!B) return;
  const $ = (s, e) => (e || document).querySelector(s), $$ = (s, e) => [...(e || document).querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const H = new Proxy({}, {get: (_, k) => (window.CCT_bot || {})[k]}), uidOf = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const num = (x, d = 2) => x == null || !Number.isFinite(x) ? '—' : (+x).toLocaleString('es', {maximumFractionDigits: d, minimumFractionDigits: 0}), money = x => x == null ? '—' : (x < 0 ? '−' : '') + '$' + num(Math.abs(x), 2), pct = (x, d = 1) => x == null || !Number.isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + num(Math.abs(x), d) + ' %', pf = m => m.pfInf ? '∞' : m.profitFactor == null ? '—' : num(m.profitFactor, 2);
  const cls = x => x > 0 ? 'pos' : x < 0 ? 'neg' : '', dt = t => new Date(t).toLocaleString('es', {dateStyle: 'short', timeStyle: 'short'}), dd = t => new Date(t).toLocaleDateString('es', {day: '2-digit', month: 'short', year: '2-digit'});
  const ICON = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {back: ICON('<path d="M15 6l-6 6 6 6"/>'), plus: ICON('<path d="M12 5v14M5 12h14"/>'), expand: ICON('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'), shrink: ICON('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'), robot: ICON('<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V4.5"/><circle cx="9.3" cy="13" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.7" cy="13" r="1.2" fill="currentColor" stroke="none"/><path d="M9.5 16.5h5"/>'), play: ICON('<path d="M7 5l12 7-12 7z"/>'), pause: ICON('<path d="M8 5v14M16 5v14"/>'), step: ICON('<path d="M6 5l9 7-9 7zM18 5v14"/>')};

  /* ───────── Almacenamiento (local + cuenta) ───────── */
  let S = {v: 1, bots: [], deleted: {}, risk: null}, cloudTimer = 0, cloudStr = '';
  const readLocal = () => { try { const o = JSON.parse(localStorage.getItem(H.key ? H.key() : 'cct_botlab_v1') || 'null'); if (o && Array.isArray(o.bots)) return o; } catch {} return {v: 1, bots: [], deleted: {}}; };
  function merge(a, b) { // une dos copias: gana la versión más reciente de cada bot; los borrados se respetan
    const del = Object.assign({}, a.deleted, b.deleted), map = new Map(); for (const x of [...a.bots, ...b.bots]) { const y = map.get(x.id); if (!y || (x.updatedAt || 0) > (y.updatedAt || 0)) map.set(x.id, x); }
    const ra = a.risk, rb = b.risk, risk = !ra ? rb : !rb ? ra : ((rb.updatedAt || 0) > (ra.updatedAt || 0) ? rb : ra);
    return {v: 1, bots: [...map.values()].filter(x => !(del[x.id] >= (x.updatedAt || 0))), deleted: del, risk: risk || null};
  }
  function save() {
    const str = JSON.stringify(S); try { localStorage.setItem(H.key ? H.key() : 'cct_botlab_v1', str); } catch { H.toast && H.toast('No se pudo guardar en este dispositivo (almacenamiento lleno)'); }
    clearTimeout(cloudTimer); cloudTimer = setTimeout(async () => { const c = H.cloud && H.cloud(); if (!c) return; const s2 = JSON.stringify(S); if (s2 === cloudStr || s2.length > 900000) return; try { await c.set(s2); cloudStr = s2; } catch {} }, 1500);
  }
  async function pullCloud() {
    const c = H.cloud && H.cloud(); if (!c) return; try { const str = await c.get(); if (str) { cloudStr = str; const m = merge(readLocal(), JSON.parse(str)); S = m; save(); } } catch {}
    try { if (c.server) { const r = await c.server(); if (r) { mergeServer(r.results); mergePaper(r.paper); } } } catch {} if (view === 'lib') render();
  }

  /* ───────── Modelo de bot ───────── */
  const ST = {draft: 'Borrador', tested: 'Probado', paused: 'Pausado', archived: 'Archivado', running: 'Evaluando'};
  function newBot(spec, method, desc) {
    const now = Date.now(); const sp = B.normalizeSpec(spec);
    return {id: uidOf(), name: sp.name, desc: desc || '', status: 'draft', method, createdAt: now, updatedAt: now, lastRunAt: null, mainV: 1,
      versions: [{v: 1, spec: sp, at: now, note: 'Versión inicial', origin: 'usuario', state: 'principal'}], runs: [], chat: [], journal: [{t: now, kind: 'creación', text: `Bot creado (${method === 'nl' ? 'lenguaje natural' : method === 'nova' ? 'indicadores Nova' : method === 'indicador' ? 'un indicador propio' : 'constructor visual'}).`}], sweeps: {}};
  }
  const ver = (bot, v) => bot.versions.find(x => x.v === (v || bot.mainV)), mainSpec = bot => ver(bot).spec;
  const runOf = (bot, v) => { for (let i = bot.runs.length - 1; i >= 0; i--) if (bot.runs[i].v === (v || bot.mainV)) return bot.runs[i]; return null; };
  const log = (bot, kind, text) => { bot.journal.push({t: Date.now(), kind, text}); if (bot.journal.length > 300) bot.journal.splice(0, bot.journal.length - 300); };
  const touch = bot => { bot.updatedAt = Date.now(); save(); };
  const getBot = id => S.bots.find(b => b.id === id);

  /* ───────── Datos y ejecución ───────── */
  const histCache = new Map();
  async function candlesFor(sym, itv, bars) { const k = sym + '|' + itv + '|' + bars, h = histCache.get(k); if (h && Date.now() - h.at < 300e3) return h.c; const c = await H.history(sym, itv, bars); histCache.set(k, {at: Date.now(), c}); return c; }
  const compact = (arr, n) => { if (arr.length <= n) return arr; const out = [], k = (arr.length - 1) / (n - 1); for (let i = 0; i < n; i++) out.push(arr[Math.round(i * k)]); return out; };
  function summarize(res, v, bars) {
    return {id: uidOf(), v, at: Date.now(), avoid: (res.avoid || []).slice(-300), symbol: res.symbol, interval: res.interval, bars: res.bars, reqBars: bars, from: res.from, to: res.to, metrics: res.metrics, segments: res.segments, verdict: res.verdict, buyHold: res.buyHold, daily: res.daily, breakdown: res.breakdown, warnings: res.warnings, halted: res.halted,
      trades: res.trades.slice(-400).map(t => ({id: t.id, side: t.side, entryT: t.entryT, exitT: t.exitT, entry: t.entry, exit: t.exit, sl: t.sl, tp: t.tp, net: t.net, fees: t.fees, r: t.r, bars: t.bars, why: t.why, reasonIn: t.reasonIn, ctx: t.ctx, open: t.open})), tradesTotal: res.trades.length,
      equity: compact(res.equity, 240).map(p => [p.t, Math.round(p.e * 100) / 100]), bh: (res.bhCurve || []).map(p => [p[0], Math.round(p[1] * 100) / 100]), ext: ext(res)};
  }
  /* ───────── Indicadores del usuario (Pine) → señales por vela ───────── */
  const NAN = NaN, userCache = new Map();
  const extractSources = (res, n) => window.CCTBotOpt.extractSources(res, n);
  async function userSources(sid, sym, itv, bars) { // ejecuta el script del usuario sobre el historial (no toca el gráfico)
    const candles = await candlesFor(sym, itv, bars), key = [sid, sym, itv, candles.length, candles[candles.length - 1].t].join('|'), hit = userCache.get(key); if (hit) return hit;
    if (!H.runPine) throw new Error('Esta versión no puede ejecutar indicadores propios'); const res = await H.runPine(sid, sym, itv, candles);
    if (!res || !res.ok) throw new Error('Tu indicador no se pudo ejecutar: ' + ((res && res.error && res.error.msg) || 'error desconocido')); const r = {sources: extractSources(res, candles.length), warnings: res.warnings || [], complete: res.complete !== false, n: candles.length}; userCache.set(key, r); if (userCache.size > 12) userCache.delete(userCache.keys().next().value); return r;
  }
  const userOps = sp => { const o = []; for (const g of [sp.entry, sp.exit]) for (const side of ['long', 'short']) for (const c of g[side] || []) for (const x of [c.a, c.b]) if (x && x.k === 'user') o.push(x); return o; };
  async function execute(spec, bars, extra) { // descarga velas cerradas y corre el backtest (en el navegador, sin tocar el gráfico)
    const sp = B.normalizeSpec(spec); const candles = await candlesFor(sp.symbol, sp.interval, bars); if (candles.length < 60) throw new Error(`Binance devolvió solo ${candles.length} velas de ${sp.symbol} ${sp.interval}`);
    const uo = userOps(sp), user = {}, uw = []; for (const sid of [...new Set(uo.map(x => x.sid))]) { const r = await userSources(sid, sp.symbol, sp.interval, bars); for (const x of uo.filter(y => y.sid === sid)) { const f = r.sources.find(q => q.src === x.src); if (!f) throw new Error(`Tu indicador «${x.sname || sid}» ya no produce la señal «${x.sl || x.src}» en ${sp.symbol} ${sp.interval}`); user[sid + '|' + x.src] = f.series; } if (!r.complete) uw.push(`Tu indicador «${(uo.find(y => y.sid === sid) || {}).sname || sid}» no se pudo ejecutar por completo (funciones no soportadas): sus señales pueden faltar.`); }
    await new Promise(r => setTimeout(r, 20)); const res = B.backtest(candles, sp, Object.assign({nova: window.NovaNexus, user}, extra || {})); if (uo.length) res.warnings.push(...uw, `Este bot usa tu indicador «${uo[0].sname || uo[0].sid}». Cada señal se toma en la vela donde nace, sin mirar al futuro, pero el laboratorio no puede comprobar que tu script no repinte ni que no use datos futuros (por ejemplo con request.security). Confírmalo en paper trading antes de fiarte del resultado.`); const t0 = res.equity[0].t, cs = candles.filter(c => c.t >= t0); if (cs.length) res.bhCurve = compact(cs.map(c => [c.t, sp.risk.capital * c.c / cs[0].o]), 240); return res;
  }
  async function runBot(bot, v, bars) {
    const vv = ver(bot, v); bot.status = 'running'; save(); render();
    try { const res = await execute(vv.spec, bars), run = summarize(res, vv.v, bars); bot.runs.push(run); if (bot.runs.length > 12) bot.runs.splice(0, bot.runs.length - 12); for (let i = 0; i < bot.runs.length - 3; i++) { bot.runs[i].trades = bot.runs[i].trades.slice(0, 0); bot.runs[i].equity = []; } // solo las 3 últimas guardan el detalle
      bot.status = bot.status === 'paused' ? 'paused' : 'tested'; if (bot.status === 'running') bot.status = 'tested'; bot.lastRunAt = Date.now();
      log(bot, 'backtest', `Backtest v${vv.v}: ${run.metrics.n} operaciones, neto ${money(run.metrics.net)} (${pct(run.metrics.retPct)}), drawdown ${num(run.metrics.maxDDPct, 1)} %. ${run.verdict.text}`); touch(bot); return run;
    } catch (e) { bot.status = 'draft'; touch(bot); throw e; }
  }

  /* ───────── Estado de la interfaz ───────── */
  let root, view = 'lib', cur = null, tab = 'sum', wide = false, sel = new Set(), showArch = false, draft = null, draftMeta = null, nl = {hist: [], spec: null, busy: false, msgs: []}, replay = {on: false, timer: 0, t: null, speed: 1, seg: 'all', show: {arrows: true, levels: true, avoid: true}}, cmp = null, busyMsg = '', toastT = 0;
  const note = (t, c) => `<p class="bl-dim ${c || ''}">${esc(t)}</p>`;
  const toast = m => { if (H.toast) H.toast(m); };
  const bot = () => getBot(cur);

  /* ───────── Gráficos (canvas) ───────── */
  function css(n, d) { return getComputedStyle(document.body).getPropertyValue(n).trim() || d; }
  function prep(cv) { const w = cv.clientWidth || 300, h = +cv.dataset.h || 150, d = window.devicePixelRatio || 1; cv.width = w * d; cv.height = h * d; const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h); return {g, w, h}; }
  function lineChart(cv, series, o) {
    o = o || {}; const {g, w, h} = prep(cv), pad = {l: 44, r: 8, t: 8, b: 18}, pts = series.flatMap(s => s.pts); if (!pts.length) return;
    let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1])); if (o.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); } if (y0 === y1) { y0 -= 1; y1 += 1; } const X = x => pad.l + (x - x0) / ((x1 - x0) || 1) * (w - pad.l - pad.r), Y = y => pad.t + (y1 - y) / (y1 - y0) * (h - pad.t - pad.b), mu = css('--muted', '#8a93a6'), ln = css('--line', '#242b3a');
    g.font = '10px system-ui'; g.fillStyle = mu; g.strokeStyle = ln; g.lineWidth = 1; for (let i = 0; i <= 3; i++) { const y = y0 + (y1 - y0) * i / 3, py = Y(y); g.beginPath(); g.moveTo(pad.l, py); g.lineTo(w - pad.r, py); g.stroke(); g.textAlign = 'right'; g.fillText((o.yfmt || num)(y), pad.l - 4, py + 3); }
    g.textAlign = 'center'; [0, .5, 1].forEach(f => { g.fillText(dd(x0 + (x1 - x0) * f), pad.l + (w - pad.l - pad.r) * f, h - 4); });
    for (const s of series) { g.strokeStyle = s.color; g.lineWidth = s.w || 1.6; g.setLineDash(s.dash || []); g.beginPath(); s.pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.stroke(); g.setLineDash([]); if (s.fill) { g.lineTo(X(s.pts[s.pts.length - 1][0]), Y(o.zero ? 0 : y0)); g.lineTo(X(s.pts[0][0]), Y(o.zero ? 0 : y0)); g.closePath(); g.globalAlpha = .12; g.fillStyle = s.color; g.fill(); g.globalAlpha = 1; } }
  }
  function barChart(cv, bars, o) {
    o = o || {}; const {g, w, h} = prep(cv), pad = {l: 44, r: 8, t: 8, b: 30}; if (!bars.length) return; const mu = css('--muted', '#8a93a6'), ln = css('--line', '#242b3a'); let y0 = Math.min(0, ...bars.map(b => b.v)), y1 = Math.max(0, ...bars.map(b => b.v)); if (y0 === y1) y1 = y0 + 1; const Y = y => pad.t + (y1 - y) / (y1 - y0) * (h - pad.t - pad.b), bw = (w - pad.l - pad.r) / bars.length;
    g.font = '10px system-ui'; g.fillStyle = mu; g.strokeStyle = ln; for (let i = 0; i <= 2; i++) { const y = y0 + (y1 - y0) * i / 2, py = Y(y); g.beginPath(); g.moveTo(pad.l, py); g.lineTo(w - pad.r, py); g.stroke(); g.textAlign = 'right'; g.fillText((o.yfmt || num)(y), pad.l - 4, py + 3); }
    bars.forEach((b, i) => { const x = pad.l + i * bw + bw * .15, bw2 = bw * .7, yy = Y(b.v), y00 = Y(0); g.fillStyle = b.color || (b.v >= 0 ? '#17c964' : '#f31260'); g.fillRect(x, Math.min(yy, y00), bw2, Math.max(1, Math.abs(yy - y00))); g.fillStyle = mu; g.textAlign = 'center'; if (bars.length <= 14) g.fillText(String(b.label).slice(0, 9), x + bw2 / 2, h - 16); if (b.sub) g.fillText(b.sub, x + bw2 / 2, h - 5); });
  }
  const chartBox = (id, title, h, hint) => `<div class="bl-chart"><h4>${esc(title)}</h4>${hint ? note(hint) : ''}<canvas id="${id}" data-h="${h || 150}" style="width:100%;height:${h || 150}px"></canvas></div>`;

  /* ───────── Vistas ───────── */
  const head = (title, sub, back, extra) => `<div class="bl-head">${back ? `<button class="bl-ib" data-a="${back}" aria-label="Volver">${IC.back}</button>` : `<span class="bl-logo">${IC.robot}</span>`}<div class="bl-title"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${extra || ''}<button class="bl-ib bl-exp" data-a="wide" aria-label="${wide ? 'Reducir' : 'Expandir'}" title="${wide ? 'Volver al tamaño normal' : 'Expandir el laboratorio'}">${wide ? IC.shrink : IC.expand}</button></div>`;
  const desk = () => matchMedia('(min-width:1024px)').matches; // Nova Bot Lab es solo para la versión de PC
  function render() {
    if (!root || !desk()) return; stopReplayIf(); const keep = root.scrollTop;
    if (view === 'lib') libView(); else if (view === 'new') newView(); else if (view === 'edit') editView(); else if (view === 'bot') botView(); else if (view === 'cmp') cmpView(); else if (view === 'risk') riskView();
    root.scrollTop = view === 'lib' ? keep : root.scrollTop; document.body.classList.toggle('botlab-wide', wide && matchMedia('(min-width:1024px)').matches);
  }
  const stopReplayIf = () => { if (replay.timer && view !== 'bot') { clearInterval(replay.timer); replay.timer = 0; replay.on = false; } };

  function miniStats(b) { const r = runOf(b); if (!r) return '<span class="bl-dim">Sin pruebas todavía</span>'; const m = r.metrics; return `<span class="${cls(m.net)}">${pct(m.retPct)}</span> · ${m.n} op. · aciertos ${m.winRate == null ? '—' : num(m.winRate, 0) + ' %'} · DD ${num(m.maxDDPct, 1)} %`; }
  function libView() {
    const list = S.bots.filter(b => showArch ? true : b.status !== 'archived').sort((a, b) => b.updatedAt - a.updatedAt), tested = S.bots.filter(b => runOf(b));
    root.innerHTML = head('NOVA BOT LAB', 'AI Trading Laboratory · backtest y simulación, sin dinero real') + `<div class="bl-actions"><button class="bl-btn" data-a="new">${IC.plus}Crear nuevo bot</button><button class="bl-btn ghost" data-a="import">Importar</button><button class="bl-btn ghost" data-a="risk">Panel de riesgo</button><button class="bl-btn ghost" data-a="cmp" ${sel.size >= 2 ? '' : 'disabled'}>Comparar (${sel.size})</button><label class="bl-chk"><input type="checkbox" id="blArch" ${showArch ? 'checked' : ''}> Archivados</label></div>
      <div class="bl-stats"><div><b>${S.bots.filter(b => b.status !== 'archived').length}</b><small>Bots</small></div><div><b>${tested.length}</b><small>Probados</small></div><div><b>${S.bots.reduce((a, b) => a + b.runs.length, 0)}</b><small>Backtests guardados</small></div><div><b>${S.bots.reduce((a, b) => a + (b.paper || []).filter(x => x.status === 'running').length, 0)}</b><small>Simulando (paper)</small></div></div>
      ${list.length ? list.map(b => { const v = mainSpec(b); return `<div class="bl-card ${b.status}"><label class="bl-sel"><input type="checkbox" data-sel="${b.id}" ${sel.has(b.id) ? 'checked' : ''}></label><div class="bl-card-m" data-a="open" data-id="${b.id}"><div class="bl-card-t"><b>${esc(b.name)}</b><span class="bl-chip s-${b.status}">${ST[b.status] || b.status}</span></div><small>${esc(v.symbol)} · ${esc(v.interval)} · v${b.mainV} · ${b.method === 'nl' ? 'lenguaje natural' : b.method === 'nova' ? 'Nova' : b.method === 'indicador' ? 'indicador propio' : 'constructor'}${b.desc ? ' · ' + esc(b.desc.slice(0, 70)) : ''}</small><div class="bl-card-s">${miniStats(b)}</div></div><div class="bl-card-b"><button class="bl-mini" data-a="dup" data-id="${b.id}">Duplicar</button><button class="bl-mini" data-a="pause" data-id="${b.id}">${b.status === 'paused' ? 'Reanudar' : 'Pausar'}</button><button class="bl-mini" data-a="arch" data-id="${b.id}">${b.status === 'archived' ? 'Restaurar' : 'Archivar'}</button><button class="bl-mini" data-a="exp" data-id="${b.id}">Exportar</button><button class="bl-mini danger" data-a="del" data-id="${b.id}">Eliminar</button></div></div>`; }).join('') : `<div class="bl-empty">${IC.robot}<p><b>Aún no tienes bots.</b></p><p class="bl-dim">Crea uno escribiendo tu estrategia en español, armándola con el constructor o partiendo de Nova Nexus. Cada bot se prueba con datos históricos reales y se evalúa fuera de muestra.</p></div>`}
      <p class="bl-foot">Fase 1: backtest profesional + validación por tramos. Paper trading, optimización automática y reentrenamiento programado llegan en las siguientes fases. Los resultados históricos no son una promesa de ganancia.</p>`;
  }

  /* ----- Crear ----- */
  const NL_SYS = `Eres un asistente que convierte estrategias de trading escritas en español en una ESPECIFICACIÓN JSON ejecutable. Responde SOLO con un objeto JSON (sin texto extra) de UNA de estas dos formas:
1) Si falta información importante o hay ambigüedad (no inventes reglas): {"questions":["pregunta 1","pregunta 2"]} con máximo 4 preguntas cortas.
2) Si está claro: {"spec":{...}} con este esquema:
{"name":"...","symbol":"BTCUSDT","interval":"15m","sides":"long|short|both","entry":{"long":[COND],"short":[COND]},"exit":{"long":[COND],"short":[COND]},"filters":{"minVolRatio":0,"minAtrPct":0,"maxAtrPct":0,"hoursUtc":null},"risk":{"capital":10000,"riskPct":1,"sizePct":10,"maxLeverage":1,"atrLen":14,"sl":{"type":"atr|pct","v":2}|null,"tp":{"type":"rr|atr|pct","v":2}|null,"trail":{"type":"atr|pct","v":2}|null,"maxBars":0,"maxDailyLossPct":0,"maxDrawdownPct":0},"costs":{"feePct":0.1,"slipPct":0.05}}
COND = {"a":OPERANDO,"op":"gt|lt|gte|lte|crossUp|crossDown|is","b":OPERANDO}  (con "is" no hay "b"; sirve para señales 1/0). Las condiciones de una lista se cumplen TODAS (AND) en entrada y basta UNA (OR) en salida.
OPERANDO = {"k":"close|open|high|low|volume|ema|sma|rsi|atr|adx|macd|macdSignal|macdHist|bbUp|bbMid|bbLo|volRatio|hh|ll|num|novaBuy|novaSell|novaOsc|novaFlux|novaAdx|novaBull", ...parámetros}. Parámetros: ema/sma/rsi/atr/adx/volRatio/hh/ll → "n"; macd* → "f","s","g"; bb* → "n","d"; num → "v".
Reglas: símbolos de Binance Spot terminados en USDT; temporalidades 1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w. Si el usuario no da stop loss o take profit, pregunta. Usa "sides":"long" salvo que pida ventas/cortos. Pon en "name" un nombre corto.`;
  function newView() {
    root.innerHTML = head('Crear nuevo bot', 'Elige cómo quieres definir la estrategia', 'lib') + `<div class="bl-methods">
      <button class="bl-method" data-a="mA"><b>A · Escribirla en español</b><small>La IA la convierte en reglas ejecutables y te muestra exactamente qué hará antes de probarla. Si algo es ambiguo, te pregunta.</small></button>
      <button class="bl-method" data-a="mB"><b>B · Constructor visual</b><small>Elige indicadores, condiciones de entrada y salida, filtros, stop loss, take profit, trailing y gestión de capital sin programar.</small></button>
      <button class="bl-method" data-a="mC"><b>C · Con indicadores (Vortex o los tuyos)</b><small>Usa las señales de compra y venta de uno de TUS indicadores (por ejemplo tu Signals), o parte de plantillas con Nova Nexus y clásicos. Los indicadores se leen en modo solo lectura: nunca se modifican.</small></button></div>
      <p class="bl-dim">Plantillas rápidas:</p><div class="bl-chips">${[['emaRsi', 'EMA 20/50 + RSI'], ['novaNexus', 'Nova Nexus + volumen'], ['macdTrend', 'Tendencia + MACD']].map(x => `<button data-a="preset" data-k="${x[0]}">${x[1]}</button>`).join('')}</div>`;
  }
  function nlView() {
    root.innerHTML = head('Método A · Estrategia en español', 'La IA interpreta; tú confirmas antes de probar', 'newBack') + `<div class="bl-chat" id="blNl">${nl.msgs.map(m => `<div class="bl-msg ${m.role}">${m.html}</div>`).join('') || `<div class="bl-msg bot"><p>Cuéntame tu estrategia. Ejemplo: <i>«Bot para BTCUSDT en 15 minutos con EMA 20, EMA 50, RSI y volumen. Entra cuando se confirme una tendencia alcista, con stop loss y take profit dinámicos»</i>.</p></div>`}</div>
      ${nl.spec ? `<div class="bl-box"><h4>Esto es exactamente lo que haría el bot</h4>${mdLite(B.describeSpec(nl.spec))}<div class="bl-actions"><button class="bl-btn" data-a="nlOk">Confirmar y crear bot</button><button class="bl-btn ghost" data-a="nlEdit">Ajustar en el constructor</button></div></div>` : ''}
      <form class="bl-form" id="blNlForm"><textarea id="blNlIn" rows="3" placeholder="Describe tu estrategia o responde a mis preguntas…" maxlength="1500"></textarea><button class="bl-send" ${nl.busy ? 'disabled' : ''}>${nl.busy ? '…' : 'Enviar'}</button></form>`;
    const c = $('#blNl'); if (c) c.scrollTop = c.scrollHeight;
  }
  const mdLite = t => '<div class="bl-md">' + esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n').map(l => `<p>${l}</p>`).join('') + '</div>';
  function parseJSON(t) { const m = /\{[\s\S]*\}/.exec(String(t || '')); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } }
  async function nlSend(text) {
    text = String(text || '').trim(); if (!text || nl.busy) return; nl.busy = true; nl.msgs.push({role: 'user', html: `<p>${esc(text)}</p>`}); nl.hist.push({role: 'user', content: text}); nlView();
    try {
      let spec = null, out = null;
      for (let t = 0; t < 2 && !spec; t++) {
        const r = await LLM.chat([{role: 'system', content: NL_SYS}, ...nl.hist.slice(-8)], {maxTokens: 1400, temperature: .1, timeout: 90000}); out = parseJSON(r.text); nl.hist.push({role: 'assistant', content: r.text});
        if (out && out.questions && out.questions.length) { nl.msgs.push({role: 'bot', html: `<p><b>Antes de crear las reglas necesito aclarar:</b></p><ul>${out.questions.slice(0, 4).map(q => `<li>${esc(q)}</li>`).join('')}</ul><p class="bl-dim">Respóndeme en un mensaje (o dime «tú decides» solo si aceptas que elija un valor razonable).</p>`}); break; }
        if (out && out.spec) { const sp = B.normalizeSpec(out.spec), v = B.validateSpec(sp); if (v.ok) { spec = sp; break; } nl.hist.push({role: 'user', content: 'La especificación tiene errores: ' + v.errors.join('; ') + '. Corrígela y devuelve solo el JSON.'}); out = null; }
      }
      if (spec) { nl.spec = spec; nl.msgs.push({role: 'bot', html: '<p>Entendí la estrategia. Revisa abajo las reglas exactas; si algo no es lo que querías, ajústalo o dímelo.</p>'}); }
      else if (!(out && out.questions)) nl.msgs.push({role: 'bot', html: '<p>No pude convertirlo en reglas válidas. Intenta ser más específico (indicadores, condiciones de entrada y salida) o usa el constructor visual.</p>'});
    } catch (e) { nl.msgs.push({role: 'bot', html: `<p><b>No pude consultar la IA.</b> ${esc(LLM.friendly(e))} Puedes usar el constructor visual (método B), que no necesita IA.</p>`}); }
    nl.busy = false; nlView();
  }

  /* ----- Método C: indicadores propios ----- */
  let ind = {sym: 'BTCUSDT', itv: '1h', sid: '', busy: false, err: '', res: null, buy: '', sell: '', short: false};
  const guess = (list, re, hint) => (list.find(x => x.kind === 'señal' && re.test(x.label)) || list.find(x => x.kind === 'señal' && x.hint === hint) || {}).src || '';
  function indView() {
    const sc = (H.scripts && H.scripts()) || [], r = ind.res, sig = r ? r.sources.filter(x => x.kind === 'señal') : [], opt = (sel, none) => `<option value="">${none}</option>` + sig.map(x => `<option value="${esc(x.src)}" ${x.src === sel ? 'selected' : ''}>${esc(x.label)} · ${x.count} señales</option>`).join('');
    root.innerHTML = head('Método C · Con indicadores', 'Usa las señales de tus indicadores; no se modifican', 'newBack') +
      `<div class="bl-box"><h4>1 · Elige tu indicador</h4>${sc.length ? `<div class="bl-grid">${fld('Indicador', `<select id="indSid"><option value="">Elige uno…</option>${[[true, 'Mis indicadores'], [false, 'Catálogo de Vortex']].map(([o, t]) => sc.some(x => x.own === o) ? `<optgroup label="${t}">${sc.filter(x => x.own === o).map(x => `<option value="${esc(x.id)}" ${x.id === ind.sid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>` : '').join('')}</select>`)}${fld('Moneda', `<input id="indSym" list="blCoins2" value="${esc(ind.sym)}"><datalist id="blCoins2">${COINS.map(c => `<option value="${c}">`).join('')}</datalist>`)}${fld('Temporalidad', `<select id="indItv">${INTS.map(i => `<option ${i === ind.itv ? 'selected' : ''}>${i}</option>`).join('')}</select>`)}</div><div class="bl-actions"><button class="bl-btn" data-a="indScan" ${ind.busy || !ind.sid ? 'disabled' : ''}>${ind.busy ? 'Ejecutando tu indicador…' : 'Analizar sus señales'}</button></div>${note('Se ejecuta tu indicador sobre 3.000 velas históricas de Binance para ver qué señales produce. No se cambia nada en tu gráfico.')}` : note('Aún no tienes indicadores propios guardados en Vortex. Importa o crea uno en la sección de scripts/IA y vuelve aquí.')}${ind.err ? `<div class="bl-err">${esc(ind.err)}</div>` : ''}</div>` +
      (r ? `<div class="bl-box"><h4>2 · Señales detectadas</h4>${r.sources.length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Fuente</th><th>Tipo</th><th>Cuántas</th></tr></thead><tbody>${r.sources.map(x => `<tr><td>${esc(x.label)}</td><td>${x.kind}</td><td>${x.count}</td></tr>`).join('')}</tbody></table></div>` : note('Tu indicador no produjo ninguna señal, etiqueta, forma ni línea en este historial.')}${!r.complete ? note('⚠ Tu indicador usa funciones que el motor de Pine aún no soporta del todo: puede faltar información.', 'warn') : ''}</div>
      ${sig.length ? `<div class="bl-box"><h4>3 · ¿Cuál es compra y cuál es venta?</h4><div class="bl-grid">${fld('Señal de COMPRA (entra largo)', `<select id="indBuy">${opt(ind.buy, 'Elige…')}</select>`)}${fld('Señal de VENTA (cierra el largo)', `<select id="indSell">${opt(ind.sell, 'Ninguna: saldrá por SL/TP')}</select>`)}</div><label class="bl-chk"><input type="checkbox" id="indShort" ${ind.short ? 'checked' : ''}> También operar en corto: vender con la señal de VENTA y cerrar con la de COMPRA</label>${note('Sugerí una asignación por los nombres; revísala. Stop loss y take profit empiezan en 2 ATR y 2R: puedes cambiarlos en el constructor.')}<div class="bl-actions"><button class="bl-btn" data-a="indOk" ${ind.buy ? '' : 'disabled'}>Crear bot y probar</button><button class="bl-btn ghost" data-a="indEdit" ${ind.buy ? '' : 'disabled'}>Ajustar en el constructor</button></div></div>` : ''}` : '');
  }
  function indSpec() {
    const sc = (H.scripts() || []).find(x => x.id === ind.sid) || {name: 'Mi indicador'}, mkOp = src => { const f = ind.res.sources.find(x => x.src === src); return {k: 'user', sid: ind.sid, src, sname: sc.name, sl: f ? f.label : src}; }, sp = B.defaultSpec();
    sp.name = sc.name + ' · bot'; sp.symbol = ind.sym; sp.interval = ind.itv; sp.sides = ind.short ? 'both' : 'long'; sp.entry.long = [{a: mkOp(ind.buy), op: 'is'}]; if (ind.sell) sp.exit.long = [{a: mkOp(ind.sell), op: 'is'}];
    if (ind.short && ind.sell) { sp.entry.short = [{a: mkOp(ind.sell), op: 'is'}]; sp.exit.short = [{a: mkOp(ind.buy), op: 'is'}]; } return B.normalizeSpec(sp);
  }
  async function indScan() {
    ind.busy = true; ind.err = ''; ind.res = null; indView();
    try { ind.sym = String(ind.sym).toUpperCase().replace(/[^A-Z0-9]/g, ''); const r = await userSources(ind.sid, ind.sym, ind.itv, 3000); ind.res = r; ind.buy = guess(r.sources, /compra|buy|long|alcista|bull|up\b/i, 'buy'); ind.sell = guess(r.sources, /venta|sell|short|bajista|bear|down/i, 'sell'); if (ind.sell === ind.buy) ind.sell = ''; }
    catch (e) { ind.err = String(e.message || e); } ind.busy = false; indView();
  }
  /* ----- Extras de métricas (calculadas de la curva de capital completa) ----- */
  function ext(res) {
    const days = new Map(); for (const p of res.equity) days.set(Math.floor(p.t / 864e5), p.e); const keys = [...days.keys()].sort((a, b) => a - b), rets = []; let prev = res.capital;
    for (const k of keys) { const e = days.get(k); rets.push([k * 864e5, (e - prev) / prev * 100]); prev = e; }
    const r = rets.map(x => x[1]), n = r.length || 1, mean = r.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / n), dsd = Math.sqrt(r.filter(x => x < 0).reduce((a, b) => a + b * b, 0) / n), ok = r.length >= 20;
    let cw = 0, cl = 0, mw = 0, ml = 0; for (const t of res.trades) { if (t.net > 0) { cw++; cl = 0; } else { cl++; cw = 0; } mw = Math.max(mw, cw); ml = Math.max(ml, cl); }
    const nets = res.trades.map(t => t.net);
    return {sharpe: ok && sd > 0 ? mean / sd * Math.sqrt(365) : null, sortino: ok && dsd > 0 ? mean / dsd * Math.sqrt(365) : null, maxWinStreak: mw, maxLossStreak: ml, avgBars: res.trades.length ? res.trades.reduce((a, t) => a + t.bars, 0) / res.trades.length : null, best: nets.length ? Math.max(...nets) : null, worst: nets.length ? Math.min(...nets) : null, dailyRet: rets.slice(-400)};
  }

  /* ----- Constructor visual (método B) ----- */
  const INTS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w'], COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT'];
  const getP = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o), setP = (o, p, v) => { const ks = p.split('.'), l = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[l] = v; };
  const short = l => String(l).replace(/ \(.*/, '');
  function opndHTML(path, o) {
    const def = B.OPERANDS[o.k] || {}, nova = !window.NovaNexus && def.nova;
    if (o.k === 'user') return `<span class="bl-opnd"><span class="bl-usr" title="Indicador propio (solo lectura)">${esc(o.sname || 'Indicador')} · ${esc(o.sl || o.src)}</span></span>`;
    return `<span class="bl-opnd"><select data-p="${path}.k" data-re="k" aria-label="Indicador">${Object.entries(B.OPERANDS).filter(([k]) => k !== 'user').map(([k, v]) => `<option value="${k}" ${k === o.k ? 'selected' : ''}>${esc(short(v.label))}</option>`).join('')}</select>${def.p ? Object.keys(def.p).map(pk => `<input type="number" step="any" data-p="${path}.${pk}" data-n="1" value="${o[pk] != null ? o[pk] : def.p[pk]}" aria-label="${pk}" title="${pk}">`).join('') : ''}${nova ? '<small class="bl-dim">Nova no cargado</small>' : ''}</span>`;
  }
  function condRows(list, path) {
    const L = getP(draft, path) || []; return L.map((c, i) => `<div class="bl-cond">${opndHTML(`${path}.${i}.a`, c.a)}<select data-p="${path}.${i}.op" data-re="op">${Object.entries(B.OPS).map(([k, v]) => `<option value="${k}" ${c.op === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>${c.op === 'is' ? '' : opndHTML(`${path}.${i}.b`, c.b || {k: 'num', v: 0})}<button class="bl-ib sm" data-a="rmc" data-list="${path}" data-i="${i}" aria-label="Quitar condición">✕</button></div>`).join('') || '<p class="bl-dim">Sin condiciones.</p>';
  }
  const listBlock = (title, path, hint) => `<div class="bl-box"><h4>${title}</h4>${hint ? note(hint) : ''}${condRows(null, path)}<button class="bl-mini" data-a="addc" data-list="${path}">+ Añadir condición</button></div>`;
  const fld = (label, inner) => `<label class="bl-f"><span>${label}</span>${inner}</label>`;
  const nin = (path, extra) => `<input type="number" step="any" data-p="${path}" data-n="1" value="${getP(draft, path) == null ? '' : getP(draft, path)}" ${extra || ''}>`;
  const lvl = (k, lab) => { const v = draft.risk[k]; return fld(lab, `<span class="bl-two"><select data-rk="${k}" data-part="type"><option value="none" ${!v ? 'selected' : ''}>Sin ${lab.toLowerCase()}</option>${(k === 'tp' ? [['rr', 'Múltiplo del riesgo (R)'], ['atr', 'Múltiplos de ATR'], ['pct', '% del precio']] : [['atr', 'Múltiplos de ATR'], ['pct', '% del precio']]).map(([a, b]) => `<option value="${a}" ${v && v.type === a ? 'selected' : ''}>${b}</option>`).join('')}</select>${v ? `<input type="number" step="any" data-rk="${k}" data-part="v" value="${v.v}">` : ''}</span>`);
  };
  function editView() {
    const d = draft, hrs = d.filters.hoursUtc;
    root.innerHTML = head(draftMeta.id ? 'Nueva versión de la estrategia' : 'Constructor visual', draftMeta.id ? 'Se guarda como versión candidata; la principal no cambia hasta que tú lo apruebes' : 'Define las reglas; se probarán con datos históricos reales', draftMeta.id ? 'bot' : 'new') +
      `<div class="bl-box"><h4>General</h4><div class="bl-grid">${fld('Nombre', `<input type="text" data-p="name" value="${esc(d.name)}" maxlength="60">`)}${fld('Moneda', `<input type="text" data-p="symbol" list="blCoins" value="${esc(d.symbol)}"><datalist id="blCoins">${COINS.map(c => `<option value="${c}">`).join('')}</datalist>`)}${fld('Temporalidad', `<select data-p="interval">${INTS.map(i => `<option ${i === d.interval ? 'selected' : ''}>${i}</option>`).join('')}</select>`)}${fld('Operar en', `<select data-p="sides" data-re="op">${[['long', 'Solo compras (largos)'], ['short', 'Solo ventas (cortos)'], ['both', 'Compras y ventas']].map(([a, b]) => `<option value="${a}" ${d.sides === a ? 'selected' : ''}>${b}</option>`).join('')}</select>`)}</div></div>` +
      (d.sides !== 'short' ? listBlock('Entrada en COMPRA (se deben cumplir TODAS)', 'entry.long', 'Se evalúa al cierre de la vela; la orden simulada entra en la apertura de la siguiente.') + listBlock('Salida de la compra (basta UNA)', 'exit.long') : '') +
      (d.sides !== 'long' ? listBlock('Entrada en VENTA en corto (TODAS)', 'entry.short', 'El corto se simula sin tasas de financiación.') + listBlock('Salida del corto (basta UNA)', 'exit.short') : '') +
      `<div class="bl-box"><h4>Filtros de mercado</h4><div class="bl-grid">${fld('Volumen mínimo (× su media)', nin('filters.minVolRatio', 'min="0"'))}${fld('Volatilidad mínima (ATR % del precio)', nin('filters.minAtrPct', 'min="0"'))}${fld('Volatilidad máxima (ATR %)', nin('filters.maxAtrPct', 'min="0"'))}${fld('Horario UTC (opcional)', `<span class="bl-two"><input type="number" min="0" max="23" data-hr="0" value="${hrs ? hrs[0] : ''}" placeholder="desde"><input type="number" min="0" max="23" data-hr="1" value="${hrs ? hrs[1] : ''}" placeholder="hasta"></span>`)}</div><p class="bl-dim">0 = sin filtro.</p></div>` +
      `<div class="bl-box"><h4>Riesgo y capital</h4><div class="bl-grid">${fld('Capital inicial ($)', nin('risk.capital', 'min="10"'))}${fld('Riesgo por operación (% del capital)', nin('risk.riskPct', 'min="0.01" max="100"'))}${fld('Tamaño máximo (% del capital)', nin('risk.sizePct', 'min="1" max="100"'))}${lvl('sl', 'Stop loss')}${lvl('tp', 'Take profit')}${lvl('trail', 'Trailing stop')}${fld('Tiempo máximo (velas, 0 = sin límite)', nin('risk.maxBars', 'min="0"'))}${fld('Pérdida diaria máxima (%, 0 = sin límite)', nin('risk.maxDailyLossPct', 'min="0"'))}${fld('Drawdown máximo antes de parar (%, 0 = sin límite)', nin('risk.maxDrawdownPct', 'min="0"'))}</div></div>` +
      `<div class="bl-box"><h4>Costes simulados</h4><div class="bl-grid">${fld('Comisión por lado (%)', nin('costs.feePct', 'min="0" step="0.01"'))}${fld('Deslizamiento (%)', nin('costs.slipPct', 'min="0" step="0.01"'))}</div><p class="bl-dim">Sin apalancamiento. Los resultados incluyen estos costes.</p></div>
      <div id="blErr" class="bl-err" hidden></div><div class="bl-actions"><button class="bl-btn" data-a="saveDraft">${draftMeta.id ? 'Guardar como versión candidata y probar' : 'Crear bot y probar'}</button><button class="bl-btn ghost" data-a="showDesc">Ver reglas en texto</button></div><div id="blDesc"></div>`;
  }
  function onField(el) {
    if (view !== 'edit' || !draft) return;
    if (el.dataset.rk) { const k = el.dataset.rk, part = el.dataset.part; if (part === 'type') draft.risk[k] = el.value === 'none' ? null : {type: el.value, v: draft.risk[k] ? draft.risk[k].v : 2}; else draft.risk[k] = Object.assign({}, draft.risk[k], {v: +el.value}); return part === 'type' ? editView() : 0; }
    if (el.dataset.hr != null) { const a = $$('[data-hr]', root).map(x => x.value); draft.filters.hoursUtc = a[0] !== '' && a[1] !== '' ? [+a[0], +a[1]] : null; return; }
    const p = el.dataset.p; if (!p) return; let v = el.dataset.n ? +el.value : el.value; if (p === 'symbol') v = String(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (el.dataset.re === 'k') { const base = p.slice(0, -2), def = B.OPERANDS[v] || {}; setP(draft, base, Object.assign({k: v}, def.p || {})); return editView(); }
    setP(draft, p, v); if (el.dataset.re === 'op') editView();
  }
  function startDraft(spec, meta) { draft = JSON.parse(JSON.stringify(B.normalizeSpec(spec))); draftMeta = meta || {id: null, method: 'visual'}; view = 'edit'; render(); }
  function saveDraft() {
    const sp = B.normalizeSpec(draft), v = B.validateSpec(sp), er = $('#blErr');
    if (!v.ok) { er.hidden = false; er.innerHTML = '<b>Revisa esto antes de continuar:</b><ul>' + v.errors.map(e => `<li>${esc(e)}</li>`).join('') + '</ul>'; er.scrollIntoView({block: 'center'}); return; }
    if (draftMeta.id) { const b = getBot(draftMeta.id), nv = Math.max(...b.versions.map(x => x.v)) + 1; b.versions.push({v: nv, spec: sp, at: Date.now(), note: draftMeta.note || 'Editada en el constructor', origin: draftMeta.origin || 'usuario', state: 'candidata'}); log(b, 'versión', `Creada la versión v${nv} (candidata).`); touch(b); cur = b.id; tab = 'ver'; view = 'bot'; render(); runAndShow(b, nv); }
    else { const b = newBot(sp, draftMeta.method, draftMeta.desc); S.bots.push(b); touch(b); cur = b.id; tab = 'sum'; view = 'bot'; render(); runAndShow(b, 1); }
  }
  async function runAndShow(b, v, bars) {
    bars = bars || (runOf(b) && runOf(b).reqBars) || 3000; busyMsg = 'Descargando velas de Binance y ejecutando el backtest…'; render();
    try { await runBot(b, v, bars); busyMsg = ''; } catch (e) { busyMsg = ''; toast('No se pudo ejecutar el backtest: ' + (e.message || e)); log(b, 'error', 'Backtest fallido: ' + (e.message || e)); touch(b); }
    if (view === 'bot' && cur === b.id) render();
  }

  /* ----- Panel del bot ----- */
  const TABS = [['sum', 'Resumen'], ['gr', 'Gráficos'], ['rob', 'Robustez'], ['diary', 'Diario'], ['ver', 'Versiones'], ['pap', 'Paper trading'], ['cic', 'Reentrenar'], ['ai', 'Asistente'], ['est', 'Estrategia']];
  const metric = (l, v, c, tip) => `<div class="bl-m ${c || ''}" ${tip ? `title="${esc(tip)}"` : ''}><small>${l}</small><b>${v}</b></div>`;
  function botView() {
    const b = bot(); if (!b) { view = 'lib'; return render(); } const sp = mainSpec(b), run = runOf(b);
    root.innerHTML = head(b.name, `${sp.symbol} · ${sp.interval} · v${b.mainV} · ${ST[b.status] || ''}`, 'lib') + `<div class="bl-actions"><button class="bl-chip-btn ${marksOn ? 'on' : ''}" data-a="chartToggle">${marksOn ? 'Ocultar del gráfico' : 'Mostrar bot en el gráfico'}</button></div>` +
      (busyMsg ? `<div class="bl-busy"><span class="bl-spin"></span>${esc(busyMsg)}</div>` : '') + (marksOn ? replayBar() : '') +
      `<div class="bl-tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" class="${tab === k ? 'on' : ''}" data-a="tab" data-k="${k}">${l}</button>`).join('')}</div><div id="blTab"></div>`;
    ({sum: tabSum, gr: tabGr, rob: tabRob, diary: tabDiary, ver: tabVer, pap: tabPap, cic: tabCic, ai: tabAi, est: tabEst}[tab] || tabSum)(b, run);
  }
  const verdictChip = v => `<span class="bl-verdict v-${v.level}">${esc({insuficiente: 'Muestra insuficiente', pierde: 'Pierde en el histórico', consistente: 'Consistente fuera de muestra', 'no-confirmada': 'No confirmada fuera de muestra'}[v.level] || v.level)}</span>`;
  function segTable(r) {
    const rows = [['train', 'Entrenamiento (60 %)', 'En muestra'], ['val', 'Validación (20 %)', 'Fuera de muestra'], ['test', 'Prueba (20 %)', 'Fuera de muestra']];
    return `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Tramo</th><th>Periodo</th><th>Op.</th><th>Neto</th><th>Aciertos</th><th>F. benef.</th><th>DD</th></tr></thead><tbody>${rows.map(([k, n, tag]) => { const s = r.segments[k]; return `<tr><td>${n}<br><small class="bl-dim">${tag}</small></td><td>${dd(s.from)} – ${dd(s.to)}</td><td>${s.n}</td><td class="${cls(s.net)}">${money(s.net)}</td><td>${s.winRate == null ? '—' : num(s.winRate, 0) + ' %'}</td><td>${pf(s)}</td><td>${num(s.maxDDPct, 1)} %</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function tabSum(b, run) {
    const T = $('#blTab'), vs = b.versions.filter(v => v.state !== 'descartada');
    const ctl = `<div class="bl-box"><div class="bl-runbar"><label>Versión<select id="blRunV">${vs.map(v => `<option value="${v.v}" ${v.v === b.mainV ? 'selected' : ''}>v${v.v}${v.v === b.mainV ? ' (principal)' : ' (' + v.state + ')'}</option>`).join('')}</select></label><label>Historial<select id="blRunBars">${[[1000, '1.000 velas'], [3000, '3.000 velas'], [6000, '6.000 velas']].map(([n, l]) => `<option value="${n}" ${((run && run.reqBars) || 3000) === n ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button class="bl-btn" data-a="run" ${busyMsg ? 'disabled' : ''}>${run ? 'Volver a probar' : 'Ejecutar backtest'}</button></div></div>`;
    if (!run) { T.innerHTML = ctl + `<div class="bl-empty"><p><b>Este bot todavía no tiene resultados.</b></p><p class="bl-dim">Pulsa «Ejecutar backtest» para probarlo con velas cerradas reales de Binance. No mostramos números hasta que existan.</p></div>`; return; }
    const m = run.metrics, x = run.ext || {}, bh = run.buyHold, dur = x.avgBars != null ? x.avgBars * (B.IV_MS[run.interval] || 0) : null;
    const durTxt = dur ? (dur >= 864e5 ? num(dur / 864e5, 1) + ' d' : dur >= 36e5 ? num(dur / 36e5, 1) + ' h' : num(dur / 6e4, 0) + ' min') : '—';
    T.innerHTML = ctl + `<div class="bl-box"><div class="bl-vrow">${verdictChip(run.verdict)}<small class="bl-dim">v${run.v} · ${run.bars} velas ${run.interval} · ${dd(run.from)} – ${dd(run.to)}</small></div><p>${esc(run.verdict.text)}</p>${(run.warnings || []).map(w => note('⚠ ' + w, 'warn')).join('')}${run.halted ? note('⚠ El módulo de riesgo detuvo el bot: ' + run.halted, 'warn') : ''}</div>
      <div class="bl-metrics">${metric('Resultado neto', money(m.net), cls(m.net))}${metric('Rendimiento', pct(m.retPct), cls(m.retPct))}${metric('Operaciones', m.n)}${metric('Tasa de aciertos', m.winRate == null ? '—' : num(m.winRate, 1) + ' %')}${metric('Factor de beneficio', pf(m), '', 'Ganancias brutas ÷ pérdidas brutas')}${metric('Expectativa por op.', money(m.expectancy))}${metric('Ganancia media', money(m.avgWin), 'pos')}${metric('Pérdida media', money(m.avgLoss == null ? null : -m.avgLoss), 'neg')}${metric('Ratio ganancia/pérdida', m.rr == null ? '—' : num(m.rr, 2))}${metric('Drawdown máximo', num(m.maxDDPct, 1) + ' %', 'neg', money(-m.maxDD))}${metric('Sharpe (diario, anualizado)', x.sharpe == null ? '—' : num(x.sharpe, 2), '', 'Necesita ≥ 20 días con datos')}${metric('Sortino', x.sortino == null ? '—' : num(x.sortino, 2))}${metric('Calmar (rend. ÷ DD)', m.maxDDPct > 0 ? num(m.retPct / m.maxDDPct, 2) : '—')}${metric('Exposición al mercado', num(m.exposurePct, 0) + ' %')}${metric('Duración media', durTxt)}${metric('Comisiones pagadas', money(-m.fees))}${metric('Racha ganadora máx.', x.maxWinStreak == null ? '—' : x.maxWinStreak)}${metric('Racha perdedora máx.', x.maxLossStreak == null ? '—' : x.maxLossStreak)}${metric('Mejor operación', money(x.best), 'pos')}${metric('Peor operación', money(x.worst), 'neg')}${metric('Días ganadores', run.daily.pos, 'pos')}${metric('Días perdedores', run.daily.neg, 'neg')}${metric('Días sin operar', run.daily.flat)}</div>
      <div class="bl-box"><h4>Comparación con comprar y mantener</h4><div class="bl-cmp2"><div><small>Este bot</small><b class="${cls(m.retPct)}">${pct(m.retPct)}</b><small>DD ${num(m.maxDDPct, 1)} %</small></div><div><small>Comprar y mantener</small><b class="${cls(bh.retPct)}">${pct(bh.retPct)}</b><small>DD ${num(bh.maxDDPct, 1)} %</small></div></div>${note(m.retPct > bh.retPct ? 'Supera a comprar y mantener en este periodo.' : 'No supera a comprar y mantener en este periodo.')}</div>
      <div class="bl-box"><h4>Validación por tramos</h4>${note('El bot no se ajusta con estos datos (aún no hay optimizador): los tramos muestran si el resultado se sostiene en el tiempo. Solo validación y prueba cuentan como fuera de muestra.')}${segTable(run)}</div>`;
  }
  function tabGr(b, run) {
    const T = $('#blTab'); if (!run || !run.equity.length) { T.innerHTML = `<div class="bl-empty"><p><b>Sin gráficos todavía.</b></p><p class="bl-dim">${run ? 'El detalle de curvas solo se conserva para las 3 pruebas más recientes; vuelve a ejecutar el backtest.' : 'Ejecuta un backtest para generar datos reales.'}</p></div>`; return; }
    T.innerHTML = chartBox('c1', '1 · Curva de capital vs comprar y mantener', 190) + chartBox('c2', '2 · Drawdown (%)', 130) +
      `<div class="bl-chart"><div class="bl-h4row"><h4>3 · Rendimiento por periodo</h4><select id="blPer"><option value="d">Diario</option><option value="w">Semanal</option><option value="m">Mensual</option></select></div>${note('Suma simple de rendimientos diarios (aproximación).')}<canvas id="c3" data-h="150" style="width:100%;height:150px"></canvas></div>` +
      chartBox('c4', '4 · Distribución de ganancias y pérdidas por operación ($)', 140) + chartBox('c5', '5 · Resultado por horario de entrada (UTC)', 130) + chartBox('c6', '6 · Resultado según tendencia (EMA 200)', 130) + chartBox('c7', '7 · Resultado según volatilidad', 130) + chartBox('c8', '8 · Entrenamiento / validación / prueba (rendimiento %)', 130, 'Si cae en validación y prueba, es señal de sobreajuste.') + chartBox('c9', '9 · Comparación de versiones (rendimiento %)', 130) + chartBox('c10', '10 · Resultado por lado (compras vs ventas)', 120);
    const ar = a => a.map(p => [p[0], p[1]]); const eq = run.equity.map(p => [p[0], p[1]]);
    lineChart($('#c1'), [{pts: eq, color: '#4c8dff', w: 1.8, fill: 1}].concat(run.bh && run.bh.length ? [{pts: run.bh, color: '#8a93a6', dash: [4, 3], w: 1.2}] : []), {yfmt: v => '$' + num(v, 0)});
    let pk = -Infinity; lineChart($('#c2'), [{pts: eq.map(p => { pk = Math.max(pk, p[1]); return [p[0], -(pk - p[1]) / pk * 100]; }), color: '#f31260', fill: 1}], {zero: 1, yfmt: v => num(v, 0) + '%'});
    const per = () => { const k = $('#blPer').value, d = (run.ext && run.ext.dailyRet) || []; if (!d.length) return []; if (k === 'd') return d.slice(-30).map(p => ({v: p[1], label: dd(p[0]).slice(0, 6)})); const m = new Map(); for (const p of d) { const dt = new Date(p[0]), key = k === 'm' ? dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') : String(Math.floor((p[0] / 864e5 + 3) / 7)); m.set(key, (m.get(key) || 0) + p[1]); } return [...m].slice(-16).map(([key, v]) => ({v, label: k === 'm' ? key.slice(2) : 'S' + key.slice(-2)})); };
    const dr = () => barChart($('#c3'), per(), {yfmt: v => num(v, 1) + '%'}); dr(); $('#blPer').onchange = dr;
    const tr = run.trades; if (tr.length) { const nets = tr.map(t => t.net), lo = Math.min(...nets), hi = Math.max(...nets), nb = 12, w = (hi - lo) / nb || 1, bins = Array.from({length: nb}, (_, i) => ({v: 0, label: num(lo + w * i, 0), color: lo + w * (i + .5) >= 0 ? '#17c964' : '#f31260'})); nets.forEach(x => bins[Math.min(nb - 1, Math.floor((x - lo) / w))].v++); barChart($('#c4'), bins, {yfmt: v => num(v, 0)}); } else barChart($('#c4'), []);
    const bd = run.breakdown || {}, bar = o => Object.entries(o || {}).map(([k, v]) => ({v: v.net, label: k, sub: v.n + ' op.'})); barChart($('#c5'), bar(bd.hour).sort((a, b) => a.label - b.label).map(x => ({...x, label: x.label + 'h'})), {yfmt: v => '$' + num(v, 0)}); barChart($('#c6'), bar(bd.trend), {yfmt: v => '$' + num(v, 0)}); barChart($('#c7'), bar(bd.vol), {yfmt: v => '$' + num(v, 0)});
    barChart($('#c8'), ['train', 'val', 'test'].map(k => ({v: run.segments[k].retPct, label: {train: 'Entren.', val: 'Valid.', test: 'Prueba'}[k], sub: run.segments[k].n + ' op.'})), {yfmt: v => num(v, 1) + '%'});
    barChart($('#c9'), b.versions.map(v => { const r = runOf(b, v.v); return r ? {v: r.metrics.retPct, label: 'v' + v.v, sub: v.v === b.mainV ? 'principal' : ''} : null; }).filter(Boolean), {yfmt: v => num(v, 1) + '%'});
    barChart($('#c10'), bar(bd.side).map(x => ({...x, label: x.label === 'long' ? 'Compras' : 'Ventas'})), {yfmt: v => '$' + num(v, 0)});
  }
  const SWEEP_COINS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'], SWEEP_INTS = ['15m', '1h', '4h'];
  function tabRob(b, run) {
    const T = $('#blTab'), sw = b.sweeps && b.sweeps.rows;
    T.innerHTML = `<div class="bl-box"><h4>Análisis por criptomoneda y temporalidad</h4>${note('Prueba la MISMA estrategia, sin cambiar nada, en otras monedas y temporalidades. Una estrategia sólida no depende de una sola moneda.')}<button class="bl-btn" data-a="sweep" ${busyMsg ? 'disabled' : ''}>Ejecutar análisis de robustez (${SWEEP_COINS.length + SWEEP_INTS.length - 1} pruebas)</button></div>` +
      (sw ? `<div class="bl-box"><small class="bl-dim">Ejecutado ${dt(b.sweeps.at)} · ${b.sweeps.bars} velas por prueba · v${b.sweeps.v}</small><div class="bl-scroll"><table class="bl-t"><thead><tr><th>Moneda</th><th>TF</th><th>Op.</th><th>Rend.</th><th>Comprar y mant.</th><th>DD</th><th>Aciertos</th></tr></thead><tbody>${sw.map(r => r.err ? `<tr><td>${esc(r.symbol)}</td><td>${r.interval}</td><td colspan="5" class="bl-dim">${esc(r.err)}</td></tr>` : `<tr><td>${esc(r.symbol.replace('USDT', ''))}</td><td>${r.interval}</td><td>${r.n}</td><td class="${cls(r.retPct)}">${pct(r.retPct)}</td><td class="${cls(r.bh)}">${pct(r.bh)}</td><td>${num(r.dd, 1)} %</td><td>${r.win == null ? '—' : num(r.win, 0) + ' %'}</td></tr>`).join('')}</tbody></table></div>${(() => { const ok = sw.filter(r => !r.err && r.n >= 10), pos = ok.filter(r => r.retPct > 0); return note(ok.length ? `Positiva en ${pos.length} de ${ok.length} pruebas con ≥ 10 operaciones. ${pos.length / ok.length < .5 ? 'Funciona en pocos mercados: probable ajuste a un caso concreto.' : 'Resultado más sólido si se mantiene en la mayoría.'}` : 'Pocas operaciones por prueba: no se puede concluir.'); })()}</div>` : '') +
      (run ? `<div class="bl-box"><h4>Costes: sensibilidad</h4>${note('Rendimiento de la última prueba con costes más altos. Si desaparece, la ventaja era frágil.')}<button class="bl-mini" data-a="costs">Probar con el doble de comisión y deslizamiento</button><div id="blCosts"></div></div>` : '');
  }
  async function doSweep(b) {
    const sp = mainSpec(b), bars = (runOf(b) && runOf(b).reqBars) || 3000, jobs = [...SWEEP_COINS.map(s => [s, sp.interval]), ...SWEEP_INTS.filter(i => i !== sp.interval).map(i => [sp.symbol, i])], rows = [];
    for (let i = 0; i < jobs.length; i++) { busyMsg = `Analizando ${jobs[i][0]} ${jobs[i][1]} (${i + 1}/${jobs.length})…`; if (view === 'bot') render(); const [symbol, interval] = jobs[i];
      try { const res = await execute(Object.assign({}, sp, {symbol, interval}), Math.min(bars, 3000)); rows.push({symbol, interval, n: res.metrics.n, retPct: res.metrics.retPct, bh: res.buyHold.retPct, dd: res.metrics.maxDDPct, win: res.metrics.winRate}); } catch (e) { rows.push({symbol, interval, err: String(e.message || e).slice(0, 80)}); } }
    b.sweeps = {at: Date.now(), bars: Math.min(bars, 3000), v: b.mainV, rows}; busyMsg = ''; log(b, 'robustez', `Análisis en ${rows.length} mercados: positiva en ${rows.filter(r => !r.err && r.retPct > 0).length}.`); touch(b); if (view === 'bot') render();
  }
  function tabDiary(b, run) {
    const T = $('#blTab'), tr = run ? run.trades.slice().reverse() : [];
    const av = run && run.avoid || [], avBy = {}; for (const z of av) avBy[z[1]] = (avBy[z[1]] || 0) + 1;
    T.innerHTML = `<div class="bl-box"><h4>Diario de operaciones</h4>${run ? note(`${run.tradesTotal} operaciones en el backtest v${run.v}${run.tradesTotal > run.trades.length ? ` (se guardan las últimas ${run.trades.length})` : ''}. Toca una para verla en el gráfico.`) : note('Sin operaciones: ejecuta un backtest.')}${tr.length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Entrada</th><th></th><th>Precio</th><th>Salida</th><th>Neto</th><th>Motivo</th><th></th></tr></thead><tbody>${tr.slice(0, 120).map((t, i) => `<tr><td>${dt(t.entryT)}</td><td>${t.side === 'long' ? 'Compra' : 'Venta'}</td><td>${num(t.entry, 4)}→${num(t.exit, 4)}</td><td>${t.open ? 'abierta' : dt(t.exitT)}</td><td class="${cls(t.net)}">${money(t.net)}</td><td class="bl-why" title="${esc(t.reasonIn || '')}">${esc(t.why || '')}</td><td><button class="bl-mini" data-a="seeTrade" data-i="${run.trades.length - 1 - i}">Ver</button></td></tr>`).join('')}</tbody></table></div>` : ''}</div>
      ${av.length ? `<div class="bl-box"><h4>Señales descartadas</h4>${note('Veces que las reglas pedían entrar y no se entró (últimas ' + av.length + '):')}<ul class="bl-log">${Object.entries(avBy).map(([k, n]) => `<li>${esc(k)}: <b>${n}</b></li>`).join('')}</ul></div>` : ''}<div class="bl-box"><h4>Historial del bot</h4><ul class="bl-log">${b.journal.slice().reverse().slice(0, 60).map(j => `<li><small>${dt(j.t)} · ${esc(j.kind)}</small><br>${esc(j.text)}</li>`).join('')}</ul></div>`;
  }
  function cmpRows(a, bb) { return a && bb ? [['Rendimiento', pct(a.metrics.retPct), pct(bb.metrics.retPct)], ['Drawdown', num(a.metrics.maxDDPct, 1) + ' %', num(bb.metrics.maxDDPct, 1) + ' %'], ['Operaciones', a.metrics.n, bb.metrics.n], ['F. de beneficio', pf(a.metrics), pf(bb.metrics)], ['Validación', pct(a.segments.val.retPct), pct(bb.segments.val.retPct)], ['Prueba', pct(a.segments.test.retPct), pct(bb.segments.test.retPct)]] : []; }
  function worse(c, m) { return c.segments.test.retPct < m.segments.test.retPct || c.metrics.maxDDPct > m.metrics.maxDDPct * 1.25 || c.segments.val.retPct < m.segments.val.retPct; }
  function tabVer(b) {
    const T = $('#blTab'), main = runOf(b);
    T.innerHTML = `<div class="bl-box">${note('La versión principal nunca se reemplaza sola. Una candidata solo pasa a principal si tú lo decides, y si es peor fuera de muestra se te avisa.')}</div>` + b.versions.slice().reverse().map(v => { const r = runOf(b, v.v), isMain = v.v === b.mainV;
      return `<div class="bl-box bl-ver ${v.state}"><div class="bl-card-t"><b>v${v.v}</b><span class="bl-chip">${isMain ? 'principal' : v.state}</span></div><small class="bl-dim">${dt(v.at)} · ${esc(v.origin)} · ${esc(v.note || '')}</small>${r ? `<div class="bl-card-s"><span class="${cls(r.metrics.retPct)}">${pct(r.metrics.retPct)}</span> · ${r.metrics.n} op. · DD ${num(r.metrics.maxDDPct, 1)} % · valid. ${pct(r.segments.val.retPct)} · prueba ${pct(r.segments.test.retPct)}</div>` : note('Sin backtest.')}
        ${!isMain && r && main ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th></th><th>Principal v${b.mainV}</th><th>v${v.v}</th></tr></thead><tbody>${cmpRows(main, r).map(x => `<tr><td>${x[0]}</td><td>${x[1]}</td><td>${x[2]}</td></tr>`).join('')}</tbody></table></div>${worse(r, main) ? note('⚠ Esta versión es peor que la principal en alguna métrica fuera de muestra o de riesgo.', 'warn') : ''}` : ''}
        <div class="bl-card-b"><button class="bl-mini" data-a="vrun" data-v="${v.v}">Probar</button>${isMain ? '' : `<button class="bl-mini" data-a="vmain" data-v="${v.v}">${v.state === 'descartada' || v.v < b.mainV ? 'Restaurar como principal' : 'Hacer principal'}</button>`}${v.state === 'candidata' ? `<button class="bl-mini danger" data-a="vdisc" data-v="${v.v}">Descartar</button>` : ''}<button class="bl-mini" data-a="vedit" data-v="${v.v}">Editar copia</button></div></div>`; }).join('');
  }
  function tabEst(b) {
    const sp = mainSpec(b); $('#blTab').innerHTML = `<div class="bl-box"><h4>Reglas exactas de la versión principal (v${b.mainV})</h4>${mdLite(B.describeSpec(sp))}<div class="bl-actions"><button class="bl-btn" data-a="vedit" data-v="${b.mainV}">Editar (crea versión candidata)</button></div></div>${note('Los indicadores Nova se usan en solo lectura: el bot nunca los modifica.')}`;
  }



  /* ----- Paper trading (simulación hacia adelante; sin órdenes reales) ----- */
  const PP = () => window.CCTBotPaper;
  function trimLedger(sess) { const L = sess.ledger; for (let i = 0; i < L.length - 300; i++) { delete L[i].reasonIn; delete L[i].ctx; delete L[i].sl; delete L[i].tp; } }
  async function paperStep(b, sess) {
    const uo = userOps(sess.spec), ropts = {nova: window.NovaNexus, user: null, gate: window.CCTBotRisk ? window.CCTBotRisk.gateFor(S.risk, allSessions(), Date.now())(sess) : null};
    const getC = async (sym, itv, count) => { const C = await H.history(sym, itv, count); if (uo.length) { const user = {}; for (const sid of [...new Set(uo.map(x => x.sid))]) { const res = await H.runPine(sid, sym, itv, C); if (!res || !res.ok) throw new Error('Tu indicador falló: ' + ((res && res.error && res.error.msg) || '')); const src = window.CCTBotOpt.extractSources(res, C.length); for (const x of uo.filter(y => y.sid === sid)) { const f = src.find(q => q.src === x.src); if (!f) throw new Error('Tu indicador ya no produce la señal «' + (x.sl || x.src) + '»'); user[sid + '|' + x.src] = f.series; } } ropts.user = user; } return C; };
    const before = sess.ledger.length, r = await PP().step(sess, getC, ropts); if (r.changed) { trimLedger(sess); for (const t of sess.ledger.slice(before)) log(b, 'paper', `Paper v${sess.v}: ${t.side === 'long' ? 'compra' : 'venta'} cerrada ${t.net >= 0 ? '+' : '−'}$${num(Math.abs(t.net), 2)} · ${t.why || ''}`); } sess.checkedAt = Date.now(); touch(b); return r;
  }
  const paperBusy = new Set();
  async function paperUpdate(b, sess, quiet) {
    if (paperBusy.has(sess.id)) return; paperBusy.add(sess.id);
    try { await paperStep(b, sess); sess.err = null; } catch (e) { sess.err = String(e.message || e); if (!quiet) toast('Paper trading: ' + sess.err); touch(b); }
    paperBusy.delete(sess.id); if (view === 'bot' && tab === 'pap' && cur === b.id) render();
  }
  function paperTick(force) { // pone al día las sesiones activas cuando cierra una vela nueva
    if (!H.history || !desk()) return; const now = Date.now(); riskTick();
    for (const b of S.bots) for (const s of b.paper || []) { if (s.status !== 'running') continue; const iv = B.IV_MS[s.spec.interval]; if (force || !s.last || now >= s.last.t + 2 * iv) paperUpdate(b, s, true); }
  }
  function tabPap(b) {
    const T = $('#blTab'), ss = b.paper || [], vs = b.versions.filter(v => v.state !== 'descartada');
    T.innerHTML = `<div class="bl-box"><h4>Nueva sesión de paper trading</h4>${note('Prueba hacia adelante con capital virtual: el bot opera con velas que cierran DESPUÉS de empezar, con comisiones y deslizamiento. No envía órdenes reales ni toca fondos. Es la prueba que un backtest no puede dar. Congela la versión elegida; la sesión empieza plana.')}
      <div class="bl-grid">${fld('Versión a probar', `<select id="papV">${vs.map(v => `<option value="${v.v}" ${v.v === b.mainV ? 'selected' : ''}>v${v.v} ${v.v === b.mainV ? '(principal)' : '(' + v.state + ')'}</option>`).join('')}</select>`)}${fld('Capital virtual ($)', `<input id="papCap" type="number" min="100" step="100" value="${mainSpec(b).risk.capital}">`)}</div>
      <div class="bl-actions"><button class="bl-btn" data-a="papStart">Iniciar paper trading</button></div>${note('Se actualiza al abrir el laboratorio y cada vez que cierra una vela mientras lo tienes abierto; al volver después de días se pone al día con las velas reales. Con la cuenta iniciada y el flujo de GitHub «Paper trading de bots» activo, también avanza cada hora sin la app abierta.')}</div>` +
      (ss.length ? ss.slice().reverse().map(s => paperCard(b, s)).join('') : `<div class="bl-empty"><p><b>Sin sesiones todavía.</b></p><p class="bl-dim">Inicia una para ver cómo se comporta el bot en vivo, sin riesgo.</p></div>`);
    setTimeout(() => paperTick(), 50); ss.forEach(s => { const cv = $('#pc' + s.id); if (cv && s.curve.length > 1) lineChart(cv, [{pts: s.curve, color: '#4c8dff', w: 1.8, fill: 1}], {yfmt: v => '$' + num(v, 0)}); });
  }
  function paperCard(b, s) {
    const st = PP().stats(s), ok = PP().verify(s), bt = runOf(b, s.v), btm = bt && bt.metrics, per = Math.max(1, st.days);
    const chip = s.status === 'running' ? (s.halted ? 'Detenido por riesgo' : 'Simulando') : s.status === 'paused' ? 'Pausada' : 'Terminada';
    const drift = btm && st.n >= 20 && ((st.winRate != null && btm.winRate != null && Math.abs(st.winRate - btm.winRate) > 15) || (st.net < 0 && btm.net > 0)) ? note('⚠ El paper trading se está alejando de lo que mostró el backtest (aciertos o resultado). Revisa si el mercado cambió o si el backtest estaba sobreajustado.', 'warn') : '';
    return `<div class="bl-box bl-ver ${s.status === 'running' ? 'principal' : ''}"><div class="bl-card-t"><b>Paper · v${s.v} · ${esc(s.spec.symbol)} ${s.spec.interval}</b><span class="bl-chip s-${s.status === 'running' ? 'tested' : 'paused'}">${chip}</span></div><small class="bl-dim">Desde ${dt(s.startT)} · ${num(st.days, 1)} días · capital inicial ${money(s.capital)}${s.checkedAt ? ' · actualizado ' + dt(s.checkedAt) + (s.by === 'servidor' ? ' (servidor)' : '') : ''}</small>
      ${s.err ? note('⚠ ' + s.err, 'warn') : ''}${!ok ? note('⚠ El libro de operaciones no pasa la verificación de integridad (fue modificado).', 'warn') : ''}${(s.gaps || []).map(g => note(`⚠ ${g.why} (${dd(g.from)} – ${dd(g.to)})`, 'warn')).join('')}${(s.notes || []).map(n => note('⚠ ' + n.text, 'warn')).join('')}
      <div class="bl-metrics">${metric('Capital actual', money(st.equity), cls(st.net))}${metric('Resultado', pct(st.retPct), cls(st.net))}${metric('Operaciones cerradas', st.nClosed)}${metric('Aciertos', st.winRate == null ? '—' : num(st.winRate, 0) + ' %')}${metric('Factor de beneficio', pf(st))}${metric('Drawdown', num(st.maxDDPct, 1) + ' %', 'neg')}${metric('Expectativa por op.', money(st.expectancy))}${metric('Comisiones', money(-st.fees))}</div>
      ${s.open ? `<div class="bl-prop"><b>Posición abierta</b> · ${s.open.side === 'long' ? 'Compra' : 'Venta'} desde ${dt(s.open.entryT)} a ${num(s.open.entry, 4)}${isFinite(s.open.sl) ? ' · SL ' + num(s.open.sl, 4) : ''}${isFinite(s.open.tp) ? ' · TP ' + num(s.open.tp, 4) : ''} · no realizado <b class="${cls(s.open.unreal)}">${money(s.open.unreal)}</b> (estimado con comisión de salida)${s.open.reasonIn ? `<br><small class="bl-dim">${esc(s.open.reasonIn)}</small>` : ''}</div>` : (s.status === 'running' ? note('Sin posición abierta: esperando señal.') : '')}
      ${s.curve.length > 1 ? `<div class="bl-chart"><h4>Curva de capital virtual</h4><canvas id="pc${s.id}" data-h="140" style="width:100%;height:140px"></canvas></div>` : ''}
      ${btm ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Backtest v${s.v} vs paper</th><th>Backtest</th><th>Paper</th></tr></thead><tbody><tr><td>Aciertos</td><td>${btm.winRate == null ? '—' : num(btm.winRate, 0) + ' %'}</td><td>${st.winRate == null ? '—' : num(st.winRate, 0) + ' %'}</td></tr><tr><td>Expectativa por op.</td><td>${money(btm.expectancy)}</td><td>${money(st.expectancy)}</td></tr><tr><td>Operaciones por día</td><td>${num(btm.n / Math.max(1, btm.days), 2)}</td><td>${num(st.nClosed / per, 2)}</td></tr><tr><td>Drawdown</td><td>${num(btm.maxDDPct, 1)} %</td><td>${num(st.maxDDPct, 1)} %</td></tr></tbody></table></div>${drift}` : note('Esta versión aún no tiene backtest para comparar.')}
      ${s.ledger.length ? `<details><summary class="bl-dim">Libro de operaciones (${s.ledger.length})</summary><div class="bl-scroll"><table class="bl-t"><thead><tr><th>#</th><th>Entrada</th><th></th><th>Precio</th><th>Neto</th><th>Motivo</th></tr></thead><tbody>${s.ledger.slice(-60).reverse().map(t => `<tr><td>${t.n}</td><td>${dt(t.entryT)}</td><td>${t.side === 'long' ? 'Compra' : 'Venta'}</td><td>${num(t.entry, 4)}→${num(t.exit, 4)}</td><td class="${cls(t.net)}">${money(t.net)}</td><td class="bl-why">${esc(t.why || '')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      <div class="bl-card-b"><button class="bl-mini" data-a="papUpd" data-id="${s.id}" ${s.status !== 'running' ? 'disabled' : ''}>Actualizar ahora</button>${s.status === 'running' ? `<button class="bl-mini" data-a="papPause" data-id="${s.id}">Pausar</button>` : s.status === 'paused' ? `<button class="bl-mini" data-a="papResume" data-id="${s.id}">Reanudar</button>` : ''}${s.status !== 'stopped' ? `<button class="bl-mini danger" data-a="papStop" data-id="${s.id}">Terminar</button>` : ''}</div></div>`;
  }

  /* ----- Panel de riesgo independiente (cartera) ----- */
  const allSessions = () => S.bots.flatMap(b => (b.status === 'archived' ? [] : b.paper || []));
  const RK = () => window.CCTBotRisk;
  function riskTick() { // detecta cambios de estado del riesgo global y los deja en el registro
    if (!RK()) return; const r = S.risk = RK().norm(S.risk), p = RK().portfolio(allSessions(), r, Date.now()), rules = p.breaches.map(b => b.rule).join(','); let ch = false;
    if (p.sessions && p.equity > (r.peak || 0)) { r.peak = p.equity; ch = true; }
    if ((r.lastRules || '') !== rules) { r.log.push({t: Date.now(), text: p.breaches.length ? 'ENTRADAS BLOQUEADAS: ' + p.breaches.map(b => b.text).join(' · ') : 'Riesgo normal: entradas permitidas de nuevo'}); if (r.log.length > 60) r.log.shift(); r.lastRules = rules; ch = true; }
    if (ch) { r.updatedAt = Date.now(); save(); } return p;
  }
  function riskView() {
    const r = S.risk = RK().norm(S.risk), p = riskTick(), run = allSessions().filter(s => s.status === 'running');
    const inp = (k, lab, hint) => fld(lab, `<input type="number" min="0" step="any" data-rk2="${k}" value="${r[k] || ''}" placeholder="0 = sin límite">`);
    root.innerHTML = head('Panel de riesgo', 'Vigila todos tus bots a la vez y puede vetar entradas nuevas', 'lib') +
      `<div class="bl-box ${p.blocked ? 'bl-alert' : ''}"><div class="bl-vrow"><span class="bl-verdict ${p.blocked ? 'v-pierde' : 'v-consistente'}">${p.blocked ? 'Entradas BLOQUEADAS' : 'Riesgo dentro de los límites'}</span></div>${p.breaches.map(b => `<p class="neg">${esc(b.text)}</p>`).join('')}${note('El módulo es independiente de cada bot: solo veta entradas NUEVAS en paper trading; nunca cierra posiciones ni cambia versiones. Aún no existen órdenes reales.')}</div>
      <div class="bl-metrics">${metric('Sesiones activas', p.sessions)}${metric('Capital virtual', money(p.capital))}${metric('Patrimonio', money(p.equity), cls(p.equity - p.capital))}${metric('Resultado de hoy', pct(p.dayPct, 2), cls(p.dayPnl))}${metric('Drawdown total', num(p.dd, 2) + ' %', 'neg')}${metric('Posiciones abiertas', p.openN)}${metric('Exposición total', num(p.expo, 0) + ' %')}</div>
      <div class="bl-box"><h4>Límites globales</h4><div class="bl-grid">${inp('maxDailyLossPct', 'Pérdida diaria total máxima (%)')}${inp('maxDrawdownPct', 'Drawdown total máximo (%)')}${inp('maxOpen', 'Posiciones abiertas máximas')}${inp('maxExposurePct', 'Exposición total máxima (% del capital)')}</div>
        <label class="bl-chk" style="margin-top:8px"><input type="checkbox" id="rkKill" ${r.kill ? 'checked' : ''}> <span><b>Interruptor de emergencia</b>: bloquear TODAS las entradas nuevas</span></label>
        <div class="bl-actions"><button class="bl-mini" data-a="rkPeak">Reiniciar el pico de patrimonio</button></div>${note('Se evalúa cada vez que se actualiza una sesión (app o servidor), no dentro de la vela, y no puede bloquear con efecto retroactivo velas procesadas en una puesta al día. El drawdown usa el pico de patrimonio registrado al actualizar.')}</div>
      <div class="bl-box"><h4>Sesiones vigiladas</h4>${run.length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Bot</th><th>Mercado</th><th>Posición</th><th>Patrimonio</th></tr></thead><tbody>${S.bots.flatMap(b => (b.paper || []).filter(s => s.status === 'running' && b.status !== 'archived').map(s => `<tr><td>${esc(b.name)} v${s.v}</td><td>${esc(s.spec.symbol)} ${s.spec.interval}</td><td>${s.open ? (s.open.side === 'long' ? 'Compra' : 'Venta') + ' · ' + money(s.open.entry * s.open.qty) : '—'}</td><td>${money(s.cash + (s.open ? s.open.unreal : 0))}</td></tr>`)).join('')}</tbody></table></div>` : note('No hay sesiones de paper trading activas.')}</div>
      <div class="bl-box"><h4>Registro de eventos de riesgo</h4>${r.log.length ? `<ul class="bl-log">${r.log.slice().reverse().slice(0, 25).map(x => `<li><small>${dt(x.t)}</small><br>${esc(x.text)}</li>`).join('')}</ul>` : note('Sin eventos todavía.')}</div>`;
  }
  /* ----- Reentrenamiento: ciclo automático (servidor) + optimizar ahora (navegador) ----- */
  const CYC = {enabled: false, everyHours: 24, bars: 4000};
  const cyc = b => b.cycle || (b.cycle = Object.assign({}, CYC));
  function pathLabel(spec, path) {
    const fx = {'risk.sl.v': 'Stop loss', 'risk.tp.v': 'Take profit', 'risk.trail.v': 'Trailing stop', 'risk.maxBars': 'Tiempo máximo (velas)', 'filters.minVolRatio': 'Volumen mínimo', 'filters.minAtrPct': 'Volatilidad mínima', 'filters.maxAtrPct': 'Volatilidad máxima'}; if (fx[path]) return fx[path];
    const m = /^(entry|exit)\.(long|short)\.(\d+)\.(a|b)\.(\w+)$/.exec(path); if (!m) return path; const c = getP(spec, `${m[1]}.${m[2]}.${m[3]}`), o = c && c[m[4]]; if (o && o.k === 'num') { const ot = c[m[4] === 'a' ? 'b' : 'a']; return `Umbral de ${ot && B.OPERANDS[ot.k] ? short(B.OPERANDS[ot.k].label) : 'indicador'} (${m[1] === 'entry' ? 'entrada' : 'salida'} ${m[2] === 'long' ? 'compra' : 'venta'} #${+m[3] + 1})`; } return `${o && B.OPERANDS[o.k] ? short(B.OPERANDS[o.k].label) : 'Indicador'} (${m[1] === 'entry' ? 'entrada' : 'salida'} ${m[2] === 'long' ? 'compra' : 'venta'} #${+m[3] + 1}) · ${m[5] === 'n' ? 'periodo' : m[5] === 'd' ? 'desviaciones' : m[5]}`;
  }
  const decText = {propuesta: ['Propuesta lista para tu revisión', 'pos'], sin_mejora: ['Sin mejora comprobada: no se propone nada', ''], no_aplica: ['No aplicable', ''], error: ['No se pudo ejecutar', 'neg']};
  function resultCard(b, r, who) {
    if (!r) return '';
    if (r.status === 'error') return `<div class="bl-box"><h4>Último intento (${who})</h4><small class="bl-dim">${dt(r.at)}</small><p class="neg">${esc(r.reason || 'Error')}</p></div>`;
    const sp = mainSpec(b), d = decText[r.decision] || [r.decision, '']; const mo = r.monitor;
    return `<div class="bl-box"><h4>Último reentrenamiento (${who})</h4><small class="bl-dim">${dt(r.at)} · ${r.bars} velas ${esc(r.interval || '')} · sobre la v${r.v}</small>
      <div class="bl-vrow"><span class="bl-verdict ${r.decision === 'propuesta' ? 'v-consistente' : 'v-insuficiente'}">${esc(d[0])}</span></div>
      ${mo ? `<p class="bl-dim">Versión actual con datos recientes: ${pct(mo.retPct)} · ${mo.n} op. · DD ${num(mo.maxDDPct, 1)} % · validación ${pct(mo.val)} · prueba ${pct(mo.test)} (comprar y mantener ${pct(mo.buyHold)}).</p>` : ''}
      ${(r.reasons || []).length ? `<ul class="bl-log">${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${(r.changes || []).length ? `<h4>Cambios propuestos</h4><ul class="bl-log">${r.changes.map(c => `<li>${esc(pathLabel(sp, c.path))}: <b>${num(c.from, 2)}</b> → <b>${num(c.to, 2)}</b></li>`).join('')}</ul>` : ''}
      ${r.oos ? `<h4>Evidencia fuera de muestra</h4><p class="bl-dim">Procedimiento (ajustar con entrenamiento y medir en el tramo siguiente que no vio), ${r.oos.folds} tramos: candidata <b class="${cls(r.oos.cand.net)}">${money(r.oos.cand.net)}</b> (${r.oos.cand.n} op.) frente a la versión actual <b class="${cls(r.oos.base.net)}">${money(r.oos.base.net)}</b> (${r.oos.base.n} op.). Mejoró en ${r.oos.winsVsBase} de ${r.oos.folds}.</p>${r.holdout ? `<p class="bl-dim">Tramo reservado más reciente (${dd(r.holdout.from)} – ${dd(r.holdout.to)}, nunca usado para ajustar): candidata ${money(r.holdout.cand.net)} (${r.holdout.cand.n} op., DD ${num(r.holdout.cand.maxDDPct, 1)} %) · actual ${money(r.holdout.base.net)} (${r.holdout.base.n} op., DD ${num(r.holdout.base.maxDDPct, 1)} %).</p>` : ''}` : ''}
      ${(r.folds || []).length ? `<div class="bl-scroll"><table class="bl-t"><thead><tr><th>Tramo de prueba</th><th>Ajuste (solo entrenamiento)</th><th>Candidata</th><th>Actual</th></tr></thead><tbody>${r.folds.map(f => `<tr><td>${dd(f.testFrom)} – ${dd(f.testTo)}</td><td>${f.params.length ? f.params.map(c => `${esc(pathLabel(sp, c.path))} ${num(c.to, 2)}`).join('<br>') : 'sin cambios'}</td><td class="${cls(f.cand.net)}">${money(f.cand.net)} <small>(${f.cand.n})</small></td><td class="${cls(f.base.net)}">${money(f.base.net)} <small>(${f.base.n})</small></td></tr>`).join('')}</tbody></table></div>` : ''}
      ${r.decision === 'propuesta' ? note('La candidata se agregó en la pestaña Versiones. No reemplaza a la principal: pruébala y decide tú.') : ''}</div>`;
  }
  function tabCic(b) {
    const c = cyc(b), sv = b.server, lc = b.local, waiting = c.enabled && !sv && c.enabledAt && Date.now() - c.enabledAt > 48 * 36e5;
    $('#blTab').innerHTML = `<div class="bl-box"><h4>Ciclo de reentrenamiento automático</h4>${note('Cada día, un trabajo programado en GitHub Actions (no depende de que tengas la app abierta) descarga velas recientes, re-evalúa la versión principal y busca mejoras con validación walk-forward: ajusta solo con datos de entrenamiento y mide en tramos que no vio. Si no hay mejora comprobada, no propone nada. Nunca cambia la versión principal por sí solo.')}
      <label class="bl-chk"><input type="checkbox" id="cycOn" ${c.enabled ? 'checked' : ''}> Activar el ciclo automático para este bot</label>
      <div class="bl-grid" style="margin-top:8px">${fld('Frecuencia', `<select id="cycEvery">${[[24, 'Cada día'], [72, 'Cada 3 días'], [168, 'Cada semana']].map(([v, l]) => `<option value="${v}" ${c.everyHours === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}${fld('Historial', `<select id="cycBars">${[[2500, '2.500 velas'], [4000, '4.000 velas'], [6000, '6.000 velas']].map(([v, l]) => `<option value="${v}" ${c.bars === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>
      ${c.enabled ? (sv ? note(`Servidor: último resultado ${dt(sv.at)}.`) : waiting ? note('⚠ Aún no hay resultados del servidor. Revisa que el flujo «Reentrenar bots» esté activo en GitHub y que el secreto FIREBASE_SERVICE_ACCOUNT esté configurado (INSTALL.md → Reentrenamiento programado).', 'warn') : note('Esperando al primer ciclo del servidor (corre a diario; también se puede lanzar a mano en GitHub → Actions).')) : ''}
      ${!(H.cloud && H.cloud()) ? note('Inicia sesión para que el servidor pueda leer tus bots: sin cuenta solo funciona «Optimizar ahora».', 'warn') : ''}</div>
      <div class="bl-box"><h4>Optimizar ahora (en este navegador)</h4>${note('Misma lógica que el servidor, ejecutada aquí con las velas actuales. Ajusta stop loss, take profit, trailing, tiempo máximo, filtros de mercado, periodos de los indicadores, bandas de Bollinger y umbrales de RSI/ADX/volumen. NO toca el tamaño de la posición ni los parámetros de tus indicadores propios (su ajuste exigiría ejecutar tu script cientos de veces y multiplica el riesgo de sobreajuste). Tarda unos segundos.')}<div class="bl-actions"><button class="bl-btn" data-a="optNow" ${busyMsg ? 'disabled' : ''}>Optimizar ahora</button></div></div>` + resultCard(b, sv, 'servidor') + resultCard(b, lc, 'este navegador') +
      ((b.optHistory || []).length ? `<div class="bl-box"><h4>Historial de experimentos</h4><ul class="bl-log">${b.optHistory.slice().reverse().map(h => `<li><small>${dt(h.at)} · ${esc(h.who)}</small><br>${esc((decText[h.decision] || [h.decision])[0])}${h.oos != null ? ` · fuera de muestra: candidata ${money(h.oos)} vs actual ${money(h.base)}` : ''}</li>`).join('')}</ul></div>` : '');
  }
  function addCandidate(b, r, who) { // la propuesta entra como versión CANDIDATA: nunca reemplaza a la principal
    if (!r || r.decision !== 'propuesta' || !r.candidate) return false; const nv = Math.max(...b.versions.map(x => x.v)) + 1, sp = B.normalizeSpec(r.candidate); if (!B.validateSpec(sp).ok) return false;
    b.versions.push({v: nv, spec: sp, at: Date.now(), note: 'Reentrenamiento: ' + (r.changes || []).map(c => `${pathLabel(mainSpec(b), c.path)} ${num(c.from, 2)}→${num(c.to, 2)}`).join('; ').slice(0, 200), origin: who + ' (reentrenamiento)', state: 'candidata'}); log(b, 'reentrenamiento', `El ${who} propuso la v${nv} (candidata, pendiente de tu aprobación).`); return nv;
  }
  function noteHistory(b, r, who) { (b.optHistory = b.optHistory || []).push({at: r.at, who, decision: r.status === 'error' ? 'error' : r.decision, oos: r.oos ? r.oos.cand.net : null, base: r.oos ? r.oos.base.net : null}); if (b.optHistory.length > 12) b.optHistory.shift(); }
  function mergeServer(res) { // resultados del trabajo programado → bots (sin tocar versiones principales)
    let ch = false; for (const b of S.bots) { const r = res && res[b.id]; if (!r || (b.server && b.server.at === r.at)) continue; b.server = r; log(b, 'reentrenamiento', r.status === 'error' ? 'El servidor no pudo reentrenar: ' + r.reason : `Reentrenamiento del servidor: ${(decText[r.decision] || [r.decision])[0]}.`); noteHistory(b, r, 'servidor'); addCandidate(b, r, 'servidor'); ch = true; }
    if (ch) save(); return ch;
  }
  function mergePaper(paper) { // sesiones de paper trading avanzadas por el servidor: solo se adopta si continúa EXACTAMENTE el mismo libro (cadena de hashes) y avanzó
    if (!paper) return false; let ch = false;
    for (const b of S.bots) for (const sv of paper[b.id] || []) {
      const lo = (b.paper || []).find(x => x.id === sv.id); if (!lo || lo.status !== 'running') continue;
      const n = Math.min(lo.ledger.length, sv.ledger.length); let same = true; for (let i = 0; i < n; i++) if (lo.ledger[i].h !== sv.ledger[i].h) { same = false; break; }
      if (!same) { if (!lo.notes.some(x => /no coincide/.test(x.text))) lo.notes.push({t: Date.now(), text: 'El libro del servidor no coincide con el de este dispositivo: se conserva el de este dispositivo.'}); ch = true; continue; }
      if (sv.ledger.length > lo.ledger.length || (sv.ledger.length === lo.ledger.length && sv.last && (!lo.last || sv.last.t > lo.last.t))) {
        const news = sv.ledger.slice(lo.ledger.length); for (const k of ['ledger', 'cash', 'peak', 'anchorT', 'curve', 'open', 'last', 'gaps', 'notes', 'halted', 'err', 'checkedAt']) lo[k] = sv[k]; lo.by = 'servidor';
        for (const t of news) log(b, 'paper', `Paper v${lo.v} (servidor): ${t.side === 'long' ? 'compra' : 'venta'} cerrada ${t.net >= 0 ? '+' : '−'}$${num(Math.abs(t.net), 2)} · ${t.why || ''}`); ch = true;
      }
    }
    if (ch) save(); return ch;
  }
  async function optNow(b) {
    const sp = mainSpec(b), bars = cyc(b).bars || 4000; busyMsg = 'Optimizando… preparando datos'; render();
    try {
      const candles = await candlesFor(sp.symbol, sp.interval, bars), uo = userOps(sp), user = {}; for (const sid of [...new Set(uo.map(x => x.sid))]) { const r = await userSources(sid, sp.symbol, sp.interval, bars); for (const x of uo.filter(y => y.sid === sid)) { const f = r.sources.find(q => q.src === x.src); if (!f) throw new Error('Tu indicador ya no produce la señal «' + (x.sl || x.src) + '»'); user[sid + '|' + x.src] = f.series; } }
      const r = await window.CCTBotOpt.optimize(candles, sp, {seed: window.CCTBotOpt.hash(b.id + new Date().toISOString().slice(0, 10)), budget: 50, ropts: {nova: window.NovaNexus, user: uo.length ? user : null}, yield: () => new Promise(x => setTimeout(x, 0)), onProgress: (k, n, t) => { busyMsg = `Optimizando… ${t}`; const e = $('.bl-busy'); if (e) e.lastChild.textContent = busyMsg; }});
      const res = Object.assign({}, r, {status: 'ok', v: b.mainV, symbol: sp.symbol, interval: sp.interval}); b.local = res; log(b, 'reentrenamiento', `Optimización en el navegador: ${(decText[res.decision] || [res.decision])[0]}.`); noteHistory(b, res, 'navegador'); addCandidate(b, res, 'navegador'); touch(b);
    } catch (e) { toast('No se pudo optimizar: ' + (e.message || e)); b.local = {at: Date.now(), status: 'error', reason: String(e.message || e)}; touch(b); }
    busyMsg = ''; if (view === 'bot') render();
  }
  /* ----- Asistente del bot (IA con datos reales) ----- */
  function insights(b, run) { // preguntas y observaciones basadas SOLO en los números reales del último backtest
    if (!run) return ['Aún no hay resultados. ¿Quieres que ejecute primero un backtest para tener datos reales sobre los que preguntar?'];
    const m = run.metrics, s = run.segments, q = [];
    if (m.n < 30) q.push(`Solo hay ${m.n} operaciones: muy pocas para concluir algo. ¿Quieres probar una temporalidad menor o más historial para tener más muestra?`);
    if (s.train.net > 0 && (s.val.net <= 0 || s.test.net <= 0)) q.push('Gana en entrenamiento pero pierde en validación o prueba: eso suele ser sobreajuste. ¿Quieres simplificar las reglas o que pruebe un filtro de tendencia?');
    if (m.winRate != null && m.winRate > 55 && m.rr != null && m.rr < 1) q.push(`Acierta ${num(m.winRate, 0)} % pero la ganancia media es menor que la pérdida media (ratio ${num(m.rr, 2)}). ¿Pruebo un take profit más amplio o un stop más corto?`);
    if (m.winRate != null && m.winRate < 40 && (m.rr == null || m.rr < 2)) q.push(`Solo acierta ${num(m.winRate, 0)} % y el ratio ganancia/pérdida (${m.rr == null ? '—' : num(m.rr, 2)}) no lo compensa. ¿Quieres exigir más confirmación antes de entrar?`);
    if (m.maxDDPct > 20) q.push(`El drawdown máximo es ${num(m.maxDDPct, 1)} %. ¿Quieres que pruebe reducir el riesgo por operación o añadir un límite de pérdida diaria?`);
    if (m.retPct < run.buyHold.retPct) q.push(`No supera a comprar y mantener (${pct(run.buyHold.retPct)}). ¿Qué te parece comparar con un filtro que solo opere con tendencia alcista?`);
    const hr = Object.entries(run.breakdown.hour || {}).filter(([, v]) => v.n >= 5).sort((a, c) => a[1].net - c[1].net)[0]; if (hr && hr[1].net < 0) q.push(`Las entradas entre las ${hr[0]}:00 y las ${+hr[0] + 4}:00 UTC pierden ${money(-hr[1].net)} en ${hr[1].n} operaciones. ¿Pruebo un filtro de horario que las evite?`);
    if (m.fees > Math.abs(m.net) * .5 && m.n > 20) q.push(`Las comisiones (${money(m.fees)}) se comen gran parte del resultado. ¿Probamos una temporalidad mayor para operar menos?`);
    return q.length ? q : ['Con los datos actuales no veo una debilidad clara que justifique un cambio. Podemos validar la robustez en otras monedas (pestaña Robustez) antes de tocar nada.'];
  }
  const AI_SYS = `Eres el asistente de un bot de trading dentro de un laboratorio de backtesting. Hablas en español, breve y claro. Reglas: usa SOLO los números del contexto; no inventes resultados ni prometas ganancias; distingue entre en-muestra (entrenamiento) y fuera de muestra (validación/prueba); si algo no se puede concluir por pocas operaciones, dilo. Puedes hacer preguntas, explicar métricas y proponer experimentos. Si propones un cambio concreto, añade AL FINAL un bloque \`\`\`json {"why":"motivo breve","patch":{...}} \`\`\` donde patch es un fragmento de la especificación del bot (solo campos que cambian; las listas de condiciones se sustituyen completas; mismo esquema que la especificación actual). Nunca digas que el cambio ya está aplicado: el usuario decide.`;
  function ctxOf(b, run) { const sp = mainSpec(b); return `ESPECIFICACIÓN ACTUAL (v${b.mainV}):\n${JSON.stringify(sp)}\n\nREGLAS EN TEXTO:\n${B.describeSpec(sp)}\n\nÚLTIMO BACKTEST:\n` + (run ? JSON.stringify({velas: run.bars, periodo: [dd(run.from), dd(run.to)], metricas: {n: run.metrics.n, neto: run.metrics.net, rend: run.metrics.retPct, aciertos: run.metrics.winRate, factorBenef: run.metrics.profitFactor, ddPct: run.metrics.maxDDPct, expectativa: run.metrics.expectancy, comisiones: run.metrics.fees}, tramos: ['train', 'val', 'test'].map(k => ({k, n: run.segments[k].n, rend: run.segments[k].retPct, pf: run.segments[k].profitFactor})), buyHold: run.buyHold.retPct, veredicto: run.verdict.text, horario: run.breakdown.hour, tendencia: run.breakdown.trend, volatilidad: run.breakdown.vol}) : 'ninguno todavía'); }
  function tabAi(b, run) {
    const T = $('#blTab'), ins = insights(b, run);
    T.innerHTML = `<div class="bl-box"><h4>Observaciones con tus datos reales</h4>${note('Calculadas localmente a partir del último backtest. Toca una para hablarla con la IA.')}${ins.map((q, i) => `<button class="bl-q" data-a="askq" data-i="${i}">${esc(q)}</button>`).join('')}</div><div class="bl-chat" id="blBc">${b.chat.map(m => m.role === 'user' ? `<div class="bl-msg user"><p>${esc(m.text)}</p></div>` : `<div class="bl-msg bot">${mdLite(m.text)}${m.patch ? propCard(b, m) : ''}</div>`).join('') || '<div class="bl-msg bot"><p>Pregúntame lo que quieras sobre este bot. Puedo explicarte sus métricas y proponerte experimentos; tú decides cuáles probar.</p></div>'}</div><form class="bl-form" id="blBf"><textarea id="blBi" rows="2" placeholder="Pregunta o pide un experimento…" maxlength="800"></textarea><button class="bl-send">Enviar</button></form>`;
    const c = $('#blBc'); if (c) c.scrollTop = c.scrollHeight; T._ins = ins;
  }
  const propCard = (b, m) => m.state === 'tested' ? `<div class="bl-prop done"><b>Propuesta probada como v${m.v}.</b> Compárala en la pestaña Versiones.</div>` : m.state === 'rejected' ? '<div class="bl-prop done">Propuesta rechazada.</div>' : `<div class="bl-prop"><b>Experimento propuesto</b>${m.why ? `<p>${esc(m.why)}</p>` : ''}<pre>${esc(JSON.stringify(m.patch, null, 1).slice(0, 700))}</pre><div class="bl-card-b"><button class="bl-mini" data-a="accept" data-id="${m.id}">Probar como versión nueva</button><button class="bl-mini danger" data-a="reject" data-id="${m.id}">Rechazar</button></div></div>`;
  const merge2 = (a, p) => { if (p === null || typeof p !== 'object' || Array.isArray(p)) return p; const o = Object.assign({}, a && typeof a === 'object' && !Array.isArray(a) ? a : {}); for (const k of Object.keys(p)) o[k] = merge2(o[k], p[k]); return o; };
  async function askAi(b, text) {
    text = String(text || '').trim(); if (!text) return; const run = runOf(b); b.chat.push({role: 'user', text}); touch(b); render(); const hist = b.chat.slice(-8).map(m => ({role: m.role === 'user' ? 'user' : 'assistant', content: m.text}));
    try { const r = await LLM.chat([{role: 'system', content: AI_SYS + '\n\n' + ctxOf(b, run)}, ...hist], {maxTokens: 900, temperature: .3, timeout: 90000}), j = /```json\s*([\s\S]*?)```/.exec(r.text); let patch = null, why = ''; if (j) { try { const o = JSON.parse(j[1]); patch = o.patch || null; why = o.why || ''; } catch {} }
      b.chat.push({role: 'bot', text: LLM.stripCode(r.text) || 'Te dejo una propuesta:', patch, why, id: uidOf(), state: 'open'});
    } catch (e) { b.chat.push({role: 'bot', text: 'No pude consultar la IA: ' + LLM.friendly(e) + '\n\nMientras tanto, estas son las observaciones calculadas con tus datos (arriba).'}); }
    if (b.chat.length > 60) b.chat.splice(0, b.chat.length - 60); touch(b); if (view === 'bot' && tab === 'ai') render();
  }
  async function acceptProposal(b, id) {
    const m = b.chat.find(x => x.id === id); if (!m || !m.patch) return; const sp = B.normalizeSpec(merge2(JSON.parse(JSON.stringify(mainSpec(b))), m.patch)), v = B.validateSpec(sp);
    if (!v.ok) { toast('La propuesta no es válida: ' + v.errors[0]); return; }
    const nv = Math.max(...b.versions.map(x => x.v)) + 1; b.versions.push({v: nv, spec: sp, at: Date.now(), note: m.why || 'Propuesta del asistente', origin: 'asistente (aceptada por ti)', state: 'candidata'}); m.state = 'tested'; m.v = nv; log(b, 'experimento', `Aceptaste probar la propuesta del asistente como v${nv}.`); touch(b); await runAndShow(b, nv); tab = 'ver'; render();
  }

  /* ----- Mostrar en el gráfico + repetición ----- */
  let marksOn = false;
  function marksTrades(b) {
    const run = runOf(b, replay.ver || b.mainV) || runOf(b); if (!run || !run.trades.length) return {run, trades: []}; let tr = run.trades.filter(t => !t.open || true); if (replay.seg !== 'all' && run.segments[replay.seg]) { const s = run.segments[replay.seg]; tr = tr.filter(t => t.entryT >= s.from && t.entryT <= s.to); } return {run, trades: tr};
  }
  function pushMarks() {
    if (!H.marks) return; const b = bot(); if (!marksOn || !b) return H.marks(null); const {run, trades} = marksTrades(b); if (!run) return H.marks(null); const sp = ver(b, run.v).spec;
    const seg = replay.seg !== 'all' && run.segments[replay.seg], ivm = B.IV_MS[sp.interval] || 0; H.marks({symbol: sp.symbol, interval: sp.interval, trades, avoid: (run.avoid || []).filter(z => !seg || (z[0] >= seg.from && z[0] <= seg.to)).map(z => [z[0], z[0] + ivm]), limitT: replay.t, show: replay.show});
  }
  function events() { const {trades} = marksTrades(bot()), c = H.chart ? H.chart() : {}, from = c.from || 0; return [...new Set(trades.flatMap(t => [t.entryT, t.exitT]))].filter(t => t >= from).sort((a, c) => a - c); } // solo eventos que caen dentro de las velas cargadas en el gráfico
  function replayBar() {
    const b = bot(), {run, trades} = marksTrades(b), c = H.chart ? H.chart() : {}, out = run && c.from ? trades.filter(t => t.entryT < c.from).length : 0;
    return `<div class="bl-replay"><div class="bl-rrow"><button class="bl-ib sm" data-a="rpPlay" aria-label="${replay.on ? 'Pausa' : 'Reproducir'}">${replay.on ? IC.pause : IC.play}</button><button class="bl-ib sm" data-a="rpStep" aria-label="Siguiente evento">${IC.step}</button><button class="bl-mini" data-a="rpReset">Reiniciar</button><label>Velocidad<select id="rpSpd">${[1, 2, 4, 8].map(x => `<option value="${x}" ${replay.speed === x ? 'selected' : ''}>${x}×</option>`).join('')}</select></label><label>Periodo<select id="rpSeg">${[['all', 'Todo'], ['train', 'Entrenamiento'], ['val', 'Validación'], ['test', 'Prueba']].map(([k, l]) => `<option value="${k}" ${replay.seg === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Versión<select id="rpVer">${b.versions.filter(v => runOf(b, v.v)).map(v => `<option value="${v.v}" ${(replay.ver || b.mainV) === v.v ? 'selected' : ''}>v${v.v}</option>`).join('')}</select></label></div><div class="bl-rrow"><label class="bl-chk"><input type="checkbox" data-sh="arrows" ${replay.show.arrows ? 'checked' : ''}> Flechas</label><label class="bl-chk"><input type="checkbox" data-sh="levels" ${replay.show.levels ? 'checked' : ''}> Stop/Objetivo</label><label class="bl-chk"><input type="checkbox" data-sh="avoid" ${replay.show.avoid ? 'checked' : ''}> Evitar (${run && run.avoid ? run.avoid.length : 0})</label></div>${replay.t ? `<small class="bl-dim">Repetición hasta ${dt(replay.t)}</small>` : ''}${out > 0 ? note(`${out} operaciones anteriores a las velas cargadas en el gráfico no se pueden dibujar (desplázate hacia atrás para cargar más).`, 'warn') : ''}${note('Zonas ámbar = velas donde las reglas pedían entrar pero el filtro de mercado o el límite de riesgo lo impidió.')}</div>`;
  }
  function rpTick(step) { const ev = events(); if (!ev.length) return; const i = replay.t == null ? -1 : ev.findIndex(x => x > replay.t - 0); let nx = replay.t == null ? 0 : (i < 0 ? ev.length : i); if (nx >= ev.length) { replay.on = false; clearInterval(replay.timer); replay.timer = 0; render(); return; } replay.t = ev[nx]; H.seek && H.seek(replay.t); pushMarks(); const e = $('.bl-replay small.bl-dim'); if (view === 'bot' && !e) render(); else if (e) e.textContent = 'Repetición hasta ' + dt(replay.t); }
  function chartShow(b, tradeT) {
    const run = runOf(b); if (!run || !run.trades.length) { toast('Este bot aún no tiene operaciones para mostrar'); return; } const sp = mainSpec(b); wide = false; document.body.classList.remove('botlab-wide'); marksOn = true; replay.t = null; pushMarks();
    if (H.open) H.open(sp.symbol, sp.interval, tradeT || run.trades[run.trades.length - 1].entryT); if (view === 'bot') render();
  }

  /* ----- Comparador ----- */
  function score(r) { if (!r) return null; const m = r.metrics, risk = m.maxDDPct > 0 ? m.retPct / m.maxDDPct : m.retPct, rob = {consistente: 1, 'no-confirmada': .5, pierde: .2, insuficiente: .3}[r.verdict.level] || .3; return risk * rob * Math.min(1, m.n / 30); }
  function cmpView() {
    const bs = [...sel].map(getBot).filter(Boolean), rs = bs.map(b => runOf(b)), same = new Set(rs.filter(Boolean).map(r => r.symbol + r.interval + r.reqBars)).size <= 1;
    const order = bs.map((b, i) => [b, rs[i], score(rs[i])]).sort((a, c) => (c[2] == null ? -1e9 : c[2]) - (a[2] == null ? -1e9 : a[2]));
    root.innerHTML = head('Comparador de bots', 'Ranking ajustado por riesgo y robustez', 'lib') + (same ? '' : `<div class="bl-box">${note('⚠ Los bots se probaron en monedas, temporalidades o historiales distintos: la comparación no es directa. Para compararlos en igualdad, vuelve a ejecutar los backtests con el mismo historial.', 'warn')}</div>`) +
      `<div class="bl-box"><div class="bl-scroll"><table class="bl-t"><thead><tr><th>#</th><th>Bot</th><th>Mercado</th><th>Rend.</th><th>DD</th><th>Valid.</th><th>Prueba</th><th>Op.</th><th>vs B&amp;H</th><th>Puntaje</th></tr></thead><tbody>${order.map(([b, r, s], i) => r ? `<tr><td>${i + 1}</td><td>${esc(b.name)}<br><small class="bl-dim">v${b.mainV}</small></td><td>${r.symbol.replace('USDT', '')} ${r.interval}</td><td class="${cls(r.metrics.retPct)}">${pct(r.metrics.retPct)}</td><td>${num(r.metrics.maxDDPct, 1)} %</td><td class="${cls(r.segments.val.retPct)}">${pct(r.segments.val.retPct)}</td><td class="${cls(r.segments.test.retPct)}">${pct(r.segments.test.retPct)}</td><td>${r.metrics.n}</td><td class="${cls(r.metrics.retPct - r.buyHold.retPct)}">${pct(r.metrics.retPct - r.buyHold.retPct)}</td><td><b>${num(s, 2)}</b></td></tr>` : `<tr><td>—</td><td>${esc(b.name)}</td><td colspan="8" class="bl-dim">Sin backtest</td></tr>`).join('')}</tbody></table></div>${note('Puntaje = (rendimiento ÷ drawdown) × robustez (1 si se confirma fuera de muestra, 0,5 si no, 0,2–0,3 si pierde o hay poca muestra) × min(1, operaciones ÷ 30). Es un criterio para ordenar, no una predicción.')}</div>`;
  }

  /* ----- Importar / exportar ----- */
  function exportBot(b) { const blob = new Blob([JSON.stringify({nbl: 1, bot: b}, null, 1)], {type: 'application/json'}), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bot-${b.name.replace(/[^\w-]+/g, '_').slice(0, 40)}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function importBot(text) {
    try { const o = JSON.parse(text), x = o && o.bot; if (!x || !Array.isArray(x.versions) || !x.versions.length) throw new Error('formato'); x.versions.forEach(v => { v.spec = B.normalizeSpec(v.spec); const r = B.validateSpec(v.spec); if (!r.ok) throw new Error(r.errors[0]); }); x.id = uidOf(); x.name = (x.name || 'Bot importado') + ' (importado)'; x.updatedAt = Date.now(); x.status = x.status === 'running' ? 'tested' : (x.status || 'draft'); x.runs = x.runs || []; x.chat = x.chat || []; x.journal = x.journal || []; x.sweeps = x.sweeps || {}; if (!ver(x)) x.mainV = x.versions[0].v; log(x, 'importación', 'Bot importado desde un archivo.'); S.bots.push(x); save(); toast('Bot importado'); render();
    } catch (e) { toast('Archivo no válido: ' + (e.message || e)); }
  }
  function dupBot(b) { const c = JSON.parse(JSON.stringify(b)); c.id = uidOf(); c.name = b.name + ' (copia)'; c.createdAt = c.updatedAt = Date.now(); c.status = runOf(c) ? 'tested' : 'draft'; c.journal = [{t: Date.now(), kind: 'creación', text: 'Duplicado de «' + b.name + '».'}]; c.chat = []; S.bots.push(c); save(); render(); }

  /* ----- Eventos ----- */
  const ACT = {
    newBack() { view = 'new'; render(); }, wide() { wide = !wide; render(); }, new() { nl = {hist: [], spec: null, busy: false, msgs: []}; view = 'new'; render(); }, lib() { view = 'lib'; replay.on = false; clearInterval(replay.timer); replay.timer = 0; render(); },
    mA() { view = 'nl'; nlView(); }, mB() { startDraft(B.defaultSpec(), {id: null, method: 'visual'}); }, mC() { view = 'ind'; indView(); }, indScan, indOk() { const sp = indSpec(), v = B.validateSpec(sp); if (!v.ok) return toast(v.errors[0]); const b = newBot(sp, 'indicador', 'Señales de ' + (sp.entry.long[0].a.sname || 'mi indicador')); S.bots.push(b); touch(b); cur = b.id; tab = 'sum'; view = 'bot'; render(); runAndShow(b, 1); }, indEdit() { startDraft(indSpec(), {id: null, method: 'indicador'}); },
    preset(el) { const sp = B.PRESETS[el.dataset.k](); startDraft(sp, {id: null, method: el.dataset.k === 'novaNexus' ? 'nova' : 'visual'}); },
    nlOk() { const b = newBot(nl.spec, 'nl', nl.hist.filter(h => h.role === 'user').map(h => h.content).join(' / ').slice(0, 300)); S.bots.push(b); touch(b); cur = b.id; tab = 'sum'; view = 'bot'; render(); runAndShow(b, 1); },
    nlEdit() { startDraft(nl.spec, {id: null, method: 'nl'}); },
    addc(el) { const l = getP(draft, el.dataset.list); l.push({a: {k: 'close'}, op: 'gt', b: {k: 'ema', n: 20}}); editView(); }, rmc(el) { getP(draft, el.dataset.list).splice(+el.dataset.i, 1); editView(); },
    saveDraft, showDesc() { $('#blDesc').innerHTML = `<div class="bl-box">${mdLite(B.describeSpec(B.normalizeSpec(draft)))}</div>`; },
    open(el) { cur = el.dataset.id; tab = 'sum'; view = 'bot'; replay = Object.assign(replay, {t: null, ver: null, seg: 'all'}); marksOn = false; H.marks && H.marks(null); render(); },
    dup(el) { dupBot(getBot(el.dataset.id)); }, pause(el) { const b = getBot(el.dataset.id); b.status = b.status === 'paused' ? (runOf(b) ? 'tested' : 'draft') : 'paused'; log(b, 'estado', b.status === 'paused' ? 'Bot pausado.' : 'Bot reanudado.'); touch(b); render(); },
    arch(el) { const b = getBot(el.dataset.id); b.status = b.status === 'archived' ? (runOf(b) ? 'tested' : 'draft') : 'archived'; sel.delete(b.id); touch(b); render(); }, exp(el) { exportBot(getBot(el.dataset.id)); },
    del(el) { const b = getBot(el.dataset.id); if (!confirm(`¿Eliminar «${b.name}» y todo su historial? No se puede deshacer.`)) return; S.bots = S.bots.filter(x => x.id !== b.id); S.deleted[b.id] = Date.now(); sel.delete(b.id); if (marksOn) { marksOn = false; H.marks && H.marks(null); } save(); render(); },
    import() { const f = document.createElement('input'); f.type = 'file'; f.accept = 'application/json,.json'; f.onchange = () => { const r = new FileReader(); r.onload = () => importBot(r.result); f.files[0] && r.readAsText(f.files[0]); }; f.click(); },
    cmp() { view = 'cmp'; render(); },
    tab(el) { tab = el.dataset.k; render(); },
    run() { const b = bot(); runAndShow(b, +$('#blRunV').value, +$('#blRunBars').value); }, vrun(el) { runAndShow(bot(), +el.dataset.v); },
    vmain(el) { const b = bot(), v = +el.dataset.v, c = runOf(b, v), m = runOf(b); if (!c) { toast('Primero prueba esa versión'); return; } const bad = m && worse(c, m); if (!confirm(bad ? `La v${v} es PEOR que la principal en alguna métrica fuera de muestra o de riesgo. ¿Quieres convertirla en principal de todos modos?` : `¿Hacer principal la v${v}? Podrás volver a la anterior cuando quieras.`)) return; b.versions.forEach(x => { if (x.v === b.mainV) x.state = 'anterior'; }); ver(b, v).state = 'principal'; b.mainV = v; log(b, 'versión', `La v${v} pasó a ser la principal (decisión tuya).`); touch(b); render(); },
    vdisc(el) { const b = bot(); ver(b, +el.dataset.v).state = 'descartada'; log(b, 'versión', `Descartada la v${el.dataset.v}.`); touch(b); render(); },
    vedit(el) { const b = bot(); startDraft(ver(b, +el.dataset.v).spec, {id: b.id, note: 'Editada a partir de v' + el.dataset.v}); },
    papStart() { const b = bot(), v = +$('#papV').value, cap = +$('#papCap').value; if (!(cap >= 100)) return toast('El capital virtual debe ser de al menos 100'); const sp = ver(b, v).spec, r = runOf(b, v); if (r && r.verdict.level === 'pierde' && !confirm('Esta versión pierde dinero en el backtest. ¿Iniciar paper trading de todos modos?')) return;
      const sess = PP().newSession({id: uidOf(), v, spec: sp, capital: cap, startT: Date.now()}); (b.paper = b.paper || []).push(sess); log(b, 'paper', `Paper trading iniciado con la v${v} (capital virtual ${money(cap)}).`); touch(b); render(); paperUpdate(b, sess); },
    papUpd(el) { const b = bot(), s = (b.paper || []).find(x => x.id === el.dataset.id); if (s) paperUpdate(b, s); },
    papPause(el) { const b = bot(), s = b.paper.find(x => x.id === el.dataset.id); s.status = 'paused'; s.pausedAt = Date.now(); log(b, 'paper', 'Paper trading pausado.'); touch(b); render(); },
    papResume(el) { const b = bot(), s = b.paper.find(x => x.id === el.dataset.id); s.status = 'running'; if (s.open) { s.notes.push({t: Date.now(), text: 'Se reanudó con una posición abierta: el modelo no la sigue durante la pausa; verifícala.'}); } s.open = null; s.anchorT = Math.max(s.anchorT, Date.now()); s.gaps.push({from: s.pausedAt, to: Date.now(), why: 'Pausa del usuario (no se opera durante ella)'}); log(b, 'paper', 'Paper trading reanudado.'); touch(b); render(); paperUpdate(b, s); },
    papStop(el) { const b = bot(), s = b.paper.find(x => x.id === el.dataset.id); if (!confirm('¿Terminar esta sesión? Se conserva el historial pero ya no avanza.')) return; s.status = 'stopped'; log(b, 'paper', 'Paper trading terminado.'); touch(b); render(); },
    risk() { view = 'risk'; render(); }, rkPeak() { S.risk = RK().norm(S.risk); S.risk.peak = 0; S.risk.updatedAt = Date.now(); save(); riskTick(); render(); },
    sweep() { doSweep(bot()); }, optNow() { optNow(bot()); },
    async costs() { const b = bot(), sp = mainSpec(b), run = runOf(b); $('#blCosts').innerHTML = note('Calculando…'); try { const res = await execute(Object.assign({}, sp, {costs: {feePct: sp.costs.feePct * 2, slipPct: sp.costs.slipPct * 2}}), run.reqBars); $('#blCosts').innerHTML = `<p>Con costes ×2: <b class="${cls(res.metrics.retPct)}">${pct(res.metrics.retPct)}</b> (${res.metrics.n} op.) frente a <b>${pct(run.metrics.retPct)}</b> con los costes normales.</p>`; } catch (e) { $('#blCosts').innerHTML = note('Error: ' + (e.message || e)); } },
    askq(el) { askAi(bot(), $('#blTab')._ins[+el.dataset.i]); }, accept(el) { acceptProposal(bot(), el.dataset.id); }, reject(el) { const b = bot(), m = b.chat.find(x => x.id === el.dataset.id); m.state = 'rejected'; log(b, 'experimento', 'Rechazaste una propuesta del asistente.'); touch(b); render(); },
    chartToggle() { const b = bot(); if (marksOn) { marksOn = false; replay.on = false; clearInterval(replay.timer); replay.timer = 0; replay.t = null; H.marks && H.marks(null); render(); } else chartShow(b); },
    seeTrade(el) { const b = bot(), run = runOf(b), t = run.trades[+el.dataset.i]; replay.t = null; replay.seg = 'all'; chartShow(b, t.entryT); },
    rpPlay() { if (replay.on) { replay.on = false; clearInterval(replay.timer); replay.timer = 0; } else { replay.on = true; if (replay.t == null) rpTick(); replay.timer = setInterval(rpTick, 1100 / replay.speed); } render(); }, rpStep() { rpTick(); }, rpReset() { replay.t = null; replay.on = false; clearInterval(replay.timer); replay.timer = 0; pushMarks(); render(); }
  };
  function bind() {
    root.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (!el || !root.contains(el) || el.disabled) return; const f = ACT[el.dataset.a]; if (f) { e.preventDefault(); f(el); } });
    root.addEventListener('change', e => {
      const el = e.target; if (el.id === 'blArch') { showArch = el.checked; return render(); } if (el.dataset.sel) { el.checked ? sel.add(el.dataset.sel) : sel.delete(el.dataset.sel); return render(); }
      if (el.id === 'rpSpd') { replay.speed = +el.value; if (replay.on) { clearInterval(replay.timer); replay.timer = setInterval(rpTick, 1100 / replay.speed); } return; } if (el.id === 'rpSeg') { replay.seg = el.value; replay.t = null; pushMarks(); return render(); } if (el.id === 'rpVer') { replay.ver = +el.value; replay.t = null; pushMarks(); return render(); } if (el.dataset.sh) { replay.show[el.dataset.sh] = el.checked; return pushMarks(); }
      if (el.dataset.rk2) { const r = S.risk = RK().norm(S.risk); r.log = r.log.slice(); r[el.dataset.rk2] = Math.max(0, +el.value || 0); r.updatedAt = Date.now(); save(); riskTick(); return render(); } if (el.id === 'rkKill') { const r = S.risk = RK().norm(S.risk); r.kill = el.checked; r.updatedAt = Date.now(); save(); riskTick(); return render(); }
      if (el.id === 'cycOn') { const b = bot(), c = cyc(b); c.enabled = el.checked; if (el.checked) c.enabledAt = Date.now(); log(b, 'ciclo', el.checked ? 'Ciclo automático de reentrenamiento ACTIVADO.' : 'Ciclo automático desactivado.'); touch(b); return render(); } if (el.id === 'cycEvery') { cyc(bot()).everyHours = +el.value; return touch(bot()); } if (el.id === 'cycBars') { cyc(bot()).bars = +el.value; return touch(bot()); }
      if (el.id === 'indSid') { ind.sid = el.value; ind.res = null; ind.err = ''; return indView(); } if (el.id === 'indSym') { ind.sym = el.value.toUpperCase(); ind.res = null; return; } if (el.id === 'indItv') { ind.itv = el.value; ind.res = null; return; } if (el.id === 'indBuy') { ind.buy = el.value; return indView(); } if (el.id === 'indSell') { ind.sell = el.value; return; } if (el.id === 'indShort') { ind.short = el.checked; return; }
      onField(el);
    });
    root.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'blNlForm') { const t = $('#blNlIn').value; nlSend(t); } else if (e.target.id === 'blBf') { const t = $('#blBi').value; $('#blBi').value = ''; askAi(bot(), t); } });
  }

  /* ----- Arranque ----- */
  function init() {
    root = $('#botLabRoot'); if (!root) return; S = readLocal(); bind(); render();
    const open = () => { S = merge(S, readLocal()); setTimeout(() => { if (view === 'lib') render(); }, 30); pullCloud(); paperTick(); };
    const rb = $('#rrBotLab'); rb && rb.addEventListener('click', open);
    paperTick(); setInterval(() => { if (!document.hidden) paperTick(); }, 60000);
    setTimeout(pullCloud, 2500);
    window.CCTBotLabUI = {mergeServer, mergePaper, state: () => S, open: id => ACT.open({dataset: {id}}), runBot, newBot, store: s => { S = s; save(); render(); }};
  }
  // La vista de lista usa las vistas «nl» como subvista de «new»
  const _render = render; render = function () { if (view === 'ind') { stopReplayIf(); indView(); document.body.classList.toggle('botlab-wide', wide && matchMedia('(min-width:1024px)').matches); return; } if (view === 'nl') { stopReplayIf(); nlView(); document.body.classList.toggle('botlab-wide', wide && matchMedia('(min-width:1024px)').matches); return; } _render(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
