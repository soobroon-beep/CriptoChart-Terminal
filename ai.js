/* IA · Analista de gráficos cripto.
   Lee el gráfico abierto (velas + los indicadores que tengas activos + zonas de Nova Nexus), las noticias y el calendario económico,
   y responde en español SIEMPRE sobre el sector cripto y con base en esos datos.
   Dos modos:
   · Local (gratis, sin clave, sin enviar nada fuera): motor de reglas que calcula tendencia, momentum, niveles, noticias y calendario.
   · Claude (opcional): con tu clave de Anthropic se pueden hacer preguntas libres; se le manda el mismo resumen de datos como contexto.
   La parte de cálculo no toca el DOM y se prueba con tests/ai.test.js. No es asesoría financiera. */
(function (root) {
  'use strict';

  /* ───────── Utilidades numéricas ───────── */
  const last = a => { if (!a) return null; for (let i = a.length - 1; i >= 0; i--) if (a[i] != null && Number.isFinite(a[i])) return a[i]; return null; };
  function ema(v, n) { const k = 2 / (n + 1), o = new Array(v.length).fill(null); let e = null; for (let i = 0; i < v.length; i++) { if (i < n - 1) continue; if (e == null) { let s = 0; for (let j = i - n + 1; j <= i; j++) s += v[j]; e = s / n; } else e = v[i] * k + e * (1 - k); o[i] = e; } return o; }
  function sma(v, n) { const o = new Array(v.length).fill(null); let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
  function rsi(v, n) { const o = new Array(v.length).fill(null); if (v.length <= n) return o; let g = 0, l = 0; for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; if (d >= 0) g += d; else l -= d; } g /= n; l /= n; o[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l); for (let i = n + 1; i < v.length; i++) { const d = v[i] - v[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return o; }
  function atr(c, n) { const o = new Array(c.length).fill(null); let a = null; for (let i = 1; i < c.length; i++) { const tr = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)); if (i < n) { a = (a || 0) + tr; if (i === n - 1) { a /= n; o[i] = a; } } else { a = (a * (n - 1) + tr) / n; o[i] = a; } } return o; }
  function macd(v, f = 12, s = 26, g = 9) { const ef = ema(v, f), es = ema(v, s), line = v.map((_, i) => ef[i] != null && es[i] != null ? ef[i] - es[i] : null); const idx = line.findIndex(x => x != null); const sig = new Array(v.length).fill(null); if (idx >= 0) { const e = ema(line.slice(idx), g); e.forEach((x, i) => { sig[idx + i] = x; }); } return {line, sig, hist: line.map((x, i) => x != null && sig[i] != null ? x - sig[i] : null)}; }
  function swings(c, k = 3) { // pivotes (fractales): máximos y mínimos locales confirmados
    const hi = [], lo = [];
    for (let i = k; i < c.length - k; i++) {
      let h = true, l = true; for (let j = 1; j <= k; j++) { if (c[i].h <= c[i - j].h || c[i].h < c[i + j].h) h = false; if (c[i].l >= c[i - j].l || c[i].l > c[i + j].l) l = false; }
      if (h) hi.push({i, p: c[i].h}); if (l) lo.push({i, p: c[i].l});
    }
    return {hi, lo};
  }
  const pct = (a, b) => b ? (a - b) / b * 100 : 0;
  function fmt(p) { if (p == null || !Number.isFinite(p)) return '—'; const a = Math.abs(p); return a >= 1000 ? p.toLocaleString('es', {maximumFractionDigits: 0}) : a >= 1 ? p.toLocaleString('es', {maximumFractionDigits: 2}) : a >= .01 ? p.toFixed(4) : p.toPrecision(3); }
  const fp = p => '$' + fmt(p);
  const sgn = x => (x >= 0 ? '+' : '') + x.toFixed(2) + '%';

  /* ───────── Análisis técnico ───────── */
  const IV_NAME = {'1m': '1 minuto', '5m': '5 minutos', '15m': '15 minutos', '30m': '30 minutos', '1h': '1 hora', '4h': '4 horas', '1d': 'diario', '1w': 'semanal', '1M': 'mensual'};
  function analyze(ctx) {
    const c = ctx && ctx.candles; if (!c || c.length < 30) return null;
    const n = c.length, cl = c.map(x => x.c), L = c[n - 1], price = L.c, A = {symbol: ctx.symbol, interval: ctx.interval, price, notes: [], flags: {}};
    const e20 = ema(cl, 20), e50 = ema(cl, 50), s200 = n >= 200 ? sma(cl, 200) : null, r = rsi(cl, 14), at = atr(c, 14), m = macd(cl);
    const v20 = sma(c.map(x => x.v), 20);
    A.ema20 = last(e20); A.ema50 = last(e50); A.sma200 = s200 ? last(s200) : null; A.rsi = last(r); A.atr = last(at); A.atrPct = A.atr ? A.atr / price * 100 : null;
    A.macd = {line: last(m.line), sig: last(m.sig), hist: last(m.hist), prevHist: m.hist[n - 2]};
    // Bollinger
    { const N = 20, w = cl.slice(-N), mu = w.reduce((a, b) => a + b, 0) / N, sd = Math.sqrt(w.reduce((a, b) => a + (b - mu) ** 2, 0) / N); A.bb = {mid: mu, up: mu + 2 * sd, lo: mu - 2 * sd, pb: sd ? (price - (mu - 2 * sd)) / (4 * sd) : .5, width: mu ? 4 * sd / mu * 100 : 0}; }
    A.volRatio = last(v20) ? L.v / last(v20) : null;
    A.chg = {bar: pct(price, c[n - 2].c), d24: ctx.change24h != null ? ctx.change24h : null, r20: pct(price, c[Math.max(0, n - 21)].c), r50: pct(price, c[Math.max(0, n - 51)].c)};
    // estructura de mercado
    const sw = swings(c, 3), hs = sw.hi.slice(-3), ls = sw.lo.slice(-3);
    const hh = hs.length >= 2 && hs[hs.length - 1].p > hs[hs.length - 2].p, lh = hs.length >= 2 && hs[hs.length - 1].p < hs[hs.length - 2].p;
    const hl = ls.length >= 2 && ls[ls.length - 1].p > ls[ls.length - 2].p, ll = ls.length >= 2 && ls[ls.length - 1].p < ls[ls.length - 2].p;
    A.structure = hh && hl ? 'alcista (máximos y mínimos más altos)' : lh && ll ? 'bajista (máximos y mínimos más bajos)' : hh || hl ? 'alcista débil / transición' : lh || ll ? 'bajista débil / transición' : 'lateral';
    A.hi20 = Math.max(...c.slice(-20).map(x => x.h)); A.lo20 = Math.min(...c.slice(-20).map(x => x.l)); A.hi100 = Math.max(...c.slice(-100).map(x => x.h)); A.lo100 = Math.min(...c.slice(-100).map(x => x.l));
    // ── puntaje de sesgo (-100…100)
    let score = 0; const why = [];
    const add = (pts, txt) => { score += pts; why.push([pts, txt]); };
    if (A.ema20 != null) add(price > A.ema20 ? 10 : -10, price > A.ema20 ? 'precio sobre la EMA 20' : 'precio bajo la EMA 20');
    if (A.ema50 != null) add(price > A.ema50 ? 12 : -12, price > A.ema50 ? 'precio sobre la EMA 50' : 'precio bajo la EMA 50');
    if (A.ema20 != null && A.ema50 != null) add(A.ema20 > A.ema50 ? 8 : -8, A.ema20 > A.ema50 ? 'EMA 20 por encima de la EMA 50' : 'EMA 20 por debajo de la EMA 50');
    if (A.sma200 != null) add(price > A.sma200 ? 12 : -12, price > A.sma200 ? 'precio sobre la media de 200' : 'precio bajo la media de 200');
    if (A.macd.hist != null) add(A.macd.hist > 0 ? 10 : -10, A.macd.hist > 0 ? 'MACD con histograma positivo' : 'MACD con histograma negativo');
    if (A.macd.hist != null && A.macd.prevHist != null) add(A.macd.hist > A.macd.prevHist ? 5 : -5, A.macd.hist > A.macd.prevHist ? 'impulso del MACD en aumento' : 'impulso del MACD en descenso');
    if (A.rsi != null) { if (A.rsi > 55 && A.rsi < 70) add(8, 'RSI en zona alcista'); else if (A.rsi < 45 && A.rsi > 30) add(-8, 'RSI en zona bajista'); }
    if (/^alcista \(/.test(A.structure)) add(15, 'estructura alcista'); else if (/^bajista \(/.test(A.structure)) add(-15, 'estructura bajista');
    else if (/alcista débil/.test(A.structure)) add(5, 'estructura con sesgo alcista débil'); else if (/bajista débil/.test(A.structure)) add(-5, 'estructura con sesgo bajista débil');
    // indicadores del usuario (si existen)
    const V = ctx.values || {};
    if (V.supertrend != null) add(V.supertrend > 0 ? 8 : -8, V.supertrend > 0 ? 'Supertrend alcista' : 'Supertrend bajista');
    if (V.trailTrend != null) add(V.trailTrend > 0 ? 8 : -8, V.trailTrend > 0 ? 'Smooth Trail alcista' : 'Smooth Trail bajista');
    if (V.vwap != null) add(price > V.vwap ? 4 : -4, price > V.vwap ? 'precio sobre el VWAP' : 'precio bajo el VWAP');
    A.score = Math.max(-100, Math.min(100, Math.round(score))); A.why = why;
    A.bias = A.score >= 35 ? 'alcista' : A.score >= 12 ? 'ligeramente alcista' : A.score <= -35 ? 'bajista' : A.score <= -12 ? 'ligeramente bajista' : 'neutral / sin tendencia clara';
    const conf = Math.abs(A.score); A.confidence = conf >= 55 ? 'alta' : conf >= 30 ? 'media' : 'baja';
    // condiciones notables
    if (A.rsi != null) { if (A.rsi >= 70) A.notes.push(`RSI ${A.rsi.toFixed(0)}: sobrecompra (riesgo de pausa o corrección corta, aunque en tendencias fuertes puede mantenerse).`); else if (A.rsi <= 30) A.notes.push(`RSI ${A.rsi.toFixed(0)}: sobreventa (posible rebote, pero no es señal de entrada por sí sola).`); }
    if (A.bb.pb > 1) A.notes.push('El precio cerró fuera de la banda superior de Bollinger: movimiento extendido.'); else if (A.bb.pb < 0) A.notes.push('El precio cerró fuera de la banda inferior de Bollinger: movimiento extendido a la baja.');
    if (A.bb.width < 3) A.notes.push('Las bandas de Bollinger están muy comprimidas: suele anticipar un movimiento fuerte (no indica la dirección).');
    if (A.volRatio != null) { if (A.volRatio > 1.8) A.notes.push(`Volumen ${A.volRatio.toFixed(1)}× el promedio: el movimiento actual tiene participación.`); else if (A.volRatio < .6) A.notes.push('Volumen bajo frente al promedio: movimientos con poca convicción.'); }
    // divergencia RSI simple: precio hace máximo más alto pero RSI uno más bajo (y viceversa)
    if (hs.length >= 2) { const a = hs[hs.length - 2], b = hs[hs.length - 1]; if (b.p > a.p && r[b.i] != null && r[a.i] != null && r[b.i] < r[a.i] - 2 && n - b.i < 40) A.notes.push('Posible divergencia bajista: el precio hizo un máximo más alto pero el RSI uno más bajo.'); }
    if (ls.length >= 2) { const a = ls[ls.length - 2], b = ls[ls.length - 1]; if (b.p < a.p && r[b.i] != null && r[a.i] != null && r[b.i] > r[a.i] + 2 && n - b.i < 40) A.notes.push('Posible divergencia alcista: el precio hizo un mínimo más bajo pero el RSI uno más alto.'); }
    // ── niveles clave
    const lv = [];
    for (const s of sw.hi.slice(-8)) lv.push({p: s.p, k: 'máximo previo'}); for (const s of sw.lo.slice(-8)) lv.push({p: s.p, k: 'mínimo previo'});
    lv.push({p: A.hi20, k: 'máximo de 20 velas'}, {p: A.lo20, k: 'mínimo de 20 velas'}, {p: A.hi100, k: 'máximo de 100 velas'}, {p: A.lo100, k: 'mínimo de 100 velas'});
    if (A.ema50 != null) lv.push({p: A.ema50, k: 'EMA 50'}); if (A.sma200 != null) lv.push({p: A.sma200, k: 'media de 200'}); lv.push({p: A.bb.up, k: 'banda sup. Bollinger'}, {p: A.bb.lo, k: 'banda inf. Bollinger'});
    for (const z of (ctx.zones && ctx.zones.sup) || []) lv.push({p: z.top != null ? (z.top + z.bot) / 2 : z.p, k: 'zona de soporte (Nova Nexus)', z: true, lo: z.bot, hi: z.top});
    for (const z of (ctx.zones && ctx.zones.res) || []) lv.push({p: z.top != null ? (z.top + z.bot) / 2 : z.p, k: 'zona de resistencia (Nova Nexus)', z: true, lo: z.bot, hi: z.top});
    if (ctx.vp && ctx.vp.poc != null) lv.push({p: ctx.vp.poc, k: 'POC del perfil de volumen'});
    if (V.vwap != null) lv.push({p: V.vwap, k: 'VWAP'});
    const tol = price * .0035, uniq = []; // se fusionan niveles muy cercanos
    for (const l of lv.filter(x => Number.isFinite(x.p)).sort((a, b) => a.p - b.p)) { const q = uniq[uniq.length - 1]; if (q && Math.abs(q.p - l.p) < tol) { q.k += ' + ' + l.k; q.n++; q.p = (q.p * (q.n - 1) + l.p) / q.n; q.z = q.z || l.z; } else uniq.push({p: l.p, k: l.k, n: 1, z: !!l.z}); }
    A.supports = uniq.filter(x => x.p < price * .9995).sort((a, b) => b.p - a.p).slice(0, 4); A.resists = uniq.filter(x => x.p > price * 1.0005).sort((a, b) => a.p - b.p).slice(0, 4);
    // ── plan de escenario (educativo)
    const s1 = A.supports[0], r1 = A.resists[0], u = A.atr || price * .01;
    A.plan = {
      long: s1 && r1 ? {entry: price, stop: s1.p - .5 * u, t1: r1.p, t2: A.resists[1] ? A.resists[1].p : r1.p + 2 * u} : null,
      short: s1 && r1 ? {entry: price, stop: r1.p + .5 * u, t1: s1.p, t2: A.supports[1] ? A.supports[1].p : s1.p - 2 * u} : null
    };
    for (const k of ['long', 'short']) { const q = A.plan[k]; if (q) { const risk = Math.abs(q.entry - q.stop), rew = Math.abs(q.t1 - q.entry); q.rr = risk > 0 ? rew / risk : null; q.riskPct = risk / q.entry * 100; } }
    return A;
  }

  /* ───────── Noticias y calendario ───────── */
  const COIN_WORDS = {BTC: ['bitcoin', 'btc'], ETH: ['ethereum', 'ether', 'eth'], SOL: ['solana', 'sol'], BNB: ['bnb', 'binance'], XRP: ['xrp', 'ripple'], DOGE: ['dogecoin', 'doge'], ADA: ['cardano', 'ada'], AVAX: ['avalanche', 'avax'], LINK: ['chainlink', 'link'], DOT: ['polkadot'], LTC: ['litecoin', 'ltc'], TRX: ['tron', 'trx'], MATIC: ['polygon', 'matic'], SHIB: ['shiba', 'shib'], TON: ['toncoin']};
  const baseOf = s => String(s || '').replace(/(USDT|USDC|BUSD|FDUSD|USD)$/i, '').toUpperCase();
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const POS = /\b(sube|suben|alza|alzas|avanza\w*|record|maximo\w*|aprueba\w*|aprobacion|adopcion|entradas?|compra\w*|rebota\w*|recupera\w*|se dispara\w*|dispara\w*|impulsa\w*|optimis\w*|ganancias?|recorte de tasas|institucional\w*|acumula\w*)\b/;
  const NEG = /\b(cae|caen|baja|bajas|desplom\w*|hunde\w*|colapso|hackeo\w*|hackean\w*|robo|estafa\w*|demanda\w*|prohib\w*|sanci\w*|liquidaci\w*|salidas?|quiebra|bancarrota|pierde\w*|presion\w*|aranceles?|recesion|temor\w*|miedo|preocupa\w*|riesgo\w*|venta\w*|incertidumbre)\b/;
  function sentiment(title, desc) { const t = norm(title + ' ' + (desc || '').slice(0, 160)); const p = (t.match(new RegExp(POS.source, 'g')) || []).length, n = (t.match(new RegExp(NEG.source, 'g')) || []).length; return p === n ? 0 : p > n ? 1 : -1; }
  function newsFor(items, symbol, now) {
    if (!Array.isArray(items) || !items.length) return null;
    const base = baseOf(symbol), words = (COIN_WORDS[base] || [base.toLowerCase()]).map(norm), re = new RegExp('\\b(' + words.map(w => w.replace(/[^a-z0-9]/g, '')).join('|') + ')\\b'), cut = (now || Date.now()) - 36 * 3600e3;
    const rec = items.filter(i => i && i.t >= cut), mine = [], market = [];
    for (const i of rec) { const t = norm(i.title + ' ' + (i.desc || '')); (re.test(t) ? mine : market).push(Object.assign({s: sentiment(i.title, i.desc)}, i)); }
    const pool = mine.length >= 3 ? mine : mine.concat(market.filter(i => i.cat === 'cripto' || i.impact === 'alto')); const top = pool.sort((a, b) => (b.impact === 'alto') - (a.impact === 'alto') || b.t - a.t).slice(0, 5);
    const src = mine.length ? top.filter(i => mine.includes(i)) : top, tot = src.reduce((a, b) => a + b.s, 0), tone = !top.length ? null : tot >= 2 ? 'positivo' : tot <= -2 ? 'negativo' : 'mixto / neutral';
    return {base, about: mine.length, top, tone, total: rec.length};
  }
  const CAL_ES = [[/non-?farm (employment change|payrolls?)/i, 'Nóminas no agrícolas (NFP)'], [/unemployment rate/i, 'Tasa de desempleo'], [/core cpi/i, 'IPC subyacente'], [/\bcpi\b/i, 'IPC (inflación)'], [/core ppi/i, 'IPP subyacente'], [/\bppi\b/i, 'IPP (precios al productor)'], [/core pce/i, 'PCE subyacente'], [/\bpce\b/i, 'PCE'], [/fomc.*minutes/i, 'Minutas de la Fed (FOMC)'], [/fomc.*statement|federal funds rate|fed funds/i, 'Decisión de tasas de la Fed'], [/fomc press/i, 'Conferencia de prensa de la Fed'], [/fomc/i, 'FOMC'], [/powell|fed chair/i, 'Discurso del presidente de la Fed'], [/\bgdp\b/i, 'PIB'], [/retail sales/i, 'Ventas minoristas'], [/jobless claims/i, 'Peticiones de subsidio por desempleo'], [/adp/i, 'Empleo privado ADP'], [/jolts/i, 'Ofertas de empleo JOLTS'], [/ism .*manufacturing|manufacturing pmi/i, 'PMI manufacturero'], [/ism .*services|services pmi/i, 'PMI de servicios'], [/consumer (confidence|sentiment)/i, 'Confianza del consumidor'], [/ecb|main refinancing/i, 'Banco Central Europeo (BCE)'], [/boe|bank rate/i, 'Banco de Inglaterra'], [/boj|policy rate/i, 'Banco de Japón'], [/trade balance/i, 'Balanza comercial'], [/crude oil inventories/i, 'Inventarios de petróleo'], [/treasury|bond auction/i, 'Subasta de bonos del Tesoro'], [/speaks?/i, 'Discurso']];
  const trCal = t => { for (const [re, es] of CAL_ES) if (re.test(t)) return es + ' · ' + t; return t; };
  const CAL_COUNTRY = {USD: 'EE. UU.', EUR: 'Eurozona', GBP: 'Reino Unido', JPY: 'Japón', CNY: 'China', CAD: 'Canadá', AUD: 'Australia', CHF: 'Suiza', NZD: 'Nueva Zelanda', ALL: 'Global'};
  function calendarFor(events, now) {
    if (!Array.isArray(events) || !events.length) return null; now = now || Date.now();
    const imp = e => /high|alto/i.test(e.impact) ? 2 : /medium|medio/i.test(e.impact) ? 1 : 0, rel = e => ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'ALL'].includes(e.country);
    const upcoming = events.filter(e => e.t > now && e.t - now < 72 * 3600e3 && imp(e) >= 1 && rel(e)).sort((a, b) => a.t - b.t).slice(0, 8);
    const recent = events.filter(e => e.t <= now && now - e.t < 24 * 3600e3 && imp(e) >= 1 && rel(e) && (e.actual || '') !== '').sort((a, b) => b.t - a.t).slice(0, 5);
    const soonHigh = upcoming.filter(e => imp(e) === 2 && e.t - now < 24 * 3600e3);
    return {upcoming, recent, soonHigh, imp, name: e => trCal(e.title), country: e => CAL_COUNTRY[e.country] || e.country};
  }
  function whenStr(t, now) { const d = (t - now) / 36e5; if (d < 0) return 'hace ' + (-d < 1 ? Math.round(-d * 60) + ' min' : Math.round(-d) + ' h'); if (d < 1) return 'en ' + Math.max(1, Math.round(d * 60)) + ' min'; if (d < 48) return 'en ' + Math.round(d) + ' h'; return new Date(t).toLocaleDateString('es', {weekday: 'long', day: 'numeric'}); }

  /* ───────── Redacción de respuestas (modo local) ───────── */
  const DISC = '_Esto es análisis educativo basado en los datos del gráfico, no asesoría financiera. Tú decides y asumes tu riesgo._';
  function secHeader(A, ctx) { return `### ${A.symbol} · ${IV_NAME[A.interval] || A.interval}\nPrecio **${fp(A.price)}**${A.chg.d24 != null ? ` · 24 h ${sgn(A.chg.d24)}` : ''} · últimas 20 velas ${sgn(A.chg.r20)}`; }
  function secTrend(A) {
    const L = [`**Sesgo: ${A.bias}** (puntaje ${A.score > 0 ? '+' : ''}${A.score}/100 · confianza ${A.confidence})`, `Estructura: ${A.structure}.`];
    const pos = A.why.filter(w => w[0] > 0).map(w => w[1]), neg = A.why.filter(w => w[0] < 0).map(w => w[1]);
    if (pos.length) L.push('A favor: ' + pos.slice(0, 4).join(', ') + '.'); if (neg.length) L.push('En contra: ' + neg.slice(0, 4).join(', ') + '.');
    return L.join('\n');
  }
  function secIndicators(A, ctx) {
    const L = []; if (A.rsi != null) L.push(`- **RSI 14:** ${A.rsi.toFixed(1)} ${A.rsi >= 70 ? '(sobrecompra)' : A.rsi <= 30 ? '(sobreventa)' : A.rsi > 50 ? '(sesgo alcista)' : '(sesgo bajista)'}`);
    if (A.macd.hist != null) L.push(`- **MACD:** histograma ${A.macd.hist > 0 ? 'positivo' : 'negativo'} y ${A.macd.hist > (A.macd.prevHist ?? A.macd.hist) ? 'creciendo' : 'perdiendo fuerza'}`);
    if (A.ema20 != null) L.push(`- **EMA 20 / 50:** ${fp(A.ema20)} / ${fp(A.ema50)} → precio ${A.price > A.ema20 ? 'sobre' : 'bajo'} la EMA 20 y ${A.price > A.ema50 ? 'sobre' : 'bajo'} la EMA 50`);
    if (A.sma200 != null) L.push(`- **Media de 200:** ${fp(A.sma200)} (${sgn(pct(A.price, A.sma200))} del precio)`);
    L.push(`- **Bollinger:** ${(A.bb.pb * 100).toFixed(0)}% dentro del canal · ancho ${A.bb.width.toFixed(1)}%`);
    if (A.atr) L.push(`- **ATR 14:** ${fp(A.atr)} (${A.atrPct.toFixed(2)}% por vela) → volatilidad ${A.atrPct > 2.5 ? 'alta' : A.atrPct > 1 ? 'moderada' : 'baja'} para este marco`);
    if (A.volRatio != null) L.push(`- **Volumen:** ${A.volRatio.toFixed(1)}× el promedio de 20 velas`);
    const V = ctx.values || {};
    if (V.supertrend != null) L.push(`- **Supertrend:** ${V.supertrend > 0 ? 'alcista' : 'bajista'}`); if (V.trailTrend != null) L.push(`- **Smooth Trail (Nova Nexus):** ${V.trailTrend > 0 ? 'alcista' : 'bajista'}`);
    if (V.stochK != null) L.push(`- **Estocástico:** ${V.stochK.toFixed(0)} ${V.stochK > 80 ? '(sobrecompra)' : V.stochK < 20 ? '(sobreventa)' : ''}`);
    if (V.vwap != null) L.push(`- **VWAP:** ${fp(V.vwap)} → precio ${A.price > V.vwap ? 'sobre' : 'bajo'} el VWAP`);
    for (const p of ctx.pine || []) { const pl = (p.plots || []).filter(x => x.value != null).slice(0, 4).map(x => `${x.title}: ${fmt(x.value)}`).join(' · '); if (pl) L.push(`- **${p.name}:** ${pl}`); if (p.table && p.table.length) L.push(`  ${p.table.slice(0, 6).join(' | ')}`); }
    for (const t of A.notes) L.push('- ' + t);
    return L.join('\n');
  }
  function secLevels(A) {
    const fmtL = (x, tag) => `- ${fp(x.p)} (${sgn(pct(x.p, A.price))}) · ${x.k}`;
    const L = ['**Resistencias (arriba):**', ...(A.resists.length ? A.resists.map(fmtL) : ['- sin niveles claros por encima (precio en máximos del rango)']), '**Soportes (abajo):**', ...(A.supports.length ? A.supports.map(fmtL) : ['- sin niveles claros por debajo (precio en mínimos del rango)'])];
    return L.join('\n');
  }
  function secPlan(A) {
    const P = A.plan; if (!P || !P.long) return 'No hay niveles suficientes para plantear escenarios.';
    const lean = A.score >= 12 ? 'long' : A.score <= -12 ? 'short' : null, one = (k, q) => `**${k === 'long' ? 'Escenario alcista' : 'Escenario bajista'}**${lean === k ? ' (el favorecido por los datos)' : ''}: ${k === 'long' ? 'busca' : 'busca'} confirmación ${k === 'long' ? 'sobre' : 'bajo'} el precio actual; invalidación ${k === 'long' ? 'bajo' : 'sobre'} ${fp(q.stop)} (${q.riskPct.toFixed(1)}% de riesgo); objetivos ${fp(q.t1)} y ${fp(q.t2)}; relación beneficio/riesgo al 1.er objetivo ≈ ${q.rr ? q.rr.toFixed(1) : '—'}:1.`;
    const L = [one('long', P.long), one('short', P.short)];
    if (lean == null) L.push('Sin sesgo claro: suele ser mejor esperar a que rompa un nivel con volumen.');
    else { const q = P[lean]; if (q.rr != null && q.rr < 1.2) L.push('⚠ La relación beneficio/riesgo es baja desde aquí; esperar un retroceso a un mejor nivel mejoraría el trade.'); }
    return L.join('\n');
  }
  function secNews(N) {
    if (!N) return '**Noticias:** aún no hay noticias cargadas (abre la sección Noticias para actualizarlas).';
    if (!N.top.length) return `**Noticias:** no hay noticias recientes (36 h) sobre ${N.base} ni de alto impacto cripto.`;
    const ic = s => s > 0 ? '🟢' : s < 0 ? '🔴' : '⚪';
    return [`**Noticias (${N.about ? N.about + ' sobre ' + N.base : 'mercado cripto'}) · tono ${N.tone}:**`, ...N.top.map(i => `- ${ic(i.s)} ${i.title} _(${i.src})_`)].join('\n');
  }
  function secCalendar(C, now) {
    if (!C) return '**Calendario económico:** sin datos disponibles por ahora (puedes consultarlo en la pestaña «Calendario económico» de Noticias).';
    const L = ['**Calendario económico (EE. UU., Eurozona, Reino Unido, Japón, China):**'];
    if (C.soonHigh.length) L.push(`⚠ **Evento de alto impacto en menos de 24 h:** ${C.soonHigh.map(e => C.name(e) + ' (' + whenStr(e.t, now) + ')').join('; ')}. Alrededor de estos datos la volatilidad sube y los niveles técnicos fallan más; conviene reducir tamaño o esperar.`);
    if (C.upcoming.length) L.push(...C.upcoming.slice(0, 6).map(e => `- ${C.imp(e) === 2 ? '🔴' : '🟠'} ${C.name(e)} · ${C.country(e)} · ${whenStr(e.t, now)}${e.forecast ? ' · previsión ' + e.forecast : ''}${e.previous ? ' · previo ' + e.previous : ''}`)); else L.push('- No hay eventos relevantes en las próximas 72 h.');
    if (C.recent.length) L.push('Recientes: ' + C.recent.slice(0, 3).map(e => `${C.name(e)} → real ${e.actual}${e.forecast ? ' vs prev. ' + e.forecast : ''}`).join('; ') + '.');
    return L.join('\n');
  }
  function secRisk(A) {
    const u = A.atr || A.price * .01, L = ['**Gestión de riesgo (referencia):**', `- Volatilidad por vela (ATR): ${fp(u)} (${A.atrPct.toFixed(2)}%). Un stop razonable suele ir a 1–2 ATR o más allá de un nivel técnico: aprox. ${fp(A.price - 1.5 * u)} (largo) / ${fp(A.price + 1.5 * u)} (corto).`, '- Arriesga una fracción pequeña del capital por operación (1–2% es una regla común) y calcula el tamaño con: tamaño = riesgo en dinero ÷ distancia al stop.', '- Evita apalancamiento alto: con ATR ' + A.atrPct.toFixed(1) + '% por vela, un apalancamiento 20× puede liquidarse con un movimiento normal.'];
    return L.join('\n');
  }
  function secVolume(A, ctx) { const L = ['**Volumen:**']; if (A.volRatio != null) L.push(`- La última vela tiene ${A.volRatio.toFixed(1)}× el volumen promedio (20 velas).`); if (ctx.vp && ctx.vp.poc != null) L.push(`- POC del perfil de volumen (nivel donde más se negoció): ${fp(ctx.vp.poc)} (${sgn(pct(ctx.vp.poc, A.price))}). El precio tiende a imantarse hacia el POC y a reaccionar en él.`); else L.push('- Activa «Volume Profile» de Nova Nexus para ver el POC y las zonas de volumen alto/bajo.'); return L.join('\n'); }
  const GLOSS = {rsi: 'El **RSI** (Índice de Fuerza Relativa) mide de 0 a 100 la fuerza de las subidas frente a las bajadas recientes. Sobre 70 suele considerarse sobrecompra y bajo 30 sobreventa; en tendencias fuertes puede quedarse ahí mucho tiempo.', macd: 'El **MACD** compara dos medias móviles (12 y 26). Su histograma positivo y creciente indica impulso alcista; cruces de la línea con su señal marcan cambios de impulso.', ema: 'Una **EMA** es una media móvil que da más peso a los precios recientes. EMA 20/50 sirven de tendencia dinámica: el precio sobre ellas es alcista, bajo ellas bajista.', soporte: 'Un **soporte** es una zona donde el precio ha frenado caídas antes (compradores). Una **resistencia** es lo contrario: donde ha frenado subidas. Cuando se rompen con volumen suelen invertir su papel.', resistencia: 'Una **resistencia** es una zona donde el precio ha frenado subidas antes (vendedores). Al romperla con volumen suele convertirse en soporte.', atr: 'El **ATR** mide la volatilidad media por vela. Se usa para colocar stops y dimensionar posiciones según cuánto se mueve el activo.', vwap: 'El **VWAP** es el precio medio ponderado por volumen. Muchos traders lo usan como referencia de precio "justo" intradía: sobre él, control comprador; bajo él, vendedor.', bollinger: 'Las **bandas de Bollinger** envuelven el precio a 2 desviaciones de una media de 20. Bandas estrechas anticipan volatilidad; tocar una banda no es señal por sí solo.', halving: 'El **halving** de Bitcoin reduce a la mitad la recompensa de los mineros cada ~4 años (210 000 bloques), disminuyendo la emisión de nueva oferta.', liquidez: 'Las **zonas de liquidez** son áreas con muchas órdenes (stops, liquidaciones). El precio suele ir a buscarlas antes de revertir.', divergencia: 'Una **divergencia** ocurre cuando el precio y un oscilador (como el RSI) van en direcciones distintas; puede avisar de pérdida de fuerza de la tendencia.', poc: 'El **POC** (Point of Control) es el nivel de precio con más volumen negociado en el perfil de volumen; actúa como imán y referencia.', perfil: 'El **perfil de volumen** muestra cuánto volumen se negoció en cada nivel de precio, no en cada momento. Las zonas de alto volumen son soportes/resistencias; las de bajo volumen se cruzan rápido.', stablecoin: 'Una **stablecoin** es una cripto cuyo valor busca mantenerse en 1 USD (USDT, USDC). Se usa como refugio y para entrar/salir del mercado sin pasar a banco.', apalancamiento: 'El **apalancamiento** multiplica tu exposición con dinero prestado. Amplifica ganancias y pérdidas y te puede liquidar con movimientos pequeños.'};
  const IN_SCOPE = /(cripto|crypto|bitcoin|btc|eth|ether|sol|bnb|xrp|doge|altcoin|token|blockchain|defi|nft|exchange|binance|stablecoin|usdt|mercado|grafic|chart|vela|tendencia|soporte|resistencia|nivel|zona|indicador|rsi|macd|ema|sma|bollinger|vwap|atr|volumen|perfil|noticia|calendario|fed|fomc|inflacion|ipc|tasas?|nominas|evento|riesgo|stop|long|short|compra|venta|comprar|vender|entrada|entrar|operar|trade|trading|analiza|analisis|resumen|precio|sesgo|alcista|bajista|rebote|ruptura|correccion|liquid|apalanc|halving|pine|nova|nexus|temporalidad|marco|panorama|que ves|como esta|conviene|esperar|hola|ayuda|que puedes|gracias)/;
  function intent(q) {
    const t = norm(q);
    if (/^(hola|buenas|hey|ayuda|que puedes|que haces|como funcionas)/.test(t) || /\b(que puedes hacer|ayuda)\b/.test(t)) return 'help';
    const g = t.match(/(?:que (?:es|son)|explica(?:me)?|significa|define)\s+(?:el |la |los |las |un |una )?([a-z ]{2,24})/); if (g) { const k = Object.keys(GLOSS).find(k => g[1].includes(k)); if (k) return 'gloss:' + k; }
    if (!IN_SCOPE.test(t)) return 'off';
    if (/(noticia|news|titular|sentimiento)/.test(t)) return 'news'; if (/(calendario|evento|fomc|\bfed\b|cpi|ipc|inflacion|nominas|nfp|tasas? de interes|dato macro|powell|pib)/.test(t)) return 'calendar';
    if (/(riesgo|stop|\bsl\b|\btp\b|gestion|tamano|apalanc|liquidar)/.test(t)) return 'risk'; if (/(soporte|resistencia|nivel|zona|objetivo|target|techo|piso)/.test(t)) return 'levels';
    if (/(volumen|perfil|poc|liquidez)/.test(t)) return 'volume'; if (/(comprar|vender|entrar|entrada|long|short|operar|conviene|esperar|trade|operacion|escenario|plan)/.test(t)) return 'plan';
    if (/(rsi|macd|indicador|momentum|sobrecompra|sobreventa|estoc|bollinger|ema|vwap|atr|supertrend)/.test(t)) return 'indicators'; if (/(tendencia|direccion|sesgo|alcista|bajista|estructura)/.test(t)) return 'trend';
    return 'full';
  }
  const HELP = ['Soy tu analista de gráficos cripto. Leo **tu gráfico abierto** (velas, indicadores activados, zonas de Nova Nexus), las **noticias** y el **calendario económico**, y te respondo en español.', '', 'Prueba con:', '- «Analiza el gráfico» · resumen completo', '- «¿Cuál es la tendencia?» · «¿Qué soportes y resistencias ves?»', '- «¿Cómo van mis indicadores?» · «¿Qué dicen las noticias?»', '- «¿Hay eventos del calendario que me afecten?»', '- «¿Qué escenarios ves?» · «¿Cómo manejo el riesgo?»', '- «¿Qué es el RSI?»', '', 'Solo hablo de cripto y de lo que muestran tus datos.'].join('\n');
  function answerLocal(question, ctx, extra) {
    extra = extra || {}; const now = extra.now || Date.now(), it = intent(question), A = analyze(ctx);
    if (it === 'help') return HELP;
    if (it.startsWith('gloss:')) return GLOSS[it.slice(6)];
    if (it === 'off') return 'Solo puedo ayudarte con **cripto**: tu gráfico, indicadores, niveles, noticias y calendario económico. ¿Quieres que analice el gráfico actual?';
    if (!A) return 'Aún no tengo suficientes velas cargadas para analizar (necesito al menos 30). Abre la pestaña **Gráfico**, espera a que carguen y vuelve a preguntarme.';
    const N = newsFor(extra.news, ctx.symbol, now), C = calendarFor(extra.calendar, now), head = secHeader(A, ctx);
    const body = {trend: [secTrend(A)], levels: [secLevels(A)], indicators: [secIndicators(A, ctx)], news: [secNews(N)], calendar: [secCalendar(C, now)], risk: [secRisk(A)], volume: [secVolume(A, ctx)], plan: [secTrend(A), secLevels(A), secPlan(A), C && C.soonHigh.length ? secCalendar(C, now) : '']}[it]
      || [secTrend(A), '#### Indicadores\n' + secIndicators(A, ctx), '#### Niveles clave\n' + secLevels(A), '#### Escenarios\n' + secPlan(A), secNews(N), secCalendar(C, now)];
    return [head, ...body.filter(Boolean), DISC].join('\n\n');
  }

  /* ───────── Modo Claude (opcional) ───────── */
  const SYSTEM = `Eres «Analista CCT», el asistente de VORTEX (Powered by Nova Nexus). Respondes SIEMPRE en español.
ALCANCE: solo el sector cripto (criptomonedas, mercado cripto, análisis técnico del gráfico del usuario, noticias y eventos macro que lo afectan). Si te piden otra cosa, explica amablemente que solo atiendes cripto y reconduce.
BASE: cada afirmación debe apoyarse en los DATOS que se te entregan (velas, indicadores activados por el usuario, zonas, noticias, calendario). Cita el indicador o nivel concreto. Si un dato no está, dilo; no inventes precios, niveles, noticias ni cifras.
ESTILO: claro y directo, con listas cortas; incluye niveles de invalidación y relación beneficio/riesgo cuando propongas escenarios; menciona la incertidumbre y los eventos de calendario cercanos. Nunca prometas resultados ni des órdenes de compra/venta: presenta escenarios educativos. Cierra análisis de operaciones con una línea breve: «Análisis educativo, no asesoría financiera.»
FORMATO: Markdown simple (negritas, listas, ###). Máximo ~350 palabras salvo que pidan más detalle.`;
  function compactContext(ctx, A, extra) {
    const now = extra.now || Date.now(), N = newsFor(extra.news, ctx.symbol, now), C = calendarFor(extra.calendar, now), r = x => x == null ? null : +(+x).toPrecision(7);
    return JSON.stringify({activo: ctx.symbol, marco: ctx.interval, precio: r(ctx.candles[ctx.candles.length - 1].c), cambio24h_pct: ctx.change24h,
      indicadores_activos: ctx.active, valores: ctx.values, zonas: ctx.zones, perfil_volumen: ctx.vp, scripts_pine: ctx.pine,
      analisis_calculado: A && {sesgo: A.bias, puntaje: A.score, confianza: A.confidence, estructura: A.structure, rsi: r(A.rsi), macd_hist: r(A.macd.hist), ema20: r(A.ema20), ema50: r(A.ema50), sma200: r(A.sma200), atr: r(A.atr), volumen_vs_prom: r(A.volRatio), soportes: A.supports.map(s => [r(s.p), s.k]), resistencias: A.resists.map(s => [r(s.p), s.k]), notas: A.notes, plan: A.plan},
      ultimas_velas_OHLCV: ctx.candles.slice(-60).map(c => [c.t, r(c.o), r(c.h), r(c.l), r(c.c), r(c.v)]),
      noticias: N && N.top.map(i => ({titulo: i.title, fuente: i.src, hace_min: Math.round((now - i.t) / 6e4), tono: i.s, impacto: i.impact})),
      calendario: C && {proximos: C.upcoming.map(e => ({evento: C.name(e), pais: C.country(e), en_horas: +((e.t - now) / 36e5).toFixed(1), impacto: e.impact, prevision: e.forecast, previo: e.previous})), recientes: C.recent.map(e => ({evento: C.name(e), real: e.actual, prevision: e.forecast}))}});
  }
  async function askClaude(opts, ctx, history, question, extra) {
    const A = analyze(ctx), msgs = (history || []).slice(-8).map(m => ({role: m.role, content: m.text}));
    msgs.push({role: 'user', content: `DATOS DEL GRÁFICO Y MERCADO (JSON, actualizados ahora):\n${compactContext(ctx, A, extra || {})}\n\nPREGUNTA DEL USUARIO:\n${question}`});
    const url = opts.proxy || 'https://api.anthropic.com/v1/messages', headers = {'content-type': 'application/json'};
    if (!opts.proxy) { headers['x-api-key'] = opts.key; headers['anthropic-version'] = '2023-06-01'; headers['anthropic-dangerous-direct-browser-access'] = 'true'; }
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 60000);
    try {
      const r = await fetch(url, {method: 'POST', headers, signal: ctl.signal, body: JSON.stringify({model: opts.model || 'claude-sonnet-5-5', max_tokens: 1400, system: SYSTEM, messages: msgs})});
      if (!r.ok) { let m = ''; try { const j = await r.json(); m = (j.error && j.error.message) || ''; } catch {} const e = new Error(r.status === 401 ? 'La clave de Claude no es válida.' : r.status === 429 ? 'Se alcanzó el límite de uso de Claude. Intenta en un momento.' : `Error de Claude (${r.status}) ${m}`.trim()); e.status = r.status; throw e; }
      const j = await r.json(); const txt = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim(); if (!txt) throw new Error('Claude no devolvió texto.'); return txt;
    } finally { clearTimeout(to); }
  }

  const api = {analyze, answerLocal, intent, newsFor, calendarFor, sentiment, compactContext, askClaude, SYSTEM, ema, rsi, macd, atr, swings, fmt, trCal, GLOSS};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTAICore = api;
  if (typeof document === 'undefined') return;
  root.CCTAIUI = {api};
})(typeof self !== 'undefined' ? self : this);
