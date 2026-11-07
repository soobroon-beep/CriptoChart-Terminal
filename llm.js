/* VORTEX · IA generativa con modelos ABIERTOS y gratuitos (sin claves de Claude/OpenAI).
   Un solo punto de entrada, chat(messages, opts), con tres proveedores intercambiables:
   · free   — servicio gratuito sin clave (Pollinations, API compatible con OpenAI) con modelos abiertos (Mistral, Llama, Qwen, DeepSeek…).
   · compat — cualquier servidor compatible con OpenAI: Ollama / LM Studio en tu computadora (gratis y privado) o un servicio con plan gratuito (Groq, OpenRouter, Gemini…).
   · webllm — el modelo corre DENTRO del navegador (WebLLM + WebGPU): gratis, privado y sin servidor, pero pesado de descargar.
   Si no hay conexión o el proveedor falla, la interfaz cae al analista local de reglas (ai.js). Las funciones puras se prueban en tests/llm.test.js. */
(function (root) {
  'use strict';
  const KEY = 'cct_llm_v1', FREE_URL = 'https://text.pollinations.ai/openai', FREE_MODELS = 'https://text.pollinations.ai/models';
  const WEBLLM_CDN = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm';
  const WEBLLM_MODELS = {text: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', code: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC', vision: 'Phi-3.5-vision-instruct-q4f16_1-MLC'};
  const OPEN = /mistral|llama|qwen|deepseek|gemma|phi|glm|gpt-oss|kimi|olmo|nemotron|smol|minimax/i;
  const VISION = /vision|(^|[-_:\s])vl([-_:\s]|$)|llava|pixtral|gemma-?3|mistral(-(small|medium|large))?$|llama-?4|llama-3\.2-(11|90)|minicpm-v|molmo|internvl|moondream|qwen.*vl|gpt-4o|gemini/i;
  const FALLBACK_FREE = ['mistral', 'llama', 'qwen-coder', 'deepseek'];
  const DEF = {provider: 'free', lab: 'webllm', compat: {url: 'http://localhost:11434/v1', key: '', model: 'qwen2.5vl:7b', vision: true}};

  class LLMError extends Error { constructor(msg, kind, status) { super(msg); this.kind = kind || 'other'; this.status = status || 0; } }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } }, lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

  /* ───────── Ajustes ───────── */
  function load() {
    let o = {}; try { o = JSON.parse(lsGet(KEY) || '{}') || {}; } catch {}
    const c = o.compat || {}, ok = x => ['free', 'compat', 'webllm'].includes(x);
    let provider = ok(o.provider) ? o.provider : DEF.provider, lab = ok(o.lab) ? o.lab : null;
    if (!lab) { lab = provider === 'compat' ? 'compat' : DEF.lab; if (provider === 'webllm') provider = 'free'; } // ajustes antiguos: lo general va por el servicio gratuito y el Laboratorio por el modelo en el navegador
    return {provider, lab, compat: {url: String(c.url || DEF.compat.url).trim(), key: String(c.key || ''), model: String(c.model || DEF.compat.model).trim(), vision: c.vision !== false}};
  }
  const save = cfg => lsSet(KEY, JSON.stringify(cfg));

  /* ───────── Funciones puras ───────── */
  const hasImage = msgs => msgs.some(m => Array.isArray(m.content) && m.content.some(p => p && p.type === 'image_url'));
  function stripImages(msgs) { // quita las imágenes y avisa al modelo de que solo cuenta con los datos numéricos
    return msgs.map(m => Array.isArray(m.content) ? {role: m.role, content: m.content.filter(p => p.type !== 'image_url').map(p => p.text).join('\n') + '\n(Nota: la captura del gráfico no pudo enviarse a este modelo; basa tu análisis solo en los datos numéricos.)'} : m);
  }
  const imageMessage = (text, dataUrl) => ({role: 'user', content: [{type: 'text', text}, {type: 'image_url', image_url: {url: dataUrl}}]});
  const supportsVision = (name, meta) => !!(meta && meta.vision === true) || (!(meta && meta.vision === false) && VISION.test(String(name || '')));
  function pickFree(list, o) { // modelos abiertos del servicio gratuito, en orden de preferencia para la tarea
    o = o || {}; const arr = (Array.isArray(list) ? list : []).map(x => typeof x === 'string' ? {name: x} : x).filter(x => x && x.name);
    if (!arr.length) return FALLBACK_FREE.slice();
    let open = arr.filter(x => OPEN.test(x.name)); if (!open.length) open = arr;
    const score = x => { let s = 0; const v = supportsVision(x.name, x); if (o.needVision) s += v ? 100 : 0;
      if (o.code) s += /coder|qwen|deepseek/i.test(x.name) ? 50 : 0; else s += /mistral|llama|qwen|gemma/i.test(x.name) ? 20 : 0;
      if (/uncensored|roblox|unity|midijourney|rtist/i.test(x.name + ' ' + (x.description || ''))) s -= 200; return s - (x.name.length / 100); };
    return open.map(x => [x.name, score(x)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  }
  function extractCode(text) { // el bloque de código Pine de la respuesta (```pine … ```), o el texto completo si ya empieza como Pine
    const t = String(text || ''), m = /```(?:pine(?:script)?|pinescript)?[ \t]*\n([\s\S]*?)```/i.exec(t);
    if (m && /indicator\s*\(|strategy\s*\(|@version/.test(m[1])) return m[1].trim();
    const open = /```(?:pine(?:script)?)?[ \t]*\n([\s\S]*)$/i.exec(t); if (open && /indicator\s*\(|@version/.test(open[1])) return open[1].replace(/```[\s\S]*$/, '').trim(); // bloque sin cerrar (respuesta cortada)
    const i = t.search(/\/\/\s*@version\s*=\s*\d/); if (i >= 0) return t.slice(i).trim();
    return '';
  }
  const stripCode = text => String(text || '').replace(/```[\s\S]*?(```|$)/g, '').trim();
  function applyPatch(code, text) { // aplica bloques «<<<<<<< SEARCH / ======= / >>>>>>> REPLACE» sobre el código actual (solo cambia lo pedido)
    const re = /<{3,}\s*SEARCH[^\n]*\n([\s\S]*?)\n={3,}[^\n]*\n([\s\S]*?)\n?>{3,}\s*REPLACE/g, norm = x => x.split('\n').map(l => l.trim());
    let out = String(code), applied = 0, failed = [], m, found = 0;
    while ((m = re.exec(String(text || '')))) {
      found++; const a = m[1].replace(/^```\w*\n?|\n?```$/g, ''), b = m[2].replace(/^```\w*\n?|\n?```$/g, '');
      if (out.includes(a) && a.trim()) { out = out.replace(a, () => b); applied++; continue; }
      const lines = out.split('\n'), want = norm(a).filter((l, i, arr) => !(i === arr.length - 1 && l === '')), have = lines.map(l => l.trim()); let at = -1;
      for (let i = 0; i + want.length <= have.length && want.length; i++) { let ok = true; for (let j = 0; j < want.length; j++) if (have[i + j] !== want[j]) { ok = false; break; } if (ok) { at = i; break; } }
      if (at >= 0) { lines.splice(at, want.length, ...b.split('\n')); out = lines.join('\n'); applied++; } else failed.push(a.split('\n')[0].slice(0, 80));
    }
    return {code: out, applied, failed, found, changed: out !== String(code)};
  }
  function friendly(e) {
    if (!e) return 'Error desconocido de la IA.';
    if (e.kind === 'network') return 'No hay conexión con el modelo de IA. Revisa tu internet o cambia de proveedor en ⚙.';
    if (e.kind === 'rate') return 'El servicio gratuito está saturado (límite de uso). Espera unos segundos e inténtalo otra vez, o usa otro proveedor en ⚙.';
    if (e.kind === 'auth') return 'El servidor rechazó la clave o el permiso. Revisa los datos del proveedor en ⚙.';
    if (e.kind === 'model') return 'El modelo no está disponible en ese servidor. Cambia el nombre del modelo en ⚙.';
    if (e.kind === 'abort') return 'Se canceló o tardó demasiado.';
    return e.message || 'Error de la IA.';
  }
  function kindOf(status) { return status === 429 ? 'rate' : status === 401 || status === 403 ? 'auth' : status === 404 || status === 400 || status === 422 ? 'model' : status >= 500 ? 'server' : 'other'; }
  const textOf = j => { const c = j && j.choices && j.choices[0]; if (!c) return ''; const m = c.message || c.delta || {}; return typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map(p => p.text || '').join('') : (c.text || ''); };

  /* ───────── Red ───────── */
  async function fetchT(url, init, ms, outer) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms || 90000);
    if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener('abort', () => ctl.abort(), {once: true}); }
    try { return await fetch(url, Object.assign({}, init, {signal: ctl.signal})); }
    catch (e) { throw new LLMError(e && e.name === 'AbortError' ? 'Tiempo agotado' : 'Sin conexión', e && e.name === 'AbortError' ? 'abort' : 'network'); }
    finally { clearTimeout(t); }
  }
  async function readStream(r, onToken) { // SSE de la API compatible con OpenAI
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', out = '';
    for (;;) {
      const {done, value} = await rd.read(); if (done) break; buf += dec.decode(value, {stream: true});
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const ln = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!ln.startsWith('data:')) continue; const d = ln.slice(5).trim(); if (d === '[DONE]') continue;
        try { const t = textOf(JSON.parse(d)); if (t) { out += t; onToken(out); } } catch {}
      }
    }
    return out;
  }
  async function openaiCall(url, key, model, messages, o) {
    const body = {model, messages, temperature: o.temperature == null ? .4 : o.temperature, max_tokens: o.maxTokens || 1600, stream: !!o.onToken};
    const headers = {'content-type': 'application/json'}; if (key) headers.authorization = 'Bearer ' + key;
    const r = await fetchT(url, {method: 'POST', headers, body: JSON.stringify(body)}, o.timeout, o.signal);
    if (!r.ok) { let m = ''; try { const j = await r.json(); m = (j.error && (j.error.message || j.error)) || j.message || ''; } catch {} throw new LLMError(String(m || 'Error ' + r.status).slice(0, 200), kindOf(r.status), r.status); }
    const ct = r.headers.get('content-type') || '';
    let text = ''; if (o.onToken && /event-stream/i.test(ct) && r.body) text = await readStream(r, o.onToken);
    else { const raw = await r.text(); try { text = textOf(JSON.parse(raw)); } catch { text = raw; } if (text && o.onToken) o.onToken(text); }
    text = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!text) throw new LLMError('El modelo no devolvió texto.', 'server');
    return text;
  }

  /* ───────── Proveedor gratuito (Pollinations) ───────── */
  let freeCache = null;
  async function freeModels() {
    if (freeCache && Date.now() - freeCache.t < 30 * 6e4) return freeCache.list;
    try { const r = await fetchT(FREE_MODELS, {}, 6000); if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) { freeCache = {t: Date.now(), list: j}; return j; } } } catch {}
    return freeCache ? freeCache.list : [];
  }
  async function chatFree(messages, o) {
    const list = await freeModels(), cand = pickFree(list, {needVision: o.needVision || hasImage(messages), code: o.purpose === 'code'}).slice(0, 4), img = hasImage(messages); let last;
    for (const m of cand) {
      const meta = list.find(x => x && x.name === m), vis = supportsVision(m, meta);
      try { const text = await openaiCall(FREE_URL, '', m, img && !vis ? stripImages(messages) : messages, o); return {text, model: m, image: img && vis}; }
      catch (e) { last = e; if (e.kind === 'network' || e.kind === 'abort') throw e; if (e.kind === 'rate') await sleep(2500); }
    }
    throw last || new LLMError('El servicio gratuito no respondió.', 'server');
  }

  /* ───────── Servidor compatible con OpenAI (Ollama, LM Studio, Groq, OpenRouter…) ───────── */
  async function chatCompat(messages, o, cfg) {
    const c = cfg.compat, base = c.url.replace(/\/+$/, ''), url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions', img = hasImage(messages);
    const text = await openaiCall(url, c.key, c.model, img && !c.vision ? stripImages(messages) : messages, o);
    return {text, model: c.model, image: img && c.vision};
  }

  /* ───────── WebLLM: modelo dentro del navegador ───────── */
  const engines = {}; let webllmLib = null;
  async function chatWebllm(messages, o) {
    if (!root.navigator || !root.navigator.gpu) throw new LLMError('Este navegador no tiene WebGPU, así que no puede correr el modelo local. Usa Chrome/Edge de escritorio o cambia de proveedor.', 'other');
    const img = hasImage(messages), id = img ? WEBLLM_MODELS.vision : o.purpose === 'code' ? WEBLLM_MODELS.code : WEBLLM_MODELS.text;
    if (!webllmLib) { try { webllmLib = await import(WEBLLM_CDN); } catch { throw new LLMError('No se pudo cargar WebLLM (necesita internet la primera vez).', 'network'); } }
    if (!engines[id]) engines[id] = await webllmLib.CreateMLCEngine(id, {initProgressCallback: p => o.onProgress && o.onProgress(p)});
    const eng = engines[id]; let text = '';
    const stream = await eng.chat.completions.create({messages, stream: true, temperature: o.temperature == null ? .4 : o.temperature, max_tokens: o.maxTokens || 1600});
    for await (const ch of stream) { const d = ch.choices && ch.choices[0] && ch.choices[0].delta && ch.choices[0].delta.content; if (d) { text += d; if (o.onToken) o.onToken(text); } }
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim(); if (!text) throw new LLMError('El modelo local no devolvió texto.', 'server');
    return {text, model: id, image: img};
  }

  /* ───────── Entrada principal ───────── */
  async function chat(messages, o) {
    o = o || {}; const cfg = o.cfg || load();
    let prov = o.purpose === 'code' ? cfg.lab : cfg.provider; // el Laboratorio (código) puede usar otro proveedor que el resto
    if (prov === 'webllm' && !(root.navigator && root.navigator.gpu)) prov = cfg.provider === 'webllm' ? 'free' : cfg.provider; // sin WebGPU no puede correr en el navegador
    try {
      if (prov === 'compat') return await chatCompat(messages, o, cfg);
      if (prov === 'webllm') return await chatWebllm(messages, o);
      return await chatFree(messages, o);
    } catch (e) { if (e instanceof LLMError) { e.message = friendly(e) + (e.kind === 'model' || e.kind === 'server' || e.kind === 'other' ? ' (' + String(e.message).slice(0, 120) + ')' : ''); throw e; } throw new LLMError(String(e && e.message || e), 'other'); }
  }
  const providerLabel = cfg => (cfg = cfg || load(), cfg.provider === 'compat' ? 'Servidor · ' + cfg.compat.model : cfg.provider === 'webllm' ? 'En tu navegador' : 'Gratis · modelo abierto');

  /* ───────── Guía de Pine para el Laboratorio y métricas de señales ───────── */
  const PINE_GUIDE = `Eres un experto en Pine Script v5. Escribes indicadores para el intérprete propio de VORTEX, que soporta un SUBCONJUNTO de Pine v5.
REGLAS OBLIGATORIAS:
- Empieza con //@version=5 y una sola llamada indicator("Nombre corto", overlay=true|false). Nunca uses strategy().
- Usa solo funciones de Pine v5: ta.* (sma, ema, rma, rsi, macd, stoch, atr, bb, crossover, crossunder, highest, lowest, pivothigh, pivotlow, stdev, change, cum, vwap, supertrend, adx…), math.*, plot, plotshape, plotchar, bgcolor, barcolor, hline, fill, label.new, line.new, box.new, input.int/float/bool/string/color/source, array.*, str.tostring, color.*, nz, na, if/for/while, funciones propias y var.
- NO uses: import, library, request.security con símbolos raros, request.economic/financial/earnings, alert(), strategy.*, ni funciones inventadas. Si no estás seguro de que una función exista, calcula con operaciones básicas.
- Parámetros editables con input.* (con minval/maxval cuando aplique). Colores con color.new(color.X, transparencia).
- Señales visuales con plotshape (compra: location.belowbar, venta: location.abovebar). Títulos de plot cortos.
- Si el indicador necesita escala distinta al precio (RSI, MACD, volumen…) usa overlay=false; si va sobre las velas, overlay=true.
- Código claro y comentado en español, menos de 140 líneas, sin dependencias externas.
SI RECIBES UNA IMAGEN de referencia (captura de un indicador, boceto o ejemplo), obsérvala: tipo (sobre velas o panel), líneas, colores, señales y niveles, y replica ese estilo con funciones soportadas.
FORMATO DE RESPUESTA: primero 2-4 líneas en español explicando qué hace y cómo leerlo; después UN solo bloque \`\`\`pine con el código completo. Nada más.`;
  function signalMetrics(candles, res) { // qué pasó DESPUÉS de cada señal del indicador (histórico). No es un backtest ni un resultado real
    const out = {bars: candles.length, signals: [], note: 'Estadística descriptiva sobre las velas cargadas: mide cuánto se movió el precio después de cada señal visual (compra = marca bajo la vela, venta = marca sobre la vela). No incluye comisiones, deslizamiento ni gestión de riesgo, y no es un resultado real ni una promesa.'};
    for (const s of (res && res.shapes) || []) {
      const side = s.loc === 'belowbar' ? 1 : s.loc === 'abovebar' ? -1 : 0; if (!side || !s.pts || !s.pts.length) continue;
      const bars = [...new Set(s.pts.map(p => p[0]))].filter(i => i >= 0 && i < candles.length), row = {title: s.title || (side > 0 ? 'Compra' : 'Venta'), side: side > 0 ? 'compra' : 'venta', n: bars.length, h: {}};
      for (const H of [5, 10, 20]) { let ok = 0, tot = 0, sum = 0; for (const i of bars) { if (i + H >= candles.length) continue; const r = (candles[i + H].c - candles[i].c) / candles[i].c * 100 * side; tot++; sum += r; if (r > 0) ok++; } row.h[H] = tot ? {n: tot, hit: +(ok / tot * 100).toFixed(1), avg: +(sum / tot).toFixed(2)} : null; }
      out.signals.push(row);
    }
    return out;
  }

  const api = {resetCache: () => { freeCache = null; }, LLMError, load, save, chat, freeModels, pickFree, supportsVision, imageMessage, hasImage, stripImages, extractCode, stripCode, applyPatch, friendly, providerLabel, PINE_GUIDE, signalMetrics, WEBLLM_MODELS, FREE_URL};
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CCTLLM = api;
})(typeof self !== 'undefined' ? self : this);
