'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const I = require('../indicators.js');
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const mk = (arr, t0 = 0, iv = 36e5) => arr.map((x, i) => ({t: t0 + i * iv, o: x[0], h: x[1], l: x[2], c: x[3], v: x[4] ?? 1}));

test('WMA(3) de 1..5: pesos 1,2,3', () => {
  const w = I.wma([1, 2, 3, 4, 5], 3);
  assert.equal(w[0], null); assert.equal(w[1], null);
  near(w[2], (1 * 1 + 2 * 2 + 3 * 3) / 6); near(w[4], (3 * 1 + 4 * 2 + 5 * 3) / 6);
});
test('EMA con semilla SMA y propagación de nulls', () => {
  const e = I.ema([1, 2, 3, 4, 5], 3); near(e[2], 2); near(e[3], 4 * .5 + 2 * .5); near(e[4], 5 * .5 + 3 * .5);
  const e2 = I.ema([null, null, 1, 2, 3, 4], 3); assert.equal(e2[3], null); near(e2[4], 2); near(e2[5], 4 * .5 + 2 * .5); // semilla SMA(1,2,3) en el índice 4
});
test('ATR: TR usa el cierre previo y RMA de Wilder', () => {
  const c = mk([[10, 12, 9, 11], [11, 13, 10, 12], [12, 12.5, 11, 11.5], [11.5, 16, 11, 15]]);
  const tr = I.trueRange(c); assert.deepEqual(tr, [3, 3, 1.5, 5]); // 4ª: máx(5, |16-11.5|, |11-11.5|)=5
  const a = I.atr(c, 3); near(a[2], (3 + 3 + 1.5) / 3); near(a[3], (a[2] * 2 + 5) / 3);
});
test('VWAP se reinicia cada día UTC y es null en 1d+', () => {
  const day = 864e5, c = [
    {t: 0, o: 1, h: 3, l: 1, c: 2, v: 10}, {t: 36e5, o: 1, h: 5, l: 3, c: 4, v: 30},
    {t: day, o: 1, h: 6, l: 6, c: 6, v: 5}];
  const v = I.vwap(c, 36e5);
  near(v[0], 2); near(v[1], (2 * 10 + 4 * 30) / 40); near(v[2], 6);
  assert.ok(I.vwap(c, day).every(x => x === null));
});
test('MACD: línea = EMA12 − EMA26, histograma = línea − señal', () => {
  const cl = Array.from({length: 80}, (_, i) => 100 + Math.sin(i / 5) * 10 + i * .2);
  const m = I.macd(cl), f = I.ema(cl, 12), s = I.ema(cl, 26);
  assert.equal(m.line[24], null); near(m.line[25], f[25] - s[25]);
  assert.equal(m.signal[32], null); assert.notEqual(m.signal[33], null); // 26 + 9 − 2 = índice 33
  for (let i = 33; i < 80; i++) near(m.hist[i], m.line[i] - m.signal[i]);
});
test('Estocástico: valores en [0,100] y %K bruto conocido', () => {
  const c = mk([[1, 2, 0, 1], [1, 4, 1, 3], [3, 5, 2, 4], [4, 6, 3, 6], [6, 6, 4, 5], [5, 7, 4, 7]]);
  const s = I.stoch(c, 3, 1, 1); // sin suavizado: %K = bruto
  near(s.k[2], 100 * (4 - 0) / (5 - 0)); near(s.k[3], 100 * (6 - 1) / (6 - 1)); near(s.k[5], 100 * (7 - 3) / (7 - 3));
  for (const v of s.k.concat(I.stoch(c).d)) if (v != null) assert.ok(v >= 0 && v <= 100);
});
test('OBV acumula con el signo del cambio', () => {
  const c = mk([[0, 0, 0, 10, 5], [0, 0, 0, 11, 7], [0, 0, 0, 11, 9], [0, 0, 0, 9, 4]]);
  assert.deepEqual(I.obv(c), [0, 7, 7, 3]);
});
test('Supertrend: alcista bajo el precio, bajista sobre el precio, y cambia de dirección', () => {
  const rows = [];
  for (let i = 0; i < 60; i++) { const p = 100 + i * 2; rows.push([p, p + 1, p - 1, p + .5]); }
  for (let i = 0; i < 60; i++) { const p = 220 - i * 3; rows.push([p, p + 1, p - 1, p - .5]); }
  const c = mk(rows), st = I.supertrend(c, 10, 3);
  assert.equal(st.line[8], null); assert.notEqual(st.line[9], null);
  assert.equal(st.dir[55], -1); assert.ok(st.line[55] < c[55].c);
  assert.equal(st.dir[119], 1); assert.ok(st.line[119] > c[119].c);
  assert.ok(st.dir.includes(-1) && st.dir.includes(1));
  for (let i = 10; i < 120; i++) assert.ok((st.dir[i] === -1) === (st.up[i] != null) && (st.dir[i] === 1) === (st.dn[i] != null));
  // en tendencia alcista la línea nunca baja
  for (let i = 12; i < 55; i++) if (st.dir[i] === -1 && st.dir[i - 1] === -1) assert.ok(st.line[i] >= st.line[i - 1]);
});
test('Cruces: +1 al cruzar hacia arriba, −1 hacia abajo, ignora nulls', () => {
  assert.deepEqual(I.crosses([1, 2, 3, 2, 1], [2, 2, 2, 2, 2]), [0, 0, 1, 0, -1]);
  assert.deepEqual(I.crosses([null, 1, 3], [1, 2, 2]), [0, 0, 1]);
});

