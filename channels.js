/* Canales dinámicos de VORTEX — funciones puras, sin DOM (se prueban con Node: tests/channels.test.js).
   Para cada escala (pivotes de len, 2·len, 4·len velas) toma los dos últimos máximos y mínimos confirmados y arma el canal que se está formando:
   la línea que pasa por los dos últimos pivotes más recientes de un lado y su paralela por el extremo contrario. Se recalcula con cada vela:
   si el precio rompe el canal por más de `brk` × ATR, ese canal se descarta y aparece el siguiente.
   Cada canal: {k (escala), dir (+1 sube, -1 baja, 0 lateral), i1, i2, up{p1,p2}, lo{p1,p2}, mid{p1,p2}, width, anchors[{i,p}]}; los precios son los de la línea en i1 e i2. */
(function (root) {
  'use strict';
  const abs = Math.abs, max = Math.max, min = Math.min;

  function atr(c, n = 14) {
    let prev = null;
    for (let i = 0; i < c.length; i++) { const tr = i ? max(c[i].h - c[i].l, abs(c[i].h - c[i - 1].c), abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; prev = prev == null ? tr : (prev * (n - 1) + tr) / n; }
    return prev || 0;
  }
  function pivots(c, L) {
    const hi = [], lo = [];
    for (let i = L; i < c.length - L; i++) {
      let h = true, l = true;
      for (let j = 1; j <= L && (h || l); j++) {
        if (c[i - j].h > c[i].h || c[i + j].h >= c[i].h) h = false;
        if (c[i - j].l < c[i].l || c[i + j].l <= c[i].l) l = false;
      }
      if (h) hi.push({i, p: c[i].h}); if (l) lo.push({i, p: c[i].l});
    }
    return {hi, lo};
  }

  function one(c, L, o, A) {
    const n = c.length, {hi, lo} = pivots(c, L); if (hi.length < 2 || lo.length < 2) return null;
    const H1 = hi[hi.length - 2], H2 = hi[hi.length - 1], L1 = lo[lo.length - 2], L2 = lo[lo.length - 1];
    const byHigh = H2.i >= L2.i; // el lado cuyo último pivote es más reciente manda la pendiente
    const P1 = byHigh ? H1 : L1, P2 = byHigh ? H2 : L2; if (P2.i - P1.i < max(3, L)) return null;
    const slope = (P2.p - P1.p) / (P2.i - P1.i), line = i => P1.p + slope * (i - P1.i), i1 = P1.i, i2 = n - 1;
    // la paralela pasa por el extremo contrario dentro del tramo: así el canal contiene a las velas
    let off = byHigh ? Infinity : -Infinity;
    for (let i = i1; i < n - 1; i++) { const d = byHigh ? c[i].l - line(i) : c[i].h - line(i); if (byHigh ? d < off : d > off) off = d; }
    const upA = byHigh ? line : i => line(i) + off, loA = byHigh ? i => line(i) + off : line, w = upA(i2) - loA(i2);
    if (!(w > A * o.minW)) return null; // demasiado estrecho para ser un canal útil
    const last = c[n - 1].c; if (last > upA(i2) + A * o.brk || last < loA(i2) - A * o.brk) return null; // roto: ya no es el canal vigente
    const tot = abs(slope) * (n - 1 - i1), dir = tot > A * o.flat ? Math.sign(slope) : 0;
    const seg = f => ({p1: f(i1), p2: f(i2)});
    return {k: 0, dir, i1, i2, up: seg(upA), lo: seg(loA), mid: seg(i => (upA(i) + loA(i)) / 2), width: w, anchors: [P1, P2]};
  }

  /* o: {len (5), count (1-3 escalas), brk (1.0 × ATR), minW (1.5 × ATR), flat (1.0 × ATR de recorrido para llamarlo lateral)} */
  function detect(c, o = {}) {
    const opt = {len: max(2, Math.round(o.len || 5)), count: min(3, max(1, Math.round(o.count || 2))), brk: o.brk == null ? 1 : o.brk, minW: o.minW == null ? 1.5 : o.minW, flat: o.flat == null ? 1 : o.flat};
    if (!c || c.length < opt.len * 4 + 5) return {list: []};
    const A = atr(c), list = [];
    for (let k = 0; k < opt.count; k++) {
      const q = one(c, opt.len * (1 << k), opt, A); if (!q) continue;
      q.k = k; if (list.some(r => abs(r.i1 - q.i1) < 3 && abs(r.up.p2 - q.up.p2) < A * .2 && abs(r.lo.p2 - q.lo.p2) < A * .2)) continue; list.push(q); // evita repetir el mismo canal
    }
    return {list};
  }

  const api = {detect, pivots};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CCTChannels = api;
})(typeof self !== 'undefined' ? self : this);
