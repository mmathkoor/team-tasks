// ===== لوحة الأرقام (رسوم SVG نقية بلا مكتبات خارجية) =====
const DAY = 864e5, pad2 = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const weekStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return x; }; // الأسبوع يبدأ السبت

// المهمة الجماعية تُحسب وحدة لكل عضو؛ المهمة العادية وحدة واحدة
function dashUnits(tasks, done, members) {
  const out = [];
  for (const t of tasks) {
    if (t.for_all) {
      for (const m of members) {
        const d = (done || []).find(x => x.task_id === t.id && same(x.email, m.email));
        out.push({ t, who: m.email, done: !!d, doing: false, completed_at: d ? d.done_at || null : null, created_at: t.created_at, due_on: t.due_on, meeting_id: t.meeting_id });
      }
    } else out.push({ t, who: t.assignee_email || '', done: t.status === 'done', doing: t.status === 'doing', completed_at: t.completed_at || null, note: t.done_note || null, group: t.group_id || null, created_at: t.created_at, due_on: t.due_on, meeting_id: t.meeting_id });
  }
  return out;
}

function dashCompute(units, f, now, members) {
  const todayS = ymd(now), start = f.period === 'all' ? null : new Date(now.getTime() - +f.period * DAY);
  const depOf = email => {
    const m = (S.allMembers || members || []).find(x => same(x.email, email));
    return m && typeof parseMemberMeta === 'function' ? (parseMemberMeta(m).department || '') : '';
  };
  const coOf = u => typeof taskCompany === 'function' ? taskCompany(u.t) : 'متجرك';
  const mine = u => (!f.who || same(u.who, f.who)) && (!f.meet || u.meeting_id === f.meet) && (!f.dep || depOf(u.who) === f.dep);
  const U = units.filter(u => mine(u) && (!u.done || !start || new Date(u.completed_at || u.created_at || 0) >= start));
  const done = U.filter(u => u.done), open = U.filter(u => !u.done);
  const isLate = u => !u.done && u.due_on && u.due_on < todayS;
  const late = open.filter(isLate), doingOk = open.filter(u => u.doing && !isLate(u)), todoOk = open.filter(u => !u.doing && !isLate(u));
  const withDue = done.filter(u => u.due_on && u.completed_at);
  const onTime = withDue.filter(u => ymd(new Date(u.completed_at)) <= u.due_on).length;
  const durs = done.filter(u => u.completed_at && u.created_at).map(u => (new Date(u.completed_at) - new Date(u.created_at)) / DAY).filter(x => x >= 0);
  // اتجاه 8 أسابيع (لا يتأثر بمرشح الفترة)
  const base = units.filter(mine), ws = weekStart(now), weeks = [];
  for (let i = 7; i >= 0; i--) { const d = new Date(ws); d.setDate(d.getDate() - 7 * i); weeks.push({ start: d, created: 0, done: 0 }); }
  const idx = dt => { const w = weekStart(new Date(dt)); return weeks.findIndex(x => +x.start === +w); };
  base.forEach(u => { if (u.created_at) { const i = idx(u.created_at); if (i >= 0) weeks[i].created++; } if (u.done && u.completed_at) { const i = idx(u.completed_at); if (i >= 0) weeks[i].done++; } });
  // توزيع الحمل
  const emails = f.who ? [f.who] : members.map(m => m.email);
  const people = emails.map(e => { const m = U.filter(u => same(u.who, e)), d = m.filter(u => u.done).length, l = m.filter(isLate).length; return { email: e, done: d, late: l, open: m.length - d - l, total: m.length }; });
  const un = U.filter(u => !u.who); if (un.length) people.push({ email: '', done: un.filter(u => u.done).length, late: un.filter(isLate).length, open: un.filter(u => !u.done && !isLate(u)).length, total: un.length });
  // الأقسام والإدارات
  const dm = {}; U.forEach(u => { const k = depOf(u.who) || 'عام / غير محدد'; const r = dm[k] || (dm[k] = { dep: k, total: 0, done: 0, late: 0 }); r.total++; if (u.done) r.done++; else if (isLate(u)) r.late++; });
  const deps = Object.values(dm).sort((a, b) => b.total - a.total);
  // المتاجر والشركات
  const cm = {}; U.forEach(u => { const k = coOf(u) || 'متجرك'; const r = cm[k] || (cm[k] = { co: k, total: 0, done: 0, late: 0 }); r.total++; if (u.done) r.done++; else if (isLate(u)) r.late++; });
  const stores = Object.values(cm).sort((a, b) => b.total - a.total);
  // الاجتماعات
  const mm = {}; U.forEach(u => { const k = u.meeting_id || ''; const r = mm[k] || (mm[k] = { id: k, total: 0, done: 0 }); r.total++; if (u.done) r.done++; });
  const meets = Object.values(mm).sort((a, b) => b.total - a.total).slice(0, 6);
  // تقادم المتأخرات
  const age = [['1–3 أيام', 1, 3], ['4–7 أيام', 4, 7], ['8–14 يوماً', 8, 14], ['أكثر من 14 يوماً', 15, 1e9]].map(([label, a, b]) => ({ label, n: late.filter(u => { const d = Math.floor((new Date(todayS) - new Date(u.due_on)) / DAY); return d >= a && d <= b; }).length }));
  const ts = x => (x ? new Date(x).getTime() : 8.64e15);
  return {
    U, total: U.length, done: done.length, open: open.length, late: late.length, doingOk: doingOk.length, todoOk: todoOk.length,
    rate: U.length ? Math.round(100 * done.length / U.length) : 0,
    onTimePct: withDue.length ? Math.round(100 * onTime / withDue.length) : null, onTimeN: withDue.length,
    avgDays: durs.length ? +(durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(1) : null,
    week: done.filter(u => u.completed_at && now - new Date(u.completed_at) <= 7 * DAY).length,
    noTime: done.filter(u => !u.completed_at).length, weeks, people, deps, stores, meets, age,
    oldest: open.slice().sort((a, b) => ts(a.created_at) - ts(b.created_at)).slice(0, 5),
    attention: late.slice().sort((a, b) => (a.due_on < b.due_on ? -1 : 1)).slice(0, 5),
    recent: done.filter(u => u.completed_at).sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)).slice(0, 8)
  };
}

