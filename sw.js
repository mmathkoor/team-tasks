// Build version: 5.5.0 (timestamp: 2026-10-30)
const SW_BUILD_VERSION = '5.5.0';

try { importScripts('/js/version.js'); } catch (e) {}
const C = 'tasks-' + (typeof VERSION !== 'undefined' ? VERSION : SW_BUILD_VERSION);
const idb = () => new Promise((ok, no) => { const r = indexedDB.open('tt', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const kget = k => idb().then(d => new Promise(ok => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(undefined); })).catch(() => undefined);
const kset = (k, v) => idb().then(d => new Promise(ok => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => ok(); })).catch(() => {});

// ===== التخزين المؤقت: نسخة كاملة متسقة لكل إصدار =====
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(C);
    const r = await fetch('/?_t=' + Date.now(), { cache: 'reload' }); const html = await r.clone().text(); await c.put('/', r);
    const urls = new Set(['/manifest.json', '/icon-192.png']);
    for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) urls.add(m[1]);
    await Promise.allSettled([...urls].map(u => fetch(u, { cache: 'reload' }).then(res => res.ok && c.put(u, res))));
  })());
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  const ks = await caches.keys();
  await Promise.all(ks.map(k => k !== C ? caches.delete(k) : Promise.resolve()));
  await clients.claim();
  const allClients = await clients.matchAll({ type: 'window' });
  allClients.forEach(c => c.postMessage({ type: 'version_updated', version: SW_BUILD_VERSION }));
})()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (u.pathname === '/sw.js') {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }
  if (u.pathname === '/js/version.js') {
    e.respondWith((async () => {
      try {
        const r = await fetch(e.request, { cache: 'no-store' });
        if (r && r.ok) return r;
      } catch (err) {}
      return new Response("const VERSION = '" + SW_BUILD_VERSION + "'; window.VERSION = VERSION;\n", {
        status: 200,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
      });
    })());
    return;
  }
  e.respondWith((async () => {
    try {
      const r = await fetch(e.request, { cache: 'no-cache' });
      if (r && r.ok) {
        const c = await caches.open(C);
        c.put(e.request, r.clone());
        return r;
      }
    } catch (err) {}
    const c = await caches.open(C);
    const cached = await c.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    return Response.error();
  })());
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
const flushOnce = () => fl || (fl = (self.navigator.locks ? self.navigator.locks.request('flush-q', flush) : flush()).finally(() => { fl = null; }));
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

function isSwQuietHours(digest) {
  if (!digest || !digest.quietHoursEnabled) return false;
  const now = new Date();
  const curMins = now.getHours() * 60 + now.getMinutes();
  const sParts = String(digest.quietStart || '23:00').split(':');
  const eParts = String(digest.quietEnd || '07:00').split(':');
  const startM = (+sParts[0] || 0) * 60 + (+sParts[1] || 0);
  const endM = (+eParts[0] || 0) * 60 + (+eParts[1] || 0);
  if (startM === endM) return false;
  if (startM < endM) return curMins >= startM && curMins < endM;
  return curMins >= startM || curMins < endM;
}

function isSwScheduleDueNow(digest) {
  if (isSwQuietHours(digest)) return null;
  const mode = digest.scheduleMode || 'interval';
  const now = new Date();
  const ymdStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const firedSlots = digest.firedSlots && typeof digest.firedSlots === 'object' ? digest.firedSlots : {};

  if (mode === 'once_daily') {
    const k = 'daily_' + ymdStr;
    if (firedSlots[k]) return null;
    return k;
  }
  if (mode === 'interval') {
    const intervalMs = Math.max(15, Number(digest.intervalMin) || 360) * 60 * 1000;
    const lastAt = Number(digest.lastShownAt) || 0;
    if (Date.now() - lastAt >= intervalMs - 15000) return 'int_' + Math.floor(Date.now() / intervalMs);
    return null;
  }
  // mode === 'scheduled'
  const freq = digest.frequency || 'daily';
  const day = now.getDay();
  if (freq === 'workdays' && day === 5) return null; // الجمعة إجازة
  if (freq === 'weekly' && day !== Number(digest.weekday || 0)) return null;

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const times = Array.isArray(digest.times) && digest.times.length ? digest.times : ['09:00', '15:00', '21:00'];
  for (const tStr of times) {
    const parts = String(tStr || '').split(':');
    if (parts.length !== 2) continue;
    const slotMins = (+parts[0]) * 60 + (+parts[1]);
    if (nowMins >= slotMins && nowMins <= slotMins + 25) {
      const slotKey = ymdStr + '_' + tStr;
      if (!firedSlots[slotKey]) return slotKey;
    }
  }
  return null;
}

