/* VORTEX · Avisos con la app CERRADA (Web Push).
   Registra este celular en el Worker «vortex-push» (worker/push-alerts.mjs) y le manda tus alertas de PRECIO y la configuración de
   movimientos bruscos. El Worker las revisa cada minuto y te manda la notificación aunque VORTEX esté cerrada.
   Las alertas con indicador siguen revisándose solo con la app abierta.
   Lee tus alertas a través de window.CCTPushBridge (app.js, que se carga antes). */
(function () {
  'use strict';
  const B = window.CCTPushBridge; if (!B) return;
  const st = () => B.state(), toast = m => B.toast(m);
  const KEY = 'cct_push_v1', DEF_URL = 'https://vortex-push.soobroon.workers.dev';
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
  const store = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };
  let cfg = load(), lastSig = '', busy = false, lastErr = '';
  if (!cfg.id) { const r = new Uint8Array(18); crypto.getRandomValues(r); cfg.id = 'd_' + Array.from(r, b => b.toString(16).padStart(2, '0')).join(''); store(cfg); }
  const url = () => String(cfg.url || DEF_URL).replace(/\/+$/, '');
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const b64ToU8 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '='.repeat((4 - s.length % 4) % 4)); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
  async function api(path, body) {
    const r = await fetch(url() + path, body ? {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)} : {});
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) throw new Error(j.error || 'El servidor de avisos respondió ' + r.status);
    return j;
  }
  const priceAlerts = () => (st().alerts || []).filter(a => a.kind !== 'ind').map(a => ({id: a.id, symbol: a.symbol, on: a.on, price: a.price, dir: a.dir, cond: a.cond, repeat: a.repeat, wait: a.wait, exp: a.exp, expired: a.expired, note: a.note, notify: a.notify, firedAt: a.firedAt || 0, firedPrice: a.firedPrice}));
  const payload = () => ({alerts: priceAlerts(), move: {on: !!(st().moveAlerts || {}).on, pct: (st().moveAlerts || {}).pct || 2}, priceOn: !((B.prefs() || {}).n && B.prefs().n.price === false)});

  function applyBack(back) { // alertas que el servidor disparó mientras la app estaba cerrada
    let ch = false;
    for (const s of back || []) {
      const a = (st().alerts || []).find(x => x.id === s.id); if (!a || !(s.firedAt > (a.firedAt || 0))) continue;
      for (const k of ['on', 'dir', 'firedAt', 'firedPrice']) a[k] = s[k];
      if (s.wait) a.wait = true; else delete a.wait; if (s.expired) a.expired = true;
      ch = true;
    }
    if (ch) { try { B.save(); B.renderAlerts(); B.scheduleRender(); } catch {} }
  }
  async function sync(force) {
    if (!cfg.on || busy) return; const p = payload(), sig = JSON.stringify(p);
    if (!force && sig === lastSig && Date.now() - (cfg.at || 0) < 6 * 3600e3) return;
    busy = true;
    try {
      const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      if (!sub) { cfg.on = false; store(cfg); lastErr = 'Se perdió el permiso de notificaciones; vuelve a activarlas.'; render(); return; }
      const j = await api('/sync', {id: cfg.id, sub: sub.toJSON(), since: cfg.since || 0, ...p});
      applyBack(j.back); cfg.since = j.now || Date.now(); cfg.at = Date.now(); store(cfg);
      lastSig = JSON.stringify(payload()); lastErr = '';
    } catch (e) { lastErr = e.message || 'Sin conexión con el servidor de avisos'; }
    finally { busy = false; render(); }
  }
  async function enable() {
    if (!ok) { toast(ios && !standalone ? 'En iPhone primero añade VORTEX a la pantalla de inicio y ábrela desde ahí' : 'Este navegador no permite notificaciones push'); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Necesito tu permiso de notificaciones (Ajustes del celular → Apps → Chrome/VORTEX → Notificaciones)'); return; }
    try {
      const reg = await navigator.serviceWorker.ready, {key} = await api('/vapid');
      let sub = await reg.pushManager.getSubscription();
      if (sub && cfg.key && cfg.key !== key) { await sub.unsubscribe(); sub = null; } // el servidor cambió de claves
      if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64ToU8(key)});
      cfg.on = true; cfg.key = key; store(cfg); await sync(true);
      if (!lastErr) toast('Listo: te avisaré aunque VORTEX esté cerrada');
    } catch (e) { lastErr = e.message || String(e); toast('No se pudo activar: ' + lastErr); }
    render();
  }
  async function disable() {
    cfg.on = false; store(cfg);
    try { await api('/sync', {id: cfg.id, off: true}); } catch {}
    try { const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch {}
    render(); toast('Avisos con la app cerrada desactivados');
  }
  async function testPush() {
    try { await sync(true); const j = await api('/test', {id: cfg.id}); toast(j.ok ? 'Prueba enviada: cierra la app y mira tu celular' : 'El servicio push respondió ' + j.status); }
    catch (e) { toast('No se pudo enviar la prueba: ' + e.message); }
  }

  function render() {
    const box = document.getElementById('pushBox'); if (!box) return;
    const n = priceAlerts().filter(a => a.on).length, mv = !!(st().moveAlerts || {}).on;
    const why = !ok ? (ios && !standalone ? 'En iPhone: Compartir → Añadir a pantalla de inicio, y actívalo desde la app instalada.' : 'Este navegador no permite notificaciones push.')
      : cfg.on ? (lastErr ? '⚠ ' + lastErr : `Activo · vigilando ${n} alerta${n === 1 ? '' : 's'} de precio${mv ? ' y movimientos bruscos' : ''} cada minuto`)
      : 'Te llega la notificación aunque VORTEX esté cerrada: alertas de precio y movimientos bruscos. Las de indicador siguen con la app abierta.';
    box.innerHTML = `<div class="setting-row"><div><b>Avisos con la app cerrada</b><small>${why}</small></div><button class="toggle ${cfg.on ? 'on' : ''}" id="pushOn" type="button" aria-label="Avisos con la app cerrada" aria-pressed="${!!cfg.on}" ${ok ? '' : 'disabled'}></button></div>`
      + (cfg.on ? `<div class="setting-row"><div><b>Probar</b><small>Manda una notificación de prueba a este celular</small></div><button class="small-button" id="pushTest" type="button">Enviar</button></div>` : '');
  }
  document.addEventListener('click', e => {
    if (e.target.closest('#pushOn')) { cfg.on ? disable() : enable(); }
    else if (e.target.closest('#pushTest')) testPush();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(true); }); // al volver a la app trae lo que disparó el servidor
  setInterval(() => sync(false), 10000); // si cambian tus alertas, se mandan al servidor en ≤10 s
  render(); if (cfg.on) sync(true);
  window.VortexPush = {sync, enable, disable, render, get on() { return !!cfg.on; }};
})();
