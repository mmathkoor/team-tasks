// ===== إدارة الطلبات (للفريق): لوحة حالات + طلب ببنوده ودفعاته + فاتورة + واتساب =====
const OST = { new: 'جديد', preparing: 'قيد التجهيز', delivered: 'تم التوصيل', cancelled: 'ملغي', returned: 'مرتجع' };
const OCOLS = [['new', 'جديد'], ['preparing', 'قيد التجهيز'], ['delivered', 'تم التوصيل'], ['closed', 'ملغي / مرتجع']];
const OCH = ['واتساب', 'تيك توك', 'سناب شات', 'انستغرام', 'فيسبوك', 'زيارة المتجر', 'أخرى'];
const OPAYM = ['نقداً', 'تحويل بنكي', 'محفظة إلكترونية', 'أخرى'];
const money = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const oOf = id => (S.orders || []).find(o => o.id === id);
const oItems = id => (S.oitems || []).filter(i => i.order_id === id).sort((a, b) => a.pos - b.pos);
const oPays = id => (S.opay || []).filter(p => p.order_id === id);
const repName = e => e ? (((S.reps || []).find(r => same(r.email, e)) || {}).name || e) : 'بدون مندوب';
const creatorName = e => (S.members || []).find(m => same(m.email, e))?.name || e || '';
const digits = p => String(p || '').replace(/\D/g, '');
function waPhone(p) {      // رقم يمني محلي ← صيغة دولية لواتساب
  let d = digits(p); if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && d[0] === '7') d = BRAND.waCountry + d; else if (d.length === 10 && d[0] === '0') d = BRAND.waCountry + d.slice(1);
  return d;
}
function orderMsg(o) {
  const L = oItems(o.id).map(i => '▫️ ' + i.name + ' × ' + (+i.qty) + (i.supplier ? '\n    🏪 التاجر: ' + i.supplier : '')).join('\n') || '—';
  return ['مرحباً كابتن *' + (o.rep_email ? repName(o.rep_email) : '...') + '* 🛵', '📦 معك طلب جديد من النظام (#' + o.order_no + ')', '',
    '🧑‍💼 مسجل الطلب: ' + creatorName(o.created_by), '🙍 العميل: ' + o.customer_name, '📞 الهاتف: ' + (o.phone || '—'), '📍 العنوان: ' + (o.address || '—'),
    '💵 المطلوب تحصيله: ' + money(o.balance) + ' ' + BRAND.currency, '', '----------------', '📋 *قائمة التجهيز:*', L, '----------------']
    .concat(o.notes ? ['⚠️ *ملاحظات هامة:* ' + o.notes] : []).concat(['', '🌹 قل تم وشد الهمة']).join('\n');
}
// فاتورة العميل: أسعار البيع فقط — بدون التاجر وبدون سعر الشراء — مع هوية وشعار الشركة الخاصة بالطلب
const bProf = o => typeof getCompanyProfile === 'function' ? getCompanyProfile(o ? orderCompany(o) : activeCompanyFilter() || 'متجرك') : { displayName: BRAND.name, phone: BRAND.phone, address: BRAND.address, currency: BRAND.currency, footer: 'شكراً لتعاملكم معنا 🌹', logo: '' };
const bn = o => bProf(o).displayName || (S.ordSet && S.ordSet.store_name) || BRAND.name;
const bphone = o => bProf(o).phone || (S.ordSet && S.ordSet.store_phone) || BRAND.phone;
const baddr = o => bProf(o).address || (S.ordSet && S.ordSet.store_address) || BRAND.address;
const bcurr = o => bProf(o).currency || BRAND.currency || 'ر.ي';
function invoiceText(o) {
  const its = oItems(o.id), p = bProf(o), cur = bcurr(o);
  return ['🧾 *فاتورة #' + o.order_no + '* — ' + bn(o)].concat(p.slogan ? ['_' + p.slogan + '_'] : []).concat(['التاريخ: ' + o.order_date, '', '👤 ' + o.customer_name, '', '*الأصناف:*'])
    .concat(its.map(i => '▫️ ' + i.name + ' × ' + (+i.qty) + ' = ' + money(i.line_total))).concat([''])
    .concat(['المجموع: ' + money(o.subtotal)]).concat(+o.delivery_fee ? ['رسوم التوصيل: ' + money(o.delivery_fee)] : []).concat(+o.discount ? ['الخصم: -' + money(o.discount)] : [])
    .concat(['*الإجمالي: ' + money(o.total) + ' ' + cur + '*', 'المدفوع: ' + money(o.paid), '*المتبقي: ' + money(o.balance) + ' ' + cur + '*'])
    .concat(bphone(o) ? ['', '📞 ' + bphone(o)] : []).concat(baddr(o) ? ['📍 ' + baddr(o)] : []).concat(['', p.footer || 'شكراً لتعاملكم معنا 🌹']).join('\n');
}
const canCost = () => isAdmin() || !!(S.ordSet && S.ordSet.staff_can_cost);
const costOf = id => (S.ocost || {})[id] || 0;
const oCostTotal = o => oItems(o.id).reduce((a, i) => a + (+i.qty) * costOf(i.id), 0);
const oProfit = o => (+o.subtotal) - (+o.discount) - oCostTotal(o);
const repPhone = e => ((S.reps || []).find(r => same(r.email, e)) || {}).phone || '';
const sameDay = o => o.order_date === today();
function oKpis() {
  const O = S.orders || [], live = O.filter(o => o.status !== 'cancelled' && o.status !== 'returned'), m = today().slice(0, 7);
  return { today: O.filter(o => sameDay(o) && o.status !== 'cancelled').length, wait: O.filter(o => o.status === 'new').length, prep: O.filter(o => o.status === 'preparing').length,
    sales: live.filter(o => String(o.order_date).slice(0, 7) === m).reduce((a, o) => a + +o.total, 0), due: O.filter(o => o.status === 'delivered').reduce((a, o) => a + Math.max(0, +o.balance), 0) };
}
function ordersFiltered() {
  const f = S.of || (S.of = { q: '', rep: '', all: false }), q = f.q.trim().toLowerCase();
  return (S.orders || []).filter(o => (!f.rep || (f.rep === '_none' ? !o.rep_email : same(o.rep_email, f.rep))) &&
    (!q || ('#' + o.order_no + ' ' + o.customer_name + ' ' + (o.phone || '') + ' ' + (o.address || '')).toLowerCase().includes(q)));
}
function ocard(o) {
  const its = oItems(o.id), names = its.slice(0, 2).map(i => esc(i.name) + (+i.qty > 1 ? ' ×' + (+i.qty) : '')).join('، ') + (its.length > 2 ? ' +' + (its.length - 2) : '');
  const bal = +o.balance, closed = o.status === 'cancelled' || o.status === 'returned';
  const A = { new: [['assign', '🛵 إسناد وتجهيز', 'p'], ['inv', '🧾']], preparing: [['wa', '📲 للمندوب'], ['eye', '👁'], ['deliver', '✅ تم التوصيل'], ['inv', '🧾'], ['cancel', '❌']],
    delivered: (bal > 0 ? [['pay', '💰 دفعة']] : []).concat([['inv', '🧾 فاتورة']]), cancelled: [['reopen', '↩ إعادة فتح']], returned: [['reopen', '↩ إعادة فتح']] }[o.status] || [];
  return '<div class="oc ' + o.status + '" data-oid="' + o.id + '"><div class="bar"><b>#' + o.order_no + '</b><span class="m">' + esc(o.order_date) + '</span></div>' +
    '<div class="oc-n">' + esc(o.customer_name) + '</div>' +
    (o.phone ? '<div class="m" dir="ltr" style="text-align:start">' + esc(o.phone) + '</div>' : '') +
    (o.address ? '<div class="oc-a">📍 ' + esc(o.address) + '</div>' : '') +
    '<div class="oc-i">' + (names || '<span class="m">بدون بنود</span>') + '</div>' +
    '<div class="meta"><span class="chip all">' + money(o.total) + ' ' + BRAND.currency + '</span>' +
    (!closed && bal > 0 ? '<span class="chip late">متبقي ' + money(bal) + '</span>' : !closed && +o.total > 0 ? '<span class="chip ok">مسدّد ✓</span>' : '') +
    (o.rep_email ? '<span class="chip">🛵 ' + esc(repName(o.rep_email)) + '</span>' : (!closed && o.status !== 'delivered' ? '<span class="chip soon">بدون مندوب</span>' : '')) +
    (o.channel ? '<span class="chip">' + esc(o.channel) + '</span>' : '') + (canCost() && !closed ? '<span class="chip ' + (oProfit(o) >= 0 ? 'ok' : 'late') + '">ربح ' + money(oProfit(o)) + '</span>' : '') + '</div>' +
    (closed && o.cancel_reason ? '<div class="dnote" style="background:var(--latesoft);color:var(--late)">السبب: ' + esc(o.cancel_reason) + '</div>' : '') +
    (A.length ? '<div class="acts">' + A.map(a => '<button class="' + (a[2] || '') + '" data-oa="' + a[0] + '" data-id="' + o.id + '">' + a[1] + '</button>').join('') + '</div>' : '') + '</div>';
}
function oBoardHtml() {
  const f = S.of, rows = ordersFiltered(), searching = !!(f.q.trim() || f.rep);
  const col = k => rows.filter(o => k === 'closed' ? (o.status === 'cancelled' || o.status === 'returned') : o.status === k);
  return '<div class="ctabs">' + OCOLS.map(([k, l]) => '<button data-oc="' + k + '" class="' + (S.ocol === k ? 'on' : '') + '">' + l + ' (' + col(k).length + ')</button>').join('') + '</div>' +
    '<div class="board ob">' + OCOLS.map(([k, l]) => {
      let items = col(k), more = 0; if ((k === 'delivered' || k === 'closed') && !searching && !f.all && items.length > 20) { more = items.length - 20; items = items.slice(0, 20); }
      return '<div class="col ' + (S.ocol === k ? 'on' : '') + '" data-st="' + (k === 'closed' ? 'done' : k === 'new' ? 'todo' : k === 'preparing' ? 'doing' : 'done') + '"><div class="ch"><span>' + l + '</span><i>' + col(k).length + '</i></div>' +
        (items.length ? items.map(ocard).join('') : '<div class="empty">لا طلبات</div>') + (more ? '<button class="s" data-omore="1" style="width:100%">عرض ' + more + ' أخرى</button>' : '') + '</div>';
    }).join('') + '</div>';
}
function ordVizStripHtml() {
  const O = S.orders || [];
  if (!O.length && S.hideOrdViz) return '';
  const nNew = O.filter(o => o.status === 'new').length;
  const nPrep = O.filter(o => o.status === 'preparing').length;
  const nDel = O.filter(o => o.status === 'delivered').length;
  const nClosed = O.filter(o => o.status === 'cancelled' || o.status === 'returned').length;
  const tot = O.length || 1;
  const delRate = O.length ? Math.round(100 * nDel / O.length) : 0;

  const live = O.filter(o => o.status !== 'cancelled' && o.status !== 'returned');
  const totSales = live.reduce((a, o) => a + (+o.total || 0), 0);
  const totPaid = live.reduce((a, o) => a + (+o.paid || 0), 0);
  const totDue = live.reduce((a, o) => a + Math.max(0, +o.balance || 0), 0);
  const payPct = totSales > 0 ? Math.min(100, Math.round(100 * totPaid / totSales)) : 0;
  const cc = canCost();
  const totProfit = cc ? live.reduce((a, o) => a + oProfit(o), 0) : 0;

  // قناة الطلب (أعلى 4 قنوات)
  const chMap = {};
  live.forEach(o => { const c = o.channel || 'مباشر / غير محدد'; chMap[c] = (chMap[c] || 0) + (+o.total || 0); });
  const chList = Object.entries(chMap).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxCh = chList.length ? Math.max(1, chList[0][1]) : 1;

  const donutSvg = typeof svgDonut === 'function' ? svgDonut([
    { l: 'تم التوصيل', n: nDel, c: 'var(--c-done)' },
    { l: 'قيد التجهيز', n: nPrep, c: 'var(--c-doing)' },
    { l: 'جديد', n: nNew, c: 'var(--c-todo)' },
    { l: 'ملغي/مرتجع', n: nClosed, c: 'var(--c-late)' }
  ], delRate + '%', 'توصيل') : '';

  if (S.hideOrdViz) {
    return '<div class="bar" style="margin:6px 0 10px"><button class="s" id="ov_tog" type="button">📊 إظهار لوحة الرسوم البيانية للطلبات</button></div>';
  }

  return '<div class="ord-viz-wrap">' +
    '<div class="bar" style="margin-bottom:8px"><span style="font-weight:700;font-size:14px">📊 المؤشرات الرسومية والتحليل الفوري</span><div class="row s"><button class="s" data-otab="reports" type="button" style="font-size:12px">التقارير التفصيلية ⬅</button><button class="s" id="ov_tog" type="button" style="font-size:12px">إخفاء ▲</button></div></div>' +
    '<div class="ord-viz-grid">' +
      '<div class="ord-vcard">' +
        '<div class="ov-title">توزيع حالات الطلبات (' + O.length + ')</div>' +
        '<div class="dsh-flex">' + donutSvg +
          '<div class="dsh-legend">' +
            '<div data-oc-jump="delivered" style="cursor:pointer"><i style="background:var(--c-done)"></i>تم التوصيل <b>' + nDel + '</b></div>' +
            '<div data-oc-jump="preparing" style="cursor:pointer"><i style="background:var(--c-doing)"></i>قيد التجهيز <b>' + nPrep + '</b></div>' +
            '<div data-oc-jump="new" style="cursor:pointer"><i style="background:var(--c-todo)"></i>جديد <b>' + nNew + '</b></div>' +
            '<div data-oc-jump="closed" style="cursor:pointer"><i style="background:var(--c-late)"></i>ملغي/مرتجع <b>' + nClosed + '</b></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ord-vcard">' +
        '<div class="ov-title">كفاءة التحصيل والسيولة المالية</div>' +
        '<div class="ov-fin-main"><span class="m">إجمالي المبيعات الفعّالة</span><b style="font-size:18px;font-variant-numeric:tabular-nums">' + money(totSales) + ' ' + BRAND.currency + '</b></div>' +
        '<div class="ov-gauge"><i style="width:' + payPct + '%;background:var(--c-done)" title="محصّل ' + payPct + '%"></i></div>' +
        '<div class="bar" style="font-size:12.5px;margin-top:6px"><span style="color:var(--ok)">✓ المحصّل: <b style="font-variant-numeric:tabular-nums">' + money(totPaid) + '</b> (' + payPct + '%)</span><span style="color:var(--late)">⏳ المتبقي: <b style="font-variant-numeric:tabular-nums">' + money(totDue) + '</b></span></div>' +
        (cc ? '<div class="bar" style="font-size:12.5px;margin-top:8px;padding-top:6px;border-top:1px dashed var(--line)"><span>صافي ربح البضاعة</span><b style="color:' + (totProfit >= 0 ? 'var(--ok)' : 'var(--late)') + ';font-variant-numeric:tabular-nums">' + money(totProfit) + ' ' + BRAND.currency + '</b></div>' : '') +
      '</div>' +
      '<div class="ord-vcard">' +
        '<div class="ov-title">أعلى قنوات المبيعات إيراداً</div>' +
        (chList.length ? '<div class="ov-bars">' + chList.map(([ch, val]) => {
          const w = Math.max(6, Math.round(100 * val / maxCh));
          return '<div class="ov-bar-row"><div class="bar" style="font-size:12.5px"><span>' + esc(ch) + '</span><b style="font-variant-numeric:tabular-nums">' + money(val) + ' ' + BRAND.currency + '</b></div><div class="dsh-bar"><i style="width:' + w + '%;background:var(--acc)"></i></div></div>';
        }).join('') + '</div>' : '<div class="m" style="padding:14px 0;text-align:center">تظهر القنوات فور تسجيل الطلبات</div>') +
      '</div>' +
    '</div>' +
  '</div>';
}
function ordersView() {
  if (S.ordErr) return '<div class="card"><b>الطلبات غير مفعّلة بعد.</b><p class="m">شغّل ملفات <code dir="ltr">sql/008_orders.sql</code> ثم <code>009</code> ثم <code>010</code> في Supabase ← SQL Editor ثم اضغط تحديث.</p></div>';
  S.of = S.of || { q: '', rep: '', all: false }; S.ocol = S.ocol || 'new'; S.otab = S.otab || 'orders';
  const tabs = '<div class="seg otabs"><button data-otab="orders" class="' + (S.otab === 'orders' ? 'on' : '') + '">🛒 الطلبات</button><button data-otab="reports" class="' + (S.otab === 'reports' ? 'on' : '') + '">📊 الداشبورد والتقارير</button></div>';
  if (S.otab === 'reports') return tabs + reportsHtml();
  const K = oKpis(), kc = (v, l, c) => '<div class="stat ' + (c || '') + '"><b>' + v + '</b><span>' + l + '</span></div>';
  return tabs + '<div class="stats kpis">' + kc(K.today, 'طلبات اليوم') + kc(K.wait, 'بانتظار الإسناد', K.wait ? 'soon' : '') + kc(K.prep, 'قيد التوصيل') + kc(money(K.sales), 'مبيعات الشهر (' + BRAND.currency + ')', 'ok') + kc(money(K.due), 'ديون العملاء', K.due ? 'late' : '') + '</div>' +
    ordVizStripHtml() +
    '<div class="tools"><input id="o_q" type="search" placeholder="🔎 بحث: اسم، هاتف، رقم طلب…" value="' + esc(S.of.q) + '" style="flex:2 1 220px">' +
    '<select id="o_fr"><option value="">كل المندوبين</option><option value="_none"' + (S.of.rep === '_none' ? ' selected' : '') + '>بدون مندوب</option>' + (S.reps || []).map(r => '<option value="' + esc(r.email) + '"' + (same(S.of.rep, r.email) ? ' selected' : '') + '>🛵 ' + esc(r.name) + '</option>').join('') + '</select>' +
    '<button class="p" id="o_new">＋ طلب جديد</button></div><div id="o_board">' + oBoardHtml() + '</div><button class="fab" id="o_fab" aria-label="طلب جديد">＋</button>';
}
function bindOrders() {
  if (S.ordErr) return;
  document.querySelectorAll('[data-otab]').forEach(b => b.onclick = () => { S.otab = b.dataset.otab; render(); });
  if (S.otab === 'reports') return bindReports();
  if ($('ov_tog')) $('ov_tog').onclick = () => { S.hideOrdViz = !S.hideOrdViz; render(); };
  document.querySelectorAll('[data-oc-jump]').forEach(el => el.onclick = () => { S.ocol = el.dataset.ocJump; drawOBoard(); });
  $('o_q').oninput = e => { S.of.q = e.target.value; drawOBoard(); };
  $('o_fr').onchange = e => { S.of.rep = e.target.value; drawOBoard(); };
  $('o_new').onclick = $('o_fab').onclick = () => orderDialog(null);
  bindOBoard();
}
function drawOBoard() { $('o_board').innerHTML = oBoardHtml(); bindOBoard(); }
function bindOBoard() {
  document.querySelectorAll('[data-oc]').forEach(b => b.onclick = () => { S.ocol = b.dataset.oc; drawOBoard(); });
  document.querySelectorAll('[data-omore]').forEach(b => b.onclick = () => { S.of.all = true; drawOBoard(); });
  document.querySelectorAll('.oc').forEach(el => el.onclick = e => { if (e.target.closest('[data-oa]')) return; orderDialog(oOf(el.dataset.oid)); });
  document.querySelectorAll('[data-oa]').forEach(b => b.onclick = e => { e.stopPropagation(); oAction(b.dataset.oa, b.dataset.id); });
}