// ---------- رسوم SVG ----------
function svgDonut(parts, center, sub) {
  const R = 52, C = 2 * Math.PI * R, tot = parts.reduce((a, p) => a + p.n, 0) || 1; let off = 0;
  const arcs = parts.filter(p => p.n > 0).map(p => { const len = C * p.n / tot; const s = '<circle r="' + R + '" cx="70" cy="70" fill="none" style="stroke:' + p.c + '" stroke-width="16" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"><title>' + esc(p.l) + ': ' + p.n + '</title></circle>'; off += len; return s; }).join('');
  return '<svg viewBox="0 0 140 140" class="dsh-donut" role="img" aria-label="' + esc(sub) + '"><circle r="52" cx="70" cy="70" fill="none" style="stroke:var(--line)" stroke-width="16"/>' + arcs +
    '<text x="70" y="72" text-anchor="middle" class="dsh-big">' + center + '</text><text x="70" y="90" text-anchor="middle" class="dsh-sub">' + esc(sub) + '</text></svg>';
}
function svgTrend(weeks) {
  const W = 320, H = 150, L = 26, B = 22, T = 10, mx = Math.max(3, ...weeks.map(w => Math.max(w.created, w.done)));
  const x = i => L + (W - L - 8) * i / (weeks.length - 1), y = v => T + (H - T - B) * (1 - v / mx);
  const line = (k, c) => '<polyline fill="none" style="stroke:' + c + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" points="' + weeks.map((w, i) => x(i).toFixed(1) + ',' + y(w[k]).toFixed(1)).join(' ') + '"/>' +
    weeks.map((w, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(w[k]).toFixed(1) + '" r="3" style="fill:' + c + '"><title>' + w.start.getDate() + '/' + (w.start.getMonth() + 1) + ': ' + w[k] + '</title></circle>').join('');
  const grid = [0, 0.5, 1].map(f => '<line x1="' + L + '" x2="' + (W - 8) + '" y1="' + y(mx * f).toFixed(1) + '" y2="' + y(mx * f).toFixed(1) + '" style="stroke:var(--line)"/><text x="' + (L - 4) + '" y="' + (y(mx * f) + 3).toFixed(1) + '" text-anchor="end" class="dsh-sub">' + Math.round(mx * f) + '</text>').join('');
  const xs = weeks.map((w, i) => i % 2 === 0 || i === weeks.length - 1 ? '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (i === weeks.length - 1 ? 'end' : 'middle') + '" class="dsh-sub">' + w.start.getDate() + '/' + (w.start.getMonth() + 1) + '</text>' : '').join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="dsh-trend" role="img" aria-label="الاتجاه الأسبوعي">' + grid + xs + line('created', 'var(--c-todo)') + line('done', 'var(--c-done)') + '</svg>';
}
const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
const seg = (n, tot, c) => n ? '<i style="width:' + (100 * n / tot).toFixed(1) + '%;background:' + c + '" title="' + n + '"></i>' : '';
const kpi = (v, l, hint, cls) => '<div class="dsh-kpi ' + (cls || '') + '"><b>' + v + '</b><span>' + l + '</span>' + (hint ? '<small>' + hint + '</small>' : '') + '</div>';
const dshRow = x => { const t = x.t, d = x.due_on ? ' · الموعد ' + x.due_on : ''; return '<div class="dsh-li" data-open="' + t.id + '"><b>' + esc(t.title) + '</b><span class="m">' + esc(x.who ? nm(x.who) : 'غير مُسند') + d + '</span>' + (x.note ? '<div class="dnote">📝 ' + esc(x.note) + '</div>' : '') + '</div>'; };
const ageDays = x => x.created_at ? Math.max(0, Math.floor((Date.now() - new Date(x.created_at)) / DAY)) + ' يوماً' : '—';

function dashWaSummary(D, f, per) {
  const curCo = typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '';
  const prof = typeof getCompanyProfile === 'function' ? getCompanyProfile(curCo || 'متجرك') : {};
  const stName = curCo ? (prof.displayName || curCo) : (BRAND.orgName || 'كل الشركات والفروع');
  const topPeople = D.people.filter(p => p.total && p.email).map(p => ({ name: nm(p.email), r: pct(p.done, p.total), done: p.done, tot: p.total })).sort((a, b) => b.r - a.r).slice(0, 5);
  const txt = [
    '📋 *تقرير إنجاز المهام التنفيذي — ' + stName + '*',
    '📅 الفترة: ' + (per[f.period] || 'الكل') + (f.dep ? ' · القسم: ' + f.dep : ''),
    '━━━━━━━━━━━━━━',
    '✅ نسبة الإنجاز: *' + D.rate + '%* (' + D.done + ' من ' + D.total + ')',
    '⏱ الإنجاز في الموعد: *' + (D.onTimePct == null ? '—' : D.onTimePct + '%') + '*',
    '📂 مهام مفتوحة: *' + D.open + '* (' + D.doingOk + ' قيد العمل)',
    '⚠️ مهام متأخرة: *' + D.late + '*',
    topPeople.length ? '━━━━━━━━━━━━━━\n🏆 *أعلى الأعضاء إنجازاً:*\n' + topPeople.map((p, i) => (i + 1) + '. ' + p.name + ': ' + p.r + '% (' + p.done + '/' + p.tot + ')').join('\n') : ''
  ].filter(Boolean).join('\n');
  navigator.clipboard?.writeText(txt);
  toast('تم نسخ ملخص إنجاز المهام للحافظة 📋');
}

function dashView() {
  const f = S.dash || (S.dash = { period: 'all', who: '', dep: '', meet: '' });
  const D = dashCompute(dashUnits(S.tasks, S.done, S.members), f, new Date(), S.members), mx = Math.max(1, ...D.people.map(p => p.total));
  const opt = (v, l, cur) => '<option value="' + esc(v) + '" ' + (cur === v ? 'selected' : '') + '>' + esc(l) + '</option>';
  const per = { all: 'كل الفترات', 7: 'آخر 7 أيام', 30: 'آخر 30 يوماً', 90: 'آخر 90 يوماً' };
  const mname = id => id ? (S.meetings.find(m => m.id === id) || {}).title || 'اجتماع' : 'بدون اجتماع';
  const empty = '<div class="m" style="padding:8px 0">لا توجد بيانات لهذه الفترة.</div>';
  const curCo = typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '';
  const prof = typeof getCompanyProfile === 'function' ? getCompanyProfile(curCo || 'متجرك') : {};
  const stName = curCo ? (prof.displayName || curCo) : (BRAND.orgName || 'كل الشركات والفروع');
  const allDeps = typeof departmentsList === 'function' ? departmentsList() : [];
  return '<div class="dsh-printhead"><h2>📊 تقرير أداء وإنجاز المهام — ' + esc(stName) + '</h2><div class="m">' + new Date().toLocaleDateString('ar') + ' — ' + per[f.period] + (f.dep ? ' — قسم: ' + esc(f.dep) : '') + (f.who ? ' — ' + esc(nm(f.who)) : '') + (f.meet ? ' — ' + esc(mname(f.meet)) : '') + '</div></div>' +
    '<div class="dsh-toolbar"><select id="ds_p">' + Object.entries(per).map(([k, v]) => opt(k, v, String(f.period))).join('') + '</select>' +
    '<select id="ds_dep">' + opt('', '🏛️ كل الأقسام والإدارات', f.dep || '') + allDeps.map(d => opt(d, d, f.dep || '')).join('') + '</select>' +
    '<select id="ds_w">' + opt('', '👤 كل الأعضاء', f.who) + S.members.map(m => opt(m.email, m.name, f.who)).join('') + '</select>' +
    '<select id="ds_m">' + opt('', '📅 كل الاجتماعات', f.meet) + S.meetings.map(m => opt(m.id, m.title, f.meet)).join('') + '</select>' +
    '<span style="flex:1"></span><button id="ds_wa" class="s" type="button">📋 ملخص واتساب</button><button id="ds_csv" class="s" type="button">⬇ تصدير CSV</button><button id="ds_pr" class="gold" type="button">🖨 طباعة / PDF</button></div>' +
    '<div class="dsh-grid">' + kpi(D.rate + '%', 'نسبة الإنجاز', D.done + ' من ' + D.total, D.rate >= 70 ? 'ok' : '') +
      kpi(D.onTimePct == null ? '—' : D.onTimePct + '%', 'الإنجاز في الموعد', D.onTimePct == null ? 'يحتاج مهاماً منتهية بموعد' : 'من ' + D.onTimeN + ' مهمة') +
      kpi(D.late, 'متأخرة الآن', D.late ? 'تحتاج متابعة' : 'ممتاز', D.late ? 'bad' : 'ok') + kpi(D.open, 'مفتوحة', D.doingOk + ' قيد العمل') +
      kpi(D.avgDays == null ? '—' : D.avgDays, 'متوسط مدة الإنجاز (يوم)', D.avgDays == null ? 'تتراكم البيانات' : '') + kpi(D.week, 'أُنجزت آخر 7 أيام', '') + '</div>' +
    (D.noTime ? '<div class="m" style="margin:8px 2px">ℹ️ ' + D.noTime + ' مهمة منجزة قبل تفعيل تسجيل الوقت، لا تدخل في حساب المدد والاتجاه.</div>' : '') +
    '<div class="dsh-cols">' +
    '<div class="dsh-card"><h2>توزيع الحالات</h2>' + (D.total ? '<div class="dsh-flex">' + svgDonut([{ l: 'منجزة', n: D.done, c: 'var(--c-done)' }, { l: 'قيد العمل', n: D.doingOk, c: 'var(--c-doing)' }, { l: 'للتنفيذ', n: D.todoOk, c: 'var(--c-todo)' }, { l: 'متأخرة', n: D.late, c: 'var(--c-late)' }], D.rate + '%', 'منجزة') +
      '<div class="dsh-legend">' + [['منجزة', D.done, 'var(--c-done)'], ['قيد العمل', D.doingOk, 'var(--c-doing)'], ['للتنفيذ', D.todoOk, 'var(--c-todo)'], ['متأخرة', D.late, 'var(--c-late)']].map(([l, n, c]) => '<div><i style="background:' + c + '"></i>' + l + ' <b>' + n + '</b></div>').join('') + '</div></div>' : empty) + '</div>' +
    '<div class="dsh-card"><h2>الاتجاه الأسبوعي (8 أسابيع)</h2>' + svgTrend(D.weeks) + '<div class="dsh-legend row-l"><div><i style="background:var(--c-todo)"></i>مهام جديدة</div><div><i style="background:var(--c-done)"></i>مهام منجزة</div></div></div>' +
    '<div class="dsh-card"><h2>🏆 ترتيب الأعضاء (نسبة الإنجاز)</h2>' + (D.people.some(p => p.total) ? D.people.filter(p => p.total && p.email).map(p => ({ p, r: pct(p.done, p.total) })).sort((a, b) => b.r - a.r || b.p.done - a.p.done).map((x, i) => '<div class="dsh-rw"><span>' + (['🥇', '🥈', '🥉'][i] || '•') + ' ' + esc(nm(x.p.email)) + '</span><div class="dsh-bar" style="width:100%"><i style="width:' + x.r + '%;background:var(--c-done)"></i></div><small>' + x.r + '% · ' + x.p.done + '/' + x.p.total + (x.p.late ? ' · <span style="color:var(--c-late)">' + x.p.late + ' متأخرة</span>' : '') + '</small></div>').join('') : empty) + '</div>' +
    '<div class="dsh-card"><h2>🏛️ أداء الأقسام والإدارات</h2>' + (D.deps && D.deps.length ? D.deps.map(d => { const r = pct(d.done, d.total); return '<div class="dsh-rw"><span>' + esc(d.dep) + '</span><div class="dsh-bar" style="width:100%">' + seg(d.done, d.total, 'var(--c-done)') + seg(d.total - d.done - d.late, d.total, 'var(--c-todo)') + seg(d.late, d.total, 'var(--c-late)') + '</div><small>' + r + '% (' + d.done + '/' + d.total + ')</small></div>'; }).join('') : empty) + '</div>' +
    (D.stores && D.stores.length > 1 ? '<div class="dsh-card"><h2>🏢 الإنجاز حسب الشركة / الفرع</h2>' + D.stores.map(s => { const r = pct(s.done, s.total); return '<div class="dsh-rw"><span>' + esc(s.co) + '</span><div class="dsh-bar" style="width:100%">' + seg(s.done, s.total, 'var(--c-done)') + seg(s.total - s.done - s.late, s.total, 'var(--c-todo)') + seg(s.late, s.total, 'var(--c-late)') + '</div><small>' + r + '% (' + s.done + '/' + s.total + ')</small></div>'; }).join('') + '</div>' : '') +
    '<div class="dsh-card"><h2>توزيع حمل العمل</h2>' + (D.people.some(p => p.total) ? D.people.filter(p => p.total).map(p => '<div class="dsh-rw"><span>' + esc(p.email ? nm(p.email) : 'غير مُسند') + '</span><div class="dsh-bar" style="width:' + (100 * p.total / mx).toFixed(1) + '%">' + seg(p.done, p.total, 'var(--c-done)') + seg(p.open, p.total, 'var(--c-todo)') + seg(p.late, p.total, 'var(--c-late)') + '</div><small>' + p.done + '/' + p.total + '</small></div>').join('') +
      '<div class="dsh-legend row-l"><div><i style="background:var(--c-done)"></i>منجزة</div><div><i style="background:var(--c-todo)"></i>مفتوحة</div><div><i style="background:var(--c-late)"></i>متأخرة</div></div>' : empty) + '</div>' +
    '<div class="dsh-card"><h2>الإنجاز حسب الاجتماع</h2>' + (D.meets.length ? D.meets.map(r => '<div class="dsh-rw"><span>' + esc(mname(r.id)) + '</span><div class="dsh-bar" style="width:100%">' + seg(r.done, r.total || 1, 'var(--c-done)') + '</div><small>' + pct(r.done, r.total) + '%</small></div>').join('') : empty) + '</div>' +
    '<div class="dsh-card"><h2>تقادم المتأخرات</h2>' + (D.late ? D.age.map(a => '<div class="dsh-rw"><span>' + a.label + '</span><div class="dsh-bar" style="width:' + (100 * a.n / Math.max(1, D.late)).toFixed(1) + '%">' + seg(a.n, a.n || 1, 'var(--c-late)') + '</div><small>' + a.n + '</small></div>').join('') : '<div class="m" style="padding:8px 0">لا توجد مهام متأخرة 👏</div>') + '</div>' +
    '<div class="dsh-card"><h2>تحتاج انتباهاً (الأقدم موعداً)</h2>' + (D.attention.length ? D.attention.map(dshRow).join('') : '<div class="m" style="padding:8px 0">لا شيء متأخر.</div>') + '</div>' +
    '<div class="dsh-card"><h2>أقدم المهام المفتوحة</h2>' + (D.oldest.length ? D.oldest.map(x => dshRow(x).replace('</span>', ' · عمرها ' + ageDays(x) + '</span>')).join('') : empty) + '</div>' +
    '<div class="dsh-card"><h2>أُنجزت مؤخراً</h2>' + (D.recent.length ? D.recent.map(dshRow).join('') : '<div class="m" style="padding:8px 0">ستظهر هنا المهام المنجزة بعد تفعيل تسجيل الوقت.</div>') + '</div></div>';
}
function dashCsv(units) {
  const q = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };   // يمنع تنفيذ صيغ Excel من نص المهمة
  const rows = [['العنوان', 'الشركة/الفرع', 'المسؤول', 'القسم', 'الحالة', 'الموعد', 'تاريخ الإنشاء', 'تاريخ الإنجاز', 'الاجتماع', 'جماعية', 'ما أُنجز'].map(q).join(',')];
  units.forEach(u => {
    const m = (S.allMembers || S.members || []).find(x => same(x.email, u.who));
    const meta = m && typeof parseMemberMeta === 'function' ? parseMemberMeta(m) : { company: '', department: '' };
    const co = typeof taskCompany === 'function' ? taskCompany(u.t) : (meta.company || 'متجرك');
    rows.push([u.t.title, co, u.who ? nm(u.who) : 'غير مُسند', meta.department || '', u.done ? 'منجزة' : (ST[u.t.status] || u.t.status), u.due_on || '', (u.created_at || '').slice(0, 10), (u.completed_at || '').slice(0, 10), (S.meetings.find(m => m.id === u.meeting_id) || {}).title || '', (u.t.for_all || u.group) ? 'نعم' : 'لا', u.note || ''].map(q).join(','));
  });
  return '\ufeff' + rows.join('\r\n');
}
function downloadText(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function bindDash() {
  const f = S.dash;
  const per = { all: 'كل الفترات', 7: 'آخر 7 أيام', 30: 'آخر 30 يوماً', 90: 'آخر 90 يوماً' };
  $('ds_p').onchange = e => { f.period = e.target.value; render(); };
  if ($('ds_dep')) $('ds_dep').onchange = e => { f.dep = e.target.value; render(); };
  $('ds_w').onchange = e => { f.who = e.target.value; render(); };
  $('ds_m').onchange = e => { f.meet = e.target.value; render(); };
  $('ds_pr').onclick = () => window.print();
  if ($('ds_wa')) $('ds_wa').onclick = () => dashWaSummary(dashCompute(dashUnits(S.tasks, S.done, S.members), f, new Date(), S.members), f, per);
  $('ds_csv').onclick = () => downloadText('tasks-' + ymd(new Date()) + '.csv', dashCsv(dashCompute(dashUnits(S.tasks, S.done, S.members), f, new Date(), S.members).U), 'text/csv;charset=utf-8');
  document.querySelectorAll('[data-open]').forEach(el => el.onclick = () => { const t = S.tasks.find(x => x.id === el.dataset.open); if (t) taskDialog(t); });
}
