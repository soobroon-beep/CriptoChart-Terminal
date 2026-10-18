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
test('Pivotes: valor del centro confirmado len barras después; el primero de un empate también cuenta', () => {
  const c = [5, 4, 3, 4, 5, 6, 7].map(x => ({h: x + 1, l: x - 1, c: x}));
  assert.equal(I.pivotAt(c, 4, 2, false), 2);       // mínimo en el índice 2, confirmado en el 4
  assert.equal(I.pivotAt(c, 3, 2, false), null);    // aún no hay len barras a la derecha
  assert.equal(I.pivotAt(c, 5, 2, false), null);    // el índice 3 no es pivote
  assert.equal(I.pivotAt([1, 3, 5, 3, 1].map(x => ({h: x, l: x, c: x})), 4, 2, true), 5);
});
test('Soporte/Resistencia: caja, ruptura, retest y recorte de caja (escenario revisado a mano, lookback 3)', () => {
  const cl = [24, 23, 22, 21, 20, 21, 23, 26, 29, 31, 30, 27, 24, 21, 18.5, 17, 18.5, 21, 24, 27, 29, 28, 26, 23, 19, 14, 13, 12, 15, 14, 13, 15, 17, 19, 21, 22, 21, 20, 19, 18];
  const c = cl.map((x, i) => ({t: i * 36e5, o: i ? cl[i - 1] : x, c: x, h: x + 1, l: x - 1, v: 1}));
  const r = I.supportResistance(c, {lookback: 3}), L = r.labels.map(l => `${l.kind}/${l.side}@${l.i}:${l.price}`);
  // el primer pivote de cada lado no crea caja (ta.change de fixnan es na); el segundo sí
  const sup = r.boxes.filter(b => b.kind === 'sup'), res = r.boxes.filter(b => b.kind === 'res');
  assert.deepEqual(sup.map(b => [b.left, b.right, b.top, b.bot]), [[15, 28, 17.5, 16], [27, 44, 12, 11]]);
  // la caja de resistencia sin romper (L=20) se borra al llegar un nivel nuevo; la rota (L=28) se conserva hasta el siguiente
  assert.deepEqual(res.map(b => [b.left, b.right, b.top, b.bot]), [[28, 35, 16, 15], [35, 44, 23, 22]]);
  assert.deepEqual(L, ['brk/sup@25:16', 're/sup@28:16', 'brk/res@32:16']);
  assert.ok(!L.some(x => x.startsWith('pot')), 'las etiquetas "Potential Retest" resueltas se eliminan');
});
test('Pivots (len 2): zigzag sólido entre pivotes alternos y proyección de la última barra', () => {
  const cl = [10, 12, 14, 16, 18, 16, 14, 12, 10, 8, 10, 12, 14, 16, 18, 17, 16.5, 17.5, 16, 18.5, 17, 15, 13, 11, 9, 11, 13, 15, 17, 19, 17, 15];
  const c = cl.map((x, i) => ({t: i, o: x, c: x, h: x + 1, l: x - 1, v: 1}));
  const r = I.pivots(c, 2), L = r.lines.map(l => `${l.col}:${l.x1},${l.y1}>${l.x2},${l.y2}:${l.dash ? 'd' : 's'}`);
  assert.deepEqual(L.slice(0, 3), ['miss_pl:0,10>4,19:s', 'miss_ph:4,19>9,7:s', 'miss_pl:9,7>14,19:s']);
  assert.equal(L[L.length - 2], 'miss_ph:29,20>31,14:d'); assert.equal(L[L.length - 1], 'proj_h:31,14>31,14:s');
});
test('Pivots: dos máximos seguidos generan el mínimo "perdido", su nivel fantasma y el tramo discontinuo (revisado a mano)', () => {
  const cl = [10, 12, 14, 16, 18, 17, 17.8, 18.5, 17, 15, 13, 11, 9, 11, 13, 15, 17, 19, 17, 15];
  const c = cl.map((x, i) => ({t: i, o: x, c: x, h: x + 1, l: x - 1, v: 1}));
  const L = I.pivots(c, 2).lines.map(l => `${l.col}:${l.x1},${l.y1}>${l.x2},${l.y2}:${l.dash ? 'd' : 's'}:w${l.width}`);
  assert.deepEqual(L, [
    'miss_pl:0,10>4,19:s:w1',
    'miss_ph:4,19>5,16:d:w1',      // mínimo perdido entre los dos máximos
    'ghost_pl:5,16>19,16:s:w2',    // nivel fantasma que se alarga hasta la última barra
    'miss_pl:5,16>7,19.5:d:w1',    // pivote real tras un "perdido" → discontinuo
    'miss_ph:7,19.5>12,8:s:w1', 'miss_pl:12,8>17,20:s:w1',
    'miss_ph:17,20>19,14:d:w1', 'proj_h:19,14>19,14:s:w2']);
});
/* Escenario de Liquidaciones diseñado a mano (lookback 2 → SMA de 12; volumen 10 hasta la barra 19 y 100 desde la 20).
   Pivote bajo en la barra 24 (low 100), confirmado en la 27: avg=100, media=795/12=66.25 → pasan los 5 filtros.
   Pivote alto en la 31 (high 140), confirmado en la 34: avg=108, media=1212/12=101 → ratio 1.069: pasan 5x, 10x y 25x, no 50x ni 100x.
   Barra 37 (h 120, l 95) contiene 96.15 / 98.04 / 99.01 → esos niveles dejan de alargarse; barra 38 (h 150, l 140) contiene 145.6. */
