/* Prueba e2e: reordenar paneles (RSI, MACD, ATR…) manteniendo pulsado su nombre y arrastrando.
   Uso: node reorder-panes.js [carpeta] [prefijo-capturas] */
const {chromium} = require('playwright-core'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..', '..')) + '/', shot = process.argv[3] || '/tmp/leg';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json'};
const SYMS = ['BTC', 'ETH', 'ZEC'], t24 = SYMS.map((b, i) => ({symbol: b + 'USDT', lastPrice: String(1300 - i * 100), priceChangePercent: '4.06', quoteVolume: String(9e9 - i)}));
const kl = () => Array.from({length: 300}, (_, i) => { const t = Date.now() - (300 - i) * 3600e3, p = 1200 + Math.sin(i / 9) * 90 + i * .3; return [t, p, p + 25, p - 25, p + (i % 3 - 1) * 8, 100, t + 3599e3]; });
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fail = 1; };
(async () => {
  const srv = http.createServer((q, r) => { const f = root + (q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'text/plain'); r.end(d); }); });
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port, br = await chromium.launch({executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']});
  const json = (route, body) => route.fulfill({body: JSON.stringify(body), contentType: 'application/json', headers: {'access-control-allow-origin': '*'}});
  for (const [name, vp, mobile] of [['escritorio', {width: 1440, height: 900}, false], ['móvil', {width: 412, height: 860}, true]]) {
    const ctx = await br.newContext({viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2}), page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.route('**/*', route => { const u = route.request().url(); if (u.startsWith('http://localhost')) return route.continue(); if (u.includes('/klines')) return json(route, kl()); if (u.includes('/ticker/24hr')) return json(route, t24); if (u.includes('/ticker/price')) return json(route, {price: '1300'}); return route.abort(); });
    await ctx.addInitScript(() => { try { if (!localStorage.getItem('cct_mobile_v1')) localStorage.setItem('cct_mobile_v1', JSON.stringify({symbol: 'ZECUSDT', interval: '1h', symbols: ['BTCUSDT', 'ETHUSDT', 'ZECUSDT'], indicators: {rsi: true, macd: true, atr: true}})); } catch {} });
    await page.goto(`http://localhost:${port}/`); await page.waitForSelector('#watchView'); if (mobile) await page.click('.bottom-nav [data-view="chartView"]'); await page.waitForSelector('#legToggle:not([hidden])');
    await page.waitForTimeout(500);
    if (!(await page.$$eval('.leg-row', e => e.length))) await page.click('#legToggle'); await page.waitForTimeout(400);
    const order = () => page.$$eval('.leg-handle:not([data-hk^="m:"])', e => e.map(x => [x.dataset.hk, x.getBoundingClientRect().top]).sort((p, q) => p[1] - q[1]).map(x => x[0]).join(','));
    ok(await order() === 'rsi,macd,atr', `${name}: orden de siempre sin tocar nada (${await order()})`);
    ok((await page.$$eval('.leg-handle:not([data-hk^="m:"])', e => e.map(x => x.dataset.hk).sort().join(','))) === 'atr,macd,rsi', `${name}: cada nombre de panel tiene su zona para arrastrar`);
    await page.screenshot({path: `${shot}-${mobile ? 'movil' : 'pc'}-antes.png`});
    const pos = async k => { const b = await (await page.$(`.leg-handle[data-hk="${k}"]`)).boundingBox(); return {x: b.x + b.width / 2, y: b.y + b.height / 2}; };
    const lim = () => page.evaluate(() => { const r = document.querySelector('#legendBox').getBoundingClientRect(), hs = [...document.querySelectorAll('.leg-handle:not([data-hk^="m:"])')].map(x => x.getBoundingClientRect().top); return {first: Math.min(...hs) - 14, last: r.bottom - 22 - 4}; });
    const cdp = mobile ? await ctx.newCDPSession(page) : null;
    const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{x, y}]});
    const drag = async (k, toY, hold) => {
      const a = await pos(k);
      if (mobile) { await tp('touchStart', a.x, a.y); await page.waitForTimeout(hold); const steps = 12; for (let i = 1; i <= steps; i++) { await tp('touchMove', a.x, a.y + (toY - a.y) * i / steps); await page.waitForTimeout(25); } await tp('touchEnd'); }
      else { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.waitForTimeout(hold); const steps = 12; for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x, a.y + (toY - a.y) * i / steps); await page.waitForTimeout(25); } await page.mouse.up(); }
      await page.waitForTimeout(400);
    };
    // 1) arrastre inmediato (sin mantener pulsado) no mueve nada
    let L = await lim(); await drag('rsi', L.last, 20); ok(await order() === 'rsi,macd,atr', `${name}: arrastrar sin mantener pulsado NO reordena (${await order()})`);
    // 2) mantener pulsado el nombre de RSI y arrastrarlo debajo de todos
    if (!(await page.$$eval('.leg-row', e => e.length))) await page.click('#legToggle'); await page.waitForTimeout(300);
    L = await lim(); await drag('rsi', L.last, 500); ok(await order() === 'macd,atr,rsi', `${name}: RSI mantenido y arrastrado abajo queda al final (${await order()})`);
    await page.screenshot({path: `${shot}-${mobile ? 'movil' : 'pc'}-despues.png`});
    ok(JSON.parse(await page.evaluate(() => localStorage.getItem('cct_paneOrder_v1') || '[]')).join(',').startsWith('macd,atr,rsi'), `${name}: el orden se guarda`);
    // 3) ahora ATR hacia arriba, encima de todos
    if (!(await page.$$eval('.leg-row', e => e.length))) await page.click('#legToggle'); await page.waitForTimeout(300);
    L = await lim(); await drag('atr', L.first + 3, 500); ok(await order() === 'atr,macd,rsi', `${name}: ATR arrastrado arriba queda primero (${await order()})`);
    // 4) los botones siguen funcionando y no se movió nada más
    ok((await page.$$eval('.leg-handle:not([data-hk^="m:"])', e => e.length)) === 3, `${name}: los tres indicadores siguen en el gráfico`);
    // 5) recargar conserva el orden
    await page.reload(); await page.waitForSelector('#watchView'); if (mobile) await page.click('.bottom-nav [data-view="chartView"]'); await page.waitForSelector('#legToggle:not([hidden])'); await page.waitForTimeout(600);
    ok(await order() === 'atr,macd,rsi', `${name}: al recargar conserva el orden (${await order()})`);
    ok(errs.length === 0, `${name}: sin errores de JavaScript ${errs.join('|')}`);
    await ctx.close();
  }
  await br.close(); srv.close(); process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
