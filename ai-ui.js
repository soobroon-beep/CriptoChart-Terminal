/* Interfaz de la pestaña IA (usa ai.js). Chat con el analista de gráficos cripto. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const AI = window.CCTAICore; if (!AI) return;
  const $ = (s, e) => (e || document).querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const ls = {get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }};
  const st = {hist: [], busy: false, calendar: null, calAt: 0, key: ls.get('cct_ai_key') || '', model: ls.get('cct_ai_model') || 'claude-sonnet-5-5', proxy: ls.get('cct_ai_proxy') || '', mode: ls.get('cct_ai_mode') || 'local', vision: ls.get('cct_ai_vision') || 'smol'};
  let root;
  function md(t) { // Markdown mínimo y seguro: ###, **negrita**, _cursiva_, listas, párrafos
    const out = []; let list = false;
    for (let ln of String(t).split('\n')) {
      let h = esc(ln).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_(.+?)_(?=[\s).,;:]|$)/g, '$1<i>$2</i>');
      h = h.replace(/\[([^\]]{1,160})\]\((https:\/\/[^\s)]+)\)/g, (m, label, link) => '<a href="' + link + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
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
  const modeLabel = () => st.vision !== 'off' ? 'Visión gratuita' : st.mode === 'claude' && (st.key || st.proxy) ? 'Claude' : 'Local';
  function shell() {
    root.innerHTML = `
      <div class="ai-top"><div class="ai-badge" id="aiBadge"></div><div class="ai-top-r"><button class="ai-brief" id="aiBrief" type="button" title="Resumen del día con tu análisis"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h11a2 2 0 0 1 2 2v13a1 1 0 0 0 1 1H7a2 2 0 0 1-2-2z"/><path d="M18 9h2a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2"/><path d="M9 8h5M9 12h5M9 16h3"/></svg>Brief del día</button><button class="ai-gear" id="aiGear" aria-label="Ajustes de la IA" title="Ajustes de la IA">${CCTI.svg('gear', 16)}</button></div></div>
      <div class="ai-cfg" id="aiCfg" hidden>
        <label class="ai-row"><span>Modo</span><select id="aiMode"><option value="local">Local (gratis, sin clave)</option><option value="claude">Claude (preguntas libres)</option></select></label>\n        <label class="ai-row"><span>Visión gratis para analizar el gráfico</span><select id="aiVision"><option value="smol">SmolVLM · ligera (recomendada)</option><option value="qwen">Qwen3-VL · potente (WebGPU)</option><option value="off">Desactivada · solo lectura de datos</option></select></label>\n        <p class="ai-note">Los modelos abiertos se descargan <b>solo al analizar el gráfico</b>, se ejecutan en este dispositivo y no necesitan claves ni cuentas. Primera descarga: SmolVLM aproximadamente 150–300 MB; Qwen3-VL puede ocupar varios GB. La compatibilidad depende del navegador, memoria y GPU; el modelo puede equivocarse.</p>
        <label class="ai-row"><span>Clave de Anthropic</span><input id="aiKey" type="password" placeholder="sk-ant-…" autocomplete="off" spellcheck="false"></label>
        <label class="ai-row"><span>Modelo</span><input id="aiModel" placeholder="claude-sonnet-5-5" autocomplete="off" spellcheck="false"></label>
        <label class="ai-row"><span>Servidor propio (opcional)</span><input id="aiProxy" placeholder="https://tu-worker.workers.dev" autocomplete="off" spellcheck="false"></label>
        <p class="ai-note">La clave se guarda <b>solo en este navegador</b> (no se sincroniza ni se sube). Con ella, tus preguntas y un resumen del gráfico viajan a Anthropic. Si pones un servidor propio, no hace falta clave aquí. El modo Local no envía nada a ningún lado.</p>
        <div class="ai-row"><button class="small-button" id="aiSave">Guardar</button><button class="small-button danger" id="aiClear">Borrar clave</button></div>
      </div>
      <div class="ai-log" id="aiLog" aria-live="polite"></div>
      <div class="ai-chips" id="aiChips">${['Analiza el gráfico', '¿Cuál es la tendencia?', 'Soportes y resistencias', '¿Cómo van mis indicadores?', 'Noticias que me afectan', 'Calendario económico', '¿Qué escenarios ves?', 'Gestión de riesgo'].map(q => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="ai-form" id="aiForm"><input id="aiInput" placeholder="Pregunta sobre tu gráfico, indicadores o el mercado cripto…" autocomplete="off" maxlength="600"><button class="ai-send" id="aiSend" aria-label="Enviar">${CCTI.svg('send', 16)}</button></form>
      <p class="ai-disc">Análisis educativo basado en tus datos. No es asesoría financiera.</p>`;
    $('#aiMode').value = st.mode; $('#aiVision').value = st.vision; $('#aiKey').value = st.key; $('#aiModel').value = st.model; $('#aiProxy').value = st.proxy; badge();
  }
  function badge() { const el = $('#aiBadge'); if (!el) return; const c = window.CCT_getAIContext && window.CCT_getAIContext(); el.innerHTML = `<span class="ai-dot"></span>${c ? esc(c.symbol) + ' · ' + esc(c.interval) : 'Sin gráfico cargado'} <i>${modeLabel()}</i>`; }
  function push(role, text, extra) {
    const log = $('#aiLog'); const d = document.createElement('div'); d.className = 'ai-msg ' + role + (extra ? ' ' + extra : '');
    d.innerHTML = role === 'user' ? `<p>${esc(text)}</p>` : md(text); log.appendChild(d); log.scrollTo({top: log.scrollHeight, behavior: 'smooth'}); return d;
  }
  // Los modelos remotos también pueden incumplir el idioma solicitado.
  // Solo se permite mostrar inglés cuando sea el nombre técnico de un indicador/activo.
  function mostlyEnglish(text) {
    const t = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const en = (t.match(/\b(the|chart|shows|price|currency|pair|trend|with|from|going|market|last|and|this|that|there|is|are|have|has|should|will|moving|falling|rising|analysis|support|resistance)\b/g) || []).length;
    const es = (t.match(/\b(el|la|los|las|de|del|en|que|se|por|con|y|precio|grafico|velas|tendencia|analisis|zona|movimiento|datos|indicadores|bajista|alcista|noticias|calendario|mercado|una|un|esta|son)\b/g) || []).length;
    return en >= 5 && en > es * 0.8;
  }
  const BRIEF_Q = 'Brief del día: resume el mercado cripto de hoy tomando en cuenta el segmento completo, las noticias, el calendario económico y mi gráfico, y dime hacia dónde es más probable que vaya el mercado, con tu propio análisis.';
  // La app dibuja velas, indicadores, paneles y dibujos manuales en priceCanvas.
  // Se copia su última imagen real (aunque la vista Gráfico esté oculta al abrir IA).
  // El gráfico de Vortex usa un solo canvas para velas, EMAs, bandas,
  // volumen, VPVR, osciladores, indicadores Pine y dibujos de usuario.
  // Capturamos todo su alto real: no se limita al panel de velas.
  function captureChart(ctx) {
    try {
      const source = document.getElementById('priceCanvas');
      if (!ctx || !source || source.width < 300 || source.height < 200) return null;
      const maxW = 1600, maxH = 1150;
      const scale = Math.min(1, maxW/source.width, maxH/source.height);
      const w = Math.round(source.width*scale), h = Math.round(source.height*scale);
      const labels = ctx.chart && ctx.chart.names || ctx.active || [];
      const scripts = ctx.chart && ctx.chart.pine || ctx.pine || [];
      const names = labels.slice(0, 12).concat(scripts.map(x => x.name).slice(0, 5));
      const title = String(ctx.symbol || 'Gráfico')+' · '+String(ctx.interval || '')+
        (ctx.chart && ctx.chart.historical ? ' · tramo histórico visible' : '');
      const shot = document.createElement('canvas'); shot.width = w; shot.height = h + 64;
      const g = shot.getContext('2d'); if (!g) return null;
      g.fillStyle = '#090e19'; g.fillRect(0, 0, w, h+64);
      g.fillStyle = '#eff2ff'; g.font = 'bold 18px system-ui, Arial, sans-serif';
      g.fillText(title, 12, 23, w-24);
      g.fillStyle = '#9aadd7'; g.font = '12px system-ui, Arial, sans-serif';
      const line = 'Indicadores visibles: ' + (names.join(' · ') || 'ninguno');
      g.fillText(line.slice(0, 160), 12, 44, w-24);
      g.drawImage(source, 0, 64, w, h);
      // En condiciones normales una captura de líneas y velas PNG es pequeña.
      // Si excede el límite del modelo no se envía una imagen truncada.
      const png = shot.toDataURL('image/png');
      return /^data:image\/png;base64,/.test(png) && png.length < 3000000 ? png : null;
    } catch { return null; }
  }
  function uniqueVisualDetail(t) {
    const s = String(t || '').trim();
    if (!s || s.split(/\s+/).length > 75) return false;
    const n = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    // No publicar descripciones genéricas del pequeño modelo de 256M.
    if (/el grafico muestra la tendencia del precio|la amplitud de las velas es muy variada/.test(n)) return false;
    const words = n.match(/[\p{L}\p{N}]+/gu) || [];
    if (words.length < 8 || new Set(words).size / words.length < .58) return false;
    const freq = new Map();
    for (let i=0;i<words.length-3;i++) {
      const key=words.slice(i,i+4).join(' '),k=(freq.get(key)||0)+1;freq.set(key,k);
      if (k>=3) return false;
    }
    return /\b(vela|velas|zona|zonas|rectangulo|linea|lineas|flecha|nube|canal|volumen|poc|ruptura|rebote|soporte|resistencia|oscilador|senal|indicador)\b/i.test(n);
  }
  async function ask(q, shown) {
    q = String(q || '').trim();
    if (!q || st.busy) return;
    st.busy = true; $('#aiSend').disabled = true; push('user', shown || q);
    const analyst = window.CCTChartAnalyst;
    const isBrief = AI.intent(q) === 'brief';
    const isChart = !isBrief && !!(analyst && analyst.isChartQuestion(q));
    const ctx = window.CCT_getAIContext && window.CCT_getAIContext();
    const news = !isChart && window.CCTNews && window.CCTNews.items ? window.CCTNews.items() : [];
    const cal = isChart ? [] : await loadCalendar();
    const market = isBrief && window.CCT_getMarketSnapshot ? await window.CCT_getMarketSnapshot() : [];
    const extra = {news,calendar:cal||[],market,now:Date.now()};
    if (ctx && (isChart || st.mode === 'claude' && (st.key || st.proxy)))
      extra.screenshot = captureChart(ctx);
    if (isChart) extra.chartSnapshotMode = true;
    const typing = push('bot', '…', 'typing');
    let out;
    try {
      if (!ctx && isBrief) out = AI.briefLocal(null, extra);
      else if (!ctx) out = 'Todavía no hay velas cargadas. Abre **Gráfico** y vuelve a intentarlo.';
      else if (isChart) {
        // El análisis contrastable siempre se calcula del MISMO tramo visible,
        // sin consultar RSI/MACD/Bollinger a menos que se hayan activado.
        out = analyst.answer(q, ctx);
        if (st.vision !== 'off' && window.CCTFreeVision && extra.screenshot) {
          try {
            const response = await window.CCTFreeVision.analyze({
              ctx,screenshot:extra.screenshot,model:st.vision,question:q,
              onProgress: message => {
                if (typing.isConnected) typing.textContent = String(message || 'Analizando el gráfico…');
              }
            });
            const observation = String(response.text || '').trim();
            // La visión es una observación auxiliar, no puede sustituir datos
            // ni incluir precios / niveles inventados.
            if (uniqueVisualDetail(observation))
              out += '\n\n**Detalle visual orientativo (' + response.model + '):** ' + observation;
          } catch (e) {
            // Fallo de GPU/modelo/idioma no borra el análisis del gráfico.
            out += '\n\n*La IA visual no pudo aportar detalles fiables; el análisis anterior utiliza los datos del gráfico.*';
          }
        }
      }
      else if (st.mode === 'claude' && (st.key || st.proxy) && AI.intent(q) !== 'off') {
        try {
          out = await AI.askClaude({key:st.key,model:st.model,proxy:st.proxy},ctx,st.hist,q,extra);
        } catch (e) {
          out = 'No se pudo consultar el modelo remoto. Respuesta local:\n\n' + AI.answerLocal(q,ctx,extra);
        }
      } else out = AI.answerLocal(q,ctx,extra);
    } catch (e) { out = 'No se pudo completar el análisis: ' + (e.message || e); }
    if (mostlyEnglish(out)) out = ctx
      ? (isChart ? analyst.answer(q,ctx) : AI.answerLocal(q,ctx,extra))
      : 'No pude obtener una respuesta en español. Vuelve a intentarlo.';
    typing.remove(); push('bot', out);
    st.hist.push({role:'user',text:q},{role:'assistant',text:out});
    if(st.hist.length>16)st.hist.splice(0,2);
    st.busy = false; $('#aiSend').disabled = false; badge();
    $('#aiInput').focus({preventScroll:true});
  }
  function init() {
    root = document.getElementById('aiRoot'); if (!root) return; shell();
    if (window.CCTAIUI) window.CCTAIUI.analyzeVisibleChart = () => ask('Analiza el gráfico', 'Analizar gráfico con IA');
    push('bot', 'Hola. Puedes usar **Analizar gráfico con IA** para intentar una lectura real de la captura con un modelo abierto gratuito en tu dispositivo. También puedo consultar los datos del gráfico, noticias y calendario económico.');
    root.addEventListener('click', e => {
      if (e.target.closest('#aiBrief')) { ask(BRIEF_Q, 'Brief del día'); return; }
      const q = e.target.closest('[data-q]'); if (q) { ask(q.dataset.q); return; }
      if (e.target.closest('#aiGear')) { $('#aiCfg').hidden = !$('#aiCfg').hidden; return; }
      if (e.target.closest('#aiSave')) { st.vision = $('#aiVision').value; ls.set('cct_ai_vision', st.vision); st.mode = $('#aiMode').value; st.key = $('#aiKey').value.trim(); st.model = $('#aiModel').value.trim() || 'claude-sonnet-5-5'; st.proxy = $('#aiProxy').value.trim(); ls.set('cct_ai_mode', st.mode); ls.set('cct_ai_key', st.key || null); ls.set('cct_ai_model', st.model); ls.set('cct_ai_proxy', st.proxy || null); $('#aiCfg').hidden = true; badge(); push('bot', st.mode === 'claude' && (st.key || st.proxy) ? 'Modo **Claude** activado: ahora puedo responder preguntas libres sobre cripto usando los datos de tu gráfico.' : 'Modo Local guardado. Visión para gráficos: **' + (st.vision === 'off' ? 'desactivada' : st.vision === 'qwen' ? 'Qwen3-VL' : 'SmolVLM') + '**. No necesitas una clave para el análisis visual gratuito.'); return; }
      if (e.target.closest('#aiClear')) { st.key = ''; $('#aiKey').value = ''; ls.set('cct_ai_key', null); badge(); }
    });
    $('#aiForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#aiInput'), v = i.value; i.value = ''; ask(v); });
    document.addEventListener('click', e => { if (e.target.closest('[data-side="aiView"],[data-view="aiView"]')) setTimeout(badge, 60); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
