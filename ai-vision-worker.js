/* VORTEX · Visión open-source ejecutada en el dispositivo.
   Sin claves, sin servidor de inferencia, sin enviar capturas a una API de pago.
   Los pesos públicos se descargan de Hugging Face al abrir la función por primera vez.
   Transformers.js fijado a versión estable para evitar actualizaciones sorpresivas. */
'use strict';

const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
const LIBRARY_QWEN35 = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.4.0-next.0';
const MODELS = Object.freeze({
  smol: 'HuggingFaceTB/SmolVLM-256M-Instruct',
  qwen: 'onnx-community/Qwen3-VL-2B-Instruct-ONNX',
  qwen35: 'huggingworld/Qwen3.5-2B-ONNX',
  qwen35pro: 'huggingworld/Qwen3.5-4B-ONNX'
});
let current = null, loading = null, active = false;
const report = (id, message, stage = 'load') => self.postMessage({id, type:'progress', message, stage});
const errText = e => String((e && e.message) || e || 'Error desconocido').slice(0, 300);

async function load(which, id) {
  if (current && current.which === which) return current;
  if (loading) return loading;
  loading = (async () => {
    if (!MODELS[which]) throw Error('Modelo de visión desconocido.');
    if ((which === 'qwen35' || which === 'qwen35pro' || which === 'qwen') &&
        (!self.navigator || !navigator.gpu)) {
      throw Error('Este equipo no tiene WebGPU disponible. El análisis de trading por datos sigue funcionando sin descargar un modelo.');
    }
    report(id, 'Preparando el motor abierto de visión…');
    const T = await import(which === 'qwen35' || which === 'qwen35pro' ? LIBRARY_QWEN35 : LIBRARY);
    const modelId = MODELS[which];
    const onProgress = info => {
      if (info && (info.status === 'progress' || info.status === 'downloading')) {
        const pct = Number.isFinite(info.progress) ? ' (' + Math.round(info.progress) + '% del archivo)' : '';
        report(id, 'Descargando modelo gratuito' + pct + '…');
      }
    };
    const processor = await T.AutoProcessor.from_pretrained(modelId, {progress_callback:onProgress});
    let model, device;
    if (which === 'qwen35' || which === 'qwen35pro') {
      if (typeof navigator.gpu.requestAdapter === 'function') {
        const adapter = await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
        if (!adapter) throw Error('No hay un adaptador WebGPU disponible. Se conserva la lectura por datos.');
      }
      // Modelo Apache-2.0 de visión y lenguaje (NO requiere clave API).
      // No se descarga automáticamente en equipos sin WebGPU.
      if (!self.navigator || !navigator.gpu) throw Error(
        'Qwen3.5 necesita WebGPU en este navegador. Puedes seguir usando el análisis de trading por datos, sin IA visual.'
      );
      const Class = T.Qwen3_5ForConditionalGeneration;
      if (!Class) throw Error('El motor instalado no reconoce Qwen3.5. Se conserva el análisis técnico por datos.');
      report(id, 'Preparando Qwen3.5 con visión; la primera carga necesita descargar varios archivos…');
      model = await Class.from_pretrained(modelId, {
        device:'webgpu',
        dtype:{embed_tokens:'q4',vision_encoder:'fp16',decoder_model_merged:'q4'},
        progress_callback:onProgress
      });
      device = 'webgpu';
    } else if (which === 'qwen') {
      if (!self.navigator || !navigator.gpu) throw Error('Qwen3-VL requiere WebGPU y memoria gráfica. Prueba SmolVLM en este equipo.');
      const Class = T.Qwen3VLForConditionalGeneration || T.AutoModelForVision2Seq;
      if (!Class) throw Error('Esta versión del motor no admite Qwen3-VL.');
      report(id, 'Cargando Qwen3-VL (requiere varios GB de memoria) …');
      model = await Class.from_pretrained(modelId, {
        device:'webgpu', dtype:{embed_tokens:'fp16',vision_encoder:'fp16',decoder_model_merged:'q4f16'},
        progress_callback:onProgress
      });
      device = 'webgpu';
    } else {
      const available = self.navigator && navigator.gpu ? ['webgpu','wasm'] : ['wasm'];
      let lastError;
      for (const choice of available) {
        try {
          report(id, choice === 'webgpu' ? 'Cargando SmolVLM en la tarjeta gráfica…' : 'Cargando SmolVLM con CPU…');
          model = await T.AutoModelForVision2Seq.from_pretrained(modelId, {
            device:choice, dtype:'q4', progress_callback:onProgress
          });
          device = choice;
          break;
        } catch (e) { lastError = e; }
      }
      if (!model) throw Error('No fue posible cargar SmolVLM en este dispositivo: ' + errText(lastError));
    }
    if (current && current.model && typeof current.model.dispose === 'function') {
      try { await current.model.dispose(); } catch {}
    }
    current = {which, processor, model, T, device};
    return current;
  })();
  try { return await loading; }
  finally { loading = null; }
}

