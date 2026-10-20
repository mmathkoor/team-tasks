// ===== تقارير الطلبات: المندوبون، مسجّلو الطلبات، التجار، الأصناف، العملاء، القنوات، الإلغاء، الاتجاه، الديون =====
const RPT = { t: {} };
const lymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function rpRange() {
  const rp = S.rp, t = new Date(), back = n => { const d = new Date(); d.setDate(d.getDate() - n); return lymd(d); }, today_ = lymd(t);
  if (rp.period === '1') return [today_, today_];
  if (rp.period === '7') return [back(6), today_];
  if (rp.period === '30') return [back(29), today_];
  if (rp.period === 'm') return [lymd(new Date(t.getFullYear(), t.getMonth(), 1)), today_];
  if (rp.period === 'pm') return [lymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), lymd(new Date(t.getFullYear(), t.getMonth(), 0))];
  if (rp.period === 'y') return [t.getFullYear() + '-01-01', today_];
  if (rp.period === 'x') return [rp.from || '2000-01-01', rp.to || today_];
  return ['2000-01-01', '2999-12-31'];
}
const dOf = o => S.rp.basis === 'delivered' ? String(o.delivered_at || '').slice(0, 10) : String(o.order_date);
function rpData() {
  const [f, t] = rpRange(), inR = (S.orders || []).filter(o => { const d = dOf(o); return d && d >= f && d <= t; });
  const live = o => o.status !== 'cancelled' && o.status !== 'returned';
  const scope = S.rp.scope === 'delivered' ? inR.filter(o => o.status === 'delivered') : S.rp.scope === 'live' ? inR.filter(live) : inR;
  return { all: inR, rows: scope, f, t };
}
const sum = (a, fn) => a.reduce((x, o) => x + fn(o), 0);
const rpct = (a, b) => b ? Math.round(100 * a / b) : 0;
const hrs = (a, b) => (new Date(b) - new Date(a)) / 36e5;
function groupBy(rows, keyFn) { const m = new Map(); rows.forEach(o => { const k = keyFn(o) || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(o); }); return [...m.entries()]; }
function tcard(key, title, heads, rows, note) {
  RPT.t[key] = { title, heads, rows };
  const fmt = (c, h) => h.t === 'n' ? money(c) : h.t === 'p' ? c + '%' : h.t === 'h' ? (c ? c.toFixed(1) + ' س' : '—') : esc(c);
  return '<div class="card rpc"><div class="bar"><h2 style="margin:0">' + title + '</h2><button class="s" data-ex="' + key + '">⬇ CSV</button></div>' + (note ? '<p class="m" style="margin:4px 0 8px">' + note + '</p>' : '') +
    (rows.length ? '<div class="rpt-w"><table class="rpt"><thead><tr>' + heads.map(h => '<th>' + h.h + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr>' + r.map((c, i) => '<td' + (heads[i].t !== 's' ? ' class="num"' : '') + '>' + fmt(c, heads[i]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' : '<div class="empty">لا بيانات في هذه الفترة</div>') + '</div>';
}
function csvDownload(name, heads, rows) {
  const q = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const csv = '\uFEFF' + [heads.map(h => q(h.h)).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name + '-' + today() + '.csv'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function rptChartsGridHtml(D, items, cc) {
  const all = D.all || [];
  const nDel = all.filter(o => o.status === 'delivered').length;
  const nPrep = all.filter(o => o.status === 'preparing').length;
  const nNew = all.filter(o => o.status === 'new').length;
  const nCan = all.filter(o => o.status === 'cancelled' || o.status === 'returned').length;
  const rate = (nDel + nCan) ? Math.round(100 * nDel / (nDel + nCan)) : 0;

  const donut = typeof svgDonut === 'function' ? svgDonut([
    { l: 'تم التوصيل', n: nDel, c: 'var(--c-done)' },
    { l: 'قيد التجهيز', n: nPrep, c: 'var(--c-doing)' },
    { l: 'جديد', n: nNew, c: 'var(--c-todo)' },
    { l: 'ملغي/مرتجع', n: nCan, c: 'var(--c-late)' }
  ], rate + '%', 'نجاح') : '';

  const repList = groupBy(all.filter(o => o.rep_email), o => repName(o.rep_email)).map(([k, a]) => {
    const d = a.filter(o => o.status === 'delivered').length;
    return { name: k, total: a.length, del: d, pct: rpct(d, a.length) };
  }).sort((a, b) => b.del - a.del).slice(0, 5);

  const prodList = groupBy(items, x => x.i.name).map(([k, a]) => ({
    name: k, qty: sum(a, x => +x.i.qty), sales: sum(a, x => x.line)
  })).sort((a, b) => b.sales - a.sales).slice(0, 5);
  const maxProd = prodList.length ? Math.max(1, prodList[0].sales) : 1;

  return '<div class="ord-viz-grid" style="margin-bottom:12px">' +
    '<div class="ord-vcard"><div class="ov-title">🎯 توزيع حالات الفترة (' + all.length + ' طلب)</div>' +
      '<div class="dsh-flex">' + donut +
        '<div class="dsh-legend">' +
          '<div><i style="background:var(--c-done)"></i>تم التوصيل <b>' + nDel + '</b></div>' +
          '<div><i style="background:var(--c-doing)"></i>قيد التجهيز <b>' + nPrep + '</b></div>' +
          '<div><i style="background:var(--c-todo)"></i>جديد <b>' + nNew + '</b></div>' +
          '<div><i style="background:var(--c-late)"></i>ملغي/مرتجع <b>' + nCan + '</b></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="ord-vcard"><div class="ov-title">🛵 مؤشر إنجاز المناديب</div>' +
      (repList.length ? '<div class="ov-bars">' + repList.map(r => '<div class="ov-bar-row"><div class="bar" style="font-size:12.5px"><span>' + esc(r.name) + '</span><b style="font-variant-numeric:tabular-nums">' + r.del + '/' + r.total + ' (' + r.pct + '%)</b></div><div class="dsh-bar"><i style="width:' + Math.max(5, r.pct) + '%;background:var(--c-done)"></i></div></div>').join('') + '</div>' : '<div class="m" style="padding:14px 0;text-align:center">لا توجد طلبات مسندة لمناديب في هذه الفترة</div>') +
    '</div>' +
    '<div class="ord-vcard"><div class="ov-title">📦 أعلى الأصناف مبيعاً (رسومي)</div>' +
      (prodList.length ? '<div class="ov-bars">' + prodList.map(p => '<div class="ov-bar-row"><div class="bar" style="font-size:12.5px"><span>' + esc(p.name) + ' <small class="m">(×' + p.qty + ')</small></span><b style="font-variant-numeric:tabular-nums">' + money(p.sales) + '</b></div><div class="dsh-bar"><i style="width:' + Math.max(6, Math.round(100 * p.sales / maxProd)) + '%;background:var(--gold)"></i></div></div>').join('') + '</div>' : '<div class="m" style="padding:14px 0;text-align:center">لا توجد مبيعات أصناف في هذه الفترة</div>') +
    '</div>' +
  '</div>';
}
function trendHtml(D, cc) {
  const days = Math.round((new Date(D.t) - new Date(D.f)) / 864e5) + 1, byMonth = days > 62;
  let from = D.f; if (S.rp.period === 'all' && D.rows.length) from = D.rows.map(dOf).sort()[0];
  const keys = [], cur = new Date(from + 'T00:00:00'), end = new Date(Math.min(new Date(D.t + 'T00:00:00'), new Date())); 
  while (cur <= end && keys.length < 400) { keys.push(byMonth ? lymd(cur).slice(0, 7) : lymd(cur)); if (byMonth) cur.setMonth(cur.getMonth() + 1, 1); else cur.setDate(cur.getDate() + 1); }
  const uniq = [...new Set(keys)], m = {}; uniq.forEach(k => { m[k] = { n: 0, s: 0, p: 0 }; });
  D.rows.forEach(o => { const k = byMonth ? dOf(o).slice(0, 7) : dOf(o); if (m[k]) { m[k].n++; m[k].s += +o.total; m[k].p += oProfit(o); } });
  const mx = Math.max(1, ...uniq.map(k => m[k].s));
  return '<div class="card rpc"><h2>📈 الاتجاه ' + (byMonth ? '(شهرياً)' : '(يومياً)') + '</h2><div class="trend">' + uniq.map(k => '<div class="tcol" title="' + k + ' — ' + m[k].n + ' طلب · مبيعات ' + money(m[k].s) + (cc ? ' · ربح ' + money(m[k].p) : '') + '"><i style="height:' + Math.max(m[k].s ? 4 : 0, Math.round(100 * m[k].s / mx)) + '%"></i><span>' + (byMonth ? k.slice(5) : k.slice(8)) + '</span></div>').join('') + '</div><p class="m">ارتفاع العمود = قيمة المبيعات. مرّر/اضغط على العمود لعرض التفاصيل.</p></div>';
}
function printOrderReport(D, cc) {
  const R = D.rows || [], all = D.all || [];
  const curCo = typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '';
  const prof = typeof getCompanyProfile === 'function' ? getCompanyProfile(curCo || 'متجرك') : {};
  const stName = curCo ? (prof.displayName || curCo) : (BRAND.orgName || 'كل الشركات والفروع');
  const cur = curCo ? (prof.currency || BRAND.currency || 'ر.ي') : (BRAND.currency || 'ر.ي');
  const del = all.filter(o => o.status === 'delivered'), can = all.filter(o => o.status === 'cancelled');
  const sales = sum(R, o => +o.total), paid = sum(R, o => +o.paid), bal = sum(R, o => Math.max(0, +o.balance));
  const cost = sum(R, oCostTotal), fees = sum(R, o => +o.delivery_fee), gross = sum(R, oProfit);
  const logoHtml = prof.logo ? '<img src="' + esc(prof.logo) + '" style="width:58px;height:58px;object-fit:contain;border-radius:12px;border:1px solid #e4e9f2;padding:4px;background:#fff">' : '';
  const repRows = groupBy(all.filter(o => o.rep_email), o => repName(o.rep_email)).map(([k, a]) => {
    const d = a.filter(o => o.status === 'delivered');
    return '<tr><td><b>' + esc(k) + '</b></td><td>' + a.length + '</td><td>' + d.length + '</td><td>' + rpct(d.length, a.length) + '%</td><td><b>' + money(sum(d, o => +o.total)) + ' ' + esc(cur) + '</b></td></tr>';
  }).join('');
  const supItems = R.flatMap(o => oItems(o.id).map(i => ({ o, i, line: +i.line_total, cost: (+i.qty) * costOf(i.id) })));
  const supRows = groupBy(supItems, x => x.i.supplier || 'غير محدد').map(([k, a]) =>
    '<tr><td><b>' + esc(k) + '</b></td><td>' + sum(a, x => +x.i.qty) + '</td><td>' + money(sum(a, x => x.line)) + ' ' + esc(cur) + '</td>' + (cc ? '<td>' + money(sum(a, x => x.cost)) + ' ' + esc(cur) + '</td><td><b>' + money(sum(a, x => x.line - x.cost)) + ' ' + esc(cur) + '</b></td>' : '') + '</tr>'
  ).join('');
  const w = window.open('', '_blank');
  if (!w) { toast('الرجاء السماح بالنوافذ المنبثقة للطباعة', false); return; }
  w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير المبيعات والطلبات - ' + esc(stName) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">' +
    '<style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Tajawal,Tahoma,sans-serif;color:#0f1d35;margin:0;padding:18px;background:#fff;font-size:13px}' +
    '.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #c9a24e;padding-bottom:12px;margin-bottom:16px}' +
    '.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.kpi{border:1px solid #dde3ee;border-radius:10px;padding:10px 12px;background:#f9fafc}' +
    '.kpi b{display:block;font-size:18px;color:#0e1a2f}.kpi span{font-size:11.5px;color:#66758c}' +
    'h3{margin:16px 0 8px;font-size:15px;color:#0e1a2f;border-right:4px solid #c9a24e;padding-right:8px}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12.5px}th{background:#0e1a2f;color:#f6e3a8;padding:8px;text-align:right}td{padding:7px 8px;border-bottom:1px solid #e6ebf2}tr:nth-child(even) td{background:#f9fbff}' +
    '.nopr{margin-bottom:14px;display:flex;gap:8px}@media print{.nopr{display:none!important}}</style></head><body>' +
    '<div class="nopr"><button onclick="window.print()" style="padding:8px 18px;background:#0e1a2f;color:#f6e3a8;border:0;border-radius:8px;font:700 14px Tajawal;cursor:pointer">🖨 طباعة / حفظ PDF</button><button onclick="window.close()" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:8px;font:600 13px Tajawal;cursor:pointer">إغلاق</button></div>' +
    '<div class="hdr"><div style="display:flex;align-items:center;gap:12px">' + logoHtml + '<div><h1 style="margin:0;font-size:22px">' + esc(stName) + '</h1><div style="color:#66758c;font-size:12.5px">تقرير المبيعات والعمليات التنفيذي · الفترة: ' + esc(D.f) + ' إلى ' + esc(D.t) + '</div></div></div>' +
    '<div style="text-align:left;font-size:12px;color:#66758c">تاريخ الإصدار: ' + today() + '<br>إجمالي الطلبات: <b>' + all.length + '</b></div></div>' +
    '<div class="kpis">' +
      '<div class="kpi"><b>' + R.length + ' (' + rpct(del.length, del.length + can.length) + '% نجاح)</b><span>الطلبات المحتسبة</span></div>' +
      '<div class="kpi"><b>' + money(sales) + ' ' + esc(cur) + '</b><span>إجمالي المبيعات</span></div>' +
      '<div class="kpi"><b style="color:#12805c">' + money(paid) + ' ' + esc(cur) + '</b><span>المحصّل الفعلي</span></div>' +
      '<div class="kpi"><b style="color:#c93b3b">' + money(bal) + ' ' + esc(cur) + '</b><span>الديون المتبقية</span></div>' +
      (cc ? '<div class="kpi"><b>' + money(cost) + ' ' + esc(cur) + '</b><span>تكلفة الشراء</span></div>' +
            '<div class="kpi"><b style="color:#12805c">' + money(gross) + ' ' + esc(cur) + '</b><span>صافي ربح البضاعة</span></div>' +
            '<div class="kpi"><b>' + rpct(gross, sales - fees) + '%</b><span>هامش الربح</span></div>' +
            '<div class="kpi"><b>' + money(fees) + ' ' + esc(cur) + '</b><span>رسوم التوصيل</span></div>' : '') +
    '</div>' +
    (repRows ? '<h3>🛵 أداء مندوبي التوصيل</h3><table><thead><tr><th>المندوب</th><th>الطلبات</th><th>المسلّمة</th><th>نسبة الإنجاز</th><th>قيمة المسلّم</th></tr></thead><tbody>' + repRows + '</tbody></table>' : '') +
    (supRows ? '<h3>🏪 ملخص التجار ومصادر الشراء</h3><table><thead><tr><th>التاجر</th><th>الكمية</th><th>إجمالي البيع</th>' + (cc ? '<th>مستحق التاجر (التكلفة)</th><th>صافي الربح</th>' : '') + '</tr></thead><tbody>' + supRows + '</tbody></table>' : '') +
    '<div style="margin-top:20px;padding-top:10px;border-top:1px solid #dde3ee;display:flex;justify-content:space-between;font-size:11.5px;color:#66758c"><span>تم الإنشاء آلياً عبر منصة الإدارة</span><span>' + esc(stName) + '</span></div>' +
    '</body></html>');
  w.document.close();
}

function waOrderReport(D, cc) {
  const R = D.rows || [], all = D.all || [];
  const curCo = typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '';
  const prof = typeof getCompanyProfile === 'function' ? getCompanyProfile(curCo || 'متجرك') : {};
  const stName = curCo ? (prof.displayName || curCo) : (BRAND.orgName || 'كل الشركات');
  const cur = curCo ? (prof.currency || BRAND.currency || 'ر.ي') : (BRAND.currency || 'ر.ي');
  const del = all.filter(o => o.status === 'delivered'), can = all.filter(o => o.status === 'cancelled');
  const sales = sum(R, o => +o.total), paid = sum(R, o => +o.paid), bal = sum(R, o => Math.max(0, +o.balance));
  const gross = sum(R, oProfit);
  const txt = [
    '📊 *التقرير التنفيذي للمبيعات — ' + stName + '*',
    '📅 الفترة: ' + D.f + ' إلى ' + D.t,
    '━━━━━━━━━━━━━━',
    '📦 إجمالي الطلبات: *' + all.length + '* (مسلّم: ' + del.length + ' | ملغي: ' + can.length + ')',
    '✅ نسبة النجاح: *' + rpct(del.length, del.length + can.length) + '%*',
    '💰 إجمالي المبيعات: *' + money(sales) + ' ' + cur + '*',
    '💵 المحصّل: *' + money(paid) + ' ' + cur + '*',
    '⏳ المتبقي (ديون): *' + money(bal) + ' ' + cur + '*',
    cc ? '📈 صافي ربح البضاعة: *' + money(gross) + ' ' + cur + '*' : ''
  ].filter(Boolean).join('\n');
  navigator.clipboard?.writeText(txt);
  toast('تم نسخ ملخص التقرير التنفيذي للحافظة 📋');
}

function reportsHtml() {
  S.rp = S.rp || { period: '30', from: '', to: '', basis: 'order', scope: 'delivered' };
  const curCo = typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '';
  const curProf = typeof getCompanyProfile === 'function' ? getCompanyProfile(curCo || 'متجرك') : {};
  const curSym = curCo ? (curProf.currency || BRAND.currency || 'ر.ي') : (BRAND.currency || 'ر.ي');
  const cc = canCost(), D = rpData(), R = D.rows; RPT.t = {};
  const del = D.all.filter(o => o.status === 'delivered'), can = D.all.filter(o => o.status === 'cancelled'), done = del.length + can.length;
  const sales = sum(R, o => +o.total), cost = sum(R, oCostTotal), fees = sum(R, o => +o.delivery_fee), gross = sum(R, oProfit);
  const kc = (v, l, c) => '<div class="stat ' + (c || '') + '"><b>' + v + '</b><span>' + l + '</span></div>';
  const items = R.flatMap(o => oItems(o.id).map(i => ({ o, i, line: +i.line_total, cost: (+i.qty) * costOf(i.id) })));
  const H = (h, t) => ({ h, t: t || 'n' }), C = (arr, extra) => cc ? arr.concat(extra) : arr;
  let h = '<div class="tools rpf" style="align-items:flex-end"><label>الفترة<select id="rp_p">' + [['1', 'اليوم'], ['7', 'آخر 7 أيام'], ['30', 'آخر 30 يوماً'], ['m', 'هذا الشهر'], ['pm', 'الشهر الماضي'], ['y', 'هذه السنة'], ['all', 'الكل'], ['x', 'مخصص']].map(([v, l]) => '<option value="' + v + '"' + (S.rp.period === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    (S.rp.period === 'x' ? '<label>من<input id="rp_f" type="date" value="' + esc(S.rp.from) + '"></label><label>إلى<input id="rp_t" type="date" value="' + esc(S.rp.to) + '"></label>' : '') +
    '<label>الاعتماد على<select id="rp_b"><option value="order"' + (S.rp.basis === 'order' ? ' selected' : '') + '>تاريخ الطلب</option><option value="delivered"' + (S.rp.basis === 'delivered' ? ' selected' : '') + '>تاريخ التوصيل</option></select></label>' +
    '<label>الطلبات المحتسبة<select id="rp_s"><option value="delivered"' + (S.rp.scope === 'delivered' ? ' selected' : '') + '>المسلّمة فقط</option><option value="live"' + (S.rp.scope === 'live' ? ' selected' : '') + '>كل غير الملغية</option><option value="all"' + (S.rp.scope === 'all' ? ' selected' : '') + '>الكل</option></select></label>' +
    '<div class="row s" style="margin-inline-start:auto;gap:6px;flex-wrap:wrap">' +
      '<button class="gold" id="rp_print" type="button">🖨 طباعة تقرير رسمي (PDF)</button>' +
      '<button class="s" id="rp_wa" type="button">📋 نسخ ملخص واتساب</button>' +
      '<button class="s" id="rp_all" type="button">⬇ تصدير الكل CSV</button>' +
    '</div></div>';
  h += '<div class="stats kpis rpk">' + kc(R.length, 'طلبات محتسبة') + kc(rpct(del.length, done) + '%', 'نسبة النجاح', 'ok') + kc(money(sales), 'المبيعات (' + esc(curSym) + ')') + kc(money(sum(R, o => +o.paid)), 'المحصّل') + kc(money(sum(R, o => Math.max(0, +o.balance))), 'المتبقي', 'late') + kc(money(R.length ? sales / R.length : 0), 'متوسط الطلب') +
    (cc ? kc(money(cost), 'تكلفة الشراء') + kc(money(gross), 'ربح البضاعة', gross >= 0 ? 'ok' : 'late') + kc(rpct(gross, sales - fees) + '%', 'هامش الربح') + kc(money(fees), 'رسوم توصيل محصّلة') : '') + '</div>';
  if (cc) h += '<p class="m" style="margin:-4px 4px 12px">ربح البضاعة = (مجموع الأصناف − الخصم) − سعر الشراء. رسوم التوصيل المحصّلة تُعرض منفصلة.</p>';
  h += rptChartsGridHtml(D, items, cc);
  h += trendHtml(D, cc);
  // مقارنة أداء الشركات والمتاجر (تظهر عند وجود أكثر من متجر أو عرض الكل)
  if (typeof orderCompany === 'function' && (!curCo || (typeof companiesList === 'function' && companiesList().length > 1))) {
    const coRows = groupBy(D.all, o => orderCompany(o) || 'متجرك').map(([k, a]) => {
      const r = a.filter(o => R.includes(o)), d = a.filter(o => o.status === 'delivered'), c = a.filter(o => o.status === 'cancelled');
      return C([k, a.length, d.length, c.length, rpct(d.length, d.length + c.length), sum(r, o => +o.total), sum(r, o => +o.paid), sum(r, o => Math.max(0, +o.balance))], [sum(r, oProfit)]);
    }).sort((a, b) => b[5] - a[5]);
    if (coRows.length) {
      h += tcard('stores', '🏢 مقارنة أداء المتاجر والشركات', C([H('المتجر / الشركة', 's'), H('إجمالي الطلبات'), H('المسلّمة'), H('الملغية'), H('نسبة النجاح', 'p'), H('المبيعات'), H('المحصّل'), H('الديون المتبقية')], [H('صافي الربح')]), coRows, 'مقارنة شاملة لأداء كل متجر أو فرع خلال الفترة المحددة.');
    }
  }
  // حسب المندوب
  const repRows = groupBy(D.all.filter(o => o.rep_email), o => repName(o.rep_email)).map(([k, a]) => { const d = a.filter(o => o.status === 'delivered'), c = a.filter(o => o.status === 'cancelled'), tt = d.filter(o => o.delivered_at).map(o => hrs(o.created_at, o.delivered_at)); return [k, a.length, d.length, c.length, rpct(d.length, d.length + c.length), sum(d, o => +o.total), tt.length ? tt.reduce((x, y) => x + y, 0) / tt.length : 0]; }).sort((a, b) => b[2] - a[2]);
  h += tcard('rep', '🛵 أداء المناديب', [H('المندوب', 's'), H('طلبات مسندة'), H('تم التوصيل'), H('ملغية'), H('نسبة النجاح', 'p'), H('قيمة المسلّم'), H('متوسط زمن الإنجاز', 'h')], repRows, 'يعتمد على كل طلبات الفترة (وليس فقط المحتسبة). زمن الإنجاز = من تسجيل الطلب حتى التسليم.');
  // حسب مسجّل الطلب
  const crRows = groupBy(D.all, o => creatorName(o.created_by)).map(([k, a]) => { const r = a.filter(o => R.includes(o)); return C([k, a.length, a.filter(o => o.status === 'delivered').length, a.filter(o => o.status === 'cancelled').length, rpct(a.filter(o => o.status === 'cancelled').length, a.length), sum(r, o => +o.total), r.length ? sum(r, o => +o.total) / r.length : 0], [sum(r, oProfit)]); }).sort((a, b) => b[5] - a[5]);
  h += tcard('creator', '🧑‍💼 مسجّلو الطلبات', C([H('المسجّل', 's'), H('طلبات'), H('مسلّمة'), H('ملغية'), H('نسبة الإلغاء', 'p'), H('المبيعات'), H('متوسط الطلب')], [H('الربح')]), crRows);
  // حسب التاجر
  const supRows = groupBy(items, x => x.i.supplier).map(([k, a]) => C([k, a.length, sum(a, x => +x.i.qty), sum(a, x => x.line)], [sum(a, x => x.cost), sum(a, x => x.line - x.cost), rpct(sum(a, x => x.line - x.cost), sum(a, x => x.line))])).sort((a, b) => b[3] - a[3]);
  h += tcard('supplier', '🏪 التجار / مصادر الشراء', C([H('التاجر', 's'), H('عدد الأصناف'), H('الكمية'), H('قيمة البيع')], [H('مستحق للتاجر (الشراء)'), H('الربح'), H('الهامش', 'p')]), supRows, 'قيمة الشراء هي ما تدفعه للتاجر عن الأصناف المحتسبة.');
  // حسب الصنف
  const itRows = groupBy(items, x => x.i.name).map(([k, a]) => C([k, sum(a, x => +x.i.qty), sum(a, x => x.line)], [sum(a, x => x.cost), sum(a, x => x.line - x.cost)])).sort((a, b) => b[2] - a[2]).slice(0, 25);
  h += tcard('items', '📦 أكثر الأصناف مبيعاً', C([H('الصنف', 's'), H('الكمية'), H('المبيعات')], [H('التكلفة'), H('الربح')]), itRows);
  // العملاء
  const cuRows = groupBy(R, o => digits(o.phone) || o.customer_name).map(([k, a]) => [a[0].customer_name, a[0].phone || '', a.length, sum(a, o => +o.total), sum(a, o => Math.max(0, +o.balance))]).sort((a, b) => b[3] - a[3]).slice(0, 25);
  h += tcard('customers', '👥 أفضل العملاء', [H('العميل', 's'), H('الهاتف', 's'), H('طلبات'), H('المشتريات'), H('متبقي عليه')], cuRows);
  // القنوات
  const chRows = groupBy(D.all, o => o.channel || 'غير محدد').map(([k, a]) => { const d = a.filter(o => o.status === 'delivered'); return [k, a.length, d.length, rpct(d.length, a.length), sum(d, o => +o.total)]; }).sort((a, b) => b[1] - a[1]);
  h += tcard('channels', '📣 قنوات الطلب', [H('القناة', 's'), H('طلبات'), H('مسلّمة'), H('نسبة التسليم', 'p'), H('المبيعات')], chRows);
  // أسباب الإلغاء
  const rsRows = groupBy(can, o => String(o.cancel_reason || '').trim()).map(([k, a]) => [k, a.length, rpct(a.length, can.length), [...new Set(a.map(o => o.rep_email ? repName(o.rep_email) : creatorName(o.created_by)))].join('، ')]).sort((a, b) => b[1] - a[1]);
  h += tcard('cancel', '❌ أسباب الإلغاء', [H('السبب', 's'), H('العدد'), H('النسبة', 'p'), H('المندوب/المسجّل', 's')], rsRows);
  // الديون (كل الفترات)
  const debts = (S.orders || []).filter(o => o.status === 'delivered' && +o.balance > 0).map(o => ({ o, age: Math.max(0, Math.round((Date.now() - new Date(o.delivered_at || o.created_at)) / 864e5)) })).sort((a, b) => b.o.balance - a.o.balance);
  RPT.t.debts = { title: 'ديون العملاء', heads: [H('العميل', 's'), H('الهاتف', 's'), H('رقم الطلب', 's'), H('المتبقي'), H('أيام منذ التسليم')], rows: debts.map(d => [d.o.customer_name, d.o.phone || '', '#' + d.o.order_no, +d.o.balance, d.age]) };
  h += '<div class="card rpc"><div class="bar"><h2 style="margin:0">💳 ديون العملاء (طلبات مسلّمة غير مسدّدة)</h2><button class="s" data-ex="debts">⬇ CSV</button></div><p class="m" style="margin:4px 0 8px">الإجمالي: <b style="color:var(--late)">' + money(sum(debts, d => +d.o.balance)) + ' ' + esc(curSym) + '</b> — بغضّ النظر عن الفترة المختارة</p>' +
    (debts.length ? debts.slice(0, 40).map(d => '<div class="bar pr-r"><span><b>' + esc(d.o.customer_name) + '</b> <span class="m">#' + d.o.order_no + ' · منذ ' + d.age + ' يوم</span></span><span><b style="color:var(--late)">' + money(d.o.balance) + ' ' + esc(bcurr(d.o)) + '</b> ' + (d.o.phone ? '<button class="s" data-rem="' + d.o.id + '">📲 تذكير</button>' : '') + ' <button class="s" data-rpay="' + d.o.id + '">💰</button></span></div>').join('') : '<div class="empty">لا توجد ديون 🎉</div>') + '</div>';
  return h;
}
function bindReports() {
  const set = (k, v) => { S.rp[k] = v; render(); };
  $('rp_p').onchange = e => set('period', e.target.value);
  if ($('rp_f')) { $('rp_f').onchange = e => set('from', e.target.value); $('rp_t').onchange = e => set('to', e.target.value); }
  $('rp_b').onchange = e => set('basis', e.target.value); $('rp_s').onchange = e => set('scope', e.target.value);
  document.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { const t = RPT.t[b.dataset.ex]; if (t) csvDownload('تقرير-' + t.title.replace(/[^\u0600-\u06FFa-zA-Z0-9]+/g, '-'), t.heads, t.rows); });
  if ($('rp_all')) $('rp_all').onclick = () => Object.keys(RPT.t).forEach((k, i) => setTimeout(() => csvDownload('تقرير-' + k, RPT.t[k].heads, RPT.t[k].rows), i * 350));
  if ($('rp_print')) $('rp_print').onclick = () => printOrderReport(rpData(), canCost());
  if ($('rp_wa')) $('rp_wa').onclick = () => waOrderReport(rpData(), canCost());
  document.querySelectorAll('[data-rem]').forEach(b => b.onclick = () => { const o = oOf(b.dataset.rem); window.open('https://wa.me/' + waPhone(o.phone) + '?text=' + encodeURIComponent('السلام عليكم ' + o.customer_name + ' 🌹\nنذكّركم بسداد المبلغ المتبقي ' + money(o.balance) + ' ' + bcurr(o) + ' عن الطلب #' + o.order_no + '.\nشاكرين لكم — ' + bn(o)), '_blank'); });
  document.querySelectorAll('[data-rpay]').forEach(b => b.onclick = () => payDialog(oOf(b.dataset.rpay)));
}
