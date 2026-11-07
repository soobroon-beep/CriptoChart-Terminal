/* El botón Analizar gráfico no debe congelar el chat mientras el modelo visual trabaja. */
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const source=readFileSync(join(__dirname,'..','ai-ui.js'),'utf8');
const start=source.indexOf('  function screenshotPreview('),end=source.indexOf('  function init() {',start);
assert.ok(start>=0&&end>start,'El módulo debe exponer launchVisual y ask');

function harness() {
  const log=[], pending=[];
  class Element {
    constructor(tag='div') {this.tag=tag;this.isConnected=true;this.children=[];this.className='';this.style={};this.attrs={};this.disabled=false;this.textContent='';this.innerHTML='';this.handlers={};}
    appendChild(el){this.children.push(el);el.isConnected=true;}
    remove(){this.isConnected=false;}
    setAttribute(k,v){this.attrs[k]=v;}
    addEventListener(type,callback){this.handlers[type]=callback;}
    focus(){}
  }
  const send=new Element('button'), input=new Element('input');
  const selectors={'#aiSend':send,'#aiInput':input};
  const $=id=>selectors[id];
  const st={busy:false,hist:[],vision:'qwen35',mode:'local'};
  const cs=Array.from({length:40},(_,i)=>({t:i,o:90000-i*350,h:90200-i*350,l:89800-i*350,c:90000-i*350,v:1000}));
  const ctx={symbol:'BTCUSDT',interval:'1h',candles:cs,chart:{candles:cs,active:['nnEma','volume'],drawings:[],pine:[]}};
  let isBusy=false;
  const vision={
    isBusy:()=>isBusy,
    analyze(opts) {
      isBusy=true;
      return new Promise((resolve,reject)=>pending.push({
        opts,resolve:value=>{isBusy=false;resolve(value);},reject:error=>{isBusy=false;reject(error);}
      }));
    },
    cancel() {if(!pending.length)return false;const p=pending.pop();p.reject(Error('Análisis visual cancelado'));return true;}
  };
  const window={
    CCTChartAnalyst:{isChartQuestion:q=>/gráfico|long|short|soporte/i.test(q),answer:()=> '**BTCUSDT · 1h**: presión bajista; volumen activo.'},
    CCT_getAIContext:()=>ctx,CCTFreeVision:vision
  };
  const document={createElement:tag=>new Element(tag)};
  const AI={intent:()=> 'chart',answerLocal:()=> 'Respuesta local'};
  const push=(who,answer)=>{const e=new Element();e.role=who;e.innerHTML=answer;log.push(e);return e;};
  const md=s=>String(s);
  const mostlyEnglish=()=>false;
  const captureChart=()=>'data:image/png;base64,AAAA';
  const uniqueVisualDetail=()=>true;
  const loadCalendar=()=>Promise.resolve([]);
  let badgeCount=0;
  const code=source.slice(start,end)+'\nreturn {ask,launchVisual};';
  const module=new Function('window','document','st','$','AI','push','md','mostlyEnglish','captureChart',
    'uniqueVisualDetail','loadCalendar','badge','BRIEF_Q',code)(
      window,document,st,$,AI,push,md,mostlyEnglish,captureChart,uniqueVisualDetail,loadCalendar,
      ()=>{badgeCount++},'Brief del día'
    );
  return {module,window,document,st,log,pending,send,input,vision,ctx};
}
test('Analizar gráfico responde y habilita el chat aun si Qwen no responde',async()=>{
  const h=harness();
  await h.module.ask('Analiza el gráfico');
  assert.equal(h.st.busy,false);
  assert.equal(h.send.disabled,false);
  assert.ok(h.log.some(x=>x.role==='bot' && /presión bajista/.test(x.innerHTML)));
  assert.equal(h.pending.length,1);
  assert.equal(h.pending[0].opts.screenshot,'data:image/png;base64,AAAA');
  assert.equal(h.pending[0].opts.ctx.symbol,'BTCUSDT');
  assert.equal(h.pending[0].opts.ctx.interval,'1h');
});
test('una nueva pregunta se contesta mientras Qwen sigue procesando la anterior',async()=>{
  const h=harness();
  await h.module.ask('Analiza el gráfico');
  await h.module.ask('¿Buena zona long o short?');
  assert.equal(h.pending.length,1,'No debe iniciar una segunda inferencia GPU simultánea');
  assert.equal(h.st.busy,false);
  const bots=h.log.filter(x=>x.role==='bot');
  assert.equal(bots.length,2);
  assert.match(bots[1].innerHTML,/presión bajista/);
});
test('al cancelar la visión se conserva el análisis calculado',async()=>{
  const h=harness();
  await h.module.ask('Analiza el gráfico');
  const bot=h.log.find(x=>x.role==='bot');
  const status=bot.children.find(x=>x.className==='ai-vision-progress'), button=status.children.find(x=>x.tag==='button');
  assert.ok(button);
  button.handlers.click();
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(h.st.busy,false);
  assert.match(bot.innerHTML,/presión bajista/);
  assert.match(status.children[0].textContent,/cancelada/i);
});
test('un resultado visual válido en español actualiza la misma respuesta',async()=>{
  const h=harness();
  await h.module.ask('Analiza el gráfico');
  h.pending[0].resolve({model:'Qwen3.5-VL-2B',text:'Las velas caen hacia la zona dibujada y el volumen es alto.'});
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  const bot=h.log.find(x=>x.role==='bot');
  assert.match(bot.innerHTML,/Observación visual/);
  assert.match(bot.innerHTML,/velas caen/);
  assert.equal(h.st.busy,false);
});


test('la captura mostrada en miniatura es la misma cadena PNG que recibió el Worker',async()=>{
  const h=harness();
  await h.module.ask('Analiza el gráfico');
  const bot=h.log.find(x=>x.role==='bot');
  const preview=bot.children.find(x=>x.tag==='details');
  assert.ok(preview,'Debe existir una previsualización real');
  const image=preview.children.find(x=>x.tag==='img');
  assert.ok(image);
  assert.equal(image.src,h.pending[0].opts.screenshot);
  assert.match(preview.children[0].textContent,/captura real enviada/i);
});
