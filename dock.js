/* VORTEX · efecto "dock" (como el Floating Dock de Aceternity): al pasar el ratón por una barra de iconos, el icono bajo el cursor crece y
   sus vecinos crecen menos, con un resorte suave. Solo escala el dibujo del icono: no mueve ni reordena nada. Solo con ratón y sin "reducir movimiento". */
(function () {
  'use strict';
  const mq = q => window.matchMedia && matchMedia(q).matches;
  if (mq('(prefers-reduced-motion: reduce)') || !mq('(hover: hover) and (pointer: fine)')) return;
  const MAX = 1.6, RANGE = 96, K = 150, C = 12, M = 0.1; // alcance en px, crecimiento máximo y resorte (misma sensación que el original)
  function dock(rail, sel) {
    if (!rail) return;
    let mouse = Infinity, raf = 0, last = 0; const st = new WeakMap();
    const glyph = b => b.querySelector(':scope > svg, :scope > img, :scope > .ic, :scope > i');
    function frame(now) {
      const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60); last = now; let busy = mouse !== Infinity;
      for (const b of rail.querySelectorAll(sel)) {
        const g = glyph(b); if (!g) continue; let s = st.get(b); if (!s) st.set(b, s = {x: 1, v: 0});
        let target = 1; if (mouse !== Infinity) { const r = b.getBoundingClientRect(), d = Math.abs(mouse - (r.top + r.height / 2)); target = 1 + (MAX - 1) * Math.max(0, 1 - d / RANGE); }
        for (let i = 0; i < 4; i++) { const a = (K * (target - s.x) - C * s.v) / M, h = dt / 4; s.v += a * h; s.x += s.v * h; }
        if (Math.abs(s.x - 1) < .003 && Math.abs(s.v) < .02 && target === 1) { s.x = 1; s.v = 0; if (g.style.transform) { g.style.transform = ''; b.style.zIndex = ''; } continue; }
        busy = true; g.style.transition = 'none'; g.style.transform = `scale(${s.x.toFixed(3)})`; g.style.willChange = 'transform'; b.style.zIndex = s.x > 1.05 ? '3' : '';
      }
      raf = busy ? requestAnimationFrame(frame) : 0;
    }
    const go = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    rail.addEventListener('mousemove', e => { mouse = e.clientY; go(); });
    rail.addEventListener('mouseleave', () => { mouse = Infinity; go(); });
  }
  const init = () => { dock(document.getElementById('rightRail'), '.rr-btn'); dock(document.getElementById('toolRail'), 'button'); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
