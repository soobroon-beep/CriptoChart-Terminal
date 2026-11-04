const test = require('node:test'), assert = require('node:assert');
const S = require('../scripts/discord-screener.js'), F = require('../discord-format.js');
const HOOK = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEFGHIJ_-0123';
test('temporalidades forzadas', () => {
  assert.deepEqual(S.timeframes(new Date('2026-11-02T05:02:00Z'), '4h'), ['4h']);
  assert.deepEqual(S.timeframes(new Date('2026-11-02T05:02:00Z'), 'xx'), ['1h']);
});
test('franjas: 1h cada hora y 4h cada 4 h UTC, una sola vez; una corrida perdida se recupera', () => {
  const t = iso => Date.parse(iso);
  assert.deepEqual(S.dueTfs(t('2026-11-02T05:03:00Z'), {}), ['1h', '4h']); // sin estado: lo manda todo
  const st = {'1h': S.slotOf('1h', t('2026-11-02T05:03:00Z')), '4h': S.slotOf('4h', t('2026-11-02T05:03:00Z'))};
  assert.deepEqual(S.dueTfs(t('2026-11-02T05:53:00Z'), st), []); // misma hora: ya enviado
  assert.deepEqual(S.dueTfs(t('2026-11-02T06:03:00Z'), st), ['1h']); // hora nueva: solo 1h
  assert.deepEqual(S.dueTfs(t('2026-11-02T07:53:00Z'), st), ['1h']);
  assert.deepEqual(S.dueTfs(t('2026-11-02T08:13:00Z'), st), ['1h', '4h']); // franja de las 08: 1h y 4h (aunque la corrida de :03 se perdiera)
  assert.deepEqual(S.dueTfs(t('2026-11-02T03:03:00Z'), {'1h': S.slotOf('1h', t('2026-11-02T03:03:00Z')), '4h': S.slotOf('4h', t('2026-11-02T00:03:00Z'))}), []); // 03:03 sigue en la franja 4h de las 00
});
test('formato: LONG / SHORT / RANGO y mensaje vacío', () => {
  const em = F.signalEmbeds('1h', [{symbol: 'SOLUSDT', price: 171.2, sg: {side: 'buy', range: false, div: true, score: 4, age: 1}}, {symbol: 'DOGEUSDT', price: .1823, sg: {side: 'sell', range: false, div: false, score: 2, age: 3}}, {symbol: 'XRPUSDT', price: 2.1, sg: {side: 'buy', range: true, div: false, score: 1, age: 5}}]);
  assert.equal(em.length, 3); assert.match(em[0].title, /LONG \(1\)/); assert.match(em[0].description, /SOL\*\* · 171.2 · ★★★★☆ · divergencia · vela 1\/5/);
  assert.match(em[1].title, /SHORT/); assert.match(em[2].title, /RANGO/); assert.match(em[2].footer.text, /3 con señal de 3/);
  const all = F.signalEmbeds('1h', [{symbol: 'SOLUSDT', price: 1, sg: {side: 'buy', range: false, div: false, score: 3, age: 2}}], ['SOLUSDT', 'BTCUSDT', 'ETHUSDT']);
  assert.equal(all.length, 1); assert.ok(!all.some(e => /Sin señal/.test(e.title))); assert.match(all[0].footer.text, /1 con señal de 3/); // las criptos sin señal ya no se mandan
  assert.deepEqual(F.signalEmbeds('4h', []), []); // sin señales: no se manda nada
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
    await S.post(HOOK, [{title: 'prueba'}]); // 429 → reintenta
    assert.equal(sent.length, 1); assert.equal(sent[0].username, 'VORTEX'); assert.deepEqual(sent[0].allowed_mentions, {parse: []});
  } finally { globalThis.fetch = real; }
});
