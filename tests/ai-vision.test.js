/* Pruebas sin GPU/red: validan el cableado, protección de capturas y rutas SmolVLM/Qwen. */
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const read = p => readFileSync(join(__dirname, '..', p), 'utf8');

// Un Worker con promesas asíncronas puede completar después de varias
// vueltas del event loop. Esperar el mensaje final en lugar de contar microtasks.
async function awaitWorkerFinish(messages, timeoutMs=1500) {
  const start=Date.now();
  while (Date.now()-start<timeoutMs) {
    const last=messages.find(x=>x.type==='result'||x.type==='error');
    if(last)return last;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  throw Error('Worker no terminó en la prueba: '+JSON.stringify(messages.slice(-8)));
}


test('cliente local captura solicitud, muestra progreso y quita indicadores inventados', async () => {
  const calls = [];
  class FakeURL { constructor(p, base) { this.href = base + p; } }
  class FakeWorker {
    postMessage(d) {
      calls.push(d);
      this.onmessage({data:{id:d.id,type:'progress',message:'Descargando…'}});
      this.onmessage({data:{id:d.id,type:'result',which:d.which,device:'webgpu',
        text:'El MACD sube. El precio cae dentro de la zona dibujada.'}});
    }
    terminate() {}
  }
  const window = {};
  vm.runInNewContext(read('ai-vision.js'), {
    window, document:{baseURI:'https://example.com/Vortex/'},
    Worker:FakeWorker, URL:FakeURL, setTimeout, clearTimeout
  });
  const ctx = {symbol:'XRPUSDT',interval:'1h',candles:[{c:1.18}],active:['nnIa'],
    pine:[],drawings:[{type:'rect',label:'zona'}]};
  const updates = [];
  const r = await window.CCTFreeVision.analyze({ctx,model:'smol',
    screenshot:'data:image/png;base64,AAAA',onProgress:m=>updates.push(m)});
  assert.equal(r.model, 'SmolVLM-256M');
  assert.doesNotMatch(r.text, /MACD/);
  assert.match(r.text, /zona dibujada/);
  assert.ok(updates.length >= 2);
  assert.equal(calls[0].which, 'smol');
  await assert.rejects(() => window.CCTFreeVision.analyze({ctx,screenshot:'invalid'}), /captura/);
});

test('worker interpreta PNG mediante SmolVLM sin una clave API', async () => {
  const posted = [], loaded = [];
  const processor = () => ({input_ids:{dims:[1,7]}});
  processor.apply_chat_template = () => 'CHAT';
  processor.batch_decode = () => ['Gráfico con velas bajistas y un rectángulo dibujado.'];
  const from_pretrained = async (id,opts) => {
    loaded.push({id,device:opts.device});
    return {generate:async () => ({slice:() => ({})})};
  };
  const T = {
    AutoProcessor:{from_pretrained:async()=>processor},
    AutoModelForVision2Seq:{from_pretrained},
    RawImage:{fromURL:async()=>({width:400,height:250})}
  };
  const self = {postMessage:x=>posted.push(x),navigator:{}};
  const source = read('ai-vision-worker.js').replace(/await import\([^\n]+\)/, 'await fakeImport()');
  vm.runInNewContext(source, {self,navigator:self.navigator,fakeImport:async()=>T});
  self.onmessage({data:{id:1,type:'analyze',which:'smol',
    screenshot:'data:image/png;base64,AAAA',prompt:'Describe'}});
  await awaitWorkerFinish(posted);
  assert.equal(loaded[0].device,'wasm');
  assert.ok(posted.some(x=>x.type==='result' && /velas bajistas/.test(x.text)));
});

test('worker permite Qwen3-VL únicamente con WebGPU', async () => {
  const posted = [];
  const self = {postMessage:x=>posted.push(x),navigator:{}};
  vm.runInNewContext(read('ai-vision-worker.js').replace(/await import\([^\n]+\)/, 'await fakeImport()'), {
    self,navigator:self.navigator,fakeImport:async()=>({
      AutoProcessor:{from_pretrained:async()=>({})}
    })
  });
  self.onmessage({data:{id:2,type:'analyze',which:'qwen',
    screenshot:'data:image/png;base64,AAAA',prompt:'Describe'}});
  await awaitWorkerFinish(posted);
  assert.ok(posted.some(x=>x.type==='error' && /WebGPU/.test(x.message)));
});


test('la IA rechaza respuesta en inglés y repetitiva de SmolVLM', async () => {
  const English = 'The chart shows the trend of the price of the currency pair XRPUSD. The chart shows the trend of the price of the currency pair XRPUSD.';
  const window = {};
  class FakeURL { constructor(p, base) { this.href = base + p; } }
  class FakeWorker {
    postMessage(d) {
      this.onmessage({data:{id:d.id,type:'result',which:'smol',device:'webgpu',text:English}});
    }
    terminate() {}
  }
  vm.runInNewContext(read('ai-vision.js'), {
    window, document:{baseURI:'https://example.com/Vortex/'},
    Worker:FakeWorker, URL:FakeURL, setTimeout, clearTimeout
  });
  const ctx = {symbol:'XRPUSDT',interval:'1h',active:['nnIa'],
    pine:[],drawings:[{type:'rect',label:'zona'}],candles:[{c:1.18}]};
  await assert.rejects(window.CCTFreeVision.analyze({
    ctx,screenshot:'data:image/png;base64,AAAA'
  }), /español|fiable/i);
});

test('la visión rechaza respuestas genéricas y repetidas aunque estén en español', async () => {
  for (const sentence of [
    'El gráfico muestra la tendencia del precio.',
    'El gráfico muestra la tendencia del precio de XRPUSD. El gráfico muestra la tendencia del precio de XRPUSD.'
  ]) {
    const window = {};
    class FakeURL { constructor(p, base) { this.href = base + p; } }
    class FakeWorker {
      postMessage(d) {
        this.onmessage({data:{id:d.id,type:'result',which:'smol',device:'wasm',text:sentence}});
      }
      terminate() {}
    }
    vm.runInNewContext(read('ai-vision.js'), {
      window, document:{baseURI:'https://example.com/Vortex/'},
      Worker:FakeWorker, URL:FakeURL, setTimeout, clearTimeout
    });
    await assert.rejects(window.CCTFreeVision.analyze({
      ctx:{symbol:'XRPUSDT',interval:'1h',active:[],pine:[],drawings:[],candles:[{c:1.18}]},
      screenshot:'data:image/png;base64,AAAA'
    }), /fiable|español/i);
  }
});

test('acepta explicación visual específica en español, sin indicadores que no usa', async () => {
  const window = {};
  class FakeURL { constructor(p, base) { this.href = base + p; } }
  class FakeWorker {
    postMessage(d) {
      this.onmessage({data:{id:d.id,type:'result',which:'smol',device:'webgpu',
        text:'El MACD está positivo. Las últimas velas caen con fuerza y el precio está debajo del rectángulo dibujado.'}});
    }
    terminate() {}
  }
  vm.runInNewContext(read('ai-vision.js'), {
    window, document:{baseURI:'https://example.com/Vortex/'},
    Worker:FakeWorker, URL:FakeURL, setTimeout, clearTimeout
  });
  const text = (await window.CCTFreeVision.analyze({
    ctx:{symbol:'XRPUSDT',interval:'1h',active:['nnIa'],pine:[],drawings:[],candles:[{c:1.18}]},
    screenshot:'data:image/png;base64,AAAA'
  })).text;
  assert.match(text,/velas caen con fuerza/);
  assert.doesNotMatch(text,/MACD|The chart/);
});


test('Qwen3.5 2B carga el motor compatible y procesa imagen como indica el modelo', async () => {
  const posted=[], loads=[], processed=[];
  const processor=(formatted,image)=>{processed.push({formatted,image});return {input_ids:{dims:[1,8]}}};
  processor.apply_chat_template=(messages,opts)=>{
    assert.ok(messages[0].content.some(x=>x.type==='image'));
    assert.equal(opts.add_generation_prompt,true);
    return 'PROMPT MULTIMODAL';
  };
  processor.batch_decode=()=>['Las últimas velas bajan y se observa una zona marcada.'];
  const T={
    AutoProcessor:{from_pretrained:async()=>processor},
    Qwen3_5ForConditionalGeneration:{from_pretrained:async(id,opts)=>{
      loads.push({id,opts});return {generate:async()=>({slice:()=>({})})};
    }},
    RawImage:{fromURL:async()=>({width:1100,height:900,resize:async(w,h)=>({width:w,height:h})})}
  };
  const self={navigator:{gpu:{}},postMessage:x=>posted.push(x)};
  const source=read('ai-vision-worker.js').replace(/await import\([^\n]+\)/, 'await fakeImport()');
  vm.runInNewContext(source,{self,navigator:self.navigator,fakeImport:async()=>T});
  self.onmessage({data:{id:21,type:'analyze',which:'qwen35',
    screenshot:'data:image/png;base64,AAAA',prompt:'Analiza el soporte de las velas'}});
  await awaitWorkerFinish(posted);
  assert.equal(loads.length,1);
  assert.equal(loads[0].id,'huggingworld/Qwen3.5-2B-ONNX');
  assert.equal(loads[0].opts.device,'webgpu');
  assert.equal(loads[0].opts.dtype.decoder_model_merged,'q4');
  assert.equal(processed.length,1);
  assert.ok(processed[0].image && !Array.isArray(processed[0].image));
  assert.ok(posted.some(x=>x.type==='result'&&x.which==='qwen35'));
});

test('Qwen3.5 4B usa modelo avanzado sin cargarlo en otros navegadores', async () => {
  const posted=[],loads=[];
  const processor=()=>({input_ids:{dims:[1,6]}});
  processor.apply_chat_template=()=> 'PROMPT';
  processor.batch_decode=()=>['Se observan velas bajistas y una zona marcada.'];
  const T={
    AutoProcessor:{from_pretrained:async()=>processor},
    Qwen3_5ForConditionalGeneration:{from_pretrained:async(id,opt)=>{
      loads.push({id,opt});return {generate:async()=>({slice:()=>({})})};
    }},
    RawImage:{fromURL:async()=>({width:640,height:360})}
  };
  const self={navigator:{gpu:{}},postMessage:x=>posted.push(x)};
  vm.runInNewContext(read('ai-vision-worker.js').replace(/await import\([^\n]+\)/, 'await fakeImport()'),
    {self,navigator:self.navigator,fakeImport:async()=>T});
  self.onmessage({data:{id:22,type:'analyze',which:'qwen35pro',
    screenshot:'data:image/png;base64,AAAA',prompt:'Describe el volumen'}});
  await awaitWorkerFinish(posted);
  assert.equal(loads[0].id,'huggingworld/Qwen3.5-4B-ONNX');
  assert.ok(posted.some(x=>x.type==='result'));
});

test('Qwen3.5 sin WebGPU falla antes de descargar pesos', async () => {
  const posted=[];let fetched=false;
  const self={navigator:{},postMessage:x=>posted.push(x)};
  vm.runInNewContext(read('ai-vision-worker.js').replace(/await import\([^\n]+\)/,'await fakeImport()'),
    {self,navigator:self.navigator,fakeImport:async()=>{fetched=true;return {}}});
  self.onmessage({data:{id:23,type:'analyze',which:'qwen35',
    screenshot:'data:image/png;base64,AAAA',prompt:'Analiza la gráfica'}});
  await awaitWorkerFinish(posted);
  assert.equal(fetched,false);
  assert.ok(posted.some(x=>x.type==='error'&&/WebGPU/.test(x.message)));
});


test('Qwen3.5 0.8B usa los pesos visuales reales y recibe el PNG', async () => {
  const sent=[],loaded=[],processed=[];
  const processor=(text,image)=>{processed.push({text,image});return {input_ids:{dims:[1,11]}}};
  processor.apply_chat_template=()=> 'PROMPT VISUAL BTCUSDT';
  processor.batch_decode=()=>['Las velas más recientes están bajando y hay barras de volumen.'];
  const T={
    AutoProcessor:{from_pretrained:async()=>processor},
    Qwen3_5ForConditionalGeneration:{from_pretrained:async(id,opt)=>{
      loaded.push({id,opt});return {generate:async()=>({slice:()=>({})})};
    }},
    RawImage:{fromURL:async()=>({width:816,height:550,resize:async(w,h)=>({width:w,height:h})})}
  };
  const self={navigator:{gpu:{}},postMessage:x=>sent.push(x)};
  vm.runInNewContext(read('ai-vision-worker.js').replace(/await import\([^\n]+\)/,'await fakeImport()'),
    {self,navigator:self.navigator,fakeImport:async()=>T});
  self.onmessage({data:{id:24,type:'analyze',which:'qwen08',
    screenshot:'data:image/png;base64,AAAA',prompt:'BTCUSDT 1h: mira las velas'}});
  await awaitWorkerFinish(sent);
  assert.equal(loaded[0].id,'onnx-community/Qwen3.5-0.8B-ONNX');
  assert.equal(loaded[0].opt.device,'webgpu');
  assert.equal(processed.length,1);
  assert.ok(sent.some(x=>x.type==='result'&&x.which==='qwen08'));
});
