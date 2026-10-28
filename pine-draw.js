/* VORTEX · dibujo del resultado de un script de Pine sobre un canvas 2D.
   Puro (sin globales de la app): recibe el contexto g, el resultado de CCTPine.run y las funciones de escala. */
(function (root) {
  'use strict';
  const isn = v => v === null || v === undefined || v !== v;
  const fmtV = (v, prec) => v == null ? '—' : (typeof prec === 'number' && prec >= 0) ? v.toLocaleString('en-US', {minimumFractionDigits: prec, maximumFractionDigits: prec}) : Math.abs(v) >= 1000 ? v.toLocaleString('en-US', {maximumFractionDigits: 2}) : Math.abs(v) >= 1 ? v.toFixed(2) : Math.abs(v) === 0 ? '0' : v.toFixed(6);
  const SIZE = {tiny: 3.5, small: 5, auto: 7, normal: 7, large: 10, huge: 13};
  const FONT = {tiny: 8, small: 9, auto: 11, normal: 11, large: 14, huge: 18};
  const DASH = {solid: [], dotted: [1.5, 3], dashed: [5, 4]};

  /* Valores de un plot en el índice de barra (aplicando offset) */
  const at = (p, i) => { const j = i - (p.offset || 0); return j >= 0 && j < p.values.length ? p.values[j] : null; };
  const colOf = (res, p, j) => { if (p.cc !== undefined) return p.cc; const c = p.ci ? p.ci[j] : null; return c === undefined ? null : c; };

  /* Rango vertical de un panel propio (overlay=false) */
  function range(res, lo, hi) {
    let mn = Infinity, mx = -Infinity;
    const take = v => { if (!isn(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } };
    for (const p of res.plots) { if (p.hidden) continue; for (let i = lo; i < hi; i++) take(at(p, i)); if (/histogram|columns|area/.test(p.style)) take(p.histbase || 0); }
    for (const h of res.hlines) if (!h.hidden) take(h.price);
    for (const k of res.candles || []) { if (k.hidden) continue; for (let i = lo; i < hi; i++) { take(k.h[i]); take(k.l[i]); } }
    return Number.isFinite(mn) ? {min: mn, max: mx} : null;
  }
  /* Aporte al rango del precio (overlay=true): solo plots cuya escala se parece a la del precio */
  function contrib(res, lo, hi, pLo, pHi) {
    const a = pLo / 3, b = pHi * 3; let mn = Infinity, mx = -Infinity; const off = [];
    for (const p of res.plots) {
      if (p.hidden || p.force === false) continue;
      const vs = []; for (let i = lo; i < hi; i++) { const v = at(p, i); if (!isn(v)) vs.push(v); }
      if (!vs.length) continue; vs.sort((x, y) => x - y); const med = vs[vs.length >> 1];
      if (med < a || med > b) { off.push(p.title); continue; }
      for (const v of vs) { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    return {min: mn, max: mx, off};
  }
  function legend(res, idx) {
    const out = [];
    for (const p of res.plots) {
      if (p.hidden) continue; let v = null, j = Math.min(idx, p.values.length - 1);
      for (; j >= 0; j--) { v = at(p, j); if (!isn(v)) break; }
      const c = isn(v) ? null : colOf(res, p, j - (p.offset || 0)); out.push({text: res._noVals ? p.title : `${p.title} ${fmtV(v, res._prec)}`, color: c === null || c < 0 ? res.palette[0] : res.palette[c]});
    }
    return out;
  }

  /* Dibuja todo el resultado. o = {X, Y, lo, hi, left, right, top, bottom, step, candles, fg, text} */
  const isZone = b => Math.abs(b.r - b.l) > 12; // caja ancha (zona del POC de 200 velas, cajas de liquidez con texto…): va detrás de las velas para no tapar el precio
  function draw(g, res, o) {
    const {X, Y, lo, hi, left, right, top, bottom, step, candles} = o, P = res.palette, col = i => (i === null || i === undefined || i < 0) ? null : P[i];
    g.save(); g.setLineDash([]); g.textAlign = 'left';
    // fondo por barra (bgcolor)
    for (const e of res.bgcolors) for (const [bar, ci] of e.pts) { const i = bar + (e.offset || 0); if (i < lo - 1 || i > hi) continue; g.fillStyle = col(ci); g.fillRect(X(i) - step / 2, top, step + .5, bottom - top); }
    // rellenos entre plots / hlines
    for (const f of res.fills) {
      if (f.hidden) continue;
      const val = (r, i) => r.kind === 'hline' ? (res.hlines[r.id] ? res.hlines[r.id].price : null) : at(res.plots[r.id], i);
      for (let i = Math.max(lo, 1); i < hi; i++) {
        const c = f.cc !== undefined ? f.cc : f.ci[i]; if (c === null || c === undefined) continue;
        const a0 = val(f.a, i - 1), a1 = val(f.a, i), b0 = val(f.b, i - 1), b1 = val(f.b, i); if ([a0, a1, b0, b1].some(isn)) continue;
        g.fillStyle = col(c); g.beginPath(); g.moveTo(X(i - 1), Y(a0)); g.lineTo(X(i), Y(a1)); g.lineTo(X(i), Y(b1)); g.lineTo(X(i - 1), Y(b0)); g.closePath(); g.fill();
      }
    }
    // relleno entre dos líneas (linefill)
    for (const f of res.linefills || []) {
      if ([...f.a, ...f.b].some(isn)) continue; g.fillStyle = col(f.ci) || 'rgba(41,98,255,.3)';
      g.beginPath(); g.moveTo(X(f.a[0]), Y(f.a[1])); g.lineTo(X(f.a[2]), Y(f.a[3])); g.lineTo(X(f.b[2]), Y(f.b[3])); g.lineTo(X(f.b[0]), Y(f.b[1])); g.closePath(); g.fill();
    }
    // velas / barras del script (plotcandle, plotbar)
    for (const k of res.candles || []) {
      if (k.hidden) continue; const w = Math.max(1, Math.min(14, step * 0.7));
      for (let i = Math.max(0, Math.floor(lo)); i < Math.min(candles.length, Math.ceil(hi)); i++) {
        const j = i; if (isn(k.o[j]) || isn(k.h[j]) || isn(k.l[j]) || isn(k.c[j])) continue; const x = X(j); if (x < left - w || x > right + w) continue;
        const c1 = col(k.ci[j]) || '#2962FF', cw = col(k.wci[j]) || c1, cb = col(k.bci[j]) || c1;
        g.strokeStyle = cw; g.lineWidth = 1; g.beginPath(); g.moveTo(x, Y(k.h[j])); g.lineTo(x, Y(k.l[j])); g.stroke();
        if (k.bar) { g.strokeStyle = c1; g.beginPath(); g.moveTo(x - w / 2, Y(k.o[j])); g.lineTo(x, Y(k.o[j])); g.moveTo(x, Y(k.c[j])); g.lineTo(x + w / 2, Y(k.c[j])); g.stroke(); continue; }
        const y1 = Y(k.o[j]), y2 = Y(k.c[j]); g.fillStyle = c1; g.fillRect(x - w / 2, Math.min(y1, y2), w, Math.max(1, Math.abs(y2 - y1))); g.strokeStyle = cb; g.strokeRect(x - w / 2, Math.min(y1, y2), w, Math.max(1, Math.abs(y2 - y1)));
      }
    }
    // líneas horizontales
    for (const h of res.hlines) {
      if (h.hidden || isn(h.price)) continue; const y = Y(h.price);
      g.strokeStyle = col(h.ci) || '#787B86'; g.lineWidth = Math.max(1, h.lw || 1); g.setLineDash(DASH[h.style] || DASH.dashed);
      g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke(); g.setLineDash([]);
    }
    // plots
    for (const p of res.plots) {
      if (p.hidden) continue; const lw = Math.min(4, Math.max(1, p.lw || 1)), st = p.style, base = Y(p.histbase || 0);
      const colAt = i => colOf(res, p, i - (p.offset || 0));
      g.setLineDash(DASH[p.dash] || []);
      if (/histogram|columns/.test(st)) {
        const bw = Math.max(1, st === 'columns' ? step * .8 : Math.min(step * .5, Math.max(1.5, lw)));
        for (let i = lo; i < hi; i++) { const v = at(p, i), c = colAt(i); if (isn(v) || c === null || c < 0) continue; g.fillStyle = P[c]; const y = Y(v); g.fillRect(X(i) - bw / 2, Math.min(y, base), bw, Math.max(1, Math.abs(y - base))); }
      } else if (/^(circles|cross)$/.test(st)) {
        for (let i = lo; i < hi; i++) { const v = at(p, i), c = colAt(i); if (isn(v) || c === null || c < 0) continue; const x = X(i), y = Y(v); g.strokeStyle = g.fillStyle = P[c]; g.lineWidth = 1.2;
          if (st === 'circles') { g.beginPath(); g.arc(x, y, Math.max(1.5, lw), 0, 7); g.fill(); } else { g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.moveTo(x, y - 3); g.lineTo(x, y + 3); g.stroke(); } }
      } else if (/^area/.test(st)) {
        for (let i = Math.max(lo, 1); i < hi; i++) { const v0 = at(p, i - 1), v1 = at(p, i), c = colAt(i); if (isn(v0) || isn(v1) || c === null || c < 0) continue; g.fillStyle = P[c]; g.globalAlpha = .35; g.beginPath(); g.moveTo(X(i - 1), Y(v0)); g.lineTo(X(i), Y(v1)); g.lineTo(X(i), bottom); g.lineTo(X(i - 1), bottom); g.closePath(); g.fill(); g.globalAlpha = 1; }
        strokePlot(g, p, lo, hi, X, Y, colAt, P, lw, false);
      } else strokePlot(g, p, lo, hi, X, Y, colAt, P, lw, /step/.test(st));
      g.setLineDash([]);
    }
    // formas
    for (const s of res.shapes) {
      for (const pt of s.pts) {
        const i = pt[0] + (s.offset || 0); if (i < lo - 1 || i > hi) continue; const x = X(i), c = candles[Math.min(candles.length - 1, Math.max(0, i))];
        if (s.kind === 'arrow') { const up = pt[1] > 0, y = up ? Y(c.l) + 4 : Y(c.h) - 4, sz = 6; g.fillStyle = col(pt[2]); g.beginPath(); if (up) { g.moveTo(x, y); g.lineTo(x - sz, y + sz * 1.6); g.lineTo(x + sz, y + sz * 1.6); } else { g.moveTo(x, y); g.lineTo(x - sz, y - sz * 1.6); g.lineTo(x + sz, y - sz * 1.6); } g.closePath(); g.fill(); continue; }
        const sz = SIZE[s.size] || 7, loc = s.loc; let y, dir;
        if (loc === 'abovebar') { y = o.overlay ? Y(c.h) - sz - 5 : top + sz + 4; dir = -1; }
        else if (loc === 'belowbar') { y = o.overlay ? Y(c.l) + sz + 5 : bottom - sz - 4; dir = 1; }
        else if (loc === 'top') { y = top + sz + 4; dir = -1; } else if (loc === 'bottom') { y = bottom - sz - 4; dir = 1; }
        else { y = Y(pt[1]); dir = 0; }
        drawGlyph(g, s, x, y, sz, col(pt[2]), col(pt[3]), pt[4], dir);
      }
    }
    // líneas, cajas y etiquetas dibujadas por el script
    for (const b of res.boxes) {
      if (o.pass === 'back' ? !isZone(b) : (o.zoneBack && isZone(b))) continue; // zonas anchas sin texto (POC, valor, sentimiento): van detrás de las velas
      if (isn(b.l) || isn(b.r) || isn(b.t) || isn(b.b)) continue;
      let x1 = X(b.l), x2 = X(b.r); if (b.extend === 'left' || b.extend === 'both') x1 = left; if (b.extend === 'right' || b.extend === 'both') x2 = right;
      const y1 = Y(b.t), y2 = Y(b.b); g.fillStyle = profileRowFill(b, col(b.fci)) || 'transparent'; g.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      g.strokeStyle = col(b.bci) || '#2962FF'; g.lineWidth = Math.min(4, b.bw || 1); g.setLineDash(DASH[b.bstyle] || []); g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); g.setLineDash([]);
      if (b.text) { // el texto se alinea (left/center/right), se ajusta al tamaño de la caja y se recorta dentro de ella, como en TradingView (antes se imprimía centrado y sin recortar, y las filas del perfil de volumen se montaban)
        const bx = Math.min(x1, x2), bw = Math.abs(x2 - x1), by = Math.min(y1, y2), bh = Math.abs(y2 - y1);
        if (bw >= 6 && bh >= 5) {
          const FIXED = {tiny: 7, small: 9, normal: 11, large: 14, huge: 18}, auto = !FIXED[b.tz];
          let fs = auto ? Math.max(5, Math.min(12, bh * .72)) : FIXED[b.tz];
          g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
          g.font = fs + 'px system-ui'; const tw = g.measureText(b.text).width;
          if (auto && tw > bw - 6) { fs = Math.max(6, fs * (bw - 6) / tw); g.font = fs + 'px system-ui'; }
          const al = b.th === 'left' ? 'left' : b.th === 'right' ? 'right' : 'center', tx = al === 'left' ? bx + 3 : al === 'right' ? bx + bw - 3 : bx + bw / 2;
          const va = b.tv === 'top' ? 'top' : b.tv === 'bottom' ? 'bottom' : 'middle';
          g.fillStyle = col(b.tci) || '#fff'; g.textAlign = al; g.textBaseline = va;
          g.fillText(b.text, tx, va === 'top' ? by + 2 : va === 'bottom' ? by + bh - 2 : by + bh / 2 + .5);
          g.restore();
        }
      }
    }
    for (const l of res.lines) {
      if (isn(l.x1) || isn(l.x2) || isn(l.y1) || isn(l.y2)) continue;
      let xa = X(l.x1), ya = Y(l.y1), xb = X(l.x2), yb = Y(l.y2);
      if (l.extend !== 'none' && xb !== xa) {
        const m = (yb - ya) / (xb - xa), R = l.extend === 'right' || l.extend === 'both', L = l.extend === 'left' || l.extend === 'both';
        if (R) { const xe = Math.max(xa, xb) < right ? right : Math.max(xa, xb); const ref = xb >= xa ? [xb, yb] : [xa, ya]; yb = ref[1] + m * (xe - ref[0]); xb = xe; if (xa > xb) { xa = xb; } }
        if (L) { ya = ya + m * (left - xa); xa = left; }
      }
      g.strokeStyle = col(l.ci) || '#2962FF'; g.lineWidth = Math.min(4, l.w || 1); g.setLineDash(DASH[l.style] || []); g.beginPath(); g.moveTo(xa, ya); g.lineTo(xb, yb); g.stroke(); g.setLineDash([]);
    }
    for (const lb of res.labels) {
      if (isn(lb.x)) continue; const i = Math.round(lb.x), c = candles[Math.min(candles.length - 1, Math.max(0, i))]; let y;
      if (lb.yloc === 'abovebar') y = Y(c.h); else if (lb.yloc === 'belowbar') y = Y(c.l); else if (isn(lb.y)) continue; else y = Y(lb.y);
      drawLabel(g, lb, X(lb.x), y, col(lb.ci), col(lb.tci), lb.yloc === 'abovebar' ? 'down' : lb.yloc === 'belowbar' ? 'up' : null);
    }
    for (const pl of res.polylines || []) {
      const pts = pl.pts.filter(q => !isn(q[0]) && !isn(q[1])); if (pts.length < 2) continue;
      g.beginPath(); pts.forEach((q, k) => k ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1]))); if (pl.closed) g.closePath();
      if (pl.fci !== null && pl.fci !== undefined && P[pl.fci]) { g.fillStyle = P[pl.fci]; g.fill(); }
      g.strokeStyle = col(pl.lci) || '#2962FF'; g.lineWidth = Math.min(4, pl.w || 1); g.setLineDash(DASH[pl.style] || []); g.stroke(); g.setLineDash([]);
    }
    if (res.strategy && o.overlay) drawTrades(g, res.strategy, o);
    g.restore();
    drawTables(g, res, o);
  }
  // operaciones del backtest: triángulos de entrada (▲ largo / ▼ corto) y marcas de salida (verde ganadora / roja perdedora)
  function drawTrades(g, st, o) {
    const {X, Y, lo, hi, candles} = o; g.save(); g.font = '9px system-ui'; g.textAlign = 'center';
    for (const m of st.marks) {
      if (m.bar < lo - 1 || m.bar > hi) continue; const x = X(m.bar), y = Y(m.price), up = m.dir === 1;
      if (m.kind === 'entry') { g.fillStyle = up ? '#26a69a' : '#ef5350'; g.beginPath(); if (up) { g.moveTo(x, y + 2); g.lineTo(x - 5, y + 11); g.lineTo(x + 5, y + 11); } else { g.moveTo(x, y - 2); g.lineTo(x - 5, y - 11); g.lineTo(x + 5, y - 11); } g.closePath(); g.fill(); g.fillText(String(m.id).slice(0, 8), x, up ? y + 21 : y - 14); }
      else { g.strokeStyle = g.fillStyle = m.profit >= 0 ? '#26a69a' : '#ef5350'; g.beginPath(); g.arc(x, y, 3.5, 0, 6.2832); g.fill(); }
    }
    g.restore();
  }
  // tablas del script: se anclan a una esquina del gráfico (Pine las dibuja en la pantalla, no en el precio)
  function drawTables(g, res, o) {
    const P = res.palette, {left, right, top, bottom} = o, SZ = {tiny: 8, small: 9, normal: 11, large: 13, huge: 16, auto: 10};
    g.save(); g.textBaseline = 'middle';
    for (const t of res.tables || []) {
      if (!t.cells.length) continue;
      const colW = [], rowH = [];
      for (const c of t.cells) { const fs = SZ[(c.size || 'small').replace(/^size\./, '')] || 9; g.font = fs + 'px system-ui'; const w = c.text ? g.measureText(c.text).width + 10 : 6; colW[c.c] = Math.max(colW[c.c] || 0, Math.min(w, 190)); rowH[c.r] = Math.max(rowH[c.r] || 0, fs + 7); }
      const cw = i => colW[i] || 0, rh = i => rowH[i] || 0; let W = 0, H = 0; for (let i = 0; i < t.cols; i++) W += cw(i); for (let i = 0; i < t.rows; i++) H += rh(i);
      if (!W || !H) continue;
      const k = Math.max(.4, Math.min(1, (bottom - top - 12) / H, (right - left - 12) / W)), pos = t.pos, Ws = W * k, Hs = H * k;
      const ax = pos.includes('left') ? left + 6 : pos.includes('center') ? (left + right - Ws) / 2 : right - Ws - 6, ay = pos.includes('top') ? top + 6 : pos.includes('middle') ? (top + bottom - Hs) / 2 : bottom - Hs - 6;
      g.save(); g.translate(ax, ay); g.scale(k, k); const x0 = 0, y0 = 0, small = t.cells.length <= 4, bgOf = ci => small ? fadeRgba(P[ci], .25) : P[ci]; // tablas chicas (señal BUY/SELL, reglas): fondo casi transparente para no tapar las velas
      if (t.bci !== null && t.bci !== undefined && P[t.bci]) { g.fillStyle = bgOf(t.bci); g.fillRect(x0, y0, W, H); }
      for (const c of t.cells) {
        let x = x0, y = y0; for (let i = 0; i < c.c; i++) x += cw(i); for (let i = 0; i < c.r; i++) y += rh(i);
        if (c.bci !== null && c.bci !== undefined && P[c.bci]) { g.fillStyle = bgOf(c.bci); g.fillRect(x, y, cw(c.c), rh(c.r)); }
        if (!c.text) continue; const fs = SZ[(c.size || 'small').replace(/^size\./, '')] || 9; g.font = fs + 'px system-ui'; g.fillStyle = (c.tci !== null && c.tci !== undefined && P[c.tci]) || '#d1d4dc';
        const al = String(c.halign || 'center').replace(/^text\./, ''); g.textAlign = al === 'left' ? 'left' : al === 'right' ? 'right' : 'center';
        g.fillText(c.text.split('\n')[0], al === 'left' ? x + 4 : al === 'right' ? x + cw(c.c) - 4 : x + cw(c.c) / 2, y + rh(c.r) / 2, cw(c.c) - 4);
      }
      if (t.frame !== null && t.frame !== undefined && P[t.frame] && t.fw > 0) { g.strokeStyle = P[t.frame]; g.lineWidth = Math.min(3, t.fw); g.strokeRect(x0, y0, W, H); }
      g.restore();
    }
    g.restore();
  }
  function strokePlot(g, p, lo, hi, X, Y, colAt, P, lw, step) {
    g.lineWidth = lw; g.lineJoin = 'round'; let prev = null;
    for (let i = lo; i < hi; i++) {
      const v = at(p, i), c = colAt(i);
      if (isn(v) || c === null || c < 0) { prev = null; continue; }
      if (prev && prev.v !== null) {
        g.strokeStyle = P[c]; g.beginPath(); g.moveTo(X(prev.i), Y(prev.v));
        if (step) g.lineTo(X(i), Y(prev.v)); g.lineTo(X(i), Y(v)); g.stroke();
      }
      prev = {i, v};
    }
    if (lo > 0) { /* el tramo que entra desde la izquierda */ }
  }
  function drawGlyph(g, s, x, y, sz, color, tcolor, text, dir) {
    g.fillStyle = g.strokeStyle = color || '#2962FF'; g.lineWidth = 1.5; const st = s.style;
    if (s.kind === 'char') { g.font = `bold ${Math.round(sz * 1.8)}px system-ui`; g.textAlign = 'center'; g.fillText(s.ch || '•', x, y + sz * .6); }
    else if (st === 'triangleup' || st === 'arrowup') { g.beginPath(); g.moveTo(x, y - sz); g.lineTo(x - sz, y + sz * .8); g.lineTo(x + sz, y + sz * .8); g.closePath(); g.fill(); }
    else if (st === 'triangledown' || st === 'arrowdown') { g.beginPath(); g.moveTo(x, y + sz); g.lineTo(x - sz, y - sz * .8); g.lineTo(x + sz, y - sz * .8); g.closePath(); g.fill(); }
    else if (st === 'circle') { g.beginPath(); g.arc(x, y, sz * .8, 0, 7); g.fill(); }
    else if (st === 'square') g.fillRect(x - sz * .8, y - sz * .8, sz * 1.6, sz * 1.6);
    else if (st === 'diamond') { g.beginPath(); g.moveTo(x, y - sz); g.lineTo(x + sz, y); g.lineTo(x, y + sz); g.lineTo(x - sz, y); g.closePath(); g.fill(); }
    else if (st === 'cross') { g.beginPath(); g.moveTo(x - sz, y); g.lineTo(x + sz, y); g.moveTo(x, y - sz); g.lineTo(x, y + sz); g.stroke(); }
    else if (st === 'flag') { g.beginPath(); g.moveTo(x - sz * .6, y + sz); g.lineTo(x - sz * .6, y - sz); g.stroke(); g.fillRect(x - sz * .6, y - sz, sz * 1.5, sz); }
    else if (st === 'labelup' || st === 'labeldown') { drawLabel(g, {text: text || '', size: s.size, style: st === 'labelup' ? 'label_up' : 'label_down'}, x, y + (st === 'labelup' ? -sz : sz), color || undefined, tcolor, st === 'labelup' ? 'up' : 'down'); return; }
    else { g.beginPath(); g.moveTo(x - sz, y - sz); g.lineTo(x + sz, y + sz); g.moveTo(x + sz, y - sz); g.lineTo(x - sz, y + sz); g.stroke(); } // xcross
    if (text && s.kind !== 'char' || (text && s.kind === 'char')) { g.fillStyle = tcolor || color; g.font = '10px system-ui'; g.textAlign = 'center'; g.fillText(text, x, dir <= 0 ? y - sz - 3 : y + sz + 11); }
    g.textAlign = 'left';
  }
  // Filas del perfil de volumen (volumen, sentimiento y precios): relleno casi transparente para que no tapen las velas cuando el gráfico se acerca al perfil (el borde conserva el color).
  function fadeRgba(c, k) { const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(c || ''); return m ? `rgba(${m[1]},${m[2]},${m[3]},${+(m[4] * k).toFixed(3)})` : c; }
  const VP_FILL_K = 0.3;
  function profileRowFill(b, c) {
    if (!c || !b.text || !/(\(\d+(\.\d+)?%\)\s*$)|(^\s*[\d.,]+\s*$)/.test(b.text)) return c;
    const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(c); return m ? `rgba(${m[1]},${m[2]},${m[3]},${+(m[4] * VP_FILL_K).toFixed(3)})` : c;
  }
  function drawLabel(g, lb, x, y, bg, fg, force) {
    const fs = FONT[lb.size] || 11; g.font = `${fs}px system-ui`; const text = lb.text || '', lines = text.split('\n'), tw = Math.max(0, ...lines.map(t => g.measureText(t).width)), pad = 5, w = tw + pad * 2, h = lines.length * (fs + 2) + pad * 2 - 2;
    let st = String(lb.style || 'label_down').replace(/^label_/, ''); if (force === 'up') st = 'up'; if (force === 'down') st = 'down';
    if (st === 'none' || st === 'text_outline') { g.fillStyle = fg || '#fff'; g.textAlign = 'center'; lines.forEach((t, k) => g.fillText(t, x, y + fs + k * (fs + 2) - fs / 2)); g.textAlign = 'left'; return; }
    let bx = x - w / 2, by = y - h - 5; // "down": la etiqueta queda encima del punto
    if (st === 'up') by = y + 5; else if (st === 'left') { bx = x + 5; by = y - h / 2; } else if (st === 'right') { bx = x - w - 5; by = y - h / 2; } else if (st === 'center') by = y - h / 2;
    else if (st === 'lower_left') { bx = x - w; by = y + 3; } else if (st === 'lower_right') { bx = x; by = y + 3; } else if (st === 'upper_left') { bx = x - w; by = y - h - 3; } else if (st === 'upper_right') { bx = x; by = y - h - 3; }
    if (bg !== null) { // color = na en Pine → etiqueta sin fondo ni puntero (solo el texto)
    g.fillStyle = bg || '#2962FF'; g.beginPath(); (g.roundRect ? g.roundRect(bx, by, w, h, 3) : g.rect(bx, by, w, h)); g.fill();
    if (st === 'down' || st === 'up') { g.beginPath(); if (st === 'down') { g.moveTo(x - 4, by + h); g.lineTo(x + 4, by + h); g.lineTo(x, by + h + 5); } else { g.moveTo(x - 4, by); g.lineTo(x + 4, by); g.lineTo(x, by - 5); } g.closePath(); g.fill(); }
    }
    g.fillStyle = fg || '#fff'; g.textAlign = 'left'; lines.forEach((t, k) => g.fillText(t, bx + pad, by + pad + fs - 2 + k * (fs + 2)));
  }
  root.CCTPineDraw = {draw, range, drawTrades, contrib, legend, fmtV};
})(typeof self !== 'undefined' ? self : this);
