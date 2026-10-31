'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../patterns.js');
/* Velas sintéticas: el precio recorre una línea quebrada que pasa por los puntos [índice, precio]; cada vela abre donde cerró la anterior. */
function path(pts, pad = 0) {
  const c = []; let prev = pts[0][1];
  for (let k = 1; k < pts.length; k++) {
    const [i0, p0] = pts[k - 1], [i1, p1] = pts[k];
    for (let i = i0 + (k === 1 ? 0 : 1); i <= i1; i++) { const cl = p0 + (p1 - p0) * (i - i0) / (i1 - i0), o = prev, wick = .15; c.push({t: i * 36e5, o, h: Math.max(o, cl) + wick, l: Math.min(o, cl) - wick, c: cl, v: 100}); prev = cl; }
  }
  for (let i = 0; i < pad; i++) { const last = c[c.length - 1]; c.push({t: (c.length) * 36e5, o: last.c, h: last.c + .2, l: last.c - .2, c: last.c, v: 100}); }
  return c;
}
const names = r => r.list.map(p => p.name);
const find = (r, re) => r.list.find(p => re.test(p.name));
const O = {len: 3, dev: .5, max: 10, min: 50};
const lead = [[0, 120], [10, 100]]; // arranque: baja hasta el primer pivote (X)

