/* Prueba verdadera de generación visual con modelo abierto de Qwen3.5 (sin mocks).
   En CPU de GitHub Actions: si no puede generar, esta verificación FALLA.
   El test NO equivale a validar WebGPU en una computadora específica. */
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {AutoProcessor,Qwen3_5ForConditionalGeneration,RawImage} from '@huggingface/transformers';

const WIDTH=448,HEIGHT=320;
const canvas=createCanvas(WIDTH,HEIGHT),g=canvas.getContext('2d');
g.fillStyle='#0b1020';g.fillRect(0,0,WIDTH,HEIGHT);
g.strokeStyle='#394358';g.lineWidth=1;g.beginPath();g.moveTo(20,240);g.lineTo(430,240);g.moveTo(20,270);g.lineTo(430,270);g.stroke();
g.strokeStyle='#5077b5';g.beginPath();g.moveTo(15,145);g.lineTo(435,145);g.stroke();
for(let i=0;i<33;i++){
 const x=24+i*12,base=55+i*5+8*Math.sin(i*.9),body=8+i%5;
 g.strokeStyle=i%8===0?'#13b9a7':'#eb435b';g.fillStyle=g.strokeStyle;
 g.fillRect(x,base,6,body);
 g.beginPath();g.moveTo(x+3,base-5);g.lineTo(x+3,base+body+8);g.stroke();
 g.fillStyle='#214b74';g.fillRect(x,240,6,6+(i*11)%27);
}
g.strokeStyle='#e8f2ff';g.lineWidth=2;g.beginPath();g.moveTo(300,200);g.lineTo(340,180);g.lineTo(385,140);g.stroke();
const bytes=canvas.toBuffer('image/png');
const img=await RawImage.fromBlob(new Blob([bytes],{type:'image/png'}));
assert.equal(img.width,WIDTH);assert.equal(img.height,HEIGHT);
const modelId='onnx-community/Qwen3.5-0.8B-ONNX';
console.log('Cargando modelo REAL:',modelId,'para inferencia visual en CPU');
const processor=await AutoProcessor.from_pretrained(modelId);
const conversation=[{role:'user',content:[
 {type:'image'},
 {type:'text',text:'Mira esta captura de un gráfico de velas. Describe brevemente en español si las últimas velas suben o bajan y si hay volumen debajo del precio.'}
]}];
const formatted=processor.apply_chat_template(conversation,{add_generation_prompt:true,enable_thinking:false});
const inputs=await processor(formatted,img);
assert.ok(inputs.pixel_values && inputs.image_grid_thw,'Faltan tensores de imagen');
console.log('Visión lista: pixel_values',inputs.pixel_values.dims,'image_grid_thw',inputs.image_grid_thw.dims);
const model=await Qwen3_5ForConditionalGeneration.from_pretrained(modelId,{
 device:'cpu',
 dtype:{embed_tokens:'q4',vision_encoder:'fp16',decoder_model_merged:'q4'},
 progress_callback:info=>{
   if(info.status==='progress' && Number.isFinite(info.progress) && Math.round(info.progress)%25===0)
      console.log('Pesos modelo',Math.round(info.progress)+'%');
 }
});
console.log('MODELO CARGADO; GENERANDO DESDE IMAGEN REAL…');
const started=Date.now();
const output=await model.generate({...inputs,max_new_tokens:55,do_sample:false});
const inputLength=inputs.input_ids.dims.at(-1);
const decoded=processor.batch_decode(output.slice(null,[inputLength,null]),{skip_special_tokens:true});
const answer=String(decoded?.[0]||'').trim();
console.log('RESPUESTA VISUAL REAL:',answer);
console.log('Duración de generación (ms):',Date.now()-started);
assert.ok(answer.length>=12,'La salida fue vacía o demasiado corta');
assert.ok(!/^\s*(?:undefined|null)\s*$/i.test(answer));
console.log('PASS: Un modelo auténtico ha generado una respuesta a partir de un PNG de velas.');
await model.dispose?.();