async function infer({id, which, screenshot, prompt}) {
  if (active) throw Error('El modelo todavía está analizando otro gráfico.');
  if (typeof screenshot !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(screenshot) ||
      screenshot.length > 3000000) throw Error('No se pudo obtener una captura PNG válida del gráfico.');
  if (!MODELS[which]) throw Error('Modelo de visión no permitido.');
  active = true;
  try {
    const state = await load(which, id);
    report(id, 'Decodificando el PNG del gráfico…', 'load');
    // No pasar data:image/png;base64 a fromURL(): en Node y algunos
    // entornos de navegador intenta acceder a esa cadena como URL (404).
    // Entregar los bytes reales como Blob es la ruta multimodal compatible.
    const raw=state.T.RawImage;
    let img=null;
    if (typeof raw.fromBlob==='function' || typeof raw.read==='function') {
      const b64=screenshot.slice(screenshot.indexOf(',')+1);
      const binary=atob(b64),bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const blob=new Blob([bytes],{type:'image/png'});
      img=typeof raw.fromBlob==='function' ? await raw.fromBlob(blob) : await raw.read(blob);
    } else if (typeof raw.fromURL==='function') {
      // Compatibilidad con motores anteriores y pruebas sin decodificador Blob.
      img=await raw.fromURL(screenshot);
    }
    if (!img || !Number.isFinite(img.width) || !Number.isFinite(img.height) ||
        img.width < 100 || img.height < 80) throw Error('La captura llegó vacía o no pudo decodificarse.');
    report(id, 'PNG recibido: ' + img.width + ' × ' + img.height + ' píxeles. Preparando imagen…', 'load');
    // Reducir imagen para evitar consumo excesivo de memoria con gráficos ultrapanorámicos.
    const limit = which === 'qwen35' ? 896 : which === 'qwen35pro' ? 1024 : which === 'qwen' ? 1024 : 768; // conserva más detalle de paneles y dibujos
    const factor = Math.min(1, limit / Math.max(img.width, img.height));
    const picture = factor < 1 ? await img.resize(Math.max(1, Math.round(img.width * factor)),
      Math.max(1, Math.round(img.height * factor))) : img;
    const messages = [{
      role:'user', content:[
        {type:'image'},
        {type:'text',text:String(prompt || 'Describe el gráfico visible en español brevemente.').slice(0, 1300)}
      ]
    }];
    const isQwen35 = which === 'qwen35' || which === 'qwen35pro';
    const formatted = state.processor.apply_chat_template(messages,
      isQwen35 ? {add_generation_prompt:true,enable_thinking:false} : {tokenize:false,add_generation_prompt:true});
    // Qwen3.5 usa la firma processor(texto, imagen). Los modelos previos
    // mantienen su propia ruta para no romper la compatibilidad existente.
    const inputs = isQwen35
      ? await state.processor(formatted, picture)
      : await state.processor(formatted, [picture], {return_tensors:'pt'});
    if (!inputs || !inputs.input_ids || !inputs.input_ids.dims)
      throw Error('Qwen no pudo preparar la imagen del gráfico para inferencia.');
    report(id, 'Imagen aceptada por el procesador multimodal; generando lectura…', 'inference');
        let emitted = 0, lastTick = 0;
    const streamer = state.T.TextStreamer && state.processor.tokenizer
      ? new state.T.TextStreamer(state.processor.tokenizer, {
          skip_prompt:true, skip_special_tokens:true,
          callback_function: part => {
            emitted += typeof part === 'string' ? part.length : 0;
            if (emitted >= lastTick + 48) {
              lastTick = emitted;
              report(id, 'Qwen está leyendo los detalles del gráfico…', 'inference');
            }
          }
        }) : null;
    const maxTokens = isQwen35 ? 90 : which === 'qwen' ? 110 : 80;
    const output = await state.model.generate({
      ...inputs, max_new_tokens:maxTokens, do_sample:false,
      ...(streamer ? {streamer} : {})
    });
    const inputLength = inputs.input_ids.dims[inputs.input_ids.dims.length - 1];
    const onlyNew = output.slice(null, [inputLength, null]);
    const decoded = await state.processor.batch_decode(onlyNew, {skip_special_tokens:true});
    const result = String(decoded && decoded[0] || '').trim();
    if (!result) throw Error('El modelo de visión no produjo una respuesta.');
    self.postMessage({id,type:'result',text:result,which,device:state.device});
  } finally { active = false; }
}

self.onmessage = event => {
  const data = event.data || {};
  if (data.type !== 'analyze' || !Number.isSafeInteger(data.id)) return;
  infer(data).catch(e => self.postMessage({id:data.id,type:'error',message:errText(e)}));
};
