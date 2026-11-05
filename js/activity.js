// ===== سجل النشاط (يُسجَّل من قاعدة البيانات نفسها) =====
const ACT_ICON = { created: '🆕', deleted: '🗑️', status: '🔄', reassigned: '👤', due: '📅', renamed: '✏️', comment: '💬', file: '📎', file_removed: '📎', checklist: '☑', flow_step: '🔗', done_for_all: '✅' };
const actWho = e => (!e || e === 'system') ? 'النظام' : nm(e);
const stName = x => (typeof ST !== 'undefined' && ST[x]) || x;
function actText(a) {
  const d = a.details || {};
  switch (a.action) {
    case 'created': return 'أنشأ المهمة' + (d.assignee ? ' وأسندها إلى ' + nm(d.assignee) : d.for_all ? ' (جماعية)' : '');
    case 'deleted': return 'حذف المهمة';
    case 'status': return 'غيّر الحالة من «' + stName(d.from) + '» إلى «' + stName(d.to) + '»';
    case 'reassigned': return 'أحال المهمة من ' + nm(d.from) + ' إلى ' + nm(d.to);
    case 'due': return 'غيّر موعد الاستحقاق إلى ' + (d.to || 'بدون موعد');
    case 'renamed': return 'غيّر العنوان من «' + (d.from || '') + '»';
    case 'comment': return 'علّق: «' + (d.text || '') + '»';
    case 'file': return 'أرفق ملف «' + (d.name || '') + '»';
    case 'file_removed': return 'حذف المرفق «' + (d.name || '') + '»';
    case 'checklist': return 'أنجز البند «' + (d.text || '') + '»';
    case 'flow_step': return 'أنهى مرحلته وانتقلت المهمة إلى ' + nm(d.to);
    case 'done_for_all': return 'اعتمد إنجاز المهمة الجماعية';
  }
  return a.action;
}
const actWhen = a => new Date(a.at).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' });
const actRow = (a, withTitle) => '<div style="padding:8px 0;border-top:1px solid var(--line)"><div>' + (ACT_ICON[a.action] || '•') + ' <b>' + esc(actWho(a.actor_email)) + '</b> ' + esc(actText(a)) + '</div><div class="m">' + esc(actWhen(a)) + (withTitle && a.task_title ? ' · <a href="#" data-at="' + a.task_id + '">' + esc(a.task_title) + '</a>' : '') + '</div></div>';
const HS_HTML = '<div style="margin-top:14px"><details id="hs_box"><summary><b>🕘 سجل المهمة</b></summary><div id="hs_list" class="m">جارٍ التحميل...</div></details></div>';
function bindHistory(t) {
  $('hs_box').addEventListener('toggle', async function once() {
    if (!$('hs_box').open) return; $('hs_box').removeEventListener('toggle', once);
    const { data, error } = await sb.from('activity').select('*').eq('task_id', t.id).order('at', { ascending: false }).limit(40);
    $('hs_list').innerHTML = error ? 'تعذّر التحميل (شغّل ملف 004 أولاً)' : data.length ? data.map(a => actRow(a, false)).join('') : 'لا يوجد نشاط مسجّل بعد.';
  });
}
function logView() {
  return '<div class="card"><h2>🕘 سجل النشاط</h2><div class="row" style="margin-bottom:10px"><select id="lg_who"><option value="">كل الأعضاء</option>' + S.members.map(m => '<option value="' + esc(m.email) + '">' + esc(m.name) + '</option>').join('') + '</select></div>' +
    '<div id="lg_list" class="m">جارٍ التحميل...</div><div class="row" style="margin-top:10px"><button id="lg_more" class="s" style="display:none">عرض المزيد</button></div></div>';
}
function bindLog() {
  let rows = [];
  const go = async more => {
    let q = sb.from('activity').select('*').order('at', { ascending: false }).limit(50);
    if ($('lg_who').value) q = q.ilike('actor_email', $('lg_who').value);
    if (more && rows.length) q = q.lt('at', rows[rows.length - 1].at);
    const { data, error } = await q;
    if (error) { $('lg_list').textContent = 'تعذّر التحميل (شغّل ملف 004 أولاً)'; return; }
    rows = more ? rows.concat(data) : data;
    $('lg_list').innerHTML = rows.length ? rows.map(a => actRow(a, true)).join('') : 'لا يوجد نشاط مسجّل بعد.';
    $('lg_more').style.display = data.length === 50 ? '' : 'none';
    document.querySelectorAll('[data-at]').forEach(l => l.onclick = e => { e.preventDefault(); const t = S.tasks.find(x => x.id === l.dataset.at); if (t) taskDialog(t); });
  };
  $('lg_who').onchange = () => go(false); $('lg_more').onclick = () => go(true); go(false);
}
