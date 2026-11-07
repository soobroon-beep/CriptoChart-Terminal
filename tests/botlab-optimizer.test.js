const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../botlab-engine.js'), O = require('../botlab-optimizer.js');
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function walk(n, seed = 1, drift = 0, vol = .01) { const r = rng(seed), out = []; let p = 100; const t0 = Date.UTC(2025, 0, 1); for (let i = 0; i < n; i++) { const o = p, c = o * (1 + drift + (r() - .5) * 2 * vol + Math.sin(i / 25) * .004), h = Math.max(o, c) * (1 + r() * .004), l = Math.min(o, c) * (1 - r() * .004); out.push({t: t0 + i * 3600e3, o, h, l, c, v: 1000 + r() * 500}); p = c; } return out; }
const spec = () => { const s = B.defaultSpec(); s.entry.long = [{a: {k: 'ema', n: 10}, op: 'crossUp', b: {k: 'ema', n: 30}}]; s.exit.long = [{a: {k: 'ema', n: 10}, op: 'crossDown', b: {k: 'ema', n: 30}}]; return s; };

test('espacio de búsqueda: SL, TP y periodos; no toca indicadores propios ni números fijos', () => {
  const s = spec(); s.entry.long.push({a: {k: 'user', sid: 'x', src: 'a'}, op: 'is'}, {a: {k: 'rsi', n: 14}, op: 'gt', b: {k: 'num', v: 50}}); const paths = O.space(s).map(d => d.path);
  assert.ok(paths.includes('risk.sl.v') && paths.includes('risk.tp.v') && paths.includes('entry.long.0.a.n') && paths.includes('entry.long.2.a.n'));
  assert.ok(!paths.some(p => /\.1\.|\.b\.v$/.test(p) && /entry\.long\.1/.test(p)) && !paths.some(p => /entry\.long\.2\.b/.test(p)));
});
test('es determinista y devuelve su evidencia por tramos', async () => {
  const C = walk(3000, 4), a = await O.optimize(C, spec(), {budget: 25, seed: 7}), b = await O.optimize(C, spec(), {budget: 25, seed: 7});
  delete a.at; delete b.at; assert.deepEqual(a, b); assert.ok(a.folds.length >= 3); assert.ok(a.holdout && a.oos);
});
test('SIN fuga de datos: cambiar el futuro no cambia lo ajustado con el pasado', async () => {
  const C = walk(3000, 5), D = C.map((c, i) => i >= 2400 ? Object.assign({}, c, {c: c.c * 1.3, o: c.o * 1.3, h: c.h * 1.3, l: c.l * 1.3}) : c);
  const a = await O.optimize(C, spec(), {budget: 25, seed: 3}), b = await O.optimize(D, spec(), {budget: 25, seed: 3});
  assert.deepEqual(a.folds[0], b.folds[0]); assert.deepEqual(a.folds[1].params, b.folds[1].params);
});
test('nunca propone sin cumplir TODAS las condiciones; si propone, la candidata supera a la actual fuera de muestra', async () => {
  for (const seed of [1, 2, 3]) { const C = walk(3500, seed, 0), r = await O.optimize(C, spec(), {budget: 30, seed}); if (r.decision === 'propuesta') { assert.ok(r.oos.cand.net > r.oos.base.net && r.holdout.cand.net > r.holdout.base.net && r.candidate); assert.equal(r.reasons.length, 0); } else { assert.equal(r.candidate, null); assert.ok(r.reasons.length > 0); } }
});
test('datos insuficientes o sin parámetros: «no aplica» con motivo claro', async () => {
  const r1 = await O.optimize(walk(500), spec()); assert.equal(r1.decision, 'no_aplica'); assert.match(r1.reasons[0], /1\.200/);
  const s = B.defaultSpec(); s.entry.long = [{a: {k: 'novaBuy'}, op: 'is'}]; s.risk.sl = null; s.risk.tp = null; s.risk.sizePct = 10; const r2 = await O.optimize(walk(3000), s); assert.equal(r2.decision, 'no_aplica');
});
test('extractSources registra señales en la vela de nacimiento', () => {
  const res = {alerts: [{title: 'Compra', bars: [3, 7]}], shapes: [{title: 'S', kind: 'shape', loc: 'belowbar', pts: [[5, 1]]}], labelLog: [[2, 'BUY', 'up'], [9, 'BUY', 'up']], plots: [{id: 'p', title: 'L', values: [1, null, 3]}]};
  const s = O.extractSources(res, 12); assert.equal(s.length, 4); assert.equal(s[0].series[3], 1); assert.equal(s[2].count, 2); assert.ok(Number.isNaN(s[3].series[1]));
});
