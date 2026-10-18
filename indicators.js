/* Indicadores técnicos de CryptoChart Terminal — funciones puras, sin DOM (se prueban con Node: tests/indicators.test.js).
   Las series devuelven `null` donde el valor aún no existe. Definiciones alineadas con TradingView (ta.*). */
(function (root) {
  'use strict';
  const blank = n => new Array(n).fill(null);

  /* Media móvil ponderada: pesos 1..n (el más reciente pesa n). */
  function wma(xs, n) {
    const out = blank(xs.length), den = n * (n + 1) / 2;
    for (let i = n - 1; i < xs.length; i++) {
      let s = 0; for (let k = 0; k < n; k++) s += xs[i - k] * (n - k);
      out[i] = s / den;
    }
    return out;
  }
  function sma(xs, n) {
    const out = blank(xs.length);
    for (let i = n - 1; i < xs.length; i++) { let s = 0; for (let k = 0; k < n; k++) s += xs[i - k]; out[i] = s / n; }
    return out;
  }
  /* EMA sobre una serie que puede empezar con nulls: la semilla es la SMA de los primeros n valores definidos. */
  function ema(xs, n) {
    const out = blank(xs.length), k = 2 / (n + 1);
    let first = xs.findIndex(v => v != null); if (first < 0 || xs.length - first < n) return out;
    let e = 0; for (let i = first; i < first + n; i++) e += xs[i]; e /= n; out[first + n - 1] = e;
    for (let i = first + n; i < xs.length; i++) { e = xs[i] * k + e * (1 - k); out[i] = e; }
    return out;
  }
  /* RMA de Wilder (ta.rma): semilla = SMA(n). */
  function rma(xs, n) {
    const out = blank(xs.length); if (xs.length < n) return out;
    let r = 0; for (let i = 0; i < n; i++) r += xs[i]; r /= n; out[n - 1] = r;
    for (let i = n; i < xs.length; i++) { r = (r * (n - 1) + xs[i]) / n; out[i] = r; }
    return out;
  }
  const trueRange = c => c.map((x, i) => i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)));
  function atr(c, n = 14) { return rma(trueRange(c), n); }

  /* VWAP anclado a la sesión UTC (se reinicia cada día) con precio típico hlc3. Solo tiene sentido en intradía:
     en 1d/1w/1M devuelve todo null en vez de repetir hlc3 (sería una línea sin información). */
  function vwap(c, intervalMs) {
    const out = blank(c.length); if (intervalMs >= 864e5) return out;
    let pv = 0, vv = 0, day = null;
    for (let i = 0; i < c.length; i++) {
      const d = Math.floor(c[i].t / 864e5);
      if (d !== day) { day = d; pv = 0; vv = 0; }
      const tp = (c[i].h + c[i].l + c[i].c) / 3; pv += tp * c[i].v; vv += c[i].v;
      out[i] = vv > 0 ? pv / vv : tp;
    }
    return out;
  }

  /* MACD (12, 26, 9): línea = EMA rápida − EMA lenta, señal = EMA de la línea, histograma = línea − señal. */
  function macd(closes, fast = 12, slow = 26, sig = 9) {
    const f = ema(closes, fast), s = ema(closes, slow);
    const line = closes.map((_, i) => f[i] != null && s[i] != null ? f[i] - s[i] : null);
    const signal = ema(line, sig);
    return {line, signal, hist: line.map((v, i) => v != null && signal[i] != null ? v - signal[i] : null)};
  }

  /* Estocástico lento (14, 3, 3): %K bruto → SMA(3) = %K, SMA(3) de %K = %D. */
  function stoch(c, kLen = 14, kSmooth = 3, dSmooth = 3) {
    const raw = blank(c.length);
    for (let i = kLen - 1; i < c.length; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let k = 0; k < kLen; k++) { hh = Math.max(hh, c[i - k].h); ll = Math.min(ll, c[i - k].l); }
      raw[i] = hh === ll ? 50 : 100 * (c[i].c - ll) / (hh - ll);
    }
    const smoothNull = (xs, n) => { const o = blank(xs.length), first = xs.findIndex(v => v != null); if (first < 0) return o; for (let i = first + n - 1; i < xs.length; i++) { let s = 0; for (let k = 0; k < n; k++) s += xs[i - k]; o[i] = s / n; } return o; };
    const k = smoothNull(raw, kSmooth);
    return {k, d: smoothNull(k, dSmooth)};
  }

  /* OBV: acumula el volumen con el signo del cambio de cierre (primera barra = 0, como ta.obv). */
  function obv(c) {
    const out = new Array(c.length).fill(0);
    for (let i = 1; i < c.length; i++) out[i] = out[i - 1] + (c[i].c > c[i - 1].c ? c[i].v : c[i].c < c[i - 1].c ? -c[i].v : 0);
    return out;
  }

  /* Supertrend (10, 3) con la misma lógica que ta.supertrend de Pine.
     dir = -1 tendencia alcista (línea bajo el precio), +1 bajista (línea sobre el precio). */
  function supertrend(c, len = 10, factor = 3) {
    const n = c.length, a = atr(c, len), line = blank(n), dir = blank(n), up = blank(n), dn = blank(n);
    let pu = null, pl = null, pst = null;
    for (let i = 0; i < n; i++) {
      if (a[i] == null) continue;
      const hl2 = (c[i].h + c[i].l) / 2;
      let upper = hl2 + factor * a[i], lower = hl2 - factor * a[i];
      const pc = i > 0 ? c[i - 1].c : c[i].c;
      if (pl != null) lower = (lower > pl || pc < pl) ? lower : pl;
      if (pu != null) upper = (upper < pu || pc > pu) ? upper : pu;
      let d;
      if (pst == null) d = 1;
      else if (pst === pu) d = c[i].c > upper ? -1 : 1;
      else d = c[i].c < lower ? 1 : -1;
      const st = d === -1 ? lower : upper;
      line[i] = st; dir[i] = d; (d === -1 ? up : dn)[i] = st;
      pu = upper; pl = lower; pst = st;
    }
    return {line, dir, up, dn};
  }

  /* Cruces entre dos series: +1 cuando `a` cruza por encima de `b`, −1 por debajo, 0 en el resto. */
  function crosses(a, b) {
    const out = new Array(a.length).fill(0);
    for (let i = 1; i < a.length; i++) {
      if (a[i] == null || b[i] == null || a[i - 1] == null || b[i - 1] == null) continue;
      if (a[i - 1] <= b[i - 1] && a[i] > b[i]) out[i] = 1;
      else if (a[i - 1] >= b[i - 1] && a[i] < b[i]) out[i] = -1;
    }
    return out;
  }

  /* Nova Nexus · Smooth Trail: trailing stop suave (EMA ± ATR) con tendencia tipo supertrend y suavizado extra.
     Port de las líneas 1964-2008 del Pine: la tendencia solo cambia al romper la banda contraria. */
  function smoothTrail(c, len = 30, atrLen = 20, mult = 2, smooth = 2) {
    const n = c.length, basis = ema(c.map(x => x.c), len), a = atr(c, atrLen), trend = new Array(n).fill(0), raw = blank(n);
    let tr = 0;
    for (let i = 0; i < n; i++) {
      if (basis[i] != null && a[i] != null) {
        const up = basis[i] + a[i] * mult, lo = basis[i] - a[i] * mult;
        tr = c[i].c > up ? 1 : c[i].c < lo ? -1 : tr;
        raw[i] = tr === 1 ? lo : up;
      }
      trend[i] = tr;
    }
    return {trail: ema(raw, smooth), basis, trend};
  }

  /* Nova Nexus · Reversal Bands: SMA(len) ± k·ATR(len) con k = 6, 7 y 8 (la 9 está comentada en el Pine). */
  function reversalBands(c, len = 70, sens = [6, 7, 8]) {
    const basis = sma(c.map(x => x.c), len), a = atr(c, len);
    const mk = sg => basis.map((b, i) => b != null && a[i] != null ? b + sg * a[i] : null);
    return {basis, up: sens.map(k => mk(k)), dn: sens.map(k => mk(-k))};
  }

  /* Pivotes (ta.pivothigh / ta.pivotlow): la barra central es pivote si ninguna barra de la ventana [i−len, i+len]
     la supera (empates permitidos). El pivote se confirma len barras después (índice del centro = i − len). */
  function pivotAt(c, i, len, isHigh) {
    const k = i - len; if (k - len < 0) return null;
    const v = isHigh ? c[k].h : c[k].l;
    for (let j = k - len; j <= i; j++) if (isHigh ? c[j].h > v : c[j].l < v) return null;
    return v;
  }

  /* Nova Nexus · Soporte y Resistencia — port de "Breaks and Retests [HG]" © HoanGhetti (MPL 2.0), líneas 3144-3342 del Pine.
     Opciones fijas del Pine por defecto: lookback 20, barras desde el breakout 2, limitador de retest 2, modo "Repainting: On".
     Devuelve cajas (con su borde derecho final) y etiquetas Break / Potential Retest / Retest, todo en índices de vela. */
  function supportResistance(c, o = {}) {
    const bb = o.lookback || 20, retSince = o.retSince || 2, retLimit = o.retValid || 2, n = c.length;
    const boxes = [], labels = [];
    let plv = null, phv = null, sBox = null, rBox = null, sBreak = false, rBreak = false, bsS = null, bsR = null;
    let sBotPrev = null, rTopPrev = null;
    const mkSide = ph => ({ph, activePrev: false, lastY2: null, lastY1: null, bs: null, occurred: false, arr: []});
    const rRet = mkSide(true), sRet = mkSide(false);
    const retest = (st, i, c1, c2, c3, c4, y1, y2, newLevel, prevBox, sideName) => {
      const active = c1 || c2 || c3 || c4, ev0 = active && !st.activePrev;
      if (ev0) st.lastY2 = y2(i);
      let ev = ev0;
      if (st.lastY2 != null && (st.ph ? y2(i) < st.lastY2 : y2(i) > st.lastY2)) ev = active;
      if (ev) st.lastY1 = y1(i);
      st.bs = ev ? 0 : st.bs == null ? null : st.bs + 1;
      if (ev) {
        st.occurred = false;
        const lb = {i, price: y2(i), text: 'Potential Retest', kind: 'pot', side: sideName, deleted: false};
        labels.push(lb); st.arr.push(lb);
        if (st.arr.length === 2) { st.arr[0].deleted = true; st.arr.shift(); }
      }
      const conds = st.lastY1 != null && (st.ph ? c[i].c >= st.lastY1 : c[i].c <= st.lastY1);
      const valid = st.bs != null && st.bs > 0 && st.bs <= retLimit && conds && !st.occurred;
      if (valid) { labels.push({i: i - st.bs, price: y2(i - st.bs), text: 'Retest', kind: 're', side: sideName, deleted: false}); st.occurred = true; }
      if ((valid || (st.bs != null && st.bs > retLimit)) && st.arr.length > 0) st.arr[0].deleted = true;
      if (newLevel && st.occurred && prevBox) { prevBox.right = i - st.bs; st.occurred = false; }
      st.activePrev = active;
    };
    for (let i = 0; i < n; i++) {
      const cl = c[i].c, pl = pivotAt(c, i, bb, false), ph = pivotAt(c, i, bb, true);
      const prevS = sBox, prevR = rBox; let newS = false, newR = false;
      if (pl != null) { newS = plv != null && pl !== plv; plv = pl; }
      if (ph != null) { newR = phv != null && ph !== phv; phv = ph; }
      if (newS) { // caja de soporte: de la mínima del pivote a la menor de las mínimas vecinas
        if (sBox) sBox.right = i - bb;
        sBox = {kind: 'sup', left: i - bb, right: i, top: Math.min(c[i - bb - 1].l, c[i - bb + 1].l), bot: plv, deleted: false}; boxes.push(sBox);
      }
      if (newR) {
        if (rBox) rBox.right = i - bb;
        rBox = {kind: 'res', left: i - bb, right: i, top: phv, bot: Math.max(c[i - bb - 1].h, c[i - bb + 1].h), deleted: false}; boxes.push(rBox);
      }
      const sTop = sBox ? sBox.top : null, sBot = sBox ? sBox.bot : null, rTop = rBox ? rBox.top : null, rBot = rBox ? rBox.bot : null;
      // breakouts (solo el primer caso que se cumple en la barra, como el `switch` del Pine)
      const cu = sBox != null && cl < sBot && sBotPrev != null && i > 0 && c[i - 1].c >= sBotPrev;
      const co = rBox != null && cl > rTop && rTopPrev != null && i > 0 && c[i - 1].c <= rTopPrev;
      if (cu && !sBreak) { sBreak = true; labels.push({i, price: sBot, text: 'Break', kind: 'brk', side: 'sup', deleted: false}); }
      else if (co && !rBreak) { rBreak = true; labels.push({i, price: rTop, text: 'Break', kind: 'brk', side: 'res', deleted: false}); }
      if (newS) { if (!sBreak && prevS) prevS.deleted = true; sBreak = false; }
      if (newR) { if (!rBreak && prevR) prevR.deleted = true; rBreak = false; }
      bsS = !sBreak ? 0 : bsS == null ? null : bsS + 1; bsR = !rBreak ? 0 : bsR == null ? null : bsR + 1;
      const okS = bsS != null && bsS > retSince, okR = bsR != null && bsR > retSince, h = c[i].h, l = c[i].l;
      const s1 = okS && sTop != null && h >= sTop && cl <= sBot, s2 = okS && sTop != null && h >= sTop && cl >= sBot && cl <= sTop;
      const s3 = okS && sTop != null && h >= sBot && h <= sTop, s4 = okS && sTop != null && h >= sBot && h <= sTop && cl < sBot;
      const r1 = okR && rTop != null && l <= rBot && cl >= rTop, r2 = okR && rTop != null && l <= rBot && cl <= rTop && cl >= rBot;
      const r3 = okR && rTop != null && l <= rTop && l >= rBot, r4 = okR && rTop != null && l <= rTop && l >= rBot && cl > rTop;
      retest(rRet, i, r1, r2, r3, r4, j => c[j].h, j => c[j].l, newR, prevR, 'res');
      retest(sRet, i, s1, s2, s3, s4, j => c[j].l, j => c[j].h, newS, prevS, 'sup');
      sBotPrev = sBot; rTopPrev = rTop;
    }
    if (sBox) sBox.right = n - 1 + 5; if (rBox) rBox.right = n - 1 + 5; // updateBox: la caja vigente se extiende 5 barras
    return {boxes: boxes.filter(b => !b.deleted), labels: labels.filter(l => !l.deleted)};
  }

  /* Nova Nexus · Pivots (High/Low & Missed, estilo LuxAlgo) — port de las líneas 2009-2262 del Pine, longitud 50.
     Solo se portan los elementos que el Pine dibuja: zigzag entre pivotes (sólido o discontinuo), pivotes "perdidos"
     (discontinuo), niveles fantasma (ancho 2) y la proyección de la última barra. Las etiquetas del Pine están
     anuladas (`na`) en el script, así que no existen. Todo en índices de vela.
     col: 'miss_pl' | 'miss_ph' (zigzag, nombres tal cual el Pine) · 'ghost_pl' | 'ghost_ph' (niveles) · 'proj_h' | 'proj_l'. */
  function pivots(c, len = 50) {
    const n = c.length, lines = [];
    let max = null, min = null, fMax = null, fMin = null, maxX1 = null, minX1 = null, fMaxX1 = null, fMinX1 = null, os = 0, py1 = null, px1 = null, ghost = null;
    let pMax = null, pMin = null, pFMax = null, pFMin = null, pGhost = null;
    const L = (x1, y1, x2, y2, col, dash, width = 1) => { const l = {x1, y1, x2, y2, col, dash, width}; lines.push(l); return l; };
    const newGhost = (col) => { ghost = L(px1, py1, px1, py1, col, false, 2); };
    for (let i = 0; i < n; i++) {
      const ph = pivotAt(c, i, len, true), pl = pivotAt(c, i, len, false), prevOs = os, hb = i - len >= 0 ? c[i - len].h : null, lb = i - len >= 0 ? c[i - len].l : null;
      if (i === len) { max = c[0].h; min = c[0].l; fMax = c[0].h; fMin = c[0].l; px1 = 0; py1 = c[0].c; }
      if (hb != null) { max = max == null ? hb : Math.max(hb, max); min = min == null ? lb : Math.min(lb, min); fMax = fMax == null ? hb : Math.max(hb, fMax); fMin = fMin == null ? lb : Math.min(lb, fMin); }
      if (max != null && pMax != null && max > pMax) { maxX1 = i - len; fMin = lb; }
      if (min != null && pMin != null && min < pMin) { minX1 = i - len; fMax = hb; }
      if (fMin != null && pFMin != null && fMin < pFMin) fMinX1 = i - len;
      if (fMax != null && pFMax != null && fMax > pFMax) fMaxX1 = i - len;
      if (pGhost) pGhost.x2 = i; // el nivel fantasma vigente se alarga hasta la barra actual
      const missJump = (toX, toY, col, ghostCol) => { // línea discontinua al extremo "perdido" + nuevo nivel fantasma
        L(px1, py1, toX, toY, col, true); px1 = toX; py1 = toY;
        if (pGhost) pGhost.x2 = px1; newGhost(ghostCol);
      };
      if (ph != null) {
        if (prevOs === 1) { if (minX1 != null && min != null) missJump(minX1, min, 'miss_ph', 'ghost_pl'); }
        else if (ph < max) {
          if (maxX1 != null && max != null) missJump(maxX1, max, 'miss_pl', 'ghost_ph');
          if (fMinX1 != null && fMin != null) { L(px1, py1, fMinX1, fMin, 'miss_ph', true); px1 = fMinX1; py1 = fMin; if (ghost) ghost.x2 = px1; newGhost('ghost_pl'); }
        }
        L(px1, py1, i - len, ph, 'miss_pl', ph < max || prevOs === 1);
        py1 = ph; px1 = i - len; os = 1; max = ph; min = ph;
      }
      if (pl != null) {
        if (prevOs === 0) { if (maxX1 != null && max != null) missJump(maxX1, max, 'miss_pl', 'ghost_ph'); }
        else if (pl > min) {
          if (minX1 != null && min != null) missJump(minX1, min, 'miss_ph', 'ghost_pl');
          if (fMaxX1 != null && fMax != null) { L(px1, py1, fMaxX1, fMax, 'miss_pl', true); px1 = fMaxX1; py1 = fMax; if (ghost) ghost.x2 = px1; newGhost('ghost_ph'); }
        }
        L(px1, py1, i - len, pl, 'miss_ph', pl > min || prevOs === 0);
        py1 = pl; px1 = i - len; os = 0; max = pl; min = pl;
      }
      pMax = max; pMin = min; pFMax = fMax; pFMin = fMin; pGhost = ghost;
    }
    // última barra: candidato "perdido" (extremo desde el último pivote) y su proyección
    if (px1 != null && py1 != null && n > 0) {
      const last = n - 1, count = Math.max(0, Math.min(last - px1 - 1, 500));
      let y = null, x = null;
      for (let k = 0; k <= count; k++) { const v = os === 1 ? c[last - k].l : c[last - k].h; if (y == null || (os === 1 ? v < y : v > y)) { y = v; x = last - k; } }
      if (x != null) { L(px1, py1, x, y, os === 1 ? 'miss_ph' : 'miss_pl', true); L(x, y, last, y, os === 1 ? 'proj_h' : 'proj_l', false, 2); }
    }
    return {lines};
  }

  /* Nova Nexus · Liquidaciones — port de las líneas 2602-2760 del Pine.
     Para cada apalancamiento (5x, 10x, 25x, 50x, 100x) se traza, en cada pivote (3 barras a cada lado; 2 en 1d/1w/1M),
     un nivel de liquidación: pivote bajo → low/(1+riesgo) (liquidación de largos), pivote alto → high·(1+riesgo) (de cortos).
     Solo se crea si el volumen "pasa el filtro" del apalancamiento: avg = (máx+mín del volumen en `lookback` barras)/2 frente
     a su SMA(lookback+10): 5x avg>media · 10x ≥1.025× · 25x ≥1.05× · 50x ≥1.1× · 100x ≥1.2×.
     La línea nace en la barra del pivote y se alarga cada barra mientras la vela NO contenga el nivel (high>y y low<y);
     al primer cruce deja de alargarse. Máximo 500 líneas por apalancamiento. Solo cuenta desde `after` (2023-01-01 UTC por defecto).
     Suposición: timestamp("2023-01-01") sin zona horaria se toma como UTC. */
  const LIQ_AFTER = Date.UTC(2023, 0, 1);
  const LIQ_SPEC = [
    {lev: 5, risk: .20, ok: (a, m) => a > m}, {lev: 10, risk: .10, ok: (a, m) => a >= 1.025 * m},
    {lev: 25, risk: .04, ok: (a, m) => a >= 1.05 * m}, {lev: 50, risk: .02, ok: (a, m) => a >= 1.1 * m}, {lev: 100, risk: .01, ok: (a, m) => a >= 1.2 * m}];
  function liquidations(c, intervalMs, o = {}) {
    const N = o.lookback || 40, M = N + 10, P = intervalMs >= 864e5 ? 2 : 3, n = c.length, after = o.after == null ? LIQ_AFTER : o.after;
    const avg = blank(n), mean = blank(n);
    for (let i = N - 1; i < n; i++) { let hi = -Infinity, lo = Infinity; for (let k = 0; k < N; k++) { const v = c[i - k].v; if (v > hi) hi = v; if (v < lo) lo = v; } avg[i] = (hi + lo) / 2; }
    for (let i = N - 1 + M - 1; i < n; i++) { let t = 0; for (let k = 0; k < M; k++) t += avg[i - k]; mean[i] = t / M; } // con algún na en la ventana, ta.sma da na
    const levels = LIQ_SPEC.map(sp => ({lev: sp.lev, risk: sp.risk, lines: []}));
    for (let i = 0; i < n; i++) {
      if (!(after < c[i].t)) continue;
      const pl = pivotAt(c, i, P, false), ph = pivotAt(c, i, P, true);
      LIQ_SPEC.forEach((sp, li) => {
        const arr = levels[li].lines, flag = avg[i] != null && mean[i] != null && sp.ok(avg[i], mean[i]);
        const push = ln => { if (arr.length === 500) arr.shift(); arr.push(ln); };
        if (pl != null && flag) push({x1: i - P, x2: i, y: pl / (1 + sp.risk), side: 'dn'});
        if (ph != null && flag) push({x1: i - P, x2: i, y: ph * (1 + sp.risk), side: 'up'});
        for (let k = arr.length - 1; k >= 0; k--) { const l = arr[k]; if (i - 1 === l.x2 && !(c[i].h > l.y && c[i].l < l.y)) l.x2 = i; }
      });
    }
    return {levels, after};
  }

  /* Nova Nexus · Volume Profile (con detección de nodos) — port de las líneas 2282-2600 del Pine, configuración por defecto:
     fuente Volumen, 25 filas, últimas 200 velas (199 si hay más historial: `rpLN := last_bar_index > rpLN ? rpLN-1 : last_bar_index`),
     umbral de nodos altos 53 % y bajos 37 %, perfil de sentimiento por polaridad de vela (cierre > apertura), POC «Last(Zone)», tema Default.
     Reparto del volumen de cada vela entre las filas que toca, proporcional al rango de precio que cubre (las 4 ramas de `vPOR` del Pine).
     Como en el Pine, solo se dibuja si la última vela tiene volumen > 0. Colores: [r, g, b, alfa] con la interpolación lineal de color.from_gradient. */
  const VP = {HVC: [255, 235, 59, .5], AVC: [41, 98, 255, .5], LVC: [242, 54, 69, .5], BLC: [38, 166, 154], BRC: [239, 83, 80]};
  function gradient(v, lo, hi, c1, c2) {
    const t = hi === lo ? 1 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    return c1.map((x, i) => x + (c2[i] - x) * t);
  }
  function volumeProfile(c, o = {}) {
    const R = o.rows || 25, n = c.length, last = n - 1; if (n < 2) return null;
    const hiT = (o.hiThr == null ? 53 : o.hiThr) / 100, loT = (o.loThr == null ? 37 : o.loThr) / 100;
    let ln = o.lookback || 200; ln = last > ln ? ln - 1 : last;
    if (ln <= 0 || !(c[last].v > 0)) return null;
    const from = last - ln; let lo = c[from].l, hi = c[from].h;
    for (let i = from + 1; i <= last; i++) { if (c[i].l < lo) lo = c[i].l; if (c[i].h > hi) hi = c[i].h; }
    const step = (hi - lo) / R; if (!(step > 0)) return null;
    const vst = new Array(R).fill(0), vsb = new Array(R).fill(0);
    for (let bi = ln; bi >= 0; bi--) {
      const b = c[last - bi], v = b.v || 0, bull = b.c > b.o;
      for (let l = 0; l < R; l++) {
        const pl = lo + l * step;
        if (b.h >= pl && b.l < pl + step) {
          const por = b.l >= pl && b.h > pl + step ? (pl + step - b.l) / (b.h - b.l)
            : b.h <= pl + step && b.l < pl ? (b.h - pl) / (b.h - b.l)
            : b.l >= pl && b.h <= pl + step ? 1 : step / (b.h - b.l);
          vst[l] += v * por; if (bull) vsb[l] += v * por;
        }
      }
    }
    const total = vst.reduce((a, b) => a + b, 0), maxV = Math.max(...vst); if (!(maxV > 0)) return null;
    const poc = vst.indexOf(maxV), bbps = vst.map((t, l) => 2 * vsb[l] - t), maxD = Math.max(...bbps.map(Math.abs));
    const rows = vst.map((vol, l) => {
      const bot = lo + l * step, center = lo + (l + .5) * step, lpm = vol / maxV, bbp = bbps[l], dpm = maxD > 0 ? Math.abs(bbp) / maxD : 0;
      const vcol = lpm > hiT ? gradient(lpm, hiT, 1, VP.AVC, VP.HVC) : gradient(lpm, 0, loT, VP.LVC, VP.AVC);
      const sb = bbp > 0 ? VP.BLC : VP.BRC; // transparencias 88 → 48 (70 + int(73/4) → 30 + int(73/4)) del Pine
      return {l, bot, top: bot + step, center, vol, bull: vsb[l], bbp, lpm, dpm, vcol, scol: maxD > 0 ? gradient(dpm, 0, .7, [...sb, .12], [...sb, .52]) : null,
        quote: vol * center, pct: Math.abs(vol / total * 100), bpct: vol ? Math.abs(bbp / vol * 100) : 0};
    });
    return {from, to: last, ln, lo, hi, step, rows, poc, pocPrice: lo + (poc + .5) * step, pocBot: lo + poc * step, pocTop: lo + (poc + 1) * step, total, colors: VP};
  }

  root.CCTIndicators = {volumeProfile, gradient, liquidations, LIQ_AFTER, pivots, pivotAt, supportResistance, smoothTrail, reversalBands, wma, sma, ema, rma, atr, trueRange, vwap, macd, stoch, obv, supertrend, crosses};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CCTIndicators;
})(typeof window !== 'undefined' ? window : globalThis);
