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
function reportsHtml() {
  S.rp = S.rp || { period: '30', from: '', to: '', basis: 'order', scope: 'delivered' };
  const cc = canCost(), D = rpData(), R = D.rows; RPT.t = {};
  const del = D.all.filter(o => o.status === 'delivered'), can = D.all.filter(o => o.status === 'cancelled'), done = del.length + can.length;
  const sales = sum(R, o => +o.total), cost = sum(R, oCostTotal), fees = sum(R, o => +o.delivery_fee), gross = sum(R, oProfit);
  const kc = (v, l, c) => '<div class="stat ' + (c || '') + '"><b>' + v + '</b><span>' + l + '</span></div>';
  const items = R.flatMap(o => oItems(o.id).map(i => ({ o, i, line: +i.line_total, cost: (+i.qty) * costOf(i.id) })));
  const H = (h, t) => ({ h, t: t || 'n' }), C = (arr, extra) => cc ? arr.concat(extra) : arr;
  let h = '<div class="tools rpf"><label>الفترة<select id="rp_p">' + [['1', 'اليوم'], ['7', 'آخر 7 أيام'], ['30', 'آخر 30 يوماً'], ['m', 'هذا الشهر'], ['pm', 'الشهر الماضي'], ['y', 'هذه السنة'], ['all', 'الكل'], ['x', 'مخصص']].map(([v, l]) => '<option value="' + v + '"' + (S.rp.period === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    (S.rp.period === 'x' ? '<label>من<input id="rp_f" type="date" value="' + esc(S.rp.from) + '"></label><label>إلى<input id="rp_t" type="date" value="' + esc(S.rp.to) + '"></label>' : '') +
    '<label>الاعتماد على<select id="rp_b"><option value="order"' + (S.rp.basis === 'order' ? ' selected' : '') + '>تاريخ الطلب</option><option value="delivered"' + (S.rp.basis === 'delivered' ? ' selected' : '') + '>تاريخ التوصيل</option></select></label>' +
    '<label>الطلبات المحتسبة<select id="rp_s"><option value="delivered"' + (S.rp.scope === 'delivered' ? ' selected' : '') + '>المسلّمة فقط</option><option value="live"' + (S.rp.scope === 'live' ? ' selected' : '') + '>كل غير الملغية</option><option value="all"' + (S.rp.scope === 'all' ? ' selected' : '') + '>الكل</option></select></label></div>';
  h += '<div class="stats kpis rpk">' + kc(R.length, 'طلبات محتسبة') + kc(rpct(del.length, done) + '%', 'نسبة النجاح', 'ok') + kc(money(sales), 'المبيعات (' + BRAND.currency + ')') + kc(money(sum(R, o => +o.paid)), 'المحصّل') + kc(money(sum(R, o => Math.max(0, +o.balance))), 'المتبقي', 'late') + kc(money(R.length ? sales / R.length : 0), 'متوسط الطلب') +
    (cc ? kc(money(cost), 'تكلفة الشراء') + kc(money(gross), 'ربح البضاعة', gross >= 0 ? 'ok' : 'late') + kc(rpct(gross, sales - fees) + '%', 'هامش الربح') + kc(money(fees), 'رسوم توصيل محصّلة') : '') + '</div>';
  if (cc) h += '<p class="m" style="margin:-4px 4px 12px">ربح البضاعة = (مجموع الأصناف − الخصم) − سعر الشراء. رسوم التوصيل المحصّلة تُعرض منفصلة.</p>';
  h += trendHtml(D, cc);
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
  h += '<div class="card rpc"><div class="bar"><h2 style="margin:0">💳 ديون العملاء (طلبات مسلّمة غير مسدّدة)</h2><button class="s" data-ex="debts">⬇ CSV</button></div><p class="m" style="margin:4px 0 8px">الإجمالي: <b style="color:var(--late)">' + money(sum(debts, d => +d.o.balance)) + ' ' + BRAND.currency + '</b> — بغضّ النظر عن الفترة المختارة</p>' +
    (debts.length ? debts.slice(0, 40).map(d => '<div class="bar pr-r"><span><b>' + esc(d.o.customer_name) + '</b> <span class="m">#' + d.o.order_no + ' · منذ ' + d.age + ' يوم</span></span><span><b style="color:var(--late)">' + money(d.o.balance) + '</b> ' + (d.o.phone ? '<button class="s" data-rem="' + d.o.id + '">📲 تذكير</button>' : '') + ' <button class="s" data-rpay="' + d.o.id + '">💰</button></span></div>').join('') : '<div class="empty">لا توجد ديون 🎉</div>') + '</div>';
  return h + '<div class="row" style="margin:6px 0 20px"><button class="s" id="rp_all">⬇ تصدير كل الجداول (CSV)</button></div>';
}
function bindReports() {
  const set = (k, v) => { S.rp[k] = v; render(); };
  $('rp_p').onchange = e => set('period', e.target.value);
  if ($('rp_f')) { $('rp_f').onchange = e => set('from', e.target.value); $('rp_t').onchange = e => set('to', e.target.value); }
  $('rp_b').onchange = e => set('basis', e.target.value); $('rp_s').onchange = e => set('scope', e.target.value);
  document.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { const t = RPT.t[b.dataset.ex]; if (t) csvDownload('تقرير-' + t.title.replace(/[^\u0600-\u06FFa-zA-Z0-9]+/g, '-'), t.heads, t.rows); });
  $('rp_all').onclick = () => Object.keys(RPT.t).forEach((k, i) => setTimeout(() => csvDownload('تقرير-' + k, RPT.t[k].heads, RPT.t[k].rows), i * 350));
  document.querySelectorAll('[data-rem]').forEach(b => b.onclick = () => { const o = oOf(b.dataset.rem); window.open('https://wa.me/' + waPhone(o.phone) + '?text=' + encodeURIComponent('السلام عليكم ' + o.customer_name + ' 🌹\nنذكّركم بسداد المبلغ المتبقي ' + money(o.balance) + ' ' + BRAND.currency + ' عن الطلب #' + o.order_no + '.\nشاكرين لكم — ' + bn()), '_blank'); });
  document.querySelectorAll('[data-rpay]').forEach(b => b.onclick = () => payDialog(oOf(b.dataset.rpay)));
}
