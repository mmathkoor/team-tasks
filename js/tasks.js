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

  const asDep = !t.for_all && t.assignee_email && typeof memberDept === 'function' ? memberDept(t.assignee_email) : '';
  let metaDep = asDep ? '<span class="chip">🏛️ ' + esc(asDep) + '</span>' : '';
  let metaD = d ? '<span class="chip ' + d.c + '">' + esc(d.t) + '</span>' : '';
  let metaMt = mt ? '<span class="chip">📌 ' + esc(mt.title) + '</span>' : '';

  return '<div class="tk ' + st + (prioOf(t) !== 'normal' ? ' pr-' + prioOf(t) : '') + '" draggable="true" data-id="' + t.id + '">' +
    '<div class="tt">' + esc(t.title) + '</div>' +
    (t.progress > 0 && st !== 'done' ? '<div style="height:5px;background:var(--line);border-radius:3px;margin:6px 0"><div style="height:100%;width:' + t.progress + '%;background:var(--acc);border-radius:3px"></div></div>' : '') +
    flowLine(t) +
    renderNotesAndWorkflow(t.notes) + ckRows(t) + doneNoteLine(t) +
    '<div class="meta" style="align-items:center;">' + prioChip(t) + metaAll + metaDep + groupChip(t) + metaD + metaMt + ckChip(t) + waBtn + '</div>' +
    '<div class="acts">' + actsHtml + ' ' + handoffBtn + '</div>' +
  '</div>';
}

function boardView() {
  const deps = typeof departmentsList === 'function' ? departmentsList() : [];
  let all = S.tasks.filter(t => (!S.meeting || t.meeting_id === S.meeting) && (!S.dept || same(memberDept(t.assignee_email), S.dept)) && (S.filter === 'all' || mine(t)));
  if (S.kpi && KPI_TEST[S.kpi]) all = all.filter(KPI_TEST[S.kpi]);
  
  const cols = Object.keys(ST).map(k => {
    const items = all.filter(t => eff(t) === k).sort(taskCmp);
    return '<div class="col ' + (S.col === k ? 'on' : '') + '" data-st="' + k + '">' +
      '<div class="ch"><span>' + ST[k] + '</span><i>' + items.length + '</i></div>' +
      (items.length ? items.map(card).join('') : '<div class="empty">لا يوجد مهام</div>') +
    '</div>';
  }).join('');
  
  let mtOpts = '<option value="">كل المشاريع/الاجتماعات</option>' + S.meetings.map(m => '<option value="' + m.id + '" ' + (S.meeting === m.id ? 'selected' : '') + '>' + esc(m.title) + '</option>').join('');
  let depOpts = '<option value="">كل الإدارات والأقسام</option>' + deps.map(d => '<option value="' + esc(d) + '" ' + (same(S.dept, d) ? 'selected' : '') + '>🏛️ ' + esc(d) + '</option>').join('');
  let adminBtn = '<button class="s" id="nmt" style="background:transparent;border-color:var(--mute)">+ قسم/اجتماع</button>';
  let cTabs = Object.keys(ST).map(k => '<button data-c="' + k + '" class="' + (S.col === k ? 'on' : '') + '">' + ST[k] + ' (' + all.filter(t => eff(t) === k).length + ')</button>').join('');

  return kpiHtml() +
  '<div class="tools">' +
    '<div class="seg"><button data-f="mine" class="' + (S.filter === 'mine' ? 'on' : '') + '">مهامي فقط</button><button data-f="all" class="' + (S.filter === 'all' ? 'on' : '') + '">كل الفريق</button></div>' +
    '<select id="fm" style="border-radius:6px">' + mtOpts + '</select>' +
    (deps.length ? '<select id="fdep" style="border-radius:6px">' + depOpts + '</select>' : '') +
    '<span class="sp"></span>' +
    adminBtn + '<button class="p s" id="nt">➕ إضافة مهمة</button>' +
  '</div>' +
  '<div class="ctabs">' + cTabs + '</div>' +
  '<div class="board">' + cols + '</div>';
}

