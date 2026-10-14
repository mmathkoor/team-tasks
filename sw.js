const C = 'tasks-v3';
const idb = () => new Promise((ok, no) => { const r = indexedDB.open('tt', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const kget = k => idb().then(d => new Promise(ok => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(undefined); })).catch(() => undefined);
const kset = (k, v) => idb().then(d => new Promise(ok => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => ok(); })).catch(() => {});

// ===== التخزين المؤقت: عرض فوري ثم تحديث بالخلفية =====
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => Promise.allSettled(['/', '/manifest.json', '/icon-192.png'].map(f => c.add(f))))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(caches.open(C).then(async c => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

// ===== الجلسة والمزامنة (تعمل حتى والتطبيق مغلق) =====
async function auth() {
  const cfg = await kget('cfg'); let s = await kget('sbs');
  if (!cfg || !s) return null;
  if (!(s.expires_at && s.expires_at - 60 > Date.now() / 1000)) {
    const r = await fetch(cfg.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
    if (!r.ok) return null;
    s = await r.json(); s.expires_at = Math.floor(Date.now() / 1000) + s.expires_in; await kset('sbs', s);
  }
  return { cfg, s, t: s.access_token };
}
const send = (a, it) => fetch(a.cfg.url + it.path, { method: it.m, headers: Object.assign({ apikey: a.cfg.key, Authorization: 'Bearer ' + a.t, 'Content-Type': 'application/json' }, it.pf ? { Prefer: it.pf } : {}), body: it.b || undefined });
const tell = () => clients.matchAll({ type: 'window' }).then(l => l.forEach(c => c.postMessage('synced')));
let fl = null;
const flushOnce = () => fl || (fl = flush().finally(() => { fl = null; }));
async function flush() {
  const q = (await kget('q')) || [];
  if (!q.length) return;
  const a = await auth(); if (!a) throw new Error('no-auth');
  const done = new Set();
  for (const it of q) {
    try { const r = await send(a, it); if (r.ok || r.status < 500) done.add(it.i); } catch (e) { break; }
  }
  await kset('q', ((await kget('q')) || []).filter(x => !done.has(x.i)));
  if (done.size) await tell();
  if (done.size < q.length) throw new Error('retry');
}
self.addEventListener('sync', e => { if (e.tag === 'flush-q') e.waitUntil(flushOnce()); });
self.addEventListener('message', e => { if (e.data === 'flush') e.waitUntil(flushOnce().catch(() => {})); });

// ===== الإشعارات وأزرار الإجراء =====
self.addEventListener('push', e => {
  if (!e.data) return;
  const d = e.data.json();
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: d.icon || '/icon-192.png', badge: '/icon-192.png', vibrate: [200, 100, 200],
    actions: d.actions || [], data: { url: '/', task_id: d.task_id, for_all: d.for_all }
  }));
});
async function markDone(d) {
  const a = await auth();
  if (!a) return clients.openWindow('/');
  const email = a.s.user && a.s.user.email, name = (a.cfg.name || email);
  const it = d.for_all
    ? { i: Date.now() + '' + Math.random(), path: '/rest/v1/task_done', m: 'POST', pf: 'resolution=merge-duplicates,return=minimal', b: JSON.stringify({ task_id: d.task_id, email }) }
    : { i: Date.now() + '' + Math.random(), path: '/rest/v1/tasks?id=eq.' + d.task_id, m: 'PATCH', pf: 'return=minimal', b: JSON.stringify({ status: 'done' }) };
  let ok = false;
  try { ok = (await send(a, it)).ok; } catch (e) {}
  if (!ok) { await kset('q', ((await kget('q')) || []).concat(it)); if (self.registration.sync) await self.registration.sync.register('flush-q').catch(() => {}); }
  else {
    fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '✅ إنجاز جديد', body: 'أنجز المهمة من الإشعار', to_admins: true, is_custom: true, sender_name: name }) }).catch(() => {});
    await tell();
  }
  await self.registration.showNotification(ok ? 'تم إنجاز المهمة ✅' : 'سيتم تسجيل الإنجاز عند عودة الاتصال', { icon: '/icon-192.png', tag: 'done-' + d.task_id });
}
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  if (e.action === 'done' && d.task_id) return e.waitUntil(markDone(d));
  e.waitUntil(clients.matchAll({ type: 'window' }).then(l => l.length ? l[0].focus() : clients.openWindow(d.url || '/')));
});
