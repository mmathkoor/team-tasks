// ===== المهام الجماعية (نسخة لكل عضو) + ملاحظة الإنجاز + بنود القائمة على البطاقة + مؤشراتي =====
const groupOf = t => t.group_id ? S.tasks.filter(x => x.group_id === t.group_id) : [];
function groupChip(t) {
  if (!t.group_id) return '';
  const g = groupOf(t), dn = g.filter(x => x.status === 'done').length;
  const tip = g.map(x => (x.status === 'done' ? '✓ ' : '○ ') + nm(x.assignee_email)).join('\n');
  return '<span class="chip all" title="' + esc(tip) + '">👥 المجموعة ' + dn + '/' + g.length + '</span>';
}
const doneNoteLine = t => t.status === 'done' && t.done_note ? '<div class="dnote">📝 ' + esc(t.done_note) + '</div>' : '';

// عند إنجاز مهمة جماعية: ماذا أنجزت؟
function askDone(t, cb) {
  dlg.innerHTML = '<h2>🎉 إنجاز المهمة</h2><div style="margin-bottom:12px;font-weight:700">' + esc(t.title) + '</div>' +
    '<label>ماذا أنجزت؟ (اختياري — يظهر في تقارير الفريق)<textarea id="dn_t" rows="3" placeholder="اكتب باختصار ما تم إنجازه...">' + esc(t.done_note || '') + '</textarea></label>' +
    '<div class="row dact"><button class="s" id="dn_x">إلغاء</button><button class="p s" id="dn_ok">تأكيد الإنجاز ✓</button></div>';
  $('dn_x').onclick = () => dlg.close();
  $('dn_ok').onclick = () => { const v = $('dn_t').value.trim(); dlg.close(); cb(v || null); };
  dlg.showModal(); $('dn_t').focus();
}

// بنود القائمة الفرعية تظهر على البطاقة مع فترتها الزمنية وحالة التأخير ويُشطب البند بضغطة بدون فتح المهمة
const itemsOf = id => (S.items || []).filter(x => x.task_id === id);
function ckRows(t) {
  if (t.for_all || eff(t) === 'done') return '';
  const L = itemsOf(t.id); if (!L.length) return '';
  return '<div class="ckrows">' + L.slice(0, 5).map(x => {
    const m = typeof parseSubtaskMeta === 'function' ? parseSubtaskMeta(x) : { cleanText: x.text, badgeHtml: '' };
    return '<label class="ckrow" style="justify-content:space-between;flex-wrap:wrap">' +
      '<span style="display:flex;align-items:center;gap:8px;min-width:0"><input type="checkbox" data-ci="' + x.id + '"' + (x.done ? ' checked' : '') + '><span' + (x.done ? ' class="dn"' : '') + '>' + esc(m.cleanText) + '</span></span>' +
      (m.badgeHtml || '') +
    '</label>';
  }).join('') +
    (L.length > 5 ? '<div class="m" style="padding:2px 4px">+' + (L.length - 5) + ' بنود أخرى…</div>' : '') + '</div>';
}
async function ckToggle(id, done) {
  const it = (S.items || []).find(x => x.id === id); if (!it) return;
  const t = S.tasks.find(x => x.id === it.task_id); it.done = done;
  const L = itemsOf(it.task_id), dn = L.filter(x => x.done).length, pg = L.length ? Math.round(100 * dn / L.length) : 0;
  S.itemStats = S.itemStats || {}; S.itemStats[it.task_id] = [dn, L.length];
  const bump = !!(done && t && t.status === 'todo');
  if (t) { t.progress = pg; if (bump) t.status = 'doing'; }
  render();
  const r = await sb.from('task_items').update({ done, done_by: done ? S.me.email : null, done_at: done ? new Date().toISOString() : null }).eq('id', id);
  if (r.error) { it.done = !done; alert('خطأ: ' + r.error.message); return load(); }
  await sb.from('tasks').update(bump ? { progress: pg, status: 'doing' } : { progress: pg }).eq('id', it.task_id);
  if (done && L.length && dn === L.length && t && t.status !== 'done' && confirm('اكتملت كل البنود ✅\nهل تريد إنجاز المهمة الآن؟')) moveTask(t.id, 'done');
}

// ---- مؤشراتي (الصفحة الرئيسية) ----
const doneAtOf = t => t.for_all ? ((S.done.find(d => d.task_id === t.id && same(d.email, S.me.email)) || {}).done_at || null) : (t.completed_at || null);
const inDays = (iso, n) => iso && Date.now() - new Date(iso) <= n * 864e5;
const KPI_TEST = {
  open: t => eff(t) !== 'done',
  late: t => eff(t) !== 'done' && t.due_on && t.due_on < today(),
  soon: t => eff(t) !== 'done' && t.due_on && t.due_on >= today() && daysTo(t.due_on) <= 1,
  week: t => eff(t) === 'done' && inDays(doneAtOf(t), 7)
};
const KPI_LABEL = { open: 'المفتوحة', late: 'المتأخرة', soon: 'اليوم/غداً', week: 'المنجزة هذا الأسبوع' };
function myKpis() {
  const M = S.tasks.filter(mine), c = k => M.filter(KPI_TEST[k]).length;
  const rec = M.filter(t => eff(t) === 'done' && t.due_on && doneAtOf(t) && inDays(doneAtOf(t), 30));
  const ok = rec.filter(t => ymd(new Date(doneAtOf(t))) <= t.due_on).length;
  return { open: c('open'), late: c('late'), soon: c('soon'), week: c('week'), ontime: rec.length ? Math.round(100 * ok / rec.length) : null, onN: rec.length };
}
function kpiHtml() {
  const K = myKpis(), tot = K.week + K.open, pg = tot ? Math.round(100 * K.week / tot) : 0;
  const card = (k, v, l, cls) => '<button class="stat btn ' + (cls || '') + (S.kpi === k ? ' on' : '') + '" data-kpi="' + k + '"><b>' + v + '</b><span>' + l + '</span></button>';
  return '<div class="stats kpis">' + card('open', K.open, 'مفتوحة') + card('late', K.late, 'متأخرة', 'late') + card('soon', K.soon, 'اليوم / غداً', 'soon') + card('week', K.week, 'أنجزتها هذا الأسبوع', 'ok') +
    '<div class="stat"><b>' + (K.ontime == null ? '—' : K.ontime + '%') + '</b><span>التزامي بالمواعيد</span></div></div>' +
    '<div class="wk"><div class="bar"><span>🎯 إنجازك هذا الأسبوع</span><b>' + K.week + ' من ' + tot + ' (' + pg + '%)</b></div><div class="wkb"><i style="width:' + pg + '%"></i></div></div>' +
    (S.kpi ? '<div class="kpi-tag">عرض: <b>' + KPI_LABEL[S.kpi] + '</b> <button class="s" id="kpi_x">✕ إلغاء</button></div>' : '');
}
