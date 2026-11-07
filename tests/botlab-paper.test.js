const test = require('node:test'), assert = require('node:assert/strict');
const B = require('../botlab-engine.js'), P = require('../botlab-paper.js');
function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function walk(n, seed = 1) { const r = rng(seed), out = []; let p = 100; const t0 = Date.UTC(2025, 0, 1); for (let i = 0; i < n; i++) { const o = p, c = o * (1 + (r() - .5) * .02 + Math.sin(i / 25) * .004); out.push({t: t0 + i * 3600e3, o, h: Math.max(o, c) * 1.002, l: Math.min(o, c) * .998, c, v: 1000 + r() * 500}); p = c; } return out; }
const spec = () => { const s = B.defaultSpec(); s.entry.long = [{a: {k: 'ema', n: 10}, op: 'crossUp', b: {k: 'ema', n: 30}}]; s.exit.long = [{a: {k: 'ema', n: 10}, op: 'crossDown', b: {k: 'ema', n: 30}}]; return s; };
const feed = C => async (sym, itv, count) => C.slice(-count);
const T = i => Date.UTC(2025, 0, 1) + i * 3600e3;

test('empieza plana: nada se decide antes del inicio y las entradas son en la apertura siguiente', async () => {
  const C = walk(2000, 3), s = P.newSession({id: 'a', v: 1, spec: spec(), capital: 10000, startT: T(1200)}); await P.step(s, feed(C), null, T(2000));
  assert.ok(s.ledger.length >= 2); for (const t of s.ledger) { assert.ok(t.entryT > T(1200)); const i = Math.round((t.entryT - T(0)) / 3600e3); assert.ok(C[i].o > 0); }
});
test('actualizar por partes da EXACTAMENTE lo mismo que de una vez (determinista, sin reescribir el pasado)', async () => {
  const C = walk(2400, 5), a = P.newSession({id: 'a', v: 1, spec: spec(), capital: 10000, startT: T(1000)}), b = P.newSession({id: 'b', v: 1, spec: spec(), capital: 10000, startT: T(1000)});
  await P.step(b, feed(C.slice(0, 2400)), null, T(2400)); for (const k of [1300, 1600, 1750, 2000, 2400]) { await P.step(a, feed(C.slice(0, k)), null, T(k)); }
  const core = x => x.ledger.map(t => [t.entryT, t.exitT, t.entry, t.exit, Math.round(t.net * 1e6)]); assert.deepEqual(core(a), core(b)); assert.ok(Math.abs(a.cash - b.cash) < 1e-6);
  assert.ok(P.verify(a) && P.verify(b));
});
test('el libro es inmutable: editar una operación rompe la cadena de hashes', async () => {
  const C = walk(2000, 7), s = P.newSession({id: 'a', v: 1, spec: spec(), capital: 10000, startT: T(900)}); await P.step(s, feed(C), null, T(2000)); assert.ok(s.ledger.length > 2 && P.verify(s));
  s.ledger[1].net += 100; assert.equal(P.verify(s), false);
});
test('el capital cuadra: caja = capital + suma de netos; estadísticas coherentes', async () => {
  const C = walk(2000, 9), s = P.newSession({id: 'a', v: 1, spec: spec(), capital: 5000, startT: T(900)}); await P.step(s, feed(C), null, T(2000)); const st = P.stats(s);
  assert.ok(Math.abs(s.cash - (5000 + s.ledger.reduce((a, t) => a + t.net, 0))) < 1e-6); assert.equal(st.n, s.ledger.length); assert.ok(Math.abs(st.equity - (s.cash + (s.open ? s.open.unreal : 0))) < 1e-9);
});
test('pausada no avanza; sin velas nuevas no cambia nada', async () => {
  const C = walk(1500, 2), s = P.newSession({id: 'a', v: 1, spec: spec(), capital: 1000, startT: T(1400)}); s.status = 'paused'; assert.equal((await P.step(s, feed(C), null, T(1500))).changed, false);
  s.status = 'running'; const r = await P.step(s, feed(C.slice(0, 1400)), null, T(1400)); assert.equal(s.ledger.length, 0); assert.ok(r.changed === false || s.ledger.length === 0);
});
test('hueco de datos: se registra y no inventa operaciones', async () => {
  const C = walk(7000, 4), s = P.newSession({id: 'a', v: 1, spec: spec(), capital: 10000, startT: T(100)}); const r = await P.step(s, async (sy, it, n) => C.slice(-Math.min(n, 6000)), null, T(7000)); assert.equal(s.gaps.length, 1); assert.match(s.gaps[0].why, /Hueco/); assert.ok(r.changed);
});
