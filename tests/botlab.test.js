const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../botlab-engine.js');
let Nova = null; try { require('../nova-nexus.js'); Nova = globalThis.NovaNexus; } catch {}
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function walk(n, seed = 1, drift = 0, vol = .01, start = 100) { const r = rng(seed), out = []; let p = start; const t0 = Date.UTC(2025, 0, 1); for (let i = 0; i < n; i++) { const o = p, c = o * (1 + drift + (r() - .5) * 2 * vol), h = Math.max(o, c) * (1 + r() * vol / 2), l = Math.min(o, c) * (1 - r() * vol / 2); out.push({t: t0 + i * 36e5, o, h, l, c, v: 100 + r() * 50}); p = c; } return out; }
const base = (o = {}) => { const s = B.defaultSpec(); s.entry.long = [{a: {k: 'close'}, op: 'gt', b: {k: 'ema', n: 20}}]; s.exit.long = [{a: {k: 'close'}, op: 'lt', b: {k: 'ema', n: 20}}]; return Object.assign(s, o); };

test('validateSpec y describeSpec: reglas claras y errores explícitos', () => {
  assert.equal(B.validateSpec(B.defaultSpec()).ok, false); // sin condiciones de entrada
  assert.ok(B.validateSpec(base()).ok);
  const bad = base(); bad.entry.long = [{a: {k: 'inventado'}, op: 'gt', b: {k: 'num', v: 1}}]; assert.equal(B.validateSpec(bad).ok, false);
  const d = B.describeSpec(base()); assert.match(d, /Compra/); assert.match(d, /EMA 20/); assert.match(d, /Evita operar/); assert.match(d, /velas cerradas/);
});
test('es determinista (mismo dato, mismo resultado)', () => {
  const c = walk(600, 7), a = B.backtest(c, base()), b = B.backtest(c, base());
  assert.deepEqual(a.trades, b.trades); assert.equal(a.metrics.finalEquity, b.metrics.finalEquity);
});
test('SIN look-ahead: la entrada ocurre en la apertura de la vela SIGUIENTE a la señal', () => {
  const c = walk(500, 3), spec = base(); spec.costs = {feePct: 0, slipPct: 0}; const res = B.backtest(c, spec), ema20 = B.ema(c.map(x => x.c), 20);
  assert.ok(res.trades.length > 3);
  for (const t of res.trades) { const sig = t.entryBar - 1; assert.ok(c[sig].c > ema20[sig], 'la señal existía con la vela cerrada anterior'); assert.equal(t.entry, c[t.entryBar].o); }
});
test('SIN look-ahead: recortar el futuro no cambia las operaciones ya cerradas (invariancia de prefijo)', () => {
  const c = walk(700, 11), full = B.backtest(c, base()), cut = 500, part = B.backtest(c.slice(0, cut), base());
  const closed = tr => tr.filter(t => t.exitBar < cut - 1 && !t.open).map(t => [t.entryBar, t.exitBar, t.entry, t.exit, t.net]);
  assert.deepEqual(closed(full.trades), closed(part.trades)); assert.ok(closed(part.trades).length > 2);
});
test('adaptador de Nova Nexus es causal (las señales hasta k no cambian al recortar el futuro)', { skip: !Nova }, () => {
  const c = walk(900, 5, 0, .015), k = 600, f = Nova.compute(c, {}), p = Nova.compute(c.slice(0, k), {});
  const sig = r => r.signals.filter(s => s.i < k - 1).map(s => [s.i, s.side]); assert.deepEqual(sig(f), sig(p));
  const spec = B.PRESETS.novaNexus(); const res = B.backtest(c, spec, {nova: Nova}); assert.ok(res.metrics.n >= 0);
});
test('costos: comisión y slippage reducen el resultado exactamente', () => {
  const c = []; const t0 = Date.UTC(2025, 0, 1); for (let i = 0; i < 80; i++) { const p = 100 + i; c.push({t: t0 + i * 36e5, o: p, h: p + 1, l: p - 1, c: p + .5, v: 100}); }
  const s0 = base(); s0.costs = {feePct: 0, slipPct: 0}; s0.risk.sl = null; s0.risk.tp = null; s0.risk.sizePct = 50; s0.entry.long = [{a: {k: 'close'}, op: 'gt', b: {k: 'ema', n: 5}}]; s0.exit.long = [];
  const s1 = JSON.parse(JSON.stringify(s0)); s1.costs = {feePct: 0.1, slipPct: 0.05};
  const a = B.backtest(c, s0), b = B.backtest(c, s1); assert.equal(a.trades.length, 1); assert.ok(a.trades[0].net > 0); assert.ok(b.trades[0].net < a.trades[0].net);
  const t = b.trades[0]; assert.ok(Math.abs(t.fees - (t.entry * t.qty * .001 + t.exit * t.qty * .001)) < 1e-6);
  assert.ok(Math.abs(t.entry - c[t.entryBar].o * 1.0005) < 1e-9);
});
test('si en una misma vela se tocan stop y take profit, cuenta el STOP (caso conservador)', () => {
  const c = []; const t0 = Date.UTC(2025, 0, 1); for (let i = 0; i < 70; i++) { const p = 100 + i * .1; c.push({t: t0 + i * 36e5, o: p, h: p + .1, l: p - .1, c: p + .05, v: 100}); }
  c[41] = {t: c[41].t, o: 105, h: 130, l: 90, c: 105, v: 100}; // vela enorme: toca SL y TP
  const s = base(); s.costs = {feePct: 0, slipPct: 0}; s.entry.long = [{a: {k: 'close'}, op: 'gt', b: {k: 'num', v: 0}}]; s.exit.long = []; s.risk.sl = {type: 'pct', v: 5}; s.risk.tp = {type: 'pct', v: 5}; s.risk.maxBars = 0;
  const res = B.backtest(c, s), t = res.trades.find(x => x.entryBar === 41 || x.exitBar === 41); assert.ok(t); const w = res.trades.filter(x => x.exitBar === 41); assert.ok(w.length && w.every(x => x.why === 'Stop loss' && x.net < 0));
});
test('una estrategia de compra en un mercado que cae PIERDE y se reporta como tal', () => {
  const c = walk(800, 21, -0.002, .008), s = base(); s.entry.long = [{a: {k: 'close'}, op: 'gt', b: {k: 'num', v: 0}}]; s.exit.long = []; const res = B.backtest(c, s);
  assert.ok(res.metrics.net < 0 && res.metrics.retPct < 0); assert.equal(res.verdict.level === 'pierde' || res.verdict.level === 'insuficiente', true); assert.ok(res.metrics.maxDDPct > 0);
});
test('en tendencia alcista fuerte una estrategia de tendencia gana y supera costos', () => {
  const c = walk(800, 4, 0.0015, .004), res = B.backtest(c, base()); assert.ok(res.metrics.net > 0); assert.ok(res.buyHold.retPct > 0);
});
test('límite de drawdown detiene el bot', () => {
  const c = walk(800, 21, -0.002, .008), s = base(); s.entry.long = [{a: {k: 'close'}, op: 'gt', b: {k: 'num', v: 0}}]; s.exit.long = []; s.risk.maxDrawdownPct = 2;
  const res = B.backtest(c, s); assert.equal(res.halted, true); assert.ok(res.warnings.some(w => /se detuvo/.test(w)));
});
test('segmentos 60/20/20 reparten TODAS las operaciones sin solaparse; métricas coherentes', () => {
  const c = walk(1200, 9, 0.0003, .01), res = B.backtest(c, base()), s = res.segments;
  assert.equal(s.train.n + s.val.n + s.test.n, res.trades.length); assert.ok(s.train.toBar === s.val.fromBar && s.val.toBar === s.test.fromBar);
  const m = res.metrics; assert.equal(m.wins + m.losses, m.n); assert.ok(Math.abs(m.finalEquity - (m.capital + res.trades.reduce((a, t) => a + t.net, 0))) < 1e-6);
  assert.ok(['insuficiente', 'pierde', 'consistente', 'no-confirmada'].includes(res.verdict.level));
});
test('shorts: un corto gana cuando el precio cae', () => {
  const c = walk(800, 21, -0.002, .006), s = B.defaultSpec(); s.sides = 'short'; s.entry.short = [{a: {k: 'close'}, op: 'lt', b: {k: 'ema', n: 20}}]; s.exit.short = [{a: {k: 'close'}, op: 'gt', b: {k: 'ema', n: 20}}];
  const res = B.backtest(c, s); assert.ok(res.trades.every(t => t.side === 'short')); assert.ok(res.metrics.net > 0);
});
test('pocas velas o poca muestra: avisa en vez de inventar', () => {
  assert.throws(() => B.backtest(walk(30), base()), /60 velas/);
  const res = B.backtest(walk(200, 2, 0, .01), base()); assert.ok(res.warnings.some(w => /muestra/i.test(w)) || res.trades.length >= 30);
});
