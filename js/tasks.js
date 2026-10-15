function notifyNext(t) {
  const c = t.flow_step || 0, nx = Array.isArray(t.flow) && t.flow[c + 1]; if (!nx || !nx.email) return;
  apiPost('/api/notify', JSON.stringify({ title: '🔗 دورك الآن في المسار', body: '«' + t.title + '»' + (nx.note ? ' — ' + nx.note : ''), assignee_email: nx.email, for_all: false, is_custom: true, task_id: t.id, task_title: t.title })).catch(() => {});
}
function flowLine(t) {
  if (!Array.isArray(t.flow) || t.flow.length < 2) return '';
  const c = t.flow_step || 0, fin = eff(t) === 'done';
  const path = t.flow.map((z, i) => i < c || (fin && i === c) ? '<s>' + esc(nm(z.email)) + '</s>' : i === c ? '<b style="color:var(--acc)">' + esc(nm(z.email)) + '</b>' : esc(nm(z.email))).join(' ➜ ');
  return '<div class="m" style="margin:6px 0;padding:8px 10px;background:var(--col);border-radius:10px">🔗 ' + path + (!fin && t.flow[c] && t.flow[c].note ? '<div style="margin-top:4px;color:var(--ink)">📌 ' + esc(t.flow[c].note) + '</div>' : '') + '</div>';
}
function notifyAdmins(t, msg) {
  apiPost('/api/notify', JSON.stringify({ title: '✅ إنجاز جديد', body: msg || 'أنجز المهمة «' + t.title + '»', to_admins: true, is_custom: true, sender_name: S.me.name })).catch(() => {});
}

function renderNotesAndWorkflow(notesStr) {
    if (!notesStr) return '';
    const lines = notesStr.split('\n');
    let mainNotes = [];
    let wfHistory = [];
    lines.forEach(l => {
        if(l.startsWith('[WF_HANDOFF]')) {
            let p = l.replace('[WF_HANDOFF]', '').split('||');
            wfHistory.push('<div class="wf-item"><div class="wf-meta">🔄 <b>' + esc(p[0]) + '</b> أحالها إلى <b>' + esc(p[1]) + '</b> <span dir="ltr">(' + esc(p[2]) + ')</span></div><div class="wf-msg">' + esc(p[3]||'') + '</div></div>');
        } else {
            mainNotes.push(l);
        }
    });
    let html = '';
    let mainTxt = mainNotes.join('\n').trim();
    if(mainTxt) html += '<div class="nt">' + esc(mainTxt) + '</div>';
    if(wfHistory.length > 0) html += '<div class="wf-list">' + wfHistory.join('') + '</div>';
    return html;
}

function dueInfo(t) {
  if (!t.due_on) return null;
  if (eff(t) === 'done') return { c: '', t: t.due_on };
  if (t.due_on < today()) return { c: 'late', t: '⚠️ متأخرة (' + t.due_on + ')' };
  const d = daysTo(t.due_on);
  return d <= 1 ? { c: 'soon', t: d ? '⏱️ غداً' : '🔥 اليوم' } : { c: '', t: '📅 ' + t.due_on };
}

function card(t) {
  const st = eff(t), d = dueInfo(t), mt = S.meetings.find(m => m.id === t.meeting_id);
  const acts = (t.for_all ? ACT_ALL : ACT)[st];
  const dn = doneBy(t);
  
  let waBtn = '';
  if (!t.for_all && t.assignee_email && S.me && t.assignee_email) {
    const msg = 'مرحباً ' + nm(t.assignee_email) + '،\nتذكير بمهمة: *' + t.title + '*\n' + (t.due_on ? 'تاريخ الاستحقاق: ' + t.due_on : '') + '\nنرجو المتابعة. 🚀';
    waBtn = '<a href="https://wa.me/?text=' + encodeURIComponent(msg) + '" target="_blank" class="wa-btn" title="تذكير عبر الواتساب">💬</a>';
  }

  let actsHtml = acts.map(([k, l]) => '<button data-mv="' + t.id + '" data-to="' + k + '">' + l + '</button>').join('');
  let handoffBtn = (!t.for_all && st !== 'done') ? '<button class="s" data-hf="' + t.id + '" style="background:var(--accsoft);color:var(--acc)">إحالة 🔄</button>' : '';

  let metaAll = t.for_all 
    ? '<span class="chip all" title="' + esc(dn.map(x => nm(x.email)).join('\n')) + '">👥 فريق (' + dn.length + '/' + S.members.length + ')</span>' 
    : '<span class="chip" style="font-weight:700">👤 ' + esc(nm(t.assignee_email)) + '</span>';

  let metaD = d ? '<span class="chip ' + d.c + '">' + esc(d.t) + '</span>' : '';
  let metaMt = mt ? '<span class="chip">📌 ' + esc(mt.title) + '</span>' : '';

  return '<div class="tk ' + st + '" draggable="true" data-id="' + t.id + '">' +
    '<div class="tt">' + esc(t.title) + '</div>' +
    (t.progress > 0 && st !== 'done' ? '<div style="height:5px;background:var(--line);border-radius:3px;margin:6px 0"><div style="height:100%;width:' + t.progress + '%;background:var(--acc);border-radius:3px"></div></div>' : '') +
    flowLine(t) +
    renderNotesAndWorkflow(t.notes) +
    '<div class="meta" style="align-items:center;">' + metaAll + metaD + metaMt + ckChip(t) + waBtn + '</div>' +
    '<div class="acts">' + actsHtml + ' ' + handoffBtn + '</div>' +
  '</div>';
}

