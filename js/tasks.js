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
        } else if (!/^\[شركة:\s*[^\]]+\]$/.test(l.trim())) {
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
  if (t.due_on < today()) {
    const ld = Math.max(1, Math.round((new Date(today()) - new Date(t.due_on)) / 864e5));
    return { c: 'late', t: '⚠️ متأخرة منذ ' + ld + (ld === 1 ? ' يوم' : ld === 2 ? ' يومين' : ld <= 10 ? ' أيام' : ' يوماً') + ' (' + t.due_on + ')' };
  }
  const d = daysTo(t.due_on);
  return d <= 1 ? { c: 'soon', t: d ? '⏱️ غداً' : '🔥 اليوم' } : { c: '', t: '📅 ' + t.due_on };
}

function taskDelayMeta(t) {
  const st = eff(t);
  const td = today();
  const isLate = st !== 'done' && t.due_on && t.due_on < td;
  const lateDays = isLate ? Math.max(1, Math.round((new Date(td) - new Date(t.due_on)) / 864e5)) : 0;
  const remDays = (!isLate && st !== 'done' && t.due_on) ? daysTo(t.due_on) : null;
  const ck = (S.itemStats || {})[t.id];
  const ckTxt = ck && ck[1] ? (' · البنود الفرعية: ' + ck[0] + '/' + ck[1]) : '';
  const pgTxt = (t.progress > 0 && st !== 'done') ? (' · نسبة الإنجاز: ' + t.progress + '%') : '';
  const wfStep = (Array.isArray(t.flow) && t.flow.length > 1) ? (' · المسار: المرحلة ' + ((t.flow_step || 0) + 1) + ' من ' + t.flow.length) : '';
  const stageName = st === 'doing' ? 'قيد العمل (جاري التنفيذ)' : st === 'todo' ? 'للتنفيذ (لم يبدأ العمل عليها)' : 'منجزة';
  let level = 'normal';
  if (lateDays > 3) level = 'critical';
  else if (lateDays >= 1) level = 'late';
  else if (remDays === 0) level = 'today';
  else if (remDays === 1) level = 'soon';
  return { st, isLate, lateDays, remDays, level, stageName, ckTxt, pgTxt, wfStep };
}

function buildTaskWaSingleMsg(t, tone = 'auto') {
  const empName = t.assignee_email ? nm(t.assignee_email) : 'الزميل العزيز';
  const coName = typeof taskCompany === 'function' ? taskCompany(t) : 'متجرك';
  const prof = typeof getCompanyProfile === 'function' ? getCompanyProfile(coName) : { displayName: coName };
  const stTitle = prof.displayName || coName;
  const m = taskDelayMeta(t);
  const pr = prioOf(t) === 'urgent' ? '🔴 عاجل جداً' : prioOf(t) === 'important' ? '🟠 مهم' : '';
  const mt = (S.meetings || []).find(x => x.id === t.meeting_id);

  let header = '';
  let actionLine = '';
  const effTone = tone === 'auto' ? m.level : tone;

  if (effTone === 'critical' || effTone === 'urgent') {
    header = '🚨 *متابعة عاجلة جداً — ' + stTitle + '*\nمرحباً أ. *' + empName + '*،';
    actionLine = m.st === 'todo'
      ? '⚠️ نلاحظ أن هذه المهمة *متأخرة منذ ' + m.lateDays + ' أيام* ولا تزال في مرحلة *«للتنفيذ» (لم يبدأ العمل عليها بعد)*. نرجو البدء الفوري بها اليوم أو إفادتنا بالعائق.'
      : '⚠️ هذه المهمة في مرحلة *«قيد العمل»* لكنها *تجاوزت موعد التسليم بـ ' + m.lateDays + ' أيام*. نرجو استكمال ما تبقى منها وإغلاقها بشكل عاجل اليوم.';
  } else if (effTone === 'late') {
    header = '⏰ *تذكير بمهمة متأخرة — ' + stTitle + '*\nمرحباً أ. *' + empName + '* 🌹';
    actionLine = m.st === 'todo'
      ? '📌 المهمة متأخرة عن موعدها بـ *' + m.lateDays + (m.lateDays === 1 ? ' يوم' : m.lateDays === 2 ? ' يومين' : ' أيام') + '* وما زالت في قائمة *«للتنفيذ»*. نأمل تحريكها إلى «قيد العمل» والبدء بإنجازها.'
      : '⏳ المهمة حالياً *«قيد العمل»* وقد مضى على موعدها *' + m.lateDays + (m.lateDays === 1 ? ' يوم' : m.lateDays === 2 ? ' يومين' : ' أيام') + '*. نأمل استكمالها واعتماد الإنجاز في أقرب وقت.';
  } else if (effTone === 'today' || effTone === 'soon') {
    header = '🔥 *تذكير بموعد تسليم مهم — ' + stTitle + '*\nمرحباً أ. *' + empName + '* 👋';
    actionLine = m.st === 'todo'
      ? '📌 موعد تسليم هذه المهمة *' + (m.remDays === 0 ? 'اليوم' : 'غداً') + '* وهي لا تزال في مرحلة *«للتنفيذ»*. نرجو المباشرة فيها لتفادي التأخير.'
      : '💪 المهمة *«قيد العمل»* وموعد تسليمها *' + (m.remDays === 0 ? 'اليوم' : 'غداً') + '*. شد الهمة لإتمامها في موعدها المحدد.';
  } else if (effTone === 'friendly') {
    header = '🌟 *متابعة ودّية لسير المهام — ' + stTitle + '*\nيعطيك العافية أ. *' + empName + '* 🌹';
    actionLine = m.st === 'todo'
      ? 'نود تذكيرك بهذه المهمة المدرجة في قائمة *«للتنفيذ»* لديك، ونثقن حرصك على البدء بها وإنجازها بأفضل صورة. 🚀'
      : 'شكراً لجهودك في هذه المهمة الجاري تنفيذها (*«قيد العمل»*)، نرجو إشعارنا فور اكتمالها. 🌟';
  } else {
    header = '📋 *متابعة رسمية للمهام — ' + stTitle + '*\nتحية طيبة أ. *' + empName + '*،';
    actionLine = m.st === 'todo'
      ? 'نرجو التكرم بمباشرة التنفيذ وتحديث حالة المهمة على المنصة.'
      : 'نرجو التكرم باستكمال التنفيذ وتحديث نسبة الإنجاز أو إغلاق المهمة عند الانتهاء.';
  }

  return [
    header,
    '━━━━━━━━━━━━━━',
    '📌 *المهمة:* ' + t.title,
    '🔄 *المرحلة الحالية:* ' + m.stageName + m.pgTxt + m.ckTxt + m.wfStep,
    pr ? '⚡ *الأولوية:* ' + pr : '',
    mt ? '🏛️ *المشروع / الاجتماع:* ' + mt.title : '',
    t.due_on ? ('📅 *تاريخ الاستحقاق:* ' + t.due_on + (m.isLate ? ' (🚨 متأخرة منذ ' + m.lateDays + ' يوم)' : m.remDays === 0 ? ' (🔥 اليوم)' : m.remDays === 1 ? ' (⏱️ غداً)' : '')) : '',
    '━━━━━━━━━━━━━━',
    actionLine
  ].filter(Boolean).join('\n');
}

