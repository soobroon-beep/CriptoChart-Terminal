/* Interfaz de la pestaña IA (usa ai.js). Chat con el analista de gráficos cripto. */
(function () {
  'use strict';
  if (/[?&]pane=/.test(location.search)) return;
  const AI = window.CCTAICore; if (!AI) return;
  const $ = (s, e) => (e || document).querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const ls = {get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }};
  const st = {hist: [], busy: false, calendar: null, calAt: 0, key: ls.get('cct_ai_key') || '', model: ls.get('cct_ai_model') || 'claude-sonnet-5-5', proxy: ls.get('cct_ai_proxy') || '', mode: ls.get('cct_ai_mode') || 'local', vision: (!ls.get('cct_ai_vision_migrated_v120') &&
      (!ls.get('cct_ai_vision') || ['smol','qwen35','qwen08'].includes(ls.get('cct_ai_vision'))))
      ? 'qwen08cpu' : ls.get('cct_ai_vision') || 'qwen08cpu'};
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
  const modeLabel = () => st.vision === 'qwen08cpu' ? 'Qwen3.5 0.8B CPU' : st.vision === 'qwen08' ? 'Qwen3.5 0.8B local' : st.vision.startsWith('qwen35') ? 'Qwen3.5 local' : st.vision !== 'off' ? 'Visión gratuita' : st.mode === 'claude' && (st.key || st.proxy) ? 'Claude' : 'Local';
  function shell() {
    root.innerHTML = `
      <div class="ai-top"><div class="ai-badge" id="aiBadge"></div><div class="ai-top-r"><button class="ai-brief" id="aiBrief" type="button" title="Resumen del día con tu análisis"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h11a2 2 0 0 1 2 2v13a1 1 0 0 0 1 1H7a2 2 0 0 1-2-2z"/><path d="M18 9h2a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2"/><path d="M9 8h5M9 12h5M9 16h3"/></svg>Brief del día</button><button class="ai-gear" id="aiGear" aria-label="Ajustes de la IA" title="Ajustes de la IA">${CCTI.svg('gear', 16)}</button></div></div>
      <div class="ai-cfg" id="aiCfg" hidden>
        <label class="ai-row"><span>Modo</span><select id="aiMode"><option value="local">Local (gratis, sin clave)</option><option value="claude">Claude (preguntas libres)</option></select></label>\n        <label class="ai-row"><span>Visión gratis para analizar el gráfico</span><select id="aiVision"><option value="qwen08cpu">Qwen3.5 0.8B · CPU probada (recomendada)</option><option value="qwen08">Qwen3.5 0.8B · GPU experimental (más rápida si funciona)</option><option value="qwen35">Qwen3.5 2B · análisis visual avanzado (GPU potente)</option><option value="qwen35pro">Qwen3.5 4B · más potente (GPU con memoria)</option><option value="qwen">Qwen3-VL 2B · alternativa (WebGPU)</option><option value="smol">SmolVLM · básica (compatibilidad)</option><option value="off">Sin IA visual · análisis técnico por datos</option></select></label>\n        <p class="ai-note">Los modelos abiertos se descargan <b>solo al analizar el gráfico</b>, se ejecutan en este dispositivo y no necesitan claves ni cuentas. Qwen3.5 0.8B en CPU ya pasó una prueba completa en Chromium sin WebGPU. La primera descarga puede ser grande y el análisis más lento; la opción GPU sigue disponible y, si falla, intentará CPU. La primera descarga usa tu conexión a Internet; luego puede reutilizar la caché. No existe un modelo gratis que garantice buenas señales de trading: las observaciones visuales se comparan con velas, EMAs, volumen, POC y tus dibujos. Si la GPU no permite usarlo, el análisis por datos sigue disponible.</p>
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
  // Captura literal del canvas que Vortex acaba de pintar. Este canvas incluye
  // las velas, indicadores de precio, volumen, osciladores, VPVR y dibujos.
  // Dejamos una copia visible para comprobar exactamente qué imagen se envió.
  function captureChart(ctx) {
    captureChart.lastMeta = null;
    try {
      const source = document.getElementById('priceCanvas');
      if (!ctx || !source || source.width < 300 || source.height < 200) return null;
      // Redimensionar ANTES de codificar; el modelo no recibirá un PNG gigante.
      const maxW = 1152, maxH = 832;
      const scale = Math.min(1, maxW / source.width, (maxH - 58) / source.height);
      const w = Math.max(1, Math.round(source.width * scale));
      const h = Math.max(1, Math.round(source.height * scale));
      const labels = ctx.chart && ctx.chart.names || ctx.active || [];
      const scripts = ctx.chart && ctx.chart.pine || ctx.pine || [];
      const title = String(ctx.symbol || 'Gráfico') + ' · ' + String(ctx.interval || '') +
        (ctx.chart && ctx.chart.historical ? ' · tramo histórico visible' : '');
      const shot = document.createElement('canvas');
      shot.width = w; shot.height = h + 58;
      const g = shot.getContext('2d', {willReadFrequently:true});
      if (!g) return null;
      g.fillStyle = '#090e19'; g.fillRect(0,0,shot.width,shot.height);
      g.fillStyle = '#eff2ff'; g.font = 'bold 17px system-ui, Arial, sans-serif';
      g.fillText(title, 10, 21, w - 20);
      g.fillStyle = '#9aadd7'; g.font = '11px system-ui, Arial, sans-serif';
      const names = labels.slice(0, 10).concat(scripts.map(x => x.name).slice(0, 4));
      g.fillText(('Indicadores visibles: ' + (names.join(' · ') || 'ninguno')).slice(0, 140),10,43,w-20);
      g.drawImage(source,0,58,w,h);
      // Verificación de diversidad visual: evita enviar un lienzo negro/vacío.
      // La lectura de píxeles puede no estar permitida en algunos dispositivos;
      // en ese caso la previsualización permite comprobar el resultado.
      if (typeof g.getImageData === 'function') {
        try {
          const pixels = g.getImageData(0,58,w,h).data;
          const unique = new Set();
          const stride = Math.max(1, Math.floor(w / 40));
          const stepY = Math.max(1, Math.floor(h / 22));
          for (let y=0;y<h;y+=stepY) for (let x=0;x<w;x+=stride) {
            const i = (y*w+x)*4;
            unique.add((pixels[i] >> 4)*256 + (pixels[i+1] >> 4)*16 + (pixels[i+2] >> 4));
          }
          if (unique.size <= 2) return null;
        } catch {}
      }
      const png = shot.toDataURL('image/png');
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png) || png.length > 3000000) return null;
      captureChart.lastMeta = {width:w,height:h+58,symbol:String(ctx.symbol || ''),
        interval:String(ctx.interval || ''),indicatorCount:names.length};
      return png;
    } catch {return null;}
  }
  function uniqueVisualDetail(t, ctx, analyst) {
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
    // Los valores numéricos provienen de las velas, NO de una estimación visual.
    if (/\b\d+[.,]\d+\b/.test(n)) return false;
    const active = ctx && ctx.chart && ctx.chart.active || ctx && ctx.active || [];
    if (/\bema\b/.test(n) && !active.some(k => /^ema|^nnEma$/.test(k))) return false;
    if (/\bpoc\b/.test(n) && !active.some(k => /^(vpvr|nnVP)$/.test(k))) return false;
    const facts = analyst && ctx && analyst.facts(ctx);
    if (facts) {
      if (facts.trend === 'bajista' && /(?:tendencia|movimiento|impulso) alcista/.test(n)) return false;
      if (facts.trend === 'alcista' && /(?:tendencia|movimiento|impulso) bajista/.test(n)) return false;
    }
    return /\b(vela|velas|zona|zonas|rectangulo|linea|lineas|flecha|nube|canal|volumen|poc|ruptura|rebote|soporte|resistencia|oscilador|senal|indicador)\b/i.test(n);
  }
  // La inferencia visual es OPCIONAL y asíncrona. Nunca bloquea el chat ni
  // el botón Analizar gráfico: el análisis del rango visible se entrega primero.
  // La misma cadena PNG que recibe el Worker se muestra aquí, sin regenerarla.
  // Así se puede comprobar moneda, temporalidad, volumen, oscilador y dibujos.
  function screenshotPreview(screenshot, ctx) {
    const details = document.createElement('details');
    details.className = 'ai-screenshot-preview';
    details.style.margin = '7px 0';
    const summary = document.createElement('summary');
    summary.textContent = 'Ver captura real enviada al modelo';
    summary.style.cursor = 'pointer';
    summary.style.fontSize = '11px';
    const info = document.createElement('div');
    const meta = captureChart.lastMeta || {};
    info.textContent = (meta.symbol || ctx.symbol || '') + ' · ' +
      (meta.interval || ctx.interval || '') +
      (meta.width ? ' · ' + meta.width + ' × ' + meta.height + ' píxeles' : '') +
      ' · imagen PNG';
    info.style.fontSize='10px'; info.style.margin='5px 0';
    const image = document.createElement('img');
    image.src = screenshot;
    image.alt = 'Captura literal del gráfico y de los indicadores enviada a la IA visual';
    image.style.width='100%'; image.style.maxHeight='270px';
    image.style.objectFit='contain';
    image.style.borderRadius='6px';
    details.appendChild(summary);
    details.appendChild(info);
    details.appendChild(image);
    return details;
  }
  function launchVisual({message, core, ctx, screenshot, q, analyst, entry}) {
    const vision = window.CCTFreeVision;
    if (!vision || st.vision === 'off') return;
    if (!screenshot) {
      const notice = document.createElement('p');
      notice.className='ai-vision-progress';
      notice.textContent='No se pudo capturar el lienzo del gráfico. Vuelve a abrir la pestaña Gráfico y prueba de nuevo.';
      message.appendChild(notice);
      return;
    }
    const preview = screenshotPreview(screenshot, ctx);
    message.appendChild(preview);
    if (vision.isBusy && vision.isBusy()) {
      const note = document.createElement('p');
      note.className = 'ai-vision-progress';
      note.textContent = 'Hay otra captura en proceso. Puedes seguir usando el chat o cancelar la lectura anterior.';
      message.appendChild(note);
      return;
    }
    const status = document.createElement('div');
    status.className = 'ai-vision-progress';
    status.setAttribute('role','status');
    const label = document.createElement('span');
    label.textContent = 'Preparando IA visual… Puedes seguir preguntando.';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'small-button';
    cancel.textContent = 'Cancelar visión';
    cancel.setAttribute('aria-label','Cancelar análisis visual de la captura');
    cancel.style.marginLeft = '8px';
    status.appendChild(label); status.appendChild(cancel); message.appendChild(status);
    cancel.addEventListener('click', () => {
      cancel.disabled = true;
      if (vision.cancel) vision.cancel();
    });
    const model = st.vision; // Modelo elegido cuando se capturó este gráfico.
    label.textContent = 'Captura PNG verificada y enviada al motor de visión; procesando…';
    const runModel = name => vision.analyze({
      ctx, screenshot, model:name, question:q,
      onProgress:text => { if (status.isConnected) label.textContent = String(text || 'Analizando la captura…'); }
    });
    runModel(model).catch(error => {
      const reason=String(error && error.message || error);
      // Si WebGPU falla o se atasca, usa automáticamente la ruta CPU.
      // Cancelaciones voluntarias no reinician la inferencia.
      if (model === 'qwen08' && !/cancelad/i.test(reason)) {
        label.textContent = 'La generación WebGPU no terminó. Probando Qwen con CPU (puede tardar)…';
        return runModel('qwen08cpu');
      }
      throw error;
    }).then(response => {
      if (!message.isConnected) return;
      const observation = String(response.text || '').trim();
      if (uniqueVisualDetail(observation,ctx,analyst)) {
        const final = core + '\n\n**Observación visual de ' + response.model + ':** ' + observation;
        message.innerHTML = md(final);
        message.appendChild(preview);
        label.textContent = 'Lectura visual completada. La imagen enviada está disponible arriba.';
        message.appendChild(status);
        if (entry) entry.text = final;
      } else {
        label.textContent = 'La visión no encontró detalles adicionales fiables. Se conserva el análisis técnico.';
        cancel.remove();
      }
    }).catch(error => {
      if (!message.isConnected) return;
      const reason = String(error && error.message || error);
      const suffix = /cancelado/i.test(reason)
        ? 'Visión cancelada. La lectura del gráfico permanece disponible.'
        : /demasiado|límite|responder|agotó/i.test(reason)
        ? 'La IA visual tardó demasiado y fue detenida. El análisis técnico sigue disponible.'
        : /WebGPU|memoria|GPU/i.test(reason)
        ? 'Este equipo no pudo ejecutar el modelo de visión. El análisis por datos sí funciona.'
        : 'No se pudo completar la lectura visual. El análisis técnico sigue disponible.';
      label.textContent = suffix;
      cancel.remove();
    }).finally(() => { if (status.isConnected) cancel.remove(); });
  }
  async function ask(q, shown) {
    q = String(q || '').trim();
    if (!q || st.busy) return;
    st.busy = true; $('#aiSend').disabled = true; push('user', shown || q);
    try {
      const analyst = window.CCTChartAnalyst;
      const isBrief = AI.intent(q) === 'brief';
      const isChart = !isBrief && !!(analyst && analyst.isChartQuestion(q));
      const ctx = window.CCT_getAIContext && window.CCT_getAIContext();
      const news = !isChart && window.CCTNews && window.CCTNews.items ? window.CCTNews.items() : [];
      const cal = isChart ? [] : await loadCalendar();
      const market = isBrief && window.CCT_getMarketSnapshot ? await window.CCT_getMarketSnapshot() : [];
      const extra = {news,calendar:cal||[],market,now:Date.now()};
      if (ctx && (isChart || (st.mode === 'claude' && (st.key || st.proxy))))
        extra.screenshot = captureChart(ctx);
      if (isChart) extra.chartSnapshotMode = true;
      let out;
      if (!ctx && isBrief) out = AI.briefLocal(null,extra);
      else if (!ctx) out = 'Abre primero **Gráfico** y espera a que carguen las velas.';
      else if (isChart) out = analyst.answer(q,ctx);
      else if (st.mode === 'claude' && (st.key || st.proxy) && AI.intent(q) !== 'off') {
        try { out = await AI.askClaude({key:st.key,model:st.model,proxy:st.proxy},ctx,st.hist,q,extra); }
        catch (e) { out = 'No se pudo consultar el modelo remoto.\n\n'+AI.answerLocal(q,ctx,extra); }
      } else out = AI.answerLocal(q,ctx,extra);
      if (mostlyEnglish(out)) out = ctx
        ? isChart ? analyst.answer(q,ctx) : AI.answerLocal(q,ctx,extra)
        : 'No pude obtener una respuesta en español.';
      const message = push('bot',out);
      const entry = {role:'assistant',text:out};
      st.hist.push({role:'user',text:q},entry);
      if (st.hist.length > 16) st.hist.splice(0,2);
      // Al llegar aquí ya se mostró la respuesta principal, sin esperar la GPU.
      if (isChart && ctx) launchVisual({message,core:out,ctx,screenshot:extra.screenshot,q,analyst,entry});
    } catch(e) {
      push('bot','No pude completar esta solicitud: '+String(e && e.message || e).slice(0,160));
    } finally {
      st.busy = false; $('#aiSend').disabled = false; badge();
      $('#aiInput').focus({preventScroll:true});
    }
  }
  function init() {
    root = document.getElementById('aiRoot'); if (!root) return; shell();
    ls.set('cct_ai_vision_migrated_v119', '1');
    ls.set('cct_ai_vision_migrated_v120','1');
    ls.set('cct_ai_vision', st.vision);
    if (window.CCTAIUI) window.CCTAIUI.analyzeVisibleChart = () => ask('Analiza el gráfico', 'Analizar gráfico con IA');
    push('bot', 'Hola. Puedes usar **Analizar gráfico con IA** para intentar una lectura real de la captura con un modelo abierto gratuito en tu dispositivo. También puedo consultar los datos del gráfico, noticias y calendario económico.');
    root.addEventListener('click', e => {
      if (e.target.closest('#aiBrief')) { ask(BRIEF_Q, 'Brief del día'); return; }
      const q = e.target.closest('[data-q]'); if (q) { ask(q.dataset.q); return; }
      if (e.target.closest('#aiGear')) { $('#aiCfg').hidden = !$('#aiCfg').hidden; return; }
      if (e.target.closest('#aiSave')) { st.vision = $('#aiVision').value; ls.set('cct_ai_vision', st.vision); st.mode = $('#aiMode').value; st.key = $('#aiKey').value.trim(); st.model = $('#aiModel').value.trim() || 'claude-sonnet-5-5'; st.proxy = $('#aiProxy').value.trim(); ls.set('cct_ai_mode', st.mode); ls.set('cct_ai_key', st.key || null); ls.set('cct_ai_model', st.model); ls.set('cct_ai_proxy', st.proxy || null); $('#aiCfg').hidden = true; badge(); push('bot', st.mode === 'claude' && (st.key || st.proxy) ? 'Modo **Claude** activado: ahora puedo responder preguntas libres sobre cripto usando los datos de tu gráfico.' : 'Modo Local guardado. Visión para gráficos: **' + (st.vision === 'off' ? 'desactivada' : st.vision === 'qwen08cpu' ? 'Qwen3.5 0.8B CPU' : st.vision === 'qwen08' ? 'Qwen3.5 0.8B' : st.vision === 'qwen35' ? 'Qwen3.5 2B' : st.vision === 'qwen35pro' ? 'Qwen3.5 4B' : st.vision === 'qwen' ? 'Qwen3-VL' : 'SmolVLM') + '**. No necesitas una clave para el análisis visual gratuito.'); return; }
      if (e.target.closest('#aiClear')) { st.key = ''; $('#aiKey').value = ''; ls.set('cct_ai_key', null); badge(); }
    });
    $('#aiForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#aiInput'), v = i.value; i.value = ''; ask(v); });
    document.addEventListener('click', e => { if (e.target.closest('[data-side="aiView"],[data-view="aiView"]')) setTimeout(badge, 60); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
