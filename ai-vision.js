/* VORTEX · Cliente de IA visual gratuita. No requiere claves ni backend. */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  let worker = null, job = null, seq = 0;
  const MODELS = Object.freeze({smol:'SmolVLM-256M',qwen:'Qwen3-VL-2B'});
  const label = id => MODELS[id] || MODELS.smol;
  const short = s => String(s || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 100);
  function prompt(ctx, question) {
    const active = Array.isArray(ctx.chart && ctx.chart.active) ? ctx.chart.active.map(short).slice(0, 30) :
      Array.isArray(ctx.active) ? ctx.active.map(short).slice(0, 30) : [];
    const scripts = (ctx.chart && ctx.chart.pine || ctx.pine || []).slice(0, 8).map(x => short(x.name));
    const d = (ctx.chart && ctx.chart.drawings || ctx.drawings || []).slice(-12).map(x => ({
      tipo:short(x.type),texto:short(x.label),entrada:x.a && x.a.p,
      otro_nivel:x.b && x.b.p
    }));
    const cs = ctx.chart && ctx.chart.candles || ctx.candles || [], last = cs.length ? cs[cs.length - 1] : {};
    return [
      'Eres una IA visual especializada en gráficos de VORTEX. La IMAGEN adjunta es real.',
      'Describe EN ESPAÑOL en 2 o 3 frases cortas (máximo 65 palabras) lo que se ve:',
      'movimiento reciente de las velas, señales de indicadores activados y relaciones con',
      'líneas, rectángulos, zonas y dibujos del usuario. NO agregues escenarios, objetivos,',
      'soportes inventados, recomendaciones de operar ni análisis macro.',
      'PROHIBIDO mencionar RSI, MACD, Bollinger u otros indicadores no activados.',
      'Si la captura está borrosa, admítelo; no inventes cifras.',
      'Activo: ' + short(ctx.symbol) + ', marco: ' + short(ctx.interval),
      'Último cierre en datos: ' + (Number.isFinite(last.c) ? last.c : 'desconocido'),
      'Indicadores activados: ' + (active.join(', ') || 'ninguno'),
      'Indicadores personalizados visibles: ' + (scripts.join(', ') || 'ninguno'),
      'Dibujos visibles registrados: ' + JSON.stringify(d).slice(0, 1000),
      'Pregunta del usuario: ' + short(question || 'Describe el gráfico visible')
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
  function getWorker() {
    if (worker) return worker;
    if (typeof Worker !== 'function') throw Error('Este navegador no permite ejecutar IA local en segundo plano.');
    const url = new URL('ai-vision-worker.js', document.baseURI);
    const w = new Worker(url.href, {type:'module',name:'Vortex-vision-local'});
    w.onmessage = e => {
      const m = e.data || {};
      if (!job || m.id !== job.id) return;
      if (m.type === 'progress') {
        if (typeof job.onProgress === 'function') job.onProgress(String(m.message || 'Cargando IA visual…'));
      } else if (m.type === 'result' || m.type === 'error') {
        const current = job; job = null; clearTimeout(current.timer);
        if (m.type === 'error') current.reject(Error(m.message || 'Error al analizar la captura'));
        else {
          const text = cleanResponse(m.text, current.ctx);
          if (!text) current.reject(Error('La respuesta visual no fue fiable, estaba repetida o no estaba en español.'));
          else current.resolve({text,model:label(m.which),device:m.device});
        }
      }
    };
    w.onerror = e => {
      if (job) { const j = job; job = null; clearTimeout(j.timer);
        j.reject(Error('No se pudo iniciar el motor de IA visual. Revisa la conexión o usa el modo Local.')); }
      try { w.terminate(); } catch {}
      worker = null;
    };
    worker = w; return w;
  }
  function analyze({ctx,screenshot,model='smol',question='',onProgress}) {
    if (!ctx || !Array.isArray(ctx.candles) || !ctx.candles.length)
      return Promise.reject(Error('Abre primero el gráfico y espera a que carguen las velas.'));
    if (!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(screenshot || ''))
      return Promise.reject(Error('No hay una captura real del gráfico. Abre la pestaña Gráfico y vuelve a intentarlo.'));
    if (!MODELS[model]) return Promise.reject(Error('Modelo desconocido.'));
    if (job) return Promise.reject(Error('Ya hay un análisis visual en proceso.'));
    return new Promise((resolve,reject) => {
      let w;
      try { w = getWorker(); } catch (e) { reject(e); return; }
      const id = ++seq;
      const timer = setTimeout(() => {
        if (!job || job.id !== id) return;
        job = null; try { worker.terminate(); } catch {} worker = null;
        reject(Error('Se agotó el tiempo para cargar el modelo. Prueba con SmolVLM o en una computadora con más memoria.'));
      }, 8 * 60 * 1000);
      job = {id,resolve,reject,onProgress,ctx,timer};
      if (typeof onProgress === 'function') onProgress('Iniciando ' + label(model) + ' en tu dispositivo…');
      try { w.postMessage({id,type:'analyze',which:model,screenshot,prompt:model === 'smol' ? promptSmol(ctx,question) : prompt(ctx,question)}); }
      catch (e) { clearTimeout(timer); job = null; reject(e); }
    });
  }
  root.CCTFreeVision = Object.freeze({analyze,label,models:MODELS,prompt});
})(typeof window !== 'undefined' ? window : this);
