// ===== صندوق التنبيهات: يحفظ ما فاتك ويعرضه فور فتح التطبيق =====
const INBOX = { alerted: new Set() };
const unreadNotes = () => (S.notes || []).filter(n => !n.read_at);
function updateBell() {
  const b = $('bell'); if (!b) return;
  const n = unreadNotes().length, c = b.querySelector('.bn');
  if (c) { c.textContent = n > 9 ? '9+' : n; c.hidden = !n; }
  b.classList.toggle('has', n > 0);
}
function markRead(ids) {
  ids = (ids || []).filter(Boolean); if (!ids.length) return;
  const now = new Date().toISOString();
  ids.forEach(id => { const n = (S.notes || []).find(x => x.id === id); if (n && !n.read_at) n.read_at = now; });
  updateBell();
  sb.from('notifications').update({ read_at: now }).in('id', ids).then(() => {});
}
const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'الآن' : m < 60 ? 'قبل ' + m + ' د' : m < 1440 ? 'قبل ' + Math.round(m / 60) + ' س' : 'قبل ' + Math.round(m / 1440) + ' يوم'; };
function inboxDialog() {
  const L = S.notes || [];
  dlg.innerHTML = '<h2>🔔 صندوق التنبيهات</h2>' +
    (L.length ? '<div class="inbox">' + L.map(n => '<div class="inb-i' + (n.read_at ? '' : ' new') + '" data-nid="' + n.id + '" data-tid="' + esc(n.task_id || '') + '"><div class="bar"><b>' + esc(n.title) + '</b><span class="m">' + ago(n.created_at) + '</span></div><div class="inb-b">' + esc(n.body || '') + '</div></div>').join('') + '</div>' : '<div class="empty">لا توجد تنبيهات.</div>') +
    '<div class="row dact"><button class="s" id="inb_all">تعليم الكل كمقروء</button><button class="p s" id="inb_x">إغلاق</button></div>';
  $('inb_x').onclick = () => dlg.close();
  $('inb_all').onclick = () => { markRead(unreadNotes().map(n => n.id)); inboxDialog(); };
  dlg.querySelectorAll('.inb-i').forEach(el => el.onclick = () => {
    markRead([el.dataset.nid]);
    const t = el.dataset.tid && S.tasks.find(x => x.id === el.dataset.tid);
    if (t) { dlg.close(); S.view = 'board'; render(); taskDialog(S.tasks.find(x => x.id === t.id)); } else el.classList.remove('new');
  });
  dlg.showModal();
}
// يُستدعى بعد كل تحميل: أي تنبيه غير مقروء لم نعرضه بعد يظهر كنافذة منبثقة (للتنبيهات الفائتة)
function inboxAfterLoad() {
  updateBell();
  if (typeof showAlert !== 'function') return;
  const fresh = unreadNotes().filter(n => !INBOX.alerted.has(n.id) && Date.now() - new Date(n.created_at) < 48 * 3600e3);
  if (!fresh.length) return;
  fresh.forEach(n => INBOX.alerted.add(n.id));
  if (fresh.length === 1) { const n = fresh[0]; showAlert({ title: n.title, body: n.body, task_id: n.task_id, nid: n.id }); }
  else showAlert({ title: '🔔 لديك ' + fresh.length + ' تنبيهات جديدة', body: fresh.slice(0, 4).map(n => '• ' + n.title).join('\n') + (fresh.length > 4 ? '\n…' : ''), nids: fresh.map(n => n.id), summary: true });
}
// توليد المهام المتكررة المستحقة عند فتح التطبيق (مرة يومياً لكل جهاز) دون الاعتماد على الجدولة وحدها
function recurPing() {
  const d = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('rp') === d || !navigator.onLine) return;
  localStorage.setItem('rp', d);
  apiPost('/api/recur', '{}').then(r => r.json()).then(j => { if (j && j.created > 0) load(); }).catch(() => localStorage.removeItem('rp'));
}