test('zigzag: pivotes alternados alto/bajo', () => {
  const c = path([[0, 100], [20, 150], [40, 110], [60, 160], [80, 120]], 5), z = P.zigzag(c, {len: 3, dev: .5});
  assert.ok(z.length >= 4); for (let k = 1; k < z.length; k++) assert.notEqual(z[k].hi, z[k - 1].hi);
});
test('Gartley alcista completo (B .618, C .618, D .786 de XA)', () => {
  // X=100, A=200, B=138.2, C=176.4, D=121.4
  const r = P.detect(path([...lead, [40, 200], [60, 138.2], [80, 176.4], [100, 121.4], [125, 150]], 0), O), g = find(r, /Gartley alcista/);
  assert.ok(g, 'detectó Gartley: ' + names(r)); assert.equal(g.status, 'complete'); assert.equal(g.dir, 1); assert.equal(g.pts.map(q => q.t).join(''), 'XABCD'); assert.ok(g.score > 85, 'score ' + g.score);
});
test('Gartley bajista (espejo)', () => {
  const m = (pt) => [pt[0], 300 - pt[1]], r = P.detect(path([[0, 180], [10, 200], [40, 100], [60, 161.8], [80, 123.6], [100, 178.6], [125, 150]].map((q, k) => k < 2 ? q : [q[0], q[1]]).slice(0, 2).concat([[40, 100], [60, 161.8], [80, 123.6], [100, 178.6], [125, 150]])), O);
  assert.ok(find(r, /Gartley bajista/), 'detectó Gartley bajista: ' + names(r) + m([0, 0])[0]);
});
test('Gartley en formación: proyecta la zona de reversión (PRZ) donde cae la D', () => {
  const r = P.detect(path([...lead, [40, 200], [60, 138.2], [80, 176.4], [86, 168]], 0), O), g = find(r, /Gartley alcista/);
  assert.ok(g, 'detectó: ' + names(r)); assert.equal(g.status, 'forming'); assert.ok(g.prz && g.prz.lo < 121.4 + 3 && g.prz.hi > 121.4 - 3, JSON.stringify(g.prz));
});
test('1-2-3 alcista confirmado al romper el máximo del 2', () => {
  const r = P.detect(path([[0, 150], [5, 100], [25, 150], [45, 90], [65, 150], [85, 125], [100, 155], [112, 160]], 0), {...O, harm: false}), p = find(r, /1-2-3 alcista/);
  assert.ok(p, 'detectó: ' + names(r)); assert.equal(p.status, 'confirmed'); assert.equal(p.pts.map(q => q.t).join(''), '123'); assert.ok(p.target > 150 && Math.abs(p.stop - 89.85) < 1e-6);
});
test('1-2-3 en formación: el 3 ya se hizo pero aún no rompe el 2', () => {
  const p = find(P.detect(path([[0, 150], [5, 100], [25, 150], [45, 90], [65, 150], [85, 125], [95, 138]], 0), {...O, harm: false}), /1-2-3 alcista/);
  assert.ok(p && p.status === 'forming');
});
test('Doble techo confirmado al perder la línea de cuello', () => {
  const p = find(P.detect(path([[0, 100], [20, 150], [40, 120], [60, 150.3], [80, 110], [95, 105]], 0), O), /Doble techo/);
  assert.ok(p, 'detectó doble techo'); assert.equal(p.status, 'confirmed'); assert.equal(p.dir, -1); assert.ok(p.target < 100.5 && p.target > 80);
});
test('Doble suelo', () => {
  const p = find(P.detect(path([[0, 150], [20, 100], [40, 130], [60, 99.8], [80, 140], [95, 148]], 0), O), /Doble suelo/);
  assert.ok(p && p.dir === 1);
});
test('Hombro-cabeza-hombro confirmado', () => {
  const p = find(P.detect(path([[0, 100], [20, 130], [35, 115], [50, 150], [65, 116], [80, 131], [100, 100], [110, 96]], 0), O), /Hombro-cabeza-hombro/);
  assert.ok(p, 'detectó HCH'); assert.equal(p.dir, -1); assert.equal(p.status, 'confirmed'); assert.ok(p.neck && p.target < 100);
});
test('Impulso de Elliott completo 0-1-2-3-4-5 y sus reglas', () => {
  const ok = P.detect(path([...lead, [30, 130], [45, 115], [70, 180], [85, 155], [105, 195], [120, 175]], 0), O), e = find(ok, /Impulso Elliott alcista/);
  assert.ok(e, 'detectó: ' + names(ok)); assert.equal(e.pts.map(q => q.t).join(''), '012345');
  // la onda 4 invade la zona de la 1 (cae a 125 < 130): no es impulso
  const bad = P.detect(path([...lead, [30, 130], [45, 115], [70, 180], [85, 125], [105, 195], [120, 175]], 0), O);
  assert.ok(!find(bad, /Impulso Elliott alcista/) || find(bad, /Impulso Elliott alcista/).pts.length !== 6, 'rechaza el solapamiento de la onda 4');
});
test('Elliott 0-4 en formación proyecta la onda 5', () => {
  const e = find(P.detect(path([...lead, [30, 130], [45, 115], [70, 180], [85, 155], [92, 160]], 0), O), /Impulso Elliott alcista/);
  assert.ok(e && e.status === 'forming' && e.target > 170, 'objetivo ' + (e && e.target));
});
test('Triángulo simétrico: máximos que bajan y mínimos que suben', () => {
  const pts = [[0, 100], [10, 140], [20, 110], [30, 135], [40, 115], [50, 130], [60, 120], [70, 127], [78, 123.5]];
  const t = find(P.detect(path(pts, 0), {len: 3, dev: .3, max: 10, min: 50}), /Triángulo|Cuña/);
  assert.ok(t && /simétrico/.test(t.name), t && t.name); assert.equal(t.lines.length, 2); assert.ok(t.lines[0].p2 > t.lines[1].p2);
});
test('Las familias se pueden apagar y hay un máximo de patrones', () => {
  const c = path([...lead, [40, 200], [60, 138.2], [80, 176.4], [100, 121.4], [125, 150]], 0);
  assert.ok(!find(P.detect(c, {...O, harm: false}), /Gartley/));
  assert.ok(P.detect(c, {...O, max: 1}).list.length <= 1);
});
test('Pocas velas o sin movimiento no devuelven nada (ni error)', () => {
  assert.deepEqual(P.detect([], O).list, []); assert.deepEqual(P.detect(path([[0, 100], [20, 100]], 0), O).list, []);
});

test('Los patrones que comparten pivotes no se apilan: solo el de más rango', () => {
  const c = path([[0, 120], [5, 100], [30, 130], [45, 115], [70, 150], [85, 116], [100, 131], [120, 100], [130, 96]], 0), r = P.detect(c, {...O, max: 10});
  const hsn = r.list.filter(p => p.kind === 'hs'), others = r.list.filter(p => p.kind === 'abc' || p.kind === 'p123');
  assert.equal(hsn.length, 1); for (const o of others) { const ids = new Set(hsn[0].pts.map(q => q.i)); assert.ok(o.pts.filter(q => ids.has(q.i)).length < 2, o.name + ' se apila sobre el HCH'); }
});
test('Elliott impulso: el color/dirección es el del impulso (alcista = +1)', () => {
  const e = find(P.detect(path([...lead, [30, 130], [45, 115], [70, 180], [85, 155], [105, 195], [120, 175]], 0), O), /Impulso Elliott/);
  assert.equal(e.dir, 1);
});
