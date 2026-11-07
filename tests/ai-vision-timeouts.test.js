/* Regresiones del bloqueo "Interpretando la captura de tu gráfico…" */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','ai-vision.js'),'utf8');

function harness() {
  const timers=new Map(),workers=[],sent=[];
  let nextId=1;
  class FakeWorker {
    constructor(url,opt){this.url=url;this.options=opt;this.terminated=false;workers.push(this);}
    postMessage(payload){sent.push(payload);}
    terminate(){this.terminated=true;}
  }
  const clock={
    setTimeout(fn,ms){const id=nextId++;timers.set(id,{fn,ms});return id;},
    clearTimeout(id){timers.delete(id);},
    fire(ms){const match=[...timers].find(([_,timer])=>timer.ms===ms);assert.ok(match,'No existe temporizador de '+ms+' ms');timers.delete(match[0]);match[1].fn();}
  };
  const window={};
  vm.runInNewContext(source,{window,document:{baseURI:'https://example.com/Vortex/'},
    Worker:FakeWorker,URL,setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout});
  const ctx={symbol:'BTCUSDT',interval:'1h',candles:[{t:1000,c:76000}],
    chart:{active:['nnEma','volume'],pine:[],drawings:[]}};
  const png='data:image/png;base64,AAAA';
  const run=(onProgress)=>window.CCTFreeVision.analyze({ctx,screenshot:png,model:'qwen35',question:'Analiza la captura',onProgress});
  return {api:window.CCTFreeVision,timers,clock,workers,sent,ctx,png,run};
}
test('una inferencia sin respuesta se cancela en 45 segundos y libera el chat', async()=>{
  const h=harness(),p=h.run();
  assert.equal(h.api.isBusy(),true);
  h.workers[0].onmessage({data:{id:1,type:'progress',stage:'inference',message:'Interpretando las velas…'}});
  h.clock.fire(45000);
  await assert.rejects(p,/tardó demasiado|detenida/);
  assert.equal(h.api.isBusy(),false);
  assert.equal(h.workers[0].terminated,true);
});
test('la cancelación manual es inmediata y permite nueva captura',async()=>{
  const h=harness(),p=h.run();
  assert.equal(h.api.cancel(),true);
  await assert.rejects(p,/cancelado/);
  assert.equal(h.api.isBusy(),false);
  assert.equal(h.workers[0].terminated,true);
  const p2=h.run();assert.equal(h.api.isBusy(),true);
  h.api.cancel();await assert.rejects(p2,/cancelado/);
});
test('un modelo que responde entrega imagen real, moneda y temporalidad',async()=>{
  const h=harness(),events=[],p=h.run(text=>events.push(text));
  assert.equal(h.sent[0].screenshot,h.png);
  assert.match(h.sent[0].prompt,/BTCUSDT/);
  assert.match(h.sent[0].prompt,/1h/);
  h.workers[0].onmessage({data:{id:1,type:'progress',stage:'inference',message:'Leyendo el gráfico…'}});
  h.workers[0].onmessage({data:{id:1,type:'result',which:'qwen35',device:'webgpu',
    text:'Las velas caen hacia una zona marcada y se observa volumen elevado.'}});
  const v=await p;
  assert.match(v.text,/velas caen/);
  assert.match(v.model,/Qwen3.5/);
  assert.equal(h.api.isBusy(),false);
  assert.ok(events.some(x=>/Leyendo el gráfico/.test(x)));
});
test('el tiempo total limita también las descargas progresivas',async()=>{
  const h=harness(),p=h.run();
  h.workers[0].onmessage({data:{id:1,type:'progress',stage:'load',message:'Descargando 15%'}});
  h.clock.fire(180000);
  await assert.rejects(p,/tiempo máximo/);
  assert.equal(h.api.isBusy(),false);
  assert.equal(h.workers[0].terminated,true);
});
test('un error del Worker deja listo un nuevo análisis',async()=>{
  const h=harness(),p=h.run();
  h.workers[0].onerror(new Error('GPU lost'));
  await assert.rejects(p,/motor de IA visual/);
  assert.equal(h.api.isBusy(),false);
});
test('imagen inválida se rechaza antes de iniciar el motor',async()=>{
  const h=harness();
  await assert.rejects(h.api.analyze({ctx:h.ctx,screenshot:'no-es-imagen',model:'qwen35'}),/captura PNG/);
  assert.equal(h.workers.length,0);
});
