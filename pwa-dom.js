/* DOM integration checks (not a real Android/iOS installation). Requires jsdom. */
const {JSDOM} = require('jsdom'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const root=path.resolve(__dirname,'../..'), html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function load(query='',saved=null,installed=false,blocked=false){
 const dom=new JSDOM(html,{url:'https://example.com/CriptoChart-Terminal/'+query,runScripts:'outside-only'}), w=dom.window;
 w.matchMedia=()=>({matches:installed});w.HTMLElement.prototype.scrollIntoView=()=>{};
 if(saved)w.localStorage.setItem('cct_app_icon_v1',saved);
 if(blocked)Object.defineProperty(w,'localStorage',{get(){throw Error('disabled storage')}});
 w.eval(fs.readFileSync(path.join(root,'pwa-icons.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'pwa.js'),'utf8'));
 return dom;
}
(async()=>{
 const d=load(), w=d.window, q=s=>w.document.querySelector(s);
 assert.equal(q('#appManifest').href,'https://example.com/CriptoChart-Terminal/manifests/principal.webmanifest');
 assert.equal(w.document.querySelectorAll('.pwa-icon-option').length,11);
 let prompted=false; const event=new w.Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{prompted=true};event.userChoice=Promise.resolve({outcome:'accepted'});w.dispatchEvent(event);
 assert.ok(event.defaultPrevented);assert.equal(q('#installApp').textContent,'Instalar aplicación');q('#installApp').click();await new Promise(r=>setImmediate(r));assert.ok(prompted);
 q('[data-icon="fucsia"]').click();assert.equal(w.localStorage.getItem('cct_app_icon_v1'),'fucsia');assert.ok(q('#appManifest').href.endsWith('/fucsia.webmanifest'));assert.ok(q('#appTouchIcon').href.endsWith('/fucsia-180.png'));assert.equal(q('[data-icon="fucsia"]').getAttribute('aria-pressed'),'true');assert.equal(q('#installApp').textContent,'Preparar instalación');
 const next=load('?appIcon=fucsia&install=1');assert.equal(next.window.CCTAppIcons.selected,'fucsia');assert.equal(new URL(next.window.location).searchParams.has('install'),false);next.window.document.querySelector('#installApp').click();assert.equal(next.window.document.querySelector('#installHelp').open,true);
 Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true});w.dispatchEvent(new w.Event('offline'));assert.equal(q('#pwaOffline').hidden,false);
 Object.defineProperty(w.navigator,'onLine',{value:true,configurable:true});w.dispatchEvent(new w.Event('online'));assert.equal(q('#pwaOffline').hidden,true);
 for(const [query,saved,installed,blocked,expected] of [['?appIcon=../../bad',null,false,false,'principal'],['','arena',false,false,'arena'],['?appIcon=principal','menta',true,false,'menta'],['?appIcon=bosque',null,false,true,'bosque']]){const tmp=load(query,saved,installed,blocked);assert.equal(tmp.window.CCTAppIcons.selected,expected);tmp.window.close();}
 d.window.close();next.window.close();console.log('PASS: 11 choices, persistence, manifest/Apple icon, install prompt flow, help, offline banner, invalid input, standalone preference and disabled storage.');
})().catch(e=>{console.error(e);process.exit(1)});
