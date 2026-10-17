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
  const L = oItems(o.id).map(i => '▫️ ' + i.name + ' × ' + (+i.qty)).join('\n') || '—';
  return ['مرحباً كابتن *' + (o.rep_email ? repName(o.rep_email) : '...') + '* 🛵', '📦 معك طلب جديد من النظام (#' + o.order_no + ')', '',
    '🧑‍💼 مسجل الطلب: ' + creatorName(o.created_by), '🙍 العميل: ' + o.customer_name, '📞 الهاتف: ' + (o.phone || '—'), '📍 العنوان: ' + (o.address || '—'),
    '💵 المطلوب تحصيله: ' + money(o.balance) + ' ' + BRAND.currency, '', '----------------', '📋 *قائمة التجهيز:*', L, '----------------']
    .concat(o.notes ? ['⚠️ *ملاحظات هامة:* ' + o.notes] : []).concat(['', '🌹 قل تم وشد الهمة']).join('\n');
}
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
  const A = { new: [['assign', '🛵 إسناد وتجهيز', 'p']], preparing: [['wa', '📲 للمندوب'], ['eye', '👁'], ['deliver', '✅ تم التوصيل'], ['cancel', '❌']],
    delivered: (bal > 0 ? [['pay', '💰 دفعة']] : []).concat([['inv', '🧾 فاتورة']]), cancelled: [['reopen', '↩ إعادة فتح']], returned: [['reopen', '↩ إعادة فتح']] }[o.status] || [];
  return '<div class="oc ' + o.status + '" data-oid="' + o.id + '"><div class="bar"><b>#' + o.order_no + '</b><span class="m">' + esc(o.order_date) + '</span></div>' +
    '<div class="oc-n">' + esc(o.customer_name) + '</div>' +
    (o.phone ? '<div class="m" dir="ltr" style="text-align:start">' + esc(o.phone) + '</div>' : '') +
    (o.address ? '<div class="oc-a">📍 ' + esc(o.address) + '</div>' : '') +
    '<div class="oc-i">' + (names || '<span class="m">بدون بنود</span>') + '</div>' +
    '<div class="meta"><span class="chip all">' + money(o.total) + ' ' + BRAND.currency + '</span>' +
    (!closed && bal > 0 ? '<span class="chip late">متبقي ' + money(bal) + '</span>' : !closed && +o.total > 0 ? '<span class="chip ok">مسدّد ✓</span>' : '') +
    (o.rep_email ? '<span class="chip">🛵 ' + esc(repName(o.rep_email)) + '</span>' : (!closed && o.status !== 'delivered' ? '<span class="chip soon">بدون مندوب</span>' : '')) +
    (o.channel ? '<span class="chip">' + esc(o.channel) + '</span>' : '') + '</div>' +
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
function ordersView() {
  if (S.ordErr) return '<div class="card"><b>الطلبات غير مفعّلة بعد.</b><p class="m">شغّل ملف <code dir="ltr">sql/008_orders.sql</code> في Supabase ← SQL Editor ثم اضغط تحديث.</p></div>';
  S.of = S.of || { q: '', rep: '', all: false }; S.ocol = S.ocol || 'new';
  const K = oKpis(), kc = (v, l, c) => '<div class="stat ' + (c || '') + '"><b>' + v + '</b><span>' + l + '</span></div>';
  return '<div class="stats kpis">' + kc(K.today, 'طلبات اليوم') + kc(K.wait, 'بانتظار الإسناد', K.wait ? 'soon' : '') + kc(K.prep, 'قيد التوصيل') + kc(money(K.sales), 'مبيعات الشهر (' + BRAND.currency + ')', 'ok') + kc(money(K.due), 'ديون العملاء', K.due ? 'late' : '') + '</div>' +
    '<div class="tools"><input id="o_q" type="search" placeholder="🔎 بحث: اسم، هاتف، رقم طلب…" value="' + esc(S.of.q) + '" style="flex:2 1 220px">' +
    '<select id="o_fr"><option value="">كل المندوبين</option><option value="_none"' + (S.of.rep === '_none' ? ' selected' : '') + '>بدون مندوب</option>' + (S.reps || []).map(r => '<option value="' + esc(r.email) + '"' + (same(S.of.rep, r.email) ? ' selected' : '') + '>🛵 ' + esc(r.name) + '</option>').join('') + '</select>' +
    '<button class="p" id="o_new">＋ طلب جديد</button></div><div id="o_board">' + oBoardHtml() + '</div><button class="fab" id="o_fab" aria-label="طلب جديد">＋</button>';
}
function bindOrders() {
  if (S.ordErr) return;
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
  if (a === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(orderMsg(o)), '_blank');
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
  $('pv_wa').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(orderMsg(o)), '_blank');
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
function invoiceDialog(o) {
  const its = oItems(o.id), pays = oPays(o.id);
  dlg.innerHTML = '<div class="inv"><div class="inv-h"><img src="' + esc(BRAND.logo) + '" alt="" width="54" height="54"><div><h2>' + esc(BRAND.name) + '</h2><div class="m">' + esc([BRAND.phone, BRAND.address].filter(Boolean).join(' · ')) + '</div></div><div class="inv-no"><b>فاتورة #' + o.order_no + '</b><div class="m">' + esc(o.order_date) + '</div></div></div>' +
    '<div class="inv-c"><b>العميل:</b> ' + esc(o.customer_name) + (o.phone ? ' · <span dir="ltr">' + esc(o.phone) + '</span>' : '') + (o.address ? '<br><b>العنوان:</b> ' + esc(o.address) : '') + '</div>' +
    '<table class="inv-t"><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>' + its.map(i => '<tr><td>' + esc(i.name) + '</td><td>' + (+i.qty) + '</td><td>' + money(i.price) + '</td><td>' + money(i.line_total) + '</td></tr>').join('') + '</tbody></table>' +
    '<div class="inv-s"><div><span>المجموع</span><b>' + money(o.subtotal) + '</b></div>' + (+o.delivery_fee ? '<div><span>رسوم التوصيل</span><b>' + money(o.delivery_fee) + '</b></div>' : '') + (+o.discount ? '<div><span>الخصم</span><b>-' + money(o.discount) + '</b></div>' : '') +
    '<div class="tt"><span>الإجمالي</span><b>' + money(o.total) + ' ' + BRAND.currency + '</b></div><div><span>المدفوع</span><b>' + money(o.paid) + '</b></div><div class="tt"><span>المتبقي</span><b>' + money(o.balance) + ' ' + BRAND.currency + '</b></div></div>' +
    (pays.length ? '<div class="m" style="margin-top:8px">الدفعات: ' + pays.map(p => money(p.amount) + ' (' + esc(p.paid_on) + ')').join(' · ') + '</div>' : '') + '<p class="inv-f">شكراً لتعاملكم معنا 🌹</p></div>' +
    '<div class="row dact no-print"><button class="p s" id="iv_p">🖨 طباعة / حفظ PDF</button>' + (o.phone ? '<button class="s" id="iv_w">إرسال للعميل واتساب</button>' : '') + '<button class="s" id="iv_x">إغلاق</button></div>';
  $('iv_x').onclick = () => dlg.close();
  $('iv_p').onclick = () => { document.body.classList.add('pinv'); window.print(); setTimeout(() => document.body.classList.remove('pinv'), 500); };
  if ($('iv_w')) $('iv_w').onclick = () => window.open('https://wa.me/' + waPhone(o.phone) + '?text=' + encodeURIComponent('فاتورة #' + o.order_no + ' — ' + BRAND.name + '\nالإجمالي: ' + money(o.total) + ' ' + BRAND.currency + '\nالمدفوع: ' + money(o.paid) + '\nالمتبقي: ' + money(o.balance) + ' ' + BRAND.currency + '\nشكراً لتعاملكم 🌹'), '_blank');
  dlg.showModal();
}

