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

  root.CCTIndicators = {pivotAt, supportResistance, smoothTrail, reversalBands, wma, sma, ema, rma, atr, trueRange, vwap, macd, stoch, obv, supertrend, crosses};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CCTIndicators;
})(typeof window !== 'undefined' ? window : globalThis);
