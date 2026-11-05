const {test} = require('node:test');
const assert = require('node:assert/strict');
const S = require('../sessions.js');
const M = id => S.MARKETS.find(m => m.id === id);
test('zonedToUtc respeta el horario de verano', () => {
  assert.equal(new Date(S.zonedToUtc(2026, 11, 4, 9, 30, 'America/New_York')).toISOString(), '2026-11-04T14:30:00.000Z'); // EST (UTC-5)
  assert.equal(new Date(S.zonedToUtc(2026, 7, 1, 9, 30, 'America/New_York')).toISOString(), '2026-07-01T13:30:00.000Z'); // EDT (UTC-4)
  assert.equal(new Date(S.zonedToUtc(2026, 11, 4, 9, 0, 'Asia/Tokyo')).toISOString(), '2026-11-04T00:00:00.000Z');
});
test('Nueva York abre 14:30–21:00 UTC en noviembre y cierra fines de semana', () => {
  const ny = M('ny'), wed = Date.UTC(2026, 10, 4, 15, 0), sat = Date.UTC(2026, 10, 7, 15, 0);
  const s = S.status(ny, wed); assert.equal(s.open, true); assert.equal(new Date(s.until).toISOString(), '2026-11-04T21:00:00.000Z');
  const c = S.status(ny, sat); assert.equal(c.open, false); assert.equal(new Date(c.until).toISOString(), '2026-11-09T14:30:00.000Z'); // lunes
  assert.equal(S.status(ny, Date.UTC(2026, 10, 4, 14, 29)).open, false);
});
test('Tokio con pausa de almuerzo y CME con pausa diaria', () => {
  const t = M('tyo'); assert.equal(S.status(t, Date.UTC(2026, 10, 4, 2, 45)).open, false); assert.equal(S.status(t, Date.UTC(2026, 10, 4, 1, 0)).open, true); assert.equal(S.status(t, Date.UTC(2026, 10, 4, 4, 0)).open, true);
  const c = M('cme'); assert.equal(S.status(c, Date.UTC(2026, 10, 4, 22, 30)).open, false); assert.equal(S.status(c, Date.UTC(2026, 10, 4, 23, 30)).open, true); assert.equal(S.status(c, Date.UTC(2026, 10, 8, 3, 0)).open, false); // sábado
  assert.equal(S.status(c, Date.UTC(2026, 10, 8, 23, 30)).open, true); // domingo 17:30 hora de Chicago
});
test('headline y duración', () => {
  const now = Date.UTC(2026, 10, 5, 5, 0), h = S.headline(now); // 05:00 UTC: solo Tokio, Hong Kong y CME abiertos
  assert.equal(h.kind, 'close'); assert.equal(h.m.id, 'tyo'); assert.equal(S.dur(3600e3), '1 h'); assert.equal(S.dur(90 * 6e4), '1 h 30 m'); assert.equal(S.dur(25 * 6e4), '25 m'); assert.equal(S.dur(30 * 3600e3), '1 d 6 h');
});
