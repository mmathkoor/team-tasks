async function bindExtras(t) {
  $('f_pg').oninput = () => { $('pg_v').textContent = $('f_pg').value + '%'; };
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const drawC = async () => {
    const { data, error } = await sb.from('task_comments').select('*').eq('task_id', t.id).order('created_at', { ascending: true });
    $('cm_list').innerHTML = error ? 'تعذّر التحميل (شغّل features.sql أولاً)' : data.length ? data.map(c => '<div style="padding:6px 0;border-top:1px solid var(--line)"><b>' + esc(nm(c.author_email)) + '</b>' + (S.members.some(m => same(m.email, c.author_email) && m.role === 'admin') ? ' <span class="chip">إدارة</span>' : '') + ' <span style="font-size:12px">' + new Date(c.created_at).toLocaleString('ar') + '</span><div style="color:var(--ink);white-space:pre-wrap">' + esc(c.body) + '</div></div>').join('') : 'لا توجد تعليقات بعد.';
  };
  const drawF = async () => {
    const { data, error } = await sb.from('task_files').select('*').eq('task_id', t.id).order('created_at', { ascending: true });
    $('fl_list').innerHTML = error ? 'تعذّر التحميل (شغّل features.sql أولاً)' : data.length ? data.map(f => '<div class="bar" style="padding:4px 0">📎 <span>' + esc(f.name) + ' <span style="font-size:12px">(' + kb(f.size || 0) + ')</span></span><span><button class="s" data-of="' + esc(f.path) + '">فتح</button>' + (isAdmin() || same(f.uploaded_by, S.me.email) ? ' <button class="dng s" data-df="' + f.id + '" data-p="' + esc(f.path) + '">حذف</button>' : '') + '</span></div>').join('') : 'لا توجد مرفقات.';
    document.querySelectorAll('[data-of]').forEach(b => b.onclick = async () => {
      const r = await stor('POST', 'object/sign/task-files/' + b.dataset.of, JSON.stringify({ expiresIn: 300 }), 'application/json'), j = await r.json().catch(() => ({}));
      if (!r.ok) return alert(j.message || 'تعذّر فتح الملف'); window.open(API + '/storage/v1' + j.signedURL, '_blank');
    });
    document.querySelectorAll('[data-df]').forEach(b => b.onclick = async () => {
      if (!confirm('حذف المرفق؟')) return; await stor('DELETE', 'object/task-files/' + b.dataset.p); await sb.from('task_files').delete().eq('id', b.dataset.df); drawF();
    });
  };
  $('cm_add').onclick = async () => {
    const body = $('cm_in').value.trim(); if (!body) return;
    const { error } = await sb.from('task_comments').insert({ task_id: t.id, author_email: S.me.email, body });
    if (error) return alert('خطأ: ' + error.message);
    $('cm_in').value = ''; drawC();
    const to = same(S.me.email, t.assignee_email) ? t.created_by : t.assignee_email;
    if (to && !same(to, S.me.email)) apiPost('/api/notify', JSON.stringify({ title: '💬 تعليق على مهمة', body: t.title + ': ' + body.slice(0, 80), assignee_email: to, for_all: false, sender_name: S.me.name, is_custom: true })).catch(() => {});
  };
  $('fl_in').onchange = async () => {
    const f = $('fl_in').files[0]; if (!f) return;
    const msg = x => { $('fl_msg').textContent = x; };
    if (f.size > 10485760) return msg('❌ الحد الأقصى 10 ميجابايت');
    if (!navigator.onLine) return msg('❌ رفع المرفقات يحتاج اتصالاً بالإنترنت');
    msg('⏳ جارٍ الرفع...');
    try {
      let blob = f, name = f.name;
      if (/^image\/(jpe?g|png|webp)$/.test(f.type)) { try { blob = await shrink(f); name = name.replace(/\.\w+$/, '') + '.jpg'; } catch (e) { blob = f; } }
      const path = t.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ((name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin');
      const r = await stor('POST', 'object/task-files/' + path, blob, blob.type || 'application/octet-stream');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'فشل الرفع');
      const ins = await sb.from('task_files').insert({ task_id: t.id, path, name, size: blob.size, uploaded_by: S.me.email });
      if (ins.error) throw new Error(ins.error.message);
      if (ins.queued) { msg('⚠️ انقطع الاتصال، سيُسجَّل المرفق عند عودته'); return; }
      const chk = await sb.from('task_files').select('id').eq('path', path);
      if (!chk.data || !chk.data.length) throw new Error('رُفع الملف لكنه لم يُسجَّل في المهمة (تحقق من تشغيل features.sql)');
      msg('✅ تم رفع المرفق وحفظه في المهمة'); $('fl_in').value = ''; drawF();
    } catch (e) { msg('❌ ' + e.message); }
  };
  drawC(); drawF(); bindHistory(t);
}
const EXTRA_HTML = t => '<div style="margin-top:14px"><label>نسبة الإنجاز: <b id="pg_v">' + (t.progress || 0) + '%</b><input id="f_pg" type="range" min="0" max="100" step="10" value="' + (t.progress || 0) + '"></label></div>' +
  '<div style="margin-top:14px"><b>📎 المرفقات</b><div id="fl_list" class="m">...</div><div style="margin-top:6px"><input type="file" id="fl_in" accept="image/*,.pdf,.xls,.xlsx,.csv,.doc,.docx,.ppt,.pptx,.txt,.zip"><div id="fl_msg" class="m" style="margin-top:4px"></div></div></div>' +
  '<div style="margin-top:14px"><b>💬 التعليقات والتحديثات</b><div id="cm_list" class="m">...</div><div class="row" style="margin-top:6px"><input id="cm_in" placeholder="اكتب عائقاً أو تحديثاً أو ملاحظة..."><button class="s" id="cm_add">إرسال</button></div></div>' + HS_HTML;
