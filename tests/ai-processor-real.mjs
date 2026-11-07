/* Verificación de INFERENCIA PREVIA con librería y procesador Qwen reales.
   No usa mocks: descarga configuración/tokenizador, crea captura PNG, la decodifica
   y la convierte en los tensores de visión que recibirá el modelo.
   No afirma que se haya ejecutado la generación GPU de 2B parámetros. */
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {createCanvas} from '@napi-rs/canvas';
import {readFileSync} from 'node:fs';
import {AutoProcessor,RawImage} from '@huggingface/transformers';
const W=576,H=344,plotTop=45,plotBottom=270;
const png=new PNG({width:W,height:H,colorType:6});
function pixel(x,y,r,g,b){if(x<0||y<0||x>=W||y>=H)return;const i=(y*W+x)*4;png.data[i]=r;png.data[i+1]=g;png.data[i+2]=b;png.data[i+3]=255;}
for(let y=0;y<H;y++)for(let x=0;x<W;x++)pixel(x,y,10,15,27);
function rect(x,y,w,h,r,g,b){for(let j=Math.max(0,y);j<Math.min(H,y+h);j++)for(let i=Math.max(0,x);i<Math.min(W,x+w);i++)pixel(i,j,r,g,b)}
rect(0,270,W,1,75,80,100);
let previous=180;
for(let i=0;i<43;i++){
 const green=i%7===0,top=Math.round(90+i*2.5-(green?22:0));
 const bot=Math.min(240,top+Math.round(11+i/8));
 const x=28+i*11;
 rect(x+2,top-6,1,bot-top+12,green?15:235,green?185:65,green?145:90);
 rect(x,top,6,bot-top,green?13:210,green?184:70,green?148:100);
 rect(x,270,6,Math.round(10+(i%9)*4),43,81,122);
 previous=bot;
}
for(let x=20;x<W-30;x+=2) {
 const y=Math.round(317+10*Math.sin(x/31));
 rect(x,y,2,2,80,177,200);
}
const dataUrl='data:image/png;base64,'+PNG.sync.write(png).toString('base64');
const decoded=await RawImage.fromBlob(new Blob([Buffer.from(dataUrl.split(',')[1],'base64')],{type:'image/png'}));
assert.equal(decoded.width,W);
assert.equal(decoded.height,H);
assert.ok(decoded.data.length>=W*H*3);
console.log('PNG real decodificado:',W,'x',H,'bytes=',dataUrl.length);
const modelId='huggingworld/Qwen3.5-2B-ONNX';
const processor=await AutoProcessor.from_pretrained(modelId);
const conversation=[{role:'user',content:[
  {type:'image'},
  {type:'text',text:'Responde en español. Describe las velas bajistas y el volumen que aparecen en la imagen.'}
]}];
const formatted=processor.apply_chat_template(conversation,
  {add_generation_prompt:true,enable_thinking:false});
assert.equal(typeof formatted,'string');
const inputs=await processor(formatted,decoded);
assert.ok(inputs.input_ids?.dims?.at(-1)>10,'Faltan tokens del prompt');
const keys=Object.keys(inputs);
assert.ok(keys.some(k=>/pixel|image|grid/i.test(k)),
  'No se generaron tensores de visión: '+JSON.stringify(keys));
console.log('PROCESADOR REAL Qwen3.5: ACEPTÓ EL PNG Y PRODUJO ENTRADAS MULTIMODALES');
console.log('Claves:',keys.join(', '));
console.log('Tokenización:',inputs.input_ids.dims.join('×'));
for(const k of keys)if(/pixel|image|grid/i.test(k))console.log(k,inputs[k]?.dims||'presente');


// PRUEBA END-TO-END: lienzo físico real -> captura real de Vortex -> PNG ->
// bytes del PNG -> decodificador auténtico -> procesador multimodal Qwen.
const canvas=createCanvas(1280,680);
const g=canvas.getContext('2d');
g.fillStyle='#0b101e';g.fillRect(0,0,1280,680);
g.strokeStyle='#1b2438';g.lineWidth=1;
for(let x=50;x<1250;x+=90){g.beginPath();g.moveTo(x,10);g.lineTo(x,670);g.stroke();}
for(let y=60;y<660;y+=65){g.beginPath();g.moveTo(0,y);g.lineTo(1280,y);g.stroke();}
g.fillStyle='#192238';g.fillRect(0,500,1280,1);g.fillRect(0,584,1280,1);
for(let i=0;i<96;i++){
  const x=18+i*10;
  const down=i%5!==0,price=160+i*2-(i%8)*8,body=7+i%11;
  g.strokeStyle=down?'#ed4864':'#1fc1a1';g.fillStyle=g.strokeStyle;
  g.fillRect(x,price,6,body);
  g.beginPath();g.moveTo(x+3,price-5);g.lineTo(x+3,price+body+6);g.stroke();
  g.fillStyle='#244f84';g.fillRect(x,500,6,Math.min(72,4+i%12*5));
}
g.strokeStyle='#31a8cd';g.beginPath();
for(let x=10;x<1200;x+=5){const y=622+23*Math.sin(x/92);if(x===10)g.moveTo(x,y);else g.lineTo(x,y);}g.stroke();
g.strokeStyle='#fafafa';g.lineWidth=2;g.beginPath();
g.moveTo(850,445);g.lineTo(900,410);g.lineTo(960,393);g.lineTo(1030,360);g.stroke();
g.strokeStyle='#1375d5';g.lineWidth=2;g.beginPath();g.moveTo(0,347);g.lineTo(1280,347);g.stroke();
const fakeDocument={
  getElementById:id=>id==='priceCanvas'?canvas:null,
  createElement:tag=>{assert.equal(tag,'canvas');return createCanvas(1,1);}
};
const code=readFileSync('ai-ui.js','utf8');
const from=code.indexOf('  function captureChart(ctx) {');
const to=code.indexOf('  function uniqueVisualDetail(',from);
assert.ok(from>=0&&to>from);
const capture=new Function('document',code.slice(from,to)+'\nreturn captureChart')(fakeDocument);
const displayedContext={symbol:'BTCUSDT',interval:'1h',chart:{
  historical:false,names:['Nova Nexus','Volumen','Perfil de volumen'],
  pine:[{name:'Nova Oscillator'}]
}};
const realCaptured=capture(displayedContext);
assert.match(realCaptured,/^data:image\/png;base64,/);
assert.ok(capture.lastMeta?.width>200 && capture.lastMeta?.height>200);
assert.equal(capture.lastMeta.symbol,'BTCUSDT');
assert.equal(capture.lastMeta.interval,'1h');
const bytes=Buffer.from(realCaptured.split(',')[1],'base64');
const rawCapture=await RawImage.fromBlob(new Blob([bytes],{type:'image/png'}));
assert.equal(rawCapture.width,capture.lastMeta.width);
assert.equal(rawCapture.height,capture.lastMeta.height);
const actualInputs=await processor(formatted,rawCapture);
assert.ok(actualInputs.input_ids?.dims?.at(-1)>10);
assert.ok(Object.keys(actualInputs).some(k=>/pixel|image_grid/.test(k)));
console.log('CAPTURA COMPLETA DE VORTEX ACEPTADA POR QWEN: BTCUSDT 1h,',
  capture.lastMeta.width+'×'+capture.lastMeta.height,
  '· PNG',bytes.byteLength,'bytes');
console.log('Tensores de la captura real:',
  actualInputs.pixel_values?.dims,actualInputs.image_grid_thw?.dims);
