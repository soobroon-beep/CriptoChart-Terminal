/* NOVA BOT LAB · módulo de riesgo INDEPENDIENTE (a nivel de cartera, por encima de cada bot).
   Vigila TODAS las sesiones de paper trading activas juntas y puede vetar entradas nuevas (nunca toca posiciones ni versiones).
   Límites: pérdida diaria total, drawdown total, posiciones abiertas simultáneas, exposición total, interruptor de emergencia.
   Es independiente del motor de cada bot: lo usan la app y el servidor con la misma lógica (tests/botlab-risk.test.js).
   Limitaciones honestas: se evalúa al actualizar cada sesión (no intravela) y no puede bloquear con efecto retroactivo velas que se procesaron en una puesta al día. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./botlab-engine.js')); else root.CCTBotRisk = factory(root.CCTBotLab);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (B) {
  'use strict';
  const DEF = {maxDailyLossPct: 0, maxDrawdownPct: 0, maxOpen: 0, maxExposurePct: 0, kill: false, peak: 0, updatedAt: 0, log: []};
  const norm = r => Object.assign({}, DEF, r || {}, {log: Array.isArray(r && r.log) ? r.log : []});
  const day = t => Math.floor(t / 864e5), num = x => Number.isFinite(x) ? x : 0;
  function portfolio(sessions, risk, now) {
    const R = norm(risk), run = (sessions || []).filter(s => s && s.status === 'running'), cap = run.reduce((a, s) => a + s.capital, 0);
    const eq = run.reduce((a, s) => a + s.cash + (s.open ? num(s.open.unreal) : 0), 0), d = day(now);
    const dayPnl = run.reduce((a, s) => a + s.ledger.filter(t => day(t.exitT) === d).reduce((x, t) => x + t.net, 0) + (s.open ? num(s.open.unreal) : 0), 0);
    const openN = run.filter(s => s.open).length, expo = cap > 0 ? run.reduce((a, s) => a + (s.open ? Math.abs(s.open.entry * s.open.qty) : 0), 0) / cap * 100 : 0;
    const peak = Math.max(R.peak || 0, eq, cap), dd = peak > 0 ? (peak - eq) / peak * 100 : 0, dayPct = cap > 0 ? dayPnl / cap * 100 : 0, br = [];
    if (R.kill) br.push({rule: 'kill', text: 'Interruptor de emergencia activado'});
    if (R.maxDailyLossPct && dayPct <= -R.maxDailyLossPct) br.push({rule: 'daily', text: `Pérdida diaria total ${dayPct.toFixed(2)} % (límite ${R.maxDailyLossPct} %)`});
    if (R.maxDrawdownPct && dd >= R.maxDrawdownPct) br.push({rule: 'dd', text: `Drawdown total ${dd.toFixed(2)} % (límite ${R.maxDrawdownPct} %)`});
    if (R.maxOpen && openN >= R.maxOpen) br.push({rule: 'open', text: `Ya hay ${openN} posiciones abiertas (límite ${R.maxOpen})`});
    if (R.maxExposurePct && expo >= R.maxExposurePct) br.push({rule: 'expo', text: `Exposición total ${expo.toFixed(0)} % (límite ${R.maxExposurePct} %)`});
    return {sessions: run.length, capital: cap, equity: eq, dayPnl, dayPct, dd, peak, openN, expo, breaches: br, blocked: br.length > 0};
  }
  /* Fábrica de «gate» para el motor: gateFor(risk, todasLasSesiones, ahora)(sesión) → (t, lado) → motivo | null. Solo veta las 2 velas más recientes. */
  function gateFor(risk, sessions, now) {
    const p = portfolio(sessions, risk, now); if (!p.blocked) return () => null;
    return sess => { const iv = B.IV_MS[sess.spec.interval] || 36e5; return t => (t + 2 * iv >= now ? p.breaches.map(b => b.text).join(' · ') : null); };
  }
  return {portfolio, gateFor, norm, DEF};
});
