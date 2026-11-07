/* Verificaciones del analista que usa el rango visible del gráfico. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const window={};
vm.runInNewContext(readFileSync(join(__dirname,'..','ai-chart.js'),'utf8'),{window});
const A=window.CCTChartAnalyst;
const candles=(n=110,base=1.75,slope=-.005)=>Array.from({length:n},(_,i)=>({
 t:1e12+i*3600000,o:base+i*slope+.002,h:base+i*slope+.012,
 l:base+i*slope-.012,c:base+i*slope,v:500+i
}));
const ctx=(cs=candles(),options={})=>({
 symbol:'XRPUSDT',interval:'1h',candles:cs,active:['macd','rsi'],
 chart:{candles:cs,active:['nnIa','nnEma','volume','vpvr'],values:{},
  nova:{top:1.42,bot:1.4,last:{side:'sell',ago:2}},
  vp:{poc:1.47},pine:[{name:'Nova Oscillator',plots:[{title:'Osc',value:-32}]}],
  drawings:[{type:'short',a:{t:cs[cs.length-20].t,p:1.48},b:{t:cs[cs.length-3].t,p:1.24}},
    {type:'rect',a:{t:cs[cs.length-20].t,p:1.35},b:{t:cs[cs.length-3].t,p:1.41}}],...options}
});
test('responde LONG/SHORT en español con zonas y datos reales',()=>{
 const r=A.answer('¿Conviene entrar en long o short aquí?',ctx());
 assert.match(r,/Long/);assert.match(r,/Short/);
 assert.match(r,/bajista/);assert.match(r,/POC/);
 assert.match(r,/Dibujo SHORT/);
 assert.doesNotMatch(r,/MACD|RSI|Bollinger/);
});
test('lee EMAs activas y valores de indicadores personalizados',()=>{
 const c=ctx();c.chart.active.push('ema20');c.chart.values.ema20=1.48;
 const r=A.answer('¿Qué marcan mis indicadores?',c);
 assert.match(r,/EMA principal/);
 assert.match(r,/Nova Oscillator/);
 assert.match(r,/1.48/);
});
test('respeta el tramo visible en vez de las últimas velas de otro rango',()=>{
 const all=candles(200,1.1,.003);
 const old=candles(70,1.75,-.006);
 const c=ctx(all,{candles:old,historical:true});
 const r=A.answer('Analiza mi gráfico',c);
 assert.match(r,/bajista/);
 assert.match(r,/tramo histórico/);
});
test('no utiliza valores de EMA de un indicador oculto',()=>{
 const c=ctx();c.chart.values.ema20=2;c.chart.active=['volume'];
 const r=A.answer('¿Qué muestra mi EMA?',c);
 assert.doesNotMatch(r,/EMA principal \(/);
 assert.match(r,/No hay EMAs/);
});
test('responde sobre el POC y volumen sin inventar indicadores',()=>{
 const r=A.answer('¿Cómo ves el volumen y el POC?',ctx());
 assert.match(r,/POC/);
 assert.match(r,/volumen/);
 assert.doesNotMatch(r,/MACD|RSI/);
});
test('el chat reconoce preguntas comunes y no interfiere con noticias ni briefing',()=>{
 for(const s of ['Analiza el gráfico','¿Cómo ves una entrada long o short?','¿Dónde están los soportes y resistencias?','¿Qué marcan las EMAs?']){
  assert.equal(A.isChartQuestion(s),true,s);
 }
 for(const s of ['Brief del día','Noticias de la Fed','Calendario económico','Generar indicador Pine']){
  assert.equal(A.isChartQuestion(s),false,s);
 }
});
test('no inventa señal ni precio sin velas suficientes',()=>{
 assert.match(A.answer('¿Long o short?',{candles:[]}),/12 velas/);
});

test('distingue rebote breve dentro de caída visible fuerte',()=>{
 const cs=Array.from({length:120},(_,i)=>{const p=i<96?90000-i*150:75600+(i-96)*23;
   return {t:i*3600000,c:p,o:p+20,h:p+120,l:p-120,v:1000};});
 const c=ctx(cs,{active:['volume'],nova:null,drawings:[],pine:[]});
 const r=A.answer('Analiza el gráfico',c);
 assert.match(r,/20 velas tienen sesgo \*\*alcista\*\*/);
 assert.match(r,/contexto de 80 velas sigue \*\*bajista\*\*/);
 assert.match(r,/rebote no confirma/);
});
test('la trayectoria dibujada no se confunde con un movimiento de mercado confirmado',()=>{
 const c=ctx();
 c.chart.drawings.push({type:'brush',brushPath:{
   start:{t:c.chart.candles[50].t,p:1.22},
   end:{t:c.chart.candles[75].t,p:1.38}
 }});
 const r=A.answer('Analiza el gráfico',c);
 assert.match(r,/proyección hacia arriba/);
 assert.match(r,/no una señal confirmada/);
});
