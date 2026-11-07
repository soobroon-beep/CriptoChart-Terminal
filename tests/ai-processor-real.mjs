/* Verificación de INFERENCIA PREVIA con librería y procesador Qwen reales.
   No usa mocks: descarga configuración/tokenizador, crea captura PNG, la decodifica
   y la convierte en los tensores de visión que recibirá el modelo.
   No afirma que se haya ejecutado la generación GPU de 2B parámetros. */
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
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
const decoded=await RawImage.read(dataUrl);
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