function buildEmployeeBatchWaMsg(email, taskList, tone = 'auto') {
  const empName = email ? nm(email) : 'الزميل العزيز';
  const empDep = email && typeof memberDept === 'function' ? memberDept(email) : '';
  const coName = email && typeof memberCompany === 'function' ? memberCompany(email) : (activeCompanyFilter() || 'متجرك');
  const prof = typeof getCompanyProfile === 'function' ? getCompanyProfile(coName) : { displayName: coName };
  const stTitle = prof.displayName || coName;

  if (!taskList || !taskList.length) {
    return 'مرحباً أ. *' + empName + '* 🌹\nلا توجد مهام متأخرة أو معلّقة حالياً في قائمتك. شكراً لالتزامك وجهودك المميزة! 👏';
  }

  const enriched = taskList.map(t => ({ t, m: taskDelayMeta(t) }));
  const lateItems = enriched.filter(x => x.m.isLate);
  const maxLate = lateItems.reduce((mx, x) => Math.max(mx, x.m.lateDays), 0);
  const todoItems = enriched.filter(x => x.m.st === 'todo');
  const doingItems = enriched.filter(x => x.m.st === 'doing');

  const effTone = tone === 'auto' ? (maxLate > 3 ? 'urgent' : lateItems.length > 0 ? 'late' : 'normal') : tone;

  let intro = '';
  let outro = '';
  if (effTone === 'urgent') {
    intro = '🚨 *تذكير عاجل بالمهام المتأخرة — ' + stTitle + '*\nمرحباً أ. *' + empName + '*' + (empDep ? ' (' + empDep + ')' : '') + '،\nيوجد لديك *(' + taskList.length + ') مهام* تحتاج تدخلاً عاجلاً (منها ' + lateItems.length + ' متأخرة وصلت مدة تأخرها إلى ' + maxLate + ' أيام):';
    outro = '⚠️ *المطلوب عاجلاً:*\n' +
      (todoItems.length ? '1️⃣ البدء فوراً بالمهام المتوقفة في مرحلة *«للتنفيذ»* (' + todoItems.length + ' مهام لم يبدأ العمل عليها).\n' : '') +
      (doingItems.length ? (todoItems.length ? '2️⃣ ' : '1️⃣ ') + 'استكمال وإغلاق المهام المفتوحة في مرحلة *«قيد العمل»* (' + doingItems.length + ' مهام).\n' : '') +
      'نرجو تحديث حالة الإنجاز على المنصة اليوم أو إفادتنا بأي عائق. ⏳';
  } else if (effTone === 'late') {
    intro = '⏰ *ملخص متابعة المهام المتأخرة والمستحقة — ' + stTitle + '*\nمرحباً أ. *' + empName + '*' + (empDep ? ' (' + empDep + ')' : '') + ' 🌹\nنود تذكيرك بقائمة المهام المسندة إليك لمتابعة إنجازها حسب مراحلها الحالية:';
    outro = '📌 نأمل تحريك مهام *«للتنفيذ»* واستكمال مهام *«قيد العمل»* وتحديث حالتها على المنصة في أقرب وقت. شاكرين تعاونك! 🚀';
  } else if (effTone === 'friendly') {
    intro = '🌟 *متابعة ودّية لمهامك الحالية — ' + stTitle + '*\nيعطيك العافية أ. *' + empName + '*' + (empDep ? ' (' + empDep + ')' : '') + ' 🌹\nهذا ملخص سريع للمهام المسندة إليك حالياً (' + taskList.length + ' مهام):';
    outro = '💪 نثق بهمتك العالية في إنجازها بالوقت المحدد، ولا تتردد في إبلاغنا إن احتجت أي دعم! 🌟';
  } else {
    intro = '📋 *كشف متابعة المهام المسندة — ' + stTitle + '*\nتحية طيبة أ. *' + empName + '*' + (empDep ? ' (' + empDep + ')' : '') + '،\nمرفق لكم بيان بالمهام الحالية المسندة إليكم (' + taskList.length + ' مهام) موزعة حسب مرحلة التنفيذ:';
    outro = 'نرجو التكرم بمتابعة المهام المذكورة أعلاه وتحديث حالتها على المنصة أولاً بأول.';
  }

  const fmtItem = (x, idx) => {
    const t = x.t, m = x.m;
    const pr = prioOf(t) === 'urgent' ? ' [🔴 عاجل]' : prioOf(t) === 'important' ? ' [🟠 مهم]' : '';
    const delayBadge = m.isLate
      ? (' — 🚨 *متأخرة منذ ' + m.lateDays + (m.lateDays === 1 ? ' يوم' : m.lateDays === 2 ? ' يومين' : ' أيام') + '* (الموعد: ' + t.due_on + ')')
      : m.remDays === 0 ? ' — 🔥 *مستحقة اليوم*'
      : m.remDays === 1 ? ' — ⏱️ *مستحقة غداً*'
      : t.due_on ? (' — 📅 الموعد: ' + t.due_on) : '';
    const extra = [m.pgTxt ? m.pgTxt.replace(' · ', '') : '', m.ckTxt ? m.ckTxt.replace(' · ', '') : ''].filter(Boolean).join(' | ');
    return (idx + 1) + '. *' + t.title + '*' + pr + delayBadge + (extra ? '\n   ↳ _' + extra + '_' : '');
  };

  const sections = [];
  if (todoItems.length) {
    sections.push('📌 *أولاً: مرحلة «للتنفيذ» — لم يبدأ العمل عليها (' + todoItems.length + '):*\n' + todoItems.map(fmtItem).join('\n'));
  }
  if (doingItems.length) {
    sections.push('⏳ *' + (todoItems.length ? 'ثانياً' : 'أولاً') + ': مرحلة «قيد العمل» — جاري التنفيذ (' + doingItems.length + '):*\n' + doingItems.map(fmtItem).join('\n'));
  }

  return [
    intro,
    '━━━━━━━━━━━━━━',
    sections.join('\n\n'),
    '━━━━━━━━━━━━━━',
    outro
  ].filter(Boolean).join('\n');
}

