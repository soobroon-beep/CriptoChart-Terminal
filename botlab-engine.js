/* NOVA BOT LAB · motor de estrategias y backtest (puro, sin DOM; se prueba en tests/botlab.test.js).
   Reglas de honestidad del motor:
   · Las señales se evalúan SOLO con velas ya cerradas (índice i) y la orden se ejecuta en la APERTURA de la vela siguiente (i+1): no hay look-ahead.
   · Stop loss / take profit se simulan dentro de la vela; si en una misma vela se tocan ambos, se asume que se tocó primero el STOP (caso conservador).
   · Se descuentan comisión por lado y deslizamiento (slippage) en cada ejecución. Sin apalancamiento por defecto. Las posiciones cortas se simulan sin costo de financiación.
   · Los indicadores usados son causales (cada valor solo usa datos hasta su vela). Los de Nova Nexus se leen con un adaptador de solo lectura.
   · El histórico se divide por tiempo en entrenamiento (60 %) / validación (20 %) / prueba (20 %); las métricas se reportan por tramo. Un resultado en datos históricos NO es una predicción ni una ganancia real. */
(function (root) {
  'use strict';
  const NA = null, isNum = x => typeof x === 'number' && Number.isFinite(x);
  const IV_MS = {'1m': 6e4, '3m': 18e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '2h': 72e5, '4h': 144e5, '6h': 216e5, '8h': 288e5, '12h': 432e5, '1d': 864e5, '3d': 2592e5, '1w': 6048e5};

  /* ───────── Indicadores causales ───────── */
  function ema(v, n) { const o = new Array(v.length).fill(NA), k = 2 / (n + 1); let e = NA, c = 0, s = 0; for (let i = 0; i < v.length; i++) { if (!isNum(v[i])) continue; if (e === NA) { s += v[i]; c++; if (c === n) { e = s / n; o[i] = e; } } else { e = v[i] * k + e * (1 - k); o[i] = e; } } return o; }
  function sma(v, n) { const o = new Array(v.length).fill(NA); let s = 0, c = 0; const q = []; for (let i = 0; i < v.length; i++) { if (!isNum(v[i])) { s = 0; c = 0; q.length = 0; continue; } q.push(v[i]); s += v[i]; if (q.length > n) s -= q.shift(); if (q.length === n) o[i] = s / n; } return o; }
  function rma(v, n) { const o = new Array(v.length).fill(NA); let r = NA, c = 0, s = 0; for (let i = 0; i < v.length; i++) { if (!isNum(v[i])) continue; if (r === NA) { s += v[i]; c++; if (c === n) { r = s / n; o[i] = r; } } else { r = (r * (n - 1) + v[i]) / n; o[i] = r; } } return o; }
  function rsi(cl, n) { const g = [NA], l = [NA]; for (let i = 1; i < cl.length; i++) { const d = cl[i] - cl[i - 1]; g.push(Math.max(d, 0)); l.push(Math.max(-d, 0)); } const ag = rma(g, n), al = rma(l, n); return cl.map((_, i) => ag[i] === NA || al[i] === NA ? NA : al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i])); }
  const trueRange = c => c.map((x, i) => i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)));
  const atr = (c, n) => rma(trueRange(c), n);
  function macd(cl, f, s, g) { const ef = ema(cl, f), es = ema(cl, s), line = cl.map((_, i) => ef[i] !== NA && es[i] !== NA ? ef[i] - es[i] : NA), first = line.findIndex(isNum), sig = new Array(cl.length).fill(NA); if (first >= 0) { const e = ema(line.slice(first), g); e.forEach((x, i) => { sig[first + i] = x; }); } return {line, sig, hist: line.map((x, i) => x !== NA && sig[i] !== NA ? x - sig[i] : NA)}; }
  function bb(cl, n, d) { const m = sma(cl, n), up = [], lo = []; for (let i = 0; i < cl.length; i++) { if (m[i] === NA) { up.push(NA); lo.push(NA); continue; } let s = 0; for (let j = i - n + 1; j <= i; j++) s += (cl[j] - m[i]) ** 2; const sd = Math.sqrt(s / n); up.push(m[i] + d * sd); lo.push(m[i] - d * sd); } return {mid: m, up, lo}; }
  function adx(c, n) { const N = c.length, pdm = [0], mdm = [0]; for (let i = 1; i < N; i++) { const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l; pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0); } const tr = rma(trueRange(c), n), p = rma(pdm, n), m = rma(mdm, n); const dx = c.map((_, i) => tr[i] === NA || !tr[i] ? NA : (() => { const pi = 100 * p[i] / tr[i], mi = 100 * m[i] / tr[i]; return pi + mi === 0 ? 0 : 100 * Math.abs(pi - mi) / (pi + mi); })()); return rma(dx.map(x => x === NA ? NA : x), n); }
  function highest(v, n) { return v.map((_, i) => i < n - 1 ? NA : Math.max(...v.slice(i - n + 1, i + 1))); }
  function lowest(v, n) { return v.map((_, i) => i < n - 1 ? NA : Math.min(...v.slice(i - n + 1, i + 1))); }

  /* ───────── Operandos (lo que puede compararse en una condición) ───────── */
  const OPERANDS = { // etiqueta, parámetros por defecto
    close: {label: 'Precio de cierre'}, open: {label: 'Apertura'}, high: {label: 'Máximo'}, low: {label: 'Mínimo'}, volume: {label: 'Volumen'},
    ema: {label: 'EMA', p: {n: 20}}, sma: {label: 'SMA', p: {n: 50}}, rsi: {label: 'RSI', p: {n: 14}}, atr: {label: 'ATR', p: {n: 14}}, adx: {label: 'ADX', p: {n: 14}},
    macd: {label: 'MACD (línea)', p: {f: 12, s: 26, g: 9}}, macdSignal: {label: 'MACD (señal)', p: {f: 12, s: 26, g: 9}}, macdHist: {label: 'MACD (histograma)', p: {f: 12, s: 26, g: 9}},
    bbUp: {label: 'Banda de Bollinger superior', p: {n: 20, d: 2}}, bbMid: {label: 'Banda de Bollinger media', p: {n: 20, d: 2}}, bbLo: {label: 'Banda de Bollinger inferior', p: {n: 20, d: 2}},
    volRatio: {label: 'Volumen ÷ su media', p: {n: 20}}, hh: {label: 'Máximo de las últimas N velas', p: {n: 20}}, ll: {label: 'Mínimo de las últimas N velas', p: {n: 20}}, num: {label: 'Número', p: {v: 0}},
    novaBuy: {label: 'Señal de COMPRA de Nova Nexus (1 = hay señal en esa vela)', nova: true}, novaSell: {label: 'Señal de VENTA de Nova Nexus (1 = hay señal)', nova: true},
    user: {label: 'Indicador mío (señal o serie)', user: true},
    novaOsc: {label: 'Nova Oscillator', nova: true}, novaFlux: {label: 'Flujo de dinero de Nova Nexus', nova: true}, novaAdx: {label: 'ADX de Nova Nexus', nova: true}, novaBull: {label: 'Nova Nexus: precio sobre la nube EMA (1 = sí)', nova: true}
  };
  const OPS = {gt: 'es mayor que', lt: 'es menor que', gte: 'es mayor o igual que', lte: 'es menor o igual que', crossUp: 'cruza hacia ARRIBA a', crossDown: 'cruza hacia ABAJO a', is: 'está activa'};
  const key = o => o.k + ':' + JSON.stringify(Object.keys(o).filter(x => x !== 'k').sort().map(x => [x, o[x]]));

  function series(C, o, ctx) { // serie del operando sobre todas las velas (cacheada por contexto)
    const id = key(o); if (ctx.cache[id]) return ctx.cache[id]; let s;
    const cl = () => C.map(x => x.c), P = Object.assign({}, (OPERANDS[o.k] || {}).p || {}, o);
    switch (o.k) {
      case 'close': s = cl(); break; case 'open': s = C.map(x => x.o); break; case 'high': s = C.map(x => x.h); break; case 'low': s = C.map(x => x.l); break; case 'volume': s = C.map(x => x.v); break;
      case 'ema': s = ema(cl(), P.n); break; case 'sma': s = sma(cl(), P.n); break; case 'rsi': s = rsi(cl(), P.n); break; case 'atr': s = atr(C, P.n); break; case 'adx': s = adx(C, P.n); break;
      case 'macd': s = macd(cl(), P.f, P.s, P.g).line; break; case 'macdSignal': s = macd(cl(), P.f, P.s, P.g).sig; break; case 'macdHist': s = macd(cl(), P.f, P.s, P.g).hist; break;
      case 'bbUp': s = bb(cl(), P.n, P.d).up; break; case 'bbMid': s = bb(cl(), P.n, P.d).mid; break; case 'bbLo': s = bb(cl(), P.n, P.d).lo; break;
      case 'volRatio': { const m = sma(C.map(x => x.v), P.n); s = C.map((x, i) => m[i] ? x.v / m[i] : NA); break; }
      case 'hh': s = highest(C.map(x => x.h), P.n); break; case 'll': s = lowest(C.map(x => x.l), P.n); break; case 'num': s = C.map(() => +P.v); break;
      case 'user': { const u = ctx.user && ctx.user[o.sid + '|' + o.src]; if (!u) throw new Error('Falta la serie del indicador «' + (o.sname || o.sid) + '». Ejecuta el backtest desde el laboratorio.'); s = u; break; }
      default:
        if (/^nova/.test(o.k)) {
          const nn = ctx.nova && ctx.nova.compute; if (!nn) throw new Error('Nova Nexus no está disponible en este entorno');
          const r = ctx.novaRes || (ctx.novaRes = nn(C, ctx.novaOpts || {})), flat = a => C.map((_, i) => isNum(a && a[i]) ? a[i] : NA);
          s = o.k === 'novaBuy' ? C.map((_, i) => (r.bySignal[i] && r.bySignal[i].side === 'buy') ? 1 : 0) : o.k === 'novaSell' ? C.map((_, i) => (r.bySignal[i] && r.bySignal[i].side === 'sell') ? 1 : 0)
            : o.k === 'novaOsc' ? flat(r.osc) : o.k === 'novaFlux' ? flat(r.flux) : o.k === 'novaAdx' ? flat(r.adx) : C.map((_, i) => r.bull[i] ? 1 : 0);
        } else throw new Error('Operando desconocido: ' + o.k);
    }
    return (ctx.cache[id] = s);
  }
  function condOk(cond, i, C, ctx) { // ¿se cumple la condición en la vela CERRADA i?
    const a = series(C, cond.a, ctx), av = a[i]; if (!isNum(av)) return false;
    if (cond.op === 'is') return av > 0;
    const b = series(C, cond.b, ctx), bv = b[i]; if (!isNum(bv)) return false;
    switch (cond.op) {
      case 'gt': return av > bv; case 'lt': return av < bv; case 'gte': return av >= bv; case 'lte': return av <= bv;
      case 'crossUp': return i > 0 && isNum(a[i - 1]) && isNum(b[i - 1]) && a[i - 1] <= b[i - 1] && av > bv;
      case 'crossDown': return i > 0 && isNum(a[i - 1]) && isNum(b[i - 1]) && a[i - 1] >= b[i - 1] && av < bv;
    }
    return false;
  }

  /* ───────── Especificación de estrategia ───────── */
  const opText = o => { const d = OPERANDS[o.k] || {label: o.k}; if (o.k === 'user') return `${o.sname || 'Indicador mío'} · ${o.sl || o.src}`; if (o.k === 'num') return String(o.v); const P = Object.assign({}, d.p || {}, o); if (/^(ema|sma|rsi|atr|adx|volRatio|hh|ll)$/.test(o.k)) return `${d.label} ${P.n}`; if (/^macd/.test(o.k)) return `${d.label} (${P.f},${P.s},${P.g})`; if (/^bb/.test(o.k)) return `${d.label} (${P.n}, ${P.d}σ)`; return d.label; };
  const condText = c => c.op === 'is' ? `${opText(c.a)}` : `${opText(c.a)} ${OPS[c.op]} ${opText(c.b)}`;
  function defaultSpec() {
    return {v: 1, name: 'Mi bot', symbol: 'BTCUSDT', interval: '1h', sides: 'long', entry: {long: [], short: []}, exit: {long: [], short: []},
      filters: {minVolRatio: 0, minAtrPct: 0, maxAtrPct: 0, hoursUtc: null},
      risk: {capital: 10000, riskPct: 1, sizePct: 10, maxLeverage: 1, atrLen: 14, sl: {type: 'atr', v: 2}, tp: {type: 'rr', v: 2}, trail: null, maxBars: 0, maxDailyLossPct: 0, maxDrawdownPct: 0},
      costs: {feePct: 0.1, slipPct: 0.05}};
  }
  function normalizeSpec(s) { const d = defaultSpec(), o = Object.assign({}, d, s || {}); o.filters = Object.assign({}, d.filters, o.filters); o.risk = Object.assign({}, d.risk, o.risk); o.costs = Object.assign({}, d.costs, o.costs); o.entry = Object.assign({long: [], short: []}, o.entry); o.exit = Object.assign({long: [], short: []}, o.exit); return o; }
  function validateSpec(spec) {
    const s = normalizeSpec(spec), er = [], chkOp = (o, where) => { if (!o || !OPERANDS[o.k]) er.push(`${where}: indicador desconocido`); else if (o.k === 'user' && !(typeof o.sid === 'string' && o.sid && typeof o.src === 'string' && o.src)) er.push(`${where}: elige el indicador y su señal`); else for (const [k, v] of Object.entries(Object.assign({}, OPERANDS[o.k].p || {}, o))) if (k !== 'k' && typeof v === 'number' && (!Number.isFinite(v) || (k !== 'v' && k !== 'd' && v < 1) || v > 5000)) er.push(`${where}: valor fuera de rango (${k} = ${v})`); };
    const chk = (list, where) => list.forEach((c, i) => { if (!OPS[c.op]) er.push(`${where} #${i + 1}: operador inválido`); chkOp(c.a, `${where} #${i + 1}`); if (c.op !== 'is') chkOp(c.b, `${where} #${i + 1}`); });
    if (!/^[A-Z0-9]{5,20}$/.test(s.symbol)) er.push('Símbolo inválido (ej. BTCUSDT)'); if (!IV_MS[s.interval]) er.push('Temporalidad no soportada');
    if (!['long', 'short', 'both'].includes(s.sides)) er.push('Dirección inválida');
    const wantL = s.sides !== 'short', wantS = s.sides !== 'long';
    if (wantL && !s.entry.long.length) er.push('Falta al menos una condición de ENTRADA para compras (largos)'); if (wantS && !s.entry.short.length) er.push('Falta al menos una condición de ENTRADA para ventas (cortos)');
    chk(s.entry.long, 'Entrada larga'); chk(s.entry.short, 'Entrada corta'); chk(s.exit.long, 'Salida larga'); chk(s.exit.short, 'Salida corta');
    const r = s.risk; if (!(r.capital >= 10)) er.push('Capital inicial inválido'); if (!(r.riskPct > 0 && r.riskPct <= 20)) er.push('Riesgo por operación debe estar entre 0 y 20 %'); if (!(r.maxLeverage >= 1 && r.maxLeverage <= 10)) er.push('Apalancamiento máximo entre 1 y 10');
    if (!r.sl && !(r.sizePct > 0 && r.sizePct <= 100)) er.push('Sin stop loss hace falta un tamaño de posición (% del capital)');
    if (r.sl && !(r.sl.v > 0)) er.push('Stop loss inválido'); if (r.tp && !(r.tp.v > 0)) er.push('Take profit inválido'); if (r.trail && !(r.trail.v > 0)) er.push('Trailing stop inválido');
    if (!(s.costs.feePct >= 0 && s.costs.feePct <= 2) || !(s.costs.slipPct >= 0 && s.costs.slipPct <= 5)) er.push('Comisión o slippage fuera de rango');
    return {ok: !er.length, errors: er};
  }
  function describeSpec(spec) { // texto en español con EXACTAMENTE lo que hará el bot (para que el usuario lo confirme antes de probarlo)
    const s = normalizeSpec(spec), L = [], list = (a, sep) => a.length ? a.map(condText).join(sep) : '— (ninguna)', r = s.risk;
    L.push(`**${s.name}** · ${s.symbol} · ${s.interval} · ${s.sides === 'long' ? 'solo compras (largos)' : s.sides === 'short' ? 'solo ventas (cortos)' : 'compras y ventas'}`);
    if (s.sides !== 'short') { L.push(`**Compra** cuando se cumplan TODAS: ${list(s.entry.long, ' Y ')}.`); L.push(`**Cierra la compra** cuando se cumpla ALGUNA: ${s.exit.long.length ? list(s.exit.long, ' O ') : 'solo por stop loss / take profit / trailing' + (r.maxBars ? ' / tiempo máximo' : '')}.`); }
    if (s.sides !== 'long') { L.push(`**Vende (corto)** cuando se cumplan TODAS: ${list(s.entry.short, ' Y ')}.`); L.push(`**Cierra el corto** cuando se cumpla ALGUNA: ${s.exit.short.length ? list(s.exit.short, ' O ') : 'solo por stop loss / take profit / trailing' + (r.maxBars ? ' / tiempo máximo' : '')}.`); }
    const f = s.filters, ev = []; if (f.minVolRatio) ev.push(`volumen < ${f.minVolRatio}× su media`); if (f.minAtrPct) ev.push(`volatilidad (ATR) < ${f.minAtrPct} % del precio`); if (f.maxAtrPct) ev.push(`volatilidad (ATR) > ${f.maxAtrPct} % del precio`); if (f.hoursUtc) ev.push(`fuera del horario ${f.hoursUtc[0]}:00–${f.hoursUtc[1]}:00 UTC`);
    L.push(`**Evita operar** cuando: ${ev.length ? ev.join('; ') : 'no hay filtros (opera siempre que se cumplan las condiciones)'}.`);
    L.push(`**Riesgo:** capital inicial ${r.capital} USDT · ${r.sl ? `arriesga ${r.riskPct} % por operación` : `usa ${r.sizePct} % del capital por operación`} · stop loss ${r.sl ? (r.sl.type === 'atr' ? `${r.sl.v}× ATR(${r.atrLen})` : `${r.sl.v} %`) : 'ninguno'} · take profit ${r.tp ? (r.tp.type === 'rr' ? `${r.tp.v}× el riesgo` : r.tp.type === 'atr' ? `${r.tp.v}× ATR` : `${r.tp.v} %`) : 'ninguno'} · trailing ${r.trail ? (r.trail.type === 'atr' ? `${r.trail.v}× ATR` : `${r.trail.v} %`) : 'no'}${r.maxBars ? ` · máx. ${r.maxBars} velas por operación` : ''}${r.maxDailyLossPct ? ` · pausa el día si pierde ${r.maxDailyLossPct} %` : ''}${r.maxDrawdownPct ? ` · se detiene si el drawdown llega a ${r.maxDrawdownPct} %` : ''}.`);
    L.push(`**Costos simulados:** comisión ${s.costs.feePct} % por lado y slippage ${s.costs.slipPct} %. Las señales usan velas cerradas y se ejecutan en la apertura de la siguiente.`);
    return L.join('\n');
  }

  /* ───────── Backtest ───────── */
  const utcDay = t => Math.floor(t / 864e5);
  function backtest(candles, specIn, opts) {
    opts = opts || {}; const spec = normalizeSpec(specIn), v = validateSpec(spec); if (!v.ok) throw new Error('Estrategia inválida: ' + v.errors.join('; '));
    const C = candles, N = C.length, r = spec.risk, fee = spec.costs.feePct / 100, slip = spec.costs.slipPct / 100, ctx = {cache: {}, nova: opts.nova || root.NovaNexus, novaOpts: opts.novaOpts, user: opts.user || null};
    if (N < 60) throw new Error('Hacen falta al menos 60 velas para evaluar una estrategia');
    const atrS = series(C, {k: 'atr', n: r.atrLen}, ctx), ema200 = series(C, {k: 'ema', n: 200}, ctx), volR = series(C, {k: 'volRatio', n: 20}, ctx);
    const trades = [], avoid = [], eq = new Array(N).fill(0), warnings = []; let cash = r.capital, pos = null, pend = null, peak = opts.peak || r.capital, halted = false, tradeFrom = opts.tradeFrom | 0, dayKey = -1, dayStartCash = cash, dayBlocked = false, start = -1;
    const wouldEnter = i => (spec.sides !== 'short' && spec.entry.long.length && spec.entry.long.every(cd => condOk(cd, i, C, ctx))) ? 'long' : (spec.sides !== 'long' && spec.entry.short.length && spec.entry.short.every(cd => condOk(cd, i, C, ctx))) ? 'short' : null; // para marcar señales que se DESCARTARON
    const entryReason = side => (side === 'long' ? spec.entry.long : spec.entry.short).map(condText).join(' Y ');
    const close = (px, i, why, flagOpen) => { // cierra la posición con costos
      const dir = pos.side === 'long' ? 1 : -1, exitFee = px * pos.qty * fee, gross = (px - pos.entry) * pos.qty * dir; cash += gross - exitFee;
      const net = gross - pos.fee - exitFee, risk = pos.risk;
      trades.push({id: trades.length + 1, side: pos.side, entryBar: pos.bar, exitBar: i, entryT: C[pos.bar].t, exitT: C[i].t, entry: pos.entry, exit: px, qty: pos.qty, sl: pos.sl0, tp: pos.tp, gross, fees: pos.fee + exitFee, net, r: risk ? net / risk : null, retPct: net / (pos.entry * pos.qty) * 100, bars: i - pos.bar, why, reasonIn: pos.reason, open: !!flagOpen, ctx: pos.ctx});
      pos = null;
    };
    for (let i = 1; i < N; i++) {
      const c = C[i], dk = utcDay(c.t); if (dk !== dayKey) { dayKey = dk; dayStartCash = cash; dayBlocked = false; }
      // 1) órdenes pendientes (decididas con la vela cerrada i-1) se ejecutan en la APERTURA de i
      if (pend) {
        if (pend.type === 'exit' && pos) close(pos.side === 'long' ? c.o * (1 - slip) : c.o * (1 + slip), i, pend.why);
        else if (pend.type === 'enter' && !pos && !halted) {
          const long = pend.side === 'long', px = long ? c.o * (1 + slip) : c.o * (1 - slip), a = pend.atr;
          const slD = r.sl ? (r.sl.type === 'atr' ? (a ? a * r.sl.v : NaN) : px * r.sl.v / 100) : NaN;
          if (r.sl && !(slD > 0)) { /* sin ATR válido: no se opera */ }
          else {
            const sl = r.sl ? (long ? px - slD : px + slD) : NA, tpD = r.tp ? (r.tp.type === 'rr' ? (r.sl ? slD * r.tp.v : NaN) : r.tp.type === 'atr' ? a * r.tp.v : px * r.tp.v / 100) : NaN, tp = isNum(tpD) && tpD > 0 ? (long ? px + tpD : px - tpD) : NA;
            let qty = r.sl ? (cash * r.riskPct / 100) / Math.abs(px - sl) : (cash * r.sizePct / 100) / px; const maxQty = cash * r.maxLeverage / (px * (1 + fee)); if (qty > maxQty) qty = maxQty;
            if (qty > 0 && isFinite(qty)) { const f = px * qty * fee; cash -= f; pos = {side: pend.side, entry: px, qty, sl, sl0: sl, tp, bar: i, fee: f, risk: r.sl ? Math.abs(px - sl) * qty : null, reason: pend.reason, hi: c.h, lo: c.l, ctx: pend.ctx}; if (start < 0) start = i; }
          }
        }
        pend = null;
      }
      // 2) SL / TP dentro de la vela i (si ambos: primero el stop)
      if (pos) {
        const long = pos.side === 'long';
        if (isNum(pos.sl) && (long ? c.l <= pos.sl : c.h >= pos.sl)) close(long ? Math.min(pos.sl, c.o) * (1 - slip) : Math.max(pos.sl, c.o) * (1 + slip), i, pos.sl === pos.sl0 ? 'Stop loss' : 'Trailing stop');
        else if (isNum(pos.tp) && (long ? c.h >= pos.tp : c.l <= pos.tp)) close(long ? Math.max(pos.tp, Math.min(c.o, c.h)) : Math.min(pos.tp, Math.max(c.o, c.l)), i, 'Take profit');
        else if (r.maxBars && i - pos.bar >= r.maxBars) { /* se cierra en la apertura de i+1 vía señal de tiempo */ }
      }
      // 3) valor de la cuenta al cierre de la vela
      let unreal = 0; if (pos) unreal = (c.c - pos.entry) * pos.qty * (pos.side === 'long' ? 1 : -1);
      if (i === N - 1 && pos) { close(c.c, i, 'Fin de los datos (posición aún abierta)', true); unreal = 0; }
      eq[i] = cash + unreal; if (eq[i] > peak) peak = eq[i];
      if (r.maxDrawdownPct && !halted && (peak - eq[i]) / peak * 100 >= r.maxDrawdownPct) { halted = true; warnings.push(`El bot se detuvo el ${new Date(c.t).toISOString().slice(0, 10)}: el drawdown alcanzó ${r.maxDrawdownPct} %.`); if (pos) pend = {type: 'exit', why: 'Límite de drawdown'}; }
      if (r.maxDailyLossPct && (dayStartCash - cash) / dayStartCash * 100 >= r.maxDailyLossPct) dayBlocked = true;
      if (pos && !pos.moved && false) {}
      // 4) trailing: usa los extremos hasta la vela i; rige desde la i+1
      if (pos) {
        pos.hi = Math.max(pos.hi, c.h); pos.lo = Math.min(pos.lo, c.l);
        if (r.trail) { const d = r.trail.type === 'atr' ? (atrS[i] ? atrS[i] * r.trail.v : NaN) : c.c * r.trail.v / 100; if (d > 0) { if (pos.side === 'long') pos.sl = isNum(pos.sl) ? Math.max(pos.sl, pos.hi - d) : pos.hi - d; else pos.sl = isNum(pos.sl) ? Math.min(pos.sl, pos.lo + d) : pos.lo + d; } }
      }
      // 5) señales con la vela cerrada i → orden para la apertura de i+1
      if (i < N - 1 && !pend && i >= tradeFrom) { // tradeFrom: paper trading (no se decide nada antes del inicio de la sesión)
        if (pos) {
          const ex = pos.side === 'long' ? spec.exit.long : spec.exit.short, hit = ex.find(cd => condOk(cd, i, C, ctx));
          if (hit) pend = {type: 'exit', why: 'Regla de salida: ' + condText(hit)}; else if (r.maxBars && i + 1 - pos.bar >= r.maxBars) pend = {type: 'exit', why: `Tiempo máximo (${r.maxBars} velas)`};
        } else if (!halted && !dayBlocked) {
          const f = spec.filters, hr = new Date(c.t).getUTCHours(), ap = atrS[i] ? atrS[i] / c.c * 100 : null;
          const blocked = (f.minVolRatio && !(volR[i] >= f.minVolRatio)) || (f.minAtrPct && !(ap >= f.minAtrPct)) || (f.maxAtrPct && !(ap <= f.maxAtrPct)) || (f.hoursUtc && !(f.hoursUtc[0] <= f.hoursUtc[1] ? hr >= f.hoursUtc[0] && hr < f.hoursUtc[1] : hr >= f.hoursUtc[0] || hr < f.hoursUtc[1]));
          if (!blocked) {
            const tryS = side => { const L = side === 'long' ? spec.entry.long : spec.entry.short; return L.length && L.every(cd => condOk(cd, i, C, ctx)); };
            const mk = side => ({type: 'enter', side, atr: atrS[i], reason: entryReason(side), ctx: {trend: isNum(ema200[i]) ? (c.c > ema200[i] ? 'alcista' : 'bajista') : 'sin dato', vol: ap == null ? 'sin dato' : ap < .3 ? 'baja' : ap < .8 ? 'media' : 'alta', hour: hr}});
            const sd = (spec.sides !== 'short' && tryS('long')) ? 'long' : (spec.sides !== 'long' && tryS('short')) ? 'short' : null;
            if (sd) { const why = opts.gate ? opts.gate(c.t, sd) : null; if (why) { if (avoid.length < 400 && i >= tradeFrom) avoid.push([c.t, 'Riesgo global: ' + why, sd]); } else pend = mk(sd); } // gate: veto del módulo de riesgo independiente (paper trading)
          } else if (avoid.length < 400 && i >= tradeFrom) { const w = wouldEnter(i); if (w) avoid.push([c.t, f.minVolRatio && !(volR[i] >= f.minVolRatio) ? 'Volumen por debajo del mínimo' : (f.minAtrPct && !(ap >= f.minAtrPct)) || (f.maxAtrPct && !(ap <= f.maxAtrPct)) ? 'Volatilidad fuera de rango' : 'Fuera del horario permitido', w]); }
        } else if (avoid.length < 400 && i >= tradeFrom) { const w = wouldEnter(i); if (w) avoid.push([c.t, halted ? 'Bot detenido por límite de drawdown' : 'Límite de pérdida diaria alcanzado', w]); }
      }
    }
    if (start < 0) start = Math.min(N - 1, 1);
    if (tradeFrom > start) start = Math.min(N - 1, tradeFrom);
    const out = {avoid, spec, bars: N, from: C[0].t, to: C[N - 1].t, trades, equity: eq.map((e, i) => ({t: C[i].t, e: i === 0 ? r.capital : e})), warnings, halted, capital: r.capital, interval: spec.interval, symbol: spec.symbol};
    out.metrics = metrics(trades, out.equity, r.capital, C, start); out.segments = segments(C, trades, out.equity, r.capital, start); out.buyHold = buyHold(C, start, r.capital, fee, slip); out.daily = dailyStats(out.equity, trades); out.breakdown = breakdown(trades);
    if (trades.length < 30) warnings.push(`Solo ${trades.length} operaciones: la muestra es demasiado pequeña para sacar conclusiones fiables.`);
    out.verdict = verdict(out); return out;
  }
  function maxDD(curve) { let pk = -Infinity, mdd = 0, mddPct = 0; for (const e of curve) { if (e > pk) pk = e; const d = pk - e; if (d > mdd) { mdd = d; mddPct = pk ? d / pk * 100 : 0; } } return {abs: mdd, pct: mddPct}; }
  function tradeStats(trades, capital) { // métricas calculadas SOLO con las operaciones (sirven por tramo)
    const n = trades.length, w = trades.filter(t => t.net > 0), l = trades.filter(t => t.net <= 0), gw = w.reduce((a, t) => a + t.net, 0), gl = -l.reduce((a, t) => a + t.net, 0), net = trades.reduce((a, t) => a + t.net, 0);
    let run = capital, curve = [capital]; for (const t of trades) { run += t.net; curve.push(run); } const dd = maxDD(curve);
    return {n, wins: w.length, losses: l.length, winRate: n ? w.length / n * 100 : null, net, retPct: net / capital * 100, profitFactor: gl > 0 ? gw / gl : (gw > 0 ? null : null), pfInf: gl === 0 && gw > 0, avgWin: w.length ? gw / w.length : null, avgLoss: l.length ? -gl / l.length : null,
      rr: w.length && l.length ? (gw / w.length) / (gl / l.length) : null, expectancy: n ? net / n : null, fees: trades.reduce((a, t) => a + t.fees, 0), maxDD: dd.abs, maxDDPct: dd.pct};
  }
  function metrics(trades, equity, capital, C, start) {
    const m = tradeStats(trades, capital), dd = maxDD(equity.map(x => x.e)), last = equity[equity.length - 1].e;
    return Object.assign(m, {capital, finalEquity: last, net: last - capital, retPct: (last - capital) / capital * 100, maxDD: dd.abs, maxDDPct: dd.pct, bars: C.length - start, days: Math.max(1, Math.round((C[C.length - 1].t - C[start].t) / 864e5)),
      exposurePct: C.length - start > 0 ? trades.reduce((a, t) => a + t.bars, 0) / (C.length - start) * 100 : 0, slipEst: null});
  }
  function segments(C, trades, equity, capital, start) { // temporal: entrenamiento 60 % · validación 20 % · prueba 20 %
    const N = C.length, span = N - start, b1 = start + Math.floor(span * .6), b2 = start + Math.floor(span * .8), mk = (name, a, b) => { const tr = trades.filter(t => t.entryBar >= a && t.entryBar < b); return Object.assign({name, from: C[a].t, to: C[b - 1].t, fromBar: a, toBar: b}, tradeStats(tr, capital)); };
    return {train: mk('Entrenamiento', start, b1), val: mk('Validación', b1, b2), test: mk('Prueba', b2, N)};
  }
  function buyHold(C, start, capital, fee, slip) {
    const e = C[Math.min(C.length - 1, start)].o * (1 + slip), x = C[C.length - 1].c * (1 - slip), qty = capital * (1 - fee) / e, final = qty * x * (1 - fee); let pk = -Infinity, mdd = 0; for (let i = start; i < C.length; i++) { const v = qty * C[i].c; if (v > pk) pk = v; if ((pk - v) / pk * 100 > mdd) mdd = (pk - v) / pk * 100; }
    return {final, retPct: (final - capital) / capital * 100, maxDDPct: mdd};
  }
  function dailyStats(equity, trades) {
    const days = new Map(); for (const p of equity) { const k = utcDay(p.t); const d = days.get(k) || {first: p.e, last: p.e, trades: 0}; d.last = p.e; days.set(k, d); } for (const t of trades) { const d = days.get(utcDay(t.exitT)); if (d) d.trades++; }
    let prev = equity[0].e, pos = 0, neg = 0, flat = 0; const ret = []; for (const [, d] of days) { const ch = d.last - prev; prev = d.last; ret.push({ch}); if (d.trades === 0 && Math.abs(ch) < 1e-9) flat++; else if (ch > 0) pos++; else if (ch < 0) neg++; else flat++; }
    return {days: days.size, pos, neg, flat};
  }
  function breakdown(trades) { // rendimiento por horario y condiciones de mercado (solo con operaciones reales del backtest)
    const g = (f) => { const m = {}; for (const t of trades) { const k = f(t); (m[k] = m[k] || {n: 0, net: 0, wins: 0}); m[k].n++; m[k].net += t.net; if (t.net > 0) m[k].wins++; } return m; };
    return {hour: g(t => Math.floor((t.ctx ? t.ctx.hour : new Date(t.entryT).getUTCHours()) / 4) * 4), trend: g(t => t.ctx ? t.ctx.trend : 'sin dato'), vol: g(t => t.ctx ? t.ctx.vol : 'sin dato'), side: g(t => t.side)};
  }
  function verdict(res) { // etiqueta honesta: diferencia lo histórico de lo confirmado fuera de muestra
    const s = res.segments, n = res.trades.length;
    if (n < 30) return {level: 'insuficiente', text: 'Muestra insuficiente (menos de 30 operaciones). No se puede concluir nada.'};
    const oos = [s.val, s.test].filter(x => x.n >= 5);
    if (!oos.length) return {level: 'insuficiente', text: 'Muy pocas operaciones fuera de entrenamiento para validar.'};
    const okV = oos.every(x => x.net > 0 && (x.profitFactor == null || x.profitFactor >= 1.1)), loss = oos.some(x => x.net <= 0);
    if (res.metrics.net <= 0) return {level: 'pierde', text: 'La estrategia pierde dinero en este histórico.'};
    if (okV) return {level: 'consistente', text: 'Positiva también en validación y prueba (fuera de entrenamiento). Sigue sin ser una garantía: confírmala en paper trading.'};
    return {level: 'no-confirmada', text: loss ? 'Gana en el histórico total pero NO se confirma en validación/prueba: posible sobreajuste.' : 'Resultado fuera de muestra débil.'};
  }

  /* ───────── Plantillas para empezar ───────── */
  const PRESETS = {
    emaRsi: () => Object.assign(defaultSpec(), {name: 'EMA 20/50 + RSI', entry: {long: [{a: {k: 'ema', n: 20}, op: 'crossUp', b: {k: 'ema', n: 50}}, {a: {k: 'rsi', n: 14}, op: 'gt', b: {k: 'num', v: 50}}], short: []}, exit: {long: [{a: {k: 'ema', n: 20}, op: 'crossDown', b: {k: 'ema', n: 50}}], short: []}}),
    novaNexus: () => Object.assign(defaultSpec(), {name: 'Nova Nexus + volumen', entry: {long: [{a: {k: 'novaBuy'}, op: 'is'}, {a: {k: 'volRatio', n: 20}, op: 'gt', b: {k: 'num', v: 1}}], short: []}, exit: {long: [{a: {k: 'novaSell'}, op: 'is'}], short: []}}),
    macdTrend: () => Object.assign(defaultSpec(), {name: 'Tendencia + MACD', entry: {long: [{a: {k: 'close'}, op: 'gt', b: {k: 'ema', n: 200}}, {a: {k: 'macd'}, op: 'crossUp', b: {k: 'macdSignal'}}], short: []}, exit: {long: [{a: {k: 'macd'}, op: 'crossDown', b: {k: 'macdSignal'}}], short: []}})
  };

  const api = {IV_MS, OPERANDS, OPS, ema, sma, rsi, atr, macd, bb, adx, backtest, tradeStats, defaultSpec, normalizeSpec, validateSpec, describeSpec, condText, opText, PRESETS, series, maxDD};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTBotLab = api;
})(typeof self !== 'undefined' ? self : this);
