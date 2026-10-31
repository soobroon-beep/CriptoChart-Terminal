const test = require('node:test'), assert = require('node:assert');
const M = require('../markets.js');
test('claves: Binance sin sufijo, otros con @', () => {
  assert.deepEqual(M.parse('BTCUSDT'), {sym: 'BTCUSDT', src: 'binance'});
  assert.deepEqual(M.parse('BTCUSDT@bybit'), {sym: 'BTCUSDT', src: 'bybit'});
  assert.deepEqual(M.parse('BTC-USDT@okx'), {sym: 'BTC-USDT', src: 'okx'});
  assert.equal(M.parse('X@raro').src, 'binance');
  assert.equal(M.mk('BTCUSDT', 'binance'), 'BTCUSDT'); assert.equal(M.mk('BTCUSDT', 'bybit'), 'BTCUSDT@bybit');
});
test('normalizadores de cada exchange', () => {
  assert.equal(M.N.binance([{symbol: 'ETHBTC', lastPrice: '0.05', priceChangePercent: '1', quoteVolume: '10'}, {symbol: 'FOO', lastPrice: '1'}]).length, 1);
  const by = M.N.bybit({result: {list: [{symbol: 'BTCUSDT', lastPrice: '100', price24hPcnt: '0.02', turnover24h: '5'}]}})[0]; assert.equal(by.chg, 2); assert.equal(by.key, 'BTCUSDT@bybit');
  const ok = M.N.okx({data: [{instId: 'BTC-USDT', last: '110', open24h: '100', volCcy24h: '3'}, {instId: 'BTC-USD-SWAP', last: '1', open24h: '1'}]}); assert.equal(ok.length, 1); assert.ok(Math.abs(ok[0].chg - 10) < 1e-9);
  assert.equal(M.N.coinbase([{id: 'BTC-USD', base_currency: 'BTC', quote_currency: 'USD'}, {id: 'X-GBP', base_currency: 'X', quote_currency: 'GBP'}])[0].key, 'BTC-USD@coinbase');
  assert.equal(M.N.bingx({data: {symbols: [{symbol: 'BTC-USDT', status: 1}, {symbol: 'OLD-USDT', status: 0}]}}).length, 1);
});
test('buscador: mismo activo en varios exchanges, ordenado', async () => {
  M.setFetcher(async url => url.includes('bybit') ? {result: {list: [{symbol: 'BTCUSDT', lastPrice: '1', price24hPcnt: '0', turnover24h: '9'}, {symbol: 'ETHUSDT', lastPrice: '1', price24hPcnt: '0', turnover24h: '1'}]}} : url.includes('okx') ? {data: [{instId: 'BTC-USDT', last: '1', open24h: '1', volCcy24h: '1'}]} : url.includes('binance.com/api') ? [{symbol: 'BTCUSDT', lastPrice: '1', priceChangePercent: '0', quoteVolume: '99'}, {symbol: 'BTCUSDC', lastPrice: '1', priceChangePercent: '0', quoteVolume: '9'}] : (() => { throw Error('x'); })());
  for (const s of ['binance', 'bybit', 'okx', 'bingx']) await M.universe(s);
  const r = M.search('btc'); const keys = r.map(x => x.key);
  assert.ok(keys.includes('BTCUSDT') && keys.includes('BTCUSDT@bybit') && keys.includes('BTC-USDT@okx'));
  assert.equal(keys[0], 'BTCUSDT'); assert.ok(!keys.some(k => k.startsWith('ETH')));
  assert.equal(M.search('ethusdt')[0].key, 'ETHUSDT@bybit');
});
