#!/usr/bin/env node
/* NOVA BOT LAB · reentrenamiento programado (GitHub Actions, sin depender de tu navegador).
   Para cada bot con «ciclo automático» activado: descarga velas cerradas, re-evalúa la versión principal con datos recientes (monitoreo)
   y corre el optimizador walk-forward (ajusta solo con entrenamiento y valida en tramos que no vio).
   · NUNCA cambia la versión principal ni toca tus bots: solo escribe sus resultados en users/<uid>/data/botlab_server.
   · La app te muestra la propuesta (si hay) y tú decides.
   · Sin la variable FIREBASE_SERVICE_ACCOUNT no hace nada (sale sin error). Nunca imprime secretos ni datos de usuarios. */
'use strict';
const B = require('../botlab-engine.js'), O = require('../botlab-optimizer.js');
try { require('../nova-nexus.js'); } catch {}
let Pine = null; try { Pine = require('../pine.js'); } catch {}
const BASES = ['https://data-api.binance.vision/api/v3', 'https://api.binance.com/api/v3']; // los runners de GitHub no siempre llegan a api.binance.com

async function history(sym, itv, count) { // velas CERRADAS, paginadas hacia atrás
  const want = Math.min(8000, Math.max(200, count | 0)), out = []; let end = Date.now();
  while (out.length < want) {
    let raw = null; for (const base of BASES) { try { const r = await fetch(`${base}/klines?symbol=${encodeURIComponent(sym)}&interval=${itv}&limit=1000&endTime=${end}`); if (r.ok) { raw = await r.json(); break; } } catch {} }
    if (!raw) throw new Error('No se pudieron descargar velas de ' + sym); if (!raw.length) break;
    out.unshift(...raw.map(d => ({t: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4], v: +d[5], ct: d[6]}))); end = raw[0][0] - 1; if (raw.length < 1000) break;
  }
  return out.filter(c => c.ct < Date.now()).slice(-want).map(({ct, ...c}) => c);
}
const userOps = sp => { const o = []; for (const g of [sp.entry, sp.exit]) for (const s of ['long', 'short']) for (const c of g[s] || []) for (const x of [c.a, c.b]) if (x && x.k === 'user') o.push(x); return o; };
function userSeries(spec, candles, scripts) { // ejecuta tus indicadores Pine sobre las velas (mismo motor que la app)
  const uo = userOps(spec), user = {}; if (!uo.length) return user; if (!Pine) throw new Error('Motor Pine no disponible en el servidor');
  for (const sid of [...new Set(uo.map(x => x.sid))]) {
    const sc = scripts.find(x => x.id === sid); if (!sc || !sc.code) throw new Error('El indicador «' + (uo.find(x => x.sid === sid).sname || sid) + '» ya no existe en tu cuenta');
    const res = Pine.run(sc.code, candles, {interval: spec.interval, symbol: spec.symbol, name: sc.name, timeLimitMs: 90000, alertCap: 30000, logLabels: true}); if (!res.ok) throw new Error('Tu indicador falló en el servidor: ' + ((res.error && res.error.msg) || ''));
    const src = O.extractSources(res, candles.length);
    for (const x of uo.filter(y => y.sid === sid)) { const f = src.find(q => q.src === x.src); if (!f) throw new Error('El indicador «' + (x.sname || sid) + '» ya no produce la señal «' + (x.sl || x.src) + '»'); user[sid + '|' + x.src] = f.series; }
  }
  return user;
}
async function retrainBot(bot, scripts, getCandles, now) {
  const v = bot.versions.find(x => x.v === bot.mainV); if (!v) return {at: now, status: 'error', reason: 'Sin versión principal'};
  const spec = B.normalizeSpec(v.spec), cyc = bot.cycle || {}, bars = Math.min(8000, Math.max(1500, cyc.bars || 4000));
  try {
    const candles = await getCandles(spec.symbol, spec.interval, bars); if (candles.length < 300) throw new Error('Pocas velas disponibles (' + candles.length + ')');
    const user = userSeries(spec, candles, scripts), ropts = {nova: globalThis.NovaNexus, user: Object.keys(user).length ? user : null};
    const res = B.backtest(candles, spec, {nova: ropts.nova, user: ropts.user || undefined}), m = res.metrics;
    const opt = await O.optimize(candles, spec, {seed: O.hash(bot.id + new Date(now).toISOString().slice(0, 10)), budget: cyc.budget || 60, ropts});
    return {at: now, v: bot.mainV, status: 'ok', symbol: spec.symbol, interval: spec.interval, bars: candles.length, from: candles[0].t, to: candles[candles.length - 1].t,
      monitor: {n: m.n, net: m.net, retPct: m.retPct, maxDDPct: m.maxDDPct, winRate: m.winRate, val: res.segments.val.retPct, test: res.segments.test.retPct, buyHold: res.buyHold.retPct, verdict: res.verdict.level},
      decision: opt.decision, reasons: opt.reasons, changes: opt.changes, folds: opt.folds, oos: opt.oos, holdout: opt.holdout, candidate: opt.candidate, dims: opt.dims};
  } catch (e) { return {at: now, v: bot.mainV, status: 'error', reason: String(e.message || e).slice(0, 300)}; }
}
const due = (bot, prev, now, force) => { const c = bot.cycle; if (!c || !c.enabled || bot.status === 'paused' || bot.status === 'archived') return false; if (force) return true; const every = Math.max(6, Math.min(24 * 14, c.everyHours || 24)) * 36e5; return !prev || now - (prev.at || 0) >= every - 30 * 6e4; };

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT; if (!raw) { console.log('FIREBASE_SERVICE_ACCOUNT no está configurado: no hay nada que reentrenar. (Ver INSTALL.md → Reentrenamiento programado)'); return; }
  let admin; try { admin = require('firebase-admin'); } catch { console.log('Falta firebase-admin (npm i --no-save firebase-admin)'); process.exit(1); }
  admin.initializeApp({credential: admin.credential.cert(JSON.parse(raw))}); const db = admin.firestore(), now = Date.now(), force = process.env.FORCE === '1', cache = new Map();
  const getCandles = async (s, i, n) => { const k = s + '|' + i + '|' + n; if (!cache.has(k)) cache.set(k, await history(s, i, n)); return cache.get(k); };
  const users = await db.collection('users').listDocuments(); let nb = 0, nr = 0, np = 0;
  for (const u of users) {
    const bd = await u.collection('data').doc('botlab').get(); if (!bd.exists) continue; let S; try { S = JSON.parse(bd.data().items || '{}'); } catch { continue; } const bots = (S.bots || []).filter(b => b && b.cycle && b.cycle.enabled); if (!bots.length) continue;
    const sd = await u.collection('data').doc('botlab_server').get(), prev = sd.exists ? (sd.data().results || {}) : {}; let scripts = null, results = Object.assign({}, prev), changed = false;
    for (const b of bots) {
      nb++; if (!due(b, prev[b.id], now, force)) continue;
      if (scripts === null) { try { const s = await u.collection('data').doc('scripts').get(); scripts = s.exists ? JSON.parse(s.data().items || '[]') : []; if (!Array.isArray(scripts)) scripts = scripts.items || []; } catch { scripts = []; } }
      const r = await retrainBot(b, scripts, getCandles, now); results[b.id] = r; changed = true; nr++; if (r.decision === 'propuesta') np++;
    }
    if (changed) { for (const id of Object.keys(results)) if (!(S.bots || []).some(b => b.id === id)) delete results[id]; await u.collection('data').doc('botlab_server').set({results, updatedAt: admin.firestore.FieldValue.serverTimestamp()}); }
  }
  console.log(`Bots con ciclo activo: ${nb} · reentrenados: ${nr} · con propuesta: ${np}`);
}
if (require.main === module) main().catch(e => { console.error('Error:', String(e.message || e).slice(0, 200)); process.exit(1); });
module.exports = {retrainBot, due, history, userSeries};