// ===== منبّه المهام الناقصة الخارجي على شاشة الجوال =====
async function showOverdueAzkarNotification(forceTest, delayMs) {
  if (delayMs && delayMs > 0) {
    await new Promise(r => setTimeout(r, delayMs));
  }
  const digest = (await kget('overdue_digest')) || {};
  if (!forceTest && digest.enabled === false) return;

  const lateCount = Number(digest.lateCount) || 0;
  const todayCount = Number(digest.todayCount) || 0;
  const incompleteCount = Number(digest.incompleteCount != null ? digest.incompleteCount : (lateCount + todayCount)) || 0;
  const sampleTitles = Array.isArray(digest.titles) ? digest.titles : [];
  const firstTaskId = digest.firstTaskId || null;

  if (!forceTest && incompleteCount === 0 && lateCount === 0 && todayCount === 0) return;

  let slotKey = 'test_' + Date.now();
  if (!forceTest) {
    slotKey = isSwScheduleDueNow(digest);
    if (!slotKey) return;
  }

  let title = '🕌 تذكير بالمهام الناقصة (' + (incompleteCount || lateCount) + ' مهام)';
  let body = '';
  if (lateCount > 0) {
    title = '🕌 تذكير: لديك ' + incompleteCount + ' مهام ناقصة (' + lateCount + ' متأخرة)';
    body = '• ' + sampleTitles.slice(0, 4).join('\n• ');
  } else if (incompleteCount > 0) {
    title = '🕌 تذكير دوري: لديك ' + incompleteCount + ' مهام غير منجزة';
    body = '• ' + sampleTitles.slice(0, 4).join('\n• ');
  } else {
    title = '🕌 تذكير المهام الناقصة (بأسلوب الأذان)';
    body = 'اضغط لفتح شاشة المهام الناقصة المنبثقة ومراجعة مهامك!';
  }

  digest.lastShownAt = Date.now();
  if (!digest.firedSlots || typeof digest.firedSlots !== 'object') digest.firedSlots = {};
  if (!forceTest && slotKey) digest.firedSlots[slotKey] = Date.now();
  await kset('overdue_digest', digest);

  await self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    vibrate: [500, 150, 500, 150, 800],
    requireInteraction: true,
    renotify: true,
    silent: false,
    tag: 'azkar-overdue-remind',
    timestamp: Date.now(),
    actions: [
      { action: 'open_popup', title: '🕌 شاشة المهام الناقصة' },
      ...(firstTaskId ? [{ action: 'done', title: '✅ إنجاز الأولى' }] : []),
      { action: 'snooze', title: '⏰ غفوة ساعة' }
    ],
    data: { url: '/?azkar_popup=1', open_azkar_popup: true, task_id: firstTaskId, task_title: sampleTitles[0] || '' }
  });
}

self.addEventListener('sync', e => {
  if (e.tag === 'flush-q') e.waitUntil(flushOnce());
  if (e.tag === 'overdue-tasks-reminder') e.waitUntil(showOverdueAzkarNotification(false, 0));
});
self.addEventListener('periodicsync', e => {
  if (e.tag === 'overdue-tasks-reminder') e.waitUntil(showOverdueAzkarNotification(false, 0));
});
self.addEventListener('message', e => {
  if (e.data === 'flush') e.waitUntil(flushOnce().catch(() => {}));
  if (e.data && typeof e.data === 'object') {
    if (e.data.type === 'SYNC_OVERDUE_DIGEST' && e.data.digest) {
      e.waitUntil((async () => {
        const prev = (await kget('overdue_digest')) || {};
        await kset('overdue_digest', Object.assign({}, prev, e.data.digest));
      })());
    } else if (e.data.type === 'CHECK_OVERDUE_NOW') {
      e.waitUntil(showOverdueAzkarNotification(!!e.data.force, Number(e.data.delayMs) || 0));
    }
  }
});

