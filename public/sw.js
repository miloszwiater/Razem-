const VERSION = 'razem-static-v7';
const CORE = ['/', '/index.html', '/style.css', '/app.js', '/rewards.js', '/puszystek.js', '/medals.js', '/house.js', '/icon.svg', '/apple-touch-icon.png', '/icon-192.png', '/img/logo-razem.svg', '/manifest.webmanifest'];
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
// Web Push: the Worker sends {title, body, tag}; a tap opens (or focuses) Razem.
self.addEventListener('push', event => {
  let d = {}; try { d = event.data.json(); } catch { d = { title: 'Razem', body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Razem', { body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag || 'razem', renotify: true, data: { url: '/' } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => { const c = list.find(x => 'focus' in x); return c ? c.focus() : clients.openWindow('/'); }));
});
