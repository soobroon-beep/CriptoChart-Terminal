/* NOVA BOT LAB · paper trading (simulación hacia adelante con capital virtual). NO envía órdenes reales ni toca fondos.
   Cómo funciona (verificable en tests/botlab-paper.test.js):
   · La sesión congela la versión del bot (su especificación) y arranca PLANA en un instante. Solo se decide con velas cerradas posteriores al inicio.
   · Cada actualización descarga velas cerradas de Binance y avanza el MISMO motor del backtest (entrada en la apertura siguiente, comisiones, deslizamiento, SL/TP).
   · Las operaciones cerradas se anexan a un libro inmutable con cadena de hashes (si alguien lo edita, se detecta). Nada se reescribe hacia atrás.
   · Puede ponerse al día después de días sin abrir la app: el resultado es el mismo que habría salido en vivo (si hay un hueco de datos, se registra). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./botlab-engine.js')); else root.CCTBotPaper = factory(root.CCTBotLab);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (B) {
  'use strict';
  const clone = o => JSON.parse(JSON.stringify(o)), WARM = 420, CAP = 6000;
  const fnv = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
  const core = t => `${t.side}|${t.entryT}|${t.exitT}|${t.entry}|${t.exit}|${Math.round(t.net * 1e6)}`;
  function newSession(o) {
    const spec = B.normalizeSpec(o.spec); return {id: o.id, v: o.v, spec: clone(spec), capital: o.capital, cash: o.capital, peak: o.capital, startT: o.startT, anchorT: o.startT, status: 'running', ledger: [], curve: [[o.startT, o.capital]], open: null, last: null, halted: false, gaps: [], notes: [], pausedAt: null};
  }
  function verify(s) { let h = '0'; for (const t of s.ledger) { h = fnv(h + core(t)); if (t.h !== h) return false; } return true; }
  const thin = (a, n) => { while (a.length > n) { const out = [a[0]]; for (let i = 1; i < a.length - 1; i += 2) out.push(a[i]); out.push(a[a.length - 1]); a = out; } return a; };
  /* Avanza la sesión hasta la última vela cerrada. getCandles(symbol, interval, count) → velas cerradas (orden ascendente). ropts: {nova, user(series alineadas a las velas devueltas)} */
  async function step(s, getCandles, ropts, now) {
    if (s.status !== 'running') return {changed: false, newTrades: 0};
    now = now || Date.now(); const spec = s.spec, iv = B.IV_MS[spec.interval], need = Math.ceil((now - s.anchorT) / iv) + WARM, count = Math.min(CAP, Math.max(WARM + 5, need));
    const C = await getCandles(spec.symbol, spec.interval, count, s); if (!C || C.length < 80) throw new Error('Pocas velas disponibles para ' + spec.symbol);
    let ai = C.findIndex(c => c.t >= s.anchorT); if (ai < 0) return {changed: false, newTrades: 0}; // aún no cerró ninguna vela después del inicio
    if (ai < 300 && need > CAP) { const na = C[Math.min(C.length - 1, 300)].t; s.gaps.push({from: s.anchorT, to: na, why: 'Hueco de datos: la app estuvo cerrada más tiempo del que se puede recalcular'}); s.open = null; s.anchorT = na; ai = C.findIndex(c => c.t >= na); }
    const ropts2 = ropts && ropts.user ? ropts.user : null, sp = clone(spec); sp.risk.capital = s.cash;
    const res = B.backtest(C, sp, {nova: ropts && ropts.nova, user: ropts2 || undefined, tradeFrom: s.halted ? C.length : ai, peak: s.peak, gate: ropts && ropts.gate});
    const oldAnchor = s.anchorT, closed = res.trades.filter(t => !t.open), openT = res.trades.find(t => t.open); let h = s.ledger.length ? s.ledger[s.ledger.length - 1].h : '0';
    for (const t of closed) { h = fnv(h + core(t)); s.ledger.push({n: s.ledger.length + 1, side: t.side, entryT: t.entryT, exitT: t.exitT, entry: t.entry, exit: t.exit, qty: t.qty, sl: t.sl, tp: t.tp, net: t.net, fees: t.fees, r: t.r, bars: t.bars, why: t.why, reasonIn: t.reasonIn, ctx: t.ctx, h}); s.cash += t.net; }
    if (closed.length) { const lastX = closed[closed.length - 1].exitT; for (const p of res.equity) if (p.t <= lastX && p.e > s.peak) s.peak = p.e; s.anchorT = lastX; }
    if (res.halted && !s.halted) { s.halted = true; s.notes.push({t: now, text: 'El módulo de riesgo detuvo las entradas: ' + (typeof res.halted === 'string' ? res.halted : 'límite de drawdown alcanzado')}); }
    const lastC = C[C.length - 1]; s.last = {t: lastC.t, c: lastC.c};
    s.open = openT ? {side: openT.side, entryT: openT.entryT, entry: openT.entry, qty: openT.qty, sl: openT.sl, tp: openT.tp, reasonIn: openT.reasonIn, unreal: openT.net} : null;
    s.curve = s.curve.filter(p => p[0] <= oldAnchor); for (const p of res.equity) if (p.t > oldAnchor && p.t >= s.startT) s.curve.push([p.t, Math.round(p.e * 100) / 100]); s.curve = thin(s.curve, 400);
    return {changed: true, newTrades: closed.length};
  }
  function stats(s) {
    const unreal = s.open ? s.open.unreal : 0, eq = s.cash + unreal, st = B.tradeStats(s.ledger.map(t => ({net: t.net, fees: t.fees})), s.capital); let pk = -Infinity, dd = 0; for (const p of s.curve) { if (p[1] > pk) pk = p[1]; const d = (pk - p[1]) / pk * 100; if (d > dd) dd = d; } if (s.open) { const d = (Math.max(pk, s.cash) - eq) / Math.max(pk, s.cash) * 100; if (d > dd) dd = d; }
    return Object.assign(st, {equity: eq, net: eq - s.capital, retPct: (eq - s.capital) / s.capital * 100, maxDDPct: dd, unreal, days: Math.max(0, ((s.last ? s.last.t : s.startT) - s.startT) / 864e5), nClosed: s.ledger.length});
  }
  return {newSession, step, stats, verify, fnv};
});
