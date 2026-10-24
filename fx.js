/* Efectos de interfaz: ondas al tocar, píldora deslizante en la barra inferior y luz que sigue al cursor.
   Solo decoración: si falla o el usuario prefiere menos movimiento, la app funciona igual. */
(function () {
  'use strict';
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Onda de luz en botones desde el punto exacto del toque
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('button, .watch-row, .sheet-item, .setting-row, .small-button'); if (!b || reduced || b.disabled) return;
    const r = b.getBoundingClientRect(); b.style.setProperty('--rx', (e.clientX - r.left) + 'px'); b.style.setProperty('--ry', (e.clientY - r.top) + 'px');
    b.classList.remove('rip'); void b.offsetWidth; b.classList.add('rip'); setTimeout(() => b.classList.remove('rip'), 650);
  }, {passive: true});
  // Píldora de cristal que se desliza bajo el botón activo de la barra inferior
  const nav = document.querySelector('.bottom-nav');
  function movePill() {
    if (!nav) return; const act = nav.querySelector('button.active'); if (!act || !act.offsetWidth) return;
    const x = act.offsetLeft + 'px', w = act.offsetWidth + 'px'; if (nav.style.getPropertyValue('--pill-x') !== x) nav.style.setProperty('--pill-x', x); if (nav.style.getPropertyValue('--pill-w') !== w) nav.style.setProperty('--pill-w', w); if (!nav.classList.contains('has-pill')) nav.classList.add('has-pill');
  }
  if (nav) { new MutationObserver(recs => { if (recs.some(r => r.target !== nav)) movePill(); }).observe(nav, {subtree: true, attributes: true, attributeFilter: ['class']}); window.addEventListener('resize', movePill); setTimeout(movePill, 50); setTimeout(movePill, 400); }
  // Marca la barra superior cuando hay desplazamiento (cristal más marcado)
  document.addEventListener('scroll', e => { const t = e.target; if (t && t.classList && t.classList.contains('view')) t.classList.toggle('scrolled', t.scrollTop > 4); }, true);
})();
