const test = require('node:test'), assert = require('node:assert');
const AI = require('../ai.js');
const mk = (n, f) => { const t0 = Date.UTC(2026, 0, 1); let seed = 3; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647; return Array.from({length: n}, (_, i) => { const base = f(i), o = base + (rnd() - .5) * 20, c = base + (rnd() - .5) * 20; return {t: t0 + i * 36e5, o, h: Math.max(o, c) + rnd() * 15, l: Math.min(o, c) - rnd() * 15, c, v: 100 + rnd() * 50}; }); };
const ctxOf = (candles, extra) => Object.assign({symbol: 'BTCUSDT', interval: '1h', candles, change24h: 1.2, active: ['ema20', 'rsi'], values: {}, zones: {sup: [], res: []}, pine: []}, extra);
test('tendencia alcista → sesgo alcista y niveles ordenados', () => {
  const A = AI.analyze(ctxOf(mk(300, i => 1000 + i * 8 + Math.sin(i / 7) * 30)));
  assert.ok(A.score > 30, 'score ' + A.score); assert.match(A.bias, /alcista/);
  assert.ok(A.supports.every(s => s.p < A.price) && A.resists.every(s => s.p > A.price));
  for (let i = 1; i < A.supports.length; i++) assert.ok(A.supports[i].p <= A.supports[i - 1].p);
});
test('tendencia bajista → sesgo bajista', () => { const A = AI.analyze(ctxOf(mk(300, i => 4000 - i * 8 + Math.sin(i / 7) * 30))); assert.ok(A.score < -30, 'score ' + A.score); assert.match(A.bias, /bajista/); });
test('muy pocas velas → null', () => assert.equal(AI.analyze(ctxOf(mk(10, i => 100 + i))), null));
test('RSI en rango y plan coherente', () => {
  const A = AI.analyze(ctxOf(mk(300, i => 1000 + Math.sin(i / 9) * 120))); assert.ok(A.rsi > 0 && A.rsi < 100);
  assert.ok(A.plan.long.stop < A.price && A.plan.long.t1 > A.price && A.plan.short.stop > A.price && A.plan.short.t1 < A.price);
});
test('intenciones', () => {
  assert.equal(AI.intent('¿Qué soportes y resistencias ves?'), 'levels'); assert.equal(AI.intent('qué dicen las noticias'), 'news'); assert.equal(AI.intent('¿hay eventos del calendario?'), 'calendar');
  assert.equal(AI.intent('cómo manejo el riesgo'), 'risk'); assert.equal(AI.intent('dame una receta de pastel'), 'off'); assert.equal(AI.intent('¿Qué es el RSI?'), 'gloss:rsi'); assert.equal(AI.intent('hola'), 'help');
});
test('fuera de alcance se rechaza y no usa datos', () => assert.match(AI.answerLocal('cuál es la capital de Francia', ctxOf(mk(100, i => i))), /Solo puedo ayudarte con \*\*cripto\*\*/));
test('noticias: relevantes al activo y tono', () => {
  const now = Date.now(), items = [{title: 'Bitcoin sube tras aprobación de nuevo ETF', t: now - 3600e3, src: 'X', cat: 'cripto', impact: 'alto', desc: ''}, {title: 'Bitcoin récord de entradas institucionales', t: now - 7200e3, src: 'Y', cat: 'cripto', impact: 'medio', desc: ''}, {title: 'Ethereum enfrenta demanda', t: now - 1000, src: 'Z', cat: 'cripto', impact: 'medio', desc: ''}, {title: 'Bitcoin vieja noticia', t: now - 100 * 3600e3, src: 'Z', cat: 'cripto', impact: 'alto', desc: ''}];
  const N = AI.newsFor(items, 'BTCUSDT', now); assert.equal(N.about, 2); assert.equal(N.tone, 'positivo'); assert.ok(/bitcoin/i.test(N.top[0].title) && !N.top.some(i => /vieja/.test(i.title)));
});
test('calendario: alto impacto próximo y traducción', () => {
  const now = Date.now(), ev = [{t: now + 5 * 3600e3, title: 'Core CPI m/m', country: 'USD', impact: 'High', forecast: '0.3%', previous: '0.2%', actual: ''}, {t: now + 5 * 3600e3, title: 'Algo irrelevante', country: 'NZD', impact: 'High'}, {t: now - 3600e3, title: 'Unemployment Rate', country: 'USD', impact: 'High', actual: '4.1%', forecast: '4.2%'}, {t: now + 200 * 3600e3, title: 'FOMC Statement', country: 'USD', impact: 'High'}];
  const C = AI.calendarFor(ev, now); assert.equal(C.soonHigh.length, 1); assert.match(C.name(C.soonHigh[0]), /IPC subyacente/); assert.equal(C.recent.length, 1); assert.equal(C.upcoming.length, 1);
  const out = AI.answerLocal('¿hay eventos?', ctxOf(mk(100, i => 100 + i)), {calendar: ev, now}); assert.match(out, /alto impacto en menos de 24 h/);
});
test('respuesta completa trae secciones y aviso', () => { const out = AI.answerLocal('analiza el gráfico', ctxOf(mk(300, i => 1000 + i * 3 + Math.sin(i / 5) * 40))); for (const s of ['Sesgo', 'Indicadores', 'Niveles clave', 'Escenarios', 'no asesoría']) assert.ok(out.includes(s), s); });
test('askClaude: arma la petición y maneja errores', async () => {
  let req; global.fetch = async (u, o) => { req = {u, o}; return {ok: true, json: async () => ({content: [{type: 'text', text: 'ok'}]})}; };
  const ctx = ctxOf(mk(100, i => 100 + i)); assert.equal(await AI.askClaude({key: 'k', model: 'm'}, ctx, [], '¿tendencia?', {}), 'ok');
  const b = JSON.parse(req.o.body); assert.equal(b.model, 'm'); assert.match(b.system, /cripto/i); assert.match(b.messages.at(-1).content, /DATOS DEL GRÁFICO/); assert.equal(req.o.headers['x-api-key'], 'k');
  global.fetch = async () => ({ok: false, status: 401, json: async () => ({})}); await assert.rejects(() => AI.askClaude({key: 'k'}, ctx, [], 'x', {}), /no es válida/);
});
