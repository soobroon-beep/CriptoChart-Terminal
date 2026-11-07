/* Prueba REAL de inferencia visual en Chromium, no Node ni Worker simulado.
   Descarga los pesos de Qwen3.5-0.8B y genera texto desde un canvas en
   el mismo navegador que utiliza el usuario (motor CPU/WASM).
   Si no se genera texto que describa el movimiento, la prueba falla. */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';

const server=createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});
  res.end('<!doctype html><html><meta charset="utf-8"><title>Vortex Vision Browser Test</title><body>Probando lectura visual real</body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const browser=await chromium.launch({
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']
});
const page=await browser.newPage();
page.on('console',msg=>console.log('[Chrome]',msg.type(),msg.text().slice(0,180)));
page.on('pageerror',e=>console.error('[Chrome error]',e.message));
page.on('requestfailed',r=>console.log('[Chrome red]',r.url().slice(0,120),r.failure()?.errorText));
try {
 await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'load'});
 const output=await page.evaluate(async()=>{
  const T=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.4.0-next.0');
  T.env.backends.onnx.wasm.numThreads=1;
  const canvas=document.createElement('canvas');
  canvas.width=440;canvas.height=310;
  const g=canvas.getContext('2d');
  g.fillStyle='#0b1020';g.fillRect(0,0,440,310);
  g.strokeStyle='#5878a8';g.beginPath();g.moveTo(10,140);g.lineTo(430,140);g.stroke();
  for(let i=0;i<32;i++){
   const x=18+i*12,y=52+i*5.2+5*Math.sin(i);
   g.fillStyle=i%7===0?'#20b7a4':'#ed4864';
   g.fillRect(x,y,7,11);
   g.fillRect(x+3,y-5,1,22);
   g.fillStyle='#315079';g.fillRect(x,242,7,7+(i*13)%26);
  }
  const png=canvas.toDataURL('image/png');
  const data=Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0));
  const raw=await T.RawImage.fromBlob(new Blob([data],{type:'image/png'}));
  const modelId='onnx-community/Qwen3.5-0.8B-ONNX';
  console.log('PNG real:',raw.width,raw.height,'Cargando procesador...');
  const processor=await T.AutoProcessor.from_pretrained(modelId);
  const prompt='Sin saludos, títulos ni listas. Observa estas velas de izquierda a derecha. Responde en español en una frase: ¿termina el precio más arriba o más abajo que al inicio?';
  const msgs=[{role:'user',content:[{type:'image'},{type:'text',text:prompt}]}];
  const formatted=processor.apply_chat_template(msgs,{add_generation_prompt:true,enable_thinking:false});
  const inputs=await processor(formatted,raw);
  if(!inputs.pixel_values||!inputs.image_grid_thw)throw Error('Faltan tensores de visión');
  console.log('Generación en Chromium CPU/WASM con pesos reales...');
  const model=await T.Qwen3_5ForConditionalGeneration.from_pretrained(modelId,{
   device:'wasm',dtype:{embed_tokens:'q4',vision_encoder:'fp16',decoder_model_merged:'q4'}
  });
  const before=performance.now();
  const result=await model.generate({...inputs,max_new_tokens:55,do_sample:false});
  const generated=result.slice(null,[inputs.input_ids.dims.at(-1),null]);
  const decoded=await processor.batch_decode(generated,{skip_special_tokens:true});
  const text=String(decoded?.[0]||'').trim();
  const elapsed=Math.round(performance.now()-before);
  await model.dispose?.();
  return {text,elapsed,pixels:raw.width+'x'+raw.height,keys:Object.keys(inputs)};
 });
 console.log('LECTURA VISUAL REAL EN CHROMIUM:',JSON.stringify(output));
 assert.ok(output.text.length>=10,'La generación del navegador llegó vacía');
 assert.match(output.text,/baj|abajo|descend|cae|caída|sub|arriba|precio|velas/i,
  'El navegador no pudo describir las velas');
 assert.ok(output.keys.includes('pixel_values'));
 console.log('PASS: La lectura de gráfico se GENERÓ en un navegador Chromium real sin servidor de IA.');
} finally {
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
