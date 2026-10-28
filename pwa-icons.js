/* Runs in <head>, before the browser discovers the selected install manifest. */
(() => {
  'use strict';
  const variants = [
    ['principal', 'Naranja sobre blanco'], ['turquesa', '01 Turquesa'],
    ['naranja', '02 Naranja'], ['cobalto', '03 Cobalto'], ['lavanda', '04 Lavanda'],
    ['lima', '05 Lima'], ['durazno', '06 Durazno'], ['bosque', '07 Bosque'],
    ['fucsia', '08 Fucsia'], ['menta', '09 Menta'], ['arena', '10 Arena'], ['vortex', '11 Vortex']
  ];
  const key = 'cct_app_icon_v1', valid = id => variants.some(v => v[0] === id);
  const query = new URLSearchParams(location.search).get('appIcon');
  let saved; try { saved = localStorage.getItem(key); } catch {}
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let selected = installed && valid(saved) ? saved : valid(query) ? query : valid(saved) ? saved : 'principal';
  const initial = selected;
  function link(rel, id, href, sizes) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('link'); el.id = id; el.rel = rel; document.head.appendChild(el); }
    if (sizes) el.sizes = sizes;
    el.href = href;
  }
  function apply(id) {
    if (!valid(id)) return false;
    selected = id;
    try { localStorage.setItem(key, id); } catch {}
    link('manifest', 'appManifest', `manifests/${id}.webmanifest`);
    link('apple-touch-icon', 'appTouchIcon', `icons/${id}-180.png`, '180x180');
    link('icon', 'appFavicon', `icons/${id}-192.png`, '192x192');
    document.documentElement.dataset.theme = id; // el ícono también define el tema de color de la app (themes.css)
    const mt = document.querySelector('meta[name=theme-color]'); if (mt) { const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); if (bg) mt.content = bg; }
    try { window.dispatchEvent(new Event('cct-theme')); } catch {}
    document.querySelectorAll('[data-app-icon]').forEach(img => { img.src = `icons/${id}-192.png`; });
    return true;
  }
  apply(selected);
  window.CCTAppIcons = {variants, apply, initial, get selected() { return selected; }};
})();
