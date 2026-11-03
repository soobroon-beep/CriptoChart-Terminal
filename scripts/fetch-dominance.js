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
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, {headers: {accept: 'application/json', 'user-agent': 'VORTEX-Dominance/1.0'}});
      if (r.status === 429) { err = new Error('HTTP 429 (límite de CoinGecko)'); await sleep(20000 * (i + 1)); continue; }
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

/* Historial de la dominancia. CoinGecko no entrega gratis la capitalización total histórica, así que se reconstruye:
   total(día) = suma de la capitalización de las ~40 monedas más grandes con 1 año completo de datos × k, con k = (total real de hoy) / (suma de esas monedas hoy).
   USDT.D = capitalización de Tether / total(día). Es una aproximación (la cola de monedas pequeñas se supone proporcional), por eso se marca como «reconstruido». Solo se corre a mano (BACKFILL=1). */
async function backfill(realTotal) {
  const top = await getJSON(`${API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=60&page=1`); await sleep(6000);
  const ids = top.map(c => c.id), series = {}, N = 40;
  for (const id of ids) {
    if (Object.keys(series).length >= N) break;
    try {
      const j = await getJSON(`${API}/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`), m = new Map();
      for (const [t, v] of j.market_caps || []) if (v > 0) m.set(Math.floor(t / D) * D, v);
      if (m.size >= 360) series[id] = m; else console.log('omitida (poco historial):', id, m.size);
    } catch (e) { console.warn('omitida', id, e.message); }
    await sleep(9000);
  }
  if (!series.tether || Object.keys(series).length < 15) { console.warn('Muy pocas monedas con historial:', Object.keys(series).length); return null; }
  const days = [...series.tether.keys()].sort((a, b) => a - b), sums = days.map(d => Object.values(series).reduce((a, m) => a + (m.get(d) || 0), 0));
  const k = realTotal / sums[sums.length - 1], out = {'USDT.D': [], 'BTC.D': []};
  days.forEach((d, i) => { const tot = sums[i] * k; if (!(tot > 0)) return; out['USDT.D'].push([d, series.tether.get(d) / tot * 100]); if (series.bitcoin && series.bitcoin.get(d)) out['BTC.D'].push([d, series.bitcoin.get(d) / tot * 100]); });
  console.log(`Reconstruido con ${Object.keys(series).length} monedas, ${days.length} días, k=${k.toFixed(3)}`);
  return out['USDT.D'].length > 30 ? out : null;
}

async function main() {
  const db = load(), S = db.series; for (const k of ['USDT.D', 'BTC.D']) S[k] = S[k] || {h: [], d: []};
  const g = (await getJSON(`${API}/global`)).data, pc = g && g.market_cap_percentage || {};
  if (!(pc.usdt > 0)) throw new Error('CoinGecko no devolvió la dominancia de USDT');
  const now = Date.now(), t = Math.floor(now / H) * H;
  if (process.env.BACKFILL === '1') {
    const tot = g.total_market_cap && g.total_market_cap.usd, b = tot > 0 ? await backfill(tot) : null;
    if (b) for (const k of ['USDT.D', 'BTC.D']) if (b[k] && b[k].length) { S[k].d = merge(b[k], clean(S[k].d).filter(p => p[0] >= b[k][b[k].length - 1][0]), KEEP_D, D); db.note = 'historial diario reconstruido con las 40 monedas más grandes (aproximado); lo reciente son muestras reales cada 15 min'; }
  }
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
