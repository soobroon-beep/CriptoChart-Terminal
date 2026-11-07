/* Verifica que la IA reciba el lienzo entero, incluidos los paneles inferiores. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const code=readFileSync(join(__dirname,'..','ai-ui.js'),'utf8');
const a=code.indexOf('  function captureChart(ctx) {');
const b=code.indexOf('  function uniqueVisualDetail(',a);
assert.ok(a>=0&&b>a);
test('captura real del canvas completo con BTC, temporalidad, indicadores y dibujos',()=>{
 const calls=[],canvas={width:2048,height:860};
 const g={
   fillRect(...p){calls.push(['background',...p]);},
   fillText(...p){calls.push(['text',...p]);},
   drawImage(...p){calls.push(['image',...p]);}
 };
 const created=[];
 const document={
   getElementById:id=>id==='priceCanvas'?canvas:null,
   createElement:tag=>{assert.equal(tag,'canvas');const el={
     width:0,height:0,getContext:()=>g,
     toDataURL:()=> 'data:image/png;base64,AAAA'
   };created.push(el);return el;}
 };
 const capture=new Function('document',code.slice(a,b)+'\nreturn captureChart')(document);
 const ctx={symbol:'BTCUSDT',interval:'1h',
   chart:{historical:false,names:['Nova Nexus','Volumen','Nova Oscillator'],
     pine:[{name:'Mi script de tendencia'}]}};
 const result=capture(ctx);
 assert.match(result,/^data:image\/png;base64,/);
 const actual=calls.find(x=>x[0]==='image');
 assert.equal(actual[1],canvas);
 assert.equal(actual[2],0);
 assert.equal(actual[3],64);
 assert.equal(actual[5],Math.round(canvas.height*Math.min(1,1600/canvas.width,1150/canvas.height)));
 const words=calls.filter(x=>x[0]==='text').map(x=>x[1]).join(' ');
 assert.match(words,/BTCUSDT/);assert.match(words,/1h/);
 assert.match(words,/Nova Oscillator/);assert.match(words,/Volumen/);
 assert.ok(created[0].height>actual[5],'No debe recortar los paneles inferiores');
});
