/* VORTEX · Analista del tramo visible: velas, EMAs activas, Nova, volumen y dibujos.
   No utiliza indicadores ocultos, no ejecuta órdenes ni promete entradas seguras. */
(function(root){
'use strict';
const ok=x=>typeof x==='number'&&Number.isFinite(x);
const fmt=x=>!ok(x)?'—':x.toLocaleString('es-MX',{maximumFractionDigits:Math.abs(x)>100?2:Math.abs(x)>=1?4:Math.abs(x)>=.01?5:8});
const money=x=>'$'+fmt(x);
const pct=(x,b)=>ok(x)&&ok(b)&&b>0?(x-b)/b*100:0;
const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const safe=s=>String(s||'').replace(/[\r\n*<>]/g,'').slice(0,54);
function isChartQuestion(s){
 const q=normal(s);
 if(!q||/\b(brief|noticias?|calendario|evento economico|fomc|fed|inflacion|crear indicador|generar indicador|codigo pine)\b/.test(q))return false;
 return /\b(long|short|entrar|entrada|operar|comprar|vender|trade|trading|scalp|stop|riesgo|volumen|poc|perfil|soportes?|resistencias?|emas?|medias?|nube|tendencia|oscilador|indicadores?|senal|dibujos?|zonas?|velas?|nexus|grafico|alcista|bajista|ruptura|rebote|patrones?)\b|como (?:lo )?ves|que opinas|analiza|analizame|que ves/.test(q);
}
function kind(q){
 const t=normal(q);
 if(/\b(long|short|entrar|entrada|comprar|vender|operar|trade|trading|scalp|stop|riesgo)\b|buena zona/.test(t))return 'trade';
 if(/soporte|resistencia|niveles?|zonas?/.test(t))return 'levels';
 if(/volumen|poc|perfil/.test(t))return 'volume';
 if(/\bemas?\b|nube|medias? movil/.test(t))return 'ema';
 if(/oscilador|nexus|indicadores?|senal/.test(t))return 'indicators';
 return 'overview';
}
function facts(ctx){
 if(!ctx)return null;
 const view=ctx.chart||{},cs=view.candles&&view.candles.length?view.candles:ctx.candles||[];
 if(cs.length<12)return null;
 const n=cs.length,cur=cs[n-1],price=cur.c;
 if(!ok(price)||price<=0)return null;
 const active=Array.isArray(view.active)?view.active:ctx.active||[];
 const vals=view.values||ctx.values||{},draw=view.drawings||ctx.drawings||[];
 const pine=view.pine||ctx.pine||[],nova=view.nova||(active.some(k=>/^nn/.test(k))?ctx.nova:null);
 const vp=view.vp||(active.some(k=>k==='vpvr'||k==='nnVP')?ctx.vp:null);
 const n20=Math.min(20,n-1),n5=Math.min(5,n-1),change=pct(price,cs[n-1-n20].c),short=pct(price,cs[n-1-n5].c);
 const trend=change<-0.45?'bajista':change>0.45?'alcista':'lateral / transición';
 const last20=cs.slice(-Math.min(20,n)),lo=Math.min(...last20.map(x=>x.l)),hi=Math.max(...last20.map(x=>x.h));
 const volumes=last20.map(x=>x.v).filter(ok),avgVol=volumes.length>7?volumes.reduce((a,b)=>a+b,0)/volumes.length:null;
 const volRatio=ok(cur.v)&&ok(avgVol)&&avgVol>0?cur.v/avgVol:null;
 const emaKeys=['ema20','ema50','sma200','wma20','vwap'];
 const ema=emaKeys.filter(k=>active.includes(k)&&ok(vals[k])).map(k=>({key:k,name:safe((view.names||[])[active.indexOf(k)]||(k==='ema20'?'EMA principal':k==='ema50'?'EMA 50':k==='sma200'?'SMA 200':k==='wma20'?'WMA':'VWAP')),value:vals[k]}));
 const cloud=nova&&active.includes('nnEma')&&ok(nova.top)&&ok(nova.bot)?[Math.min(nova.bot,nova.top),Math.max(nova.bot,nova.top)]:null;
 const points=[],add=(p,origin,weight)=>{if(ok(p)&&p>0)points.push({p,origin,weight})};
 for(const d of draw){
  if(!d||d.hide)continue;
  if((d.type==='horizontal'||d.type==='hray')&&d.a)add(d.a.p,'línea dibujada',4);
  if(d.type==='rect'&&d.a&&d.b){add(d.a.p,'rectángulo dibujado',4);add(d.b.p,'rectángulo dibujado',4);}
  if((d.type==='long'||d.type==='short')&&d.a)add(d.a.p,'entrada dibujada',3);
  if((d.type==='trend'||d.type==='ray')&&d.a&&d.b&&ok(d.a.t)&&ok(d.b.t)&&d.a.t!==d.b.t){
    const extrap=d.a.p+(d.b.p-d.a.p)*(cur.t-d.a.t)/(d.b.t-d.a.t);
    if(Math.abs(pct(extrap,price))<20)add(extrap,'línea de tendencia',3);
  }
 }
 if(active.includes('nnSR')){
  for(const z of (ctx.zones&&ctx.zones.sup||[]).concat(ctx.zones&&ctx.zones.res||[]).slice(-10)){
    add(z.top,'zona Nova',3);add(z.bot,'zona Nova',3);
  }
 }
 if(vp&&ok(vp.poc))add(vp.poc,'POC de volumen',3);
 for(let i=3;i<cs.length-3;i++){
  const c=cs[i],w=cs.slice(i-3,i+4);
  if(w.every((x,j)=>j===3||c.l<=x.l))add(c.l,'mínimo local',1);
  if(w.every((x,j)=>j===3||c.h>=x.h))add(c.h,'máximo local',1);
 }
 add(lo,'mínimo de 20 velas',1);add(hi,'máximo de 20 velas',1);
 const tol=Math.max(price*.0015,(hi-lo)*.018);
 function nearest(list){const out=[];for(const v of list.sort((a,b)=>Math.abs(a.p-price)-Math.abs(b.p-price)||b.weight-a.weight)){
  if(out.every(z=>Math.abs(z.p-v.p)>tol))out.push(v);
  if(out.length===2)break;
 }return out;}
 const supports=nearest(points.filter(x=>x.p<price-price*.0002)),
  resistances=nearest(points.filter(x=>x.p>price+price*.0002));
 const osc=pine.find(x=>/nova.*oscil|oscil.*nova/i.test(x.name||''));
 const positions=draw.filter(x=>x&&(x.type==='long'||x.type==='short')&&x.a&&ok(x.a.p));
 const regions=draw.filter(x=>x&&x.type==='rect'&&x.a&&x.b&&ok(x.a.p)&&ok(x.b.p));
 return {ctx,view,cs,cur,price,active,vals,draw,pine,nova,vp,change,short,trend,lo,hi,volRatio,ema,cloud,supports,resistances,osc,positions,regions,historical:!!view.historical};
}
function intro(f){return '**'+safe(f.ctx.symbol||'Gráfico')+' · '+safe(f.ctx.interval||'')+'**'+
 (f.historical?' (tramo histórico, no precio actual)':'')+': '+money(f.price)+'.';}
function indicators(f){
 const parts=f.ema.slice(0,3).map(e=>'precio '+(f.price<e.value?'bajo':f.price>e.value?'sobre':'en')+' '+e.name+' ('+fmt(e.value)+')');
 if(f.active.includes('rsi')&&ok(f.vals.rsi))parts.push('RSI visible: '+fmt(f.vals.rsi));
 if(f.active.includes('macd')&&ok(f.vals.macdHist))parts.push('MACD visible, histograma '+fmt(f.vals.macdHist));
 if(f.active.includes('bollinger')&&ok(f.vals.bbUpper)&&ok(f.vals.bbLower))
  parts.push('Bandas de Bollinger visibles: '+fmt(f.vals.bbLower)+'–'+fmt(f.vals.bbUpper));
 if(f.active.includes('supertrend')&&ok(f.vals.supertrend))
  parts.push('Supertrend visible '+(f.vals.supertrend>0?'alcista':'bajista'));
 if(f.cloud)parts.push('precio '+(f.price<f.cloud[0]?'bajo':f.price>f.cloud[1]?'sobre':'dentro de')+
   ' la nube Nova ('+fmt(f.cloud[0])+'–'+fmt(f.cloud[1])+')');
 if(f.nova&&f.nova.last&&f.active.some(x=>x==='nnIa'||x==='nnTp')&&f.nova.last.ago<=8)
  parts.push('última señal Nova '+(f.nova.last.side==='sell'?'de venta':f.nova.last.side==='buy'?'de compra':'mixta')+
  ' hace '+Math.max(0,Math.round(f.nova.last.ago))+' velas');
 if(f.osc){
  const pl=(f.osc.plots||[]).find(p=>ok(p.value)&&/osc|hist|mom|signal|señal/i.test(p.title||''))||(f.osc.plots||[]).find(p=>ok(p.value));
  if(pl)parts.push('Nova Oscillator: '+safe(pl.title)+' '+fmt(pl.value));
 }
 return parts;
}
function volume(f){
 if(!f.active.some(x=>x==='volume'||x==='vpvr'||x==='nnVP'))return 'No hay un módulo de volumen activo en este gráfico.';
 const parts=[];
 if(f.active.includes('volume')&&ok(f.volRatio))parts.push('Última vela con volumen '+f.volRatio.toFixed(1)+'× el promedio de 20 velas'+
   (f.volRatio>1.5?' (elevado)':f.volRatio<.6?' (bajo)':''));
 if(f.vp&&ok(f.vp.poc))parts.push('POC '+money(f.vp.poc)+', precio '+(f.price<f.vp.poc?'debajo':f.price>f.vp.poc?'encima':'en ese nivel'));
 return parts.length?parts.join('; ')+'.':'El volumen está visible, pero falta información suficiente para cuantificarlo.';
}
function levels(f){
 const lbl=a=>a.map(x=>money(x.p)+' ('+x.origin+')').join(', ');
 return 'Soportes observados: '+(lbl(f.supports)||'sin confirmación suficiente')+
 '. Resistencias observadas: '+(lbl(f.resistances)||'sin confirmación suficiente')+'.';
}
function drawing(f){
 const p=f.positions.slice().sort((a,b)=>Math.abs(a.a.p-f.price)-Math.abs(b.a.p-f.price))[0];
 const region=f.regions.slice().sort((a,b)=>Math.min(Math.abs(a.a.p-f.price),Math.abs(a.b.p-f.price))-
  Math.min(Math.abs(b.a.p-f.price),Math.abs(b.b.p-f.price)))[0];
 const out=[];
 if(p)out.push('Dibujo '+p.type.toUpperCase()+' con entrada '+money(p.a.p)+' (no es una orden ejecutada)');
 if(region){const low=Math.min(region.a.p,region.b.p),high=Math.max(region.a.p,region.b.p);
  out.push('precio '+(f.price<low?'debajo':f.price>high?'encima':'dentro')+' de tu rectángulo '+fmt(low)+'–'+fmt(high));}
 return out.length?out.join('; ')+'.':'';
}
function answer(q,ctx){
 const f=facts(ctx);if(!f)return 'Abre el gráfico y espera a que carguen por lo menos 12 velas.';
 const mode=kind(q),base=intro(f),direction='Las velas mostradas tienen estructura **'+f.trend+'**'+
  ' ('+f.change.toFixed(1)+'% en '+Math.min(20,f.cs.length-1)+' velas).';
 const ids=indicators(f),dr=drawing(f);
 if(mode==='trade'){
  const long=/\b(long|comprar|compra)\b/.test(normal(q)),short=/\b(short|vender|venta)\b/.test(normal(q));
  const support=f.supports[0],res=f.resistances[0];
  const nearLow=f.hi>f.lo&&(f.price-f.lo)/(f.hi-f.lo)<.23;
  const l=f.trend==='bajista'?
   '**Long:** es contra la caída; esperaría recuperación y cierre confirmado sobre '+(res?money(res.p):'una resistencia visible')+' antes de valorarlo.':
   '**Long:** buscaría reacción confirmada sobre '+(support?money(support.p):'un soporte visible')+' y volumen consistente.';
  const sh=f.trend==='alcista'?
   '**Short:** es contra el impulso; esperaría pérdida confirmada de '+(support?money(support.p):'un soporte visible')+'.':
   '**Short:** hay sesgo bajista, pero '+(nearLow?'el precio está cerca de mínimos; evitaría perseguir la caída y esperaría un rebote fallido en ':
    'buscaría rechazo de ')+(res?money(res.p):'una resistencia visible')+'.';
  return [base,direction,ids.slice(0,2).join('; ')+(ids.length?'.':''),
   f.positions.length?drawing(f):'',f.active.includes('volume')?volume(f):'',
   long&&!short?l:short&&!long?sh:l+'\n\n'+sh,
   '**Riesgo:** no hay entrada segura. Define invalidación y tamaño antes de operar; una ruptura falsa puede cambiar el sesgo.'].filter(Boolean).join('\n\n');
 }
 if(mode==='levels')return [base,direction,levels(f),dr].filter(Boolean).join('\n\n');
 if(mode==='volume')return [base,direction,volume(f),'El volumen no confirma una entrada por sí solo.'].join('\n\n');
 if(mode==='ema')return [base,ids.filter(x=>/EMA|SMA|VWAP|nube/i.test(x)).join('; ')||
  'No hay EMAs ni nube activas con datos disponibles.',levels(f)].join('\n\n');
 if(mode==='indicators'){
  const other=f.pine.filter(p=>p!==f.osc).slice(0,3).map(p=>safe(p.name)+
   ': '+(p.plots||[]).filter(v=>ok(v.value)).slice(0,2).map(v=>safe(v.title)+' '+fmt(v.value)).join(', '));
  return [base,ids.join('; ')||'No hay lecturas numéricas de indicadores visibles.',other.join('; '),volume(f)].filter(Boolean).join('\n\n');
 }
 return [base,direction,ids.slice(0,3).join('; ')+(ids.length?'.':''),
  levels(f),volume(f),dr].filter(Boolean).join('\n\n');
}
root.CCTChartAnalyst=Object.freeze({isChartQuestion,kind,facts,answer});
})(typeof window!=='undefined'?window:this);