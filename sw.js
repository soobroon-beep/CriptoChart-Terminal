'use strict';
// Bump this version when changing cached application files. No API responses or account data are cached.
const CACHE = 'cct-shell-v121';
const ROOT = new URL('./', self.location.href);
const SHELL = ['index.html', 'style.css', 'glass.css', 'pwa.css', 'pwa-icons.js', 'pwa.js', 'icons.js',
  'app.js', 'screener.js', 'firebase-config.js', 'markets.js', 'indicators.js', 'patterns.js', 'channels.js', 'discord-format.js', 'discord.js', 'nova-nexus.js', 'catalog.js', 'pine.js',
  'pine-draw.js', 'pine-preview.js', 'dock.js', 'pine-settings.js', 'news.js', 'ai.js', 'llm.js', 'ai-ui.js', 'botlab-engine.js','botlab-optimizer.js','botlab-paper.js','botlab-risk.js', 'botlab-ui.js', 'fx.js', 'prefs.js', 'sessions.js', 'econbar.js', 'changelog.js', 'push.js', 'lens.html'];
const ASSETS = new Set(SHELL.map(p => new URL(p, ROOT).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(p => new Request(new URL(p, ROOT), {cache:'reload'})))).then(() => self.skipWaiting())); // la versión nueva se activa sola
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('cct-shell-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  const clean = new URL(url); clean.search = ''; clean.hash = '';
  const navigation = req.mode === 'navigate' && (clean.href === ROOT.href || clean.href === new URL('index.html', ROOT).href);
  const icon = url.pathname.startsWith(new URL('icons/', ROOT).pathname) && /\.png$/.test(url.pathname);
  const manifest = url.pathname.startsWith(new URL('manifests/', ROOT).pathname) && /\.webmanifest$/.test(url.pathname);
  if (!navigation && !ASSETS.has(clean.href) && !icon && !manifest) return;
  const key = navigation ? new URL('index.html', ROOT).href : clean.href;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(req, {cache: 'no-cache'}); // siempre se revalida: sin esto el navegador podía servir código viejo hasta 10 min
      if (response.ok && response.type !== 'opaque' && !response.redirected) await cache.put(key, response.clone());
      return response;
    } catch {
      const cached = await cache.match(key);
      return cached || Response.error();
    }
  })());
});

// Avisos con la app cerrada: el Worker «vortex-push» manda {title, body, tag, url} cifrado (ver worker/push-alerts.mjs y push.js)
self.addEventListener('push', event => {
  let d = {}; try { d = event.data ? event.data.json() : {}; } catch { d = {body: event.data ? event.data.text() : ''}; }
  const icon = new URL('icons/i01-192.png', ROOT).href, badge = new URL('icons/notif-badge-96.png', ROOT).href; // badge: V blanca sobre transparente (Android solo usa la silueta en la barra de estado)
  event.waitUntil(self.registration.showNotification(d.title || 'VORTEX', {body: d.body || '', tag: d.tag || 'vortex', renotify: true, icon, badge, vibrate: [200, 100, 200], data: {url: d.url || ROOT.href}}));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || ROOT.href;
  event.waitUntil((async () => {
    for (const c of await self.clients.matchAll({type: 'window', includeUncontrolled: true})) if (c.url.startsWith(ROOT.href)) { await c.focus(); return; }
    await self.clients.openWindow(target);
  })());
});
