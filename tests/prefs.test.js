const {test} = require('node:test');
const assert = require('node:assert/strict');
const P = require('../prefs.js');
test('sanitize rechaza valores raros y conserva los válidos', () => {
  const o = P.sanitize({tz: 'Mars/Base', clock: '12', date: 'x', dec: 3, sep: 'es', sym: '$', sound: 'off', tone: 'zzz', n: {ind: false, price: 'no'}});
  assert.equal(o.tz, 'auto'); assert.equal(o.clock, '12'); assert.equal(P.sanitize({clock: 12}).clock, '12'); assert.equal(o.date, 'dmy'); assert.equal(o.dec, 3); assert.equal(o.sep, 'es'); assert.equal(o.sym, '$'); assert.equal(o.sound, 'off'); assert.equal(o.tone, 'beep');
  assert.equal(o.n.ind, false); assert.equal(o.n.price, true); assert.deepEqual(P.sanitize(null), P.DEF);
});
test('formatPrice: automático iguala al formato anterior y respeta separadores/decimales/símbolo', () => {
  assert.equal(P.formatPrice(67890.1234, P.DEF), '67,890.12'); assert.equal(P.formatPrice(12.3456, P.DEF), '12.35'); assert.equal(P.formatPrice(.5, P.DEF), '0.5000'); assert.equal(P.formatPrice(.00001234, P.DEF), '0.00001234'); assert.equal(P.formatPrice(NaN, P.DEF), '—');
  assert.equal(P.formatPrice(67890.1234, {...P.DEF, sep: 'es', sym: '$'}), '$67.890,12'); assert.equal(P.formatPrice(1234.5, {...P.DEF, dec: 0, sep: 'none'}), '1235'); assert.equal(P.formatPrice(-5.5, {...P.DEF, dec: 3}), '-5.500');
  assert.equal(P.formatPrice(1234567.891, {...P.DEF, sep: 'sp', dec: 1}), '1 234 567,9');
});
test('zona horaria, 12/24 h y fecha', () => {
  const t = Date.UTC(2026, 10, 4, 3, 30); // 4 nov 03:30 UTC = 3 nov 21:30 en CDMX (UTC-6)
  assert.deepEqual(P.parts(t, 'UTC'), {y: 2026, mo: 11, d: 4, h: 3, mi: 30});
  const m = P.parts(t, 'America/Mexico_City'); assert.equal(m.d, 3); assert.equal(m.h, 21);
  assert.equal(P.axisLabel(t, null, '1h', {...P.DEF, tz: 'UTC'}), '03:30'); assert.equal(P.axisLabel(t, null, '1h', {...P.DEF, tz: 'UTC', clock: '12'}), '3:30 a. m.');
  assert.equal(P.axisLabel(t, t - 36e5 * 6, '1h', {...P.DEF, tz: 'UTC'}), '4/11'); assert.equal(P.axisLabel(t, null, '1d', {...P.DEF, tz: 'UTC', date: 'mdy'}), '11/4'); assert.equal(P.axisLabel(t, null, '1M', {...P.DEF, tz: 'UTC'}), 'nov 26');
  assert.equal(P.full(t, {...P.DEF, tz: 'America/Mexico_City'}), '3 nov 21:30'); assert.equal(P.full(t, {...P.DEF, tz: 'UTC', date: 'iso', clock: '12'}), '2026-11-04 3:30 a. m.');
});