function waRemindDialog(preEmail = '', preScope = 'late', singleTaskId = '') {
  const singleTask = singleTaskId ? (S.tasks || []).find(t => t.id === singleTaskId) : null;
  if (singleTask && !preEmail) preEmail = singleTask.assignee_email || '';

  const allStaff = (S.members || []).filter(m => m.role !== 'rep');
  const openTasksOf = em => (S.tasks || []).filter(t => !t.for_all && same(t.assignee_email, em) && eff(t) !== 'done').sort(taskCmp);
  const lateTasksOf = em => openTasksOf(em).filter(t => t.due_on && t.due_on < today());

  // ترتيب الموظفين: الأكثر تأخراً أولاً ثم الأكثر مهام مفتوحة
  const staffStats = allStaff.map(m => {
    const op = openTasksOf(m.email), lt = lateTasksOf(m.email);
    const todoN = op.filter(t => eff(t) === 'todo').length;
    const doingN = op.filter(t => eff(t) === 'doing').length;
    return { m, open: op, late: lt, todoN, doingN };
  }).sort((a, b) => b.late.length - a.late.length || b.open.length - a.open.length);

  let curEmail = preEmail || (staffStats.find(x => x.late.length > 0)?.m.email) || (staffStats.find(x => x.open.length > 0)?.m.email) || (allStaff[0]?.email || '');
  let curScope = singleTask ? 'single' : (preScope || (lateTasksOf(curEmail).length ? 'late' : 'all_open'));
  let curTone = 'auto';

  const getFilteredTasks = (em, scope) => {
    if (scope === 'single' && singleTask && same(singleTask.assignee_email, em)) return [singleTask];
    const op = openTasksOf(em);
    if (scope === 'late') return op.filter(t => t.due_on && t.due_on < today());
    if (scope === 'urgent') return op.filter(t => t.due_on && (t.due_on < today() || daysTo(t.due_on) <= 1));
    if (scope === 'todo_only') return op.filter(t => eff(t) === 'todo');
    if (scope === 'doing_only') return op.filter(t => eff(t) === 'doing');
    return op;
  };

  const drawModal = () => {
    const empObj = allStaff.find(m => same(m.email, curEmail));
    const empPh = memberPhone(curEmail);
    const candTasks = getFilteredTasks(curEmail, curScope);
    const withLate = staffStats.filter(x => x.late.length > 0 || x.open.length > 0);

    const empQuickBar = withLate.length ? (
      '<div class="wa-emp-strip">' +
        withLate.map(x => {
          const on = same(x.m.email, curEmail);
          return '<button type="button" class="wa-emp-pill' + (on ? ' on' : '') + '" data-wa-emp="' + esc(x.m.email) + '">' +
            '<b>👤 ' + esc(x.m.name) + '</b>' +
            '<span class="wa-emp-badges">' +
              (x.late.length ? '<i class="b-late">🚨 ' + x.late.length + ' متأخرة</i>' : '') +
              '<i class="b-open">📂 ' + x.open.length + ' مفتوحة</i>' +
            '</span>' +
          '</button>';
        }).join('') +
      '</div>'
    ) : '';

    dlg.innerHTML = '<h2>📲 مركز رسائل التذكير الذكية عبر واتساب (حسب المرحلة والتأخير / دفعة واحدة)</h2>' +
      '<p class="m" style="margin-bottom:10px">اختر الموظف لإرسال <b>جميع مهامه المتأخرة أو المفتوحة في رسالة واحدة مجمّعة (دفعة واحدة)</b>، مع تخصيص الصياغة تلقائياً حسب المرحلة (للتنفيذ / قيد العمل) ومدة التأخير:</p>' +
      empQuickBar +
      '<div class="row" style="margin-top:8px;gap:8px">' +
        '<label style="flex:1.3 1 180px">👤 الموظف المحدد<select id="wr_emp">' +
          allStaff.map(m => {
            const lt = lateTasksOf(m.email).length, op = openTasksOf(m.email).length;
            return '<option value="' + esc(m.email) + '"' + (same(m.email, curEmail) ? ' selected' : '') + '>👤 ' + esc(m.name) + ' (' + (lt ? '🚨 ' + lt + ' متأخرة · ' : '') + op + ' مفتوحة)</option>';
          }).join('') +
        '</select></label>' +
        '<label style="flex:1 1 160px">📱 رقم واتساب الموظف<div class="row s" style="gap:4px"><input id="wr_ph" dir="ltr" inputmode="tel" value="' + esc(empPh) + '" placeholder="77xxxxxxx" style="flex:1"><button type="button" class="s" id="wr_sv_ph" title="حفظ رقم واتساب الموظف">💾 حفظ</button></div></label>' +
      '</div>' +
      '<div class="row" style="margin-top:8px;gap:8px">' +
        '<label style="flex:1 1 180px">🎯 نطاق المهام (الدفعة الواحدة)<select id="wr_scope">' +
          (singleTask && same(singleTask.assignee_email, curEmail) ? '<option value="single"' + (curScope === 'single' ? ' selected' : '') + '>📌 المهمة المحددة فقط: ' + esc(singleTask.title.slice(0, 32)) + '</option>' : '') +
          '<option value="late"' + (curScope === 'late' ? ' selected' : '') + '>⚠️ المهام المتأخرة فقط (' + lateTasksOf(curEmail).length + ')</option>' +
          '<option value="urgent"' + (curScope === 'urgent' ? ' selected' : '') + '>🔥 المتأخرة + المستحقة اليوم/غداً</option>' +
          '<option value="todo_only"' + (curScope === 'todo_only' ? ' selected' : '') + '>📌 مرحلة «للتنفيذ» فقط (لم تبدأ)</option>' +
          '<option value="doing_only"' + (curScope === 'doing_only' ? ' selected' : '') + '>⏳ مرحلة «قيد العمل» فقط (جاري التنفيذ)</option>' +
          '<option value="all_open"' + (curScope === 'all_open' ? ' selected' : '') + '>📂 كل المهام المفتوحة للموظف دفعة واحدة (' + openTasksOf(curEmail).length + ')</option>' +
        '</select></label>' +
        '<label style="flex:1 1 180px">✍️ صيغة وأسلوب الرسالة<select id="wr_tone">' +
          '<option value="auto"' + (curTone === 'auto' ? ' selected' : '') + '>🤖 ذكية تلقائية (حسب المرحلة ومدة التأخير)</option>' +
          '<option value="urgent"' + (curTone === 'urgent' ? ' selected' : '') + '>🚨 حازمة وعاجلة (للمتأخرات الحرجة)</option>' +
          '<option value="late"' + (curTone === 'late' ? ' selected' : '') + '>⏰ تذكير بمتابعة التأخير</option>' +
          '<option value="friendly"' + (curTone === 'friendly' ? ' selected' : '') + '>🤝 تحفيزية وودّية</option>' +
          '<option value="formal"' + (curTone === 'formal' ? ' selected' : '') + '>📋 رسمية ومفصّلة</option>' +
        '</select></label>' +
      '</div>' +
      '<div class="wa-task-pick-box" style="margin-top:10px">' +
        '<div class="bar" style="margin-bottom:6px"><b style="font-size:13px">☑️ المهام المضمّنة في الدفعة (' + candTasks.length + '):</b><span class="m" style="font-size:12px">يمكنك استثناء أو إضافة أي مهمة من القائمة</span></div>' +
        (candTasks.length ? '<div class="wa-task-list">' + candTasks.map(t => {
          const m = taskDelayMeta(t);
          const badge = m.isLate ? '<span class="chip late">متأخرة ' + m.lateDays + ' يوم</span>' : m.remDays === 0 ? '<span class="chip soon">🔥 اليوم</span>' : '<span class="chip">' + esc(t.due_on || 'بدون موعد') + '</span>';
          const stChip = m.st === 'doing' ? '<span class="chip all">⏳ قيد العمل' + (t.progress ? ' ' + t.progress + '%' : '') + '</span>' : '<span class="chip">📌 للتنفيذ</span>';
          return '<label class="wa-tk-item"><input type="checkbox" class="wr_tk_cb" value="' + t.id + '" checked><div style="flex:1"><b>' + esc(t.title) + '</b><div class="row s" style="gap:4px;margin-top:2px">' + stChip + badge + '</div></div></label>';
        }).join('') + '</div>' : '<div class="m" style="padding:8px;text-align:center">لا توجد مهام في هذا النطاق لهذا الموظف — غيّر النطاق إلى «كل المهام المفتوحة» لعرض مهامه.</div>') +
      '</div>' +
      '<label style="margin-top:10px">📝 معاينة وتعديل رسالة الواتساب قبل الإرسال:<textarea id="wr_msg" rows="9" style="font-family:inherit;line-height:1.65"></textarea></label>' +
      '<div class="row dact" style="margin-top:12px;flex-wrap:wrap">' +
        '<button type="button" class="s" id="wr_cp">📋 نسخ الرسالة</button>' +
        '<button type="button" class="s" id="wr_push" title="إرسال تنبيه داخلي أيضاً لجوال الموظف عبر التطبيق">🔔 تنبيه داخلي بالتطبيق</button>' +
        '<button type="button" class="p s" id="wr_send" style="background:#128c7e;border-color:#128c7e;color:#fff">📲 إرسال الدفعة عبر واتساب لـ «' + esc(empObj ? empObj.name : '') + '»</button>' +
        '<button type="button" class="s" id="wr_x">إغلاق</button>' +
      '</div>';

    const rebuildText = () => {
      const checkedIds = [...dlg.querySelectorAll('.wr_tk_cb:checked')].map(c => c.value);
      const chosen = candTasks.filter(t => checkedIds.includes(t.id));
      if (chosen.length === 1 && curScope === 'single') {
        $('wr_msg').value = buildTaskWaSingleMsg(chosen[0], curTone);
      } else if (chosen.length === 1) {
        $('wr_msg').value = buildTaskWaSingleMsg(chosen[0], curTone);
      } else {
        $('wr_msg').value = buildEmployeeBatchWaMsg(curEmail, chosen, curTone);
      }
    };
    rebuildText();

    dlg.querySelectorAll('[data-wa-emp]').forEach(b => {
      b.onclick = () => {
        curEmail = b.dataset.waEmp;
        if (curScope === 'single') curScope = lateTasksOf(curEmail).length ? 'late' : 'all_open';
        else if (curScope === 'late' && !lateTasksOf(curEmail).length) curScope = 'all_open';
        drawModal();
      };
    });
    $('wr_emp').onchange = e => {
      curEmail = e.target.value;
      if (curScope === 'single') curScope = lateTasksOf(curEmail).length ? 'late' : 'all_open';
      else if (curScope === 'late' && !lateTasksOf(curEmail).length) curScope = 'all_open';
      drawModal();
    };
    $('wr_scope').onchange = e => { curScope = e.target.value; drawModal(); };
    $('wr_tone').onchange = e => { curTone = e.target.value; rebuildText(); };
    dlg.querySelectorAll('.wr_tk_cb').forEach(cb => { cb.onchange = rebuildText; });

    $('wr_sv_ph').onclick = async () => {
      const newPh = $('wr_ph').value.trim();
      const m = (S.rawMembers || S.allMembers || S.members || []).find(x => same(x.email, curEmail));
      if (!m) return;
      const meta = parseMemberMeta(m);
      const isMeSuper = S.me && same(curEmail, S.me.email) && m.role === 'admin';
      const coVal = isMeSuper ? '' : (meta.company || 'متجرك');
      const tgStr = encodeMemberMeta(coVal, meta.department, newPh);
      $('wr_sv_ph').disabled = true; $('wr_sv_ph').textContent = '...';
      let { error } = await sb.from('members').update({ phone: newPh || null, telegram_chat_id: tgStr }).eq('email', curEmail);
      if (error) {
        ({ error } = await sb.from('members').update({ telegram_chat_id: tgStr }).eq('email', curEmail));
      }
      $('wr_sv_ph').disabled = false;
      if (error) return alert('تعذّر حفظ الرقم: ' + error.message);
      m.phone = newPh; m.telegram_chat_id = tgStr;
      toast('تم حفظ رقم واتساب الموظف بنجاح ✅');
      $('wr_sv_ph').textContent = '✓ حُفظ';
    };

    $('wr_cp').onclick = async () => {
      try { await navigator.clipboard.writeText($('wr_msg').value); $('wr_cp').textContent = 'تم النسخ ✓'; toast('تم نسخ رسالة التذكير للحافظة 📋'); }
      catch (e) { alert('تعذّر النسخ'); }
    };

    $('wr_push').onclick = async () => {
      const txt = $('wr_msg').value.trim();
      if (!txt || !curEmail) return;
      $('wr_push').disabled = true; $('wr_push').textContent = 'جارٍ الإرسال...';
      try {
        const rr = await apiPost('/api/notify', JSON.stringify({ title: '⏰ تذكير بمهامك المتأخرة والمفتوحة', body: txt.slice(0, 500), assignee_email: curEmail, for_all: false, is_custom: true }));
        if (rr.ok) { toast('تم إرسال التنبيه الداخلي للموظف بنجاح 🔔'); $('wr_push').textContent = 'تم الإرسال 🔔'; }
        else { alert('تعذّر الإرسال'); $('wr_push').textContent = '🔔 تنبيه داخلي بالتطبيق'; }
      } catch (e) { $('wr_push').textContent = '🔔 تنبيه داخلي بالتطبيق'; }
      $('wr_push').disabled = false;
    };

    $('wr_send').onclick = () => {
      const rawPh = $('wr_ph').value.trim();
      const intlPh = rawPh && typeof waPhone === 'function' ? waPhone(rawPh) : rawPh.replace(/\D/g, '');
      const url = 'https://wa.me/' + (intlPh || '') + '?text=' + encodeURIComponent($('wr_msg').value);
      window.open(url, '_blank');
    };

    $('wr_x').onclick = () => dlg.close();
  };

  drawModal();
  dlg.showModal();
}

