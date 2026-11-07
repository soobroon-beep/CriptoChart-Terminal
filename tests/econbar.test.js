const test = require('node:test'), assert = require('node:assert');
const E = require('../econbar.js');
const now = Date.UTC(2026, 10, 6, 19, 0);
const ev = (dt, o) => Object.assign({t: now + dt * 6e4, title: 'X', country: 'USD', impact: 'High', forecast: '', previous: '', actual: ''}, o);
test('num y flecha: compara el dato con la previsión', () => {
  assert.equal(E.num('1,250K'), 1250); assert.equal(E.num('-0.3%'), -0.3); assert.equal(E.num(''), null);
  assert.equal(E.arrow({actual: '3.2%', forecast: '3.0%'}), 1); assert.equal(E.arrow({actual: '2.8%', forecast: '3.0%'}), -1);
  assert.equal(E.arrow({actual: '3.0%', forecast: '3.0%'}), 0); assert.equal(E.arrow({actual: '', forecast: '3.0%'}), null);
});
test('pick: el próximo importante; solo impacto alto y países relevantes', () => {
  const r = E.pick([ev(300, {title: 'Low', impact: 'Low'}), ev(90, {country: 'AUD'}), ev(120, {title: 'NFP', forecast: '1'}), ev(-200, {title: 'Viejo'})], now);
  assert.equal(r.mode, 'next'); assert.equal(r.ev.main.title, 'NFP');
});
test('pick: un evento recién publicado (menos de 30 min) manda; después vuelve al siguiente', () => {
  const evs = [ev(-10, {title: 'CPI', forecast: '3', actual: ''}), ev(120, {title: 'Siguiente'})];
  assert.equal(E.pick(evs, now).mode, 'live'); assert.equal(E.pick(evs, now + 40 * 6e4).ev.main.title, 'Siguiente');
});
test('group: eventos a la misma hora se agrupan con un principal que tenga datos', () => {
  const g = E.group([ev(60, {title: 'A'}), ev(60, {title: 'B', forecast: '1'}), ev(90, {title: 'C'})]);
  assert.equal(g.main.title, 'B'); assert.equal(g.extra, 1);
});
test('pick: sin nada importante devuelve null', () => { assert.equal(E.pick([ev(60, {impact: 'Low'})], now), null); assert.equal(E.pick(null, now), null); });
test('lists: resultados recientes con dato y próximos en 72 h', () => {
  const L = E.lists([ev(-60, {actual: '1'}), ev(-60), ev(60), ev(60 * 24 * 4, {title: 'Lejos'}), ev(30, {impact: 'Low'})], now);
  assert.equal(L.recent.length, 1); assert.equal(L.upcoming.length, 1);
});
test('left: texto de la cuenta atrás', () => {
  assert.equal(E.left(45e3), 'en 45 s'); assert.equal(E.left(12 * 6e4), 'en 12 m'); assert.equal(E.left(135 * 6e4), 'en 2 h 15 m'); assert.equal(E.left(26 * 36e5), 'en 1 d 2 h'); assert.equal(E.left(-5), 'ahora');
});
