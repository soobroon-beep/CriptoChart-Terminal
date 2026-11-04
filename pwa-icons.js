/* Runs in <head>, before the browser discovers the selected install manifest. */
(() => {
  'use strict';
  const variants = [
    ['i01', '01 Negro violeta'],
    ['i02', '02 Azul océano'],
    ['i03', '03 Magenta'],
    ['i04', '04 Verde esmeralda'],
    ['i05', '05 Azul noche'],
    ['i06', '06 Blanco violeta'],
    ['i07', '07 Crema dorado'],
    ['i08', '08 Azul eléctrico'],
    ['i09', '09 Rojo rubí'], ['i10', '10 Violeta profundo']
  ];
  const key = 'cct_app_icon_v1', valid = id => variants.some(v => v[0] === id);
  const query = new URLSearchParams(location.search).get('appIcon');
  let saved; try { saved = localStorage.getItem(key); } catch {}
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let selected = installed && valid(saved) ? saved : valid(query) ? query : valid(saved) ? saved : 'i01';
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
    try { window.dispatchEvent(new Event('cct-theme')); } catch {}
    document.querySelectorAll('[data-app-icon]').forEach(img => { img.src = `icons/${id}-192.png`; });
    return true;
  }
  apply(selected);
  window.CCTAppIcons = {variants, apply, initial, get selected() { return selected; }};
})();
