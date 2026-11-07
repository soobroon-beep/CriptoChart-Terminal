/* Pruebas sin GPU/red: validan el cableado, protección de capturas y rutas SmolVLM/Qwen. */
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const read = p => readFileSync(join(__dirname, '..', p), 'utf8');

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
  const source = read('ai-vision-worker.js').replace('await import(LIBRARY)', 'await fakeImport()');
  vm.runInNewContext(source, {self,navigator:self.navigator,fakeImport:async()=>T});
  self.onmessage({data:{id:1,type:'analyze',which:'smol',
    screenshot:'data:image/png;base64,AAAA',prompt:'Describe'}});
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(loaded[0].device,'wasm');
  assert.ok(posted.some(x=>x.type==='result' && /velas bajistas/.test(x.text)));
});

test('worker permite Qwen3-VL únicamente con WebGPU', async () => {
  const posted = [];
  const self = {postMessage:x=>posted.push(x),navigator:{}};
  vm.runInNewContext(read('ai-vision-worker.js').replace('await import(LIBRARY)', 'await fakeImport()'), {
    self,navigator:self.navigator,fakeImport:async()=>({
      AutoProcessor:{from_pretrained:async()=>({})}
    })
  });
  self.onmessage({data:{id:2,type:'analyze',which:'qwen',
    screenshot:'data:image/png;base64,AAAA',prompt:'Describe'}});
  for (let i = 0; i < 10; i++) await Promise.resolve();
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
