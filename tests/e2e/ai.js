// Pestaña IA: lee el gráfico real de la app, responde local, rechaza temas ajenos y usa Claude (simulado) con clave
const {chromium} = require('playwright-core'); const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..') + '/', out = process.env.SHOTS || '/tmp/'; fs.mkdirSync(out, {recursive: true});
const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json'};
let seed = 5; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
const t0 = Date.UTC(2026, 6, 1); let p = 60000; const kl = [];
for (let i = 0; i < 600; i++) { const o = p, c = o + 25 + Math.sin(i / 30) * 70 + (rnd() - .5) * 150; kl.push([t0 + i * 36e5, o, Math.max(o, c) + rnd() * 60, Math.min(o, c) - rnd() * 60, c, 100 + rnd() * 40]); p = c; }
const ticker = ['BTCUSDT', 'ETHUSDT'].map(s => ({symbol: s, lastPrice: String(p), priceChangePercent: '2.1'}));
const now = Date.now(), cal = {at: now, events: [{t: now + 4 * 3600e3, title: 'Core CPI m/m', country: 'USD', impact: 'High', forecast: '0.3%', previous: '0.2%', actual: ''}]};
const news = {at: now, items: [{id: 'a', title: 'Bitcoin sube con fuerza tras entradas institucionales récord', link: 'https://x', t: now - 20 * 6e4, desc: '', src: 'CriptoNoticias', cat: 'cripto', cats: ['cripto'], impact: 'alto'}]};
const ok = (c, m) => { console.log((c ? 'OK    · ' : 'FALLA · ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const srv = http.createServer((q, r) => { const u = q.url.split('?')[0]; if (u === '/calendar-data.json') return r.end(JSON.stringify(cal)); if (u === '/news-data.json') return r.end(JSON.stringify(news)); const f = root + (u === '/' ? 'index.html' : u); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', mime[path.extname(f)] || 'text/plain'); r.end(d); }); });
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await chromium.launch({executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox']}), page = await br.newPage({viewport: {width: 1500, height: 880}}), errs = []; page.on('pageerror', e => errs.push(e.message));
  let claudeReq = null;
  await page.route('**/*', route => { const u = route.request().url();
    if (u.includes('api.anthropic.com')) { claudeReq = {h: route.request().headers(), b: JSON.parse(route.request().postData())}; return route.fulfill({json: {content: [{type: 'text', text: '**Respuesta de Claude** basada en RSI y niveles.'}]}, headers: {'access-control-allow-origin': '*'}}); }
    if (u.includes('api.binance.com') && u.includes('/klines')) return route.fulfill({json: kl, headers: {'access-control-allow-origin': '*'}});
    if (u.includes('api.binance.com')) return route.fulfill({json: ticker, headers: {'access-control-allow-origin': '*'}});
    if (u.startsWith('http://localhost')) return route.continue(); return route.abort(); });
  await page.goto(`http://localhost:${port}/`); await page.waitForTimeout(2500);
  await page.click('[data-side="aiView"]'); await page.waitForSelector('#aiLog .ai-msg');
  const last = () => page.$$eval('#aiLog .ai-msg.bot', e => e[e.length - 1].innerText);
  await page.click('[data-q="Analiza el gráfico"]'); await page.waitForFunction(() => document.querySelectorAll('#aiLog .ai-msg.bot').length >= 2 && !document.querySelector('.ai-msg.typing'));
  let t = await last(); ok(/BTCUSDT/.test(t) && /Sesgo/.test(t) && /Niveles clave/.test(t) && /no asesoría/.test(t), 'análisis completo con símbolo, sesgo, niveles y aviso');
  ok(/EMA 20/.test(t) && /RSI/.test(t), 'usa los indicadores del gráfico'); ok(/Bitcoin sube con fuerza/.test(t), 'incluye la noticia cargada'); ok(/Core CPI|IPC subyacente/.test(t) && /alto impacto/i.test(t), 'incluye el calendario con aviso de alto impacto');
  await page.screenshot({path: out + 'ai.png'});
  await page.fill('#aiInput', 'dame una receta de pastel'); await page.press('#aiInput', 'Enter'); await page.waitForFunction(() => document.querySelectorAll('#aiLog .ai-msg.bot').length >= 3 && !document.querySelector('.ai-msg.typing'));
  ok(/Solo puedo ayudarte con \*?cripto|Solo puedo ayudarte con cripto/i.test(await last()), 'rechaza temas fuera de cripto');
  await page.fill('#aiInput', '¿qué es el RSI?'); await page.press('#aiInput', 'Enter'); await page.waitForFunction(() => document.querySelectorAll('#aiLog .ai-msg.bot').length >= 4 && !document.querySelector('.ai-msg.typing')); ok(/Índice de Fuerza Relativa/.test(await last()), 'explica conceptos');
  // modo Claude
  await page.click('#aiGear'); await page.selectOption('#aiMode', 'claude'); await page.fill('#aiKey', 'sk-ant-test'); await page.click('#aiSave');
  await page.fill('#aiInput', '¿Qué opinas de la zona de 60k?'); await page.press('#aiInput', 'Enter'); await page.waitForFunction(() => /Respuesta de Claude/.test(document.querySelector('#aiLog').innerText), null, {timeout: 8000});
  ok(!!claudeReq && claudeReq.h['x-api-key'] === 'sk-ant-test' && /BTCUSDT/.test(claudeReq.b.messages.at(-1).content) && /Core CPI|IPC/.test(claudeReq.b.messages.at(-1).content) && /Bitcoin sube/.test(claudeReq.b.messages.at(-1).content), 'Claude recibe velas, indicadores, noticias y calendario');
  ok(/solo el sector cripto/i.test(claudeReq.b.system), 'el prompt de sistema limita al sector cripto');
  ok(errs.length === 0, 'sin errores de JS ' + errs.join('|'));
  await br.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