function boardView() {
  const all = S.tasks.filter(t => (!S.meeting || t.meeting_id === S.meeting) && (S.filter === 'all' || mine(t)));
  const open = all.filter(t => eff(t) !== 'done');
  const late = open.filter(t => t.due_on && t.due_on < today()).length;
  const soon = open.filter(t => t.due_on && t.due_on >= today() && daysTo(t.due_on) <= 1).length;
  
  const cols = Object.keys(ST).map(k => {
    const items = all.filter(t => eff(t) === k);
    return '<div class="col ' + (S.col === k ? 'on' : '') + '" data-st="' + k + '">' +
      '<div class="ch"><span>' + ST[k] + '</span><i>' + items.length + '</i></div>' +
      (items.length ? items.map(card).join('') : '<div class="empty">لا يوجد مهام</div>') +
    '</div>';
  }).join('');
  
  let mtOpts = '<option value="">كل المشاريع/الاجتماعات</option>' + S.meetings.map(m => '<option value="' + m.id + '" ' + (S.meeting === m.id ? 'selected' : '') + '>' + esc(m.title) + '</option>').join('');
  let adminBtn = isAdmin() ? '<button class="s" id="nmt" style="background:transparent;border-color:var(--mute)">+ قسم/اجتماع</button>' : '';
  let cTabs = Object.keys(ST).map(k => '<button data-c="' + k + '" class="' + (S.col === k ? 'on' : '') + '">' + ST[k] + ' (' + all.filter(t => eff(t) === k).length + ')</button>').join('');

  return '<div class="stats">' +
    '<div class="stat"><b>' + open.length + '</b><span>قيد العمل</span></div>' +
    '<div class="stat late"><b>' + late + '</b><span>متأخرة</span></div>' +
    '<div class="stat soon"><b>' + soon + '</b><span>اليوم/غداً</span></div>' +
  '</div>' +
  '<div class="tools">' +
    '<div class="seg"><button data-f="mine" class="' + (S.filter === 'mine' ? 'on' : '') + '">مهامي فقط</button><button data-f="all" class="' + (S.filter === 'all' ? 'on' : '') + '">كل الفريق</button></div>' +
    '<select id="fm" style="border-radius:6px">' + mtOpts + '</select>' +
    '<span class="sp"></span>' +
    adminBtn + '<button class="p s" id="nt">➕ إضافة مهمة</button>' +
  '</div>' +
  '<div class="ctabs">' + cTabs + '</div>' +
  '<div class="board">' + cols + '</div>';
}

function bindBoard() {
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.filter = b.dataset.f; render(); });
  document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { S.col = b.dataset.c; render(); });
  $('fm').onchange = e => { S.meeting = e.target.value; render(); };
  $('nt').onclick = () => taskDialog(null);
  if ($('nmt')) $('nmt').onclick = () => { const t = prompt('اسم القسم/الاجتماع الجديد'); if (t && t.trim()) run(sb.from('meetings').insert({ title: t.trim() })); };
  
  document.querySelectorAll('[data-mv]').forEach(b => b.onclick = e => { e.stopPropagation(); moveTask(b.dataset.mv, b.dataset.to); });
  document.querySelectorAll('[data-hf]').forEach(b => { b.onclick = e => { e.stopPropagation(); handoffDialog(b.dataset.hf); }; });

  document.querySelectorAll('.tk').forEach(el => {
    el.onclick = () => taskDialog(S.tasks.find(t => t.id === el.dataset.id));
    el.ondragstart = e => { e.dataTransfer.setData('text/plain', el.dataset.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('drag'); };
    el.ondragend = () => el.classList.remove('drag');
  });
  document.querySelectorAll('.col').forEach(c => {
    c.ondragover = e => { e.preventDefault(); c.classList.add('over'); };
    c.ondragleave = () => c.classList.remove('over');
    c.ondrop = e => { e.preventDefault(); c.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id) moveTask(id, c.dataset.st); };
  });
}

