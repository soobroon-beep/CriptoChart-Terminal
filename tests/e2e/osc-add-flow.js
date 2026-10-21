const {chromium} = require('playwright-core'); const http = require('http'), fs = require('fs'), path = require('path');
const root = '/home/claude/criptochart-terminal/', out = '/tmp/claude-0/smoke/shots/'; fs.mkdirSync(out, {recursive: true});
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, {'content-type': mime[path.extname(f)] || 'text/plain'}); r.end(d); } }); });
// velas sintéticas realistas: paseo aleatorio con semilla, volumen correlacionado con el rango
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const N = 1000, t0 = Date.UTC(2026, 6, 1); let p = 68000; const kl = [];
for (let i = 0; i < N; i++) { const o = p, drift = Math.sin(i / 70) * 55 + (rnd() - .5) * 260, c = o + drift, h = Math.max(o, c) + rnd() * 140, l = Math.min(o, c) - rnd() * 140, v = process.env.LIQVOL ? 50 * Math.exp(i / 120) * (.9 + rnd() * .2) : 80 + Math.abs(c - o) / 4 + rnd() * 120; kl.push([t0 + i * 36e5, String(o), String(h), String(l), String(c), String(v), 0, '0', 0, '0', '0', '0']); p = c; }
const ticker = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'].map((s, i) => ({symbol: s, lastPrice: String(p / (i + 1)), priceChangePercent: String((i - 2) * .8)}));
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await chromium.launch({executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']});
  const mode = process.argv[2] || 'mobile', inds = (process.argv[3] || '').split(',').filter(Boolean), name = process.argv[4] || 'shot';
  const vp = mode === 'desktop' ? {width: 1400, height: 820} : {width: 420, height: 860};
  const ctx = await br.newContext({viewport: vp, deviceScaleFactor: 1.5}); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error' && !/gstatic|firebase|ERR_|WebSocket|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.route('**/*', route => { const u = route.request().url();
    if (u.includes('api.binance.com') && u.includes('/klines')) return route.fulfill({json: kl, headers: {'access-control-allow-origin': '*'}});
    if (u.includes('api.binance.com')) return route.fulfill({json: ticker, headers: {'access-control-allow-origin': '*'}});
    if (u.startsWith('http://localhost')) return route.continue(); return route.abort(); });
  const sheetOpen = () => page.evaluate(() => document.querySelector('#sheet').classList.contains('open'));
  await page.goto(`http://localhost:${port}/`); await page.waitForTimeout(500);
  if (mode !== 'desktop') await page.click('[data-view="chartView"]'); await page.waitForTimeout(500);
  const addScript = async (code, name) => {
    await page.evaluate(() => document.querySelector('[data-pine-new]').click()); await page.waitForTimeout(150);
    await page.fill('#pineName', name || ''); await page.fill('#pineCode', code); await page.click('#pineRun'); await page.waitForTimeout(1500);
    const msg = await page.evaluate(() => document.querySelector('#pineMsg')?.innerText || ''); console.log('· ' + (name || 'script') + ' → ' + msg.replace(/\n+/g, ' ⏎ ').slice(0, 330));
  };
  const closeS = async () => { if (await sheetOpen()) await page.click('#closeSheet'); await page.waitForTimeout(200); };
  const which = process.argv[5] || 'all';


  const rate = +(process.env.THROTTLE || 1); if (rate > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', {rate}); }
  const both = process.env.BOTH === '1';
  const legendNames = () => page.evaluate(() => [...document.querySelectorAll('.leg-row')].length);
  const paneHasInk = () => page.evaluate(() => { const c = document.querySelector('#priceCanvas'); return !!c; });
  const openInds = async () => { await page.evaluate(() => document.querySelector('#indicatorsBtn, [data-sheet="indicators"], #openIndicators')?.click()); await page.waitForTimeout(300); };
  await page.click('[data-panel=indicators]'); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-indtab="mine"]').click());
  await page.evaluate(() => document.querySelector('[data-cat-add="nova-osc"]').click());
  if (both) await page.evaluate(() => document.querySelector('[data-cat-add="nova-scr"]').click());
  const t0 = Date.now(); let ok = false;
  for (let k = 0; k < 90 && !ok; k++) { await page.waitForTimeout(1000); ok = await page.evaluate(() => /Oscillat/i.test([...document.querySelectorAll('.leg-row')].length ? document.body.innerText : '') || false); const st = await page.evaluate(() => { const c = [...document.querySelectorAll('#sheetList .nova-card, #indicatorList .nova-card')].find(x => x.innerText.includes('Oscillator')); return c ? (/Error/.test(c.innerText) ? 'ERROR ' + c.innerText.replace(/\s+/g, ' ').slice(-120) : /Calculando/.test(c.innerText) ? 'calc' : 'ok') : '?'; }); if (st === 'ok' || st.startsWith('ERROR')) { console.log('tarjeta', st, (Date.now() - t0) + 'ms'); ok = true; } }
  await page.evaluate(() => document.querySelector('#closeSheet')?.click()); await page.waitForTimeout(800);
  const rowsInfo = await page.evaluate(() => [...document.querySelectorAll('.leg-row')].map(r => r.getBoundingClientRect().top | 0));
  console.log('leyenda filas', rowsInfo.length);
  const txt = await page.evaluate(() => document.querySelector('#priceCanvas').toDataURL().length); console.log('canvas bytes', txt);
  await page.screenshot({path: out + 'oscflow_' + mode + (both ? '_both' : '') + '.png'});
  // recarga: debe seguir apareciendo
  await page.reload(); await page.waitForTimeout(6000); if (mode !== 'desktop') await page.click('[data-view="chartView"]'); await page.waitForTimeout(4000);
  console.log('tras recargar, filas', await page.evaluate(() => document.querySelectorAll('.leg-row').length), 'osc en pine state', await page.evaluate(() => { const k = Object.keys(localStorage).find(k => localStorage.getItem(k).includes('"pine"')); return JSON.parse(localStorage.getItem(k)).pine.length; }));
  await page.screenshot({path: out + 'oscflow_reload_' + mode + '.png'});
  // engranaje de un indicador estándar → su configuración
  const gear = await page.evaluate(() => { const r = [...document.querySelectorAll('.leg-row')][0]; return !!r; });
  await page.evaluate(() => [...document.querySelectorAll('.leg-row')][0].querySelector('[data-do=set]').click()); await page.waitForTimeout(500);
  console.log('gear std →', await page.evaluate(() => (document.querySelector('.cfg-head strong') || {}).innerText + ' | sheet abierta: ' + document.querySelector('#sheet').classList.contains('open')));
  console.log(errs.join('\n') || 'sin errores'); await br.close(); srv.close();
})();
