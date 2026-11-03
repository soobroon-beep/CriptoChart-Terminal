// Dominancia de mercado (USDT.D y BTC.D) para VORTEX. Lo ejecuta .github/workflows/dominance.yml y guarda dominance-data.json en el repositorio;
// la app lo lee como archivo estático (sin llaves ni límites de CORS). Dato: CoinGecko (API pública), igual que el «Dominance» de la mayoría de terminales.
// · Cada ejecución añade una muestra con la dominancia actual (market_cap_percentage de /global).
// · Si el archivo está vacío, intenta rellenar el pasado dividiendo la capitalización de Tether entre la capitalización total (365 días). Si CoinGecko no da el total histórico, el historial empieza hoy: nunca se inventan puntos.
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'dominance-data.json'), API = 'https://api.coingecko.com/api/v3';
const H = 900e3, D = 86400e3, KEEP_H = 30 * D, KEEP_D = 3000 * D;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(url) {
  let err;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, {headers: {accept: 'application/json', 'user-agent': 'VORTEX-Dominance/1.0'}});
      if (r.status === 429) { await sleep(8000 * (i + 1)); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${url.replace(API, '')}`);
      return await r.json();
    } catch (e) { err = e; await sleep(1500); }
  }
  throw err;
}
const load = () => { try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (j && j.series) return j; } catch {} return {series: {}, note: ''}; };
const clean = a => (Array.isArray(a) ? a : []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[1] > 0 && p[1] < 100);

// Un punto por día (el último de ese día UTC) a partir de las muestras
function daily(h) {
  const m = new Map(); for (const [t, v] of h) m.set(Math.floor(t / D) * D, v);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}
function merge(old, add, keep, bucket) { // une series [t,v] sin repetir hueco (bucket ms) y recorta lo muy antiguo
  const m = new Map(); for (const [t, v] of [...old, ...add]) m.set(Math.floor(t / bucket) * bucket, v);
  const lim = Date.now() - keep;
  return [...m.entries()].filter(([t]) => t >= lim).sort((a, b) => a[0] - b[0]).map(([t, v]) => [t, +v.toFixed(4)]);
}

async function backfill() { // [t, % USDT] diario, o null si CoinGecko no entrega el total histórico
  try {
    const tether = await getJSON(`${API}/coins/tether/market_chart?vs_currency=usd&days=365&interval=daily`); await sleep(2500);
    const total = await getJSON(`${API}/global/market_cap_chart?days=365&vs_currency=usd`);
    const tc = tether.market_caps || [], gc = (total.market_cap_chart && total.market_cap_chart.market_cap) || total.market_caps || [];
    if (!tc.length || !gc.length) return null;
    const g = new Map(gc.map(([t, v]) => [Math.floor(t / D), v])), out = [];
    for (const [t, v] of tc) { const tot = g.get(Math.floor(t / D)); if (tot > 0 && v > 0) out.push([Math.floor(t / D) * D, v / tot * 100]); }
    return out.length > 30 ? out : null;
  } catch (e) { console.warn('Sin historial previo de CoinGecko:', e.message); return null; }
}

async function main() {
  const db = load(), S = db.series; for (const k of ['USDT.D', 'BTC.D']) S[k] = S[k] || {h: [], d: []};
  const g = (await getJSON(`${API}/global`)).data, pc = g && g.market_cap_percentage || {};
  if (!(pc.usdt > 0)) throw new Error('CoinGecko no devolvió la dominancia de USDT');
  const now = Date.now(), t = Math.floor(now / H) * H;
  if (!S['USDT.D'].d.length) { const b = await backfill(); if (b) { S['USDT.D'].d = merge([], b, KEEP_D, D); db.note = 'historial diario reconstruido con la capitalización de Tether / capitalización total'; } else db.note = 'historial propio desde la primera ejecución'; }
  for (const [k, v] of [['USDT.D', pc.usdt], ['BTC.D', pc.btc]]) {
    if (!(v > 0)) continue; const s = S[k];
    s.h = merge(clean(s.h), [[t, v]], KEEP_H, H);
    s.d = merge(clean(s.d), daily(s.h), KEEP_D, D);
  }
  db.updated = new Date(now).toISOString(); db.source = 'CoinGecko';
  const out = JSON.stringify(db), prev = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';
  if (prev.replace(/"updated":"[^"]*"/, '') === out.replace(/"updated":"[^"]*"/, '')) { console.log('Sin cambios'); return; }
  fs.writeFileSync(FILE, out); console.log(`USDT.D ${pc.usdt.toFixed(3)}% · BTC.D ${(pc.btc || 0).toFixed(3)}% · ${S['USDT.D'].d.length} días`);
}
if (require.main === module) main().catch(e => { console.error('Error:', e.message); process.exit(1); });
module.exports = {daily, merge, clean};
