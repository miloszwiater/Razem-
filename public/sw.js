const VERSION = 'razem-static-v3';
const CORE = ['/', '/index.html', '/style.css', '/app.js', '/rewards.js', '/puszystek.js', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))); self.clients.claim(); });
// Network first, cache as offline fallback. The API is never cached.
self.addEventListener('fetch', event => {
  const u = new URL(event.request.url);
  if (event.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && (CORE.includes(u.pathname) || u.pathname.startsWith('/img/') || u.pathname.startsWith('/fonts/'))) { const clone = response.clone(); caches.open(VERSION).then(c => c.put(event.request, clone)); }
    return response;
  }).catch(() => caches.match(event.request)));
});
