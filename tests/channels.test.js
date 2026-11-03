const test = require('node:test'), assert = require('node:assert');
const C = require('../channels.js');
// Canal ascendente: tendencia +0.5 por vela con oscilación ±6
function rising(n = 160) { const out = []; for (let i = 0; i < n; i++) { const m = 100 + i * .5 + Math.sin(i / 3) * 6; out.push({t: i * 6e4, o: m - .3, h: m + 1.5, l: m - 1.5, c: m + .2, v: 10}); } return out; }
test('detecta un canal ascendente y lo contiene', () => {
  const c = rising(), r = C.detect(c, {len: 4, count: 1});
  assert.equal(r.list.length, 1); const q = r.list[0];
  assert.equal(q.dir, 1); assert.ok(q.up.p2 > q.lo.p2); assert.equal(q.i2, c.length - 1);
  assert.ok(Math.abs(q.mid.p2 - (q.up.p2 + q.lo.p2) / 2) < 1e-9);
  const s = (q.up.p2 - q.up.p1) / (q.i2 - q.i1); assert.ok(s > .3 && s < .7, 'pendiente ~0.5, fue ' + s);
});
test('descarta el canal si el precio lo rompe', () => {
  const c = rising(); c[c.length - 1] = {...c[c.length - 1], c: 400, h: 401};
  assert.equal(C.detect(c, {len: 4, count: 1}).list.length, 0);
});
test('pocas velas: sin canales y sin errores', () => { assert.deepEqual(C.detect([], {}).list, []); assert.deepEqual(C.detect(rising(10), {}).list, []); });
test('lateral: dir 0', () => {
  const c = []; for (let i = 0; i < 160; i++) { const m = 100 + Math.sin(i / 3) * 6; c.push({t: i, o: m, h: m + 1.5, l: m - 1.5, c: m, v: 1}); }
  const r = C.detect(c, {len: 4, count: 1}); if (r.list.length) assert.equal(r.list[0].dir, 0);
});
