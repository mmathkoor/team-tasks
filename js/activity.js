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
  const actTypes = [
    ['', '⚡ كل أنواع الحركات'],
    ['created', '🆕 إنشاء مهمة'],
    ['status', '🔄 تغيير حالة'],
    ['flow_step', '🔗 انتقال مرحلة بالمسار'],
    ['checklist', '☑ إنجاز مهمة فرعية'],
    ['comment', '💬 تعليق جديد'],
    ['reassigned', '👤 إحالة مهمة'],
    ['due', '📅 تعديل موعد'],
    ['file', '📎 مرفقات'],
    ['deleted', '🗑️ حذف']
  ];
  return '<div class="card"><h2>🕘 سجل النشاط والحركات</h2>' +
    '<div class="adv-filter-bar" style="margin-bottom:12px">' +
      '<div class="adv-filter-grid">' +
        '<input id="lg_q" type="search" placeholder="🔍 بحث في اسم المهمة أو التفاصيل...">' +
        '<select id="lg_who"><option value="">👤 كل الأعضاء</option>' + S.members.map(m => '<option value="' + esc(m.email) + '">' + esc(m.name) + '</option>').join('') + '</select>' +
        '<select id="lg_act">' + actTypes.map(([k, l]) => '<option value="' + k + '">' + l + '</option>').join('') + '</select>' +
        '<input type="date" id="lg_from" title="من تاريخ">' +
        '<input type="date" id="lg_to" title="إلى تاريخ">' +
        '<button class="s" id="lg_reset">↺ مسح</button>' +
      '</div>' +
    '</div>' +
    '<div id="lg_list" class="m">جارٍ التحميل...</div><div class="row" style="margin-top:10px"><button id="lg_more" class="s" style="display:none">عرض المزيد</button></div></div>';
}
function bindLog() {
  let rows = [];
  const renderRows = () => {
    const q = ($('lg_q')?.value || '').trim().toLowerCase();
    const act = $('lg_act')?.value || '';
    const from = $('lg_from')?.value || '';
    const to = $('lg_to')?.value || '';
    const filtered = rows.filter(a => {
      if (act && a.action !== act) return false;
      const day = String(a.at || '').slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (q) {
        const txt = (actWho(a.actor_email) + ' ' + actText(a) + ' ' + (a.task_title || '')).toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
    $('lg_list').innerHTML = filtered.length ? filtered.map(a => actRow(a, true)).join('') : '<div class="empty">لا يوجد نشاط مطابق للفلتر المحدد.</div>';
    document.querySelectorAll('[data-at]').forEach(l => l.onclick = e => { e.preventDefault(); const t = S.tasks.find(x => x.id === l.dataset.at); if (t) taskDialog(t); });
  };
  const go = async more => {
    let q = sb.from('activity').select('*').order('at', { ascending: false }).limit(80);
    if ($('lg_who').value) q = q.ilike('actor_email', $('lg_who').value);
    if (more && rows.length) q = q.lt('at', rows[rows.length - 1].at);
    const { data, error } = await q;
    if (error) { $('lg_list').textContent = 'تعذّر التحميل (أو أنك في وضع عدم الاتصال)'; return; }
    rows = more ? rows.concat(data || []) : (data || []);
    try { localStorage.setItem('tt_activity_cache', JSON.stringify(rows.slice(0, 80))); } catch {}
    if (!rows.length && !navigator.onLine) {
      try { rows = JSON.parse(localStorage.getItem('tt_activity_cache') || '[]'); } catch {}
    }
    renderRows();
    $('lg_more').style.display = (data || []).length === 80 ? '' : 'none';
  };
  $('lg_who').onchange = () => go(false);
  if ($('lg_q')) $('lg_q').oninput = renderRows;
  if ($('lg_act')) $('lg_act').onchange = renderRows;
  if ($('lg_from')) $('lg_from').onchange = renderRows;
  if ($('lg_to')) $('lg_to').onchange = renderRows;
  if ($('lg_reset')) $('lg_reset').onclick = () => {
    if ($('lg_q')) $('lg_q').value = '';
    if ($('lg_who')) $('lg_who').value = '';
    if ($('lg_act')) $('lg_act').value = '';
    if ($('lg_from')) $('lg_from').value = '';
    if ($('lg_to')) $('lg_to').value = '';
    go(false);
  };
  $('lg_more').onclick = () => go(true);
  go(false);
}