test('Smooth Trail: la tendencia solo cambia al romper la banda contraria y el trail sigue a la banda correcta', () => {
  const rows = []; for (let i = 0; i < 80; i++) { const p = 100 + i; rows.push([p, p + 1, p - 1, p + .5]); }
  for (let i = 0; i < 80; i++) { const p = 180 - i * 2; rows.push([p, p + 1, p - 1, p - .5]); }
  const c = mk(rows), r = I.smoothTrail(c), a = I.atr(c, 20), b = I.ema(c.map(x => x.c), 30);
  assert.equal(r.trend[10], 0); assert.equal(r.trail[28], null);
  assert.equal(r.trend[79], 1); assert.equal(r.trend[159], -1);
  for (let i = 31; i < 160; i++) { // dentro de las bandas la tendencia se mantiene
    const up = b[i] + 2 * a[i], lo = b[i] - 2 * a[i];
    if (c[i].c <= up && c[i].c >= lo) assert.equal(r.trend[i], r.trend[i - 1]);
  }
  assert.ok(r.trail[79] < c[79].c && r.trail[159] > c[159].c); // alcista bajo el precio, bajista sobre el precio
  // suavizado: EMA(2) del trail crudo (semilla = SMA de los dos primeros valores)
  const raw = c.map((x, i) => b[i] == null || a[i] == null ? null : (r.trend[i] === 1 ? b[i] - 2 * a[i] : b[i] + 2 * a[i]));
  const e = I.ema(raw, 2); for (let i = 0; i < 160; i++) { if (e[i] == null) assert.equal(r.trail[i], null); else near(r.trail[i], e[i]); }
});
test('Reversal Bands: SMA(70) ± 6/7/8 ATR(70) contra una implementación ingenua independiente', () => {
  const rows = Array.from({length: 200}, (_, i) => { const p = 50 + Math.sin(i / 7) * 8 + i * .1; return [p, p + 1.5 + (i % 5) * .2, p - 1.2, p + Math.cos(i / 3)]; });
  const c = mk(rows), r = I.reversalBands(c), i = 150;
  let sm = 0; for (let k = 0; k < 70; k++) sm += c[i - k].c; sm /= 70;
  const tr = j => j === 0 ? c[0].h - c[0].l : Math.max(c[j].h - c[j].l, Math.abs(c[j].h - c[j - 1].c), Math.abs(c[j].l - c[j - 1].c));
  let rm = 0; for (let j = 0; j < 70; j++) rm += tr(j); rm /= 70; for (let j = 70; j <= i; j++) rm = (rm * 69 + tr(j)) / 70;
  [6, 7, 8].forEach((k, idx) => { near(r.up[idx][i], sm + k * rm, 1e-7); near(r.dn[idx][i], sm - k * rm, 1e-7); });
  assert.equal(r.up[0][68], null); assert.notEqual(r.up[0][69], null);
});