function card(t) {
  const st = eff(t), d = dueInfo(t), mt = S.meetings.find(m => m.id === t.meeting_id);
  const acts = (t.for_all ? ACT_ALL : ACT)[st];
  const dn = doneBy(t);
  
  let waBtn = '';
  if (!t.for_all && t.assignee_email && S.me) {
    waBtn = '<button type="button" class="wa-btn" data-wa-tk="' + t.id + '" title="تذكير ذكي عبر الواتساب (حسب المرحلة والتأخير أو دفعة واحدة)">💬</button>';
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

function addDays(dateStr, days) {
  const d = new Date((dateStr || today()) + 'T00:00:00Z');
  if (isNaN(d.getTime())) return today();
  d.setUTCDate(d.getUTCDate() + (+days || 0));
  return d.toISOString().slice(0, 10);
}

function ensureTaskFilterState() {
  if (!S.tf) {
    S.tf = { q: '', emp: '', prio: '', due: '', type: '', from: '', to: '', sort: 'default', open: false };
  }
  return S.tf;
}

function activeTaskFiltersCount() {
  const tf = ensureTaskFilterState();
  return [tf.q.trim(), tf.emp, tf.prio, tf.due, tf.type, tf.from, tf.to, S.meeting, S.dept, S.kpi].filter(Boolean).length;
}

function filterTasksAdvanced() {
  const tf = ensureTaskFilterState();
  const td = today();
  const q = tf.q.trim().toLowerCase();

  let list = (S.tasks || []).filter(t => {
    if (S.meeting && t.meeting_id !== S.meeting) return false;
    if (S.dept && !same(memberDept(t.assignee_email), S.dept)) return false;
    if (S.filter === 'mine' && !mine(t)) return false;
    if (S.kpi && KPI_TEST[S.kpi] && !KPI_TEST[S.kpi](t)) return false;

    // فلتر الموظف المحدد
    if (tf.emp) {
      if (tf.emp === '_all_team' && !t.for_all && !t.group_id) return false;
      else if (tf.emp === '_unassigned' && (t.for_all || t.assignee_email)) return false;
      else if (tf.emp !== '_all_team' && tf.emp !== '_unassigned' && !same(t.assignee_email, tf.emp)) return false;
    }

    // فلتر الأولوية
    if (tf.prio && prioOf(t) !== tf.prio) return false;

    // فلتر حالة الموعد والاستحقاق
    const st = eff(t);
    if (tf.due) {
      if (tf.due === 'late' && !(st !== 'done' && t.due_on && t.due_on < td)) return false;
      if (tf.due === 'today' && !(st !== 'done' && t.due_on === td)) return false;
      if (tf.due === 'tomorrow' && !(st !== 'done' && t.due_on === addDays(td, 1))) return false;
      if (tf.due === 'week' && !(st !== 'done' && t.due_on && t.due_on >= td && t.due_on <= addDays(td, 7))) return false;
      if (tf.due === 'has_due' && !t.due_on) return false;
      if (tf.due === 'no_due' && t.due_on) return false;
    }

    // فلتر نوع وبنية المهمة
    if (tf.type) {
      const ck = (S.itemStats || {})[t.id];
      const hasCk = !!(ck && ck[1] > 0);
      const hasFlow = Array.isArray(t.flow) && t.flow.length > 1;
      const hasHandoff = String(t.notes || '').includes('[WF_HANDOFF]');
      if (tf.type === 'single' && (t.for_all || t.group_id)) return false;
      if (tf.type === 'group' && !(t.for_all || t.group_id)) return false;
      if (tf.type === 'flow' && !hasFlow && !hasHandoff) return false;
      if (tf.type === 'checklist' && !hasCk) return false;
    }

    // فلتر النطاق الزمني (من - إلى)
    const refDate = t.due_on || String(t.created_at || '').slice(0, 10);
    if (tf.from && (!refDate || refDate < tf.from)) return false;
    if (tf.to && (!refDate || refDate > tf.to)) return false;

    // البحث النصي الشامل
    if (q) {
      const mt = (S.meetings || []).find(m => m.id === t.meeting_id);
      const hay = [
        t.title || '',
        t.notes || '',
        t.done_note || '',
        t.assignee_email ? nm(t.assignee_email) : '',
        mt ? mt.title : ''
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });

  // الترتيب الذكي
  const sortMode = tf.sort || 'default';
  const cmpFn = (a, b) => {
    if (sortMode === 'due_asc') {
      const da = a.due_on || '9999-99-99', db = b.due_on || '9999-99-99';
      if (da !== db) return da < db ? -1 : 1;
    } else if (sortMode === 'newest') {
      const ca = a.created_at || '', cb = b.created_at || '';
      if (ca !== cb) return ca > cb ? -1 : 1;
    } else if (sortMode === 'progress_desc') {
      const pa = +a.progress || 0, pb = +b.progress || 0;
      if (pa !== pb) return pb - pa;
    } else if (sortMode === 'emp_asc') {
      const na = a.assignee_email ? nm(a.assignee_email) : 'ي', nb = b.assignee_email ? nm(b.assignee_email) : 'ي';
      const c = na.localeCompare(nb, 'ar');
      if (c !== 0) return c;
    }
    return taskCmp(a, b);
  };

  return { list, cmpFn };
}

function taskBoardColsHtml() {
  const { list: all, cmpFn } = filterTasksAdvanced();
  const cTabs = Object.keys(ST).map(k => '<button data-c="' + k + '" class="' + (S.col === k ? 'on' : '') + '">' + ST[k] + ' (' + all.filter(t => eff(t) === k).length + ')</button>').join('');
  const cols = Object.keys(ST).map(k => {
    const items = all.filter(t => eff(t) === k).sort(cmpFn);
    return '<div class="col ' + (S.col === k ? 'on' : '') + '" data-st="' + k + '">' +
      '<div class="ch"><span>' + ST[k] + '</span><i>' + items.length + '</i></div>' +
      (items.length ? items.map(card).join('') : '<div class="empty">لا توجد مهام مطابقة</div>') +
    '</div>';
  }).join('');
  return '<div class="ctabs">' + cTabs + '</div><div class="board">' + cols + '</div>';
}

function boardView() {
  const tf = ensureTaskFilterState();
  const deps = typeof departmentsList === 'function' ? departmentsList() : [];
  const { list: all } = filterTasksAdvanced();
  const activeCnt = activeTaskFiltersCount();

  let mtOpts = '<option value="">📁 كل المشاريع/الاجتماعات</option>' + S.meetings.map(m => '<option value="' + m.id + '" ' + (S.meeting === m.id ? 'selected' : '') + '>' + esc(m.title) + '</option>').join('');
  let depOpts = '<option value="">🏛️ كل الإدارات والأقسام</option>' + deps.map(d => '<option value="' + esc(d) + '" ' + (same(S.dept, d) ? 'selected' : '') + '>🏛️ ' + esc(d) + '</option>').join('');
  let empOpts = '<option value="">👤 كل الموظفين</option>' +
    '<option value="_all_team"' + (tf.emp === '_all_team' ? ' selected' : '') + '>👥 مهام جماعية (الفريق)</option>' +
    '<option value="_unassigned"' + (tf.emp === '_unassigned' ? ' selected' : '') + '>⏳ غير مسندة</option>' +
    (S.members || []).map(m => '<option value="' + esc(m.email) + '"' + (same(tf.emp, m.email) ? ' selected' : '') + '>👤 ' + esc(m.name) + '</option>').join('');

  let prioOpts = '<option value="">⚡ كل الأولويات</option>' +
    '<option value="urgent"' + (tf.prio === 'urgent' ? ' selected' : '') + '>🔴 عاجل ومهم</option>' +
    '<option value="important"' + (tf.prio === 'important' ? ' selected' : '') + '>🟠 مهم غير عاجل</option>' +
    '<option value="quick"' + (tf.prio === 'quick' ? ' selected' : '') + '>🔵 عاجل غير مهم</option>' +
    '<option value="normal"' + (tf.prio === 'normal' ? ' selected' : '') + '>⚪ عادي</option>';

  let dueOpts = '<option value="">📅 كل المواعيد</option>' +
    '<option value="late"' + (tf.due === 'late' ? ' selected' : '') + '>⚠️ متأخرة عن الموعد</option>' +
    '<option value="today"' + (tf.due === 'today' ? ' selected' : '') + '>🔥 مستحقة اليوم</option>' +
    '<option value="tomorrow"' + (tf.due === 'tomorrow' ? ' selected' : '') + '>⏱️ مستحقة غداً</option>' +
    '<option value="week"' + (tf.due === 'week' ? ' selected' : '') + '>📆 خلال 7 أيام</option>' +
    '<option value="has_due"' + (tf.due === 'has_due' ? ' selected' : '') + '>📅 لها تاريخ استحقاق</option>' +
    '<option value="no_due"' + (tf.due === 'no_due' ? ' selected' : '') + '>⏳ بدون تاريخ استحقاق</option>';

  let typeOpts = '<option value="">🔗 كل أنواع المهام</option>' +
    '<option value="single"' + (tf.type === 'single' ? ' selected' : '') + '>👤 مهام فردية</option>' +
    '<option value="group"' + (tf.type === 'group' ? ' selected' : '') + '>👥 مهام جماعية / متعددة</option>' +
    '<option value="flow"' + (tf.type === 'flow' ? ' selected' : '') + '>🔄 مرتبطة بمسار عمل / إحالة</option>' +
    '<option value="checklist"' + (tf.type === 'checklist' ? ' selected' : '') + '>☑️ تحتوي بنود تحقق فرعية</option>';

  let sortOpts = '<option value="default"' + (tf.sort === 'default' ? ' selected' : '') + '>🔃 الترتيب: الأولوية والموعد</option>' +
    '<option value="due_asc"' + (tf.sort === 'due_asc' ? ' selected' : '') + '>📅 الأقرب استحقاقاً أولاً</option>' +
    '<option value="newest"' + (tf.sort === 'newest' ? ' selected' : '') + '>🆕 الأحدث إنشاءً أولاً</option>' +
    '<option value="progress_desc"' + (tf.sort === 'progress_desc' ? ' selected' : '') + '>📈 الأعلى نسبة إنجاز</option>' +
    '<option value="emp_asc"' + (tf.sort === 'emp_asc' ? ' selected' : '') + '>🔤 حسب اسم الموظف</option>';

  let adminBtn = '<button class="s" id="nmt" style="background:transparent;border-color:var(--mute)">+ قسم/اجتماع</button>';
  let waBatchBtn = '<button class="s" id="wa_batch_btn" type="button" style="background:rgba(18,140,126,.12);color:#128c7e;border-color:rgba(18,140,126,.35);font-weight:700" title="إرسال رسائل تذكير للموظفين بالمهام المتأخرة والمفتوحة دفعة واحدة">📲 تذكير واتساب للموظفين</button>';
  let advToggleBtn = '<button class="s' + (tf.open || activeCnt ? ' p' : '') + '" id="tf_tog" type="button">🎛️ فلترة متقدمة' + (activeCnt ? ' (' + activeCnt + ')' : '') + '</button>';

  const quickChips = [
    ['', '', '📋 الكل (' + S.tasks.length + ')'],
    ['due', 'late', '⚠️ المتأخرة'],
    ['due', 'today', '🔥 اليوم'],
    ['due', 'tomorrow', '⏱️ غداً'],
    ['due', 'week', '📆 هذا الأسبوع'],
    ['prio', 'urgent', '🔴 عاجل ومهم'],
    ['type', 'group', '👥 جماعية']
  ].map(([field, val, label]) => {
    const isAct = (!field && !tf.due && !tf.prio && !tf.type) || (field && tf[field] === val);
    return '<button type="button" class="s' + (isAct ? ' p' : '') + '" data-tf-qchip="' + field + ':' + val + '" style="font-size:12px;padding:4px 10px;border-radius:8px">' + label + '</button>';
  }).join('');

  const advPanelHtml = (tf.open || activeCnt > 0) ? (
    '<div class="card" id="tf_panel" style="padding:12px 14px;margin:0 0 12px;border:1px solid var(--acc);background:var(--card)">' +
      '<div class="bar" style="margin-bottom:10px;flex-wrap:wrap;gap:6px">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b style="font-size:13.5px">🎛️ خيارات الفلترة المتقدمة والترتيب</b><span class="chip all" id="tf_count_badge">المطابق: ' + all.length + ' من ' + S.tasks.length + '</span></div>' +
        (activeCnt ? '<button type="button" class="s dng" id="tf_reset" style="font-size:12px;padding:4px 10px">↺ مسح كل الفلاتر (' + activeCnt + ')</button>' : '') +
      '</div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
        '<select id="tf_emp" style="flex:1 1 160px">' + empOpts + '</select>' +
        '<select id="tf_prio" style="flex:1 1 150px">' + prioOpts + '</select>' +
        '<select id="tf_due" style="flex:1 1 160px">' + dueOpts + '</select>' +
        '<select id="tf_type" style="flex:1 1 160px">' + typeOpts + '</select>' +
      '</div>' +
      '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">' +
        '<select id="fm" style="flex:1 1 160px">' + mtOpts + '</select>' +
        (deps.length ? '<select id="fdep" style="flex:1 1 160px">' + depOpts + '</select>' : '') +
        '<div class="row s" style="flex:1 1 240px;gap:4px;align-items:center"><span class="m" style="font-size:12px;white-space:nowrap">📅 من:</span><input type="date" id="tf_from" value="' + esc(tf.from) + '" style="padding:6px 8px"><span class="m" style="font-size:12px;white-space:nowrap">إلى:</span><input type="date" id="tf_to" value="' + esc(tf.to) + '" style="padding:6px 8px"></div>' +
        '<select id="tf_sort" style="flex:1 1 170px">' + sortOpts + '</select>' +
      '</div>' +
    '</div>'
  ) : '';

  return kpiHtml() +
  '<div class="tools" style="margin-bottom:8px">' +
    '<div class="seg"><button data-f="mine" class="' + (S.filter === 'mine' ? 'on' : '') + '">مهامي فقط</button><button data-f="all" class="' + (S.filter === 'all' ? 'on' : '') + '">كل الفريق</button></div>' +
    '<input id="tf_q" type="search" placeholder="🔎 بحث فوري: عنوان المهمة، موظف، ملاحظات، مشروع…" value="' + esc(tf.q) + '" style="flex:2 1 200px">' +
    advToggleBtn +
    (!tf.open && !activeCnt ? '<select id="fm" style="border-radius:6px">' + mtOpts + '</select>' + (deps.length ? '<select id="fdep" style="border-radius:6px">' + depOpts + '</select>' : '') : '') +
    '<span class="sp"></span>' +
    waBatchBtn + adminBtn + '<button class="p s" id="nt">➕ إضافة مهمة</button>' +
  '</div>' +
  '<div class="row s" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">' + quickChips + '</div>' +
  advPanelHtml +
  '<div id="t_board_wrap">' + taskBoardColsHtml() + '</div>';
}

function bindTaskColsEvents() {
  document.querySelectorAll('[data-ci]').forEach(c => c.onchange = () => ckToggle(c.dataset.ci, c.checked));
  document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { S.col = b.dataset.c; render(); });
  document.querySelectorAll('[data-mv]').forEach(b => b.onclick = e => { e.stopPropagation(); moveTask(b.dataset.mv, b.dataset.to); });
  document.querySelectorAll('[data-hf]').forEach(b => { b.onclick = e => { e.stopPropagation(); handoffDialog(b.dataset.hf); }; });
  document.querySelectorAll('[data-wa-tk]').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      const tk = S.tasks.find(x => x.id === b.dataset.waTk);
      if (tk) waRemindDialog(tk.assignee_email || '', 'single', tk.id);
    };
  });
  document.querySelectorAll('.tk').forEach(el => {
    el.onclick = e => { if (e.target.closest('.ckrows') || e.target.closest('[data-wa-tk]')) return; taskDialog(S.tasks.find(t => t.id === el.dataset.id)); };
    el.ondragstart = e => { e.dataTransfer.setData('text/plain', el.dataset.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('drag'); };
    el.ondragend = () => el.classList.remove('drag');
  });
  document.querySelectorAll('.col').forEach(c => {
    c.ondragover = e => { e.preventDefault(); c.classList.add('over'); };
    c.ondragleave = () => c.classList.remove('over');
    c.ondrop = e => { e.preventDefault(); c.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id) moveTask(id, c.dataset.st); };
  });
}

