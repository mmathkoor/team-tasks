// ===== المهام المتكررة (للأدمن) =====
const WD = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const freqText = r => ({ daily: 'يومياً', weekly: 'كل ' + WD[r.weekday || 0], monthly: 'يوم ' + (r.day_of_month || 1) + ' من كل شهر', month_end: 'نهاية كل شهر' })[r.frequency];
const recurHtml = () => '<div class="card"><h2>🔁 المهام المتكررة</h2><div id="rc_list" class="m">جارٍ التحميل...</div>' +
  '<h3 style="font-size:14px;margin-top:16px">إضافة مهمة متكررة:</h3>' +
  '<div class="row"><input id="rc_ti" placeholder="عنوان المهمة"><select id="rc_as"><option value="__all">👥 لكل الأعضاء</option>' + S.members.map(m => '<option value="' + esc(m.email) + '">' + esc(m.name) + '</option>').join('') + '</select></div>' +
  '<div class="row" style="margin-top:8px"><select id="rc_fr"><option value="daily">يومياً</option><option value="weekly">أسبوعياً</option><option value="monthly">شهرياً</option><option value="month_end">نهاية كل شهر</option></select>' +
  '<select id="rc_wd" style="display:none">' + WD.map((d, i) => '<option value="' + i + '">' + d + '</option>').join('') + '</select><input id="rc_dm" type="number" min="1" max="31" placeholder="يوم الشهر (1-31)" style="display:none"></div>' +
  '<div class="row" style="margin-top:8px"><input id="rc_du" type="number" min="0" max="30" placeholder="مهلة التنفيذ بالأيام (0 = نفس اليوم)"><button class="p s" id="rc_add">إضافة</button></div></div>';
async function bindRecur() {
  if (!$('rc_list')) return;
  const draw = async () => {
    const { data, error } = await sb.from('recurring_tasks').select('*').order('created_at', { ascending: true });
    $('rc_list').innerHTML = error ? 'تعذّر التحميل (شغّل features.sql أولاً)' : data.length ? data.map(r => '<div class="bar" style="padding:4px 0"><span>🔁 <b>' + esc(r.title) + '</b> — ' + freqText(r) + ' — ' + (r.for_all ? 'الكل' : esc(nm(r.assignee_email))) + '</span><button class="dng s" data-rd="' + r.id + '">حذف</button></div>').join('') : 'لا توجد مهام متكررة.';
    document.querySelectorAll('[data-rd]').forEach(b => b.onclick = async () => { if (confirm('حذف هذه المهمة المتكررة؟')) { await sb.from('recurring_tasks').delete().eq('id', b.dataset.rd); draw(); } });
  };
  $('rc_fr').onchange = () => { $('rc_wd').style.display = $('rc_fr').value === 'weekly' ? '' : 'none'; $('rc_dm').style.display = $('rc_fr').value === 'monthly' ? '' : 'none'; };
  $('rc_add').onclick = async () => {
    const title = $('rc_ti').value.trim(); if (!title) return $('rc_ti').focus();
    const fr = $('rc_fr').value, all = $('rc_as').value === '__all';
    const { error } = await sb.from('recurring_tasks').insert({ title, for_all: all, assignee_email: all ? null : $('rc_as').value, frequency: fr, weekday: fr === 'weekly' ? +$('rc_wd').value : null, day_of_month: fr === 'monthly' ? Math.min(31, Math.max(1, +$('rc_dm').value || 1)) : null, due_after_days: Math.max(0, +$('rc_du').value || 0), created_by: S.me.email });
    if (error) return alert('خطأ: ' + error.message);
    $('rc_ti').value = ''; draw();
  };
  draw();
}
