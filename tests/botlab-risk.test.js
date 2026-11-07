const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../botlab-engine.js'), R = require('../botlab-risk.js'), P = require('../botlab-paper.js');
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function walk(n, seed = 1) { const r = rng(seed), out = []; let p = 100; const t0 = Date.UTC(2025, 0, 1); for (let i = 0; i < n; i++) { const o = p, c = o * (1 + (r() - .5) * .02 + Math.sin(i / 25) * .004); out.push({t: t0 + i * 3600e3, o, h: Math.max(o, c) * 1.002, l: Math.min(o, c) * .998, c, v: 1000 + r() * 500}); p = c; } return out; }
const spec = () => { const s = B.defaultSpec(); s.entry.long = [{a: {k: 'ema', n: 10}, op: 'crossUp', b: {k: 'ema', n: 30}}]; s.exit.long = [{a: {k: 'ema', n: 10}, op: 'crossDown', b: {k: 'ema', n: 30}}]; return s; };
const sess = (o = {}) => Object.assign({id: 'x', status: 'running', capital: 10000, cash: 10000, ledger: [], open: null, spec: spec()}, o);
const NOW = Date.UTC(2026, 10, 7, 12);

test('cartera: suma sesiones activas, ignora pausadas y calcula pérdida del día, drawdown y exposición', () => {
  const a = sess({cash: 9700, ledger: [{exitT: NOW - 3600e3, net: -300}], open: {entry: 100, qty: 20, unreal: -50}}), b = sess({id: 'y', status: 'paused', cash: 1}), c = sess({id: 'z', ledger: [{exitT: NOW - 3 * 864e5, net: -500}], cash: 9500});
  const p = R.portfolio([a, b, c], {}, NOW); assert.equal(p.sessions, 2); assert.equal(p.capital, 20000); assert.equal(p.equity, 9700 - 50 + 9500); assert.equal(p.dayPnl, -300 - 50); assert.equal(p.openN, 1); assert.ok(Math.abs(p.expo - 2000 / 20000 * 100) < 1e-9);
  assert.ok(p.dd > 0); assert.deepEqual(p.breaches, []);
});
test('límites: cada regla se activa donde debe, y el interruptor bloquea todo', () => {
  const a = sess({cash: 9000, ledger: [{exitT: NOW - 1000, net: -1000}]}), b = sess({id: 'y', open: {entry: 100, qty: 100, unreal: 0}});
  const rules = r => R.portfolio([a, b], r, NOW).breaches.map(x => x.rule);
  assert.deepEqual(rules({}), []); assert.ok(rules({maxDailyLossPct: 4}).includes('daily')); assert.ok(!rules({maxDailyLossPct: 6}).includes('daily')); assert.ok(rules({maxDrawdownPct: 4}).includes('dd'));
  assert.ok(rules({maxOpen: 1}).includes('open')); assert.ok(rules({maxExposurePct: 40}).includes('expo')); assert.ok(rules({kill: true}).includes('kill'));
});
test('gate: veta SOLO las velas recientes y el motor lo registra como «Riesgo global» sin abrir la posición', () => {
  const C = walk(1500, 3), s = spec(), free = B.backtest(C, s), gated = B.backtest(C, s, {gate: (t) => t >= C[1400].t ? 'prueba' : null});
  assert.ok(free.trades.length > gated.trades.length || free.trades.length === gated.trades.length); assert.ok(gated.trades.every(t => t.entryT <= C[1401].t)); const av = gated.avoid.filter(a => /Riesgo global: prueba/.test(a[1])); assert.ok(av.every(a => a[0] >= C[1400].t));
  const g = R.gateFor({kill: true}, [sess()], C[1499].t + 3600e3)(sess()); assert.ok(g(C[1499].t)); assert.equal(g(C[1000].t), null);
});
test('integración con paper trading: con interruptor activo no se abren posiciones nuevas en la actualización', async () => {
  const C = walk(2000, 6), T = i => Date.UTC(2025, 0, 1) + i * 3600e3, feed = async (a, b, n) => C.slice(-n), mk = id => P.newSession({id, v: 1, spec: spec(), capital: 10000, startT: T(1990)});
  const s1 = mk('a'), s2 = mk('b'); const gate = R.gateFor({kill: true}, [s1, s2], T(2000))(s1); await P.step(s1, feed, {gate}, T(2000)); const free = await P.step(s2, feed, null, T(2000));
  assert.equal(s1.open, null); assert.equal(s1.ledger.length, 0); assert.ok(s2.ledger.length >= 0 && free.changed !== undefined);
});
