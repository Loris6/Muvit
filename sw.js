/* Muvit – Service Worker: Mitteilungen (z. B. „Anschluss wird nicht erreicht“) und Öffnen der App per Tipp */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
// Web Push vom Muvit-Dienst (kommt auch, wenn die App geschlossen ist)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Muvit', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Muvit', {
    body: d.body || '', tag: d.tag || 'muvit', renotify: true,
    icon: 'assets/icon-192.png?v=2', badge: 'assets/icon-192.png?v=2', data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if ('focus' in c) { c.postMessage({ type: 'open', url }); return c.focus(); }
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
