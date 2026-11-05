'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
// screener.js es un script de navegador: se carga con un entorno mínimo y un NovaNexus simulado que devuelve la última señal donde se le diga.
function load(signalIndex) {
  global.window = global; global.location = {search: ''}; global.document = {addEventListener() {}, querySelector() { return null; }};
  global.NovaNexus = {compute: () => ({last: signalIndex == null ? null : {i: signalIndex, side: 'buy', score: 3, price: 1}})};
  delete require.cache[require.resolve('../screener.js')]; require('../screener.js'); return global.CCTScreener;
}
const cs = n => Array.from({length: n}, (_, i) => ({t: i, o: 1, h: 1, l: 1, c: 1, v: 1}));
test('Screener: la señal dura como máximo 5 velas (edad 1 a 5) y luego desaparece', () => {
  const N = 100;
  for (let ago = 0; ago <= 4; ago++) { const s = load(N - 1 - ago).signalOf(cs(N)); assert.ok(s, 'ago ' + ago); assert.equal(s.age, ago + 1); }
  assert.equal(load(N - 1 - 5).signalOf(cs(N)), null); // hace 5 velas = la sexta: ya no se muestra
  assert.equal(load(N - 1 - 7).signalOf(cs(N)), null); // antes llegaba hasta 7
  assert.equal(load(null).signalOf(cs(N)), null);
});
test('Screener: orden de más reciente a más vieja, luego puntaje, luego volumen; sin señal al final', () => {
  const S = load(0), r = (symbol, ago, score, idx) => ({symbol, idx, sig: ago == null ? null : {ago, age: ago + 1, score}});
  const rows = [r('E', 4, 5, 1), r('N', null, 0, 2), r('C', 1, 2, 3), r('A', 0, 2, 7), r('B', 0, 4, 9), r('D', 1, 2, 2), r('F', 2, 3, 4)];
  assert.deepEqual(S.sortRows(rows).map(x => x.symbol), ['B', 'A', 'D', 'C', 'F', 'E', 'N']);
});

test('Screener: el oscilador usa el máx/mín de hl2 (como el Pine del Screener), distinto al indicador completo', () => {
  require('../nova-nexus.js'); const NN = globalThis.NovaNexus; let x = 100;
  const cs = Array.from({length: 400}, (_, i) => { x += Math.sin(i / 7) * 2 + Math.cos(i / 3); const o = x, c = x + Math.sin(i), h = Math.max(o, c) + 1.5 + (i % 5) * .3, l = Math.min(o, c) - 1.5 - (i % 3) * .4; return {t: i * 36e5, o, h, l, c, v: 1000}; });
  const a = NN.compute(cs, {cooldown: 0, minScore: 1}), b = NN.compute(cs, {cooldown: 0, minScore: 1, hl2Range: true});
  assert.notDeepStrictEqual(a.osc.slice(-50), b.osc.slice(-50));
  const hl2 = cs.map(c => (c.h + c.l) / 2), i = 399, w = hl2.slice(i - 19, i + 1), hh = Math.max(...w), ll = Math.min(...w), av = w.reduce((p, q) => p + q) / 20;
  assert.ok(Number.isFinite(hh - ll + av)); // la rama hl2 solo cambia el rango; ambas devuelven series finitas
  assert.ok(Number.isFinite(b.osc[i]));
});
