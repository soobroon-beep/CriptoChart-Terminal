/* Interfaz de la pestaña IA (usa ai.js). Chat con el analista de gráficos cripto. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const AI = window.CCTAICore; if (!AI) return;
  const $ = (s, e) => (e || document).querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const ls = {get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }};
  const st = {hist: [], busy: false, calendar: null, calAt: 0, key: ls.get('cct_ai_key') || '', model: ls.get('cct_ai_model') || 'claude-sonnet-5-5', proxy: ls.get('cct_ai_proxy') || '', mode: ls.get('cct_ai_mode') || 'local'};
  let root;
  function md(t) { // Markdown mínimo y seguro: ###, **negrita**, _cursiva_, listas, párrafos
    const out = []; let list = false;
    for (let ln of String(t).split('\n')) {
      let h = esc(ln).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_(.+?)_(?=[\s).,;:]|$)/g, '$1<i>$2</i>');
      const li = /^\s*[-•] (.*)/.exec(h);
      if (li) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + li[1] + '</li>'); continue; }
      if (list) { out.push('</ul>'); list = false; }
      const hd = /^#{2,4} (.*)/.exec(h); if (hd) out.push('<h4>' + hd[1] + '</h4>'); else if (h.trim()) out.push('<p>' + h + '</p>');
    }
    if (list) out.push('</ul>'); return out.join('');
  }
  async function loadCalendar() {
    if (st.calendar && Date.now() - st.calAt < 600e3) return st.calendar;
    try { const r = await fetch('calendar-data.json?_=' + Math.floor(Date.now() / 6e4), {cache: 'no-store'}); if (r.ok) { const j = await r.json(); st.calendar = j.events || []; st.calAt = Date.now(); } } catch {}
    return st.calendar;
  }
  const modeLabel = () => st.mode === 'claude' && (st.key || st.proxy) ? 'Claude' : 'Local';
  function shell() {
    root.innerHTML = `
      <div class="ai-top"><div class="ai-badge" id="aiBadge"></div><button class="ai-gear" id="aiGear" aria-label="Ajustes de la IA" title="Ajustes de la IA">⚙</button></div>
      <div class="ai-cfg" id="aiCfg" hidden>
        <label class="ai-row"><span>Modo</span><select id="aiMode"><option value="local">Local (gratis, sin clave)</option><option value="claude">Claude (preguntas libres)</option></select></label>
        <label class="ai-row"><span>Clave de Anthropic</span><input id="aiKey" type="password" placeholder="sk-ant-…" autocomplete="off" spellcheck="false"></label>
        <label class="ai-row"><span>Modelo</span><input id="aiModel" placeholder="claude-sonnet-5-5" autocomplete="off" spellcheck="false"></label>
        <label class="ai-row"><span>Servidor propio (opcional)</span><input id="aiProxy" placeholder="https://tu-worker.workers.dev" autocomplete="off" spellcheck="false"></label>
        <p class="ai-note">La clave se guarda <b>solo en este navegador</b> (no se sincroniza ni se sube). Con ella, tus preguntas y un resumen del gráfico viajan a Anthropic. Si pones un servidor propio, no hace falta clave aquí. El modo Local no envía nada a ningún lado.</p>
        <div class="ai-row"><button class="small-button" id="aiSave">Guardar</button><button class="small-button danger" id="aiClear">Borrar clave</button></div>
      </div>
      <div class="ai-log" id="aiLog" aria-live="polite"></div>
      <div class="ai-chips" id="aiChips">${['Analiza el gráfico', '¿Cuál es la tendencia?', 'Soportes y resistencias', '¿Cómo van mis indicadores?', 'Noticias que me afectan', 'Calendario económico', '¿Qué escenarios ves?', 'Gestión de riesgo'].map(q => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="ai-form" id="aiForm"><input id="aiInput" placeholder="Pregunta sobre tu gráfico, indicadores o el mercado cripto…" autocomplete="off" maxlength="600"><button class="ai-send" id="aiSend" aria-label="Enviar">➤</button></form>
      <p class="ai-disc">Análisis educativo basado en tus datos. No es asesoría financiera.</p>`;
    $('#aiMode').value = st.mode; $('#aiKey').value = st.key; $('#aiModel').value = st.model; $('#aiProxy').value = st.proxy; badge();
  }
  function badge() { const el = $('#aiBadge'); if (!el) return; const c = window.CCT_getAIContext && window.CCT_getAIContext(); el.innerHTML = `<span class="ai-dot"></span>${c ? esc(c.symbol) + ' · ' + esc(c.interval) : 'Sin gráfico cargado'} <i>${modeLabel()}</i>`; }
  function push(role, text, extra) {
    const log = $('#aiLog'); const d = document.createElement('div'); d.className = 'ai-msg ' + role + (extra ? ' ' + extra : '');
    d.innerHTML = role === 'user' ? `<p>${esc(text)}</p>` : md(text); log.appendChild(d); log.scrollTo({top: log.scrollHeight, behavior: 'smooth'}); return d;
  }
  async function ask(q) {
    q = String(q || '').trim(); if (!q || st.busy) return; st.busy = true; $('#aiSend').disabled = true; push('user', q);
    const ctx = window.CCT_getAIContext && window.CCT_getAIContext(), news = window.CCTNews && window.CCTNews.items ? window.CCTNews.items() : [], cal = await loadCalendar(), extra = {news, calendar: cal || [], now: Date.now()};
    const typing = push('bot', '…', 'typing'); let out, useClaude = st.mode === 'claude' && (st.key || st.proxy) && ctx;
    try {
      if (!ctx) out = 'Aún no hay un gráfico con velas cargadas. Abre la pestaña **Gráfico**, espera a que cargue y pregúntame de nuevo.';
      else if (useClaude && AI.intent(q) !== 'off') { try { out = await AI.askClaude({key: st.key, model: st.model, proxy: st.proxy}, ctx, st.hist, q, extra); } catch (e) { out = '⚠ ' + (e.message || 'No se pudo consultar a Claude') + '\n\nTe respondo con el análisis local:\n\n' + AI.answerLocal(q, ctx, extra); } }
      else out = AI.answerLocal(q, ctx, extra);
    } catch (e) { out = 'Ocurrió un error al analizar: ' + (e.message || e); }
    typing.remove(); push('bot', out); st.hist.push({role: 'user', text: q}, {role: 'assistant', text: out}); if (st.hist.length > 16) st.hist.splice(0, 2);
    st.busy = false; $('#aiSend').disabled = false; badge(); $('#aiInput').focus({preventScroll: true});
  }
  function init() {
    root = document.getElementById('aiRoot'); if (!root) return; shell();
    push('bot', 'Hola 👋 Soy tu **analista de gráficos cripto**. Leo tu gráfico abierto con los indicadores que tengas activados, las noticias y el calendario económico.\n\nToca una sugerencia o escríbeme tu pregunta.');
    root.addEventListener('click', e => {
      const q = e.target.closest('[data-q]'); if (q) { ask(q.dataset.q); return; }
      if (e.target.closest('#aiGear')) { $('#aiCfg').hidden = !$('#aiCfg').hidden; return; }
      if (e.target.closest('#aiSave')) { st.mode = $('#aiMode').value; st.key = $('#aiKey').value.trim(); st.model = $('#aiModel').value.trim() || 'claude-sonnet-5-5'; st.proxy = $('#aiProxy').value.trim(); ls.set('cct_ai_mode', st.mode); ls.set('cct_ai_key', st.key || null); ls.set('cct_ai_model', st.model); ls.set('cct_ai_proxy', st.proxy || null); $('#aiCfg').hidden = true; badge(); push('bot', st.mode === 'claude' && (st.key || st.proxy) ? 'Modo **Claude** activado: ahora puedo responder preguntas libres sobre cripto usando los datos de tu gráfico.' : 'Modo **Local** activo (sin clave, sin enviar datos).'); return; }
      if (e.target.closest('#aiClear')) { st.key = ''; $('#aiKey').value = ''; ls.set('cct_ai_key', null); badge(); }
    });
    $('#aiForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#aiInput'), v = i.value; i.value = ''; ask(v); });
    document.addEventListener('click', e => { if (e.target.closest('[data-side="aiView"],[data-view="aiView"]')) setTimeout(badge, 60); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
