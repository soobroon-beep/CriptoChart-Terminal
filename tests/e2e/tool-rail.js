/* Prueba e2e (escritorio): botón «Mi seguimiento» junto a Noticias + barra izquierda de herramientas de dibujo.
   Dibuja TODAS las herramientas desde la barra y comprueba que se guardan sin errores. Uso: node tool-rail.js [carpeta] [captura.png] */
const {chromium} = require('playwright-core'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..', '..')) + '/';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json'};
const SYMS = ['BTC', 'ETH', 'ZEC', 'SOL'], t24 = SYMS.map((b, i) => ({symbol: b + 'USDT', lastPrice: String(1300 - i * 100), priceChangePercent: '4.06', quoteVolume: String(9e9 - i)}));
const kl = () => Array.from({length: 300}, (_, i) => { const t = Date.now() - (300 - i) * 3600e3, p = 1200 + Math.sin(i / 9) * 90 + i * .3; return [t, p, p + 25, p - 25, p + (i % 3 - 1) * 8, 100, t + 3599e3]; });
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fail = 1; };
(async () => {
  const srv = http.createServer((q, r) => { const f = root + (q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'text/plain'); r.end(d); }); });
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await chromium.launch({executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']}), ctx = await br.newContext({viewport: {width: 1440, height: 900}}), page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept('Nota de prueba'));
  const json = (route, body) => route.fulfill({body: JSON.stringify(body), contentType: 'application/json', headers: {'access-control-allow-origin': '*'}});
  await page.route('**/*', route => { const u = route.request().url();
    if (u.startsWith('http://localhost')) return route.continue();
    if (u.includes('/klines')) return json(route, kl());
    if (u.includes('/ticker/24hr')) return json(route, t24);
    if (u.includes('/ticker/price')) return json(route, {price: '1300'});
    return route.abort(); });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('cct_mobile_v1')) localStorage.setItem('cct_mobile_v1', JSON.stringify({symbol: 'ZECUSDT', interval: '1h', symbols: ['BTCUSDT', 'ETHUSDT', 'ZECUSDT', 'SOLUSDT']})); } catch {} });
  await page.goto(`http://localhost:${port}/?cct_debug=1`); await page.waitForSelector('#toolRail .rail-btn'); await page.waitForTimeout(900);

  // ── Mi seguimiento junto a Noticias
  const tabs = await page.$$eval('.side-tabs button', b => b.map(x => x.textContent.trim()));
  ok(tabs[0].includes('Mi seguimiento') && tabs[1].includes('Noticias'), 'botón «Mi seguimiento» junto a Noticias (' + tabs.join(' | ') + ')');
  const lay = await page.evaluate(() => { const r = id => document.querySelector(id).getBoundingClientRect(); return {rail: r('#toolRail'), watch: r('#watchView'), chart: r('#chartView'), railVis: getComputedStyle(document.querySelector('#toolRail')).display, wv: getComputedStyle(document.querySelector('#watchView')).display}; });
  ok(lay.rail.width > 40 && lay.rail.width < 70 && lay.rail.left < 5, 'columna izquierda delgada (' + Math.round(lay.rail.width) + 'px)');
  ok(lay.wv !== 'none' && lay.watch.left > lay.chart.left, 'la lista de seguimiento está en el panel derecho');
  ok(await page.$$eval('#watchRows .watch-row', e => e.length) >= 3 && await page.isVisible('#popSection'), 'se ven las criptomonedas y los populares');
  await page.click('.side-tabs [data-side="newsView"]'); ok(await page.isHidden('#watchView') && await page.isVisible('#newsView'), 'Noticias oculta el seguimiento');
  await page.click('.side-tabs [data-side="watchView"]'); ok(await page.isVisible('#watchView') && await page.isHidden('#newsView'), 'Mi seguimiento vuelve a mostrarlo');
  await page.click('#watchRows .watch-row:nth-child(2)'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => CCT_DEBUG.state.symbol) === 'ETHUSDT' && await page.isVisible('#watchView'), 'tocar una moneda abre su gráfico y el panel sigue visible');
  await page.click('#watchRows .watch-row:nth-child(3)'); await page.waitForTimeout(600);

  // ── Barra de dibujo: todas las herramientas
  const groups = await page.$$eval('#toolRail [data-group]', b => b.length); ok(groups === 6, '6 grupos de herramientas en la barra');
  const total = await page.evaluate(() => CCT_DEBUG.TOOL_GROUPS.reduce((n, g) => n + g.tools.length, 0)); console.log('INFO herramientas en el catálogo: ' + total);
  const g0 = await page.evaluate(() => ({l: CCT_DEBUG.geo.left, t: CCT_DEBUG.geo.plotTop, w: CCT_DEBUG.geo.plotW, h: CCT_DEBUG.geo.plotH})), cv = await page.evaluate(() => { const r = document.querySelector('#priceCanvas').getBoundingClientRect(); return {x: r.left, y: r.top}; });
  const keys = await page.evaluate(() => CCT_DEBUG.TOOL_GROUPS.flatMap(g => g.tools.map(t => t[0])));
  let drawn = 0, bad = [];
  for (const [ti, k] of keys.entries()) {
    const gid = await page.evaluate(k => CCT_DEBUG.groupOf(k).id, k);
    await page.click(`#toolRail [data-fly="${gid}"]`); await page.waitForSelector('#railFly'); await page.click(`#railFly [data-rtool="${k}"]`);
    if (await page.evaluate(() => CCT_DEBUG.drawTool) !== k) { bad.push(k + ' (no se activó)'); continue; }
    const n = await page.evaluate(k => CCT_DEBUG.ONEPT.includes(k) ? 1 : CCT_DEBUG.THREEPT.includes(k) ? 3 : CCT_DEBUG.MULTI[k] ? CCT_DEBUG.MULTI[k].n : 2, k), before = await page.evaluate(() => CCT_DEBUG.getDrawings().length);
    const bx = cv.x + g0.l + 60 + (ti % 6) * 55, mid = cv.y + g0.t + g0.h * (.3 + (ti % 5) * .08);
    const P = Array.from({length: n}, (_, i) => [bx + i * 62, mid + (k === 'long' ? -i * 70 : k === 'short' ? i * 70 : ((i * 53 + ti * 29) % 90) - 45)]);
    if (k === 'brush' || k === 'highlighter') { await page.mouse.move(bx, mid); await page.mouse.down(); for (let s = 1; s <= 14; s++) await page.mouse.move(bx + s * 16, mid + Math.sin(s / 2) * 40); await page.mouse.up(); }
    else for (const [x, y] of P) { await page.mouse.click(x, y); await page.waitForTimeout(30); }
    await page.waitForTimeout(60);
    const after = await page.evaluate(() => CCT_DEBUG.getDrawings().length); if (after === before + 1) drawn++; else bad.push(k + ` (${before}→${after})`);
    await page.click('#toolRail [data-rail="cursor"]'); await page.mouse.click(cv.x + 5, cv.y + 5);
  }
  ok(drawn === keys.length, `se dibujaron ${drawn}/${keys.length} herramientas${bad.length ? ' · fallaron: ' + bad.join(', ') : ''}`);
  ok(errs.length === 0, 'sin errores de JavaScript' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cct_mobile_v1')).drawings[CCT_DEBUG.state.symbol].length); ok(saved === keys.length, 'los dibujos se guardan (' + saved + ')');
  await page.screenshot({path: process.argv[3] || '/tmp/rail-all.png'});

  // ── Opciones inferiores
  await page.click('[data-opt="hide"]'); ok(await page.evaluate(() => CCT_DEBUG.DOPT.hide), 'ocultar dibujos'); await page.click('[data-opt="hide"]');
  await page.click('[data-opt="lock"]'); ok(await page.evaluate(() => CCT_DEBUG.DOPT.lock && CCT_DEBUG.hitTest({x: 100, y: 100}) === null), 'bloquear dibujos'); await page.click('[data-opt="lock"]');
  await page.click('[data-opt="magnet"]'); ok(await page.evaluate(() => CCT_DEBUG.DOPT.magnet === false), 'imán se puede apagar'); await page.click('[data-opt="magnet"]');
  await page.click('[data-opt="stay"]'); await page.click('#toolRail [data-fly="lines"]'); await page.click('#railFly [data-rtool="trend"]'); const b4 = await page.evaluate(() => CCT_DEBUG.getDrawings().length);
  await page.mouse.click(cv.x + g0.l + 100, cv.y + g0.t + 200); await page.mouse.click(cv.x + g0.l + 220, cv.y + g0.t + 120); await page.waitForTimeout(100);
  ok(await page.evaluate(() => CCT_DEBUG.drawTool) === 'trend' && await page.evaluate(() => CCT_DEBUG.getDrawings().length) === b4 + 1, 'mantener herramienta: sigue activa tras dibujar'); await page.click('[data-opt="stay"]'); await page.click('[data-rail="cursor"]');
  // seleccionar y mover un punto de un patrón
  await page.keyboard.press('Escape');
  // deshacer con Ctrl+Z
  const c0 = await page.evaluate(() => CCT_DEBUG.getDrawings().length); await page.keyboard.press('Control+z'); const c1 = await page.evaluate(() => CCT_DEBUG.getDrawings().length); ok(c1 === c0 - 1, 'Ctrl+Z deshace');
  // ── recarga: persistencia
  await page.reload(); await page.waitForSelector('#toolRail .rail-btn'); await page.waitForTimeout(700);
  ok(await page.evaluate(() => CCT_DEBUG.getDrawings().length) === c1, 'tras recargar siguen los dibujos (' + c1 + ')');
  ok(await page.evaluate(() => document.querySelector('#toolRail [data-group="lines"]').dataset.last) === 'trend', 'la barra recuerda la última herramienta del grupo');

  // ── móvil: sin barra izquierda, hoja «Dibujar» con todo
  const m = await br.newContext({viewport: {width: 412, height: 860}, isMobile: true, hasTouch: true}), mp = await m.newPage(); const merrs = []; mp.on('pageerror', e => merrs.push(String(e)));
  await mp.route('**/*', route => { const u = route.request().url(); if (u.startsWith('http://localhost')) return route.continue(); if (u.includes('/klines')) return json(route, kl()); if (u.includes('/ticker/24hr')) return json(route, t24); return route.abort(); });
  await mp.goto(`http://localhost:${port}/`); await mp.waitForSelector('#watchView.active'); await mp.click('.bottom-nav [data-view="chartView"]'); await mp.waitForTimeout(500);
  ok(await mp.isHidden('#toolRail'), 'móvil: la barra izquierda no se muestra');
  await mp.click('[data-panel="tools"]'); await mp.waitForSelector('#sheetList .sheet-item');
  ok(await mp.$$eval('#sheetList .sheet-item[data-tool]', e => e.length) === keys.length + 1, 'móvil: la hoja «Dibujar» lista todas las herramientas (' + keys.length + ' + borrar)');
  ok(merrs.length === 0, 'móvil sin errores de JavaScript');
  await br.close(); srv.close(); process.exit(fail);
})().catch(e => { console.error(e); process.exit(1); });
