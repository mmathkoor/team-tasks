// ===== المزامنة دون اتصال / الشارة / المرفقات / التعليقات =====
const idbOpen = () => new Promise((ok, no) => { const r = indexedDB.open('tt', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const idbGet = k => idbOpen().then(d => new Promise(ok => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(undefined); })).catch(() => undefined);
const idbSet = (k, v) => idbOpen().then(d => new Promise(ok => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => ok(); })).catch(() => {});
async function requestFlush() {
  try { const reg = await navigator.serviceWorker.ready; if ('sync' in reg) await reg.sync.register('flush-q'); else if (reg.active) reg.active.postMessage('flush'); } catch (e) {}
}
async function enqueue(it) {
  it.i = Date.now() + '' + Math.random();
  await idbSet('q', ((await idbGet('q')) || []).concat(it)); updateNet(); if (navigator.onLine) setTimeout(flushNow, 1200); requestFlush();
}
async function apiPost(path, body) { return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await tok() }, body }); }
async function apiGet(path) { return fetch(path, { headers: { Authorization: 'Bearer ' + await tok() } }); }
async function flushNow() {
  const go = async () => {
    const q = (await idbGet('q')) || []; if (!q.length) return;
    const done = new Set();
    for (const it of q) {
      try {
        const r = await fetch(API + it.path, { method: it.m, headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + await tok(), 'Content-Type': 'application/json' }, it.pf ? { Prefer: it.pf } : {}), body: it.b || undefined });
        if (r.ok || r.status < 500) done.add(it.i);
      } catch (e) { break; }
    }
    await idbSet('q', ((await idbGet('q')) || []).filter(x => !done.has(x.i)));
    updateNet(); if (done.size) load();
  };
  try { return navigator.locks ? await navigator.locks.request('flush-q', go) : await go(); } catch (e) {}
}
const netEl = document.createElement('div');
netEl.style.cssText = 'position:fixed;bottom:12px;inset-inline:12px;margin:auto;max-width:440px;z-index:50;background:#b7791f;color:#fff;border-radius:10px;padding:8px 14px;text-align:center;font-size:14px;display:none';
document.body.appendChild(netEl);
async function updateNet() {
  const n = ((await idbGet('q')) || []).length, off = !navigator.onLine;
  netEl.style.display = off || n ? 'block' : 'none';
  netEl.textContent = (off ? 'غير متصل — تعمل على النسخة المحفوظة' : 'جارٍ المزامنة...') + (n ? ' · ' + n + ' تغيير بانتظار المزامنة' : '');
}
window.addEventListener('online', () => { updateNet(); flushNow(); setTimeout(updateNet, 3000); });
window.addEventListener('offline', updateNet);
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data === 'synced') { updateNet(); load(); } });
updateNet();
