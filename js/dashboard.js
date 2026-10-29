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
  const qStr = String(f.q || '').trim().toLowerCase();
  const matchQ = u => {
    if (!qStr) return true;
    const hay = ((u.t && u.t.title) || '') + ' ' + ((u.t && u.t.details) || '') + ' ' + (u.who ? nm(u.who) + ' ' + u.who : '') + ' ' + depOf(u.who) + ' ' + coOf(u) + ' ' + (u.note || '');
    return hay.toLowerCase().includes(qStr);
  };
  const mine = u => (!f.who || same(u.who, f.who)) && (!f.meet || u.meeting_id === f.meet) && (!f.dep || depOf(u.who) === f.dep) && matchQ(u);
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

function printTasksReport(D, f, per) {
  const curCo = typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '';
  const prof = typeof getCompanyProfile === 'function' ? getCompanyProfile(curCo || 'متجرك') : {};
  const stName = curCo ? (prof.displayName || curCo) : (BRAND.orgName || 'كل الشركات والفروع');
  const logoHtml = prof.logo ? '<img src="' + esc(prof.logo) + '" style="width:56px;height:56px;object-fit:contain;border-radius:12px;border:1px solid #e4e9f2;padding:4px;background:#fff">' : '';
  const empRows = D.people.filter(p => p.total && p.email).map(p => ({ p, r: pct(p.done, p.total) })).sort((a, b) => b.r - a.r || b.p.done - a.p.done).map((x, i) => {
    const m = (S.allMembers || S.members || []).find(z => same(z.email, x.p.email));
    const meta = m && typeof parseMemberMeta === 'function' ? parseMemberMeta(m) : { company: '', department: '' };
    return '<tr><td><b>' + (i + 1) + '. ' + esc(nm(x.p.email)) + '</b></td><td>' + esc(meta.company || 'متجرك') + '</td><td>' + esc(meta.department || '—') + '</td><td>' + x.p.total + '</td><td style="color:#12805c;font-weight:700">' + x.p.done + '</td><td>' + x.p.open + '</td><td style="color:' + (x.p.late ? '#c93b3b;font-weight:700' : '#66758c') + '">' + x.p.late + '</td><td><b>' + x.r + '%</b></td></tr>';
  }).join('');
  const depRows = (D.deps || []).map(d =>
    '<tr><td><b>' + esc(d.dep) + '</b></td><td>' + d.total + '</td><td style="color:#12805c;font-weight:700">' + d.done + '</td><td style="color:' + (d.late ? '#c93b3b;font-weight:700' : '#66758c') + '">' + d.late + '</td><td><b>' + pct(d.done, d.total) + '%</b></td></tr>'
  ).join('');
  const w = window.open('', '_blank');
  if (!w) { toast('الرجاء السماح بالنوافذ المنبثقة للطباعة', false); return; }
  w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير إنجاز المهام - ' + esc(stName) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">' +
    '<style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Tajawal,Tahoma,sans-serif;color:#0f1d35;margin:0;padding:18px;background:#fff;font-size:13px}' +
    '.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #c9a24e;padding-bottom:12px;margin-bottom:16px}' +
    '.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.kpi{border:1px solid #dde3ee;border-radius:10px;padding:10px 12px;background:#f9fafc}' +
    '.kpi b{display:block;font-size:19px;color:#0e1a2f}.kpi span{font-size:11.5px;color:#66758c}' +
    'h3{margin:16px 0 8px;font-size:15px;color:#0e1a2f;border-right:4px solid #c9a24e;padding-right:8px}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12.5px}th{background:#0e1a2f;color:#f6e3a8;padding:8px;text-align:right}td{padding:7px 8px;border-bottom:1px solid #e6ebf2}tr:nth-child(even) td{background:#f9fbff}' +
    '.nopr{margin-bottom:14px;display:flex;gap:8px}@media print{.nopr{display:none!important}}</style></head><body>' +
    '<div class="nopr"><button onclick="window.print()" style="padding:8px 18px;background:#0e1a2f;color:#f6e3a8;border:0;border-radius:8px;font:700 14px Tajawal;cursor:pointer">🖨 طباعة / حفظ PDF</button><button onclick="window.close()" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:8px;font:600 13px Tajawal;cursor:pointer">إغلاق</button></div>' +
    '<div class="hdr"><div style="display:flex;align-items:center;gap:12px">' + logoHtml + '<div><h1 style="margin:0;font-size:22px">' + esc(stName) + '</h1><div style="color:#66758c;font-size:12.5px">التقرير التنفيذي لأداء وإنجاز المهام · الفترة: ' + esc(per[f.period] || 'الكل') + (f.dep ? ' · القسم: ' + esc(f.dep) : '') + '</div></div></div>' +
    '<div style="text-align:left;font-size:12px;color:#66758c">تاريخ الإصدار: ' + today() + '<br>إجمالي المهام: <b>' + D.total + '</b></div></div>' +
    '<div class="kpis">' +
      '<div class="kpi"><b style="color:#12805c">' + D.rate + '% (' + D.done + '/' + D.total + ')</b><span>نسبة الإنجاز العام</span></div>' +
      '<div class="kpi"><b>' + (D.onTimePct == null ? '—' : D.onTimePct + '%') + '</b><span>الإنجاز في الموعد</span></div>' +
      '<div class="kpi"><b>' + D.open + ' (' + D.doingOk + ' قيد العمل)</b><span>المهام المفتوحة</span></div>' +
      '<div class="kpi"><b style="color:#c93b3b">' + D.late + '</b><span>المهام المتأخرة</span></div>' +
    '</div>' +
    (empRows ? '<h3>🏆 كشف تقييم وإنجاز الموظفين</h3><table><thead><tr><th>الموظف</th><th>المتجر / الشركة</th><th>القسم</th><th>الإجمالي</th><th>منجزة</th><th>مفتوحة</th><th>متأخرة</th><th>نسبة الإنجاز</th></tr></thead><tbody>' + empRows + '</tbody></table>' : '') +
    (depRows ? '<h3>🏛️ كشف أداء الأقسام والإدارات</h3><table><thead><tr><th>القسم / الإدارة</th><th>الإجمالي</th><th>منجزة</th><th>متأخرة</th><th>نسبة الإنجاز</th></tr></thead><tbody>' + depRows + '</tbody></table>' : '') +
    '<div style="margin-top:20px;padding-top:10px;border-top:1px solid #dde3ee;display:flex;justify-content:space-between;font-size:11.5px;color:#66758c"><span>كشف رسمي صادر من المنصة</span><span>' + esc(stName) + '</span></div>' +
    '</body></html>');
  w.document.close();
}

