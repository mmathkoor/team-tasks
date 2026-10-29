function showErrorBox(msg) {
    msg = String(msg == null ? '' : msg).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const a = document.getElementById('app');
    if (a) a.innerHTML = '<div class="card" style="margin:40px auto;max-width:400px;text-align:center">' +
        '<h2 style="color:var(--late);margin-bottom:10px">توقف الاتصال مؤقتاً</h2>' +
        '<p style="color:var(--mute);margin-bottom:20px;font-size:14px;">' + msg + '</p>' +
        '<button class="p" onclick="forceAppUpdate()" style="width:100%">تحديث وإصلاح تلقائي 🔄</button>' +
    '</div>';
}
window.addEventListener('error', e => showErrorBox(e.message));
window.addEventListener('unhandledrejection', e => showErrorBox(e.reason?.message || e.reason || 'خطأ في جلب البيانات من الخادم.'));

window.forceAppUpdate = async function() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
    sessionStorage.clear();
  } catch (e) {}
  window.location.href = window.location.origin + '/?_v=' + Date.now();
};

(function autoSyncVersion() {
  const currentVer = '5.2.5';
  const savedVer = localStorage.getItem('last_seen_ver');
  if (savedVer && savedVer !== currentVer) {
    localStorage.setItem('last_seen_ver', currentVer);
    if ('caches' in window) {
      caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))).catch(() => {});
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(r => r.update().catch(() => {}));
      }).catch(() => {});
    }
  } else {
    localStorage.setItem('last_seen_ver', currentVer);
  }
})();
