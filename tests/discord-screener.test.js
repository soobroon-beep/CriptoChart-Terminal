const test = require('node:test'), assert = require('node:assert');
const S = require('../scripts/discord-screener.js'), F = require('../discord-format.js');
const HOOK = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEFGHIJ_-0123';
test('temporalidades: cada hora 1h y cada 4 h UTC también 4h; se puede forzar', () => {
  assert.deepEqual(S.timeframes(new Date('2026-11-02T05:02:00Z')), ['1h']);
  assert.deepEqual(S.timeframes(new Date('2026-11-02T08:02:00Z')), ['1h', '4h']);
  assert.deepEqual(S.timeframes(new Date('2026-11-02T00:02:00Z')), ['1h', '4h']);
  assert.deepEqual(S.timeframes(new Date('2026-11-02T05:02:00Z'), '4h'), ['4h']);
  assert.deepEqual(S.timeframes(new Date('2026-11-02T05:02:00Z'), 'xx'), ['1h']);
});
test('formato: LONG / SHORT / RANGO y mensaje vacío', () => {
  const em = F.signalEmbeds('1h', [{symbol: 'SOLUSDT', price: 171.2, sg: {side: 'buy', range: false, div: true, score: 4, age: 1}}, {symbol: 'DOGEUSDT', price: .1823, sg: {side: 'sell', range: false, div: false, score: 2, age: 3}}, {symbol: 'XRPUSDT', price: 2.1, sg: {side: 'buy', range: true, div: false, score: 1, age: 5}}]);
  assert.equal(em.length, 3); assert.match(em[0].title, /LONG \(1\)/); assert.match(em[0].description, /SOL\*\* · 171.2 · ★★★★☆ · divergencia · vela 1\/5/);
  assert.match(em[1].title, /SHORT/); assert.match(em[2].title, /RANGO/); assert.match(em[2].footer.text, /3 con señal de 3/);
  const all = F.signalEmbeds('1h', [{symbol: 'SOLUSDT', price: 1, sg: {side: 'buy', range: false, div: false, score: 3, age: 2}}], ['SOLUSDT', 'BTCUSDT', 'ETHUSDT']);
  assert.match(all[all.length - 1].title, /Sin señal \(2\)/); assert.match(all[all.length - 1].description, /BTC · ETH/); assert.match(all[all.length - 1].footer.text, /1 con señal de 3/);
  const v = F.signalEmbeds('4h', []); assert.equal(v.length, 1); assert.match(v[0].title, /sin señales/);
});
test('flujo completo con Binance y Discord simulados', async () => {
  const sent = [], real = globalThis.fetch; let n = 0;
  const mk = (i, k) => { const t0 = Date.now() - (300 - i) * 36e5, c = 100 + Math.sin(i / 9) * 12 + i * .02; return [t0, String(c - .3), String(c + 1.2), String(c - 1.5), String(c), '10', t0 + 36e5 - 1]; };
  globalThis.fetch = async (u, o) => {
    u = String(u);
    if (u.includes('/ticker/24hr')) return {ok: true, json: async () => ['BTC', 'ETH', 'SOL'].map(b => ({symbol: b + 'USDT', quoteVolume: '9000000', lastPrice: '100'})).concat([{symbol: 'USDCUSDT', quoteVolume: '9e9', lastPrice: '1'}])};
    if (u.includes('/klines')) return {ok: true, json: async () => Array.from({length: 300}, (_, i) => mk(i))};
    if (u.includes('discord.com')) { n++; if (n === 1) return {ok: false, status: 429, json: async () => ({retry_after: .01})}; sent.push(JSON.parse(o.body)); return {ok: true, status: 204}; }
    throw new Error('url inesperada ' + u);
  };
  try {
    const top = await S.topSymbols(50); assert.deepEqual(top.map(t => t.symbol), ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']); // sin estables
    const rows = await S.scan('1h', top); assert.ok(Array.isArray(rows));
    await S.post(HOOK, require('../discord-format.js').signalEmbeds('1h', rows)); // 429 → reintenta
    assert.equal(sent.length, 1); assert.equal(sent[0].username, 'VORTEX'); assert.deepEqual(sent[0].allowed_mentions, {parse: []});
  } finally { globalThis.fetch = real; }
});
