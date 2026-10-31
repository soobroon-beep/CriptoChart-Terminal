const test = require('node:test'), assert = require('node:assert');
const I = require('../indicators.js');
const mk = n => { const c = []; let p = 100; for (let i = 0; i < n; i++) { p += Math.sin(i / 5) * 2 + .3; c.push({t: i, o: p - 1, h: p + 2, l: p - 2, c: p, v: 100 + i % 7}); } return c; };
const C = mk(150), fin = a => a.filter(x => x != null && Number.isFinite(x));
test('osciladores acotados', () => {
  for (const x of fin(I.willr(C, 14))) assert.ok(x >= -100.001 && x <= .001);
  for (const x of fin(I.mfi(C, 14))) assert.ok(x >= -.001 && x <= 100.001);
  const s = I.stochRsi(C); for (const x of fin(s.k)) assert.ok(x >= -.001 && x <= 100.001);
  for (const x of fin(I.cmf(C, 20))) assert.ok(Math.abs(x) <= 1.001);
  const a = I.adx(C, 14); for (const x of fin(a.adx)) assert.ok(x >= 0 && x <= 100.001);
});
test('canales y nube', () => {
  const d = I.donchian(C, 20), k = I.keltner(C, 20, 2, 10);
  for (let i = 0; i < C.length; i++) { if (d.up[i] != null) assert.ok(d.up[i] >= d.mid[i] && d.mid[i] >= d.lo[i]); if (k.up[i] != null) assert.ok(k.up[i] >= k.mid[i] && k.mid[i] >= k.lo[i]); }
  const ic = I.ichimoku(C); assert.ok(fin(ic.spanA).length > 0 && fin(ic.tenkan).length > 0);
});
test('psar y roc', () => {
  const p = I.psar(C); assert.ok(fin(p.v).length > 100); for (const d of fin(p.dir)) assert.ok(d === 1 || d === -1);
  const r = I.roc(C, 10); assert.ok(Math.abs(r[20] - (C[20].c / C[10].c - 1) * 100) < 1e-6);
});
