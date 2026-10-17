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

  root.CCTIndicators = {wma, sma, ema, rma, atr, trueRange, vwap, macd, stoch, obv, supertrend, crosses};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CCTIndicators;
})(typeof window !== 'undefined' ? window : globalThis);