const liqBars = () => {
  const t0 = Date.UTC(2026, 0, 1), b = [], add = (i, h, l, cl, v) => b.push({t: t0 + i * 36e5, o: cl, h, l, c: cl, v});
  for (let i = 0; i <= 24; i++) { const p = 130 - 29 * i / 24; add(i, p + 1, p - 1, p, i < 20 ? 10 : 100); }
  for (let i = 25; i <= 31; i++) { const p = 101 + 38 * (i - 24) / 7; add(i, p + 1, p - 1, p, 100); }
  for (let i = 32; i <= 36; i++) { const p = 139 - 21 * (i - 31) / 5; add(i, p + 1, p - 1, p, i === 33 || i === 34 ? 108 : 100); }
  add(37, 120, 95, 100, 100); add(38, 150, 140, 148, 200); add(39, 148, 146, 147, 200);
  return b;
};
const liqSummary = (r, only) => r.levels.filter(L => !only || only.includes(L.lev)).map(L => [L.lev, L.lines.map(l => `${l.side}:${l.x1}-${l.x2}@${l.y.toFixed(4)}`)]);
test('Liquidaciones: niveles por apalancamiento, filtro de volumen y fin de la extensión al ser cruzados', () => {
  assert.deepEqual(liqSummary(I.liquidations(liqBars(), 36e5, {lookback: 2})), [
    [5, ['dn:24-39@83.3333', 'up:31-39@168.0000']],
    [10, ['dn:24-39@90.9091', 'up:31-39@154.0000']],
    [25, ['dn:24-36@96.1538', 'up:31-37@145.6000']],   // dn se detiene al cruzarlo la barra 37; up al cruzarlo la 38
    [50, ['dn:24-36@98.0392']],                          // el pivote alto no pasa el filtro 1.1×
    [100, ['dn:24-36@99.0099']]]);
});
test('Liquidaciones: en 1d/1w/1M el pivote usa 2 barras (más pivotes, filtro 25x lo descarta el alto)', () => {
  assert.deepEqual(liqSummary(I.liquidations(liqBars(), 864e5, {lookback: 2}), [5, 25]), [
    [5, ['dn:24-39@83.3333', 'up:31-39@168.0000', 'dn:37-39@79.1667']],
    [25, ['dn:24-36@96.1538', 'dn:37-39@91.3462']]]);    // el pivote alto confirmado en la 33 tiene ratio 1.037 < 1.05
});
test('Liquidaciones: nada antes de la fecha `after` y nunca más de 500 líneas por apalancamiento', () => {
  assert.deepEqual(I.liquidations(liqBars(), 36e5, {lookback: 2, after: Date.UTC(2030, 0, 1)}).levels.map(l => l.lines.length), [0, 0, 0, 0, 0]);
  const t0 = Date.UTC(2026, 0, 1), z = Array.from({length: 4000}, (_, i) => { const p = 100 + (i % 2 ? 5 : -5) * (1 + (i % 10) / 10); return {t: t0 + i * 36e5, o: p, h: p + 1, l: p - 1, c: p, v: 100 + (i % 7) * 5 + (i > 60 ? i : 0)}; });
  const r = I.liquidations(z, 36e5, {lookback: 2}); assert.ok(r.levels.every(L => L.lines.length <= 500)); assert.ok(r.levels.some(L => L.lines.length === 500));
});
/* Volume Profile — escenario a mano: 4 filas de ancho 4 entre 0 y 16, tres velas de rango 8.
   B0 (0–8, alcista, v 80): 40 a la fila 0, 40 a la 1, 0 a la 2 (toca el borde) · B1 (4–12, bajista, v 40): 20 / 20 · B2 (8–16, alcista, v 16): 8 / 8.
   Volumen por fila 40/60/28/8 (suma 136 = volumen total) · alcista 40/40/8/8 → bbp = 2·alcista − total = 40/20/−12/8 → |bbp| máx 40. */
