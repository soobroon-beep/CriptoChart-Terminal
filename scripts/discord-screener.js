// Envía a Discord las señales del Screener de Nova Nexus (top 50 de Binance Spot por volumen). Lo ejecuta .github/workflows/discord-screener.yml
// cada hora (1h) y, además, cada 4 horas UTC (4h), aunque no haya ningún dispositivo con VORTEX abierto.
// Variables: DISCORD_WEBHOOK (secreto del repositorio, nunca en el código) · TF opcional: «1h», «4h» o «1h,4h» para forzar.
const F = require('../discord-format.js');
require('../nova-nexus.js'); const NN = globalThis.NovaNexus;
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com', 'https://api1.binance.com'];
const STABLE = new Set(['USDC', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'BUSD', 'USDE', 'USDS', 'USD1', 'XUSD', 'PYUSD', 'BFUSD', 'EUR', 'AEUR', 'EURI', 'UST', 'USTC']);
const SIG_BARS = 5, TOP_N = 50, HOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,25}\/[\w-]{20,120}$/;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(path) {
  let err;
  for (const h of HOSTS) { try { const r = await fetch(h + path, {headers: {'user-agent': 'VORTEX-Screener/1.0'}}); if (r.ok) return await r.json(); err = new Error(`${h} → HTTP ${r.status}`); } catch (e) { err = e; } }
  throw err;
}
async function topSymbols(n) {
  const d = await getJSON('/api/v3/ticker/24hr');
  return d.filter(t => /^[A-Z0-9]{2,12}USDT$/.test(t.symbol) && !STABLE.has(t.symbol.replace(/USDT$/, '')) && +t.quoteVolume > 2e6 && +t.lastPrice > 0)
    .sort((a, b) => +b.quoteVolume - +a.quoteVolume).slice(0, n).map(t => ({symbol: t.symbol, price: +t.lastPrice}));
}
async function candles(sym, tf) { // solo velas cerradas: la señal «edad 1» es la vela que acaba de cerrar
  const raw = await getJSON(`/api/v3/klines?symbol=${sym}&interval=${tf}&limit=300`), now = Date.now();
  return raw.filter(k => k[6] < now).map(k => ({t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5]}));
}
function signalOf(cs) { // misma regla que el Screener de la app (screener.js): última señal sin enfriamiento, vigente SIG_BARS velas
  if (!cs || cs.length < 60) return null;
  const r = NN.compute(cs, {cooldown: 0, minScore: 1}), sg = r.last; if (!sg) return null;
  const ago = cs.length - 1 - sg.i; if (ago >= SIG_BARS) return null;
  return {side: sg.side, range: !!sg.range, div: !!sg.div, score: sg.score, age: ago + 1, ago};
}
async function scan(tf, top) {
  const rows = []; let k = 0;
  const worker = async () => { while (k < top.length) { const t = top[k++]; try { const sg = signalOf(await candles(t.symbol, tf)); if (sg) rows.push({symbol: t.symbol, price: t.price, sg}); } catch (e) { console.warn(t.symbol, e.message); } } };
  await Promise.all(Array.from({length: 6}, worker));
  return rows.sort((a, b) => (a.sg.ago - b.sg.ago) || (b.sg.score - a.sg.score));
}
async function post(url, embeds) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url + '?wait=false', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({username: 'VORTEX', embeds: embeds.slice(0, 10), allowed_mentions: {parse: []}})});
    if (r.status === 429) { let w = 2000; try { w = Math.ceil(((await r.json()).retry_after || 2) * 1000); } catch {} await sleep(Math.min(w, 15000)); continue; }
    if (!r.ok) throw new Error('Discord respondió HTTP ' + r.status);
    return;
  }
  throw new Error('Discord limitó el ritmo de envío');
}
function timeframes(now = new Date(), force = '') {
  const f = String(force || '').split(',').map(s => s.trim()).filter(s => s === '1h' || s === '4h'); if (f.length) return f;
  return now.getUTCHours() % 4 === 0 ? ['1h', '4h'] : ['1h'];
}
async function main() {
  const url = String(process.env.DISCORD_WEBHOOK || '').trim();
  if (!url) { console.log('Falta el secreto DISCORD_WEBHOOK (Settings → Secrets and variables → Actions). No se envía nada.'); return; }
  if (!HOOK.test(url)) throw new Error('DISCORD_WEBHOOK no parece un webhook de Discord');
  const tfs = timeframes(new Date(), process.env.TF), top = await topSymbols(TOP_N);
  for (const tf of tfs) { const rows = await scan(tf, top); console.log(`${tf}: ${rows.length} señales`); await post(url, F.signalEmbeds(tf, rows)); await sleep(1200); }
}
if (require.main === module) main().catch(e => { console.error('Error:', e.message); process.exit(1); });
module.exports = {signalOf, timeframes, topSymbols, scan, post, candles};
