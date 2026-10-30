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
