/* Prueba e2e: leyenda de indicadores plegable (botón «N indicadores»), íconos SVG en vez de emojis y marca VORTEX.
   Uso: node legend-toggle.js [carpeta] [prefijo-capturas] */
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
    await ctx.addInitScript(() => { try { if (!localStorage.getItem('cct_mobile_v1')) localStorage.setItem('cct_mobile_v1', JSON.stringify({symbol: 'ZECUSDT', interval: '1h', symbols: ['BTCUSDT', 'ETHUSDT', 'ZECUSDT']})); } catch {} });
    await page.goto(`http://localhost:${port}/`); await page.waitForSelector('#watchView'); if (mobile) await page.click('.bottom-nav [data-view="chartView"]'); await page.waitForSelector('#legToggle:not([hidden])'); await page.waitForTimeout(700);
    ok(/^\d+ indicadores?$/.test((await page.textContent('#legToggle')).trim()), `${name}: el botón dice cuántos indicadores hay («${(await page.textContent('#legToggle')).trim()}»)`);
    ok(await page.$$eval('.leg-row', e => e.length) === 0, `${name}: cerrado no se ve ningún botón de ocultar/ajustes/eliminar`);
    await page.screenshot({path: `${shot}-${mobile ? 'movil' : 'pc'}-cerrado.png`});
    const n0 = parseInt(await page.textContent('#legToggle'));
    await page.click('#legToggle'); await page.waitForTimeout(400);
    const rows = await page.$$eval('.leg-row', e => e.length); ok(rows >= 3, `${name}: abierto aparecen las opciones de cada indicador (${rows} filas)`);
    const html = await page.$eval('#legendBox', e => e.innerHTML); ok(!/[👁🙈⚙✕⇅]/u.test(html) && /<svg/.test(html), `${name}: los botones usan íconos SVG, no emojis`);
    await page.screenshot({path: `${shot}-${mobile ? 'movil' : 'pc'}-abierto.png`});
    await page.reload(); await page.waitForSelector('#watchView'); if (mobile) await page.click('.bottom-nav [data-view="chartView"]'); await page.waitForSelector('#legToggle:not([hidden])'); await page.waitForTimeout(700);
    ok(await page.$$eval('.leg-row', e => e.length) >= 3, `${name}: recuerda que estaba abierto al recargar`);
    await page.click('.leg-row [data-do="del"]'); await page.waitForTimeout(400);
    ok(parseInt(await page.textContent('#legToggle')) === n0 - 1, `${name}: eliminar un indicador baja el conteo (${n0} → ${n0 - 1})`);
    await page.click('#legToggle'); await page.waitForTimeout(300); ok(await page.$$eval('.leg-row', e => e.length) === 0, `${name}: se vuelve a cerrar`);
    // marca
    ok((await page.textContent('.brand strong')).trim() === 'VORTEX' && (await page.textContent('.brand small')).trim() === 'Powered by Nova Nexus', `${name}: marca «VORTEX · Powered by Nova Nexus»`);
    ok(await page.title() === 'VORTEX · Powered by Nova Nexus', `${name}: título de la pestaña`);
    ok(errs.length === 0, `${name}: sin errores de JavaScript ${errs.join('|')}`);
    await ctx.close();
  }
  await br.close(); srv.close(); process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
