/* Nova Nexus — indicador portado a JavaScript (sin intérprete de Pine).
   Módulos incluidos: IA Signals v2.7 (BUY/SELL, score, cooldown, divergencias, TP/SL) y EMA Cloud.
   Las funciones imitan la semántica de Pine v5 (ta.rma, ta.ema, ta.linreg, ta.dmi, ta.crossover…). */
(function (root) {
  'use strict';
  const NA = NaN, isna = Number.isNaN;

  /* ── Funciones ta.* de Pine ── */
  function sma(src, n) {
    const out = new Array(src.length).fill(NA);
    for (let i = n - 1; i < src.length; i++) {
      let s = 0, ok = true;
      for (let j = i - n + 1; j <= i; j++) { const v = src[j]; if (isna(v)) { ok = false; break; } s += v; }
      if (ok) out[i] = s / n;
    }
    return out;
  }
  // ta.rma: semilla = sma(n) y luego (prev*(n-1)+x)/n; si x es na, se reinicia (igual que Pine)
  function rma(src, n) {
    const out = new Array(src.length).fill(NA); let prev = NA;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (isna(v)) { prev = NA; continue; }
      if (isna(prev)) {
        if (i >= n - 1) { let s = 0, ok = true; for (let j = i - n + 1; j <= i; j++) { if (isna(src[j])) { ok = false; break; } s += src[j]; } prev = ok ? s / n : NA; }
      } else prev = (v + (n - 1) * prev) / n;
      out[i] = prev;
    }
    return out;
  }
  // ta.ema: primer valor = fuente, luego alpha = 2/(n+1)
  function ema(src, n) {
    const out = new Array(src.length).fill(NA), a = 2 / (n + 1); let prev = NA;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (isna(v)) { prev = NA; continue; }
      prev = isna(prev) ? v : a * v + (1 - a) * prev; out[i] = prev;
    }
    return out;
  }
  function highest(src, n) { const out = new Array(src.length).fill(NA); for (let i = n - 1; i < src.length; i++) { let m = -Infinity; for (let j = i - n + 1; j <= i; j++) { if (isna(src[j])) { m = NA; break; } if (src[j] > m) m = src[j]; } out[i] = m; } return out; }
  function lowest(src, n) { const out = new Array(src.length).fill(NA); for (let i = n - 1; i < src.length; i++) { let m = Infinity; for (let j = i - n + 1; j <= i; j++) { if (isna(src[j])) { m = NA; break; } if (src[j] < m) m = src[j]; } out[i] = m; } return out; }
  // ta.linreg(src, len, 0): valor de la recta de mínimos cuadrados en la barra actual
  function linreg(src, n) {
    const out = new Array(src.length).fill(NA), sx = n * (n - 1) / 2, sxx = (n - 1) * n * (2 * n - 1) / 6, den = n * sxx - sx * sx;
    for (let i = n - 1; i < src.length; i++) {
      let sy = 0, sxy = 0, ok = true;
      for (let k = 0; k < n; k++) { const v = src[i - n + 1 + k]; if (isna(v)) { ok = false; break; } sy += v; sxy += k * v; }
      if (!ok) continue;
      const slope = (n * sxy - sx * sy) / den, intercept = (sy - slope * sx) / n;
      out[i] = intercept + slope * (n - 1);
    }
    return out;
  }
  const change = a => a.map((v, i) => i === 0 ? NA : v - a[i - 1]);
  const fixnan = a => { let last = NA; return a.map(v => { if (!isna(v)) last = v; return isna(v) ? last : v; }); };
  const crossover = (a, b, i) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
  const crossunder = (a, b, i) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];
  const nz0 = v => isna(v) ? 0 : v;

  const defaults = {
    on: true, ia: true, ema: true, tp: true, rules: true,
    emaLen: 55, emaMult: 0.6,
    minScore: 1, cooldown: 10, cdBoth: false,
    slMult: 1.0, tp1Mult: 1.5, tp2Mult: 2.5, tp3Mult: 4.0, tpBars: 40,
    rulesText: '• Opera solo a favor de la estructura\n• Espera confirmación BOS / CHoCH\n• No operar en rango\n• Riesgo fijo por trade'
  };
  const stars = n => '⭐'.repeat(Math.max(0, Math.min(5, n)));

  function compute(candles, opts) {
    const o = Object.assign({}, defaults, opts || {}), N = candles.length;
    const res = {N, emaBase: [], emaTop: [], emaBot: [], bull: [], signals: [], bySignal: {}, last: null};
    if (!N) return res;
    const O = candles.map(c => c.o), H = candles.map(c => c.h), L = candles.map(c => c.l), C = candles.map(c => c.c);

    /* ── EMA Cloud ── */
    const trP = H.map((h, i) => i === 0 ? h - L[i] : Math.max(h - L[i], Math.abs(h - C[i - 1]), Math.abs(L[i] - C[i - 1]))); // ta.tr
    const atrLen = n => rma(trP, n);
    const base = ema(C, o.emaLen), atrE = atrLen(o.emaLen);
    res.emaBase = base;
    res.emaTop = base.map((b, i) => b + atrE[i] * o.emaMult);
    res.emaBot = base.map((b, i) => b - atrE[i] * o.emaMult);
    res.bull = C.map((c, i) => c >= base[i]);

    /* ── IA Signals: constantes ── */
    const sLen = 20, sSig = 3, sDfl = 30, OB = 40, OS = -40, OBr = 35, OSr = -35, emaLen = 200, MFmin = 3.0, adxLen = 14, adxThr = 25, divLk = 5, divTrs = 25, atrL = 14;

    /* Oscilador */
    const hl2 = H.map((h, i) => (h + L[i]) / 2), av = sma(hl2, sLen), hh = highest(H, sLen), ll = lowest(L, sLen);
    const trM = H.map((h, i) => i === 0 ? NA : Math.max(h - L[i], Math.abs(h - C[i - 1]), Math.abs(L[i] - C[i - 1]))); // tr manual (na en la 1.ª barra)
    const oAtr = rma(trM, sLen);
    const oIn = C.map((c, i) => { const avg = ((hh[i] + ll[i]) / 2 + av[i]) / 2; return (c - avg) / oAtr[i] * 100; });
    const osc = linreg(oIn, sLen), sigv = sma(osc, sSig);

    /* Money Flow (Heikin-Ashi propio) */
    const haC = C.map((c, i) => (O[i] + H[i] + L[i] + c) / 4), haO = new Array(N).fill(NA);
    for (let i = 0; i < N; i++) haO[i] = i === 0 ? (O[i] + C[i]) / 2 : (haO[i - 1] + haC[i - 1]) / 2;
    const haH = H.map((h, i) => Math.max(h, haO[i], haC[i])), haL = L.map((l, i) => Math.min(l, haO[i], haC[i]));
    const haTr = haH.map((h, i) => i === 0 ? NA : Math.max(h - haL[i], Math.abs(h - haC[i - 1]), Math.abs(haL[i] - haC[i - 1])));
    const haAtr = rma(haTr, sDfl);
    const chH = change(haH), chL = change(haL);
    const fUp = rma(chH.map(v => isna(v) ? NA : Math.max(v, 0)), sDfl).map((v, i) => v / haAtr[i]);
    const fDn = rma(chL.map(v => isna(v) ? NA : Math.max(-v, 0)), sDfl).map((v, i) => v / haAtr[i]);
    const flux = rma(fUp.map((u, i) => (u - fDn[i]) / (u + fDn[i])), sDfl / 2).map(v => v * 100);

    /* EMA 200, ADX (ta.dmi) y ATR 14 */
    const ema200 = ema(C, emaLen), atr14 = atrLen(atrL);
    const up = change(H), dn = change(L).map(v => -v);
    const pDM = up.map((u, i) => isna(u) ? NA : (u > dn[i] && u > 0 ? u : 0)), mDM = dn.map((d, i) => isna(d) ? NA : (d > up[i] && d > 0 ? d : 0));
    const trur = rma(trP, adxLen);
    const plus = fixnan(rma(pDM, adxLen).map((v, i) => 100 * v / trur[i])), minus = fixnan(rma(mDM, adxLen).map((v, i) => 100 * v / trur[i]));
    const adx = rma(plus.map((p, i) => { const s = p + minus[i]; return Math.abs(p - minus[i]) / (s === 0 ? 1 : s); }), adxLen).map(v => 100 * v);

    /* Divergencias */
    const pLow = lowest(L, divLk), pHigh = highest(H, divLk), oLow = lowest(osc, divLk), oHigh = highest(osc, divLk);

    let lastBuy = -9999, lastSell = -9999, lastAny = -9999;
    for (let i = 0; i < N; i++) {
      const isRange = adx[i] < adxThr, isTrend = !isRange;
      const obU = isRange ? OBr : OB, osU = isRange ? OSr : OS, mfU = isRange ? MFmin / 2 : MFmin;
      const inOB = osc[i] >= obU, inOS = osc[i] <= osU;
      const crossBuy = crossover(osc, sigv, i) && inOS, crossSel = crossunder(osc, sigv, i) && inOB;
      const f2Buy = isTrend ? C[i] > ema200[i] : true, f2Sell = isTrend ? C[i] < ema200[i] : true;
      const f3Buy = flux[i] > mfU, f3Sell = flux[i] < -mfU;
      const divBull = i > 0 && L[i] < pLow[i - 1] && osc[i] > oLow[i - 1] && osc[i] < -divTrs && crossBuy;
      const divBear = i > 0 && H[i] > pHigh[i - 1] && osc[i] < oHigh[i - 1] && osc[i] > divTrs && crossSel;
      const scBuy = (inOS ? 1 : 0) + (C[i] > ema200[i] ? 1 : 0) + (flux[i] > mfU ? 1 : 0) + (isTrend ? 1 : 0) + (divBull ? 1 : 0);
      const scSell = (inOB ? 1 : 0) + (C[i] < ema200[i] ? 1 : 0) + (flux[i] < -mfU ? 1 : 0) + (isTrend ? 1 : 0) + (divBear ? 1 : 0);
      const rawBuy = crossBuy && f2Buy && f3Buy && scBuy >= o.minScore, rawSell = crossSel && f2Sell && f3Sell && scSell >= o.minScore;
      const cdBuy = o.cdBoth ? i - lastAny >= o.cooldown : i - lastBuy >= o.cooldown;
      const cdSell = o.cdBoth ? i - lastAny >= o.cooldown : i - lastSell >= o.cooldown;
      const fBuy = rawBuy && cdBuy, fSell = rawSell && cdSell;
      if (fBuy) { lastBuy = i; lastAny = i; }
      if (fSell) { lastSell = i; lastAny = i; }
      if (fBuy || fSell) {
        const buy = fBuy, score = buy ? scBuy : scSell, div = buy ? divBull : divBear;
        const label = buy ? (score <= 2 ? '▲' : score === 3 ? '▲ +' : score === 4 ? '▲ D+' : '▲ D++') : (score <= 2 ? '▼' : score === 3 ? '▼ +' : score === 4 ? '▼ D-' : '▼ D--');
        const sg = {i, t: candles[i].t, side: buy ? 'buy' : 'sell', score, div, range: isRange, label, price: C[i], atr: atr14[i],
          osc: osc[i], flux: flux[i], adx: adx[i], aboveEma: C[i] > ema200[i], isTrend,
          sl: buy ? C[i] - atr14[i] * o.slMult : C[i] + atr14[i] * o.slMult,
          tp1: buy ? C[i] + atr14[i] * o.tp1Mult : C[i] - atr14[i] * o.tp1Mult,
          tp2: buy ? C[i] + atr14[i] * o.tp2Mult : C[i] - atr14[i] * o.tp2Mult,
          tp3: buy ? C[i] + atr14[i] * o.tp3Mult : C[i] - atr14[i] * o.tp3Mult};
        res.signals.push(sg); res.bySignal[i] = sg; res.last = sg;
      }
    }
    res.osc = osc; res.flux = flux; res.adx = adx; res.ema200 = ema200;
    return res;
  }
  function tooltip(sg) {
    const r1 = v => (Math.round(v * 10) / 10).toString();
    const parts = [`${sg.side === 'buy' ? '🟢 BUY' : '🔴 SELL'} ${sg.score}/5 ${stars(sg.score)}`, `OSC ${r1(sg.osc)}`, `Flow ${r1(sg.flux)}`, `ADX ${r1(sg.adx)}${sg.range ? ' (rango)' : ''}`];
    if (sg.div) parts.push(sg.side === 'buy' ? 'Divergencia D+' : 'Divergencia D-');
    return parts.join(' · ');
  }
  root.NovaNexus = {compute, defaults, tooltip, stars, _ta: {sma, rma, ema, linreg, highest, lowest}};
})(typeof window !== 'undefined' ? window : globalThis);
