/* VORTEX · Visión open-source ejecutada en el dispositivo.
   Sin claves, sin servidor de inferencia, sin enviar capturas a una API de pago.
   Los pesos públicos se descargan de Hugging Face al abrir la función por primera vez.
   Transformers.js fijado a versión estable para evitar actualizaciones sorpresivas. */
'use strict';

const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
const MODELS = Object.freeze({
  smol: 'HuggingFaceTB/SmolVLM-256M-Instruct',
  qwen: 'onnx-community/Qwen3-VL-2B-Instruct-ONNX'
});
let current = null, loading = null, active = false;
const report = (id, message) => self.postMessage({id, type:'progress', message});
const errText = e => String((e && e.message) || e || 'Error desconocido').slice(0, 300);

async function load(which, id) {
  if (current && current.which === which) return current;
  if (loading) return loading;
  loading = (async () => {
    if (!MODELS[which]) throw Error('Modelo de visión desconocido.');
    report(id, 'Preparando el motor abierto de visión…');
    const T = await import(LIBRARY);
    const modelId = MODELS[which];
    const onProgress = info => {
      if (info && (info.status === 'progress' || info.status === 'downloading')) {
        const pct = Number.isFinite(info.progress) ? ' (' + Math.round(info.progress) + '% del archivo)' : '';
        report(id, 'Descargando modelo gratuito' + pct + '…');
      }
    };
    const processor = await T.AutoProcessor.from_pretrained(modelId, {progress_callback:onProgress});
    let model, device;
    if (which === 'qwen') {
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
    report(id, 'Interpretando la captura de tu gráfico…');
    const img = await state.T.RawImage.fromURL(screenshot);
    // Reducir imagen para evitar consumo excesivo de memoria con gráficos ultrapanorámicos.
    const limit = which === 'qwen' ? 1152 : 896; // conserva más detalle de paneles y dibujos
    const factor = Math.min(1, limit / Math.max(img.width, img.height));
    const picture = factor < 1 ? await img.resize(Math.max(1, Math.round(img.width * factor)),
      Math.max(1, Math.round(img.height * factor))) : img;
    const messages = [{
      role:'user', content:[
        {type:'image'},
        {type:'text',text:String(prompt || 'Describe el gráfico visible en español brevemente.').slice(0, 3000)}
      ]
    }];
    const formatted = state.processor.apply_chat_template(messages,
      {tokenize:false,add_generation_prompt:true});
    const inputs = await state.processor(formatted, [picture], {return_tensors:'pt'});
    const output = await state.model.generate({...inputs, max_new_tokens:which === 'qwen' ? 210 : 135, do_sample:false});
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
