/* VORTEX · Cliente de IA visual gratuita. No requiere claves ni backend. */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  let worker = null, job = null, seq = 0;
  const MODELS = Object.freeze({smol:'SmolVLM-256M',qwen:'Qwen3-VL-2B',qwen08:'Qwen3.5-VL-0.8B',qwen35:'Qwen3.5-VL-2B',qwen35pro:'Qwen3.5-VL-4B'});
  const label = id => MODELS[id] || MODELS.qwen08;
  const short = s => String(s || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 100);
  // Prompt visual conciso: Qwen recibe los píxeles reales; los cálculos
  // de niveles precisos los aporta el analista técnico de Vortex.
  function prompt(ctx, question) {
    const active = Array.isArray(ctx.chart && ctx.chart.active) ? ctx.chart.active : ctx.active || [];
    const names = Array.isArray(ctx.chart && ctx.chart.names) ? ctx.chart.names : active;
    const scripts = (ctx.chart && ctx.chart.pine || ctx.pine || [])
      .map(x => short(x.name)).slice(0, 4);
    const q = short(question || '¿Qué hacen las velas y el volumen?');
    return [
      'Lee ESTA IMAGEN real de un gráfico de trading, no solo sus etiquetas.',
      'Sin saludos, títulos ni listas. Responde SOLO EN ESPAÑOL en dos frases cortas.',
      'Primero: ¿las últimas velas suben, bajan o están laterales, y dónde está el precio respecto a las zonas dibujadas?',
      'Segundo: ¿qué observas del volumen y del oscilador visibles?',
      'Si un detalle no es legible, admítelo. No inventes cifras, señales ni entradas.',
      'No menciones MACD, RSI ni Bollinger salvo que aparezcan activados.',
      'Activo: '+short(ctx.symbol)+'. Temporalidad: '+short(ctx.interval)+'.',
      'Indicadores visibles: '+names.map(short).slice(0,9).join(', ')+'.',
      'Scripts visibles: '+(scripts.join(', ')||'ninguno')+'.',
      'Pregunta del usuario: '+q+'.'
    ].join(' ');
  }
  function promptSmol(ctx, question) {
    const active = (ctx.chart && ctx.chart.active || ctx.active || []).map(short).slice(0, 12).join(', ') || 'ninguno';
    return 'Responde EXCLUSIVAMENTE en español. Mira esta imagen de un gráfico de ' +
      short(ctx.symbol) + ' en ' + short(ctx.interval) + '. ' +
      'Describe en dos frases concretas si las últimas velas suben, bajan o están laterales, ' +
      'y qué señalan las líneas, zonas o dibujos que puedas distinguir. ' +
      'No repitas frases ni digas solamente que el gráfico muestra una tendencia. ' +
      'No inventes precios ni menciones indicadores que no estén activados. ' +
      'Indicadores activos: ' + active + '. Pregunta: ' + short(question || 'Describe el gráfico') + '.';
  }
  function cleanResponse(raw, ctx) {
    let s = String(raw || '').replace(/<[^>]*>/g, ' ')
      .replace(/(?:<\|[^>]+\|>|\[\/?INST\]|###\s*(?:Assistant|Usuario))/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    if (!s) return null;
    // Los modelos pequeños pueden mencionar indicadores que NO se muestran.
    const shown = ((ctx.chart && ctx.chart.active || ctx.active || []).join(' ') + ' ' +
      (ctx.chart && ctx.chart.pine || ctx.pine || []).map(x => x.name || '').join(' ')).toLowerCase();
    const tags = [
      {name:'macd', pattern:/\bMACD\b/i},
      {name:'rsi', pattern:/\bRSI\b/i},
      {name:'bollinger', pattern:/\bBollinger\b/i}
    ];
    for (const tag of tags) {
      if (shown.includes(tag.name)) continue;
      s = s.split(/(?<=[.!?])\s+/)
        .filter(sentence => !tag.pattern.test(sentence))
        .join(' ').trim();
    }
    if (!s) return null;
    // La imagen no debe terminar exponiendo una respuesta en inglés u otro idioma.
    // No es traducción automática: se descarta y se usa el resumen basado en datos.
    const norm = s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const english = (norm.match(/\b(the|chart|shows|price|currency|pair|shows|trend|this|that|which|with|from|going|there|and|market|candlesticks|drawing|zone|support|resistance|rising|falling|downward|upward|clearly|current)\b/g) || []).length;
    const spanish = (norm.match(/\b(el|la|los|las|un|una|de|del|en|por|con|se|y|que|esta|son|muestra|precio|grafico|velas|tendencia|bajista|alcista|zona|dibujada|sube|baja|cae|lineas|senal|fuerte|descenso|caida|movimiento)\b/g) || []).length;
    if (spanish < 2 || (english >= 3 && english >= spanish * 0.65)) return null;
    // Rechazar frases repetidas o paráfrasis casi idénticas como «The chart shows...».
    const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
    const canon = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^\p{L}\p{N} ]/gu,'').split(/\s+/).filter(Boolean);
    for (let i = 0; i < sentences.length; i++) {
      for (let j = i + 1; j < sentences.length; j++) {
        const a = new Set(canon(sentences[i])), b = new Set(canon(sentences[j]));
        if (a.size >= 5 && b.size >= 5) {
          const common = [...a].filter(w => b.has(w)).length;
          if (common / Math.min(a.size,b.size) > .82) return null;
        }
      }
    }
    const words = canon(s);
    // Hallucinaciones observadas: una frase casi idéntica repetida 4–10 veces.
    // El modelo pequeño puede generar español gramatical, pero no una observación real.
    const counts = new Map();
    for (let i=0; i<words.length-4; i++) {
      const chunk=words.slice(i,i+5).join(' '), count=(counts.get(chunk)||0)+1;
      counts.set(chunk,count);
      if(count>=3) return null;
    }
    if (words.length>=18 && new Set(words).size / words.length < .54) return null;
    if (words.length >= 22 && new Set(words).size / words.length < .47) return null;
    // «El gráfico muestra la tendencia del precio» no es un análisis del gráfico.
    const evidence = /\b(bajista|alcista|baja|bajan|cae|caen|cayo|caida|descenso|retroceso|rompe|rompio|ruptura|sube|suben|subida|rebote|rebotan|lateral|laterales|consolidacion|nube|rectangulo|dibujad|marcad|linea|lineas|senal|flecha|volumen|poc|vela|velas|canal|zona|zonas|vela roja|vela verde)\b/i;
    const vague = /\b(el grafico muestra (?:la )?tendencia|muestra la tendencia del precio|el precio de la moneda|el par de divisas)\b/i;
    if (!evidence.test(norm) || (vague.test(norm) && sentences.length <= 1)) return null;
    return s.split(/\s+/).slice(0, 75).join(' ').trim();
  }
  // El navegador nunca debe quedar bloqueado esperando una descarga o una
  // inferencia GPU: límites independientes de carga, generación y total.
  const MAX_TOTAL_MS = 180000;
  const MAX_QUIET_MS = 45000;
  const MAX_GENERATION_MS = 45000;
  function endJob(current, error, result) {
    if (!current || job !== current) return;
    job = null;
    clearTimeout(current.totalTimer); clearTimeout(current.silenceTimer);
    if (error) current.reject(error); else current.resolve(result);
  }
  function stopWorker() {
    if (worker) { try { worker.terminate(); } catch {} }
    worker = null;
  }
  function cancel(message = 'Análisis visual cancelado. El análisis del gráfico sigue disponible.') {
    const j = job;
    if (!j) return false;
    stopWorker();
    endJob(j, Error(message));
    return true;
  }
  function watchdog(j, phase) {
    if (job !== j) return;
    clearTimeout(j.silenceTimer);
    const ms = phase === 'inference' ? MAX_GENERATION_MS : MAX_QUIET_MS;
    j.silenceTimer = setTimeout(() => cancel(phase === 'inference'
      ? 'La interpretación visual tardó demasiado y fue detenida. El análisis técnico continúa disponible.'
      : 'La IA visual dejó de responder; se detuvo para no bloquear Vortex.'), ms);
  }
  function getWorker() {
    if (worker) return worker;
    if (typeof Worker !== 'function') throw Error('Este navegador no permite ejecutar IA local.');
    const url = new URL('ai-vision-worker.js', document.baseURI);
    const w = new Worker(url.href, {type:'module',name:'Vortex-vision-local'});
    w.onmessage = e => {
      const m = e.data || {}, j = job;
      if (!j || m.id !== j.id) return;
      if (m.type === 'progress') {
        const message = String(m.message || 'Preparando IA visual…');
        if (message !== j.lastProgress || m.stage !== j.stage) {
          j.lastProgress = message; j.stage = m.stage;
          if (typeof j.onProgress === 'function') j.onProgress(message);
        }
        watchdog(j, m.stage === 'inference' ? 'inference' : 'load');
      } else if (m.type === 'result' || m.type === 'error') {
        if (m.type === 'error') {
          stopWorker();
          endJob(j, Error(m.message || 'Error al analizar la captura'));
        } else {
          const answer = cleanResponse(m.text, j.ctx);
          if (!answer) { stopWorker(); endJob(j, Error('El modelo produjo una respuesta visual no fiable.')); }
          else endJob(j, null, {text:answer,model:label(m.which),device:m.device});
        }
      }
    };
    w.onerror = () => { const j = job; stopWorker(); if (j) endJob(j,Error('Falló el motor de IA visual; se mantiene el análisis técnico.')); };
    w.onmessageerror = () => { const j=job; stopWorker(); if(j)endJob(j,Error('No se pudo recibir la respuesta de IA visual.')); };
    worker = w;
    return w;
  }
  function analyze({ctx,screenshot,model='qwen08',question='',onProgress}) {
    if (!ctx || !Array.isArray(ctx.candles) || !ctx.candles.length)
      return Promise.reject(Error('Abre primero un gráfico con velas cargadas.'));
    if (!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(screenshot || '') || screenshot.length > 3000000)
      return Promise.reject(Error('No hay una captura PNG válida del gráfico.'));
    if (!MODELS[model]) return Promise.reject(Error('Modelo de visión desconocido.'));
    if (job) return Promise.reject(Error('Hay una interpretación visual en curso. Puedes cancelarla.'));
    return new Promise((resolve,reject) => {
      let w; try { w=getWorker(); } catch (e) { reject(e); return; }
      const j={id:++seq,resolve,reject,onProgress,ctx,totalTimer:null,silenceTimer:null,lastProgress:'',stage:'load'};
      job=j;
      j.totalTimer=setTimeout(()=>cancel('La IA visual superó el límite de 3 minutos y se detuvo. Los datos del gráfico siguen disponibles.'),MAX_TOTAL_MS);
      watchdog(j,'load');
      if (typeof onProgress === 'function') onProgress('Captura recibida. Preparando '+label(model)+'…');
      try { w.postMessage({id:j.id,type:'analyze',which:model,screenshot,
        prompt:model==='smol'?promptSmol(ctx,question):prompt(ctx,question)}); }
      catch(e) { stopWorker(); endJob(j,e); }
    });
  }
  root.CCTFreeVision = Object.freeze({analyze,cancel,isBusy:()=>!!job,label,models:MODELS,prompt});
})(typeof window !== 'undefined' ? window : this);
