/* Patrones de VORTEX — funciones puras, sin DOM (se prueban con Node: tests/patterns.test.js).
   Detecta sobre las velas, con un zigzag de pivotes (fractales de `len` velas a cada lado y un movimiento mínimo de `dev` × ATR):
     · 1-2-3 (reversión)            · ABC (corrección en zigzag)
     · Armónicos: ABCD, Gartley, Bat, Butterfly, Crab, Cypher (con zona de reversión PRZ cuando el patrón se está formando)
     · Chartistas: doble techo/suelo, hombro-cabeza-hombro (y su inverso), triángulos y cuñas
     · Ondas de Elliott: impulso 0-1-2-3-4-5 (completo o 0-4 con el objetivo de la onda 5)
   Son reglas geométricas con tolerancia, no una promesa de que el patrón «funcione»: la puntuación (0-100) dice cuánto se acercan las proporciones a las ideales.
   Cada patrón devuelve: {kind, name, dir (+1 alcista, -1 bajista, 0 neutro), status ('forming' | 'confirmed' | 'complete'), score, pts[{i,p,t}], last, y extras opcionales:
   prz{lo,hi}, neck{i1,p1,i2,p2}, lines[{i1,p1,i2,p2}], target, stop, tip}. */
(function (root) {
  'use strict';
  const abs = Math.abs, max = Math.max, min = Math.min;

  function atrArr(c, n = 14) {
    const out = new Array(c.length).fill(0); let prev = null;
    for (let i = 0; i < c.length; i++) {
      const tr = i ? max(c[i].h - c[i].l, abs(c[i].h - c[i - 1].c), abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l;
      prev = prev == null ? tr : (prev * (n - 1) + tr) / n; out[i] = prev;
    }
    return out;
  }

  /* Zigzag: pivotes alternados alto/bajo. Un pivote se confirma con `len` velas a cada lado; el último tramo (sin confirmar) se añade como pivote provisional `prov`.
     Los movimientos menores que dev × ATR se ignoran. */
  function zigzag(c, o = {}) {
    const L = max(2, Math.round(o.len || 5)), dev = o.dev == null ? 1.5 : o.dev, n = c.length, A = atrArr(c), raw = [];
    for (let i = L; i < n - L; i++) {
      let hi = true, lo = true;
      for (let j = 1; j <= L && (hi || lo); j++) {
        if (c[i - j].h > c[i].h || c[i + j].h >= c[i].h) hi = false;
        if (c[i - j].l < c[i].l || c[i + j].l <= c[i].l) lo = false;
      }
      if (hi && !lo) raw.push({i, p: c[i].h, hi: true}); else if (lo && !hi) raw.push({i, p: c[i].l, hi: false});
    }
    const z = [];
    for (const q of raw) {
      const l = z[z.length - 1];
      if (!l) { z.push(q); continue; }
      if (l.hi === q.hi) { if (q.hi ? q.p > l.p : q.p < l.p) z[z.length - 1] = q; continue; }
      if ((q.hi ? q.p <= l.p : q.p >= l.p) || abs(q.p - l.p) < dev * A[q.i]) continue;
      z.push(q);
    }
    if (z.length && n > 1) { // tramo en curso
      let l = z[z.length - 1], k = l.i, ex = l.p, exi = k;
      for (let i = k + 1; i < n; i++) { const v = l.hi ? c[i].h : c[i].l; if (l.hi ? v > ex : v < ex) { ex = v; exi = i; } }
      if (exi > k) { l = z[z.length - 1] = {i: exi, p: ex, hi: l.hi, prov: true}; k = exi; }
      let oe = null, oi = -1;
      for (let i = k + 1; i < n; i++) { const v = l.hi ? c[i].l : c[i].h; if (oe == null || (l.hi ? v < oe : v > oe)) { oe = v; oi = i; } }
      if (oi > k && abs(oe - l.p) >= dev * A[n - 1]) z.push({i: oi, p: oe, hi: !l.hi, prov: true});
    }
    return z;
  }

  /* closeness: 1 dentro del rango [lo,hi]; baja linealmente hasta 0 cuando se aleja `tol` (fracción) del borde. */
  const cl = (v, r, tol) => { if (!(v > 0)) return 0; if (v >= r[0] && v <= r[1]) return 1; const d = v < r[0] ? (r[0] - v) / r[0] : (v - r[1]) / r[1]; return d >= tol ? 0 : 1 - d / tol; };
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const pt = (q, t) => ({i: q.i, p: q.p, t, hi: !!q.hi});
  const lastI = pts => pts.reduce((m, q) => max(m, q.i), 0);

  /* ── Armónicos ── */
  const HARM = [
    {n: 'Gartley', b: [.618, .618], c: [.382, .886], d: [.786, .786], cd: [1.13, 1.618]},
    {n: 'Bat', b: [.382, .5], c: [.382, .886], d: [.886, .886], cd: [1.618, 2.618]},
    {n: 'Butterfly', b: [.786, .786], c: [.382, .886], d: [1.27, 1.618], cd: [1.618, 2.24]},
    {n: 'Crab', b: [.382, .618], c: [.382, .886], d: [1.618, 1.618], cd: [2.24, 3.618]},
    {n: 'Cypher', b: [.382, .618], c: [1.13, 1.414], dxc: [.786, .786]}
  ];
  const side = mir => mir > 0 ? 'alcista' : 'bajista';
  /* Un patrón está «vivo» si su último punto es el último pivote o el anterior a un tramo provisional (el precio ya se movió un poco desde ahí). */
  const isLive = (s, j) => j === s.length - 1 || (j === s.length - 2 && !!s[s.length - 1].prov);

  function harmonic(s, j, o, closeNow) { // XABCD completo: s[j-4..j]
    if (j < 4) return null;
    const [X, A, B, C, D] = s.slice(j - 4, j + 1), mir = X.hi ? -1 : 1, P = q => mir * q.p, x = P(X), a = P(A), b = P(B), c = P(C), d = P(D);
    const xa = a - x, ab = a - b, bc = c - b, cd = c - d, xc = c - x; if (!(xa > 0 && ab > 0 && bc > 0 && cd > 0)) return null;
    const rb = ab / xa, rc = bc / ab, rd = (a - d) / xa, rcd = cd / bc, rxc = xc > 0 ? cd / xc : -1; let best = null;
    for (const h of HARM) {
      const q = [cl(rb, h.b, o.tol), cl(rc, h.c, o.tol)];
      if (h.dxc) q.push(cl(rxc, h.dxc, o.tol)); else q.push(cl(rd, h.d, o.tol), cl(rcd, h.cd, o.tol));
      if (q.some(v => v <= 0)) continue; const sc = mean(q) * 100;
      if (!best || sc > best.score) best = {kind: 'harm', name: `${h.n} ${side(mir)}`, dir: mir, status: D.prov ? 'forming' : 'complete', score: sc, pts: [pt(X, 'X'), pt(A, 'A'), pt(B, 'B'), pt(C, 'C'), pt(D, 'D')], tip: `D al ${(h.dxc ? rxc : rd) .toFixed(3)} · BC/AB ${rc.toFixed(3)}`};
    }
    return best;
  }
  function abcd(s, j, o) { // ABCD: A,B,C,D = s[j-3..j]
    if (j < 3) return null;
    const [A, B, C, D] = s.slice(j - 3, j + 1), mir = A.hi ? -1 : 1, P = q => mir * q.p, a = P(A), b = P(B), c = P(C), d = P(D);
    const ab = a - b, bc = c - b, cd = c - d; if (!(ab < 0 || ab > 0)) return null;
    // en coordenadas espejadas el tramo AB baja: A alto, B bajo, C alto, D bajo
    if (!(ab > 0 && bc > 0 && cd > 0)) return null;
    const q = [cl(bc / ab, [.618, .786], o.tol), cl(cd / bc, [1.272, 1.618], o.tol), cl(cd / ab, [.9, 1.1], o.tol)]; if (q.some(v => v <= 0)) return null;
    return {kind: 'harm', name: `ABCD ${side(mir)}`, dir: mir, status: D.prov ? 'forming' : 'complete', score: mean(q) * 100, pts: [pt(A, 'A'), pt(B, 'B'), pt(C, 'C'), pt(D, 'D')], tip: `BC/AB ${(bc / ab).toFixed(3)} · CD/AB ${(cd / ab).toFixed(3)}`};
  }
  function harmonicForming(s, j, o, closeNow) { // XABC en formación: la D se proyecta
    if (j < 3 || !isLive(s, j)) return null;
    const [X, A, B, C] = s.slice(j - 3, j + 1), mir = X.hi ? -1 : 1, P = q => mir * q.p, x = P(X), a = P(A), b = P(B), c = P(C);
    const xa = a - x, ab = a - b, bc = c - b, xc = c - x; if (!(xa > 0 && ab > 0 && bc > 0)) return null;
    const rb = ab / xa, rc = bc / ab, now = mir * closeNow; let best = null;
    for (const h of HARM) {
      const q = [cl(rb, h.b, o.tol), cl(rc, h.c, o.tol)]; if (q.some(v => v <= 0)) continue;
      let lo, hi;
      if (h.dxc) { lo = c - h.dxc[1] * (1 + o.tol) * xc; hi = c - h.dxc[0] * (1 - o.tol) * xc; }
      else { lo = max(a - h.d[1] * (1 + o.tol) * xa, c - h.cd[1] * (1 + o.tol) * bc); hi = min(a - h.d[0] * (1 - o.tol) * xa, c - h.cd[0] * (1 - o.tol) * bc); }
      if (!(hi > lo) || hi >= c) continue;
      if (now < lo - .25 * (c - lo)) continue; // el precio ya se pasó de la zona: el patrón se invalidó
      const sc = mean(q) * 100 * .9;
      if (!best || sc > best.score) best = {kind: 'harm', name: `${h.n} ${side(mir)}`, dir: mir, status: 'forming', score: sc, pts: [pt(X, 'X'), pt(A, 'A'), pt(B, 'B'), pt(C, 'C')],
        prz: {lo: mir > 0 ? lo : -hi, hi: mir > 0 ? hi : -lo}, tip: 'D en formación: zona de reversión (PRZ)'};
    }
    return best;
  }

  /* ── 1-2-3 (reversión) ── */
  function p123(s, j, o, c) {
    if (j < 4) return null;
    const P3 = s[j], P2 = s[j - 1], P1 = s[j - 2], H0 = s[j - 3], L0 = s[j - 4], mir = P1.hi ? -1 : 1, m = q => mir * q.p;
    const p1 = m(P1), p2 = m(P2), p3 = m(P3), l0 = m(L0); if (!(p2 > p1 && p1 < l0 && p3 > p1 && p3 < p2 && m(H0) > p1)) return null; // P1 es un mínimo nuevo y P3 queda por encima
    const ret = (p2 - p3) / (p2 - p1), q = cl(ret, [.382, .886], o.tol); if (q <= 0) return null;
    let conf = false; for (let i = P3.i + 1; i < c.length; i++) { if ((mir > 0 ? c[i].l : -c[i].h) < p1) return null; if (mir * c[i].c > p2) conf = true; }
    if (!conf && !isLive(s, j)) return null;
    const target = mir * (p3 + (p2 - p1));
    return {kind: 'p123', name: `1-2-3 ${side(mir)}`, dir: mir, status: conf ? 'confirmed' : 'forming', score: q * 100, pts: [pt(P1, '1'), pt(P2, '2'), pt(P3, '3')],
      neck: {i1: P2.i, p1: P2.p, i2: c.length - 1, p2: P2.p}, target, stop: P1.p, tip: `Retroceso 3: ${(ret * 100).toFixed(0)} %`};
  }

  /* ── ABC (corrección en zigzag) ── */
  function abc(s, j, o) {
    if (j < 3) return null;
    const [S0, A, B, C] = s.slice(j - 3, j + 1), k = C.hi ? -1 : 1, V = q => k * q.p; // espejo: S0 alto, A bajo, B alto, C bajo (corrección a la baja)
    const sa = V(S0) - V(A); if (!(sa > 0 && V(B) > V(A) && V(C) < V(B))) return null;
    const rb = (V(B) - V(A)) / sa, ce = (V(B) - V(C)) / sa, q = [cl(rb, [.382, .886], o.tol), cl(ce, [.618, 1.618], o.tol)]; if (q.some(v => v <= 0)) return null;
    return {kind: 'abc', name: `ABC ${k > 0 ? 'alcista' : 'bajista'}`, dir: k, status: isLive(s, j) ? 'forming' : 'complete', score: mean(q) * 100,
      pts: [pt(S0, '0'), pt(A, 'A'), pt(B, 'B'), pt(C, 'C')], tip: `${k > 0 ? 'Corrección a la baja' : 'Corrección al alza'} · B ${(rb * 100).toFixed(0)} % de la onda A · C ${(ce * 100).toFixed(0)} %`};
  }

  /* ── Chartistas ── */
  function dbl(s, j, o, c, A) {
    if (j < 2) return null;
    const [H1, T, H2] = s.slice(j - 2, j + 1), top = H2.hi, m = q => (top ? 1 : -1) * q.p, h1 = m(H1), t = m(T), h2 = m(H2);
    const tolP = min(.8 * A[H2.i], .04 * abs(H2.p)), depth = ((h1 + h2) / 2) - t; if (!(tolP > 0) || abs(h1 - h2) > tolP || depth < 1.5 * A[H2.i] || H2.i - H1.i < 6) return null;
    let conf = false; for (let i = H2.i + 1; i < c.length; i++) if ((top ? 1 : -1) * c[i].c < t) { conf = true; break; }
    if (!conf && !isLive(s, j)) return null;
    const sc = 70 * (1 - abs(h1 - h2) / tolP) + 30 * min(1, depth / (3 * A[H2.i])), mir = top ? -1 : 1;
    return {kind: 'dbl', name: top ? 'Doble techo' : 'Doble suelo', dir: mir, status: conf ? 'confirmed' : 'forming', score: sc, pts: [pt(H1, '1'), pt(T, 'N'), pt(H2, '2')],
      neck: {i1: H1.i, p1: T.p, i2: c.length - 1, p2: T.p}, target: top ? T.p - depth : T.p + depth, stop: top ? max(H1.p, H2.p) : min(H1.p, H2.p), tip: 'Línea de cuello en el valle central'};
  }
  function hs(s, j, o, c, A) {
    if (j < 4) return null;
    const [LS, N1, H, N2, RS] = s.slice(j - 4, j + 1), top = H.hi, k = top ? 1 : -1, m = q => k * q.p, ls = m(LS), n1 = m(N1), h = m(H), n2 = m(N2), rs = m(RS);
    const ht = h - (n1 + n2) / 2; if (!(ht > 0) || h - max(ls, rs) < .5 * A[H.i] || abs(ls - rs) > .35 * ht || abs(n1 - n2) > .5 * ht || ls < max(n1, n2) || rs < max(n1, n2)) return null;
    const slope = (N2.p - N1.p) / (N2.i - N1.i), neckAt = i => N1.p + slope * (i - N1.i);
    let conf = false; for (let i = RS.i + 1; i < c.length; i++) if (k * c[i].c < k * neckAt(i)) { conf = true; break; }
    if (!conf && !isLive(s, j)) return null;
    const sc = 60 * (1 - abs(ls - rs) / (.35 * ht)) + 40 * (1 - abs(n1 - n2) / (.5 * ht));
    return {kind: 'hs', name: top ? 'Hombro-cabeza-hombro' : 'HCH invertido', dir: -k, status: conf ? 'confirmed' : 'forming', score: sc, pts: [pt(LS, 'HI'), pt(N1, ''), pt(H, 'C'), pt(N2, ''), pt(RS, 'HD')],
      neck: {i1: N1.i, p1: N1.p, i2: c.length - 1, p2: neckAt(c.length - 1)}, target: top ? neckAt(RS.i) - ht : neckAt(RS.i) + ht, stop: H.p, tip: 'Objetivo = altura de la cabeza desde la línea de cuello'};
  }
  function triangle(s, o, c, A) { // triángulos y cuñas con las últimas pivotes
    const n = c.length, tail = s.slice(-8), hiP = tail.filter(q => q.hi), loP = tail.filter(q => !q.hi); if (hiP.length < 2 || loP.length < 2) return null;
    const u1 = hiP[0], u2 = hiP[hiP.length - 1], l1 = loP[0], l2 = loP[loP.length - 1], i0 = min(u1.i, l1.i); if (n - 1 - i0 < 12) return null;
    const su = (u2.p - u1.p) / (u2.i - u1.i), sl = (l2.p - l1.p) / (l2.i - l1.i), up = i => u1.p + su * (i - u1.i), lw = i => l1.p + sl * (i - l1.i);
    const h0 = up(i0) - lw(i0), h1 = up(n - 1) - lw(n - 1); if (!(h0 > 0 && h1 > 0) || h1 > .85 * h0) return null; // tiene que converger
    const px = c[n - 1].c, pad = .3 * A[n - 1]; if (px > up(n - 1) + pad || px < lw(n - 1) - pad) return null; // el precio sigue dentro
    const span = n - 1 - i0, nu = su * span / h0, nl = sl * span / h0, F = .15, flat = v => abs(v) < F;
    let name, dir;
    if (flat(nu) && nl > F) { name = 'Triángulo ascendente'; dir = 1; }
    else if (flat(nl) && nu < -F) { name = 'Triángulo descendente'; dir = -1; }
    else if (nu < -F && nl > F) { name = 'Triángulo simétrico'; dir = 0; }
    else if (nu > F && nl > F) { name = 'Cuña ascendente'; dir = -1; }
    else if (nu < -F && nl < -F) { name = 'Cuña descendente'; dir = 1; }
    else return null;
    const touches = hiP.length + loP.length; if (touches < 5) return null;
    return {kind: 'tri', name, dir, status: 'forming', score: min(100, 60 + 10 * (touches - 5)), pts: [], last: n - 1,
      lines: [{i1: u1.i, p1: u1.p, i2: n - 1, p2: up(n - 1)}, {i1: l1.i, p1: l1.p, i2: n - 1, p2: lw(n - 1)}], tip: `${touches} toques en las líneas`};
  }

  /* ── Elliott ── */
  function elliott(s, j, o, A, partial) {
    const len = partial ? 5 : 6; if (j < len - 1 || (partial && !isLive(s, j))) return null;
    const w = s.slice(j - len + 1, j + 1), mir = w[0].hi ? -1 : 1, v = w.map(q => mir * q.p), [p0, p1, p2, p3, p4, p5] = v;
    const w1 = p1 - p0, w3 = p3 - p2; if (!(w1 > 0 && w3 > 0 && p2 > p0 && p3 > p1 && p4 > p1 && p4 < p3)) return null; // onda 2 no pasa del inicio, 4 no invade la 1
    let q, tgt = null;
    if (partial) {
      if (w3 < w1 && w3 < (p3 - p4)) return null;
      q = [cl((p1 - p2) / w1, [.382, .786], o.tol), cl(w3 / w1, [1, 2.618], o.tol), cl((p3 - p4) / w3, [.236, .5], o.tol)]; tgt = p4 + w1;
    } else {
      const w5 = p5 - p4; if (!(w5 > 0 && p5 > p4 && w3 >= min(w1, w5))) return null; // la 3 no es la más corta
      q = [cl((p1 - p2) / w1, [.382, .786], o.tol), cl(w3 / w1, [1, 2.618], o.tol), cl((p3 - p4) / w3, [.236, .5], o.tol), cl(w5 / w1, [.382, 1.618], o.tol)];
    }
    if (q.some(x => x <= 0)) return null;
    const labels = ['0', '1', '2', '3', '4', '5'], sd = mir > 0;
    return {kind: 'ell', name: `Impulso Elliott ${side(mir)}`, dir: mir, status: partial ? 'forming' : 'complete', score: mean(q) * 100, pts: w.map((x, k) => pt(x, labels[k])),
      target: partial ? mir * tgt : undefined, tip: partial ? 'Onda 5 proyectada = longitud de la onda 1' : (sd ? 'Posible corrección ABC a la baja' : 'Posible corrección ABC al alza')};
  }

  /* Punto de entrada. o: {len, dev, tol, min, max, keep, p123, abc, harm, chart, ell} (los grupos se activan salvo que sean `false`). */
  function detect(c, o = {}) {
    const n = c ? c.length : 0, opt = {len: o.len || 5, dev: o.dev == null ? 1.5 : o.dev, tol: o.tol == null ? .1 : o.tol, min: o.min == null ? 60 : o.min, max: o.max || 3, keep: o.keep || 200};
    if (n < 40) return {list: [], pivots: []};
    const s = zigzag(c, opt), A = atrArr(c), out = [], now = c[n - 1].c, on = k => o[k] !== false, push = p => { if (p && p.score >= opt.min) { p.last = p.last == null ? lastI(p.pts) : p.last; out.push(p); } };
    const from = max(2, s.length - 30);
    for (let j = from; j < s.length; j++) {
      if (on('harm')) { push(harmonic(s, j, opt, now)); push(abcd(s, j, opt)); }
      if (on('p123')) push(p123(s, j, opt, c));
      if (on('abc')) push(abc(s, j, opt));
      if (on('chart')) { push(dbl(s, j, opt, c, A)); push(hs(s, j, opt, c, A)); }
      if (on('ell')) push(elliott(s, j, opt, A, false));
    }
    if (s.length > 3) {
      if (on('harm')) { push(harmonicForming(s, s.length - 1, opt, now)); push(harmonicForming(s, s.length - 2, opt, now)); }
      if (on('ell')) { push(elliott(s, s.length - 1, opt, A, true)); push(elliott(s, s.length - 2, opt, A, true)); }
      if (on('chart')) push(triangle(s, opt, c, A));
    }
    // sin duplicados (mismos puntos extremos, gana la mejor puntuación) y solo los recientes
    const best = new Map();
    for (const p of out) { if (p.last < n - opt.keep) continue; const key = p.kind + ':' + (p.pts.length ? p.pts[0].i : 'tri'); const b = best.get(key); if (!b || p.last > b.last || (p.last === b.last && p.score > b.score)) best.set(key, p); }
    // si dos patrones comparten 2 o más pivotes, se queda el de más rango (armónico > Elliott > HCH > dobles > triángulos > 1-2-3 > ABC) para no apilar dibujos sobre los mismos puntos
    const PRIO = {harm: 7, ell: 6, hs: 5, dbl: 4, tri: 3, p123: 2, abc: 1}, idx = p => new Set([...p.pts.map(q => q.i), ...(p.lines || []).map(l => l.i1)]), kept = [];
    for (const p of [...best.values()].sort((a, b) => (PRIO[b.kind] - PRIO[a.kind]) || (b.score - a.score))) {
      const ids = idx(p); if (kept.some(k => { let m = 0; for (const v of idx(k)) if (ids.has(v)) m++; return m >= 2; })) continue; kept.push(p);
    }
    const list = kept.sort((a, b) => (b.last - a.last) || (b.score - a.score)).slice(0, opt.max);
    return {list, pivots: s};
  }

  root.CCTPatterns = {detect, zigzag, atrArr};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CCTPatterns;
})(typeof window !== 'undefined' ? window : globalThis);