function dashWaSummary(D, f, per) {
  const curCo = typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '';
  const prof = typeof getCompanyProfile === 'function' ? getCompanyProfile(curCo || 'متجرك') : {};
  const stName = curCo ? (prof.displayName || curCo) : (BRAND.orgName || 'كل الشركات والفروع');
  const topPeople = D.people.filter(p => p.total && p.email).map(p => ({ name: nm(p.email), r: pct(p.done, p.total), done: p.done, tot: p.total, late: p.late })).sort((a, b) => b.r - a.r).slice(0, 5);
  const txt = [
    '📋 *تقرير إنجاز المهام التنفيذي — ' + stName + '*',
    '📅 الفترة: ' + (per[f.period] || 'الكل') + (f.dep ? ' · القسم: ' + f.dep : ''),
    '━━━━━━━━━━━━━━',
    '✅ نسبة الإنجاز: *' + D.rate + '%* (' + D.done + ' من ' + D.total + ')',
    '⏱ الإنجاز في الموعد: *' + (D.onTimePct == null ? '—' : D.onTimePct + '%') + '*',
    '📂 مهام مفتوحة: *' + D.open + '* (' + D.doingOk + ' قيد العمل)',
    '⚠️ مهام متأخرة: *' + D.late + '*',
    topPeople.length ? '━━━━━━━━━━━━━━\n🏆 *أداء الأعضاء الأبرز:*\n' + topPeople.map((p, i) => (i + 1) + '. ' + p.name + ': ' + p.r + '% (' + p.done + '/' + p.tot + (p.late ? ' · ⚠️ متأخرة: ' + p.late : '') + ')').join('\n') : ''
  ].filter(Boolean).join('\n');
  if (typeof waSummaryDialog === 'function') waSummaryDialog('ملخص تقرير المهام — ' + stName, txt);
}