function handoffDialog(tId) {
    const t = S.tasks.find(x => x.id === tId);
    if(!t) return;
    let opts = '<option value="">-- اختر الزميل --</option>' + S.members.filter(m => !same(m.email, t.assignee_email)).map(m => '<option value="' + esc(m.email) + '">' + esc(m.name) + '</option>').join('');
    
    dlg.innerHTML = '<h2>إحالة المهمة (Workflow)</h2>' +
    '<div style="background:var(--col);padding:10px;border-radius:8px;margin-bottom:16px;font-weight:600">' + esc(t.title) + '</div>' +
    '<label>إحالة إلى الزميل:<select id="hf_to">' + opts + '</select></label>' +
    '<label>رسالة التوجيه/المطلوب:<textarea id="hf_msg" rows="3" placeholder="اكتب ملاحظاتك ليكمل عليها..."></textarea></label>' +
    '<div class="row dact"><button id="hf_cx" class="s">إلغاء</button><button class="p" id="hf_sv">إحالة المهمة الآن</button></div>';
    
    $('hf_cx').onclick = () => dlg.close();
    $('hf_sv').onclick = async () => {
        const to = $('hf_to').value;
        if(!to) return alert('الرجاء اختيار زميل لإحالة المهمة إليه.');
        const msg = $('hf_msg').value.trim();
        if(!msg) return alert('الرجاء كتابة رسالة توجيه للزميل.');
        
        const noteAppend = '\n[WF_HANDOFF]' + S.me.name + '||' + nm(to) + '||' + today() + '||' + msg;
        const newNotes = (t.notes || '') + noteAppend;
        
        $('hf_sv').disabled = true; $('hf_sv').textContent = 'جاري الإحالة...';
        const { error } = await sb.from('tasks').update(Object.assign({ assignee_email: to, notes: newNotes, status: 'todo' }, Array.isArray(t.flow) ? { flow: t.flow.map((z, i) => i === (t.flow_step || 0) ? Object.assign({}, z, { email: to }) : z) } : {})).eq('id', t.id);
        if(error) { alert('خطأ: ' + error.message); $('hf_sv').disabled = false; return; }
        
        // إشعار السيرفر بوجود مهمة جديدة أُحيلت لشخص
        apiPost('/api/notify', JSON.stringify({ title: t.title, assignee_email: to, for_all: false, sender_name: S.me.name, task_id: t.id })).catch(e => console.error(e));

        dlg.close(); load();
    };
    dlg.showModal();
}

async function moveTask(id, to) {
  const t = S.tasks.find(x => x.id === id);
  if (!t || eff(t) === to || !S.me) return;
  S.col = to;
  if (t.for_all) {
    if (to === 'doing') return;
    if (to === 'done') {
      S.done.push({ task_id: id, email: S.me.email }); render();
      run(sb.from('task_done').upsert({ task_id: id, email: S.me.email })); notifyAdmins(t);
    } else {
      S.done = S.done.filter(d => !(d.task_id === id && same(d.email, S.me.email))); render();
      run(sb.from('task_done').delete().eq('task_id', id).eq('email', S.me.email));
    }
    return;
  }
  const snap = Object.assign({}, t), adv = to === 'done' && Array.isArray(t.flow) && (t.flow_step || 0) < t.flow.length - 1;
  if (adv) { const c = (t.flow_step || 0) + 1; t.flow_step = c; t.assignee_email = t.flow[c].email; t.status = 'todo'; } else t.status = to;
  render();
  const { error } = await sb.from('tasks').update({ status: to }).eq('id', id);
  if (error) { Object.assign(t, snap); alert('خطأ: ' + error.message); load(); }
  else if (to === 'done') { notifyAdmins(t, adv ? 'أنهى مرحلته في «' + t.title + '»' : null); if (adv) { notifyNext(snap); load(); } }
}

