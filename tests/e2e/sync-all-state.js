const {chromium} = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
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
  const ck = (n, ok, x='') => { console.log((ok ? 'OK   ' : 'FALLA') + ' ' + n + (x ? ' · ' + x : '')); if (!ok) process.exitCode = 1; };
  const skey = p => p.evaluate(() => Object.keys(localStorage).filter(k => /cct_mobile/.test(k)).map(k => JSON.parse(localStorage.getItem(k)))[0] || {});
  // Estado rico guardado en la cuenta (como si otro dispositivo lo hubiera creado)
  const rich = {symbols: ['BTCUSDT','ETHUSDT','SOLUSDT','DOGEUSDT'], symbol: 'SOLUSDT', interval: '15m', indicators: {rsi: true, ema: true}, source: 'bybit', ctype: 'heikin', layout: 2,
    drawings: {SOLUSDT: [{id: 'd1', type: 'trend', a: {t: 1, p: 100}, b: {t: 2, p: 110}}]}, ui: {panes: {movil: {paneH: {rsi: 222}, paneScale: 1.6}, pc: {paneH: {rsi: 90}, paneScale: 0.8}}, dopt: {magnet: false, stay: true, lock: false, hide: false}, icon: 'vortex'}};
  store.set('users/U1/data/cct_mobile', {state: JSON.stringify(rich), updatedAt: 'TS'});
  const B = await mkPage({width: 420, height: 860});
  await B.click('#accountBtn'); await B.waitForTimeout(3000);
  const st = await skey(B);
  ck('lista de monedas', JSON.stringify(st.symbols) === JSON.stringify(rich.symbols), JSON.stringify(st.symbols));
  ck('moneda/temporalidad', st.symbol === 'SOLUSDT' && st.interval === '15m');
  ck('indicadores', st.indicators && st.indicators.rsi && st.indicators.ema);
  ck('fuente de datos', st.source === 'bybit');
  ck('dibujos', st.drawings && st.drawings.SOLUSDT && st.drawings.SOLUSDT.length === 1);
  ck('ui guardada en estado', st.ui && st.ui.panes && st.ui.panes.movil.paneScale === 1.6 && st.ui.panes.pc.paneScale === 0.8 && st.ui.icon === 'vortex', JSON.stringify(st.ui));
  const ls = await B.evaluate(() => ({ps: localStorage.getItem('cct_paneScale'), ph: localStorage.getItem('cct_paneH_v1'), dopt: localStorage.getItem('cct_dopts_v1'), icon: window.CCTAppIcons.selected, theme: document.documentElement.dataset.theme}));
  ck('ui aplicada en el dispositivo', ls.ps === '1.6' && /222/.test(ls.ph) && /"stay":true/.test(ls.dopt) && ls.icon === 'vortex', JSON.stringify(ls));
  // El otro dispositivo cambia la interfaz -> llega a la cuenta
  await B.click('[data-view=chartView]').catch(()=>{}); await B.evaluate(() => document.querySelector('#paneBig') && document.querySelector('#paneBig').click()); await B.waitForTimeout(2500);
  const doc = JSON.parse(store.get('users/U1/data/cct_mobile').state);
  ck('cambio de interfaz sube a la cuenta', doc.ui && doc.ui.panes.movil.paneScale > 1.6 && doc.ui.panes.pc.paneScale === 0.8, JSON.stringify(doc.ui.panes));
  // Cambio en vivo desde la cuenta
  const A = await mkPage({width: 1400, height: 820}); await A.click('#accountBtn'); await A.waitForTimeout(2500);
  const live = JSON.parse(store.get('users/U1/data/cct_mobile').state); live.ui.panes.movil.paneScale = 1; live.symbols.push('XRPUSDT');
  store.set('users/U1/data/cct_mobile', {state: JSON.stringify(live), updatedAt: 'TS2'}); await B.waitForTimeout(2500);
  const st2 = await skey(B);
  ck('cambio en vivo llega al otro dispositivo', st2.symbols.includes('XRPUSDT') && st2.ui.panes.movil.paneScale === 1, JSON.stringify(st2.ui));
  console.log('errores:', errs.join(' | ') || 'ninguno');
  await br.close(); srv.close();
})();