function bindBoard() {
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.filter = b.dataset.f; render(); });
  document.querySelectorAll('[data-kpi]').forEach(b => b.onclick = () => { S.kpi = S.kpi === b.dataset.kpi ? '' : b.dataset.kpi; S.filter = 'mine'; render(); });
  if ($('kpi_x')) $('kpi_x').onclick = () => { S.kpi = ''; render(); };
  document.querySelectorAll('[data-ci]').forEach(c => c.onchange = () => ckToggle(c.dataset.ci, c.checked));
  document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { S.col = b.dataset.c; render(); });
  $('fm').onchange = e => { S.meeting = e.target.value; render(); };
  if ($('fdep')) $('fdep').onchange = e => { S.dept = e.target.value; render(); };
  $('nt').onclick = () => taskDialog(null);
  if ($('nmt')) $('nmt').onclick = () => { const t = prompt('اسم القسم/الاجتماع الجديد'); if (t && t.trim()) run(sb.from('meetings').insert({ title: t.trim() })); };
  
  document.querySelectorAll('[data-mv]').forEach(b => b.onclick = e => { e.stopPropagation(); moveTask(b.dataset.mv, b.dataset.to); });
  document.querySelectorAll('[data-hf]').forEach(b => { b.onclick = e => { e.stopPropagation(); handoffDialog(b.dataset.hf); }; });

  document.querySelectorAll('.tk').forEach(el => {
    el.onclick = e => { if (e.target.closest('.ckrows')) return; taskDialog(S.tasks.find(t => t.id === el.dataset.id)); };
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

async function moveTask(id, to, note) {
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
  if (to === 'done' && t.group_id && note === undefined) return askDone(t, n => moveTask(id, 'done', n));
  const snap = Object.assign({}, t), adv = to === 'done' && Array.isArray(t.flow) && (t.flow_step || 0) < t.flow.length - 1;
  if (adv) { const c = (t.flow_step || 0) + 1; t.flow_step = c; t.assignee_email = t.flow[c].email; t.status = 'todo'; } else t.status = to;
  const patch = { status: to }; if (to === 'done' && note) patch.done_note = note; else if (to !== 'done' && t.done_note) patch.done_note = null;
  if ('done_note' in patch) t.done_note = patch.done_note;
  render();
  const { error } = await sb.from('tasks').update(patch).eq('id', id);
  if (error) { Object.assign(t, snap); alert('خطأ: ' + error.message); load(); }
  else if (to === 'done') { notifyAdmins(t, adv ? 'أنهى مرحلته في «' + t.title + '»' : (note ? 'أنجز «' + t.title + '»: ' + note : null)); if (adv) { notifyNext(snap); load(); } }
}

function taskDialog(t, pre = {}) {
  const x = t || pre, edit = !!t;
  const asVal = x.for_all ? '__all' : (x.assignee_email || (S.me ? S.me.email : ''));
  const deps = typeof departmentsList === 'function' ? departmentsList() : [];
  
  let asOpts = '<option value="__all" ' + (asVal === '__all' ? 'selected' : '') + '>👥 مهمة جماعية للكل</option>' +
               '<option value="__multi">☑️ موظفون محددون (بالتشيك بوكس / القسم)</option>' +
               '<option value="" ' + (asVal === '' ? 'selected' : '') + '>غير مُسند</option>' +
               S.members.map(m => '<option value="' + esc(m.email) + '" ' + (same(m.email, asVal) ? 'selected' : '') + '>' + esc(m.name + (m.title ? ' — ' + m.title : '')) + '</option>').join('');
               
  let mtOpts = '<option value="">بدون ارتباط</option>' + S.meetings.map(m => '<option value="' + m.id + '" ' + (x.meeting_id === m.id ? 'selected' : '') + '>' + esc(m.title) + '</option>').join('');
  let stOpts = Object.entries(ST).map(([k, v]) => '<option value="' + k + '" ' + ((x.status || 'todo') === k ? 'selected' : '') + '>' + v + '</option>').join('');

  let dlBtn = edit && canDel(t) ? '<button class="dng s" id="f_dl" style="margin-inline-end:auto">حذف</button>' : '<span></span>';

  const empCheckboxes = S.members.map(m => {
    const dep = typeof memberDept === 'function' ? memberDept(m.email) : '';
    const sub = [dep ? '🏛️ ' + dep : '', m.title || ''].filter(Boolean).join(' · ');
    const isChecked = asVal === '__all' || same(m.email, asVal);
    return '<label class="emp-chk"><input type="checkbox" class="f_emp_cb" value="' + esc(m.email) + '" data-dep="' + esc(dep) + '"' + (isChecked ? ' checked' : '') + '><div><b>' + esc(m.name) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div></label>';
  }).join('');

  const depQuickBtns = deps.length ? '<div class="dep-picks"><span class="m" style="font-size:12px">🏛️ تحديد قسم كامل:</span>' +
    deps.map(d => '<button type="button" class="s dep-btn" data-dep-pick="' + esc(d) + '">🏛️ ' + esc(d) + '</button>').join('') + '</div>' : '';

  dlg.innerHTML = '<h2>' + (edit ? 'تعديل المهمة' : 'مهمة جديدة') + '</h2>' +
  '<label>العنوان<input id="f_ti" value="' + esc(x.title || '') + '" placeholder="ما هو المطلوب إنجازه؟"></label>' +
  '<label>تفاصيل وروابط (اختياري)<textarea id="f_no" rows="3">' + esc(x.notes || '') + '</textarea></label>' +
  '<div class="row">' +
    '<label>المسؤول الأول عن التنفيذ<select id="f_as">' + asOpts + '</select></label>' +
    '<label>تاريخ الاستحقاق<input id="f_du" type="date" value="' + esc(x.due_on || '') + '"></label>' +
  '</div>' +
  (!edit ? '<div class="multi-emp-box" id="f_multi_box">' +
    '<div class="bar" style="margin-bottom:8px;flex-wrap:wrap;gap:6px">' +
      '<label class="chk" style="margin:0"><input type="checkbox" id="f_chk_all"' + (asVal === '__all' ? ' checked' : '') + '> <b>تحديد جميع الموظفين (الكل)</b></label>' +
      '<span class="m" id="f_chk_cnt" style="font-size:12.5px"></span>' +
    '</div>' +
    depQuickBtns +
    '<div class="emp-chk-grid">' + empCheckboxes + '</div>' +
  '</div>' : '') +
  '<div class="row" style="margin-top:10px">' +
    '<label>الارتباط (قسم/مشروع)<select id="f_mt">' + mtOpts + '</select></label>' +
    '<label id="f_stw">الحالة<select id="f_st">' + stOpts + '</select></label>' +
    '<label>الأولوية<select id="f_pr">' + prioOptions(prioOf(x)) + '</select></label>' +
  '</div>' +
  '<label id="f_dnw" style="display:none;margin-top:10px">ما الذي أُنجز؟ (يظهر في التقارير)<textarea id="f_dn" rows="2">' + esc(x.done_note || '') + '</textarea></label>' +
  '<div id="ck_box" style="margin-top:14px"></div>' +
  '<div id="fw_box" style="margin-top:14px"></div>' +
  '<p class="m" id="f_hint" style="margin:12px 0 0;padding:10px;background:var(--accsoft);color:var(--acc);border-radius:8px">ℹ️ <b>مهمة جماعية / متعددة الموظفين:</b> تُنشأ نسخة مستقلة لكل موظف محدّد؛ يكمل كلٌّ نسخته ويكتب ما أنجزه، وتظهر نتائج الجميع في التقارير.</p>' +
  '<div class="row dact">' + dlBtn + '<button id="f_cx" class="s">إلغاء</button><button class="p s" id="f_sv">حفظ</button></div>';
  
  if (edit && t.group_id) {
    const g = groupOf(t), dn = g.filter(x => x.status === 'done');
    $('f_hint').insertAdjacentHTML('afterend', '<div class="grp-box">👥 <b>هذه نسختك من مهمة جماعية</b> — أنجز ' + dn.length + ' من ' + g.length + '<div class="m" style="margin-top:4px">' + g.map(x => (x.status === 'done' ? '✓ ' : '○ ') + esc(nm(x.assignee_email))).join(' · ') + '</div>' +
      (canDel(t) ? '<label class="chk" style="margin-top:8px"><input type="checkbox" id="f_ga"> طبّق العنوان والتفاصيل والموعد والأولوية على نسخ الجميع</label><button class="dng s" type="button" id="f_dla" style="margin-top:8px">حذف المهمة للجميع</button>' : '') + '</div>');
    if ($('f_dla')) $('f_dla').onclick = () => { if (confirm('سيُحذف ' + g.length + ' نسخ لهذه المهمة عند الجميع. متأكد؟')) { dlg.close(); run(sb.from('tasks').delete().eq('group_id', t.group_id)); } };
  }
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

  const getCheckedEmails = () => [...dlg.querySelectorAll('.f_emp_cb:checked')].map(c => c.value);
  const updateChkCounter = () => {
    if (!$('f_chk_cnt')) return;
    const n = getCheckedEmails().length;
    $('f_chk_cnt').textContent = 'المحدد: ' + n + ' من ' + S.members.length + ' موظف';
    if ($('f_chk_all')) $('f_chk_all').checked = S.members.length > 0 && n === S.members.length;
  };

  const sync = () => {
    const v = $('f_as').value;
    const isGroup = v === '__all' || v === '__multi';
    $('f_stw').style.display = isGroup ? 'none' : '';
    $('f_hint').style.display = isGroup ? '' : 'none';
    $('fw_box').style.display = isGroup ? 'none' : '';
    $('ck_box').style.display = isGroup && edit ? 'none' : '';
    $('f_dnw').style.display = !isGroup && $('f_st').value === 'done' ? '' : 'none';
    updateChkCounter();
  };

  const syncFromCheckboxes = () => {
    const chk = getCheckedEmails();
    if (chk.length === S.members.length && S.members.length > 1) $('f_as').value = '__all';
    else if (chk.length > 1) $('f_as').value = '__multi';
    else if (chk.length === 1) $('f_as').value = chk[0];
    else $('f_as').value = '';
    sync();
  };

  if (!edit) {
    if ($('f_chk_all')) {
      $('f_chk_all').onchange = () => {
        const on = $('f_chk_all').checked;
        dlg.querySelectorAll('.f_emp_cb').forEach(c => { c.checked = on; });
        syncFromCheckboxes();
      };
    }
    dlg.querySelectorAll('.f_emp_cb').forEach(c => { c.onchange = syncFromCheckboxes; });
    dlg.querySelectorAll('[data-dep-pick]').forEach(b => {
      b.onclick = () => {
        const dep = b.dataset.depPick;
        const cbs = [...dlg.querySelectorAll('.f_emp_cb')].filter(c => same(c.dataset.dep, dep));
        if (!cbs.length) return alert('لا يوجد موظفون مسجلون في «' + dep + '» حالياً. يمكنك ربط الموظفين بالأقسام من الإعدادات.');
        const allDepChecked = cbs.every(c => c.checked);
        dlg.querySelectorAll('.f_emp_cb').forEach(c => { c.checked = same(c.dataset.dep, dep) ? !allDepChecked : false; });
        syncFromCheckboxes();
      };
    });
  }

  $('f_st').onchange = sync;
  $('f_as').onchange = () => {
    if (!edit) {
      const v = $('f_as').value;
      if (v === '__all') dlg.querySelectorAll('.f_emp_cb').forEach(c => { c.checked = true; });
      else if (v === '') dlg.querySelectorAll('.f_emp_cb').forEach(c => { c.checked = false; });
      else if (v !== '__multi') dlg.querySelectorAll('.f_emp_cb').forEach(c => { c.checked = same(c.value, v); });
    }
    sync();
  };
  sync();
  $('f_cx').onclick = () => dlg.close();
  $('f_sv').onclick = async () => {
    const title = $('f_ti').value.trim(); if (!title) return $('f_ti').focus();
    const v = $('f_as').value;
    const all = v === '__all';
    const chkEmails = !edit ? getCheckedEmails() : [];
    const isMulti = !edit && (all || v === '__multi' || chkEmails.length > 1);
    const assignee = isMulti ? null : (v === '__multi' ? (chkEmails[0] || '') : v);
    const row = { title, notes: $('f_no').value.trim() || null, for_all: all, assignee_email: isMulti ? null : (assignee || null), due_on: $('f_du').value || null, meeting_id: $('f_mt').value || null, priority: $('f_pr').value, status: isMulti ? 'todo' : $('f_st').value };
    if (!edit) { row.created_by = S.me.email; row.id = crypto.randomUUID(); } else row.progress = +$('f_pg').value;
    let flow = !isMulti && fw.length >= 2 ? fw.map(z => ({ email: z.email, note: (z.note || '').trim() })) : null;
    if (flow) { flow[cur].email = assignee || flow[cur].email; flow = flow.filter(z => z.email); if (flow.length < 2) flow = null; }
    if (flow || (edit && t.flow)) row.flow = flow;
    if (flow && (!edit || !t.flow)) row.flow_step = 0;
    
    $('f_sv').disabled = true; $('f_sv').textContent = '...';
    row.done_note = row.status === 'done' ? ($('f_dn').value.trim() || null) : null;
    let gmap = null, error;
    if (!edit && isMulti) {            // مهمة جماعية (للكل أو لمجموعة موظفين محددين بالتشيك بوكس / القسم)
      const gid = crypto.randomUUID(); delete row.done_note;
      const targetMembers = all ? S.members : S.members.filter(m => chkEmails.some(e => same(e, m.email)));
      const uniq = []; targetMembers.forEach(m => { if (!uniq.some(u => same(u.email, m.email))) uniq.push(m); });
      const rows = uniq.map(m => Object.assign({}, row, { id: crypto.randomUUID(), for_all: false, assignee_email: m.email, group_id: gid, status: 'todo' }));
      ({ error } = await sb.from('tasks').insert(rows));
      if (!error) { await Promise.all(rows.map(r => ck.flush(r.id))); gmap = {}; rows.forEach(r => { gmap[String(r.assignee_email).toLowerCase()] = r.id; }); }
    } else {
      ({ error } = edit ? await sb.from('tasks').update(row).eq('id', t.id) : await sb.from('tasks').insert(row));
      if (!error && !edit && !isMulti) await ck.flush(row.id);
      if (!error && edit && t.group_id && $('f_ga') && $('f_ga').checked) await sb.from('tasks').update({ title: row.title, notes: row.notes, due_on: row.due_on, priority: row.priority, meeting_id: row.meeting_id }).eq('group_id', t.group_id);
    }
    if (error) { alert('خطأ: ' + error.message); $('f_sv').disabled = false; $('f_sv').textContent = 'حفظ'; return; }
    
    if (edit && !isMulti && row.status === 'done' && t.status !== 'done') {
      const fl = row.flow !== undefined ? row.flow : t.flow, adv = Array.isArray(fl) && (t.flow_step || 0) < fl.length - 1;
      notifyAdmins(t, adv ? 'أنهى مرحلته في «' + t.title + '»' : null); if (adv) notifyNext(Object.assign({}, t, { flow: fl }));
    }
    // إرسال إشعار فوري عند الإضافة (ليست تعديلاً)
    if (!edit) {
      if (all) {
        apiPost('/api/notify', JSON.stringify({ title: row.title, assignee_email: null, for_all: true, sender_name: S.me.name, task_map: gmap || undefined, priority: row.priority })).catch(e => console.error(e));
      } else if (isMulti && gmap) {
        Object.entries(gmap).forEach(([em, tid]) => {
          apiPost('/api/notify', JSON.stringify({ title: row.title, assignee_email: em, for_all: false, sender_name: S.me.name, task_id: tid, priority: row.priority })).catch(() => {});
        });
      } else if (assignee) {
        apiPost('/api/notify', JSON.stringify({ title: row.title, assignee_email: row.assignee_email, for_all: false, sender_name: S.me.name, task_id: row.id, priority: row.priority })).catch(e => console.error(e));
      }
    }

    dlg.close(); load();
  };
  if (edit && canDel(t)) $('f_dl').onclick = () => { if (confirm('هل أنت متأكد من حذف المهمة؟')) { dlg.close(); run(sb.from('tasks').delete().eq('id', t.id)); } };
  dlg.showModal(); if (!edit) $('f_ti').focus();
}
// حماية العمل غير المحفوظ: لا يُغلق الإطار بالضغط خارجه أو بزر Esc إن كتبتَ فيه شيئاً
dlg._dirty = false;
dlg.addEventListener('input', () => { dlg._dirty = true; });
dlg.addEventListener('change', () => { dlg._dirty = true; });
dlg.addEventListener('close', () => { dlg._dirty = false; });
dlg.addEventListener('cancel', e => { if (dlg._dirty && !confirm('لديك تعديلات غير محفوظة. هل تريد تجاهلها؟')) e.preventDefault(); });
dlg.addEventListener('click', e => {
  if (e.target !== dlg) return;
  if (dlg._dirty) { dlg.classList.add('shake'); setTimeout(() => dlg.classList.remove('shake'), 400); return; }
  dlg.close();
});
const _showModal = HTMLDialogElement.prototype.showModal;
dlg.showModal = function () { dlg._dirty = false; if (!dlg.open) _showModal.call(dlg); };
