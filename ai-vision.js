/* VORTEX · Cliente de IA visual gratuita. No requiere claves ni backend. */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') return;
  let worker = null, job = null, seq = 0;
  const MODELS = Object.freeze({smol:'SmolVLM-256M',qwen:'Qwen3-VL-2B'});
  const label = id => MODELS[id] || MODELS.smol;
  const short = s => String(s || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 100);
  function prompt(ctx) {
    const active = Array.isArray(ctx.active) ? ctx.active.map(short).slice(0, 30) : [];
    const scripts = (ctx.pine || []).slice(0, 8).map(x => short(x.name));
    const d = (ctx.drawings || []).slice(-12).map(x => ({
      tipo:short(x.type),texto:short(x.label),entrada:x.a && x.a.p,
      otro_nivel:x.b && x.b.p
    }));
    const cs = ctx.candles || [], last = cs.length ? cs[cs.length - 1] : {};
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
      'Dibujos visibles registrados: ' + JSON.stringify(d).slice(0, 1000)
    ].join(' ');
  }
  function cleanResponse(raw, ctx) {
    let s = String(raw || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    // Un modelo pequeño puede atribuir a la captura un indicador no activado.
    const shown = ((ctx.active || []).join(' ') + ' ' +
      (ctx.pine || []).map(x => x.name || '').join(' ')).toLowerCase();
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
    return s.split(/\s+/).slice(0, 85).join(' ').trim();
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
          if (!text) current.reject(Error('El modelo produjo una lectura vacía o mencionó indicadores no activos.'));
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
  function analyze({ctx,screenshot,model='smol',onProgress}) {
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
      try { w.postMessage({id,type:'analyze',which:model,screenshot,prompt:prompt(ctx)}); }
      catch (e) { clearTimeout(timer); job = null; reject(e); }
    });
  }
  root.CCTFreeVision = Object.freeze({analyze,label,models:MODELS,prompt});
})(typeof window !== 'undefined' ? window : this);