/* ---------- نافذة الطلب (إنشاء / تعديل) ---------- */
function orderDialog(o) {
  const edit = !!o, x = o || {};
  let items = edit ? oItems(o.id).map(i => ({ id: i.id, name: i.name, qty: +i.qty, price: +i.price })) : [{ name: '', qty: 1, price: '' }];
  const origIds = items.map(i => i.id);
  const names = [...new Set((S.orders || []).map(r => r.customer_name))].slice(0, 80), pnames = [...new Set((S.oitems || []).map(i => i.name))].slice(0, 120);
  const lastPrice = n => { const L = (S.oitems || []).filter(i => i.name === n); return L.length ? +L[L.length - 1].price : ''; };
  dlg.innerHTML = '<h2>' + (edit ? 'طلب #' + o.order_no : '🛒 طلب جديد') + '</h2><div id="o_info" class="m"></div>' +
    '<div class="row"><label>اسم العميل<input id="o_nm" list="o_names" value="' + esc(x.customer_name || '') + '"></label><label>رقم الهاتف<input id="o_ph" dir="ltr" inputmode="tel" value="' + esc(x.phone || '') + '"></label></div>' +
    '<datalist id="o_names">' + names.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist><datalist id="o_pn">' + pnames.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
    '<label style="margin-top:8px">العنوان<input id="o_ad" value="' + esc(x.address || '') + '"></label>' +
    '<div class="row" style="margin-top:8px"><label>قناة الطلب<select id="o_ch"><option value="">—</option>' + OCH.map(c => '<option' + (x.channel === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label><label>تاريخ الطلب<input id="o_dt" type="date" value="' + esc(x.order_date || today()) + '"></label></div>' +
    '<h3 class="oh">📋 بنود الطلب</h3><div id="o_items"></div><button class="s" id="o_addi" type="button">＋ إضافة بند</button>' +
    '<div class="row" style="margin-top:10px"><label>رسوم التوصيل<input id="o_fee" type="number" min="0" step="any" value="' + (+x.delivery_fee || '') + '"></label><label>خصم<input id="o_dc" type="number" min="0" step="any" value="' + (+x.discount || '') + '"></label></div>' +
    '<div class="otot" id="o_tot"></div>' +
    '<div class="row" style="margin-top:10px"><label>المندوب<select id="o_rep"><option value="">بدون مندوب</option>' + (S.reps || []).map(r => '<option value="' + esc(r.email) + '"' + (same(x.rep_email, r.email) ? ' selected' : '') + '>🛵 ' + esc(r.name) + '</option>').join('') + '</select></label><label>الحالة<select id="o_st">' + Object.entries(OST).map(([k, v]) => '<option value="' + k + '"' + ((x.status || 'new') === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label></div>' +
    '<label id="o_rsw" style="margin-top:8px;display:none">سبب الإلغاء (إجباري)<input id="o_rs" value="' + esc(x.cancel_reason || '') + '"></label>' +
    '<label style="margin-top:8px">ملاحظات (تصل للمندوب)<textarea id="o_nt" rows="2">' + esc(x.notes || '') + '</textarea></label>' +
    (edit ? '<div id="o_pays" class="obox"></div><div id="o_ev" class="obox m"></div>' : '') +
    '<div class="row dact"><button class="p" id="o_sv">حفظ</button>' + (edit ? '<button class="s" id="o_iv">🧾 فاتورة</button>' : '') + (edit && isAdmin() ? '<button class="dng s" id="o_dl">حذف</button>' : '') + '<button class="s" id="o_cx">إلغاء</button></div>';
  const calc = () => {
    const sub = items.reduce((a, i) => a + (+i.qty || 0) * (+i.price || 0), 0), fee = +$('o_fee').value || 0, dc = +$('o_dc').value || 0, tot = sub + fee - dc;
    const paid = edit ? oPays(o.id).reduce((a, p) => a + +p.amount, 0) : 0;
    $('o_tot').innerHTML = '<div><span>المجموع</span><b>' + money(sub) + '</b></div><div class="tt"><span>الإجمالي</span><b>' + money(tot) + ' ' + BRAND.currency + '</b></div>' + (edit ? '<div><span>المدفوع</span><b>' + money(paid) + '</b></div><div class="tt"><span>المتبقي</span><b>' + money(tot - paid) + '</b></div>' : '');
  };
  const drawItems = () => {
    $('o_items').innerHTML = items.map((it, k) => '<div class="irow"><input class="in" data-k="' + k + '" list="o_pn" placeholder="اسم الصنف" value="' + esc(it.name) + '"><input class="iq" data-k="' + k + '" type="number" min="0" step="any" value="' + (it.qty === '' ? '' : it.qty) + '" aria-label="الكمية"><input class="ip" data-k="' + k + '" type="number" min="0" step="any" placeholder="السعر" value="' + (it.price === '' ? '' : it.price) + '" aria-label="السعر"><button class="s" type="button" data-rm="' + k + '" aria-label="حذف البند">✕</button></div>').join('');
    $('o_items').querySelectorAll('.in').forEach(e => { e.oninput = () => { items[e.dataset.k].name = e.value; }; e.onchange = () => { const it = items[e.dataset.k]; if (it.price === '' && lastPrice(e.value) !== '') { it.price = lastPrice(e.value); drawItems(); calc(); } }; });
    $('o_items').querySelectorAll('.iq').forEach(e => e.oninput = () => { items[e.dataset.k].qty = e.value; calc(); });
    $('o_items').querySelectorAll('.ip').forEach(e => e.oninput = () => { items[e.dataset.k].price = e.value; calc(); });
    $('o_items').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { items.splice(+b.dataset.rm, 1); if (!items.length) items.push({ name: '', qty: 1, price: '' }); drawItems(); calc(); });
  };
  const syncSt = () => { $('o_rsw').style.display = $('o_st').value === 'cancelled' ? '' : 'none'; };
  drawItems(); calc(); syncSt();
  $('o_addi').onclick = () => { items.push({ name: '', qty: 1, price: '' }); drawItems(); calc(); const r = $('o_items').querySelectorAll('.in'); r[r.length - 1].focus(); };
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
  if ($('o_dl')) $('o_dl').onclick = async () => { if (confirm('حذف الطلب #' + o.order_no + ' نهائياً مع بنوده ودفعاته؟')) { dlg.close(); await sb.from('ord_orders').delete().eq('id', o.id); load(); } };
  $('o_sv').onclick = async () => {
    const name = $('o_nm').value.trim(); if (!name) return $('o_nm').focus();
    const its = items.filter(i => String(i.name).trim()); if (!its.length) return alert('أضف بنداً واحداً على الأقل');
    const st = $('o_st').value, rep = $('o_rep').value || null, rs = $('o_rs').value.trim();
    if (st === 'cancelled' && rs.length < 3) { $('o_rsw').style.display = ''; return $('o_rs').focus(); }
    if (st === 'preparing' && !rep) return alert('اختر المندوب قبل تحويل الطلب إلى «قيد التجهيز»');
    const row = { customer_name: name, phone: $('o_ph').value.trim() || null, address: $('o_ad').value.trim() || null, channel: $('o_ch').value || null, order_date: $('o_dt').value || today(), delivery_fee: +$('o_fee').value || 0, discount: +$('o_dc').value || 0, status: st, rep_email: rep, notes: $('o_nt').value.trim() || null, cancel_reason: st === 'cancelled' ? rs : null };
    $('o_sv').disabled = true;
    const id = edit ? o.id : crypto.randomUUID();
    if (!edit) { row.id = id; row.created_by = S.me.email; }
    let { error } = edit ? await sb.from('ord_orders').update(row).eq('id', id) : await sb.from('ord_orders').insert(row);
    if (!error) {
      const keep = its.filter(i => i.id).map(i => i.id), gone = origIds.filter(i => i && !keep.includes(i));
      if (gone.length) await sb.from('ord_items').delete().in('id', gone);
      ({ error } = await sb.from('ord_items').upsert(its.map((i, k) => ({ id: i.id || crypto.randomUUID(), order_id: id, pos: k, name: String(i.name).trim(), qty: +i.qty > 0 ? +i.qty : 1, price: +i.price || 0 }))));
    }
    if (error) { alert('تعذّر الحفظ: ' + error.message); $('o_sv').disabled = false; return; }
    if (!edit || row.status !== o.status || !same(row.rep_email, o.rep_email)) apiPost('/api/order-push', JSON.stringify({ order_id: id })).catch(() => {});
    dlg.close(); load();
  };
  dlg.showModal(); if (!edit) $('o_nm').focus();
}
