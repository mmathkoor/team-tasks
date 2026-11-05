function showErrorBox(msg) {
    msg = String(msg == null ? '' : msg).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const a = document.getElementById('app');
    if (a) a.innerHTML = '<div class="card" style="margin:40px auto;max-width:400px;text-align:center">' +
        '<h2 style="color:var(--late);margin-bottom:10px">توقف الاتصال مؤقتاً</h2>' +
        '<p style="color:var(--mute);margin-bottom:20px;font-size:14px;">' + msg + '</p>' +
        '<button class="p" onclick="localStorage.clear(); sessionStorage.clear(); window.location.reload(true);" style="width:100%">تحديث وإصلاح تلقائي 🔄</button>' +
    '</div>';
}
window.addEventListener('error', e => showErrorBox(e.message));
window.addEventListener('unhandledrejection', e => showErrorBox(e.reason?.message || e.reason || 'خطأ في جلب البيانات من الخادم.'));
