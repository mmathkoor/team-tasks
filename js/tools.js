// ===== أدوات الإدارة: فحص النظام + النسخة الاحتياطية =====
const toolsHtml = () => '<div class="card"><h2>🩺 فحص النظام</h2><div class="m" style="margin-bottom:8px">يتحقق من الاتصال والإشعارات والجداول والمرفقات، ويخبرك بما ينقص.</div>' +
  '<div class="row"><button class="p s" id="hc_run">تشغيل الفحص</button>' + (isAdmin() ? '<button class="s" id="bk_run">💾 نسخة احتياطية (JSON)</button>' : '') + '</div><div id="hc_out" style="margin-top:10px"></div></div>';

async function healthCheck() {
  const R = [], add = (st, label, hint) => R.push({ st, label, hint });   // 1 سليم، 2 تنبيه، 0 خلل
  add(1, 'رقم النسخة', VERSION);
  add(navigator.onLine ? 1 : 2, 'الاتصال بالإنترنت', navigator.onLine ? 'متصل' : 'غير متصل — تعمل على النسخة المحفوظة');
  const standalone = window.matchMedia && matchMedia('(display-mode: standalone)').matches;
  add(standalone ? 1 : 2, 'طريقة التشغيل', standalone ? 'مثبّت كتطبيق' : 'يعمل من المتصفح — ثبّته من القائمة ليعمل الإشعار بثبات');
  let reg = null;
  try { reg = await navigator.serviceWorker.getRegistration(); const ks = await caches.keys(); add(reg && navigator.serviceWorker.controller ? 1 : 2, 'عامل الخدمة (العمل دون اتصال)', reg ? ks.join('، ') || 'مسجّل' : 'غير مسجّل'); } catch (e) { add(0, 'عامل الخدمة', 'غير مدعوم في هذا المتصفح'); }
  const s = AUTH.s; add(s ? 1 : 0, 'جلسة الدخول', s ? 'نشطة' : 'غير موجودة — سجّل الدخول من جديد');
  const db = await sb.from('members').select('email').limit(1);
  add(db.error ? 0 : 1, 'قاعدة البيانات', db.error ? db.error.message : 'تعمل');
  for (const [t, f] of [['task_items', 'القائمة الفرعية'], ['activity', 'سجل النشاط'], ['task_comments', 'التعليقات'], ['task_files', 'سجل المرفقات'], ['recurring_tasks', 'المهام المتكررة']]) {
    const r = await sb.from(t).select('*').limit(1); add(r.error ? 0 : 1, 'جدول ' + f, r.error ? 'غير متاح — شغّل ملفات sql/ بالترتيب (' + r.error.message + ')' : 'متاح');
  }
  try { const r = await stor('POST', 'object/list/task-files', JSON.stringify({ prefix: '', limit: 1 }), 'application/json'); add(r.ok ? 1 : 0, 'مخزن المرفقات', r.ok ? 'يعمل' : 'غير متاح — تحقق من ملف sql/001 (المخزن وصلاحياته)'); } catch (e) { add(2, 'مخزن المرفقات', 'تعذّر الفحص (لا اتصال)'); }
  const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  add(perm === 'granted' ? 1 : 2, 'إذن الإشعارات', perm === 'granted' ? 'ممنوح' : perm === 'denied' ? 'محظور — فعّله من إعدادات الموقع' : 'لم يُطلب بعد — اضغط «تفعيل الإشعارات»');
  try {
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) add(2, 'اشتراك الإشعارات على هذا الجهاز', 'غير موجود');
    else { const r = await sb.from('push_subs').select('endpoint').eq('endpoint', sub.endpoint); add(r.data && r.data.length ? 1 : 2, 'اشتراك الإشعارات على هذا الجهاز', r.data && r.data.length ? 'مسجّل في قاعدة البيانات' : 'موجود بالجهاز لكنه غير مسجّل — اضغط «تفعيل الإشعارات» مجدداً'); }
  } catch (e) { add(2, 'اشتراك الإشعارات', 'تعذّر الفحص'); }
  const q = (await idbGet('q')) || []; add(q.length ? 2 : 1, 'التغييرات المنتظرة للمزامنة', q.length ? q.length + ' بانتظار الاتصال' : 'لا شيء');
  return R;
}
async function fetchAll(t) {
  const out = [];
  for (let o = 0; o < 100000; o += 1000) { const { data, error } = await sb.from(t).select('*').limit(1000).offset(o); if (error) return { error: error.message }; out.push(...data); if (data.length < 1000) break; }
  return out;
}
async function exportBackup() {
  const out = { exported_at: new Date().toISOString(), version: VERSION, tables: {} };
  for (const t of ['members', 'meetings', 'tasks', 'task_items', 'task_comments', 'task_files', 'task_done', 'recurring_tasks', 'proposals', 'votes', 'activity']) out.tables[t] = await fetchAll(t);
  downloadText('backup-' + ymd(new Date()) + '.json', JSON.stringify(out, null, 1), 'application/json');
  return out;
}
function bindTools() {
  if (!$('hc_run')) return;
  $('hc_run').onclick = async () => {
    $('hc_run').disabled = true; $('hc_out').innerHTML = '<span class="m">جارٍ الفحص...</span>';
    const R = await healthCheck(), icon = { 1: '✅', 2: '⚠️', 0: '❌' };
    $('hc_out').innerHTML = R.map(r => '<div style="padding:5px 0;border-top:1px solid var(--line)">' + icon[r.st] + ' <b>' + esc(r.label) + '</b><div class="m">' + esc(r.hint) + '</div></div>').join('');
    $('hc_run').disabled = false;
  };
  if ($('bk_run')) $('bk_run').onclick = async () => { $('bk_run').disabled = true; $('bk_run').textContent = '⏳ جارٍ التجميع...'; try { await exportBackup(); } catch (e) { alert('خطأ: ' + e.message); } $('bk_run').disabled = false; $('bk_run').textContent = '💾 نسخة احتياطية (JSON)'; };
}