// ===== الإشعارات وأزرار الإجراء =====
self.addEventListener('push', e => {
  if (!e.data) return;
  const d = e.data.json();
  const isAzkar = !!d.is_azkar_remind;
  const tag = isAzkar
    ? 'azkar-overdue-remind'
    : (d.task_id ? 'task-' + d.task_id + '-' + Math.floor(Date.now() / 1000) : 'msg-' + Date.now());
  e.waitUntil((async () => {
    const actions = d.actions && d.actions.length ? d.actions : (isAzkar ? [
      { action: 'open_popup', title: '🕌 شاشة المهام الناقصة' },
      ...(d.task_id ? [{ action: 'done', title: '✅ إنجاز الأولى' }] : []),
      { action: 'snooze', title: '⏰ غفوة ساعة' }
    ] : []);
    await self.registration.showNotification(d.title, {
      body: d.body, icon: d.icon || '/icon-192.png', badge: '/badge-96.png',
      vibrate: [500, 150, 500, 150, 800, 200, 800], requireInteraction: true, silent: false, tag, renotify: true, timestamp: Date.now(),
      actions,
      data: { url: isAzkar ? '/?azkar_popup=1' : '/', open_azkar_popup: isAzkar, task_id: d.task_id, task_title: d.task_title, for_all: d.for_all }
    });
    if (!isAzkar) {
      const l = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      l.forEach(c => {
        if (c.visibilityState === 'visible' || c.focused) {
          c.postMessage({ type: 'alert', title: d.title, body: d.body, task_id: d.task_id, task_title: d.task_title, for_all: d.for_all, tag, nid: d.nid, order_id: d.order_id });
        }
      });
    }
  })());
});
async function markDone(d) {
  const a = await auth();
  if (!a) return clients.openWindow('/');
  const email = a.s.user && a.s.user.email, name = (a.cfg.name || email);
  const it = d.for_all
    ? { i: Date.now() + '' + Math.random(), path: '/rest/v1/task_done', m: 'POST', pf: 'resolution=merge-duplicates,return=minimal', b: JSON.stringify({ task_id: d.task_id, email }) }
    : { i: Date.now() + '' + Math.random(), path: '/rest/v1/tasks?id=eq.' + d.task_id, m: 'PATCH', pf: 'return=representation', b: JSON.stringify({ status: 'done' }) };
  let ok = false, adv = null;
  try { const r = await send(a, it); ok = r.ok; if (ok && !d.for_all) { try { adv = (await r.json())[0]; } catch (e) {} } } catch (e) {}
  if (!ok) { await kset('q', ((await kget('q')) || []).concat(it)); if (self.registration.sync) await self.registration.sync.register('flush-q').catch(() => {}); }
  else {
    fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.t }, body: JSON.stringify({ title: '✅ إنجاز جديد', body: 'أنجز المهمة «' + (d.task_title || '') + '»', to_admins: true, is_custom: true }) }).catch(() => {});
    if (adv && adv.status === 'todo' && adv.assignee_email) { const nt = adv.flow && adv.flow[adv.flow_step] && adv.flow[adv.flow_step].note; fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.t }, body: JSON.stringify({ title: '🔗 دورك الآن في المسار', body: '«' + (d.task_title || '') + '»' + (nt ? ' — ' + nt : ''), assignee_email: adv.assignee_email, for_all: false, is_custom: true, task_id: d.task_id, task_title: d.task_title }) }).catch(() => {}); }
    await tell();
  }
  await self.registration.showNotification(ok ? (adv && adv.status === 'todo' ? 'تم! انتقلت المهمة للمرحلة التالية ✅' : 'تم إنجاز المهمة ✅') : 'سيتم تسجيل الإنجاز عند عودة الاتصال', { icon: '/icon-192.png', tag: 'done-' + d.task_id });
}
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  if (e.action === 'done' && d.task_id) return e.waitUntil(markDone(d));
  if (e.action === 'snooze') {
    return e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
      l.forEach(c => c.postMessage({ type: 'SNOOZE_AZKAR', minutes: 60 }));
    }));
  }
  const wantPopup = e.action === 'open_popup' || d.open_azkar_popup;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async l => {
    if (l.length) {
      const client = l[0];
      await client.focus();
      if (wantPopup) client.postMessage({ type: 'OPEN_AZKAR_POPUP' });
      return;
    }
    return clients.openWindow(wantPopup ? '/?azkar_popup=1' : (d.url || '/'));
  }));
});
