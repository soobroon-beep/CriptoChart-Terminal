/* VORTEX · imagen de referencia de un script de Pine.
   Corre el script sobre velas de ejemplo (siempre las mismas, para que la imagen sea estable) y dibuja el resultado REAL con el mismo
   motor de dibujo del gráfico (pine-draw.js): líneas, rellenos, señales, cajas, tablas… Así cualquier indicador que subas tiene su imagen. */
(function (root) {
  'use strict';
  const W = 600, H = 260, SHOW = 90, WARM = 420; // tamaño de la imagen, velas visibles y velas de calentamiento para los indicadores

  /* Velas de ejemplo: caminata con tendencias, rangos y picos de volumen. Generador con semilla fija (siempre igual). */
  function sampleCandles(n = WARM + SHOW) {
    let s = 20241105; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const out = []; let p = 100, drift = 0;
    for (let i = 0; i < n; i++) {
      if (i % 37 === 0) drift = (rnd() - .5) * 1.1;
      const o = p, vol = 1.1 + Math.sin(i / 11) * .5 + rnd() * .9, c = o + drift + (rnd() - .5) * vol * 2.2 + Math.sin(i / 6) * .45;
      const h = Math.max(o, c) + rnd() * vol, l = Math.min(o, c) - rnd() * vol; p = c;
      out.push({t: Date.UTC(2024, 0, 1) + i * 36e5, o, h, l, c, v: 800 + rnd() * 1800 + Math.abs(c - o) * 900});
    }
    return out;
  }

  /* Dibuja el resultado `res` (CCTPine.run) en un canvas y devuelve la imagen como data URL (WebP/PNG pequeña). */
  function render(res, cs, o0) {
    const o = Object.assign({title: (res && res.meta && res.meta.title) || 'Script', scale: 2}, o0 || {});
    const cv = document.createElement('canvas'); cv.width = W * o.scale; cv.height = H * o.scale;
    const g = cv.getContext('2d'); g.scale(o.scale, o.scale);
    g.fillStyle = '#0b0e14'; g.fillRect(0, 0, W, H);
    const N = cs.length, hi = N, lo = Math.max(0, N - SHOW), left = 8, right = W - 8, top = 26, bottom = H - 10, step = (right - left) / (hi - lo);
    const X = i => left + (i - lo + .5) * step;
    const overlay = !!(res.meta && res.meta.overlay);
    let mn = Infinity, mx = -Infinity;
    if (overlay) {
      for (let i = lo; i < hi; i++) { mn = Math.min(mn, cs[i].l); mx = Math.max(mx, cs[i].h); }
      const c = CCTPineDraw.contrib(res, lo, hi, mn, mx); if (Number.isFinite(c.min)) { mn = Math.min(mn, c.min); mx = Math.max(mx, c.max); }
    } else {
      const r = CCTPineDraw.range(res, lo, hi); if (r) { mn = r.min; mx = r.max; }
    }
    if (!Number.isFinite(mn) || mn === mx) { mn = 0; mx = 1; }
    const pad = (mx - mn) * .08; mn -= pad; mx += pad;
    const Y = v => bottom - (v - mn) / (mx - mn) * (bottom - top);
    // cuadrícula suave
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
    for (let k = 1; k < 5; k++) { const y = top + (bottom - top) * k / 5; g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke(); }
    // velas del gráfico (solo si el script va sobre el precio)
    if (overlay) {
      const w = Math.max(1.5, step * .62);
      for (let i = lo; i < hi; i++) { const k = cs[i], up = k.c >= k.o, col = up ? '#26a69a' : '#ef5350'; g.strokeStyle = col; g.fillStyle = col; g.beginPath(); g.moveTo(X(i), Y(k.h)); g.lineTo(X(i), Y(k.l)); g.stroke(); g.fillRect(X(i) - w / 2, Y(Math.max(k.o, k.c)), w, Math.max(1, Math.abs(Y(k.o) - Y(k.c)))); }
    }
    try { CCTPineDraw.draw(g, res, {X, Y, lo, hi, left, right, top, bottom, step, candles: cs, overlay}); } catch (e) { /* una pieza que no se pueda dibujar no debe tumbar la imagen */ }
    // título (como la leyenda del gráfico)
    g.fillStyle = 'rgba(255,255,255,.88)'; g.font = '600 12px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(String(o.title).slice(0, 52), 10, 17);
    const url = cv.toDataURL('image/webp', .82);
    return url.startsWith('data:image/webp') ? url : cv.toDataURL('image/png');
  }
  root.CCTPinePreview = {sampleCandles, render, W, H};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CCTPinePreview;
})(typeof window !== 'undefined' ? window : globalThis);
