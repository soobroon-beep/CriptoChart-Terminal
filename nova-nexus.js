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


  /* ───────────────────────── SMC: estructura de mercado + Order Blocks volumétricos ─────────────────────────
     Port de structure() del script (rama swing: draw=true, internal=false). Se recorre barra a barra con el mismo
     orden de operaciones que Pine; solo se procesan las últimas `window` velas (igual que mswindow=500). */
  function smc(cs, o0) {
    const o = Object.assign({mslen: 5, len: 5, window: 500, oblast: 5, swingLimit: 100, sweep: true, adjusted: true, overlap: true, recent: true, obmiti: 'Close'}, o0 || {});
    const N = cs.length, H = cs.map(c => c.h), L = cs.map(c => c.l), C = cs.map(c => c.c), O = cs.map(c => c.o), V = cs.map(c => c.v), T = cs.map(c => c.t);
    const out = {bull: [], bear: [], obs: {bull: [], bear: []}, metrics: {bull: [], bear: []}, start: 0, trend: 0};
    if (N < 20) return out;
    const tr = H.map((h, i) => i === 0 ? h - L[i] : Math.max(h - L[i], Math.abs(h - C[i - 1]), Math.abs(L[i] - C[i - 1])));
    const atr = rma(tr, 200).map(v => v / (5 / o.len));                       // atr global = ta.atr(200)/(5/len)
    const h_ = j => j >= 0 && j < N ? H[j] : NaN, l_ = j => j >= 0 && j < N ? L[j] : NaN;
    const mslen = o.mslen, start = Math.max(0, N - o.window);                   // bar_index > last_bar_index - mswindow
    const pivH = i => { const c = i - mslen; if (c - mslen < 0) return NaN; const p = H[c]; for (let k = 1; k <= mslen; k++) { if (H[c - k] >= p || H[c + k] > p) return NaN; } return p; };
    const pivL = i => { const c = i - mslen; if (c - mslen < 0) return NaN; const p = L[c]; for (let k = 1; k <= mslen; k++) { if (L[c - k] <= p || L[c + k] < p) return NaN; } return p; };

    // ms.find(use_max, sweep=false, useob)
    function find(ms, i, useMax, useOb) {
      let min = 99999999, max = 0, idx = 0;
      const d = i - ms.loc;
      if (!Number.isNaN(d)) {
        const upto = d - 1 > 0 ? d - 1 : Math.max(0, d);
        for (let k = 0; k <= upto; k++) {
          if (useMax) { max = Math.max(H[i - k], max); if (max === H[i - k]) { min = L[i - k]; idx = k; } }
          else { min = Math.min(L[i - k], min); if (min === L[i - k]) { max = H[i - k]; idx = k; } }
        }
      }
      if (useOb) {
        if (useMax) { if (h_(i - idx - 1) > h_(i - idx)) idx += 1; }
        else { if (l_(i - idx - 1) < l_(i - idx)) idx += 1; }
      }
      return idx;
    }
    const fnOB = (list, bull, cords, idx, i) => {
      const j = i - idx;
      list.unshift({bull, top: bull ? cords : H[j], btm: bull ? L[j] : cords, avg: bull ? (cords + L[j]) / 2 : (cords + H[j]) / 2, loc: T[j], vol: V[j], dir: C[j] > O[j] ? 1 : -1, move: 1, blPOS: 1, brPOS: 1, xlocbl: T[j], xlocbr: NaN});
    };
    const mitigated = (list, i) => {                                           // obmiti = Close (los breakers están desactivados)
      for (let k = 0; k < list.length; k++) {
        const st = list[k];
        const hit = st.bull ? (o.obmiti === 'Close' ? Math.min(C[i], O[i]) < st.btm : o.obmiti === 'Wick' ? L[i] < st.btm : L[i] < st.avg)
                            : (o.obmiti === 'Close' ? Math.max(C[i], O[i]) > st.top : o.obmiti === 'Wick' ? H[i] > st.top : H[i] > st.avg);
        if (hit) list.splice(k, 1);                                            // igual que Pine: el elemento siguiente se salta en esta barra
      }
    };
    const ov = (a, b) => (a.btm > b.btm && a.btm < b.top) || (a.top < b.top && a.btm > b.btm) || (a.top > b.top && a.btm < b.btm) || (a.top < b.top && a.top > b.btm);
    const overlap = (bull, bear) => {
      if (bull.length > 1) for (let i = bull.length - 1; i >= 1; i--) { const st = bull[i], cur = bull[0], v = o.recent ? i : 0; if (st && ov(st, cur)) bull.splice(v, 1); }
      if (bear.length > 1) for (let i = bear.length - 1; i >= 1; i--) { const st = bear[i], cur = bear[0], v = o.recent ? i : 0; if (st && ov(st, cur)) bear.splice(v, 1); }
      if (bull.length > 0 && bear.length > 0) for (let i = bull.length - 1; i >= 0; i--) { const st = bull[i], cur = bear[0], v = o.recent ? 0 : i; if (st && cur && ov(st, cur)) bull.splice(v, 1); }
      if (bull.length > 0 && bear.length > 0) for (let i = bear.length - 1; i >= 0; i--) { const st = bear[i], cur = bull[0], v = o.recent ? 0 : i; if (st && cur && ov(st, cur)) bear.splice(v, 1); }
    };
    const umt = (m, i) => {
      if (m.dir === 1) { if (m.move === 1) { m.blPOS++; m.move = 2; } else if (m.move === 2) { m.blPOS++; m.move = 3; } else { m.brPOS++; m.move = 1; } }
      else { if (m.move === 1) { m.brPOS++; m.move = 2; } else if (m.move === 2) { m.brPOS++; m.move = 3; } else { m.blPOS++; m.move = 1; } }
      if (i >= 2 && T[i] - T[i - 1] === T[i - 1] - T[i - 2]) { m.xlocbl = m.loc + (T[i] - T[i - 1]) * m.blPOS; m.xlocbr = m.loc + (T[i] - T[i - 1]) * m.brPOS; }
    };

    const UP = 'up', DN = 'dn', DASH = 'dashed', DOT = 'dotted', SOLID = 'solid';
    const mk = (x1, x2, y, txt, col, style) => ({x1, x2, y, txt, col, style});
    let ms = {start: 0, zn: NaN, zz: NaN, bos: NaN, choch: NaN, loc: NaN, temp: NaN, trend: 0, main: NaN, xloc: NaN, txt: ''};
    let up = NaN, dn = NaN;
    const bldw = [], brdw = [], blob = [], brob = [];
    const phn = [NaN], php = [NaN], pln = [NaN], plp = [NaN];
    const isna = Number.isNaN;

    for (let i = start; i < N; i++) {
      const idbull = find(ms, i, false, true), idbear = find(ms, i, true, true);
      const btmP = (H[i - idbear] - atr[i - idbear]) < L[i - idbear] ? L[i - idbear] : (H[i - idbear] - atr[i - idbear]);
      const topP = (L[i - idbull] + atr[i - idbull]) > H[i - idbull] ? H[i - idbull] : (L[i - idbull] + atr[i - idbull]);
      const ph = pivH(i), pl = pivL(i);
      let crossup = false, crossdn = false;
      if (!isna(ph)) { phn.unshift(i - mslen); php.unshift(H[i - mslen]); }
      if (!isna(pl)) { pln.unshift(i - mslen); plp.unshift(L[i - mslen]); }
      if (php.length > 0 && H[i] > php[0]) { php.length = 0; phn.length = 0; }
      if (plp.length > 0 && L[i] < plp[0]) { plp.length = 0; pln.length = 0; }
      if (isna(up)) up = H[i];
      if (isna(dn)) dn = L[i];
      if (H[i] > up) { up = H[i]; dn = L[i]; crossup = true; }
      if (L[i] < dn) { up = H[i]; dn = L[i]; crossdn = true; }

      if (ms.start === 0) {
        ms = {zn: i, zz: NaN, bos: H[i], choch: L[i], loc: i, temp: i, trend: 0, start: 1, main: NaN, xloc: i, txt: ''};
        bldw.unshift(mk(T[i], T[i], H[i], 'CHoCH', UP, DASH));
        brdw.unshift(mk(T[i], T[i], L[i], 'CHoCH', DN, DASH));
      }
      const sw = o.sweep, ADJ = o.adjusted, mod = (i % mslen) * 2 === 0;

      if (ms.start === 1) {
        if (L[i] <= ms.choch && C[i] >= ms.choch && sw) {
          ms.choch = L[i]; ms.xloc = i;
          const dw = brdw[0]; dw.x2 = T[i]; dw.style = DOT; dw.txt = 'x';
          brdw.unshift(mk(T[i], T[i], L[i], 'CHoCH', DN, DASH));
        } else if (H[i] >= ms.bos && C[i] <= ms.bos && sw) {
          ms.bos = H[i]; ms.xloc = i;
          const dw = bldw[0]; dw.x2 = T[i]; dw.style = DOT; dw.txt = 'x';
          bldw.unshift(mk(T[i], T[i], H[i], 'CHoCH', UP, DASH));
        } else if (C[i] <= ms.choch) {
          ms.txt = 'choch'; fnOB(blob, true, topP, idbull, i);
          ms.trend = -1; ms.choch = ms.bos; ms.bos = NaN; ms.start = 2; ms.loc = i; ms.main = L[i]; ms.temp = ms.loc; ms.xloc = i;
          const dw = brdw[0]; dw.x2 = T[i]; dw.style = SOLID;
        } else if (C[i] >= ms.bos) {
          ms.txt = 'choch'; fnOB(brob, false, btmP, idbear, i);
          ms.trend = 1; ms.bos = NaN; ms.start = 2; ms.loc = i; ms.main = H[i]; ms.temp = ms.loc; ms.xloc = i;
          const dw = bldw[0]; dw.x2 = T[i]; dw.style = SOLID;
        }
      }

      if (ms.start === 2) {
        if (ms.trend === -1) {
          if (L[i] <= ms.main) { ms.main = L[i]; ms.temp = i; }
          if (mod) {
            if (!isna(ms.bos) && ADJ && php.length > 0) {
              if (php[0] < ms.choch) { ms.choch = php[0]; ms.loc = phn[0]; ms.xloc = phn[0]; ms.temp = phn[0]; const ch = bldw[0]; ch.x1 = T[phn[0]]; ch.x2 = T[i]; ch.y = php[0]; }
            }
          }
          if (isna(ms.bos)) {
            if (crossup && C[i] > O[i] && C[i - 1] > O[i - 1]) { ms.bos = ms.main; ms.loc = ms.temp; ms.xloc = ms.loc; brdw.unshift(mk(T[ms.loc], T[i], L[ms.loc], 'BOS', DN, DASH)); }
          }
          if (!isna(ms.bos)) brdw[0].x2 = T[i];
          bldw[0].x2 = T[i];
          if (L[i] <= ms.bos && C[i] >= ms.bos && !isna(ms.bos) && sw) {
            ms.bos = L[i]; const dw = brdw[0]; dw.x2 = T[i]; dw.style = DOT; dw.txt = 'x';
            brdw.unshift(mk(T[i], T[i], L[i], 'BOS', DN, DASH)); ms.xloc = i;
          } else if (C[i] <= ms.bos && !isna(ms.bos)) {
            ms.txt = 'bos'; ms.zz = ms.bos; ms.zn = i; fnOB(brob, false, btmP, idbear, i);
            const id = find(ms, i, true, false);
            ms.xloc = i; ms.bos = NaN; ms.choch = H[i - id]; ms.loc = i - id;
            const dw = brdw[0]; dw.x2 = T[i]; dw.style = SOLID;
            const ch = bldw[0]; ch.x1 = T[i - id]; ch.x2 = T[i]; ch.y = H[i - id];
          }
          if (H[i] >= ms.choch && C[i] <= ms.choch && sw) {
            ms.choch = H[i]; ms.xloc = i; const dw = bldw[0]; dw.x2 = T[i]; dw.style = DOT; dw.txt = 'x';
            bldw.unshift(mk(T[i], T[i], H[i], 'CHoCH', UP, DASH));
          } else if (C[i] >= ms.choch) {
            ms.txt = 'choch'; ms.zz = ms.choch; ms.zn = i; fnOB(blob, true, topP, idbull, i);
            const id = find(ms, i, false, false);
            if (isna(ms.bos)) { ms.choch = L[i - id]; brdw.unshift(mk(T[i], T[i], L[i], 'BOS', DN, DASH)); brdw[0].x1 = T[ms.temp]; }
            else ms.choch = ms.bos;
            ms.bos = NaN; ms.main = H[i]; ms.trend = 1; ms.loc = i; ms.xloc = i; ms.temp = ms.loc;
            const dw = bldw[0]; dw.x2 = T[i]; dw.txt = 'CHoCH'; dw.style = SOLID;
            const ch = brdw[0]; ch.x2 = T[i]; ch.y = ms.choch; ch.txt = 'CHoCH';
            ms.xloc = i;
          }
        } else if (ms.trend === 1) {
          if (H[i] >= ms.main) { ms.main = H[i]; ms.temp = i; }
          if (isna(ms.bos)) {
            if (crossdn && C[i] < O[i] && C[i - 1] < O[i - 1]) { ms.bos = ms.main; ms.loc = ms.temp; ms.xloc = ms.loc; bldw.unshift(mk(T[ms.loc], T[i], H[ms.loc], 'BOS', UP, DASH)); }
          }
          if (mod) {
            if (!isna(ms.bos) && ADJ && plp.length > 0) {
              if (plp[0] > ms.choch) { ms.choch = plp[0]; ms.loc = pln[0]; ms.xloc = pln[0]; ms.temp = pln[0]; const ch = brdw[0]; ch.x1 = T[pln[0]]; ch.x2 = T[i]; ch.y = plp[0]; }
            }
          }
          if (!isna(ms.bos)) bldw[0].x2 = T[i];
          brdw[0].x2 = T[i];
          if (H[i] >= ms.bos && C[i] <= ms.bos && !isna(ms.bos) && sw) {
            ms.bos = H[i]; const dw = bldw[0]; dw.x2 = T[i]; dw.style = DOT; dw.txt = 'x';
            bldw.unshift(mk(T[i], T[i], H[i], 'BOS', UP, DASH)); ms.xloc = i;
          } else if (C[i] >= ms.bos && !isna(ms.bos)) {
            ms.txt = 'bos'; ms.zz = ms.bos; ms.zn = i; fnOB(blob, true, topP, idbull, i);
            const id = find(ms, i, false, false);
            ms.xloc = i; ms.bos = NaN; ms.choch = L[i - id]; ms.loc = i - id;
            const dw = bldw[0]; dw.x2 = T[i]; dw.style = SOLID;
            const ch = brdw[0]; ch.x1 = T[i - id]; ch.x2 = T[i]; ch.y = L[i - id];
          }
          if (L[i] <= ms.choch && C[i] >= ms.choch && sw) {
            ms.choch = L[i]; ms.xloc = i; const dw = brdw[0]; dw.x2 = T[i]; dw.style = DOT; dw.txt = 'x';
            brdw.unshift(mk(T[i], T[i], L[i], 'CHoCH', DN, DASH));
          } else if (C[i] <= ms.choch) {
            ms.txt = 'choch'; ms.zz = ms.choch; ms.zn = i; fnOB(brob, false, btmP, idbear, i);
            const id = find(ms, i, true, false);
            if (isna(ms.bos)) { ms.choch = H[i - id]; bldw.unshift(mk(T[i], T[i], H[i], 'BOS', UP, DASH)); bldw[0].x1 = T[ms.temp]; }
            else ms.choch = ms.bos;
            ms.bos = NaN; ms.main = L[i]; ms.trend = -1; ms.loc = i; ms.temp = ms.loc;
            const dw = brdw[0]; dw.x2 = T[i]; dw.txt = 'CHoCH'; dw.style = SOLID;
            const ch = bldw[0]; ch.y = ms.choch; ch.x2 = T[i]; ch.txt = 'CHoCH';
            ms.xloc = i;
          }
        }
      }

      // Order Blocks: mitigación, solapes y actividad compra/venta
      mitigated(blob, i); mitigated(brob, i);
      if (o.overlap) overlap(blob, brob);
      for (const m of blob) umt(m, i);
      for (const m of brob) umt(m, i);
    }

    out.bull = bldw.slice(0, o.swingLimit + 1); out.bear = brdw.slice(0, o.swingLimit + 1);
    const lim = l => l.length ? l.slice(0, Math.min(o.oblast - 1, l.length - 1) + 1) : [];
    out.obs.bull = lim(blob); out.obs.bear = lim(brob);
    for (const side of ['bull', 'bear']) {
      const arr = out.obs[side], tV = arr.reduce((a, m) => a + m.vol, 0);
      out.metrics[side] = arr.map(m => Math.floor(m.vol / tV * 100));
    }
    out.start = start; out.trend = ms.trend; out.state = ms;
    return out;
  }

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
    const fUp = rma(chH.map(v => isna(v) ? NA : Math.max(v, 0)), sDfl).map((v, i) => v / (haAtr[i] === 0 ? 1e-12 : haAtr[i]));
    const fDn = rma(chL.map(v => isna(v) ? NA : Math.max(-v, 0)), sDfl).map((v, i) => v / (haAtr[i] === 0 ? 1e-12 : haAtr[i]));
    const flux = rma(fUp.map((u, i) => (u + fDn[i]) === 0 ? 0 : (u - fDn[i]) / (u + fDn[i])), sDfl / 2).map(v => v * 100);

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
    res.smc = o.smc ? smc(candles, o.smcOpts) : null;
    return res;
  }
  function tooltip(sg) {
    const r1 = v => (Math.round(v * 10) / 10).toString();
    const parts = [`${sg.side === 'buy' ? '🟢 BUY' : '🔴 SELL'} ${sg.score}/5 ${stars(sg.score)}`, `OSC ${r1(sg.osc)}`, `Flow ${r1(sg.flux)}`, `ADX ${r1(sg.adx)}${sg.range ? ' (rango)' : ''}`];
    if (sg.div) parts.push(sg.side === 'buy' ? 'Divergencia D+' : 'Divergencia D-');
    return parts.join(' · ');
  }
  root.NovaNexus = {compute, smc, defaults, tooltip, stars, _ta: {sma, rma, ema, linreg, highest, lowest}};
})(typeof window !== 'undefined' ? window : globalThis);
