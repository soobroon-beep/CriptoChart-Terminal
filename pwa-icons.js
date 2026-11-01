/* Runs in <head>, before the browser discovers the selected install manifest. */
(() => {
  'use strict';
  const variants = [
    ['principal', 'Principal'], ['v01', '01 Naranja oscuro'], ['v02', '02 Azul oscuro'], ['v03', '03 Verde oscuro'],
    ['v04', '04 Rojo oscuro'], ['v05', '05 Violeta oscuro'], ['v06', '06 Blanco naranja'], ['v07', '07 Blanco azul'],
    ['v08', '08 Crema dorado'], ['v09', '09 Lavanda claro'], ['v10', '10 Rosa claro'], ['v11', '11 Negro plata'],
    ['v12', '12 Azul profundo'], ['v13', '13 Turquesa'], ['v14', '14 Ámbar'], ['v15', '15 Acero'],
    ['v16', '16 Neón violeta'], ['v17', '17 Cian lima'], ['v18', '18 Atardecer'], ['v19', '19 Océano'],
    ['v20', '20 Violeta oro']
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
    try { window.dispatchEvent(new Event('cct-theme')); } catch {}
    document.querySelectorAll('[data-app-icon]').forEach(img => { img.src = `icons/${id}-192.png`; });
    return true;
  }
  apply(selected);
  window.CCTAppIcons = {variants, apply, initial, get selected() { return selected; }};
})();
