'use strict';
// Bump this version when changing cached application files. No API responses or account data are cached.
const CACHE = 'cct-shell-v4';
const ROOT = new URL('./', self.location.href);
const SHELL = ['index.html', 'style.css', 'glass.css', 'pwa.css', 'pwa-icons.js', 'pwa.js',
  'app.js', 'firebase-config.js', 'indicators.js', 'nova-nexus.js', 'catalog.js', 'pine.js',
  'pine-draw.js', 'pine-settings.js', 'news.js', 'ai.js', 'ai-ui.js', 'fx.js'];
const ASSETS = new Set(SHELL.map(p => new URL(p, ROOT).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(p => new Request(new URL(p, ROOT), {cache:'reload'})))));
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
      const response = await fetch(req);
      if (response.ok && response.type !== 'opaque' && !response.redirected) await cache.put(key, response.clone());
      return response;
    } catch {
      const cached = await cache.match(key);
      return cached || Response.error();
    }
  })());
});
