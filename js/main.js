// ===== تسجيل عامل الخدمة + شريط التحديث =====
if ('serviceWorker' in navigator) {
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('/sw.js').then(reg => document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); }));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) showUpdate(); had = true; });
}
function showUpdate() {
  if (document.getElementById('upd')) return;
  const b = document.createElement('div'); b.id = 'upd';
  b.style.cssText = 'position:fixed;top:12px;inset-inline:12px;margin:auto;max-width:460px;z-index:60;background:#0e2144;color:#f6e3a8;border-radius:12px;padding:10px 14px;display:flex;gap:10px;align-items:center;justify-content:space-between;box-shadow:0 10px 30px rgba(0,0,0,.35)';
  b.innerHTML = '<span>🆕 تتوفر نسخة جديدة من التطبيق</span><button class="p s" id="upd_b">تحديث الآن</button>';
  document.body.appendChild(b); document.getElementById('upd_b').onclick = () => location.reload();
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me && !dlg.open) { flushNow(); load(); } });
setTimeout(flushNow, 4000);
init();
  // تفعيل الإشعارات تلقائياً في الخلفية بعد تحميل التطبيق بثانيتين
window.addEventListener('load', () => {
    setTimeout(autoEnablePush, 2000);
});
