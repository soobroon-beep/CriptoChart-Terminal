/* Etiquetas de Pine con color = na: sin caja ni puntero (antes salían como pastillas azules). */
const test = require('node:test'), assert = require('node:assert');
const D = require('../pine-draw.js').CCTPineDraw;
function run(ci) {
  const fills = [], texts = [];
  const g = new Proxy({}, {get: (t, k) => k === 'measureText' ? s => ({width: String(s).length * 6}) : k === 'fillText' ? (s) => texts.push(s) : k === 'fill' ? () => fills.push(t.fillStyle) : k === 'roundRect' ? () => {} : () => {}, set: (t, k, v) => { t[k] = v; return true; }});
  const res = {palette: ['rgba(41,98,255,1)'], bgcolors: [], fills: [], hlines: [], plots: [], shapes: [], labels: [{x: 5, y: 10, text: 'Premium', yloc: 'price', ci, tci: 0, style: 'label_down', size: 'small'}], lines: [], boxes: [], polylines: [], tables: []};
  try { D.draw(g, res, {X: i => i * 10, Y: v => v, lo: 0, hi: 9, left: 0, right: 100, top: 0, bottom: 100, step: 10, candles: Array.from({length: 10}, () => ({o: 1, h: 2, l: 0, c: 1})), overlay: true}); } catch (e) { return {err: e}; }
  return {fills, texts};
}
test('label con color definido pinta su caja', () => { const r = run(0); assert.ok(!r.err, String(r.err)); assert.ok(r.fills.length >= 1); });
test('label con color = na no pinta caja pero conserva el texto', () => { const r = run(-1); assert.ok(!r.err, String(r.err)); assert.strictEqual(r.fills.length, 0); assert.deepStrictEqual(r.texts, ['Premium']); });