/* ---------- تحديث وإشعار ---------- */
async function oUpdate(id, patch) {
  const o = oOf(id); if (!o) return false;
  const { error } = await sb.from('ord_orders').update(patch).eq('id', id);
  if (error) { alert('تعذّر الحفظ: ' + error.message); return false; }
  if ('status' in patch || 'rep_email' in patch) apiPost('/api/order-push', JSON.stringify({ order_id: id })).catch(() => {});
  await load(); return true;
}
function oAction(a, id) {
  const o = oOf(id); if (!o) return;
  if (a === 'wa') window.open('https://wa.me/' + (repPhone(o.rep_email) ? waPhone(repPhone(o.rep_email)) : '') + '?text=' + encodeURIComponent(orderMsg(o)), '_blank');
  else if (a === 'eye') previewDialog(o);
  else if (a === 'assign') assignDialog(o);
  else if (a === 'deliver') deliverDialog(o);
  else if (a === 'cancel') cancelDialog(o);
  else if (a === 'pay') payDialog(o);
  else if (a === 'inv') invoiceDialog(o);
  else if (a === 'reopen') { if (confirm('إعادة الطلب #' + o.order_no + ' إلى «جديد»؟')) oUpdate(id, { status: 'new' }); }
}
function previewDialog(o) {
  dlg.innerHTML = '<h2>👁 معاينة رسالة المندوب</h2><pre class="msgp">' + esc(orderMsg(o)) + '</pre><div class="row dact"><button class="s" id="pv_cp">نسخ</button><button class="p s" id="pv_wa">إرسال عبر واتساب</button><button class="s" id="pv_x">إغلاق</button></div>';
  $('pv_x').onclick = () => dlg.close();
  $('pv_cp').onclick = async () => { try { await navigator.clipboard.writeText(orderMsg(o)); $('pv_cp').textContent = 'تم النسخ ✓'; } catch (e) { alert('تعذّر النسخ'); } };
  $('pv_wa').onclick = () => window.open('https://wa.me/' + (repPhone(o.rep_email) ? waPhone(repPhone(o.rep_email)) : '') + '?text=' + encodeURIComponent(orderMsg(o)), '_blank');
  dlg.showModal();
}
function assignDialog(o) {
  const reps = S.reps || [];
  dlg.innerHTML = '<h2>🛵 إسناد الطلب #' + o.order_no + '</h2><div class="m" style="margin-bottom:10px">' + esc(o.customer_name) + (o.address ? ' — ' + esc(o.address) : '') + '</div>' +
    (reps.length ? '<label>المندوب<select id="as_r">' + reps.map(r => '<option value="' + esc(r.email) + '"' + (same(o.rep_email, r.email) ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('') + '</select></label><p class="m">سيصل المندوب إشعار فوراً، ويتحول الطلب إلى «قيد التجهيز».</p>' :
      '<div class="empty">لا يوجد مندوبون بعد.<br>أضف مندوباً من الإعدادات ← إدارة الأعضاء (الدور: مندوب توصيل).</div>') +
    '<div class="row dact">' + (reps.length ? '<button class="p s" id="as_ok">إسناد وتجهيز</button>' : '') + '<button class="s" id="as_x">إلغاء</button></div>';
  $('as_x').onclick = () => dlg.close();
  if (reps.length) $('as_ok').onclick = async () => { const r = $('as_r').value; dlg.close(); await oUpdate(o.id, { rep_email: r, status: 'preparing' }); };
  dlg.showModal();
}
function deliverDialog(o) {
  const bal = +o.balance;
  dlg.innerHTML = '<h2>✅ تأكيد توصيل #' + o.order_no + '</h2><div style="font-weight:700;margin-bottom:8px">' + esc(o.customer_name) + '</div>' +
    (bal > 0 ? '<label class="chk"><input type="checkbox" id="dv_c" checked> تم تحصيل المتبقي (' + money(bal) + ' ' + BRAND.currency + ') الآن</label>' : '<p class="m">الطلب مسدّد بالكامل.</p>') +
    '<div class="row dact"><button class="p s" id="dv_ok">تأكيد التوصيل</button><button class="s" id="dv_x">رجوع</button></div>';
  $('dv_x').onclick = () => dlg.close();
  $('dv_ok').onclick = async () => {
    const collect = bal > 0 && $('dv_c').checked; dlg.close();
    if (await oUpdate(o.id, { status: 'delivered' }) && collect) { const { error } = await sb.from('ord_payments').insert({ order_id: o.id, amount: bal, method: 'نقداً', note: 'تحصيل عند التوصيل', created_by: S.me.email }); if (error) alert('تعذّر تسجيل الدفعة: ' + error.message); load(); }
  };
  dlg.showModal();
}
function cancelDialog(o) {
  dlg.innerHTML = '<h2>❌ إلغاء الطلب #' + o.order_no + '</h2><label>سبب الإلغاء (إجباري)<textarea id="cn_r" rows="3" placeholder="مثال: العميل لا يرد"></textarea></label><div class="row dact"><button class="dng s" id="cn_ok" disabled>تأكيد الإلغاء</button><button class="s" id="cn_x">رجوع</button></div>';
  $('cn_x').onclick = () => dlg.close();
  $('cn_r').oninput = () => { $('cn_ok').disabled = $('cn_r').value.trim().length < 3; };
  $('cn_ok').onclick = async () => { const r = $('cn_r').value.trim(); dlg.close(); await oUpdate(o.id, { status: 'cancelled', cancel_reason: r }); };
  dlg.showModal(); $('cn_r').focus();
}
function payDialog(o) {
  dlg.innerHTML = '<h2>💰 دفعة للطلب #' + o.order_no + '</h2><div class="m" style="margin-bottom:8px">المتبقي: <b>' + money(o.balance) + ' ' + BRAND.currency + '</b></div><div class="row"><label>المبلغ<input id="pm_a" type="number" min="0" step="any" value="' + (+o.balance > 0 ? +o.balance : '') + '"></label><label>الطريقة<select id="pm_m">' + OPAYM.map(x => '<option>' + x + '</option>').join('') + '</select></label></div><label style="margin-top:8px">ملاحظة<input id="pm_n"></label><div class="row dact"><button class="p s" id="pm_ok">تسجيل الدفعة</button><button class="s" id="pm_x">إلغاء</button></div>';
  $('pm_x').onclick = () => dlg.close();
  $('pm_ok').onclick = async () => { const a = +$('pm_a').value; if (!(a > 0)) return $('pm_a').focus(); const { error } = await sb.from('ord_payments').insert({ order_id: o.id, amount: a, method: $('pm_m').value, note: $('pm_n').value.trim() || null, created_by: S.me.email }); if (error) return alert('تعذّر الحفظ: ' + error.message); dlg.close(); load(); };
  dlg.showModal(); $('pm_a').focus();
}
// ===== الفاتورة: محتوى واحد يُستخدم للمعاينة والطباعة (بسعر البيع فقط: بلا سعر شراء وبلا اسم التاجر) =====
function invoiceInner(o) {
  const its = oItems(o.id), pays = oPays(o.id), p = bProf(o), cur = bcurr(o);
  const rawLogo = p.logo || BRAND.logo;
  const logo = rawLogo && rawLogo.startsWith('/') ? location.origin + rawLogo : rawLogo;
  return '<div class="inv"><div class="inv-h" style="border-bottom-color:' + esc(p.accent || '#c9a24e') + '"><img src="' + esc(logo) + '" alt="" width="58" height="58" style="object-fit:cover;border-radius:12px"><div><h2>' + esc(bn(o)) + '</h2>' + (p.slogan ? '<div class="m" style="font-weight:600">' + esc(p.slogan) + '</div>' : '') + '<div class="m">' + esc([bphone(o), baddr(o), p.taxNo ? 'الرقم الضريبي/التجاري: ' + p.taxNo : ''].filter(Boolean).join(' · ')) + '</div></div><div class="inv-no"><b>فاتورة #' + o.order_no + '</b><div class="m">' + esc(o.order_date) + '</div></div></div>' +
    '<div class="inv-c"><b>العميل:</b> ' + esc(o.customer_name) + (o.phone ? ' · <span dir="ltr">' + esc(o.phone) + '</span>' : '') + (o.address ? '<br><b>العنوان:</b> ' + esc(o.address) : '') + '</div>' +
    '<table class="inv-t"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>' + its.map(i => '<tr><td>' + esc(i.name) + '</td><td>' + (+i.qty) + '</td><td>' + money(i.price) + '</td><td>' + money(i.line_total) + '</td></tr>').join('') + '</tbody></table>' +
    '<div class="inv-s"><div><span>المجموع</span><b>' + money(o.subtotal) + '</b></div>' + (+o.delivery_fee ? '<div><span>رسوم التوصيل</span><b>' + money(o.delivery_fee) + '</b></div>' : '') + (+o.discount ? '<div><span>الخصم</span><b>-' + money(o.discount) + '</b></div>' : '') +
    '<div class="tt"><span>الإجمالي</span><b>' + money(o.total) + ' ' + esc(cur) + '</b></div><div><span>المدفوع</span><b>' + money(o.paid) + '</b></div><div class="tt"><span>المتبقي</span><b>' + money(o.balance) + ' ' + esc(cur) + '</b></div></div>' +
    (pays.length ? '<div class="m" style="margin-top:8px">الدفعات: ' + pays.map(py => money(py.amount) + ' (' + esc(py.paid_on) + ')').join(' · ') + '</div>' : '') + '<p class="inv-f">' + esc(p.footer || 'شكراً لتعاملكم معنا 🌹') + '</p></div>';
}
// صفحة مستقلة تماماً للطباعة (لا تتأثر بتنسيقات التطبيق) — تعمل مع «حفظ كـ PDF» في المتصفح
function invoiceDoc(o, toolbar) {
  const O = location.origin, F = (f, w, r) => "@font-face{font-family:'IBM Plex Sans Arabic';font-weight:" + w + ";src:url(" + O + "/fonts/ibm-plex-sans-arabic-" + f + "-" + w + "-normal.woff2) format('woff2');unicode-range:" + r + "}";
  const AR = 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';
  const LA = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212,U+FEFF,U+FFFD';
  const css = F('arabic', 400, AR) + F('arabic', 700, AR) + F('latin', 400, LA) + F('latin', 700, LA) +
    "@page{size:A4;margin:12mm}*{box-sizing:border-box}html,body{margin:0;background:#fff}body{font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;color:#111;font-size:14px;line-height:1.7;padding:18px;direction:rtl}" +
    ".inv{max-width:760px;margin:0 auto}.inv-h{display:flex;align-items:center;gap:12px;border-bottom:2px solid #c9a24e;padding-bottom:10px;margin-bottom:12px}.inv-h h2{margin:0;font-size:22px}.inv-h img{border-radius:10px}.inv-no{margin-inline-start:auto;text-align:end}.m{color:#666;font-size:13px}" +
    ".inv-c{margin-bottom:12px;line-height:1.9}.inv-t{width:100%;border-collapse:collapse;margin-bottom:12px}.inv-t th,.inv-t td{padding:7px 9px;border-bottom:1px solid #ddd;text-align:start}.inv-t th{background:#f1ede2;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    ".inv-s{width:300px;margin-inline-start:auto}.inv-s>div{display:flex;justify-content:space-between;padding:2px 0}.inv-s .tt{font-weight:700;font-size:16px;border-top:1px dashed #bbb;margin-top:3px;padding-top:4px}.inv-f{text-align:center;color:#666;margin:18px 0 0}" +
    ".tb{position:sticky;top:0;background:#fff;padding:10px 0 14px;text-align:center}.tb button{font:inherit;padding:10px 22px;border-radius:10px;border:0;background:#0b1426;color:#f6e3a8;cursor:pointer}@media print{.tb{display:none}}";
  return '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فاتورة #' + o.order_no + '</title><style>' + css + '</style></head><body>' +
    (toolbar ? '<div class="tb"><button onclick="window.print()">🖨 طباعة / حفظ PDF</button></div>' : '') + invoiceInner(o) + '</body></html>';
}
function printInvoice(o) {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  const w = f.contentWindow, d = w.document;
  d.open(); d.write(invoiceDoc(o, false)); d.close();
  const ready = Promise.all([(d.fonts && d.fonts.ready) || Promise.resolve()].concat([...d.images].map(im => im.complete ? 1 : new Promise(r => { im.onload = im.onerror = r; }))));
  Promise.race([ready, new Promise(r => setTimeout(r, 2500))]).then(() => setTimeout(() => {
    try { w.focus(); w.print(); } catch (e) { f.remove(); return openInvoice(o); }
    setTimeout(() => f.remove(), 120000);
  }, 200));
}
function openInvoice(o) {   // بديل: صفحة فاتورة في نافذة جديدة فيها زر الطباعة
  const w = window.open('', '_blank');
  if (!w) return alert('اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة');
  w.document.open(); w.document.write(invoiceDoc(o, true)); w.document.close();
}
function invoiceDialog(o) {
  dlg.innerHTML = invoiceInner(o) + '<div class="row dact no-print"><button class="p s" id="iv_p">🖨 طباعة / حفظ PDF</button><button class="s" id="iv_o">↗ فتح في نافذة</button>' + (o.phone ? '<button class="s" id="iv_w">📲 إرسال للعميل</button>' : '') + '<button class="s" id="iv_x">إغلاق</button></div>';
  $('iv_x').onclick = () => dlg.close();
  $('iv_p').onclick = () => printInvoice(o);
  $('iv_o').onclick = () => openInvoice(o);
  if ($('iv_w')) $('iv_w').onclick = () => window.open('https://wa.me/' + waPhone(o.phone) + '?text=' + encodeURIComponent(invoiceText(o)), '_blank');
  dlg.showModal();
}
/* ---------- نافذة الطلب (إنشاء / تعديل) ---------- */
function orderDialog(o) {
  const edit = !!o, x = o || {}, cc = canCost();
  const blank = () => ({ id: crypto.randomUUID(), name: '', supplier: '', qty: 1, price: '', cost: '', img: '', blob: null, url: '', rmImg: false });
  let items = edit ? oItems(o.id).map(i => ({ id: i.id, name: i.name, supplier: i.supplier || '', qty: +i.qty, price: +i.price, cost: cc ? (costOf(i.id) || '') : '', img: i.image_path || '', blob: null, url: '', rmImg: false })) : [blank()];
  const origIds = items.map(i => i.id), origImgs = items.map(i => i.img).filter(Boolean);
  let urls = {};
  const names = [...new Set((S.orders || []).map(r => r.customer_name))].slice(0, 80), pnames = [...new Set((S.oitems || []).map(i => i.name))].slice(0, 120), sups = [...new Set((S.oitems || []).map(i => i.supplier).filter(Boolean))].slice(0, 80);
  const lastOf = n => { const L = (S.oitems || []).filter(i => i.name === n); return L.length ? L[L.length - 1] : null; };
  dlg.innerHTML = '<h2>' + (edit ? 'طلب #' + o.order_no : '🛒 طلب جديد') + '</h2><div id="o_info" class="m"></div>' +
    '<div class="row"><label>اسم العميل<input id="o_nm" list="o_names" value="' + esc(x.customer_name || '') + '"></label><label>رقم الهاتف<input id="o_ph" dir="ltr" inputmode="tel" value="' + esc(x.phone || '') + '"></label></div>' +
    '<datalist id="o_names">' + names.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist><datalist id="o_pn">' + pnames.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist><datalist id="o_sup">' + sups.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
    '<label style="margin-top:8px">العنوان<input id="o_ad" value="' + esc(x.address || '') + '"></label>' +
    '<div class="row" style="margin-top:8px"><label>قناة الطلب<select id="o_ch"><option value="">—</option>' + OCH.map(c => '<option' + (x.channel === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label><label>تاريخ الطلب<input id="o_dt" type="date" value="' + esc(x.order_date || today()) + '"></label></div>' +
    '<h3 class="oh">📋 الأصناف</h3><div id="o_items"></div><button class="s" id="o_addi" type="button">＋ إضافة صنف</button>' +
    '<div class="row" style="margin-top:10px"><label>رسوم التوصيل<input id="o_fee" type="number" min="0" step="any" value="' + (+x.delivery_fee || '') + '"></label><label>خصم<input id="o_dc" type="number" min="0" step="any" value="' + (+x.discount || '') + '"></label></div>' +
    '<div class="otot" id="o_tot"></div>' +
    '<div class="row" style="margin-top:10px"><label>المندوب<select id="o_rep"><option value="">بدون مندوب</option>' + (S.reps || []).map(r => '<option value="' + esc(r.email) + '"' + (same(x.rep_email, r.email) ? ' selected' : '') + '>🛵 ' + esc(r.name) + '</option>').join('') + '</select></label><label>الحالة<select id="o_st">' + Object.entries(OST).map(([k, v]) => '<option value="' + k + '"' + ((x.status || 'new') === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label></div>' +
    '<label id="o_rsw" style="margin-top:8px;display:none">سبب الإلغاء (إجباري)<input id="o_rs" value="' + esc(x.cancel_reason || '') + '"></label>' +
    '<label style="margin-top:8px">ملاحظات (تصل للمندوب)<textarea id="o_nt" rows="2">' + esc(x.notes || '') + '</textarea></label>' +
    (edit ? '<div id="o_pays" class="obox"></div><div id="o_ev" class="obox m"></div>' : '') +
    '<div class="row dact"><button class="p" id="o_sv">حفظ</button>' + (edit ? '<button class="s" id="o_iv">🧾 فاتورة</button>' : '') + (edit && isAdmin() ? '<button class="dng s" id="o_dl">حذف</button>' : '') + '<button class="s" id="o_cx">إلغاء</button></div>';
  const calc = () => {
    const sub = items.reduce((a, i) => a + (+i.qty || 0) * (+i.price || 0), 0), fee = +$('o_fee').value || 0, dc = +$('o_dc').value || 0, tot = sub + fee - dc;
    const paid = edit ? oPays(o.id).reduce((a, p) => a + +p.amount, 0) : 0, cost = cc ? items.reduce((a, i) => a + (+i.qty || 0) * (+i.cost || 0), 0) : 0;
    $('o_tot').innerHTML = '<div><span>المجموع</span><b>' + money(sub) + '</b></div><div class="tt"><span>الإجمالي</span><b>' + money(tot) + ' ' + BRAND.currency + '</b></div>' + (edit ? '<div><span>المدفوع</span><b>' + money(paid) + '</b></div><div class="tt"><span>المتبقي</span><b>' + money(tot - paid) + '</b></div>' : '') +
      (cc ? '<div class="prof"><span>تكلفة الشراء</span><b>' + money(cost) + '</b></div><div class="prof"><span>ربح البضاعة</span><b>' + money(sub - dc - cost) + '</b></div>' : '');
  };
  const drawItems = () => {
    $('o_items').innerHTML = items.map((it, k) => {
      const src = it.url || (it.img && !it.rmImg ? urls[it.img] : '');
      return '<div class="irow2"><div class="ir-top"><input class="in" data-k="' + k + '" list="o_pn" placeholder="اسم الصنف" value="' + esc(it.name) + '"><button class="s" type="button" data-rm="' + k + '" aria-label="حذف الصنف">✕</button></div>' +
        '<div class="ir-grid"><input class="isup" data-k="' + k + '" list="o_sup" placeholder="🏪 التاجر (من أين يُشترى)" value="' + esc(it.supplier) + '"><input class="iq" data-k="' + k + '" type="number" min="0" step="any" value="' + (it.qty === '' ? '' : it.qty) + '" aria-label="الكمية" placeholder="الكمية"><input class="ip" data-k="' + k + '" type="number" min="0" step="any" placeholder="سعر البيع" value="' + (it.price === '' ? '' : it.price) + '" aria-label="سعر البيع">' +
        (cc ? '<input class="ic" data-k="' + k + '" type="number" min="0" step="any" placeholder="سعر الشراء" value="' + (it.cost === '' ? '' : it.cost) + '" aria-label="سعر الشراء">' : '') + '</div>' +
        '<div class="ir-img">' + (src ? '<img class="thumb" src="' + esc(src) + '" alt="صورة الصنف" data-big="' + k + '">' : '') + '<label class="imgbtn">📷 ' + (src ? 'تغيير الصورة' : 'صورة توضيحية للمندوب') + '<input class="ifile" data-k="' + k + '" type="file" accept="image/*" hidden></label>' + (src ? '<button class="s" type="button" data-rmi="' + k + '">حذف الصورة</button>' : '') + '</div></div>';
    }).join('');
    const E = q => $('o_items').querySelectorAll(q);
    E('.in').forEach(e => { e.oninput = () => { items[e.dataset.k].name = e.value; }; e.onchange = () => { const it = items[e.dataset.k], l = lastOf(e.value); if (l) { let ch = false; if (it.price === '') { it.price = +l.price; ch = true; } if (!it.supplier && l.supplier) { it.supplier = l.supplier; ch = true; } if (cc && it.cost === '' && costOf(l.id)) { it.cost = costOf(l.id); ch = true; } if (ch) { drawItems(); calc(); } } }; });
    E('.isup').forEach(e => e.oninput = () => { items[e.dataset.k].supplier = e.value; });
    E('.iq').forEach(e => e.oninput = () => { items[e.dataset.k].qty = e.value; calc(); });
    E('.ip').forEach(e => e.oninput = () => { items[e.dataset.k].price = e.value; calc(); });
    E('.ic').forEach(e => e.oninput = () => { items[e.dataset.k].cost = e.value; calc(); });
    E('[data-rm]').forEach(b => b.onclick = () => { items.splice(+b.dataset.rm, 1); if (!items.length) items.push(blank()); drawItems(); calc(); });
    E('[data-rmi]').forEach(b => b.onclick = () => { const it = items[b.dataset.rmi]; it.blob = null; it.url = ''; if (it.img) it.rmImg = true; drawItems(); });
    E('[data-big]').forEach(im => im.onclick = () => window.open(im.src, '_blank'));
    E('.ifile').forEach(f => f.onchange = async () => {
      const file = f.files && f.files[0]; if (!file) return;
      try { const b = await compressImage(file), it = items[f.dataset.k]; it.blob = b; it.url = URL.createObjectURL(b); it.rmImg = false; drawItems(); } catch (e) { alert(e.message); }
    });
  };
  const syncSt = () => { $('o_rsw').style.display = $('o_st').value === 'cancelled' ? '' : 'none'; };
  drawItems(); calc(); syncSt();
  if (origImgs.length) imgSign(origImgs).then(m => { urls = m; if ($('o_items')) drawItems(); });
  $('o_addi').onclick = () => { items.push(blank()); drawItems(); calc(); const r = $('o_items').querySelectorAll('.in'); r[r.length - 1].focus(); };
  $('o_fee').oninput = $('o_dc').oninput = calc;
  $('o_st').onchange = syncSt;
  $('o_rep').onchange = () => { if ($('o_rep').value && $('o_st').value === 'new') $('o_st').value = 'preparing'; };
  $('o_ph').onchange = () => {   // عميل سابق: تعبئة تلقائية + مديونيته
    const d = digits($('o_ph').value); if (d.length < 6) { $('o_info').textContent = ''; return; }
    const prev = (S.orders || []).filter(r => digits(r.phone) === d && (!edit || r.id !== o.id)), live = prev.filter(r => r.status !== 'cancelled');
    if (!prev.length) { $('o_info').textContent = ''; return; }
    const last = prev[0], debt = live.reduce((a, r) => a + Math.max(0, +r.balance), 0);
    if (!$('o_nm').value.trim()) $('o_nm').value = last.customer_name; if (!$('o_ad').value.trim()) $('o_ad').value = last.address || '';
    $('o_info').innerHTML = '👤 عميل سابق: <b>' + live.length + '</b> طلبات' + (debt > 0 ? ' · <span style="color:var(--late)">عليه مديونية ' + money(debt) + ' ' + BRAND.currency + '</span>' : ' · لا مديونية ✓');
  };
  if (edit) { $('o_ph').onchange(); }
  const drawPays = () => {
    const P = oPays(o.id), bal = +(oOf(o.id) || o).balance;
    $('o_pays').innerHTML = '<h3 class="oh">💰 الدفعات</h3>' + (P.length ? P.map(p => '<div class="bar pr-r"><span>' + money(p.amount) + ' ' + BRAND.currency + ' <span class="m">· ' + esc(p.method || '') + ' · ' + esc(p.paid_on) + (p.note ? ' · ' + esc(p.note) : '') + '</span></span>' + (isAdmin() || same(p.created_by, S.me.email) ? '<button class="s" data-dp="' + p.id + '" aria-label="حذف الدفعة">✕</button>' : '') + '</div>').join('') : '<div class="m">لا توجد دفعات.</div>') +
      '<div class="row" style="margin-top:8px"><input id="op_a" type="number" min="0" step="any" placeholder="مبلغ الدفعة" value="' + (bal > 0 ? bal : '') + '"><select id="op_m">' + OPAYM.map(m => '<option>' + m + '</option>').join('') + '</select><button class="s" id="op_add" type="button">＋ تسجيل</button></div>';
    $('o_pays').querySelectorAll('[data-dp]').forEach(b => b.onclick = async () => { if (!confirm('حذف هذه الدفعة؟')) return; await sb.from('ord_payments').delete().eq('id', b.dataset.dp); await load(); drawPays(); calc(); });
    $('op_add').onclick = async () => { const a = +$('op_a').value; if (!(a > 0)) return $('op_a').focus(); const { error } = await sb.from('ord_payments').insert({ order_id: o.id, amount: a, method: $('op_m').value, created_by: S.me.email }); if (error) return alert('تعذّر الحفظ: ' + error.message); await load(); drawPays(); calc(); };
  };
  if (edit) {
    drawPays();
    sb.from('ord_events').select('*').eq('order_id', o.id).order('at', { ascending: true }).then(r => {
      const t = e => { const d = e.detail || {}; return e.kind === 'created' ? 'أنشأ الطلب' : e.kind === 'status' ? 'غيّر الحالة: ' + (OST[d.from] || d.from) + ' ← ' + (OST[d.to] || d.to) + (d.reason ? ' (' + d.reason + ')' : '') : e.kind === 'assigned' ? 'أسند إلى ' + repName(d.to) : e.kind === 'payment' ? 'سجّل دفعة ' + money(d.amount) : e.kind; };
      if ($('o_ev')) $('o_ev').innerHTML = '<h3 class="oh">🕘 سجل الطلب</h3>' + ((r.data || []).length ? r.data.map(e => '<div>• ' + ago(e.at) + ' — ' + esc(creatorName(e.actor) || e.actor || 'النظام') + ': ' + esc(t(e)) + '</div>').join('') : '<div>—</div>');
    });
  }
  $('o_cx').onclick = () => dlg.close();
  if (edit) $('o_iv').onclick = () => invoiceDialog(oOf(o.id) || o);
  if ($('o_dl')) $('o_dl').onclick = async () => { if (confirm('حذف الطلب #' + o.order_no + ' نهائياً مع أصنافه ودفعاته وصوره؟')) { dlg.close(); await imgRemove(oItems(o.id).map(i => i.image_path)); await sb.from('ord_orders').delete().eq('id', o.id); load(); } };
  $('o_sv').onclick = async () => {
    const name = $('o_nm').value.trim(); if (!name) return $('o_nm').focus();
    const its = items.filter(i => String(i.name).trim()); if (!its.length) return alert('أضف صنفاً واحداً على الأقل');
    const st = $('o_st').value, rep = $('o_rep').value || null, rs = $('o_rs').value.trim();
    if (st === 'cancelled' && rs.length < 3) { $('o_rsw').style.display = ''; return $('o_rs').focus(); }
    if (st === 'preparing' && !rep) return alert('اختر المندوب قبل تحويل الطلب إلى «قيد التجهيز»');
    const activeCo = (typeof activeCompanyFilter === 'function' ? activeCompanyFilter() : '') || 'متجرك';
    let rawNotes = $('o_nt').value.trim();
    if (!edit && activeCo && !rawNotes.includes('[شركة:')) {
      rawNotes = (rawNotes ? rawNotes + '\n' : '') + '[شركة: ' + activeCo + ']';
    }
    const row = { customer_name: name, phone: $('o_ph').value.trim() || null, address: $('o_ad').value.trim() || null, channel: $('o_ch').value || null, order_date: $('o_dt').value || today(), delivery_fee: +$('o_fee').value || 0, discount: +$('o_dc').value || 0, status: st, rep_email: rep, notes: rawNotes || null, cancel_reason: st === 'cancelled' ? rs : null };
    $('o_sv').disabled = true; $('o_sv').textContent = 'جارٍ الحفظ…';
    const id = edit ? o.id : crypto.randomUUID();
    if (!edit) { row.id = id; row.created_by = S.me.email; }
    let { error } = edit ? await sb.from('ord_orders').update(row).eq('id', id) : await sb.from('ord_orders').insert(row);
    if (!error) {
      const keep = its.map(i => i.id), gone = origIds.filter(i => !keep.includes(i));
      const toRemove = [];
      if (gone.length) { oItems(id).filter(i => gone.includes(i.id) && i.image_path).forEach(i => toRemove.push(i.image_path)); await sb.from('ord_items').delete().in('id', gone); }
      for (const it of its) {   // رفع الصور الجديدة (مضغوطة) وحذف المستبدلة
        if (it.blob) { const path = id + '/' + it.id + '.jpg', e2 = await imgUpload(path, it.blob); if (e2) { error = { message: 'تعذّر رفع صورة «' + it.name + '»: ' + e2 }; break; } it.newPath = path; }
        else if (it.rmImg && it.img) { toRemove.push(it.img); it.newPath = null; } else it.newPath = it.img || null;
      }
      if (!error) {
        ({ error } = await sb.from('ord_items').upsert(its.map((i, k) => ({ id: i.id, order_id: id, pos: k, name: String(i.name).trim(), supplier: String(i.supplier).trim() || null, qty: +i.qty > 0 ? +i.qty : 1, price: +i.price || 0, image_path: i.newPath }))));
        if (!error && cc) ({ error } = await sb.from('ord_item_costs').upsert(its.map(i => ({ item_id: i.id, cost: +i.cost || 0 }))));
      }
      if (!error) await imgRemove(toRemove);
    }
    if (error) { alert('تعذّر الحفظ: ' + error.message); $('o_sv').disabled = false; $('o_sv').textContent = 'حفظ'; return; }
    if (!edit || row.status !== o.status || !same(row.rep_email, o.rep_email)) apiPost('/api/order-push', JSON.stringify({ order_id: id })).catch(() => {});
    dlg.close(); load();
  };
  dlg.showModal(); if (!edit) $('o_nm').focus();
}
