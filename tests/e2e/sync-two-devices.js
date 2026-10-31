const {chromium} = require('playwright-core'); const http = require('http'), fs = require('fs'), path = require('path');
const root = ''+require('path').resolve(__dirname,'..','..')+'/', out = '/tmp/claude-0/smoke/shots/'; fs.mkdirSync(out, {recursive: true});
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

  const store = new Map();
  const FAKE = `window.firebase=(()=>{let user=JSON.parse(localStorage.getItem('fu')||'null'),cb=null;const auth={onAuthStateChanged(f){cb=f;setTimeout(()=>f(user),0)},getRedirectResult(){return Promise.resolve({})},signInWithPopup(){user={uid:'U1',displayName:'Payi',email:'p@x.com',photoURL:''};localStorage.setItem('fu',JSON.stringify(user));cb&&cb(user);return Promise.resolve()},signOut(){user=null;localStorage.removeItem('fu');cb&&cb(null)}};
const fs={doc(path){return{get:async()=>{const d=await window.__fsGet(path);return{exists:d!=null,data:()=>d}},set:async d=>{await window.__fsSet(path,JSON.parse(JSON.stringify(d)))},onSnapshot(f){let last=null;const t=setInterval(async()=>{const d=await window.__fsGet(path);const s=JSON.stringify(d);if(s!==last){last=s;f({exists:d!=null,metadata:{hasPendingWrites:false},data:()=>d})}},300);return()=>clearInterval(t)}}}};
return{initializeApp(){},auth:Object.assign(()=>auth,{GoogleAuthProvider:function(){this.setCustomParameters=()=>{}}}),firestore:Object.assign(()=>fs,{FieldValue:{serverTimestamp:()=>'TS'}})}})();`;
  const mkPage = async (vp) => {
    const ctx = await br.newContext({viewport: vp, deviceScaleFactor: 1}); const page = await ctx.newPage();
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page.exposeFunction('__fsGet', p => store.has(p) ? store.get(p) : null); await page.exposeFunction('__fsSet', (p, d) => { store.set(p, d); });
    await page.route('**/*', route => { const u = route.request().url();
      if (u.includes('gstatic.com/firebasejs')) return route.fulfill({body: u.includes('firebase-app-compat') ? FAKE : '', contentType: 'text/javascript'});
      if (u.includes('api.binance.com') && u.includes('/klines')) return route.fulfill({json: kl, headers: {'access-control-allow-origin': '*'}});
      if (u.includes('api.binance.com')) return route.fulfill({json: ticker, headers: {'access-control-allow-origin': '*'}});
      if (u.startsWith('http://localhost')) return route.continue(); return route.abort(); });
    await page.goto(`http://localhost:${port}/`); await page.waitForTimeout(600); return page;
  };
  const errs = [];
  // 1) PC: añade un script ANTES de iniciar sesión y luego inicia sesión
  const A = await mkPage({width: 1400, height: 820});
  await A.evaluate(() => document.querySelector('[data-pine-new]').click()).catch(()=>{});
  await A.click('.right-rail [data-side=indicatorView]').catch(()=>{});
  await A.evaluate(() => { const t = document.querySelector('#indicatorList [data-indtab=mine]'); t && t.click(); }); await A.waitForTimeout(200);
  await A.evaluate(() => document.querySelector('[data-pine-new]').click()); await A.waitForTimeout(200);
  await A.fill('#pineName', 'Mi indicador PC'); await A.fill('#pineCode', '//@version=5\nindicator("Mi indicador PC", overlay=true)\nplot(ta.ema(close, 14), "EMA14")\n'); await A.click('#pineRun'); await A.waitForTimeout(1500);
  await A.evaluate(() => document.querySelector('#closeSheet')?.click()); await A.waitForTimeout(300);
  await A.click('#accountBtn'); await A.waitForTimeout(2500);
  console.log('PC estado:', await A.evaluate(() => document.querySelector('#accountBox').innerText.replace(/\n+/g,' | ')));
  console.log('Firestore:', [...store.keys()].join(', '), '· scripts guardados:', store.get('users/U1/data/scripts') ? JSON.parse(store.get('users/U1/data/scripts').items).length : 0);
  console.log('Doc estado pine:', (JSON.parse(store.get('users/U1/data/cct_mobile').state).pine||[]).length, '· PC LS:', await A.evaluate(() => (Object.keys(localStorage).filter(k=>/mobile/.test(k)).map(k => k+':'+(JSON.parse(localStorage.getItem(k)).pine||[]).length).join(', '))));
  // 2) Celular: sin nada local, inicia sesión
  const B = await mkPage({width: 420, height: 860});
  await B.click('#accountBtn'); await B.waitForTimeout(3000);
  console.log('Móvil estado:', await B.evaluate(() => document.querySelector('#accountBox').innerText.replace(/\n+/g,' | ')));
  await B.click('[data-view=chartView]'); await B.waitForTimeout(500); await B.click('#indicatorCount'); await B.waitForTimeout(300); await B.click('#sheetList [data-indtab=mine]'); await B.waitForTimeout(400);
  console.log('Móvil lista:', await B.evaluate(() => [...document.querySelectorAll('#sheetList .pine-row b')].map(x => x.textContent).join(', ') || '(ninguno)'));
  console.log('LS móvil:', await B.evaluate(() => Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k).match(/"pine":\[[^\]]*\]/)?.[0] || '').filter(x => /mobile/.test(x)).join('\n')));
  await B.screenshot({path: out + 'sync_mobile.png'});
  // 3) Cambio en vivo: el PC añade otro indicador y el móvil lo recibe sin recargar
  await A.evaluate(() => { document.querySelector('.right-rail [data-side=indicatorView]').click(); const t = document.querySelector('#indicatorList [data-indtab=mine]'); t && t.click(); });
  await A.evaluate(() => document.querySelector('[data-pine-new]').click()); await A.waitForTimeout(200);
  await A.fill('#pineName', 'Segundo PC'); await A.fill('#pineCode', '//@version=5\nindicator("Segundo PC")\nplot(ta.rsi(close, 14), "RSI")\n'); await A.click('#pineRun'); await A.waitForTimeout(2500);
  await B.waitForTimeout(2500);
  console.log('Móvil lista (en vivo):', await B.evaluate(() => [...document.querySelectorAll('#sheetList .pine-row b')].map(x => x.textContent).join(', ') || '(ninguno)'));
  await B.reload(); await B.waitForTimeout(2500); await B.click('[data-view=chartView]'); await B.waitForTimeout(500); await B.click('#indicatorCount'); await B.waitForTimeout(300); await B.click('#sheetList [data-indtab=mine]'); await B.waitForTimeout(400);
  console.log('Móvil tras recargar:', await B.evaluate(() => [...document.querySelectorAll('#sheetList .pine-row b')].map(x => x.textContent).join(', ') || '(ninguno)'));
  console.log('errores:', errs.join(' | ') || 'ninguno');
  await br.close(); srv.close();
})();