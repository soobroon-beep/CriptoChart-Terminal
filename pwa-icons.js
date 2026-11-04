/* Runs in <head>, before the browser discovers the selected install manifest. */
(() => {
  'use strict';
  const variants = [
    ['i01', '01 Neón violeta'], ['i02', '02 Negro plata'], ['i03', '03 Blanco violeta'],
    ['i04', '04 Grafito'], ['i05', '05 Perla'], ['i06', '06 Holográfico'],
    ['i07', '07 Atardecer retro'], ['i08', '08 Galaxia'], ['i09', '09 Nebulosa'],
    ['i10', '10 Cerezo'], ['i11', '11 Nubes'], ['i12', '12 Circuito verde'],
    ['i13', '13 Rayos azules'], ['i14', '14 Fuego'], ['i15', '15 Cristal'],
    ['i16', '16 Arcoíris'], ['i17', '17 Cromo'], ['i18', '18 Oro'],
    ['i19', '19 Madera'], ['i20', '20 Camuflaje'], ['i21', '21 Circuito turquesa'],
    ['i22', '22 Aurora'], ['i23', '23 Nube rosa'], ['i24', '24 Blanco puro'],
    ['i25', '25 Planeta ámbar'], ['i26', '26 Lavanda y montañas'], ['i27', '27 Planeta azul'],
    ['i28', '28 Hexágonos'], ['i29', '29 Atardecer'], ['i30', '30 Velas trading'],
    ['i31', '31 Olas azules'], ['i32', '32 Llamas rojas'], ['i33', '33 Ópalo'],
    ['i34', '34 Camuflaje dorado']
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
