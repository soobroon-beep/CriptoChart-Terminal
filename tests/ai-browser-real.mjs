/* PRUEBA END-TO-END REAL: Chromium -> ai-vision.js -> ai-vision-worker.js
   -> descarga modelo Qwen3.5 real -> PNG canvas -> generate() -> español.
   No hay mocks, modelos sustitutos ni generación en Node. */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const scripts={
 '/ai-vision.js':readFileSync(new URL('../ai-vision.js',import.meta.url),'utf8'),
 '/ai-vision-worker.js':readFileSync(new URL('../ai-vision-worker.js',import.meta.url),'utf8')
};
const server=createServer((req,res)=>{
 const path=String(req.url||'/').split('?')[0];
 if(scripts[path]){
  res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-cache'});
  res.end(scripts[path]);return;
 }
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});
 res.end('<!doctype html><meta charset="utf-8"><script src="/ai-vision.js"></script><body>Vortex Browser Vision Test</body>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const page=await browser.newPage();
page.on('console',msg=>console.log('[Chromium]',msg.type(),msg.text().slice(0,240)));
page.on('pageerror',e=>console.error('[Chrome error]',e.message));
page.on('requestfailed',req=>console.log('[Red]',req.url().slice(0,120),req.failure()?.errorText));
try{
 await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'load'});
 const result=await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=440;canvas.height=310;
  const g=canvas.getContext('2d');
  g.fillStyle='#0b1020';g.fillRect(0,0,440,310);
  g.strokeStyle='#5878a8';g.beginPath();g.moveTo(10,140);g.lineTo(430,140);g.stroke();
  for(let i=0;i<32;i++){
   const x=18+i*12,y=52+i*5.2+5*Math.sin(i);
   g.fillStyle=i%7===0?'#20b7a4':'#ed4864';g.fillRect(x,y,7,11);
   g.fillRect(x+3,y-5,1,22);
   g.fillStyle='#315079';g.fillRect(x,242,7,7+(i*13)%26);
  }
  const screenshot=canvas.toDataURL('image/png');
  const candles=Array.from({length:32},(_,i)=>({
   t:i*3600000,o:90-i,h:95-i,l:85-i,c:89-i,v:100+i
  }));
  const ctx={symbol:'BTCUSDT',interval:'1h',candles,chart:{
   candles,active:['volume'],names:['Volumen'],pine:[],drawings:[]
  }};
  console.log('Iniciando CCTFreeVision.analyze real con PNG',screenshot.length,'bytes');
  const started=Date.now(),progress=[];
  const response=await window.CCTFreeVision.analyze({
   ctx,screenshot,model:'qwen08cpu',question:'Analiza el gráfico',
   onProgress:msg=>{
    progress.push(msg);
    if(progress.length<=12||progress.length%20===0)console.log('Estado:',msg);
   }
  });
  const upCanvas=document.createElement('canvas');upCanvas.width=440;upCanvas.height=310;
  const up=upCanvas.getContext('2d');
  up.fillStyle='#0b1020';up.fillRect(0,0,440,310);
  up.strokeStyle='#5878a8';up.beginPath();up.moveTo(10,140);up.lineTo(430,140);up.stroke();
  for(let i=0;i<32;i++){
   const x=18+i*12,y=245-i*5.2+5*Math.sin(i);
   up.fillStyle=i%7===0?'#ed4864':'#20b7a4';up.fillRect(x,y,7,11);
   up.fillRect(x+3,y-5,1,22);
   up.fillStyle='#315079';up.fillRect(x,242,7,7+(i*13)%26);
  }
  const upCandles=candles.map((c,i)=>({...c,c:60+i,o:60+i,h:65+i,l:55+i}));
  const upCtx={...ctx,candles:upCandles,chart:{...ctx.chart,candles:upCandles}};
  const secondStart=Date.now();
  const second=await window.CCTFreeVision.analyze({
   ctx:upCtx,screenshot:upCanvas.toDataURL('image/png'),model:'qwen08cpu',
   question:'Analiza el gráfico',
   onProgress:msg=>{if(/generando|Qwen está leyendo/.test(msg))console.log('Segundo análisis:',msg);}
  });
  return {response,second,elapsedMs:Date.now()-started,
    secondElapsedMs:Date.now()-secondStart,progress:progress.slice(-8)};
 });
 console.log('LECTURA VISUAL COMPLETA EN CHROME:',JSON.stringify(result));
 assert.ok(result.response.text.length>=15,'No se generó una observación visual');
 assert.match(result.response.text,/abajo|baj|descen|cae|velas|volumen/i,
  'El Worker no leyó el descenso de las velas');
 assert.match(result.response.model,/Qwen3.5/);
 assert.equal(result.response.device,'wasm');
 assert.ok(result.second.text.length>=15,'No se generó segunda lectura');
 assert.match(result.response.text,/abajo|baja|descen|cae/i,'El modelo no reconoció caída');
 assert.match(result.second.text,/arriba|sube|ascend|alcista|más alto/i,
   'El modelo no reconoció subida en imagen diferente');
 assert.equal(result.second.device,'wasm');
 console.log('PASS: El mismo Worker distingue dos gráficos de direcciones opuestas.');
 console.log('PASS: Vortex leyó un gráfico y completó model.generate en navegador Chromium, sin API ni mocks.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
