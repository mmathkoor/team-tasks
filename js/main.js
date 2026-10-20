// ===== تسجيل عامل الخدمة + شريط التحديث =====
if ('serviceWorker' in navigator) {
  let had = !!navigator.serviceWorker.controller, rld = false;
  navigator.serviceWorker.register('/sw.js').then(reg => {
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (had && !rld) { rld = true; location.reload(); }
    had = true;
  });
}

document.addEventListener('visibilitychange', () => { if (!document.hidden && S.me && !dlg.open) { flushNow(); load(); } });
setTimeout(flushNow, 4000);
init();
  // تفعيل الإشعارات تلقائياً في الخلفية بعد تحميل التطبيق بثانيتين
window.addEventListener('load', () => {
    setTimeout(autoEnablePush, 2000);
});