function taskDialog(t, pre = {}) {
  const x = t || pre, edit = !!t;
  const asVal = x.for_all ? '__all' : (x.assignee_email || (S.me ? S.me.email : ''));
  
  let asOpts = '<option value="__all" ' + (asVal === '__all' ? 'selected' : '') + '>👥 مهمة جماعية للكل</option>' +
               '<option value="" ' + (asVal === '' ? 'selected' : '') + '>غير مُسند</option>' +
               S.members.map(m => '<option value="' + esc(m.email) + '" ' + (same(m.email, asVal) ? 'selected' : '') + '>' + esc(m.name) + '</option>').join('');
               
  let mtOpts = '<option value="">بدون ارتباط</option>' + S.meetings.map(m => '<option value="' + m.id + '" ' + (x.meeting_id === m.id ? 'selected' : '') + '>' + esc(m.title) + '</option>').join('');
  let stOpts = Object.entries(ST).map(([k, v]) => '<option value="' + k + '" ' + ((x.status || 'todo') === k ? 'selected' : '') + '>' + v + '</option>').join('');

  let dlBtn = edit && canDel(t) ? '<button class="dng s" id="f_dl" style="margin-inline-end:auto">حذف</button>' : '<span></span>';

  dlg.innerHTML = '<h2>' + (edit ? 'تعديل المهمة' : 'مهمة جديدة') + '</h2>' +
  '<label>العنوان<input id="f_ti" value="' + esc(x.title || '') + '" placeholder="ما هو المطلوب إنجازه؟"></label>' +
  '<label>تفاصيل وروابط (اختياري)<textarea id="f_no" rows="3">' + esc(x.notes || '') + '</textarea></label>' +
  '<div class="row">' +
    '<label>المسؤول الأول عن التنفيذ<select id="f_as">' + asOpts + '</select></label>' +
    '<label>تاريخ الاستحقاق<input id="f_du" type="date" value="' + esc(x.due_on || '') + '"></label>' +
  '</div>' +
  '<div class="row" style="margin-top:10px">' +
    '<label>الارتباط (قسم/مشروع)<select id="f_mt">' + mtOpts + '</select></label>' +
    '<label id="f_stw">الحالة<select id="f_st">' + stOpts + '</select></label>' +
  '</div>' +
  '<div id="ck_box" style="margin-top:14px"></div>' +
  '<div id="fw_box" style="margin-top:14px"></div>' +
  '<p class="m" id="f_hint" style="margin:12px 0 0;padding:10px;background:var(--accsoft);color:var(--acc);border-radius:8px">ℹ️ <b>مهمة للكل:</b> تظهر لجميع الأعضاء، وكل عضو يعتمد إنجازها لنفسه بشكل منفصل.</p>' +
  '<div class="row dact">' + dlBtn + '<button id="f_cx" class="s">إلغاء</button><button class="p s" id="f_sv">حفظ</button></div>';
  
  if (edit) { $('f_hint').insertAdjacentHTML('afterend', EXTRA_HTML(t)); bindExtras(t); }
  const ck = ckInit(edit ? t : null);
  let fw = Array.isArray(x.flow) ? x.flow.map(z => ({ email: z.email, note: z.note || '' })) : [];
  const cur = edit ? (x.flow_step || 0) : 0;
  const drawFlow = () => {
    const sel = i => '<select data-fe="' + i + '" style="flex:1 1 130px">' + S.members.map(m => '<option value="' + esc(m.email) + '" ' + (same(m.email, fw[i].email) ? 'selected' : '') + '>' + esc(m.name) + '</option>').join('') + '</select>';
    $('fw_box').innerHTML = '<b>🔗 مسار العمل (اختياري)</b><div class="m" style="margin:2px 0 8px">حدّد من يستلم المهمة بعد إنجاز كل مرحلة؛ تنتقل إليه تلقائياً ويصله إشعار. زر «إحالة» يبقى متاحاً لأي تحويل طارئ.</div>' +
      fw.map((z, i) => '<div class="row" style="align-items:center;margin-bottom:6px"><span class="chip s">' + (i + 1) + '</span>' +
        (i === 0 && !edit ? '<span class="m" style="flex:1 1 130px">المسؤول الأول (المحدد أعلاه)</span>' : i <= cur ? '<b style="flex:1 1 130px">' + esc(nm(z.email)) + (i < cur ? ' ✓' : ' (الحالي)') + '</b>' : sel(i)) +
        '<input data-fn="' + i + '" placeholder="المطلوب في هذه المرحلة (اختياري)" value="' + esc(z.note) + '" style="flex:2 1 160px">' +
        (i > cur ? '<button class="s dng" type="button" data-fr="' + i + '">✕</button>' : '') + '</div>').join('') +
      '<button class="s" type="button" id="fw_add">+ إضافة مرحلة تالية</button>' + (fw.length ? ' <button class="s dng" type="button" id="fw_clr">إلغاء المسار</button>' : '');
    $('fw_box').querySelectorAll('[data-fe]').forEach(e => e.onchange = () => { fw[+e.dataset.fe].email = e.value; });
    $('fw_box').querySelectorAll('[data-fn]').forEach(e => e.oninput = () => { fw[+e.dataset.fn].note = e.value; });
    $('fw_box').querySelectorAll('[data-fr]').forEach(b => b.onclick = () => { fw.splice(+b.dataset.fr, 1); if (fw.length < 2) fw = []; drawFlow(); });
    $('fw_add').onclick = () => { if (!fw.length) fw.push({ email: (edit && x.assignee_email) || '', note: '' }); fw.push({ email: S.members[0].email, note: '' }); drawFlow(); };
    if ($('fw_clr')) $('fw_clr').onclick = () => { fw = []; drawFlow(); };
  };
  drawFlow();
  const sync = () => { const a = $('f_as').value === '__all'; $('f_stw').style.display = a ? 'none' : ''; $('f_hint').style.display = a ? '' : 'none'; $('fw_box').style.display = a ? 'none' : ''; $('ck_box').style.display = a ? 'none' : ''; };
  $('f_as').onchange = sync; sync();
  $('f_cx').onclick = () => dlg.close();
  $('f_sv').onclick = async () => {
    const title = $('f_ti').value.trim(); if (!title) return $('f_ti').focus();
    const all = $('f_as').value === '__all';
    const assignee = $('f_as').value;
    const row = { title, notes: $('f_no').value.trim() || null, for_all: all, assignee_email: all ? null : (assignee || null), due_on: $('f_du').value || null, meeting_id: $('f_mt').value || null, status: all ? 'todo' : $('f_st').value };
    if (!edit) { row.created_by = S.me.email; row.id = crypto.randomUUID(); } else row.progress = +$('f_pg').value;
    let flow = !all && fw.length >= 2 ? fw.map(z => ({ email: z.email, note: (z.note || '').trim() })) : null;
    if (flow) { flow[cur].email = assignee || flow[cur].email; flow = flow.filter(z => z.email); if (flow.length < 2) flow = null; }
    if (flow || (edit && t.flow)) row.flow = flow;
    if (flow && (!edit || !t.flow)) row.flow_step = 0;
    
    $('f_sv').disabled = true; $('f_sv').textContent = '...';
    const { error } = edit ? await sb.from('tasks').update(row).eq('id', t.id) : await sb.from('tasks').insert(row);
    if (error) { alert('خطأ: ' + error.message); $('f_sv').disabled = false; $('f_sv').textContent = 'حفظ'; return; }
    if (!edit && !all) await ck.flush(row.id);
    
    if (edit && !all && row.status === 'done' && t.status !== 'done') {
      const fl = row.flow !== undefined ? row.flow : t.flow, adv = Array.isArray(fl) && (t.flow_step || 0) < fl.length - 1;
      notifyAdmins(t, adv ? 'أنهى مرحلته في «' + t.title + '»' : null); if (adv) notifyNext(Object.assign({}, t, { flow: fl }));
    }
    // إرسال إشعار فوري عند الإضافة (ليست تعديلاً)
    if (!edit && (all || assignee)) {
        apiPost('/api/notify', JSON.stringify({ title: row.title, assignee_email: row.assignee_email, for_all: row.for_all, sender_name: S.me.name, task_id: row.id })).catch(e => console.error(e));
    }

    dlg.close(); load();
  };
  if (edit && canDel(t)) $('f_dl').onclick = () => { if (confirm('هل أنت متأكد من حذف المهمة؟')) { dlg.close(); run(sb.from('tasks').delete().eq('id', t.id)); } };
  dlg.showModal(); if (!edit) $('f_ti').focus();
}
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
