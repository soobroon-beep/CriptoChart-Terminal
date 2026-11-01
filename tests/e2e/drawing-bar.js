// Barra flotante de propiedades de un dibujo: color, grosor, estilo, texto, plantillas, alerta, clonar, bloquear, ocultar, eliminar (uso: node drawing-bar.js [mobile|desktop])
const {chromium} = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..') + '/', out = process.env.SHOTS || '/tmp/';
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json'};
let seed = 5; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
const t0 = Math.floor((Date.now() - 600 * 36e5) / 36e5) * 36e5; let p = 77000; const kl = [];
for (let i = 0; i < 600; i++) { const o = p, c = o + Math.sin(i / 30) * 70 + (rnd() - .5) * 250; kl.push([t0 + i * 36e5, o, Math.max(o, c) + rnd() * 60, Math.min(o, c) - rnd() * 60, c, 100 + rnd() * 40]); p = c; }
const T = i => t0 + i * 36e5, lastC = kl[599][4];
const draws = [
  {id: 'h1', type: 'horizontal', a: {t: T(560), p: 76500}},
  {id: 't1', type: 'trend', a: {t: T(545), p: 75900}, b: {t: T(592), p: 76800}},
  {id: 'x1', type: 'text', a: {t: T(560), p: 76000}, text: 'Hola'},
  {id: 'b1', type: 'brush', col: '#f23645', w: 4, a: {t: T(580), p: 76900}, pts: [[T(580), 76900], [T(586), 76700], [T(592), 76950], [T(598), 76600]]}
];
const ok = (c, m) => { console.log((c ? 'OK    · ' : 'FALLA · ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const mobile = process.argv[2] !== 'desktop';
  const srv = http.createServer((q, r) => { const u = q.url.split('?')[0]; const f = root + (u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'text/plain'); r.end(d); }); });
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await chromium.launch({executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox']});
  const ctx = await br.newContext(mobile ? {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true} : {viewport: {width: 1440, height: 860}});
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept(d.defaultValue()));
  await page.addInitScript(d => { localStorage.setItem('cct_mobile_v1', JSON.stringify({interval: '1h', indicators: {rsi: false, ema20: false}, drawings: {BTCUSDT: d}})); }, draws);
  await page.route('**/*', route => { const u = route.request().url();
    if (u.includes('api.binance.com') && u.includes('/klines')) return route.fulfill({json: kl, headers: {'access-control-allow-origin': '*'}});
    if (u.includes('api.binance.com')) return route.fulfill({json: [], headers: {'access-control-allow-origin': '*'}});
    if (u.startsWith('http://localhost')) return route.continue(); return route.abort(); });
  await page.goto(`http://localhost:${port}/`); await page.waitForTimeout(1500);
  if (mobile) await page.click('[data-view="chartView"]'); await page.waitForTimeout(2500);
  const rect = await page.$eval('#priceCanvas', c => { const r = c.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('cct_mobile_v1')));
  const getD = async id => ((await saved()).drawings.BTCUSDT || []).find(d => d.id === id);
  const tap = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(450); };
  // buscar la línea horizontal tocando en una columna hasta que aparezca la barra
  const selectAt = async (xs, ys, pred) => { for (const x of xs) for (let y = rect.y + 70; y < rect.y + rect.h - 80; y += 6) { await tap(x, y); const id = await page.evaluate(() => { const b = document.querySelector('#selBar'); return b ? b.querySelector('[data-sb="lock"]') ? 'sel' : 'brush' : ''; }); if (id === 'sel') { if (!pred || await pred()) return {x, y}; } } return null; };
  await page.screenshot({path: out + (mobile ? 'm' : 'd') + '0.png'});
  const hasDs = () => page.evaluate(() => !!document.querySelector('#selBar [data-sb="ds"]'));
  const hit = await selectAt([rect.x + rect.w * .2, rect.x + rect.w * .45], null, hasDs);
  ok(!!hit, 'tocar un dibujo abre la barra de propiedades'); if (!hit) { console.log(errs); process.exit(1); }
  await page.waitForTimeout(300); await page.screenshot({path: out + (mobile ? 'm' : 'd') + '1_bar.png'});
  const btns = await page.$$eval('#selBar [data-sb]', e => e.map(b => b.dataset.sb)); console.log('botones:', btns.join(','));
  const sel = await page.evaluate(() => 1); // id seleccionado se deduce por el estado
  // color
  await page.click('#selBar [data-sb="col"]'); await page.waitForSelector('#selPop'); await page.screenshot({path: out + (mobile ? 'm' : 'd') + '2_color.png'});
  await page.click('#selPop [data-pc="#2962ff"]'); await page.waitForTimeout(200);
  let all = (await saved()).drawings.BTCUSDT; ok(all.some(d => d.col === '#2962ff'), 'el color se guarda en el dibujo'); const id = all.find(d => d.col === '#2962ff').id; console.log('dibujo seleccionado:', id, all.find(d => d.id === id).type);
  // grosor
  await page.click('#selBar [data-sb="lw"]'); await page.waitForSelector('#selPop [data-pw]'); await page.click('#selPop [data-pw="4"]'); await page.waitForTimeout(200);
  ok((await getD(id)).lw === 4, 'grosor 4px (' + id + ')'); await page.screenshot({path: out + (mobile ? 'm' : 'd') + '3_lw.png'});
  // estilo
  await page.click('#selBar [data-sb="ds"]'); await page.click('#selPop [data-pd="dash"]'); await page.waitForTimeout(200); ok((await getD(id)).ds === 'dash', 'línea discontinua');
  await page.click('#selBar [data-sb="ds"]'); await page.click('#selPop [data-pd="dot"]'); await page.waitForTimeout(200); ok((await getD(id)).ds === 'dot', 'línea de puntos');
  await page.screenshot({path: out + (mobile ? 'm' : 'd') + '4_dot.png'});
  // texto
  await page.click('#selBar [data-sb="txt"]'); await page.waitForSelector('#sbTxt'); await page.screenshot({path: out + (mobile ? 'm' : 'd') + '5_txt.png'});
  await page.fill('#sbTxt', 'Soporte'); await page.click('#selPop [data-sb="txtok"]'); await page.waitForTimeout(200); ok((await getD(id)).label === 'Soporte', 'texto añadido a la línea');
  await page.click('#selPop [data-ptc="#ff9800"]'); await page.waitForTimeout(200); ok((await getD(id)).tc === '#ff9800', 'color del texto');
  await page.click('#selPop [data-pts="16"]'); await page.waitForTimeout(200); ok((await getD(id)).ts === 16, 'tamaño del texto');
  await page.screenshot({path: out + (mobile ? 'm' : 'd') + '6_label.png'});
  // plantillas
  await page.click('#selBar [data-sb="tpl"]'); await page.click('#selPop [data-sb="tplsave"]'); await page.waitForTimeout(200);
  ok(((await saved()).drawTpl || []).length === 1, 'plantilla guardada'); await page.screenshot({path: out + (mobile ? 'm' : 'd') + '7_tpl.png'});
  // alerta
  await page.click('#selBar [data-sb="alert"]'); await page.waitForTimeout(250); { const al = (await saved()).alerts || []; ok(al.length === 1 && Math.abs(al[0].price - 76500) < 1 && al[0].dir === 'down', 'alerta creada al precio de la línea (' + JSON.stringify(al.map(a => [a.price, a.dir])) + ')'); }
  // clonar
  await page.click('#selBar [data-sb="more"]'); await page.screenshot({path: out + (mobile ? 'm' : 'd') + '8_more.png'}); await page.click('#selPop [data-sb="clone"]'); await page.waitForTimeout(250);
  all = (await saved()).drawings.BTCUSDT; ok(all.length === 5, 'clonar crea un dibujo nuevo (' + all.length + ')');
  const cloneId = all[all.length - 1].id; ok(cloneId !== id && all[all.length - 1].label === 'Soporte', 'el clon conserva el estilo');
  // aplicar plantilla al clon tras cambiar color
  await page.click('#selBar [data-sb="col"]'); await page.click('#selPop [data-pc="#4caf50"]'); await page.click('#selBar [data-sb="tpl"]'); await page.click('#selPop [data-ptpl="0"]'); await page.waitForTimeout(200);
  ok((await getD(cloneId)).col === '#2962ff', 'aplicar plantilla restaura el color');
  // bloquear
  await page.click('#selBar [data-sb="lock"]'); await page.waitForTimeout(200); ok((await getD(cloneId)).lock === true, 'bloquear'); await page.screenshot({path: out + (mobile ? 'm' : 'd') + '9_lock.png'});
  await page.click('#selBar [data-sb="lock"]'); await page.waitForTimeout(200); ok(!(await getD(cloneId)).lock, 'desbloquear');
  // ocultar
  await page.click('#selBar [data-sb="more"]'); await page.click('#selPop [data-sb="hide"]'); await page.waitForTimeout(250);
  ok((await getD(cloneId)).hide === true && !(await page.$('#selBar')), 'ocultar quita el dibujo y la barra'); ok(!!(await page.$('#showHidden')), 'aparece «ocultos · mostrar»');
  await page.screenshot({path: out + (mobile ? 'm' : 'd') + '10_hidden.png'}); await page.click('#showHidden'); await page.waitForTimeout(250); ok(!(await getD(cloneId)).hide, 'mostrar ocultos');
  // pincel: color, grosor, plantilla, bloquear
  await page.keyboard.press('Escape'); 
  const hb = await selectAt([rect.x + rect.w * .56, rect.x + rect.w * .6, rect.x + rect.w * .66, rect.x + rect.w * .72, rect.x + rect.w * .78], null, async () => !(await hasDs()));
  if (hb) { const bb = await page.$$eval('#selBar [data-sb]', e => e.map(b => b.dataset.sb)); console.log('botones pincel:', bb.join(','));
    ok(!bb.includes('ds') && bb.includes('lw') && bb.includes('col') && bb.includes('lock') && bb.includes('del') && bb.includes('tpl'), 'pincel: color, plantillas, grosor, ajustes, bloquear, eliminar');
    await page.click('#selBar [data-sb="lw"]'); await page.click('#selPop [data-pw="8"]'); await page.waitForTimeout(200); ok((await getD('b1')).w === 8, 'pincel: grosor 8'); await page.screenshot({path: out + (mobile ? 'm' : 'd') + '11_brush.png'});
    await page.click('#selBar [data-sb="lock"]'); await page.waitForTimeout(200); ok((await getD('b1')).lock === true, 'pincel: bloquear'); }
  else ok(false, 'no se pudo seleccionar el pincel');
  // eliminar
  const n0 = (await saved()).drawings.BTCUSDT.length; await tap(hit.x, hit.y); await page.waitForTimeout(200);
  if (await page.$('#selBar [data-sb="del"]')) { await page.click('#selBar [data-sb="del"]'); await page.waitForTimeout(250); ok((await saved()).drawings.BTCUSDT.length === n0 - 1, 'eliminar'); }
  console.log('errs', errs); await br.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
