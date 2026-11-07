/* NOVA BOT LAB · optimizador walk-forward + extractor de señales de indicadores propios.
   Módulo UMD: lo usan el navegador (botón «Optimizar ahora») y el trabajo programado de GitHub Actions (scripts/botlab-retrain.js).
   Reglas (verificables en tests/botlab-optimizer.test.js):
   · Los parámetros se ajustan SOLO con velas de entrenamiento; las pruebas se miden en velas que el ajuste nunca vio.
   · Un tramo final (≈15 %) queda reservado: la candidata se ajusta antes de él y se compara contra la versión actual ahí.
   · Si no hay mejora fuera de muestra, el resultado es «sin mejora»: nunca se inventa una propuesta.
   · Nunca reemplaza la versión principal: solo devuelve una candidata que el usuario decide. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./botlab-engine.js')); else root.CCTBotOpt = factory(root.CCTBotLab);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (B) {
  'use strict';
  const clone = o => JSON.parse(JSON.stringify(o));
  const getP = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const setP = (o, p, v) => { const ks = p.split('.'), l = ks.pop(); ks.reduce((a, k) => a[k], o)[l] = v; };
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ───────── Señales de un indicador Pine → series por vela (cada señal en la vela donde NACE) ───────── */
  function extractSources(res, n) {
    const out = [], used = new Set(), uniq = k => { let x = k, i = 2; while (used.has(x)) x = k + '#' + i++; used.add(x); return x; }, mk = bars => { const a = new Array(n).fill(0); let c = 0; for (const b of bars) if (b >= 0 && b < n && !a[b]) { a[b] = 1; c++; } return {a, c}; };
    for (const al of res.alerts || []) { const r = mk(al.bars || []); if (r.c) out.push({src: uniq('al:' + al.title), label: 'Alerta «' + al.title + '»', kind: 'señal', count: r.c, series: r.a}); }
    for (const sh of res.shapes || []) { const r = mk((sh.pts || []).map(p => p[0])); if (r.c) out.push({src: uniq('sh:' + (sh.title || sh.kind) + '|' + (sh.loc || '')), label: `Forma «${sh.title || sh.kind}»${sh.loc === 'belowbar' ? ' (debajo de la vela)' : sh.loc === 'abovebar' ? ' (encima de la vela)' : ''}`, kind: 'señal', count: r.c, series: r.a, hint: sh.loc === 'belowbar' ? 'buy' : sh.loc === 'abovebar' ? 'sell' : ''}); }
    const groups = new Map(); for (const [bar, text, style] of res.labelLog || []) { const k = String(text || '').trim().slice(0, 30) || String(style || 'etiqueta'); (groups.get(k) || groups.set(k, []).get(k)).push(bar); }
    for (const [k, bars] of groups) { const r = mk(bars); if (r.c) out.push({src: uniq('lb:' + k), label: 'Etiqueta «' + k + '»', kind: 'señal', count: r.c, series: r.a}); }
    for (const pl of (res.plots || []).slice(0, 16)) { if (!pl.values || !pl.values.length) continue; const a = pl.values.map(v => typeof v === 'number' && isFinite(v) ? v : NaN); if (a.some(v => v === v)) out.push({src: uniq('pl:' + (pl.title || pl.id)), label: 'Línea «' + (pl.title || pl.id) + '»', kind: 'serie', count: a.filter(v => v === v).length, series: a}); }
    return out;
  }

  /* ───────── Espacio de búsqueda derivado de la propia estrategia ───────── */
  function space(spec) {
    const dims = [], uniq = (vals, base) => [...new Set(vals.concat([base]))].filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    const add = (path, base, mults, int) => { const vals = uniq(mults.map(m => { const v = base * m; return int ? Math.max(2, Math.round(v)) : Math.round(v * 100) / 100; }), base); if (vals.length > 1) dims.push({path, base, values: vals}); };
    const addAbs = (path, base, deltas, lo, hi) => { const vals = uniq(deltas.map(d => Math.min(hi, Math.max(lo, base + d))), base); if (vals.length > 1) dims.push({path, base, values: vals}); };
    const r = spec.risk, f = spec.filters || {}; // el tamaño de la posición (riesgo por operación, capital) NO se optimiza a propósito: subirlo «mejora» el resultado sin mejorar la estrategia
    if (r.sl && r.sl.v) add('risk.sl.v', r.sl.v, [.6, .8, 1.25, 1.5, 2]); if (r.tp && r.tp.v) add('risk.tp.v', r.tp.v, [.6, .8, 1.25, 1.5, 2, 2.5]); if (r.trail && r.trail.v) add('risk.trail.v', r.trail.v, [.6, .8, 1.25, 1.6]); if (r.maxBars > 0) add('risk.maxBars', r.maxBars, [.5, .75, 1.5, 2], true);
    if (f.minVolRatio > 0) add('filters.minVolRatio', f.minVolRatio, [.6, .8, 1.25, 1.5]); if (f.minAtrPct > 0) add('filters.minAtrPct', f.minAtrPct, [.6, .8, 1.25, 1.5]); if (f.maxAtrPct > 0) add('filters.maxAtrPct', f.maxAtrPct, [.6, .8, 1.25, 1.5]);
    const OSC = /^(rsi|adx)$/, RATIO = /^volRatio$/;
    for (const g of ['entry', 'exit']) for (const side of ['long', 'short']) (spec[g][side] || []).forEach((c, i) => {
      for (const ab of ['a', 'b']) { const o = c[ab]; if (!o) continue; const def = B.OPERANDS[o.k]; if (!def || !def.p || o.k === 'user') continue;
        if (o.k === 'num') { const other = c[ab === 'a' ? 'b' : 'a']; if (!other || typeof o.v !== 'number') continue; const base = `${g}.${side}.${i}.${ab}.v`; // umbrales fijos: solo si se comparan con un oscilador/ratio (con precios no tienen sentido)
          if (OSC.test(other.k)) addAbs(base, o.v, [-10, -5, 5, 10], 1, 99); else if (RATIO.test(other.k) && o.v > 0) add(base, o.v, [.7, .85, 1.2, 1.5]); continue; }
        for (const pk of Object.keys(def.p)) { if (typeof o[pk] !== 'number') continue; if (pk === 'd') add(`${g}.${side}.${i}.${ab}.d`, o[pk], [.75, .9, 1.1, 1.25]); else add(`${g}.${side}.${i}.${ab}.${pk}`, o[pk], [.6, .8, 1.25, 1.6], true); } }
    });
    return dims;
  }
  const apply = (spec, assign) => { const s = clone(spec); for (const [p, v] of Object.entries(assign)) setP(s, p, v); return s; };
  const validAssign = s => { for (const g of ['entry', 'exit']) for (const side of ['long', 'short']) for (const c of s[g][side] || []) for (const ab of ['a', 'b']) { const o = c[ab]; if (o && /^macd/.test(o.k) && !(o.f < o.s)) return false; } return B.validateSpec(s).ok; };

  /* ───────── Evaluación sobre una ventana (con las mismas reglas del motor) ───────── */
  function runWin(C, spec, a, b, ropts) {
    const slice = C.slice(a, b); if (slice.length < 80) return null; let user = null;
    if (ropts && ropts.user) { user = {}; for (const k of Object.keys(ropts.user)) user[k] = ropts.user[k].slice(a, b); }
    try { return B.backtest(slice, spec, {nova: ropts && ropts.nova, user}); } catch { return null; }
  }
  const scoreOf = st => { if (!st || st.n < 8) return -1e9; const risk = st.retPct / Math.max(1, st.maxDDPct); return risk * Math.min(1, st.n / 30); };
  function stats(res, fromBar, capital) { if (!res) return {n: 0, net: 0, retPct: 0, maxDDPct: 0, profitFactor: null, pfInf: false, winRate: null}; return B.tradeStats(res.trades.filter(t => t.entryBar >= fromBar), capital); }

  async function fit(C, spec, a, b, dims, o) { // busca parámetros usando ÚNICAMENTE las velas [a, b)
    const R = rng(o.seed), cap = spec.risk.capital, evalA = assign => { const s = apply(spec, assign); if (!validAssign(s)) return -1e9; return scoreOf(stats(runWin(C, s, a, b, o.ropts), 0, cap)); };
    const base = {}, tried = new Map(), keyOf = x => JSON.stringify(x); let best = {assign: base, score: evalA(base)}; tried.set(keyOf(base), best.score); let n = 0;
    const cands = []; for (const d of dims) for (const v of d.values) if (v !== d.base) cands.push({[d.path]: v});
    while (cands.length < o.budget && dims.length) { const x = {}; for (const d of dims) if (R() < .6) x[d.path] = d.values[Math.floor(R() * d.values.length)]; if (Object.keys(x).length) cands.push(x); else break; if (cands.length > 400) break; }
    for (const c of cands.slice(0, o.budget)) { const k = keyOf(c); if (tried.has(k)) continue; const sc = evalA(c); tried.set(k, sc); if (sc > best.score + 1e-9) best = {assign: c, score: sc}; if (++n % 8 === 0 && o.yield) await o.yield(); }
    return Object.assign(best, {evaluated: tried.size});
  }
  const diff = (spec, assign) => Object.entries(assign).filter(([p, v]) => getP(spec, p) !== v).map(([path, to]) => ({path, from: getP(spec, path), to}));

  /* ───────── Walk-forward ───────── */
  async function optimize(candles, spec, opts) {
    opts = Object.assign({budget: 60, seed: 1, trainFrac: .5, testFrac: .1, holdFrac: .15, minOosTrades: 30, onProgress: null, yield: null, ropts: {}}, opts || {});
    const N = candles.length, cap = spec.risk.capital, out = {tuned: null, at: Date.now(), bars: N, from: N ? candles[0].t : null, to: N ? candles[N - 1].t : null, folds: [], oos: null, holdout: null, candidate: null, changes: [], decision: 'sin_mejora', reasons: [], dims: 0};
    const dims = space(spec); out.dims = dims.length; if (!dims.length) { out.decision = 'no_aplica'; out.reasons.push('La estrategia no tiene parámetros numéricos ajustables (periodos, stop loss o take profit).'); return out; }
    if (N < 1200) { out.decision = 'no_aplica'; out.reasons.push(`Solo hay ${N} velas: se necesitan al menos 1.200 para validar sin mirar al futuro.`); return out; }
    const budget = Math.max(opts.budget, Math.min(140, dims.length * 7)), tuneMargin = .02 * (1 + Math.max(0, dims.length - 4) / 8); // cuantos más parámetros se ajustan, más ventaja se exige (más riesgo de sobreajuste)
    const trainLen = Math.floor(N * opts.trainFrac), testLen = Math.floor(N * opts.testFrac), H0 = Math.floor(N * (1 - opts.holdFrac)), stepLen = testLen, ropts = opts.ropts;
    const o2 = {seed: opts.seed, budget, ropts, yield: opts.yield}, foldsN = Math.max(0, Math.floor((H0 - trainLen - testLen) / stepLen) + 1);
    let oosCand = [], oosBase = [], wins = 0, valid = 0; const total = foldsN + 1;
    for (let k = 0; k < foldsN; k++) {
      const s = k * stepLen, te = s + trainLen, ee = te + testLen; if (ee > H0) break; if (opts.onProgress) opts.onProgress(k, total, `Tramo ${k + 1}/${foldsN}`);
      const f = await fit(candles, spec, s, te, dims, o2), cs = apply(spec, f.assign), cr = stats(runWin(candles, cs, s, ee, ropts), trainLen, cap), br = stats(runWin(candles, spec, s, ee, ropts), trainLen, cap);
      out.folds.push({trainFrom: candles[s].t, trainTo: candles[te - 1].t, testFrom: candles[te].t, testTo: candles[ee - 1].t, params: diff(spec, f.assign), trainScore: f.score > -1e8 ? Math.round(f.score * 100) / 100 : null, evaluated: f.evaluated, cand: {n: cr.n, net: cr.net, retPct: cr.retPct, maxDDPct: cr.maxDDPct}, base: {n: br.n, net: br.net, retPct: br.retPct, maxDDPct: br.maxDDPct}});
      oosCand.push(cr); oosBase.push(br); valid++; if (cr.net > br.net) wins++;
    }
    const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0); out.oos = {folds: valid, winsVsBase: wins, cand: {n: sum(oosCand, 'n'), net: sum(oosCand, 'net')}, base: {n: sum(oosBase, 'n'), net: sum(oosBase, 'net')}};
    // candidata final: ajustada con las velas ANTERIORES al tramo reservado
    if (opts.onProgress) opts.onProgress(foldsN, total, 'Candidata final');
    const fs = Math.max(0, H0 - trainLen), f = await fit(candles, spec, fs, H0, dims, o2), cs = apply(spec, f.assign), hc = stats(runWin(candles, cs, fs, N, ropts), H0 - fs, cap), hb = stats(runWin(candles, spec, fs, N, ropts), H0 - fs, cap);
    out.holdout = {from: candles[H0].t, to: candles[N - 1].t, cand: {n: hc.n, net: hc.net, retPct: hc.retPct, maxDDPct: hc.maxDDPct, pf: hc.pfInf ? 99 : hc.profitFactor}, base: {n: hb.n, net: hb.net, retPct: hb.retPct, maxDDPct: hb.maxDDPct, pf: hb.pfInf ? 99 : hb.profitFactor}};
    out.changes = diff(spec, f.assign); out.tuned = dims.map(d => d.path); const why = out.reasons;
    if (!out.changes.length) why.push('El ajuste con datos recientes no encontró nada mejor que los parámetros actuales.');
    if (valid < 3) why.push(`Solo ${valid} tramos de validación (se necesitan 3 o más).`);
    if (out.oos.cand.n < opts.minOosTrades) why.push(`Solo ${out.oos.cand.n} operaciones fuera de muestra (mínimo ${opts.minOosTrades}).`);
    if (!(out.oos.cand.net > 0)) why.push('Fuera de muestra el procedimiento no gana dinero.');
    if (!(out.oos.cand.net > out.oos.base.net + tuneMargin * cap)) why.push(`Fuera de muestra no supera a la versión actual por un margen claro (${(tuneMargin * 100).toFixed(1)} % del capital; se exige más cuantos más parámetros se ajustan).`);
    if (valid && wins / valid < .6) why.push(`Solo mejoró a la versión actual en ${wins} de ${valid} tramos (se exige al menos el 60 %).`);
    if (!(hc.n >= 5 && hc.net > hb.net && hc.net > 0)) why.push('En el tramo reservado más reciente la candidata no supera a la versión actual.');
    if (hc.maxDDPct > hb.maxDDPct * 1.25 + 1) why.push('La candidata aumenta el drawdown más de lo aceptable en el tramo reservado.');
    if (!why.length) { out.decision = 'propuesta'; out.candidate = apply(spec, f.assign); } else out.decision = out.changes.length ? 'sin_mejora' : 'sin_mejora';
    if (opts.onProgress) opts.onProgress(total, total, 'Listo'); return out;
  }
  return {optimize, space, apply, extractSources, hash, validAssign};
});
