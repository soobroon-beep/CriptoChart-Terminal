// Divisiones (1/2 gráficos), tipos de vela y barra de selección de dibujos (color, borrar, deshacer/rehacer)
const {chromium} = require('playwright-core'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..') + '/', out = process.env.SHOTS || '/tmp/'; fs.mkdirSync(out, {recursive: true});
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const t0 = Date.UTC(2026, 6, 1); let p = 68000; const kl = [];
for (let i = 0; i < 600; i++) { const o = p, c = o + Math.sin(i / 40) * 60 + (rnd() - .5) * 200, h = Math.max(o, c) + rnd() * 90, l = Math.min(o, c) - rnd() * 90; kl.push([t0 + i * 36e5, o, h, l, c, 100 + rnd() * 50]); p = c; }
const ticker = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((s, i) => ({symbol: s, lastPrice: String(p / (i + 1)), priceChangePercent: '1'}));
const ok = (c, m) => { console.log((c ? 'OK    · ' : 'FALLA · ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const srv = http.createServer((q, r) => { const f = root + (q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'text/plain'); r.end(d); }); });
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await chromium.launch({executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']});
  const mk = async vp => { const ctx = await br.newContext({viewport: vp}); const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', route => { const u = route.request().url();
      if (u.includes('api.binance.com') && u.includes('/klines')) return route.fulfill({json: kl, headers: {'access-control-allow-origin': '*'}});
      if (u.includes('api.binance.com')) return route.fulfill({json: ticker, headers: {'access-control-allow-origin': '*'}});
      if (u.startsWith('http://localhost')) return route.continue(); return route.abort(); });
    await page.goto(`http://localhost:${port}/`); await page.waitForTimeout(1200); return {page, errs}; };
  // ── escritorio
  let {page, errs} = await mk({width: 1500, height: 860});
  // tipos de vela
  for (const k of ['hollow', 'ha', 'bars', 'hlc', 'line', 'area', 'step', 'candles']) {
    await page.click('#ctypeBtn'); await page.click(`#ctypeMenu [data-ct="${k}"]`); await page.waitForTimeout(150);
    if (k === 'ha' || k === 'area' || k === 'bars') await page.screenshot({path: out + 'ct_' + k + '.png'});
  }
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('cct_mobile_v1')).ctype) === 'candles', 'el tipo de vela se guarda en el estado');
  await page.click('#ctypeBtn'); await page.click('#ctypeMenu [data-ct="area"]'); ok((await page.textContent('#ctypeBtn')).includes('Área'), 'el botón muestra el tipo elegido');
  // dibujo: línea horizontal → barra de selección
  await page.click('[data-panel=tools]'); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = [...document.querySelectorAll('[data-tool]')].find(x => x.dataset.tool === 'horizontal'); if (b) b.click(); });
  await page.waitForTimeout(900); let box = await page.$eval('#priceCanvas', e => { const r = e.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; });
  await page.mouse.click(box.x + box.w * .5, box.y + box.h * .3); await page.waitForTimeout(500);
  const nDraw = () => page.evaluate(() => { const s = JSON.parse(localStorage.getItem('cct_mobile_v1')); return Object.values(s.drawings || {}).flat().length; });
  ok(await nDraw() === 1, 'se creó 1 dibujo');
  // seleccionar tocándolo
  for (let dy = -40; dy <= 40 && !(await page.$('#selBar [data-sc]')); dy += 4) { await page.mouse.click(box.x + box.w * .4, box.y + box.h * .3 + dy); await page.waitForTimeout(380); }
  ok(!!(await page.$('#selBar [data-sc]')), 'al seleccionar aparece la barra con colores');
  await page.click('#selBar [data-sc="#f06b79"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('cct_mobile_v1')).drawings).flat()[0].col) === '#f06b79', 'cambiar color del dibujo');
  await page.screenshot({path: out + 'selbar.png'});
  await page.click('#selBar [data-sa="del"]'); await page.waitForTimeout(200); ok(await nDraw() === 0, 'eliminar desde la barra');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200); ok(await nDraw() === 1, 'Ctrl+Z recupera el dibujo eliminado');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200); ok(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('cct_mobile_v1')).drawings).flat()[0].col) === undefined, 'Ctrl+Z deshace el cambio de color');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200); ok(await nDraw() === 0, 'Ctrl+Z deshace la creación del dibujo');
  await page.keyboard.press('Control+y'); await page.waitForTimeout(200); ok(await nDraw() === 1, 'Ctrl+Y rehace');
  // ── divisiones
  await page.click('#layoutBtn'); await page.click('#layoutMenu [data-ly="2v"]'); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => { const f = document.querySelector('#pane2'); return !!f && f.getBoundingClientRect().width > 300; }), '2 gráficos lado a lado (iframe con ancho)');
  const fr = page.frames().find(f => f.url().includes('pane=2')); ok(!!fr, 'el segundo gráfico cargó');
  if (fr) { await fr.waitForTimeout(1500); ok(await fr.evaluate(() => document.body.classList.contains('pane') && document.querySelector('#priceCanvas').getBoundingClientRect().width > 200), 'el segundo gráfico dibuja su lienzo'); ok(await fr.evaluate(() => document.querySelector('#chartLabel').textContent) === 'ETHUSDT', 'el segundo gráfico usa otro activo'); }
  await page.screenshot({path: out + 'split_v.png'});
  await page.click('#layoutBtn'); await page.click('#layoutMenu [data-ly="2h"]'); await page.waitForTimeout(2000);
  ok(await page.evaluate(() => { const a = document.querySelector('#chartView').getBoundingClientRect(), b = document.querySelector('#pane2').getBoundingClientRect(); return b.top >= a.bottom - 2 && Math.abs(a.width - b.width) < 4; }), '2 gráficos arriba y abajo');
  await page.screenshot({path: out + 'split_h.png'});
  await page.click('#themeBtn'); await page.waitForTimeout(600);
  ok(await (page.frames().find(f => f.url().includes('pane=2'))).evaluate(() => document.body.classList.contains('light')), 'el tema claro llega al segundo gráfico');
  await page.click('#themeBtn'); await page.click('#layoutBtn'); await page.click('#layoutMenu [data-ly="1"]'); await page.waitForTimeout(600);
  ok(!(await page.$('#pane2')), 'volver a 1 gráfico quita el segundo');
  ok(errs.length === 0, 'sin errores de JS (escritorio) ' + errs.join('|'));
  // ── móvil
  ({page, errs} = await mk({width: 400, height: 840}));
  await page.click('[data-view="chartView"]'); await page.waitForTimeout(500);
  await page.click('#layoutBtn'); ok(!(await page.$('#layoutMenu [data-ly="2v"]')), 'en móvil no se ofrece lado a lado'); await page.click('#layoutMenu [data-ly="2h"]'); await page.waitForTimeout(2500);
  ok(await page.evaluate(() => { const a = document.querySelector('#chartView').getBoundingClientRect(), b = document.querySelector('#pane2').getBoundingClientRect(); return a.height > 150 && b.height > 150 && b.top >= a.bottom - 2; }), 'móvil: dos gráficos apilados');
  await page.screenshot({path: out + 'split_mobile.png'});
  ok(errs.length === 0, 'sin errores de JS (móvil) ' + errs.join('|'));
  await br.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
