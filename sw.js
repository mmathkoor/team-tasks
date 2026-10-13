self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : { title: 'مهام الفريق', body: '' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: '/icon-192.png', dir: 'rtl', lang: 'ar' }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(l => l.length ? l[0].focus() : clients.openWindow('/')));
});