function dashView() {
  const f = S.dash || (S.dash = { period: 'all', who: '', dep: '', meet: '', mode: 'tasks' });
  if (!f.mode) f.mode = 'tasks';
  const modeBar = '<div class="seg dsh-mode-seg" style="margin-bottom:14px;width:100%;max-width:520px">' +
    '<button type="button" class="' + (f.mode === 'tasks' ? 'on' : '') + '" data-dsh-mode="tasks" style="flex:1">📋 تقارير المهام والفريق</button>' +
    '<button type="button" class="' + (f.mode === 'orders' ? 'on' : '') + '" data-dsh-mode="orders" style="flex:1">💰 تقارير المبيعات والطلبات</button>' +
  '</div>';
  if (f.mode === 'orders' && typeof reportsHtml === 'function') {
    return modeBar + reportsHtml();
  }
  const D = dashCompute(dashUnits(S.tasks, S.done, S.members), f, new Date(), S.members), mx = Math.max(1, ...D.people.map(p => p.total));
  const opt = (v, l, cur) => '<option value="' + esc(v) + '" ' + (cur === v ? 'selected' : '') + '>' + esc(l) + '</option>';
  const per = { all: 'كل الفترات', 7: 'آخر 7 أيام', 30: 'آخر 30 يوماً', 90: 'آخر 90 يوماً' };
  const mname = id => id ? (S.meetings.find(m => m.id === id) || {}).title || 'اجتماع' : 'بدون اجتماع';
  const empty = '<div class="m" style="padding:8px 0">لا توجد بيانات لهذه الفترة.</div>';
  const curCo = typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '';
  const prof = typeof getCompanyProfile === 'function' ? getCompanyProfile(curCo || 'متجرك') : {};
  const stName = curCo ? (prof.displayName || curCo) : (BRAND.orgName || 'كل الشركات والفروع');
  const allDeps = typeof departmentsList === 'function' ? departmentsList() : [];
  const coList = typeof companiesList === 'function' ? companiesList() : ['متجرك'];
  const superAdm = typeof isSuperAdmin === 'function' && isSuperAdmin();
  const grade = D.rate >= 80 ? '🌟 أداء ممتاز' : D.rate >= 55 ? '👍 أداء جيد' : '⚠️ يحتاج متابعة';
  const medals = ['🥇 ', '🥈 ', '🥉 '];
  const rankedPeople = D.people.filter(p => p.total && p.email).map(p => ({ p, r: pct(p.done, p.total) })).sort((a, b) => b.r - a.r || b.p.done - a.p.done);

  return modeBar +
    '<div class="rpt-exec-hero">' +
      '<div class="reh-top">' +
        '<div class="reh-brand">' +
          (typeof companyLogoHtml === 'function' ? companyLogoHtml(curCo || 'متجرك', 48) : '') +
          '<div>' +
            '<div class="reh-badge">📊 المركز التنفيذي لأداء المهام · ' + grade + '</div>' +
            '<h2>' + esc(stName) + '</h2>' +
            '<div class="reh-sub">📅 ' + esc(per[f.period] || 'كل الفترات') + (f.dep ? ' · 🏛️ القسم: ' + esc(f.dep) : '') + ' · إجمالي المهام: <b>' + D.total + '</b></div>' +
          '</div>' +
        '</div>' +
        '<div class="reh-actions">' +
          '<button class="gold" id="ds_pr" type="button">🖨 طباعة تقرير رسمي (PDF)</button>' +
          '<button class="reh-btn" id="ds_wa_rem" type="button" style="border-color:rgba(52,211,153,.45);color:#6fcf9f">📲 تذكير الموظفين بالمتأخرات</button>' +
          '<button class="reh-btn" id="ds_wa" type="button">💬 ملخص واتساب</button>' +
          '<button class="reh-btn" id="ds_csv" type="button">⬇ تصدير CSV</button>' +
        '</div>' +
      '</div>' +
      (superAdm && coList.length > 1 ? '<div class="reh-co-pills">' +
        '<span class="reh-plbl">🏢 المتجر:</span>' +
        '<button type="button" class="reh-pill' + (!curCo ? ' on' : '') + '" data-ds-co="">🌐 كل الشركات (' + coList.length + ')</button>' +
        coList.map(c => {
          const cp = typeof getCompanyProfile === 'function' ? getCompanyProfile(c) : { displayName: c };
          return '<button type="button" class="reh-pill' + (same(curCo, c) ? ' on' : '') + '" data-ds-co="' + esc(c) + '">🏢 ' + esc(cp.displayName || c) + '</button>';
        }).join('') +
      '</div>' : '') +
      '<div class="reh-kpis">' +
        '<div class="reh-kpi">' +
          '<span class="reh-klbl">✅ نسبة الإنجاز العام</span>' +
          '<b class="reh-kval" style="color:#6fcf9f">' + D.rate + '%</b>' +
          '<div class="reh-bar"><i style="width:' + D.rate + '%;background:#34d399"></i></div>' +
        '</div>' +
        '<div class="reh-kpi">' +
          '<span class="reh-klbl">🎯 الالتزام بالموعد</span>' +
          '<b class="reh-kval" style="color:#f6e3a8">' + (D.onTimePct == null ? '—' : D.onTimePct + '%') + '</b>' +
          '<div class="reh-kfoot"><span>منجزة: ' + D.done + '</span><span>أنجزت بـ7 أيام: ' + D.week + '</span></div>' +
        '</div>' +
        '<div class="reh-kpi">' +
          '<span class="reh-klbl">📂 المفتوحة وقيد العمل</span>' +
          '<b class="reh-kval">' + D.open + ' <small>مهمة</small></b>' +
          '<div class="reh-kfoot"><span>قيد العمل: ' + D.doingOk + '</span><span>متوسط الإنجاز: ' + (D.avgDays == null ? '—' : D.avgDays + ' يوم') + '</span></div>' +
        '</div>' +
        '<div class="reh-kpi">' +
          '<span class="reh-klbl">🚨 المهام المتأخرة الآن</span>' +
          '<b class="reh-kval" style="color:' + (D.late ? '#fca5a5' : '#6fcf9f') + '">' + D.late + ' <small>مهمة</small></b>' +
          '<div class="reh-kfoot"><span>' + (D.late ? 'تحتاج متابعة عاجلة' : 'لا توجد متأخرات 🎉') + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="dsh-toolbar">' +
    '<input id="ds_q" type="search" value="' + esc(f.q || '') + '" placeholder="🔍 بحث في تقارير المهام، الموظفين، الأقسام..." style="flex:1 1 210px;min-width:170px">' +
    '<select id="ds_p">' + Object.entries(per).map(([k, v]) => opt(k, v, String(f.period))).join('') + '</select>' +
    '<select id="ds_dep">' + opt('', '🏛️ كل الأقسام والإدارات', f.dep || '') + allDeps.map(d => opt(d, d, f.dep || '')).join('') + '</select>' +
    '<select id="ds_w">' + opt('', '👤 كل الأعضاء', f.who) + S.members.map(m => opt(m.email, m.name, f.who)).join('') + '</select>' +
    '<select id="ds_m">' + opt('', '📅 كل الاجتماعات', f.meet) + S.meetings.map(m => opt(m.id, m.title, f.meet)).join('') + '</select></div>' +
    (D.noTime ? '<div class="m" style="margin:8px 2px">ℹ️ ' + D.noTime + ' مهمة منجزة قبل تفعيل تسجيل الوقت، لا تدخل في حساب المدد والاتجاه.</div>' : '') +
    '<div class="dsh-cols">' +
    '<div class="dsh-card"><h2>🎯 توزيع حالات المهام</h2>' + (D.total ? '<div class="dsh-flex">' + svgDonut([{ l: 'منجزة', n: D.done, c: 'var(--c-done)' }, { l: 'قيد العمل', n: D.doingOk, c: 'var(--c-doing)' }, { l: 'للتنفيذ', n: D.todoOk, c: 'var(--c-todo)' }, { l: 'متأخرة', n: D.late, c: 'var(--c-late)' }], D.rate + '%', 'منجزة') +
      '<div class="dsh-legend">' + [['منجزة', D.done, 'var(--c-done)'], ['قيد العمل', D.doingOk, 'var(--c-doing)'], ['للتنفيذ', D.todoOk, 'var(--c-todo)'], ['متأخرة', D.late, 'var(--c-late)']].map(([l, n, c]) => '<div><i style="background:' + c + '"></i>' + l + ' <b>' + n + '</b></div>').join('') + '</div></div>' : empty) + '</div>' +
    '<div class="dsh-card"><h2>📈 الاتجاه الأسبوعي (8 أسابيع)</h2>' + svgTrend(D.weeks) + '<div class="dsh-legend row-l"><div><i style="background:var(--c-todo)"></i>مهام جديدة</div><div><i style="background:var(--c-done)"></i>مهام منجزة</div></div></div>' +
    '<div class="dsh-card"><h2>🏛️ أداء الأقسام والإدارات</h2>' + (D.deps && D.deps.length ? D.deps.map(d => { const r = pct(d.done, d.total); return '<div class="dsh-rw"><span>' + esc(d.dep) + '</span><div class="dsh-bar" style="width:100%">' + seg(d.done, d.total, 'var(--c-done)') + seg(d.total - d.done - d.late, d.total, 'var(--c-todo)') + seg(d.late, d.total, 'var(--c-late)') + '</div><small>' + r + '% (' + d.done + '/' + d.total + ')</small></div>'; }).join('') : empty) + '</div>' +
    (D.stores && D.stores.length > 1 ? '<div class="dsh-card"><h2>🏢 الإنجاز حسب الشركة / الفرع</h2>' + D.stores.map(s => { const r = pct(s.done, s.total); return '<div class="dsh-rw"><span>' + esc(s.co) + '</span><div class="dsh-bar" style="width:100%">' + seg(s.done, s.total, 'var(--c-done)') + seg(s.total - s.done - s.late, s.total, 'var(--c-todo)') + seg(s.late, s.total, 'var(--c-late)') + '</div><small>' + r + '% (' + s.done + '/' + s.total + ')</small></div>'; }).join('') + '</div>' : '') +
    '<div class="dsh-card"><h2>توزيع حمل العمل</h2>' + (D.people.some(p => p.total) ? D.people.filter(p => p.total).map(p => '<div class="dsh-rw"><span>' + esc(p.email ? nm(p.email) : 'غير مُسند') + '</span><div class="dsh-bar" style="width:' + (100 * p.total / mx).toFixed(1) + '%">' + seg(p.done, p.total, 'var(--c-done)') + seg(p.open, p.total, 'var(--c-todo)') + seg(p.late, p.total, 'var(--c-late)') + '</div><small>' + p.done + '/' + p.total + '</small></div>').join('') +
      '<div class="dsh-legend row-l"><div><i style="background:var(--c-done)"></i>منجزة</div><div><i style="background:var(--c-todo)"></i>مفتوحة</div><div><i style="background:var(--c-late)"></i>متأخرة</div></div>' : empty) + '</div>' +
    '<div class="dsh-card"><h2>الإنجاز حسب الاجتماع</h2>' + (D.meets.length ? D.meets.map(r => '<div class="dsh-rw"><span>' + esc(mname(r.id)) + '</span><div class="dsh-bar" style="width:100%">' + seg(r.done, r.total || 1, 'var(--c-done)') + '</div><small>' + pct(r.done, r.total) + '%</small></div>').join('') : empty) + '</div>' +
    '<div class="dsh-card"><div class="bar" style="margin-bottom:6px"><h2 style="margin:0">تحتاج انتباهاً (الأقدم موعداً)</h2>' + (D.attention.length ? '<button class="s" type="button" id="ds_att_wa" style="font-size:12px;color:#128c7e">📲 تذكير واتساب</button>' : '') + '</div>' + (D.attention.length ? D.attention.map(dshRow).join('') : '<div class="m" style="padding:8px 0">لا شيء متأخر 🎉</div>') + '</div>' +
    '<div class="dsh-card"><h2>أُنجزت مؤخراً</h2>' + (D.recent.length ? D.recent.map(dshRow).join('') : '<div class="m" style="padding:8px 0">ستظهر هنا المهام المنجزة بعد تفعيل تسجيل الوقت.</div>') + '</div></div>' +
    // جدول تقييم الموظفين التفصيلي
    '<div class="card rpc" style="margin-top:14px"><div class="bar"><h2 style="margin:0">🏆 كشف تقييم وإنجاز الموظفين التفصيلي</h2><div class="row s" style="gap:6px"><button class="s" type="button" id="ds_wa_tbl" style="color:#128c7e">📲 تذكير الموظفين</button><button class="s" type="button" id="ds_pr2">🖨 طباعة الكشف</button></div></div>' +
      (rankedPeople.length ? '<div class="rpt-w" style="margin-top:10px"><table class="rpt"><thead><tr><th>الموظف</th><th>الشركة / الفرع</th><th>القسم</th><th>الإجمالي</th><th>منجزة</th><th>مفتوحة</th><th>متأخرة</th><th>نسبة الإنجاز</th><th>تذكير واتساب (دفعة)</th></tr></thead><tbody>' +
        rankedPeople.map((x, i) => {
          const m = (S.allMembers || S.members || []).find(z => same(z.email, x.p.email));
          const meta = m && typeof parseMemberMeta === 'function' ? parseMemberMeta(m) : { company: '', department: '' };
          const col = x.r >= 75 ? 'var(--ok)' : x.r >= 45 ? 'var(--gold)' : 'var(--late)';
          const hasPending = (x.p.late + x.p.open) > 0;
          const waAction = hasPending
            ? '<button type="button" class="s" data-emp-wa="' + esc(x.p.email) + '" style="font-size:12px;padding:4px 10px;' + (x.p.late ? 'background:var(--latesoft);color:var(--late);border-color:rgba(201,59,59,.3)' : 'color:#128c7e') + '">📲 ' + (x.p.late ? 'تذكير بالمتأخرات (' + x.p.late + ')' : 'متابعة (' + x.p.open + ')') + '</button>'
            : '<span class="m" style="font-size:12px">مكتمل ✓</span>';
          return '<tr><td><b>' + (medals[i] || (i + 1) + '. ') + esc(nm(x.p.email)) + '</b></td><td>' + esc(meta.company || 'متجرك') + '</td><td>' + esc(meta.department || '—') + '</td><td class="num"><b>' + x.p.total + '</b></td><td class="num" style="color:var(--ok)"><b>' + x.p.done + '</b></td><td class="num">' + x.p.open + '</td><td class="num" style="color:' + (x.p.late ? 'var(--late)' : 'var(--mute)') + '"><b>' + x.p.late + '</b></td><td class="num"><div class="rpt-pct-cell"><b>' + x.r + '%</b><div class="rpt-pbar"><i style="width:' + x.r + '%;background:' + col + '"></i></div></div></td><td>' + waAction + '</td></tr>';
        }).join('') +
      '</tbody></table></div>' : empty) +
    '</div>';
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
  const f = S.dash || (S.dash = { period: 'all', who: '', dep: '', meet: '', mode: 'tasks', q: '' });
  document.querySelectorAll('[data-dsh-mode]').forEach(b => b.onclick = () => { f.mode = b.dataset.dshMode; render(); });
  if (f.mode === 'orders') {
    if (typeof bindReports === 'function') bindReports();
    return;
  }
  const per = { all: 'كل الفترات', 7: 'آخر 7 أيام', 30: 'آخر 30 يوماً', 90: 'آخر 90 يوماً' };
  const D = dashCompute(dashUnits(S.tasks, S.done, S.members), f, new Date(), S.members);
  if ($('ds_q')) $('ds_q').oninput = e => {
    f.q = e.target.value;
    const pos = e.target.selectionStart || f.q.length;
    render();
    const el = $('ds_q');
    if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (_) {} }
  };
  if ($('ds_p')) $('ds_p').onchange = e => { f.period = e.target.value; render(); };
  if ($('ds_dep')) $('ds_dep').onchange = e => { f.dep = e.target.value; render(); };
  if ($('ds_w')) $('ds_w').onchange = e => { f.who = e.target.value; render(); };
  if ($('ds_m')) $('ds_m').onchange = e => { f.meet = e.target.value; render(); };
  document.querySelectorAll('[data-ds-co]').forEach(b => b.onclick = () => { S.activeCompany = b.dataset.dsCo; applyCompanyScope(); render(); });
  if ($('ds_pr')) $('ds_pr').onclick = () => printTasksReport(D, f, per);
  if ($('ds_pr2')) $('ds_pr2').onclick = () => printTasksReport(D, f, per);
  if ($('ds_wa')) $('ds_wa').onclick = () => dashWaSummary(D, f, per);
  if ($('ds_wa_rem')) $('ds_wa_rem').onclick = () => { if (typeof waRemindDialog === 'function') waRemindDialog(f.who || '', 'late'); };
  if ($('ds_wa_tbl')) $('ds_wa_tbl').onclick = () => { if (typeof waRemindDialog === 'function') waRemindDialog(f.who || '', 'late'); };
  if ($('ds_att_wa')) $('ds_att_wa').onclick = () => { if (typeof waRemindDialog === 'function') waRemindDialog(D.attention[0]?.who || '', 'late'); };
  document.querySelectorAll('[data-emp-wa]').forEach(b => b.onclick = () => {
    if (typeof waRemindDialog === 'function') waRemindDialog(b.dataset.empWa, 'late');
  });
  if ($('ds_csv')) $('ds_csv').onclick = () => downloadText('tasks-' + ymd(new Date()) + '.csv', dashCsv(D.U), 'text/csv;charset=utf-8');
  document.querySelectorAll('[data-open]').forEach(el => el.onclick = () => { const t = S.tasks.find(x => x.id === el.dataset.open); if (t) taskDialog(t); });
}
