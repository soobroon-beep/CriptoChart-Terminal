/* VORTEX · Laboratorio de indicadores IA. Solo interfaz del módulo IA.
   Código Pine interpretado por el motor existente, sin eval/Function de scripts generados. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  let root, panel, nav, currentId = null, history = [], busy = false;
  const $ = id => root && root.querySelector('#' + id);
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const val = id => ($(id) && $(id).value || '').trim();
  function setting(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
  function status(t, error) {
    if (!panel) return;
    const x = $('aiLabStatus'); x.textContent = t; x.dataset.error = error ? '1' : '0';
  }
  function mode(which) {
    if (!panel) return;
    const lab = which === 'lab';
    panel.hidden = !lab;
    for (const id of ['aiLog', 'aiChips', 'aiForm', 'aiSend']) {
      const e = $(id); if (e) e.style.display = lab ? 'none' : '';
    }
    nav.querySelectorAll('button').forEach(b => {
      const active = b.dataset.aiMode === which;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    if (lab) { renderSaved(); $('aiLabDesc').focus({preventScroll:true}); }
  }
  function renderSaved() {
    const bridge = window.CCTAILab, list = bridge ? bridge.list() : [], box = $('aiLabSaved');
    if (!box) return;
    box.innerHTML = list.length ? list.map(i =>
      '<div class="ai-lab-item"><div><strong>' + esc(i.name) + '</strong><small>' + (i.on ? 'Visible en gráfico' : 'Guardado') + '</small></div>' +
      '<div><button type="button" data-lab-load="' + esc(i.id) + '">Editar</button><button type="button" data-lab-delete="' + esc(i.id) + '">Eliminar</button></div></div>'
    ).join('') : '<p class="ai-lab-muted">Todavía no tienes indicadores creados por el Laboratorio. Los indicadores originales permanecen aparte.</p>';
  }
  function intro() {
    const style = document.createElement('style');
    style.textContent = [
      '#aiRoot .ai-workflows{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0 12px;max-width:100%;}',
      '#aiRoot .ai-workflows button{flex:1 1 145px;min-width:0;border:1px solid var(--border,#34445a);background:rgba(120,130,180,.09);color:inherit;padding:9px 8px;border-radius:12px;font:inherit;font-size:12px;cursor:pointer;transition:background .18s,transform .18s}',
      '#aiRoot .ai-workflows button:hover{background:rgba(110,132,255,.2);transform:translateY(-1px)}',
      '#aiRoot .ai-workflows button.active{border-color:#8b7aff;background:rgba(120,95,235,.19)}',
      '#aiRoot .ai-lab{padding:10px 2px 16px;min-width:0;width:100%;max-width:100%;overflow-x:hidden}',
      '#aiRoot .ai-lab[hidden]{display:none!important}',
      '#aiRoot .ai-lab h3{font-size:15px;margin:8px 0}',
      '#aiRoot .ai-lab label{display:block;font-size:12px;opacity:.88;margin:12px 0 5px}',
      '#aiRoot .ai-lab textarea,#aiRoot .ai-lab input{display:block;box-sizing:border-box;width:100%;min-width:0;max-width:100%;color:inherit;background:rgba(95,105,150,.1);border:1px solid rgba(135,147,190,.35);border-radius:10px;padding:10px;font:inherit;font-size:13px}',
      '#aiRoot .ai-lab textarea{resize:vertical;min-height:72px;max-height:48vh}',
      '#aiRoot .ai-lab #aiLabCode{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;min-height:180px;white-space:pre;overflow:auto}',
      '#aiRoot .ai-lab-actions{display:flex;flex-wrap:wrap;gap:7px;margin:11px 0}',
      '#aiRoot .ai-lab-actions button,#aiRoot .ai-lab-item button{padding:8px 10px;border-radius:9px;border:1px solid rgba(150,165,205,.4);background:rgba(105,110,190,.17);color:inherit;font:inherit;font-size:12px;cursor:pointer}',
      '#aiRoot .ai-lab-actions button:first-child{background:rgba(109,90,246,.24);border-color:#8b7aff}',
      '#aiRoot .ai-lab-actions button:disabled{opacity:.5;cursor:wait}',
      '#aiRoot .ai-lab-status{font-size:12px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0;color:inherit}',
      '#aiRoot .ai-lab-status[data-error="1"]{color:#ff8c9a}',
      '#aiRoot .ai-lab-muted{font-size:12px;opacity:.72;line-height:1.5}',
      '#aiRoot .ai-lab-item{display:flex;gap:8px;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(145,145,170,.2);padding:9px 0;flex-wrap:wrap}',
      '#aiRoot .ai-lab-item small{display:block;font-size:11px;opacity:.65;margin-top:3px}',
      '#aiRoot .ai-lab-item>div:last-child{display:flex;gap:6px}'
    ].join('\n');
    document.head.appendChild(style);
    nav = document.createElement('nav');
    nav.className = 'ai-workflows'; nav.setAttribute('aria-label', 'Herramientas IA');
    nav.innerHTML = '<button type="button" data-ai-mode="brief">Briefing Inteligente</button>' +
      '<button type="button" data-ai-mode="chat" class="active">Analizar gráfico con IA</button>' +
      '<button type="button" data-ai-mode="lab">Laboratorio de Indicadores IA</button>';
    const top = root.querySelector('.ai-top');
    if (top) top.insertAdjacentElement('afterend', nav);
    else root.prepend(nav);
    panel = document.createElement('section');
    panel.className = 'ai-lab'; panel.hidden = true;
    panel.innerHTML = [
      '<h3>Laboratorio de Indicadores IA</h3>',
      '<p class="ai-lab-muted">Describe tu indicador en español. Genera una receta local compatible o, si configuras un servidor IA seguro en Ajustes, un indicador personalizado. Todo se valida con las velas del gráfico antes de guardarse.</p>',
      '<label for="aiLabDesc">¿Qué indicador quieres crear o qué deseas cambiar?</label>',
      '<textarea id="aiLabDesc" rows="3" maxlength="1200" placeholder="Ejemplo: combina RSI, MACD y volumen para buscar coincidencias alcistas y bajistas"></textarea>',
      '<div class="ai-lab-actions"><button type="button" id="aiLabGenerate">Generar indicador</button><button type="button" id="aiLabEdit">Editar con IA</button></div>',
      '<label for="aiLabName">Nombre</label><input id="aiLabName" maxlength="80" placeholder="Mi indicador IA">',
      '<label for="aiLabCode">Código Pine compatible (puedes revisarlo y modificarlo)</label>',
      '<textarea id="aiLabCode" rows="11" spellcheck="false" autocapitalize="off" placeholder="Aquí aparecerá el código real del indicador."></textarea>',
      '<div class="ai-lab-actions"><button type="button" id="aiLabTest">Probar en gráfico</button><button type="button" id="aiLabSave">Guardar indicador</button><button type="button" id="aiLabView">Ver gráfico</button></div>',
      '<div id="aiLabStatus" class="ai-lab-status" role="status" aria-live="polite">El motor de Vortex comprobará el código sobre hasta 500 velas reales. Probar lo añade a tu gráfico; no ejecuta operaciones.</div>',
      '<h3>Mis indicadores IA</h3><div id="aiLabSaved"></div>',
      '<p class="ai-lab-muted">Las señales históricas no son rentabilidad. Un backtest requiere estrategia, comisiones, deslizamiento y prueba fuera de muestra. Nunca se modifican Nova Nexus, Nova Oscillator ni Nova Screener.</p>'
    ].join('');
    nav.insertAdjacentElement('afterend', panel);
    nav.addEventListener('click', e => {
      const b = e.target.closest('[data-ai-mode]'); if (!b) return;
      if (b.dataset.aiMode === 'brief') {
        mode('brief'); const old = $('#aiBrief'); if (old && !old.disabled) old.click();
      } else {
        mode(b.dataset.aiMode);
        // Al pulsar "Analizar gráfico con IA", analizar realmente el canvas y no solo abrir el chat.
        if (b.dataset.aiMode === 'chat' && window.CCTAIUI && typeof window.CCTAIUI.analyzeVisibleChart === 'function')
          window.CCTAIUI.analyzeVisibleChart();
      }
    });
    panel.addEventListener('click', click);
    // El atajo original de Brief también debe mostrar la conversación si se estaba en Laboratorio.
    const briefShortcut = root.querySelector('#aiBrief');
    if (briefShortcut) briefShortcut.addEventListener('click', () => mode('brief'));
    renderSaved();
  }
  function setBusy(on) {
    busy = on;
    if (!panel) return;
    for (const id of ['aiLabGenerate', 'aiLabEdit', 'aiLabSave', 'aiLabTest']) $(id).disabled = on;
  }
  async function remoteDraft(description, prior) {
    const proxy = setting('cct_ai_proxy');
    if (!/^https:\/\//i.test(proxy)) throw Error('Configura primero un servidor IA HTTPS en el engrane de IA. No envíes claves privadas desde esta página.');
    const prompt = prior
      ? 'MODIFICA este indicador Pine manteniendo sus funciones útiles:\n' + prior + '\n\nCAMBIO SOLICITADO:\n' + description
      : 'CREA un indicador Pine v5 para VORTEX con esta descripción:\n' + description;
    const system = 'Eres programador de indicadores para VORTEX, que ya tiene un intérprete Pine v5 parcial. Devuelve EXCLUSIVAMENTE código Pine comenzando por //@version=5 e indicator(...). Usa ta.sma, ta.ema, ta.rsi, ta.highest, ta.lowest, plot, plotshape y aritmética/condicionales simples. No uses import, library, request.*, strategy, credenciales, JS, HTML ni código de red. Máximo 120 líneas. Cada indicador debe dibujar realmente algo sobre las velas. No prometas precisión ni rentabilidad.';
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 45000);
    let txt = '';
    try {
      const res = await fetch(proxy, {method:'POST', headers:{'content-type':'application/json'}, signal:ctl.signal,
        body:JSON.stringify({model:setting('cct_ai_model') || 'claude-sonnet-5-5',max_tokens:2300,system,
          messages:history.slice(-4).concat([{role:'user',content:prompt}])})});
      if (!res.ok) throw Error('El servidor IA devolvió HTTP ' + res.status + '.');
      const j = await res.json();
      txt = (j.content || []).filter(p => p.type === 'text').map(p => p.text).join('\n').trim();
    } finally { clearTimeout(timer); }
    if (!txt) throw Error('El servidor IA no devolvió código.');
    history.push({role:'user',content:prompt},{role:'assistant',content:txt});
    const block = txt.match(/```(?:pine|pinescript)?\s*([\s\S]*?)```/i);
    const code = (block ? block[1] : txt).trim();
    const idx = code.indexOf('//@version=');
    const cleaned = idx >= 0 ? code.slice(idx) : code;
    if (!/indicator\s*\(/.test(cleaned) || cleaned.length > 20000) throw Error('La respuesta no contiene un indicador compatible y seguro.');
    const nm = cleaned.match(/indicator\s*\(\s*["']([^"']+)["']/);
    return {code:cleaned, name:nm ? nm[1] : 'Indicador IA personalizado', mode:'servidor IA', note:'Código generado, pendiente de validación en el motor del gráfico.'};
  }
  async function build(edit) {
    if (busy) return;
    const description = val('aiLabDesc'); if (!description) { status('Escribe una descripción de tu indicador.', true); return; }
    const prior = edit ? val('aiLabCode') : '';
    if (edit && !prior) { status('Primero genera o abre un indicador para editarlo.', true); return; }
    setBusy(true); status('Preparando el indicador y comprobando compatibilidad…');
    try {
      const local = window.CCTAICore && window.CCTAICore.draftIndicator(description);
      const generated = setting('cct_ai_mode') === 'claude' && setting('cct_ai_proxy')
        ? await remoteDraft(description, prior) : (local && !edit ? local : null);
      if (!generated) throw Error('El modo local admite recetas para RSI/MACD/volumen, soportes y resistencias, oscilador RSI, triple EMA o rupturas con volumen. Para otros indicadores y ediciones conversacionales configura un servidor IA HTTPS en Ajustes.');
      $('aiLabName').value = generated.name;
      $('aiLabCode').value = generated.code;
      currentId = null;
      const bridge = window.CCTAILab, v = bridge ? await bridge.validate(generated.code) : {ok:false,error:'El motor gráfico todavía no está disponible.'};
      status((v.ok ? 'Validado con ' + v.bars + ' velas reales: ' + v.plots + ' líneas y ' + v.shapes + ' señales.\n' : 'Código generado, pero falta validarlo: ' + v.error + '\n') + generated.note, !v.ok);
    } catch (e) { status(String(e && e.message || e), true); }
    finally { setBusy(false); }
  }
  async function persist(plot) {
    if (busy) return;
    const code = val('aiLabCode'), name = val('aiLabName');
    if (!code || !name) { status('Hace falta un nombre y código para el indicador.', true); return; }
    const bridge = window.CCTAILab;
    if (!bridge) { status('La conexión al gráfico todavía no está disponible.', true); return; }
    setBusy(true); status('Validando en el motor existente…');
    try {
      const r = await bridge.save(name, code, plot);
      if (!r.ok) { status('No se guardó: ' + (r.error || 'Error de validación') + (r.line ? ' · línea ' + r.line : ''), true); return; }
      currentId = r.id;
      status('Indicador ' + (plot ? 'añadido al gráfico' : 'guardado en Mis indicadores') + '. Validación: ' + r.bars + ' velas, ' + r.plots + ' líneas y ' + r.shapes + ' señales. Las señales no equivalen a un backtest.');
      renderSaved();
    } catch (e) { status(String(e && e.message || e), true); }
    finally { setBusy(false); }
  }
  function click(e) {
    if (e.target.closest('#aiLabGenerate')) { build(false); return; }
    if (e.target.closest('#aiLabEdit')) { build(true); return; }
    if (e.target.closest('#aiLabSave')) { persist(false); return; }
    if (e.target.closest('#aiLabTest')) { persist(true); return; }
    if (e.target.closest('#aiLabView')) {
      const b = document.querySelector('[data-view="chartView"]') || document.querySelector('[data-side="chartView"]');
      if (b) b.click();
      return;
    }
    const load = e.target.closest('[data-lab-load]');
    if (load) {
      const x = (window.CCTAILab && window.CCTAILab.list() || []).find(y => y.id === load.dataset.labLoad);
      if (x) { $('aiLabName').value = x.name; $('aiLabCode').value = x.code; currentId = x.id; status('Indicador cargado. Edita el código, valida y guarda una nueva versión. El original se conserva hasta que decidas eliminarlo.'); }
      return;
    }
    const del = e.target.closest('[data-lab-delete]');
    if (del) {
      const id = del.dataset.labDelete, item = (window.CCTAILab && window.CCTAILab.list() || []).find(x => x.id === id);
      if (item && confirm('¿Eliminar el indicador IA "' + item.name + '"? No afecta a Nova Nexus ni a otros indicadores.')) {
        const ok = window.CCTAILab.remove(id);
        if (ok) { if (currentId === id) currentId = null; renderSaved(); status('Indicador IA eliminado; los originales siguen intactos.'); }
      }
    }
  }
  function init() {
    root = document.getElementById('aiRoot');
    if (!root || !root.querySelector('#aiLog') || root.querySelector('.ai-workflows')) return;
    intro();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
