const test = require('node:test'), assert = require('node:assert');
const I = require('../indicators.js');
const mk = (arr) => arr.map((p, i) => ({t: i * 36e5, o: p, h: p * 1.002, l: p * .998, c: p, v: 100}));
test('heatmap: devuelve matriz y la banda de un largo apalancado queda debajo del precio', () => {
  const c = mk(Array.from({length: 60}, (_, i) => 100 + Math.sin(i / 5) * .5));
  const h = I.liquidationHeatmap(c, {rows: 100}); assert.ok(h && h.rows >= 100 && h.data[0].length === 60);
  const last = c.length - 1, rowOf = p => Math.floor((p - h.pMin) / h.step);
  assert.ok(h.data[rowOf(100 * (1 - .02 + .005))][last] > 0, '50x largo ≈ −1.5%');
  assert.ok(h.data[rowOf(100 * (1 + .02 - .005))][last] > 0, '50x corto ≈ +1.5%');
});
test('heatmap: la banda desaparece cuando el precio la toca', () => {
  const p = Array.from({length: 40}, () => 100); p[30] = 80; for (let i = 31; i < 40; i++) p[i] = 80;
  const c = mk(p), h = I.liquidationHeatmap(c, {rows: 200}), r = Math.floor((100 * (1 - .1 + .005) - h.pMin) / h.step);
  assert.ok(h.data[r][20] > 0, 'viva antes del desplome'); assert.equal(h.data[r][35], 0, 'liquidada tras tocar el precio');
});
test('heatmap: pocas velas → null', () => assert.equal(I.liquidationHeatmap(mk([1, 2])), null));