const vpBars = () => [{o: 2, h: 8, l: 0, c: 6, v: 80}, {o: 9, h: 12, l: 4, c: 5, v: 40}, {o: 9, h: 16, l: 8, c: 15, v: 16}];
test('Volume Profile: reparto por filas, sentimiento, POC y porcentajes (escenario revisado a mano)', () => {
  const p = I.volumeProfile(vpBars(), {rows: 4});
  assert.deepEqual([p.from, p.to, p.lo, p.hi, p.step, p.poc, p.pocPrice, p.total], [0, 2, 0, 16, 4, 1, 6, 136]);
  assert.deepEqual(p.rows.map(r => r.vol), [40, 60, 28, 8]); assert.deepEqual(p.rows.map(r => r.bull), [40, 40, 8, 8]); assert.deepEqual(p.rows.map(r => r.bbp), [40, 20, -12, 8]);
  [2 / 3, 1, 28 / 60, 8 / 60].forEach((v, i) => near(p.rows[i].lpm, v)); [1, .5, .3, .2].forEach((v, i) => near(p.rows[i].dpm, v));
  near(p.rows[1].quote, 360); near(p.rows[1].pct, 60 / 136 * 100); near(p.rows[1].bpct, 100 / 3);
  assert.equal(p.pocBot, 4); assert.equal(p.pocTop, 8);
});
test('Volume Profile: colores de nodos y de sentimiento según color.from_gradient (extremos exactos, intermedios calculados a mano)', () => {
  const p = I.volumeProfile(vpBars(), {rows: 4}), c = i => p.rows[i].vcol, s = i => p.rows[i].scol, close = (a, b) => a.forEach((x, k) => near(x, b[k], 1e-2));
  assert.deepEqual(c(1), [255, 235, 59, .5]);                                  // nodo máximo → amarillo
  close(c(0), [103.23, 137.84, 198.01, .5]);                                   // 2/3 > 53 %: t = (0.6667−0.53)/0.47 = 0.2908 entre azul y amarillo
  assert.deepEqual(c(2), [41, 98, 255, .5]);                                   // entre 37 % y 53 % → azul (promedio)
  close(c(3), [169.57, 69.86, 136.03, .5]);                                    // 13.3 % < 37 %: t = 0.3604 entre rojo y azul
  assert.deepEqual(s(0), [38, 166, 154, .52]);                                 // bbp > 0 y dpm 1 → alcista con la opacidad máxima
  close(s(2), [239, 83, 80, .12 + .4 * (.3 / .7)]);                            // bbp < 0, dpm 0.3 → bajista
  assert.deepEqual(I.gradient(5, 0, 1, [0, 0, 0, 0], [10, 20, 30, 1]), [10, 20, 30, 1]); assert.deepEqual(I.gradient(-3, 0, 1, [0, 0, 0, 0], [10, 20, 30, 1]), [0, 0, 0, 0]);
});
test('Volume Profile: ventana (199/200 velas o todas), conservación del volumen y casos sin perfil', () => {
  const t0 = Date.UTC(2026, 0, 1), mkc = n => Array.from({length: n}, (_, i) => { const p = 100 + Math.sin(i / 6) * 9 + i * .05, w = 1 + (i % 5) * .7; return {t: t0 + i * 36e5, o: p - w / 3, c: p + w / 3, h: p + w, l: p - w, v: 10 + (i * 13) % 37}; });
  const a = I.volumeProfile(mkc(500)), b = I.volumeProfile(mkc(120)), d = I.volumeProfile(mkc(500), {lookback: 50});
  assert.equal(a.to - a.from + 1, 200); assert.equal(b.from, 0); assert.equal(b.to, 119); assert.equal(d.to - d.from + 1, 50);
  for (const [p, bars] of [[a, mkc(500)], [b, mkc(120)]]) near(p.total, bars.slice(p.from).reduce((x, y) => x + y.v, 0), 1e-6);
  assert.equal(a.rows.length, 25);
  const z = mkc(60); z[59].v = 0; assert.equal(I.volumeProfile(z), null);        // sin volumen en la última vela no hay perfil
  assert.equal(I.volumeProfile(Array.from({length: 30}, () => ({o: 5, h: 5, l: 5, c: 5, v: 1}))), null); // rango plano
});