function bindBoard() {
  const tf = ensureTaskFilterState();
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.filter = b.dataset.f; render(); });
  document.querySelectorAll('[data-kpi]').forEach(b => b.onclick = () => { S.kpi = S.kpi === b.dataset.kpi ? '' : b.dataset.kpi; S.filter = 'mine'; render(); });
  if ($('kpi_x')) $('kpi_x').onclick = () => { S.kpi = ''; render(); };
  if ($('tf_tog')) $('tf_tog').onclick = () => { tf.open = !tf.open; render(); };
  if ($('tf_q')) {
    $('tf_q').oninput = e => {
      tf.q = e.target.value;
      if ($('t_board_wrap')) {
        $('t_board_wrap').innerHTML = taskBoardColsHtml();
        bindTaskColsEvents();
        if ($('tf_count_badge')) $('tf_count_badge').textContent = 'المطابق: ' + filterTasksAdvanced().list.length + ' من ' + S.tasks.length;
      }
    };
  }
  document.querySelectorAll('[data-tf-qchip]').forEach(b => {
    b.onclick = () => {
      const [field, val] = (b.dataset.tfQchip || ':').split(':');
      if (!field) { tf.due = ''; tf.prio = ''; tf.type = ''; }
      else { tf[field] = tf[field] === val ? '' : val; if (field === 'type' && val === 'group') S.filter = 'all'; }
      render();
    };
  });
  if ($('tf_emp')) $('tf_emp').onchange = e => { tf.emp = e.target.value; if (tf.emp) S.filter = 'all'; render(); };
  if ($('tf_prio')) $('tf_prio').onchange = e => { tf.prio = e.target.value; render(); };
  if ($('tf_due')) $('tf_due').onchange = e => { tf.due = e.target.value; render(); };
  if ($('tf_type')) $('tf_type').onchange = e => { tf.type = e.target.value; render(); };
  if ($('tf_from')) $('tf_from').onchange = e => { tf.from = e.target.value; render(); };
  if ($('tf_to')) $('tf_to').onchange = e => { tf.to = e.target.value; render(); };
  if ($('tf_sort')) $('tf_sort').onchange = e => { tf.sort = e.target.value; render(); };
  if ($('tf_reset')) $('tf_reset').onclick = () => {
    S.tf = { q: '', emp: '', prio: '', due: '', type: '', from: '', to: '', sort: 'default', open: true };
    S.meeting = ''; S.dept = ''; S.kpi = '';
    render();
  };
  if ($('fm')) $('fm').onchange = e => { S.meeting = e.target.value; render(); };
  if ($('fdep')) $('fdep').onchange = e => { S.dept = e.target.value; render(); };
  $('nt').onclick = () => taskDialog(null);
  if ($('wa_batch_btn')) $('wa_batch_btn').onclick = () => waRemindDialog('', 'late');
  if ($('nmt')) $('nmt').onclick = () => { const t = prompt('اسم القسم/الاجتماع الجديد'); if (t && t.trim()) run(sb.from('meetings').insert({ title: t.trim() })); };
  bindTaskColsEvents();
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

  const cleanTaskNotes = String(x.notes || '').replace(/\[شركة:\s*[^\]]+\]\n?/g, '').trim();

  dlg.innerHTML = '<h2>' + (edit ? 'تعديل المهمة' : 'مهمة جديدة') + '</h2>' +
  '<label>العنوان<input id="f_ti" value="' + esc(x.title || '') + '" placeholder="ما هو المطلوب إنجازه؟"></label>' +
  '<label>تفاصيل وروابط (اختياري)<textarea id="f_no" rows="3">' + esc(cleanTaskNotes) + '</textarea></label>' +
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
    const activeCo = edit ? (typeof taskCompany === 'function' ? taskCompany(t) : 'متجرك') : ((typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '') || (assignee ? memberCompany(assignee) : 'متجرك'));
    const cleanNotes = $('f_no').value.trim().replace(/\[شركة:\s*[^\]]+\]\n?/g, '').trim();
    const fallbackNotes = activeCo ? ((cleanNotes ? cleanNotes + '\n' : '') + '[شركة: ' + activeCo + ']') : cleanNotes;
    const useExplicitCol = S.hasExplicitTaskCo !== false;
    const row = { title, notes: (useExplicitCol ? cleanNotes : fallbackNotes) || null, for_all: all, assignee_email: isMulti ? null : (assignee || null), due_on: $('f_du').value || null, meeting_id: $('f_mt').value || null, priority: $('f_pr').value, status: isMulti ? 'todo' : $('f_st').value };
    if (useExplicitCol) row.company_id = activeCo || 'متجرك';
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
      let rows = uniq.map(m => Object.assign({}, row, { id: crypto.randomUUID(), for_all: false, assignee_email: m.email, group_id: gid, status: 'todo' }));
      ({ error } = await sb.from('tasks').insert(rows));
      if (error && /company_id/i.test(error.message)) {
        S.hasExplicitTaskCo = false;
        rows = rows.map(r => { const c = Object.assign({}, r, { notes: fallbackNotes || null }); delete c.company_id; return c; });
        ({ error } = await sb.from('tasks').insert(rows));
      } else if (!error && useExplicitCol) S.hasExplicitTaskCo = true;
      if (!error) { await Promise.all(rows.map(r => ck.flush(r.id))); gmap = {}; rows.forEach(r => { gmap[String(r.assignee_email).toLowerCase()] = r.id; }); }
    } else {
      ({ error } = edit ? await sb.from('tasks').update(row).eq('id', t.id) : await sb.from('tasks').insert(row));
      if (error && /company_id/i.test(error.message)) {
        S.hasExplicitTaskCo = false;
        delete row.company_id; row.notes = fallbackNotes || null;
        ({ error } = edit ? await sb.from('tasks').update(row).eq('id', t.id) : await sb.from('tasks').insert(row));
      } else if (!error && useExplicitCol) S.hasExplicitTaskCo = true;
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
