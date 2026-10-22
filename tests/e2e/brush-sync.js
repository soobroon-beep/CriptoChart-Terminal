const {chromium} = require('playwright-core'); const http = require('http'), fs = require('fs'), path = require('path');
const root = ''+require('path').resolve(__dirname,'..','..')+'/', out = '' + (process.env.SHOTS || '/tmp/') + ''; fs.mkdirSync(out, {recursive: true});
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
  const doc = () => JSON.parse(store.get('users/U1/data/cct_mobile').state);
  const stroke = async (page, pts) => { const bb = await page.evaluate(() => { const r = document.querySelector('#priceCanvas').getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; });
    await page.mouse.move(bb.x + bb.w * pts[0][0], bb.y + bb.h * pts[0][1]); await page.mouse.down();
    for (const [fx, fy] of pts.slice(1)) await page.mouse.move(bb.x + bb.w * fx, bb.y + bb.h * fy, {steps: 6}); await page.mouse.up(); await page.waitForTimeout(150); };
  const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' · ' + m); if (!c) process.exitCode = 1; };
  // 1) PC: inicia sesión, elige el pincel (rojo, grueso) y dibuja
  const A = await mkPage({width: 1400, height: 820});
  await A.click('#accountBtn'); await A.waitForTimeout(2500);
  await A.click('[data-panel=tools]'); await A.waitForTimeout(300); await A.click('[data-tool=brush]'); await A.waitForTimeout(300);
  ok(await A.evaluate(() => !!document.querySelector('#brushOpts')), 'aparecen las opciones del pincel (colores y grosor)');
  await A.click('[data-bc="#f06b79"]'); await A.click('[data-bw="7"]');
  await stroke(A, [[.3, .3], [.4, .2], [.5, .35], [.6, .25], [.7, .4]]);
  const drawn = await A.evaluate(() => { const k = Object.keys(localStorage).find(k => /mobile_v1_U1$/.test(k)); const st = JSON.parse(localStorage.getItem(k)); return (st.drawings.BTCUSDT || []).filter(d => d.type === 'brush').length; });
  ok(drawn === 1, 'el trazo quedó en el estado local (' + drawn + ')');
  await stroke(A, [[.2, .45], [.5, .38], [.8, .46]]); // el pincel sigue activo: segundo trazo sin volver a elegirlo
  // la pestaña se manda a segundo plano justo después de dibujar: debe subir sin esperar el retardo de 1.2 s
  await A.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await A.evaluate(() => Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'}));
  await A.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await A.waitForTimeout(400);
  let d1 = doc(), bs = (d1.drawings.BTCUSDT || []).filter(d => d.type === 'brush');
  ok(bs.length === 2, 'los 2 trazos llegaron a la cuenta sin esperar (' + bs.length + ')');
  ok(bs[0] && bs[0].col === '#f06b79' && bs[0].w === 7 && bs[0].pts.length >= 2 && bs[0].pts.length <= 400, 'color, grosor y puntos guardados (' + (bs[0] && bs[0].pts.length) + ' pts)');
  ok(d1.brush && d1.brush.c === '#f06b79' && d1.brush.w === 7, 'el color/grosor del pincel también viaja con la cuenta');
  await A.evaluate(() => Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'visible'}));
  await A.click('#cancelDraw'); await A.waitForTimeout(200);
  // 2) PC: enciende Bollinger y cambia el seguimiento desde la lista
  await A.click('[data-panel=indicators]'); await A.waitForTimeout(300);
  await A.evaluate(() => { const b = document.querySelector('#sheetList [data-ind="bollinger"], #indicatorList [data-ind="bollinger"]'); b && b.click(); }); await A.waitForTimeout(1800);
  ok(doc().indicators.bollinger === true, 'Bollinger encendido llegó a la cuenta');
  await A.evaluate(() => document.querySelector('#closeSheet')?.click());
  // 3) Celular: inicia sesión con la misma cuenta y debe ver todo
  const B = await mkPage({width: 420, height: 860});
  await B.click('#accountBtn'); await B.waitForTimeout(3000);
  await B.click('[data-view=chartView]'); await B.waitForTimeout(1500);
  const st = await B.evaluate(() => { const k = Object.keys(localStorage).find(k => /mobile_v1_U1$/.test(k)); const s = JSON.parse(localStorage.getItem(k)); return {n: (s.drawings.BTCUSDT || []).filter(d => d.type === 'brush').length, boll: s.indicators.bollinger, sym: s.symbols.length}; });
  ok(st.n === 2 && st.boll === true, 'el celular recibió los 2 trazos y Bollinger (' + JSON.stringify(st) + ')');
  const red = await B.evaluate(() => { const c = document.querySelector('#priceCanvas'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 80 && d[i + 1] < 140 && d[i + 2] > 95 && d[i + 2] < 150) n++; return n; });
  ok(red > 150, 'el trazo rojo se ve dibujado en el gráfico del celular (' + red + ' px)');
  await B.screenshot({path: out + 'brush_mobile.png'});
  // 4) en vivo: el celular borra un trazo con «Deshacer» y el PC lo recibe sin recargar
  await B.click('#undoDraw'); await B.waitForTimeout(2600); await A.waitForTimeout(1500);
  const nA = await A.evaluate(() => { const k = Object.keys(localStorage).find(k => /mobile_v1_U1$/.test(k)); return (JSON.parse(localStorage.getItem(k)).drawings.BTCUSDT || []).length; });
  ok(nA === 1, 'el trazo borrado en el celular desapareció también en el PC en vivo (' + nA + ' trazo)');
  await A.screenshot({path: out + 'brush_desktop.png'});
  console.log('errores:', errs.join(' | ') || 'ninguno'); if (errs.length) process.exitCode = 1;
  await br.close(); srv.close();
})();
