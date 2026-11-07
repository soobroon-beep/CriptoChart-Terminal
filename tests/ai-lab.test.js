const test = require('node:test');
const assert = require('node:assert/strict');
const AI = require('../ai.js');
const Pine = require('../pine.js');

const now = Date.UTC(2026, 10, 6, 20);
const candles = Array.from({length: 300}, (_, i) => {
  const c = 1000 + i * .4 + Math.sin(i / 7) * 12;
  return {t: now - (300 - i) * 900000, o: c - 1, h: c + 3, l: c - 3, c, v: 300 + i * 2};
});
const ctx = {symbol: 'BTCUSDT', interval: '15m', candles, change24h: 1.4,
  active: ['rsi', 'volume'], values: {}, zones: {sup: [], res: []}, pine: []};

test('recetas IA locales generan indicadores reales compatibles con el motor Pine de Vortex', () => {
  const prompts = [
    'combina RSI MACD y volumen para confirmar señales',
    'crea soportes y resistencias automáticas',
    'quiero un oscilador RSI más sensible',
    'quiero tres medias móviles',
    'detectar ruptura con volumen'
  ];
  for (const q of prompts) {
    const draft = AI.draftIndicator(q);
    assert.ok(draft && draft.code.includes('indicator('), q);
    const result = Pine.run(draft.code, candles, {interval: ctx.interval, symbol: ctx.symbol, timeLimitMs: 6000});
    assert.equal(result.ok, true, q + ': ' + (result.error && result.error.msg));
    assert.equal((result.warnings || []).filter(w => w.level === 'unsupported').length, 0, q);
    assert.ok((result.plots || []).length > 0, q);
  }
});

test('preguntas fuera de recetas locales no inventan scripts', () => {
  assert.equal(AI.draftIndicator('construye una red neuronal predictiva'), null);
});

test('briefing identifica fuente, fecha, escenarios y contexto macro en lugar de solo titulares', () => {
  const news = [{title:'Bitcoin sube tras cambios en los ETF', desc:'', cat:'cripto', impact:'alto',
    src:'Fuente de prueba', link:'https://example.com/noticia', t:now - 3600e3}];
  const calendar = [{title:'Core CPI m/m', t:now + 3600e3, impact:'High', country:'USD',
    forecast:'0.3%', previous:'0.2%', actual:''}];
  const extra = {now, news, calendar, market:[]};
  const text = AI.briefLocal(ctx, extra);
  for (const phrase of ['Mide presiones de precios', 'Escenario neutral', 'Actualización consultada', 'Leer fuente', 'Fuente de prueba']) {
    assert.ok(text.includes(phrase), phrase);
  }
  const json = JSON.parse(AI.compactContext(ctx, AI.analyze(ctx), extra));
  assert.equal(json.noticias[0].enlace, 'https://example.com/noticia');
  assert.match(json.calendario.proximos[0].fecha_utc, /^\d{4}-\d\d-\d\dT/);
  assert.ok(json.ultimas_velas_OHLCV.length > 0);
});
