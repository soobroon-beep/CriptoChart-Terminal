const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const base = 'https://example.com/CriptoChart-Terminal/';
test('all eleven installation choices identify one app and use valid PNG sizes within its scope', () => {
  const files = fs.readdirSync(path.join(root,'manifests'));
  assert.equal(files.length,11);
  for(const file of files){
    const url = new URL(`manifests/${file}`,base), m = JSON.parse(fs.readFileSync(path.join(root,'manifests',file)));
    assert.equal(new URL(m.id,url).href,base); assert.equal(new URL(m.scope,url).href,base);
    assert.ok(new URL(m.start_url,url).href.startsWith(base)); assert.equal(m.display,'standalone');
    assert.equal(m.icons.length,3);
    for(const icon of m.icons){
      const u = new URL(icon.src,url); assert.ok(u.href.startsWith(base+'icons/'));
      const data = fs.readFileSync(path.join(root,u.pathname.replace('/CriptoChart-Terminal/','')));
      assert.equal(data.toString('hex',0,8),'89504e470d0a1a0a');
      assert.equal(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`,icon.sizes);
    }
  }
});
function worker(){
  const listeners={}, records=new Map(); let online=true, body='fresh', claimed=false, activated=false;
  const cache={addAll:async requests=>{for(const r of requests){assert.ok(fs.existsSync(path.join(root,new URL(r.url).pathname.replace('/CriptoChart-Terminal/',''))));records.set(r.url,new Response('shell'));}},put:async(k,v)=>records.set(k,v),match:async k=>records.get(k)?.clone()};
  const names=['cct-shell-old','other-app-cache']; const deleted=[];
  const self={location:{href:base+'sw.js'},addEventListener:(name,fn)=>listeners[name]=fn,clients:{claim:async()=>{claimed=true;}},skipWaiting:()=>{activated=true;}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),{self,URL,Request,Response,caches:{open:async()=>cache,keys:async()=>names,delete:async k=>deleted.push(k)},fetch:async()=>{if(!online)throw Error('offline');return new Response(body);}});
  const request = async (url,mode='cors',method='GET')=>{let promise;listeners.fetch({request:{url,method,mode},respondWith:p=>promise=p});return promise?await promise:null;};
  return {listeners,request,deleted,records,setOnline:v=>online=v,setBody:v=>body=v,get claimed(){return claimed},get activated(){return activated}};
}
test('worker preloads only existing shell assets, and deletes only its own old caches',async()=>{
 const w=worker();let promise;w.listeners.install({waitUntil:p=>promise=p});await promise;assert.ok(w.records.size>10);
 w.listeners.activate({waitUntil:p=>promise=p});await promise;assert.deepEqual(w.deleted,['cct-shell-old']);assert.ok(w.claimed);assert.equal(w.activated,false);
 w.listeners.message({data:{type:'ACTIVATE_UPDATE'}});assert.ok(w.activated);
});
test('worker never intercepts prices, accounts, news data, POST or another app',async()=>{
 const w=worker();
 for(const url of ['https://api.binance.com/api/v3/klines',base+'news-data.json',base+'calendar-data.json','https://firestore.googleapis.com/data','https://example.com/other/index.html'])assert.equal(await w.request(url),null);
 assert.equal(await w.request(base+'app.js','cors','POST'),null);
});
test('worker uses fresh network content, then cached shell offline including launch queries',async()=>{
 const w=worker();assert.equal(await (await w.request(base+'?appIcon=menta','navigate')).text(),'fresh');
 w.setBody('newer');assert.equal(await (await w.request(base+'?appIcon=menta','navigate')).text(),'newer');
 w.setOnline(false);assert.equal(await (await w.request(base+'?appIcon=fucsia','navigate')).text(),'newer');
 assert.equal((await w.request(base+'icons/missing.png')).type,'error');
});
