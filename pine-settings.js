/* Ventana de configuración estilo TradingView: pestañas «Entradas de datos», «Estilo» y «Visibilidad».
   Es solo interfaz: recibe los datos (inputs, plots…) y devuelve los valores elegidos con onApply. */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const UNITS = [['m', 'Minutos', 1, 59], ['h', 'Horas', 1, 24], ['d', 'Días', 1, 366], ['w', 'Semanas', 1, 52], ['M', 'Meses', 1, 12]];
  const SRC_LABEL = {open: 'Apertura (open)', high: 'Máximo (high)', low: 'Mínimo (low)', close: 'Cierre (close)', hl2: 'hl2', hlc3: 'hlc3', ohlc4: 'ohlc4', hlcc4: 'hlcc4', volume: 'Volumen'};
  const hexOf = v => { const m = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(String(v || '')); return m ? {hex: '#' + m[1].toLowerCase(), op: m[2] ? Math.round(parseInt(m[2], 16) / 255 * 100) : 100} : {hex: '#2962ff', op: 100}; };
  const joinHex = (hex, op) => op >= 100 ? hex : hex + Math.round(op / 100 * 255).toString(16).padStart(2, '0');
  let dlg = null;

  function close() { if (dlg) { document.removeEventListener('keydown', dlg.onKey, true); dlg.el.remove(); dlg = null; } }

  function groupItems(inputs) { // grupos en orden de aparición; sin grupo primero
    const names = [], by = new Map();
    for (const i of inputs) { const g = i.group || ''; if (!by.has(g)) { by.set(g, []); names.push(g); } by.get(g).push(i); }
    names.sort((a, b) => (a === '' ? -1 : 0) - (b === '' ? -1 : 0));
    return names.map(n => ({name: n, rows: rowsOf(by.get(n))}));
  }
  function rowsOf(items) { // las entradas con el mismo «inline» consecutivas comparten fila
    const rows = [];
    for (const i of items) { const last = rows[rows.length - 1]; if (i.inline && last && last[0].inline === i.inline) last.push(i); else rows.push([i]); }
    return rows;
  }

  function cell(i, v) {
    const id = 'cfg_' + i.key, tip = i.tooltip ? `<span class="cfg-tip-btn" data-tip="${esc(i.tooltip)}" title="${esc(i.tooltip)}" tabindex="0">i</span>` : '', lab = i.title ? `<label for="${id}" class="cfg-lab">${esc(i.title)}</label>` : '';
    let ctl;
    if (i.type === 'bool') return `<div class="cfg-cell cfg-bool"><input type="checkbox" id="${id}" data-k="${i.key}" data-t="bool" ${v ? 'checked' : ''}>${lab}${tip}</div>`;
    if (i.type === 'color') { const c = hexOf(v); ctl = `<input type="color" id="${id}" data-k="${i.key}" data-t="color" data-part="c" value="${c.hex}"><input type="range" min="0" max="100" step="5" data-k="${i.key}" data-t="color" data-part="o" value="${c.op}" title="Opacidad ${c.op}%" class="cfg-op">`; }
    else if (i.type === 'source') ctl = `<select id="${id}" data-k="${i.key}" data-t="source">${(i.options || []).map(o => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(SRC_LABEL[o] || o)}</option>`).join('')}</select>`;
    else if (i.options && i.options.length) ctl = `<select id="${id}" data-k="${i.key}" data-t="${i.type}">${i.options.map(o => `<option value="${esc(o)}" ${String(o) === String(v) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (i.type === 'time') { const d = Number.isFinite(+v) ? new Date(+v).toISOString().slice(0, 16) : ''; ctl = `<input type="datetime-local" id="${id}" data-k="${i.key}" data-t="time" value="${d}">`; }
    else if (i.type === 'int' || i.type === 'float') ctl = `<input type="number" id="${id}" data-k="${i.key}" data-t="${i.type}" value="${esc(v)}" ${i.min != null ? `min="${i.min}"` : ''} ${i.max != null ? `max="${i.max}"` : ''} step="${i.step || (i.type === 'int' ? 1 : 'any')}">`;
    else ctl = `<input type="text" id="${id}" data-k="${i.key}" data-t="${i.type}" value="${esc(v)}">`;
    return `<div class="cfg-cell">${lab}${ctl}${tip}</div>`;
  }

  function inputsTab(cfg, vals) {
    if (!cfg.inputs.length) return '<p class="cfg-empty">Este script no tiene parámetros configurables.</p>';
    return groupItems(cfg.inputs).map(g => `<section class="cfg-sec">${g.name ? `<h4>${esc(g.name)}</h4>` : ''}${g.rows.map(r => `<div class="cfg-row ${r.length > 1 ? 'inline' : ''}">${r.map(i => cell(i, vals[i.key])).join('')}</div>`).join('')}</section>`).join('');
  }

  const TYPES = [['line', 'Línea'], ['stepline', 'Escalón'], ['linebr', 'Línea con saltos'], ['histogram', 'Histograma'], ['columns', 'Columnas'], ['area', 'Área'], ['circles', 'Círculos'], ['cross', 'Cruces']];
  const DASHES = [['solid', 'Continua'], ['dashed', 'Rayas'], ['dotted', 'Puntos']];
  const SIZES = [['tiny', 'Diminuto'], ['small', 'Pequeño'], ['normal', 'Normal'], ['large', 'Grande'], ['huge', 'Enorme'], ['auto', 'Auto']];
  const sel = (key, prop, opts, cur, title) => `<select data-sk="${key}" data-sp="${prop}" title="${title}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  function styleTab(cfg, st) {
    const out = [], g = (grp, key) => ((st[grp] || {})[key]) || {};
    const row = (key, label, ctls, on) => `<div class="cfg-row sty"><div class="cfg-cell cfg-bool"><input type="checkbox" data-sk="${key}" data-sp="on" ${on !== false ? 'checked' : ''} id="s_${key}"><label for="s_${key}" class="cfg-lab">${esc(label)}</label></div><div class="cfg-ctls">${ctls}</div></div>`;
    const colorCtl = (key, hex, op, dyn, prop = 'color', tip = 'Color') => (dyn ? '<span class="cfg-dyn" title="El script cambia este color según las condiciones; si eliges uno aquí, reemplaza todos">dinámico</span>' : '') + `<input type="color" data-sk="${key}" data-sp="${prop}" value="${hex}" title="${tip}">` + (prop === 'color' ? `<input type="range" min="0" max="100" step="5" data-sk="${key}" data-sp="op" value="${op}" class="cfg-op" title="Opacidad ${op}%">` : '');
    const widthCtl = (key, w) => sel(key, 'lw', [1, 2, 3, 4, 5, 6].map(n => [n, n + ' px']), w, 'Grosor');
    if (cfg.plots.length) {
      out.push('<section class="cfg-sec"><h4>Líneas y gráficos</h4>');
      for (const p of cfg.plots) { const k = 'plots.' + p.key, o = g('plots', p.key), c = hexOf(o.color || p.color); out.push(row(k, p.title, colorCtl(k, c.hex, o.op != null ? o.op : c.op, p.dynamic && !o.color) + sel(k, 'type', TYPES, o.type || p.type, 'Tipo de gráfico') + sel(k, 'dash', DASHES, o.dash || p.dash, 'Estilo de línea') + widthCtl(k, o.lw || p.lw), o.on)); }
      out.push('</section>');
    }
    if (cfg.fills && cfg.fills.length) {
      out.push('<section class="cfg-sec"><h4>Rellenos</h4>');
      for (const f of cfg.fills) { const k = 'fills.' + f.key, o = g('fills', f.key), c = hexOf(o.color || f.color); out.push(row(k, f.title, colorCtl(k, c.hex, o.op != null ? o.op : c.op, f.dynamic && !o.color), o.on)); }
      out.push('</section>');
    }
    if (cfg.hlines.length) {
      out.push('<section class="cfg-sec"><h4>Líneas horizontales</h4>');
      for (const h of cfg.hlines) { const k = 'hlines.' + h.key, o = g('hlines', h.key), c = hexOf(o.color || h.color); out.push(row(k, h.title || ('Nivel ' + h.price), colorCtl(k, c.hex, o.op != null ? o.op : c.op, false) + sel(k, 'dash', DASHES, o.dash || h.dash, 'Estilo de línea') + widthCtl(k, o.lw || h.lw), o.on)); }
      out.push('</section>');
    }
    if (cfg.shapes.length) {
      out.push('<section class="cfg-sec"><h4>Formas y marcas</h4>');
      for (const x of cfg.shapes) { const k = 'shapes.' + x.key, o = g('shapes', x.key), c = hexOf(o.color || x.color), t = hexOf(o.tcolor || x.tcolor); out.push(row(k, x.title || 'Forma ' + x.key, colorCtl(k, c.hex, 100, false, 'color', 'Color de la forma').replace(/<input type="range"[^>]*>/, '') + colorCtl(k, t.hex, 100, false, 'tcolor', 'Color del texto') + sel(k, 'size', SIZES, o.size || x.size, 'Tamaño'), o.on)); }
      out.push('</section>');
    }
    const objs = cfg.objects.filter(x => x.count > 0);
    if (objs.length) { out.push('<section class="cfg-sec"><h4>Objetos dibujados por el script</h4>'); for (const x of objs) out.push(row('objs.' + x.key, `${x.label} (${x.count})`, '', (st.objs || {})[x.key] && st.objs[x.key].on)); out.push('</section>'); }
    if (cfg.plots.length || cfg.hlines.length) {
      const G = g('general', 'g');
      out.push(`<section class="cfg-sec"><h4>Escala y leyenda</h4><div class="cfg-row sty"><label class="cfg-lab">Precisión (decimales)</label><div class="cfg-ctls"><select data-sk="general.g" data-sp="prec"><option value="">Por defecto</option>${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${G.prec === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div><div class="cfg-row sty"><div class="cfg-cell cfg-bool"><input type="checkbox" id="s_vals" data-sk="general.g" data-sp="vals" ${G.vals !== false ? 'checked' : ''}><label for="s_vals" class="cfg-lab">Mostrar valores en la leyenda</label></div></div></section>`);
    }
    return out.length ? out.join('') : '<p class="cfg-empty">Este script no dibuja nada que se pueda ajustar aquí.</p>';
  }

  function visTab(vis) {
    return '<section class="cfg-sec"><h4>Mostrar en estas temporalidades</h4>' + UNITS.map(([u, name, lo, hi]) => {
      const v = (vis || {})[u] || {}, on = v.on !== false;
      return `<div class="cfg-row sty"><div class="cfg-cell cfg-bool"><input type="checkbox" id="v_${u}" data-vu="${u}" data-vp="on" ${on ? 'checked' : ''}><label for="v_${u}" class="cfg-lab">${name}</label></div><div class="cfg-cell"><input type="number" data-vu="${u}" data-vp="min" min="${lo}" max="${hi}" value="${v.min != null ? v.min : lo}"><span class="cfg-dash">—</span><input type="number" data-vu="${u}" data-vp="max" min="${lo}" max="${hi}" value="${v.max != null ? v.max : hi}"></div></div>`;
    }).join('') + '</section>';
  }

  function open(cfg) {
    close();
    const vals = {}; for (const i of cfg.inputs) vals[i.key] = cfg.values && cfg.values[i.key] !== undefined ? cfg.values[i.key] : i.value;
    const st = JSON.parse(JSON.stringify(cfg.style || {})), vis = JSON.parse(JSON.stringify(cfg.vis || {}));
    const el = document.createElement('div'); el.className = 'cfg-overlay';
    el.innerHTML = `<div class="cfg-dlg" role="dialog" aria-modal="true" aria-label="Configuración"><div class="cfg-head"><strong>${esc(cfg.title)}</strong><button class="cfg-x" aria-label="Cerrar">✕</button></div>
      <div class="cfg-tabs">${[['in', 'Entradas de datos'], ['st', 'Estilo'], ['vi', 'Visibilidad']].filter(t => !cfg.tabs || cfg.tabs.includes(t[0])).map((t, k) => `<button data-tab="${t[0]}" class="${k ? '' : 'on'}">${t[1]}</button>`).join('')}</div>
      ${cfg.note ? `<p class="cfg-note">${esc(cfg.note)}</p>` : ''}<div class="cfg-body"></div><div class="cfg-foot"><button class="cfg-btn ghost" data-act="reset">Por defecto</button><span class="cfg-sp"></span><button class="cfg-btn" data-act="cancel">Cancelar</button><button class="cfg-btn cfg-ok" data-act="ok">Aceptar</button></div></div>`;
    document.body.appendChild(el);
    let tab = (cfg.tabs && cfg.tabs[0]) || 'in'; const body = el.querySelector('.cfg-body');
    const draw = () => { body.innerHTML = tab === 'in' ? inputsTab(cfg, vals) : tab === 'st' ? styleTab(cfg, st) : visTab(vis); body.scrollTop = 0; el.querySelectorAll('.cfg-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab)); };
    const setPath = (path, prop, v) => { const [grp, key] = path.split('.'); st[grp] = st[grp] || {}; st[grp][key] = st[grp][key] || {}; st[grp][key][prop] = v; };
    const onEdit = e => {
      const t = e.target;
      if (t.dataset.k !== undefined) { // entrada de datos
        const k = t.dataset.k, ty = t.dataset.t;
        if (ty === 'bool') vals[k] = t.checked;
        else if (ty === 'time') { const ms = Date.parse(t.value + ':00Z'); if (Number.isFinite(ms)) vals[k] = ms; }
        else if (ty === 'int' || ty === 'float') { const n = t.value === '' ? null : +t.value; if (n !== null && Number.isFinite(n)) vals[k] = ty === 'int' ? Math.round(n) : n; }
        else if (ty === 'color') { const c = hexOf(vals[k]); const hex = t.dataset.part === 'c' ? t.value : c.hex, op = t.dataset.part === 'o' ? +t.value : c.op; vals[k] = joinHex(hex, op); if (t.dataset.part === 'o') t.title = 'Opacidad ' + op + '%'; }
        else vals[k] = t.value;
      } else if (t.dataset.sk !== undefined) { // estilo
        const pr = t.dataset.sp, path = t.dataset.sk;
        if (pr === 'on' || pr === 'vals') setPath(path, pr, t.checked);
        else if (pr === 'lw') setPath(path, 'lw', +t.value);
        else if (pr === 'prec') { const [gp, ky] = path.split('.'); st[gp] = st[gp] || {}; st[gp][ky] = st[gp][ky] || {}; if (t.value === '') delete st[gp][ky].prec; else st[gp][ky].prec = +t.value; }
        else if (pr === 'type' || pr === 'dash' || pr === 'size') setPath(path, pr, t.value);
        else if (pr === 'tcolor') setPath(path, 'tcolor', t.value);
        else if (pr === 'color' || pr === 'op') {
          const cEl = el.querySelector(`[data-sk="${path}"][data-sp="color"]`), oEl = el.querySelector(`[data-sk="${path}"][data-sp="op"]`), op = oEl ? +oEl.value : 100;
          setPath(path, 'color', joinHex(cEl.value, op)); setPath(path, 'op', op); if (pr === 'op') t.title = 'Opacidad ' + t.value + '%';
        }
      } else if (t.dataset.vu !== undefined) { // visibilidad
        const u = t.dataset.vu, p = t.dataset.vp; vis[u] = vis[u] || {}; vis[u][p] = p === 'on' ? t.checked : +t.value;
      }
    };
    el.addEventListener('input', onEdit); el.addEventListener('change', onEdit);
    el.addEventListener('click', e => {
      const t = e.target;
      if (t === el || t.closest('.cfg-x') || t.dataset.act === 'cancel') return close();
      if (t.dataset.tab) { tab = t.dataset.tab; draw(); return; }
      if (t.classList.contains('cfg-tip-btn')) { const row = t.closest('.cfg-row'); let tp = row.nextElementSibling; if (tp && tp.classList.contains('cfg-tip')) tp.remove(); else { tp = document.createElement('div'); tp.className = 'cfg-tip'; tp.textContent = t.dataset.tip; row.after(tp); } return; }
      if (t.dataset.act === 'reset') { for (const i of cfg.inputs) vals[i.key] = i.def; for (const k of Object.keys(st)) delete st[k]; for (const k of Object.keys(vis)) delete vis[k]; draw(); return; }
      if (t.dataset.act === 'ok') {
        const changed = {}; for (const i of cfg.inputs) if (JSON.stringify(vals[i.key]) !== JSON.stringify(i.def)) changed[i.key] = vals[i.key];
        const clean = o => { const r = {}; for (const g of Object.keys(o)) { const m = {}; for (const k of Object.keys(o[g] || {})) if (Object.keys(o[g][k]).length) m[k] = o[g][k]; if (Object.keys(m).length) r[g] = m; } return r; };
        const visClean = {}; for (const u of Object.keys(vis)) { const v = vis[u], d = UNITS.find(x => x[0] === u); if (v.on === false || (v.min != null && v.min !== d[2]) || (v.max != null && v.max !== d[3])) visClean[u] = v; }
        close(); cfg.onApply({inputs: changed, style: clean(st), vis: visClean});
      }
    });
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true); dlg = {el, onKey}; draw();
  }
  const api = {open, close, UNITS, hexOf, joinHex};
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CCTSettings = api;
})(typeof self !== 'undefined' ? self : this);
