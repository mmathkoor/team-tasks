// ===== النظام المالي والمحاسبي المتكامل (ERP): حساب الموردين + عهدة المناديب + المصروفات وصافي الربح + العزل المعماري =====

const EXP_CATS = [
  '📢 إعلانات وترويج',
  '👥 رواتب وأجور',
  '🏢 إيجارات وفواتير',
  '🛵 نقل وتوصيل',
  '📦 تغليف ومستلزمات',
  '🔧 مصروفات أخرى'
];

// استرجاع وحفظ السجلات المالية (تعمل مع الجداول الصريحة erp_* ومع نسخ احتياطي سحابي في ord_settings لضمان العمل الفوري)
function getCloudErpFallback() {
  const hv = (S.ordSet && Array.isArray(S.ordSet.hidden_views)) ? S.ordSet.hidden_views : [];
  const sup = [], rep = [], exp = [];
  hv.forEach(x => {
    const s = String(x || '');
    try {
      if (s.startsWith('__esup:')) sup.push(JSON.parse(s.slice(7)));
      else if (s.startsWith('__erep:')) rep.push(JSON.parse(s.slice(7)));
      else if (s.startsWith('__eexp:')) exp.push(JSON.parse(s.slice(7)));
    } catch (e) {}
  });
  return { sup, rep, exp };
}

async function saveCloudErpFallback(kind, item, removeId) {
  if (!S.ordSet) return;
  const prefix = kind === 'sup' ? '__esup:' : kind === 'rep' ? '__erep:' : '__eexp:';
  const cur = (S.ordSet.hidden_views || []).filter(x => {
    const s = String(x || '');
    if (!s.startsWith(prefix)) return true;
    try {
      const j = JSON.parse(s.slice(7));
      return j && j.id !== (removeId || (item && item.id));
    } catch (e) { return false; }
  });
  if (item && !removeId) cur.push(prefix + JSON.stringify(item));
  S.ordSet.hidden_views = cur;
  await sb.from('ord_settings').update({ hidden_views: cur }).eq('id', true);
}

function syncErpArrays() {
  const fb = getCloudErpFallback();
  const mergeById = (dbRows, fbRows) => {
    const map = new Map();
    (fbRows || []).forEach(r => { if (r && r.id) map.set(r.id, r); });
    (dbRows || []).forEach(r => { if (r && r.id) map.set(r.id, r); });
    return [...map.values()];
  };
  S.rawSupPay = mergeById(S.dbSupPay || [], fb.sup);
  S.rawRepHand = mergeById(S.dbRepHand || [], fb.rep);
  S.rawExpenses = mergeById(S.dbExpenses || [], fb.exp);
}

async function addErpRecord(kind, row) {
  const table = kind === 'sup' ? 'erp_supplier_payments' : kind === 'rep' ? 'erp_rep_handovers' : 'erp_expenses';
  row.id = row.id || crypto.randomUUID();
  row.created_by = S.me ? S.me.email : null;
  row.created_at = new Date().toISOString();
  const { error } = await sb.from(table).insert(row);
  if (error) {
    // إذا لم يُشغّل ملف SQL 014 بعد، نحفظ السجل سحابياً في ord_settings فوراً حتى لا يضيع أي إدخال
    await saveCloudErpFallback(kind, row, null);
  }
  await load();
}

async function deleteErpRecord(kind, id) {
  const table = kind === 'sup' ? 'erp_supplier_payments' : kind === 'rep' ? 'erp_rep_handovers' : 'erp_expenses';
  await sb.from(table).delete().eq('id', id).catch(() => {});
  await saveCloudErpFallback(kind, null, id);
  await load();
}

function erpRangeDates(per) {
  const td = today();
  if (per === 'today') return { from: td, to: td, label: 'اليوم (' + td + ')' };
  if (per === 'week') return { from: addDays(td, -6), to: td, label: 'آخر 7 أيام' };
  if (per === 'month') return { from: td.slice(0, 7) + '-01', to: td, label: 'هذا الشهر (' + td.slice(0, 7) + ')' };
  if (per === 'days30') return { from: addDays(td, -29), to: td, label: 'آخر 30 يوماً' };
  if (per === 'year') return { from: td.slice(0, 4) + '-01-01', to: td, label: 'سنة ' + td.slice(0, 4) };
  return { from: '', to: '', label: 'كل الأوقات' };
}

function inDateRange(d, rng) {
  if (!rng || (!rng.from && !rng.to)) return true;
  const s = String(d || '').slice(0, 10);
  if (!s) return false;
  if (rng.from && s < rng.from) return false;
  if (rng.to && s > rng.to) return false;
  return true;
}

// ============================================================================
// 1) حساب الموردين (التجار): كم اشتريت وكم دفعت وكم بقي
// ============================================================================
function calcSuppliersData(rng) {
  const map = {};
  const ensure = name => {
    const k = String(name || '').trim();
    if (!k) return null;
    if (!map[k]) map[k] = { name: k, boughtOrders: 0, boughtDirect: 0, paid: 0, itemsCount: 0, ordersSet: new Set(), lines: [], payments: [] };
    return map[k];
  };

  const ordById = {};
  (S.orders || []).forEach(o => { ordById[o.id] = o; });

  // المشتريات الفعلية من بنود الطلبات غير الملغاة/المرتجعة
  (S.oitems || []).forEach(it => {
    const o = ordById[it.order_id];
    if (!o || o.status === 'cancelled' || o.status === 'returned') return;
    if (!inDateRange(o.order_date, rng)) return;
    const supName = String(it.supplier || '').trim();
    if (!supName) return;
    const s = ensure(supName);
    if (!s) return;
    const unitCost = +((S.ocost || {})[it.id] || 0);
    const qty = +it.qty || 0;
    const lineCost = qty * unitCost;
    s.boughtOrders += lineCost;
    s.itemsCount += qty;
    s.ordersSet.add(o.id);
    s.lines.push({
      date: o.order_date,
      order_no: o.order_no,
      customer: o.customer_name,
      item: it.name,
      qty,
      unitCost,
      total: lineCost,
      missingCost: unitCost <= 0
    });
  });

  // فواتير الشراء المباشرة والدفعات المسجلة للموردين
  (S.supPay || []).forEach(p => {
    const dt = p.paid_on || String(p.created_at || '').slice(0, 10);
    if (!inDateRange(dt, rng)) return;
    const s = ensure(p.supplier_name);
    if (!s) return;
    if (p.entry_type === 'purchase') {
      s.boughtDirect += (+p.amount || 0);
      s.lines.push({
        id: p.id,
        date: dt,
        order_no: 'فاتورة شراء',
        customer: p.note || 'مشتريات مباشرة',
        item: p.note || 'فاتورة مشتريات من التاجر',
        qty: 1,
        unitCost: +p.amount || 0,
        total: +p.amount || 0,
        isDirect: true
      });
    } else {
      s.paid += (+p.amount || 0);
      s.payments.push(p);
    }
  });

  const rows = Object.values(map).map(s => {
    const totalBought = s.boughtOrders + s.boughtDirect;
    const balance = totalBought - s.paid;
    return Object.assign(s, {
      ordersCount: s.ordersSet.size,
      totalBought,
      balance
    });
  }).sort((a, b) => b.balance - a.balance || b.totalBought - a.totalBought);

  const totBought = rows.reduce((a, r) => a + r.totalBought, 0);
  const totPaid = rows.reduce((a, r) => a + r.paid, 0);
  const totRemain = rows.reduce((a, r) => a + Math.max(0, r.balance), 0);
  const payPct = totBought > 0 ? Math.min(100, Math.round(100 * totPaid / totBought)) : 0;

  return { rows, totBought, totPaid, totRemain, payPct };
}

function suppliersTabHtml(rng, cur) {
  const D = calcSuppliersData(rng);
  const q = (S.erpSupQ || '').trim().toLowerCase();
  const filtered = q ? D.rows.filter(r => r.name.toLowerCase().includes(q)) : D.rows;
  const missingCostCount = D.rows.reduce((a, r) => a + r.lines.filter(l => l.missingCost).length, 0);

  return '<div class="dsh-kpi-grid">' +
      '<div class="dsh-kpi"><div class="dk-lbl">🏪 إجمالي المشتريات (كم اشتريت)</div><div class="dk-val">' + money(D.totBought) + ' <small>' + esc(cur) + '</small></div><div class="dk-sub">من ' + D.rows.length + ' تاجر / مورد</div></div>' +
      '<div class="dsh-kpi ok"><div class="dk-lbl">✅ إجمالي المدفوع للتجار (كم دفعت)</div><div class="dk-val">' + money(D.totPaid) + ' <small>' + esc(cur) + '</small></div><div class="dk-sub">نسبة السداد ' + D.payPct + '%</div></div>' +
      '<div class="dsh-kpi ' + (D.totRemain > 0 ? 'late' : 'ok') + '"><div class="dk-lbl">⏳ المتبقي للتجار (كم بقي عليك)</div><div class="dk-val">' + money(D.totRemain) + ' <small>' + esc(cur) + '</small></div><div class="dk-sub">' + (D.totRemain > 0 ? 'ذمم مستحقة للموردين' : 'جميع الحسابات مسدّدة ✓') + '</div></div>' +
    '</div>' +

    (missingCostCount > 0 ? '<div class="card" style="border-color:var(--soon);background:var(--soonsoft);padding:10px 14px;margin-bottom:12px;font-size:13px">💡 <b>تنبيه محاسبي:</b> يوجد <b>' + missingCostCount + '</b> صنف في الطلبات مرتبط بتاجر ولكن لم يُكتب له «سعر الشراء». أدخل سعر الشراء في الطلب ليُحسب تلقائياً في مديونية التاجر، أو أضف فاتورة شراء مباشرة بالزر أدناه.</div>' : '') +

    '<div class="card">' +
      '<div class="bar" style="margin-bottom:12px;gap:8px">' +
        '<h2 style="margin:0">🏪 كشف أرصدة الموردين والتجار (' + filtered.length + ')</h2>' +
        '<div class="row s" style="gap:6px">' +
          '<input id="erp_sup_q" type="search" placeholder="🔎 بحث باسم التاجر..." value="' + esc(S.erpSupQ || '') + '" style="width:180px">' +
          '<button class="s" id="erp_sup_buy" type="button">🧾 + فاتورة شراء من تاجر</button>' +
          '<button class="p s" id="erp_sup_pay" type="button">💵 + تسجيل دفعة لتاجر</button>' +
        '</div>' +
      '</div>' +
      (filtered.length ? '<div class="twrap"><table class="rtbl"><thead><tr><th>التاجر / المورد</th><th>الطلبيات / القطع</th><th>كم اشتريت (' + esc(cur) + ')</th><th>كم دفعت (' + esc(cur) + ')</th><th>كم بقي للتاجر (' + esc(cur) + ')</th><th>الإجراءات</th></tr></thead><tbody>' +
        filtered.map(r =>
          '<tr>' +
            '<td><b>🏪 ' + esc(r.name) + '</b></td>' +
            '<td>' + r.ordersCount + ' طلب · ' + r.itemsCount + ' قطعة</td>' +
            '<td class="num"><b>' + money(r.totalBought) + '</b></td>' +
            '<td class="num" style="color:var(--ok)"><b>' + money(r.paid) + '</b></td>' +
            '<td class="num"><span class="chip ' + (r.balance > 0 ? 'late' : 'ok') + '" style="font-size:13px">' + money(r.balance) + ' ' + esc(cur) + '</span></td>' +
            '<td><div class="row s" style="gap:4px">' +
              '<button class="p s" type="button" data-spay="' + esc(r.name) + '" data-sbal="' + Math.max(0, r.balance) + '" style="padding:4px 9px;font-size:12px">💵 سداد</button>' +
              '<button class="s" type="button" data-sstmt="' + esc(r.name) + '" style="padding:4px 9px;font-size:12px">📄 كشف حساب</button>' +
              '<button class="s" type="button" data-swa="' + esc(r.name) + '" style="padding:4px 9px;font-size:12px">📲 واتساب</button>' +
            '</div></td>' +
          '</tr>'
        ).join('') +
        '<tr class="tfoot"><td><b>الإجمالي الكلي</b></td><td>—</td><td class="num"><b>' + money(D.totBought) + '</b></td><td class="num" style="color:var(--ok)"><b>' + money(D.totPaid) + '</b></td><td class="num" style="color:var(--late)"><b>' + money(D.totRemain) + ' ' + esc(cur) + '</b></td><td></td></tr>' +
      '</tbody></table></div>' : '<div class="empty">لا توجد حركات موردين في هذه الفترة. عند كتابة اسم التاجر وسعر الشراء في الطلبات أو إضافة فاتورة شراء ستظهر الأرصدة تلقائياً هنا.</div>') +
    '</div>';
}

function supplierPayDialog(supName, defaultAmount, entryType) {
  const isPurchase = entryType === 'purchase';
  const sups = [...new Set((S.oitems || []).map(i => i.supplier).concat((S.supPay || []).map(p => p.supplier_name)).filter(Boolean))];
  const co = activeCompanyFilter() || 'متجرك';
  const cur = getCompanyProfile(co).currency || BRAND.currency || 'ر.ي';
  dlg.innerHTML = '<h2>' + (isPurchase ? '🧾 تسجيل فاتورة شراء من تاجر' : '💵 تسجيل دفعة سداد لتاجر / مورد') + '</h2>' +
    '<datalist id="erp_sups_dl">' + sups.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist>' +
    '<div class="row">' +
      '<label style="flex:2 1 180px">🏪 اسم التاجر / المورد<input id="sp_nm" list="erp_sups_dl" value="' + esc(supName || '') + '" placeholder="مثال: محلات النخبة للجملة"></label>' +
      '<label style="flex:1 1 130px">💰 المبلغ (' + esc(cur) + ')<input id="sp_am" type="number" min="0" step="any" value="' + (defaultAmount > 0 ? defaultAmount : '') + '"></label>' +
    '</div>' +
    '<div class="row" style="margin-top:8px">' +
      '<label>طريقة الدفع<select id="sp_md">' + ['نقداً', 'تحويل بنكي', 'محفظة إلكترونية', 'آجل / على الحساب'].map(m => '<option>' + m + '</option>').join('') + '</select></label>' +
      '<label>التاريخ<input id="sp_dt" type="date" value="' + today() + '"></label>' +
    '</div>' +
    '<label style="margin-top:8px">' + (isPurchase ? 'بيان البضاعة المشتراة / رقم الفاتورة' : 'ملاحظة / رقم سند التحويل') + '<input id="sp_nt" placeholder="' + (isPurchase ? 'مثال: بضاعة 10 قطع عطور...' : 'مثال: حوالة الكريمي رقم...') + '"></label>' +
    '<div class="row dact"><button class="p s" id="sp_ok">💾 حفظ</button><button class="s" id="sp_x">إلغاء</button></div>';
  $('sp_x').onclick = () => dlg.close();
  $('sp_ok').onclick = async () => {
    const nm = $('sp_nm').value.trim(), am = +$('sp_am').value;
    if (!nm) return $('sp_nm').focus();
    if (!(am > 0)) return $('sp_am').focus();
    $('sp_ok').disabled = true; $('sp_ok').textContent = 'جارٍ الحفظ...';
    await addErpRecord('sup', {
      company_id: co,
      supplier_name: nm,
      entry_type: isPurchase ? 'purchase' : 'payment',
      amount: am,
      method: $('sp_md').value,
      paid_on: $('sp_dt').value || today(),
      note: $('sp_nt').value.trim() || null
    });
    dlg.close();
    if (typeof toast === 'function') toast(isPurchase ? 'تم تسجيل فاتورة الشراء ✓' : 'تم تسجيل دفعة المورد ✓');
  };
  dlg.showModal();
  if (supName) $('sp_am').focus(); else $('sp_nm').focus();
}

function buildSupplierWaStatement(s, cur) {
  const co = activeCompanyFilter() || 'متجرك';
  const stName = getCompanyProfile(co).displayName || co;
  return [
    '🏪 *كشف حساب مورد — ' + stName + '*',
    '🤝 التاجر / المورد: *' + s.name + '*',
    '📅 التاريخ: ' + today(),
    '────────────────',
    '📦 إجمالي المشتريات (كم اشترينا): *' + money(s.totalBought) + ' ' + cur + '*',
    '✅ إجمالي المدفوعات (كم دفعنا): *' + money(s.paid) + ' ' + cur + '*',
    '⏳ *الرصيد المتبقي: ' + money(s.balance) + ' ' + cur + '*',
    '────────────────',
    s.lines.length ? '📋 *آخر الأصناف المشتراة:*\n' + s.lines.slice(-10).map(l => '• ' + l.date + ' (' + (l.isDirect ? l.order_no : '#' + l.order_no) + '): ' + l.item + ' × ' + l.qty + ' = ' + money(l.total) + ' ' + cur).join('\n') : '',
    s.payments.length ? '\n💵 *آخر الدفعات المسددة:*\n' + s.payments.slice(-8).map(p => '• ' + p.paid_on + ': ' + money(p.amount) + ' ' + cur + ' (' + (p.method || 'نقداً') + ')').join('\n') : ''
  ].filter(Boolean).join('\n');
}

function supplierStatementDialog(supName, rng, cur) {
  const D = calcSuppliersData(rng);
  const s = D.rows.find(r => same(r.name, supName));
  if (!s) return;
  dlg.innerHTML = '<h2>📄 كشف حساب التاجر: ' + esc(s.name) + '</h2>' +
    '<div class="stats kpis" style="margin-bottom:12px">' +
      '<div class="stat"><b>' + money(s.totalBought) + '</b><span>كم اشتريت (' + esc(cur) + ')</span></div>' +
      '<div class="stat ok"><b>' + money(s.paid) + '</b><span>كم دفعت (' + esc(cur) + ')</span></div>' +
      '<div class="stat ' + (s.balance > 0 ? 'late' : 'ok') + '"><b>' + money(s.balance) + '</b><span>كم بقي (' + esc(cur) + ')</span></div>' +
    '</div>' +
    '<h3 class="oh">📦 تفاصيل المشتريات من التاجر (' + s.lines.length + ')</h3>' +
    (s.lines.length ? '<div class="twrap" style="max-height:220px;overflow:auto"><table class="rtbl"><thead><tr><th>التاريخ</th><th>الطلب</th><th>الصنف / البيان</th><th>الكمية</th><th>سعر الشراء</th><th>الإجمالي</th><th></th></tr></thead><tbody>' +
      s.lines.map(l => '<tr><td>' + esc(l.date) + '</td><td>' + esc(l.isDirect ? l.order_no : '#' + l.order_no) + '</td><td><b>' + esc(l.item) + '</b></td><td>' + l.qty + '</td><td class="num">' + (l.missingCost ? '<span class="chip late">أدخل سعر الشراء</span>' : money(l.unitCost)) + '</td><td class="num"><b>' + money(l.total) + '</b></td><td>' + (l.isDirect && l.id ? '<button class="dng s" data-del-sup="' + l.id + '" style="padding:2px 6px">✕</button>' : '') + '</td></tr>').join('') +
    '</tbody></table></div>' : '<div class="m">لا توجد مشتريات مسجلة.</div>') +
    '<h3 class="oh" style="margin-top:12px">💵 سجل الدفعات المسددة للتاجر (' + s.payments.length + ')</h3>' +
    (s.payments.length ? '<div class="twrap" style="max-height:180px;overflow:auto"><table class="rtbl"><thead><tr><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th><th>ملاحظة</th><th></th></tr></thead><tbody>' +
      s.payments.map(p => '<tr><td>' + esc(p.paid_on) + '</td><td class="num" style="color:var(--ok)"><b>' + money(p.amount) + ' ' + esc(cur) + '</b></td><td>' + esc(p.method || '') + '</td><td>' + esc(p.note || '—') + '</td><td><button class="dng s" data-del-sup="' + p.id + '" style="padding:2px 6px">✕</button></td></tr>').join('') +
    '</tbody></table></div>' : '<div class="m">لم تُسجّل دفعات لهذا التاجر بعد.</div>') +
    '<div class="row dact"><button class="p s" id="ss_pay">💵 + تسجيل دفعة</button><button class="s" id="ss_wa">📲 إرسال كشف واتساب</button><button class="s" id="ss_x">إغلاق</button></div>';
  $('ss_x').onclick = () => dlg.close();
  $('ss_pay').onclick = () => { dlg.close(); supplierPayDialog(s.name, Math.max(0, s.balance), 'payment'); };
  $('ss_wa').onclick = () => { dlg.close(); waSummaryDialog('🏪 كشف حساب التاجر: ' + s.name, buildSupplierWaStatement(s, cur)); };
  dlg.querySelectorAll('[data-del-sup]').forEach(b => b.onclick = async () => {
    if (!confirm('حذف هذا السجل؟')) return;
    await deleteErpRecord('sup', b.dataset.delSup);
    dlg.close();
  });
  dlg.showModal();
}

// ============================================================================
// 2) عهدة المندوب: كم حصّل نقداً وكم سلّمك وكم بقي في عهدته
// ============================================================================
function calcRepCustodyData(rng) {
  const map = {};
  const ensure = (email, nameOpt, phoneOpt) => {
    const em = String(email || '').trim().toLowerCase();
    if (!em) return null;
    if (!map[em]) {
      const m = (S.reps || S.allMembers || []).find(r => same(r.email, em));
      map[em] = {
        email: em,
        name: (m && m.name) || nameOpt || em,
        phone: (m && m.phone) || phoneOpt || '',
        deliveredCount: 0,
        prepCount: 0,
        collectedFromOrders: 0,
        collectedAdj: 0,
        handedOver: 0,
        inFieldPending: 0,
        orders: [],
        handovers: []
      };
    }
    return map[em];
  };

  (S.reps || []).forEach(r => ensure(r.email, r.name, r.phone));

  // الطلبات المسندة لكل مندوب
  (S.orders || []).forEach(o => {
    if (!o.rep_email || o.status === 'cancelled' || o.status === 'returned') return;
    if (!inDateRange(o.order_date, rng)) return;
    const r = ensure(o.rep_email);
    if (!r) return;
    if (o.status === 'delivered') {
      r.deliveredCount++;
      // المبلغ المحصّل في الطلب الموصّل
      const collected = +o.paid || 0;
      r.collectedFromOrders += collected;
      r.orders.push({
        order_no: o.order_no,
        date: o.order_date,
        customer: o.customer_name,
        total: +o.total || 0,
        collected,
        balance: +o.balance || 0,
        status: 'delivered'
      });
    } else if (o.status === 'preparing') {
      r.prepCount++;
      r.inFieldPending += Math.max(0, +o.balance || 0);
      r.orders.push({
        order_no: o.order_no,
        date: o.order_date,
        customer: o.customer_name,
        total: +o.total || 0,
        collected: +o.paid || 0,
        balance: +o.balance || 0,
        status: 'preparing'
      });
    }
  });

  // سندات تسليم العهدة من المندوب للصندوق
  (S.repHand || []).forEach(h => {
    const dt = h.handed_on || String(h.created_at || '').slice(0, 10);
    if (!inDateRange(dt, rng)) return;
    const r = ensure(h.rep_email);
    if (!r) return;
    if (h.entry_type === 'collect_adj') {
      r.collectedAdj += (+h.amount || 0);
    } else {
      r.handedOver += (+h.amount || 0);
    }
    r.handovers.push(h);
  });

  const rows = Object.values(map).map(r => {
    const totalCollected = r.collectedFromOrders + r.collectedAdj;
    const custodyBalance = totalCollected - r.handedOver;
    return Object.assign(r, { totalCollected, custodyBalance });
  }).sort((a, b) => b.custodyBalance - a.custodyBalance || b.totalCollected - a.totalCollected);

  const totCollected = rows.reduce((a, r) => a + r.totalCollected, 0);
  const totHanded = rows.reduce((a, r) => a + r.handedOver, 0);
  const totCustody = rows.reduce((a, r) => a + Math.max(0, r.custodyBalance), 0);
  const totInField = rows.reduce((a, r) => a + r.inFieldPending, 0);

  return { rows, totCollected, totHanded, totCustody, totInField };
}

function repCustodyTabHtml(rng, cur) {
  const D = calcRepCustodyData(rng);
  return '<div class="dsh-kpi-grid">' +
      '<div class="dsh-kpi"><div class="dk-lbl">💵 إجمالي ما حصّله المناديب (كم حصّل)</div><div class="dk-val">' + money(D.totCollected) + ' <small>' + esc(cur) + '</small></div><div class="dk-sub">من الطلبات التي تم توصيلها</div></div>' +
      '<div class="dsh-kpi ok"><div class="dk-lbl">🏦 إجمالي ما سلّموه للصندوق (كم سلّمك)</div><div class="dk-val">' + money(D.totHanded) + ' <small>' + esc(cur) + '</small></div><div class="dk-sub">سندات استلام العهدة المسجّلة</div></div>' +
      '<div class="dsh-kpi ' + (D.totCustody > 0 ? 'late' : 'ok') + '"><div class="dk-lbl">🛵 المتبقي في عهدة المناديب الآن</div><div class="dk-val">' + money(D.totCustody) + ' <small>' + esc(cur) + '</small></div><div class="dk-sub">' + (D.totCustody > 0 ? 'مبالغ محصّلة بذمة المناديب لم تُسلّم بعد' : 'جميع العهد مصفّاة بالكامل ✓') + '</div></div>' +
      '<div class="dsh-kpi soon"><div class="dk-lbl">📦 قيد التحصيل بالميدان (قيد التوصيل)</div><div class="dk-val">' + money(D.totInField) + ' <small>' + esc(cur) + '</small></div><div class="dk-sub">طلبات خرجت مع المناديب ولم تُغلق بعد</div></div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="bar" style="margin-bottom:12px">' +
        '<h2 style="margin:0">🛵 كشف عهدة المناديب والتحصيل النقدي (' + D.rows.length + ')</h2>' +
        '<button class="p s" id="erp_rep_add" type="button">💰 + استلام مبلغ عهدة من مندوب</button>' +
      '</div>' +
      (D.rows.length ? '<div class="twrap"><table class="rtbl"><thead><tr><th>المندوب</th><th>الطلبات</th><th>كم حصّل من العملاء (' + esc(cur) + ')</th><th>كم سلّمك للصندوق (' + esc(cur) + ')</th><th>المتبقي بعهدته الآن (' + esc(cur) + ')</th><th>بالميدان (قيد التوصيل)</th><th>الإجراءات</th></tr></thead><tbody>' +
        D.rows.map(r =>
          '<tr>' +
            '<td><b>🛵 ' + esc(r.name) + '</b>' + (r.phone ? '<div class="m" dir="ltr" style="font-size:11.5px">' + esc(r.phone) + '</div>' : '') + '</td>' +
            '<td><span class="chip ok">' + r.deliveredCount + ' موصّل</span> ' + (r.prepCount ? '<span class="chip soon">' + r.prepCount + ' بالميدان</span>' : '') + '</td>' +
            '<td class="num"><b>' + money(r.totalCollected) + '</b></td>' +
            '<td class="num" style="color:var(--ok)"><b>' + money(r.handedOver) + '</b></td>' +
            '<td class="num"><span class="chip ' + (r.custodyBalance > 0 ? 'late' : 'ok') + '" style="font-size:13px">' + money(r.custodyBalance) + ' ' + esc(cur) + '</span></td>' +
            '<td class="num" style="color:var(--soon)">' + money(r.inFieldPending) + '</td>' +
            '<td><div class="row s" style="gap:4px">' +
              '<button class="p s" type="button" data-rhand="' + esc(r.email) + '" data-rbal="' + Math.max(0, r.custodyBalance) + '" style="padding:4px 9px;font-size:12px">💰 استلام عهدة</button>' +
              '<button class="s" type="button" data-rstmt="' + esc(r.email) + '" style="padding:4px 9px;font-size:12px">📄 كشف</button>' +
              '<button class="s" type="button" data-rwa="' + esc(r.email) + '" style="padding:4px 9px;font-size:12px">📲 واتساب</button>' +
            '</div></td>' +
          '</tr>'
        ).join('') +
        '<tr class="tfoot"><td><b>الإجمالي</b></td><td>—</td><td class="num"><b>' + money(D.totCollected) + '</b></td><td class="num" style="color:var(--ok)"><b>' + money(D.totHanded) + '</b></td><td class="num" style="color:var(--late)"><b>' + money(D.totCustody) + ' ' + esc(cur) + '</b></td><td class="num"><b>' + money(D.totInField) + '</b></td><td></td></tr>' +
      '</tbody></table></div>' : '<div class="empty">لا يوجد مندوبون مسجلون حالياً. أضف مندوباً من الإعدادات ← مندوبو التوصيل.</div>') +
    '</div>';
}

function repHandoverDialog(repEmail, defaultAmount) {
  const reps = S.reps || [];
  if (!reps.length) return alert('أضف مندوباً أولاً من الإعدادات ← مندوبو التوصيل.');
  const co = activeCompanyFilter() || 'متجرك';
  const cur = getCompanyProfile(co).currency || BRAND.currency || 'ر.ي';
  dlg.innerHTML = '<h2>💰 سند استلام عهدة نقدية من مندوب</h2>' +
    '<div class="row">' +
      '<label style="flex:2 1 180px">🛵 المندوب<select id="rh_em">' + reps.map(r => '<option value="' + esc(r.email) + '"' + (same(r.email, repEmail) ? ' selected' : '') + '>🛵 ' + esc(r.name) + '</option>').join('') + '</select></label>' +
      '<label style="flex:1 1 130px">💵 المبلغ المستلم (' + esc(cur) + ')<input id="rh_am" type="number" min="0" step="any" value="' + (defaultAmount > 0 ? defaultAmount : '') + '"></label>' +
    '</div>' +
    '<div class="row" style="margin-top:8px">' +
      '<label>طريقة التوريد للصندوق<select id="rh_md">' + ['نقداً للصندوق', 'تحويل بنكي', 'محفظة إلكترونية', 'تسوية مصروف توصيل'].map(m => '<option>' + m + '</option>').join('') + '</select></label>' +
      '<label>التاريخ<input id="rh_dt" type="date" value="' + today() + '"></label>' +
    '</div>' +
    '<label style="margin-top:8px">ملاحظة / بيان التسليم<input id="rh_nt" placeholder="مثال: تصفية عهدة طلبات اليوم..."></label>' +
    '<div class="row dact"><button class="p s" id="rh_ok">💾 تسجيل الاستلام</button><button class="s" id="rh_x">إلغاء</button></div>';
  $('rh_x').onclick = () => dlg.close();
  $('rh_ok').onclick = async () => {
    const em = $('rh_em').value, am = +$('rh_am').value;
    if (!em) return;
    if (!(am > 0)) return $('rh_am').focus();
    $('rh_ok').disabled = true; $('rh_ok').textContent = 'جارٍ الحفظ...';
    await addErpRecord('rep', {
      company_id: co,
      rep_email: em,
      entry_type: 'handover',
      amount: am,
      method: $('rh_md').value,
      handed_on: $('rh_dt').value || today(),
      note: $('rh_nt').value.trim() || null
    });
    dlg.close();
    if (typeof toast === 'function') toast('تم تسجيل استلام العهدة من المندوب ✓');
  };
  dlg.showModal();
  $('rh_am').focus();
}

function buildRepCustodyWaMsg(r, cur) {
  const co = activeCompanyFilter() || 'متجرك';
  const stName = getCompanyProfile(co).displayName || co;
  return [
    '🛵 *كشف عهدة وتحصيل مندوب — ' + stName + '*',
    '👤 الكابتن: *' + r.name + '*',
    '📅 التاريخ: ' + today(),
    '────────────────',
    '✅ الطلبات التي تم توصيلها: *' + r.deliveredCount + ' طلب*',
    '💵 إجمالي المبالغ المحصّلة من العملاء: *' + money(r.totalCollected) + ' ' + cur + '*',
    '🏦 إجمالي المبالغ المسلّمة للإدارة: *' + money(r.handedOver) + ' ' + cur + '*',
    '⏳ *المتبقي في العهدة للتوريد: ' + money(r.custodyBalance) + ' ' + cur + '*',
    r.inFieldPending > 0 ? '📦 طلبات قيد التوصيل حالياً (' + r.prepCount + '): *' + money(r.inFieldPending) + ' ' + cur + '*' : '',
    '────────────────',
    r.custodyBalance > 0 ? '🙏 يرجى توريد مبلغ العهدة المتبقي للصندوق أو إرسال إشعار التحويل لتصفية الحساب.' : '🌟 عهدتك مصفّاة بالكامل، شكراً لجهودك وأمانتك!'
  ].filter(Boolean).join('\n');
}

function repStatementDialog(repEmail, rng, cur) {
  const D = calcRepCustodyData(rng);
  const r = D.rows.find(x => same(x.email, repEmail));
  if (!r) return;
  dlg.innerHTML = '<h2>📄 كشف عهدة المندوب: ' + esc(r.name) + '</h2>' +
    '<div class="stats kpis" style="margin-bottom:12px">' +
      '<div class="stat"><b>' + money(r.totalCollected) + '</b><span>كم حصّل (' + esc(cur) + ')</span></div>' +
      '<div class="stat ok"><b>' + money(r.handedOver) + '</b><span>كم سلّمك (' + esc(cur) + ')</span></div>' +
      '<div class="stat ' + (r.custodyBalance > 0 ? 'late' : 'ok') + '"><b>' + money(r.custodyBalance) + '</b><span>المتبقي بعهدته (' + esc(cur) + ')</span></div>' +
    '</div>' +
    '<h3 class="oh">📦 الطلبات المسندة والمحصّلة (' + r.orders.length + ')</h3>' +
    (r.orders.length ? '<div class="twrap" style="max-height:200px;overflow:auto"><table class="rtbl"><thead><tr><th>الطلب</th><th>التاريخ</th><th>العميل</th><th>الحالة</th><th>إجمالي الطلب</th><th>المحصّل</th></tr></thead><tbody>' +
      r.orders.map(o => '<tr><td><b>#' + o.order_no + '</b></td><td>' + esc(o.date) + '</td><td>' + esc(o.customer) + '</td><td><span class="chip ' + (o.status === 'delivered' ? 'ok' : 'soon') + '">' + (o.status === 'delivered' ? 'تم التوصيل' : 'بالميدان') + '</span></td><td class="num">' + money(o.total) + '</td><td class="num"><b>' + money(o.collected) + '</b></td></tr>').join('') +
    '</tbody></table></div>' : '<div class="m">لا توجد طلبات.</div>') +
    '<h3 class="oh" style="margin-top:12px">🏦 سندات استلام العهدة من المندوب (' + r.handovers.length + ')</h3>' +
    (r.handovers.length ? '<div class="twrap" style="max-height:180px;overflow:auto"><table class="rtbl"><thead><tr><th>التاريخ</th><th>المبلغ المستلم</th><th>الطريقة</th><th>ملاحظة</th><th></th></tr></thead><tbody>' +
      r.handovers.map(h => '<tr><td>' + esc(h.handed_on) + '</td><td class="num" style="color:var(--ok)"><b>' + money(h.amount) + ' ' + esc(cur) + '</b></td><td>' + esc(h.method || '') + '</td><td>' + esc(h.note || '—') + '</td><td><button class="dng s" data-del-rep="' + h.id + '" style="padding:2px 6px">✕</button></td></tr>').join('') +
    '</tbody></table></div>' : '<div class="m">لم يُسجّل أي سند استلام عهدة بعد.</div>') +
    '<div class="row dact"><button class="p s" id="rs_add">💰 + استلام مبلغ</button><button class="s" id="rs_wa">📲 إرسال كشف واتساب للمندوب</button><button class="s" id="rs_x">إغلاق</button></div>';
  $('rs_x').onclick = () => dlg.close();
  $('rs_add').onclick = () => { dlg.close(); repHandoverDialog(r.email, Math.max(0, r.custodyBalance)); };
  $('rs_wa').onclick = () => { dlg.close(); waSummaryDialog('🛵 كشف عهدة المندوب: ' + r.name, buildRepCustodyWaMsg(r, cur), r.phone); };
  dlg.querySelectorAll('[data-del-rep]').forEach(b => b.onclick = async () => {
    if (!confirm('حذف سند الاستلام هذا؟')) return;
    await deleteErpRecord('rep', b.dataset.delRep);
    dlg.close();
  });
  dlg.showModal();
}

// ============================================================================
// 3) المصروفات وصافي الربح الحقيقي بعد خصم الإعلانات والرواتب
// ============================================================================
function calcProfitAndLoss(rng) {
  const liveOrders = (S.orders || []).filter(o => o.status !== 'cancelled' && o.status !== 'returned' && inDateRange(o.order_date, rng));
  const totalSales = liveOrders.reduce((a, o) => a + (+o.total || 0), 0);
  const totalSubtotal = liveOrders.reduce((a, o) => a + (+o.subtotal || 0), 0);
  const totalDiscount = liveOrders.reduce((a, o) => a + (+o.discount || 0), 0);
  const totalDeliveryFee = liveOrders.reduce((a, o) => a + (+o.delivery_fee || 0), 0);
  const totalPaid = liveOrders.reduce((a, o) => a + (+o.paid || 0), 0);

  // تكلفة البضاعة المباعة (من بنود الطلبات + فواتير الشراء المباشرة)
  const ordIds = new Set(liveOrders.map(o => o.id));
  const itemsCost = (S.oitems || []).filter(i => ordIds.has(i.order_id)).reduce((a, i) => a + (+i.qty || 0) * (+((S.ocost || {})[i.id] || 0)), 0);
  const directPurchases = (S.supPay || []).filter(p => p.entry_type === 'purchase' && inDateRange(p.paid_on || p.created_at, rng)).reduce((a, p) => a + (+p.amount || 0), 0);
  const totalCOGS = itemsCost + directPurchases;

  // مجمل الربح (Gross Profit) قبل المصروفات التشغيلية
  const grossProfit = (totalSubtotal - totalDiscount) - totalCOGS;

  // المصروفات التشغيلية مفصلة حسب الفئة
  const exps = (S.expenses || []).filter(e => inDateRange(e.spent_on || e.created_at, rng));
  const byCat = {};
  EXP_CATS.forEach(c => { byCat[c] = 0; });
  let adsExp = 0, salariesExp = 0, otherExp = 0;
  exps.forEach(e => {
    const amt = +e.amount || 0;
    const c = e.category || '🔧 مصروفات أخرى';
    byCat[c] = (byCat[c] || 0) + amt;
    if (c.includes('إعلانات')) adsExp += amt;
    else if (c.includes('رواتب')) salariesExp += amt;
    else otherExp += amt;
  });
  const totalExpenses = adsExp + salariesExp + otherExp;
  const netProfit = grossProfit - totalExpenses;
  const netMargin = totalSales > 0 ? Math.round(100 * netProfit / totalSales) : 0;

  return {
    ordersCount: liveOrders.length,
    totalSales,
    totalSubtotal,
    totalDiscount,
    totalDeliveryFee,
    totalPaid,
    totalCOGS,
    grossProfit,
    adsExp,
    salariesExp,
    otherExp,
    totalExpenses,
    netProfit,
    netMargin,
    byCat,
    exps: exps.slice().sort((a, b) => String(b.spent_on || '').localeCompare(String(a.spent_on || '')))
  };
}

function expensesAndProfitTabHtml(rng, cur) {
  const P = calcProfitAndLoss(rng);
  const maxCat = Math.max(1, ...Object.values(P.byCat));

  return '<div class="dsh-kpi-grid">' +
      '<div class="dsh-kpi"><div class="dk-lbl">💰 إجمالي المبيعات الفعّالة</div><div class="dk-val">' + money(P.totalSales) + ' <small>' + esc(cur) + '</small></div><div class="dk-sub">' + P.ordersCount + ' طلب فعّال</div></div>' +
      '<div class="dsh-kpi"><div class="dk-lbl">📦 مجمل ربح البضاعة (قبل المصاريف)</div><div class="dk-val">' + money(P.grossProfit) + ' <small>' + esc(cur) + '</small></div><div class="dk-sub">بعد خصم تكلفة الشراء (' + money(P.totalCOGS) + ')</div></div>' +
      '<div class="dsh-kpi late"><div class="dk-lbl">💸 إجمالي المصروفات (إعلانات + رواتب + تشغيل)</div><div class="dk-val">' + money(P.totalExpenses) + ' <small>' + esc(cur) + '</small></div><div class="dk-sub">إعلانات: ' + money(P.adsExp) + ' · رواتب: ' + money(P.salariesExp) + '</div></div>' +
      '<div class="dsh-kpi ' + (P.netProfit >= 0 ? 'ok' : 'late') + '"><div class="dk-lbl">🏆 صافي الربح النهائي الحقيقي</div><div class="dk-val">' + money(P.netProfit) + ' <small>' + esc(cur) + '</small></div><div class="dk-sub">هامش الربح الصافي: ' + P.netMargin + '%</div></div>' +
    '</div>' +

    '<div class="dsh-grid2" style="margin-bottom:14px">' +
      '<div class="card dsh-card" style="margin:0">' +
        '<div class="bar" style="margin-bottom:10px"><div class="dsh-ctitle" style="margin:0">📊 قائمة الدخل وصافي الربح (P&L Statement)</div><button class="s" id="erp_pnl_wa" type="button" style="font-size:12px">💬 مشاركة التقرير المالي واتساب</button></div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;font-size:13.5px">' +
          '<div class="bar" style="padding:6px 10px;background:var(--bg);border-radius:8px"><span>➕ صافي مبيعات البضاعة (بعد الخصم)</span><b class="num">' + money(P.totalSubtotal - P.totalDiscount) + ' ' + esc(cur) + '</b></div>' +
          '<div class="bar" style="padding:6px 10px;color:var(--late)"><span>➖ تكلفة البضاعة المباعة (سعر الشراء من التجار)</span><b class="num">-' + money(P.totalCOGS) + ' ' + esc(cur) + '</b></div>' +
          '<div class="bar" style="padding:8px 10px;background:var(--accsoft);border-radius:8px;font-weight:700"><span>🟰 مجمل ربح البضاعة (Gross Profit)</span><b class="num">' + money(P.grossProfit) + ' ' + esc(cur) + '</b></div>' +
          '<div class="bar" style="padding:5px 10px;color:var(--late)"><span>➖ مصروفات الإعلانات والترويج الممول</span><b class="num">-' + money(P.adsExp) + ' ' + esc(cur) + '</b></div>' +
          '<div class="bar" style="padding:5px 10px;color:var(--late)"><span>➖ الرواتب والأجور والحوافز</span><b class="num">-' + money(P.salariesExp) + ' ' + esc(cur) + '</b></div>' +
          '<div class="bar" style="padding:5px 10px;color:var(--late)"><span>➖ المصروفات التشغيلية الأخرى (إيجارات، تغليف، نقل)</span><b class="num">-' + money(P.otherExp) + ' ' + esc(cur) + '</b></div>' +
          '<div class="bar" style="padding:10px 14px;background:' + (P.netProfit >= 0 ? 'var(--oksoft)' : 'var(--latesoft)') + ';color:' + (P.netProfit >= 0 ? 'var(--ok)' : 'var(--late)') + ';border-radius:10px;font-size:15.5px;font-weight:700">' +
            '<span>🏆 صافي الربح النهائي (بعد الإعلانات والرواتب)</span>' +
            '<b class="num">' + money(P.netProfit) + ' ' + esc(cur) + '</b>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card dsh-card" style="margin:0">' +
        '<div class="dsh-ctitle">📉 توزيع المصروفات حسب البند</div>' +
        '<div class="dsh-bars">' +
          Object.entries(P.byCat).map(([cat, val]) => {
            const w = val > 0 ? Math.max(6, Math.round(100 * val / maxCat)) : 0;
            return '<div class="dsh-bar-row"><div class="bar"><span>' + esc(cat) + '</span><b class="num">' + money(val) + ' ' + esc(cur) + '</b></div><div class="dsh-bar"><i style="width:' + w + '%;background:var(--c-late)"></i></div></div>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="bar" style="margin-bottom:12px">' +
        '<h2 style="margin:0">💸 سجل المصروفات التشغيلية (' + P.exps.length + ')</h2>' +
        '<div class="row s" style="gap:6px">' +
          '<button class="s" data-qexp="📢 إعلانات وترويج" type="button">+ إعلان ممول</button>' +
          '<button class="s" data-qexp="👥 رواتب وأجور" type="button">+ راتب موظف</button>' +
          '<button class="p s" id="erp_exp_add" type="button">➕ تسجيل مصروف جديد</button>' +
        '</div>' +
      '</div>' +
      (P.exps.length ? '<div class="twrap"><table class="rtbl"><thead><tr><th>التاريخ</th><th>الفئة / البند</th><th>البيان / الوصف</th><th>طريقة الدفع</th><th>المبلغ (' + esc(cur) + ')</th><th>ملاحظة</th><th></th></tr></thead><tbody>' +
        P.exps.map(e =>
          '<tr>' +
            '<td>' + esc(e.spent_on || String(e.created_at || '').slice(0, 10)) + '</td>' +
            '<td><span class="chip">' + esc(e.category || 'مصروفات') + '</span></td>' +
            '<td><b>' + esc(e.title) + '</b></td>' +
            '<td>' + esc(e.method || 'نقداً') + '</td>' +
            '<td class="num" style="color:var(--late)"><b>' + money(e.amount) + '</b></td>' +
            '<td class="m">' + esc(e.note || '—') + '</td>' +
            '<td><button class="dng s" data-del-exp="' + e.id + '" style="padding:2px 7px">✕</button></td>' +
          '</tr>'
        ).join('') +
        '<tr class="tfoot"><td colspan="4"><b>إجمالي المصروفات</b></td><td class="num" style="color:var(--late)"><b>' + money(P.totalExpenses) + ' ' + esc(cur) + '</b></td><td colspan="2"></td></tr>' +
      '</tbody></table></div>' : '<div class="empty">لم تُسجّل أي مصروفات في هذه الفترة بعد. اضغط «➕ تسجيل مصروف جديد» لإضافة الإعلانات والرواتب والمصاريف.</div>') +
    '</div>';
}

function expenseDialog(defaultCat) {
  const co = activeCompanyFilter() || 'متجرك';
  const cur = getCompanyProfile(co).currency || BRAND.currency || 'ر.ي';
  dlg.innerHTML = '<h2>💸 تسجيل مصروف جديد</h2>' +
    '<div class="row">' +
      '<label style="flex:1 1 160px">بند المصروف<select id="ex_cat">' + EXP_CATS.map(c => '<option' + (c === defaultCat ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label>' +
      '<label style="flex:1 1 130px">المبلغ (' + esc(cur) + ')<input id="ex_am" type="number" min="0" step="any" placeholder="0"></label>' +
    '</div>' +
    '<label style="margin-top:8px">البيان / الوصف<input id="ex_ti" placeholder="مثال: حملة إعلانية فيسبوك / راتب شهر أكتوبر..."></label>' +
    '<div class="row" style="margin-top:8px">' +
      '<label>طريقة الصرف<select id="ex_md">' + ['نقداً', 'تحويل بنكي', 'محفظة إلكترونية', 'بطاقة إعلانية (Visa/MasterCard)'].map(m => '<option>' + m + '</option>').join('') + '</select></label>' +
      '<label>التاريخ<input id="ex_dt" type="date" value="' + today() + '"></label>' +
    '</div>' +
    '<label style="margin-top:8px">ملاحظات إضافية (اختياري)<input id="ex_nt" placeholder="أي تفاصيل إضافية..."></label>' +
    '<div class="row dact"><button class="p s" id="ex_ok">💾 حفظ المصروف</button><button class="s" id="ex_x">إلغاء</button></div>';
  $('ex_x').onclick = () => dlg.close();
  $('ex_ok').onclick = async () => {
    const ti = $('ex_ti').value.trim(), am = +$('ex_am').value;
    if (!(am > 0)) return $('ex_am').focus();
    if (!ti) return $('ex_ti').focus();
    $('ex_ok').disabled = true; $('ex_ok').textContent = 'جارٍ الحفظ...';
    await addErpRecord('exp', {
      company_id: co,
      category: $('ex_cat').value,
      title: ti,
      amount: am,
      method: $('ex_md').value,
      spent_on: $('ex_dt').value || today(),
      note: $('ex_nt').value.trim() || null
    });
    dlg.close();
    if (typeof toast === 'function') toast('تم تسجيل المصروف بنجاح ✓');
  };
  dlg.showModal();
  $('ex_am').focus();
}

// ============================================================================
// 4) العزل المعماري وقاعدة البيانات (رد عملي كامل على ملاحظات الشريك)
// ============================================================================
function archStatusTabHtml() {
  const hasCoTable = !S.companiesErr;
  const hasErpTables = !S.erpTablesErr;
  const sampleTask = (S.rawTasks || [])[0];
  const sampleOrder = (S.rawOrders || [])[0];
  const hasExplicitTaskCol = S.hasExplicitTaskCo === true || (sampleTask && 'company_id' in sampleTask);
  const hasExplicitOrderCol = S.hasExplicitOrderCo === true || (sampleOrder && 'company_id' in sampleOrder);
  const legacyTasksNotes = (S.rawTasks || []).filter(t => /\[شركة:\s*[^\]]+\]/.test(t.notes || '')).length;
  const legacyOrdersNotes = (S.rawOrders || []).filter(o => /\[شركة:\s*[^\]]+\]/.test(o.notes || '')).length;

  const badge = ok => ok
    ? '<span class="chip ok">✅ مفعّل بأعمدة وجداول صريحة</span>'
    : '<span class="chip soon">⚡ يعمل بالتوافق السحابي (بانتظار تشغيل ملف SQL 014)</span>';

  return '<div class="card" style="border-color:var(--acc)">' +
    '<h2>🛡️ مركز العزل المعماري وهيكلة قاعدة البيانات</h2>' +
    '<p class="m" style="margin-bottom:14px">تم بناء الهيكلة المعمارية الصريحة بالكامل استجابةً للمراجعة الهندسية، بحيث تعتمد المنصة على أعمدة وجداول صريحة وسياسات أمان (RLS) على مستوى قاعدة البيانات بدلاً من الحيل النصية:</p>' +
    '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">' +
      '<div class="bar" style="padding:10px 14px;background:var(--col);border-radius:10px"><span><b>1. جدول الشركات والهويات المستقل (<code>companies</code>)</b><br><span class="m">حفظ الشعار والاسم والعملة والفاتورة في جدول مستقل بدلاً من <code>hidden_views</code></span></span>' + badge(hasCoTable) + '</div>' +
      '<div class="bar" style="padding:10px 14px;background:var(--col);border-radius:10px"><span><b>2. عمود الشركة الصريح في المهام والطلبات (<code>company_id</code>)</b><br><span class="m">عزل المهام والطلبات بعمود <code>company_id</code> مستقل تماماً عن حقل الملاحظات <code>notes</code></span></span>' + badge(hasExplicitTaskCol && hasExplicitOrderCol) + '</div>' +
      '<div class="bar" style="padding:10px 14px;background:var(--col);border-radius:10px"><span><b>3. أعمدة الأعضاء الصريحة (<code>company, department, phone</code>)</b><br><span class="m">حفظ شركة وقسم ورقم جوال كل عضو في أعمدة صريحة بجدول <code>members</code></span></span>' + badge(hasExplicitTaskCol || hasCoTable) + '</div>' +
      '<div class="bar" style="padding:10px 14px;background:var(--col);border-radius:10px"><span><b>4. جداول الحسابات والموردين والعهد والمصروفات (<code>erp_*</code>)</b><br><span class="m">جداول <code>erp_supplier_payments</code> و <code>erp_rep_handovers</code> و <code>erp_expenses</code> مع سياسات عزل RLS</span></span>' + badge(hasErpTables) + '</div>' +
    '</div>' +

    '<div class="row" style="gap:8px;flex-wrap:wrap">' +
      '<button class="p" id="arch_copy_sql" type="button">📋 نسخ كود الترقية الشامل (sql/014_clean_architecture_and_erp.sql)</button>' +
      '<button class="s" id="arch_migrate_now" type="button">🔄 ترحيل وتنظيف السجلات الحالية إلى الأعمدة الصريحة (' + (legacyTasksNotes + legacyOrdersNotes) + ')</button>' +
    '</div>' +
    '<p class="m" style="margin-top:10px">💡 <b>كيف تفعّل العزل النهائي في ثوانٍ؟</b> اضغط «نسخ كود الترقية الشامل» ثم الصقه في <b>Supabase ← SQL Editor ← Run</b>، وسيقوم تلقائياً بإنشاء الأعمدة الصريحة والجداول وترحيل كل البيانات القديمة وتنظيف الملاحظات وتفعيل سياسات الحماية RLS.</p>' +
  '</div>';
}

async function migrateLegacyDataToExplicitColumns() {
  let migrated = 0;
  // 1) ترحيل الشركات إلى جدول companies
  const cos = companiesList();
  await persistOrgLists(cos, departmentsList());

  // 2) ترحيل الأعضاء
  for (const m of (S.rawMembers || [])) {
    const meta = parseMemberMeta(m);
    const { error } = await sb.from('members').update({
      company: meta.company || 'متجرك',
      department: meta.department || '',
      phone: meta.phone || m.phone || null
    }).eq('email', m.email);
    if (!error) migrated++;
  }

  // 3) ترحيل المهام وتنظيف الملاحظات إن كان عمود company_id مفعّلاً
  for (const t of (S.rawTasks || [])) {
    const co = taskCompany(t);
    const cleanN = String(t.notes || '').replace(/\[شركة:\s*[^\]]+\]\n?/g, '').trim();
    const { error } = await sb.from('tasks').update({ company_id: co, notes: cleanN || null }).eq('id', t.id);
    if (error && /company_id/i.test(error.message)) break;
    if (!error) migrated++;
  }

  // 4) ترحيل الطلبات وتنظيف الملاحظات إن كان عمود company_id مفعّلاً
  for (const o of (S.rawOrders || [])) {
    const co = orderCompany(o);
    const cleanN = String(o.notes || '').replace(/\[شركة:\s*[^\]]+\]\n?/g, '').trim();
    const { error } = await sb.from('ord_orders').update({ company_id: co, notes: cleanN || null }).eq('id', o.id);
    if (error && /company_id/i.test(error.message)) break;
    if (!error) migrated++;
  }

  // 5) ترحيل أي سجلات ERP محفوظة مؤقتاً في ord_settings إلى جداول erp_*
  const fb = getCloudErpFallback();
  if (fb.sup.length) {
    const { error } = await sb.from('erp_supplier_payments').upsert(fb.sup);
    if (!error) migrated += fb.sup.length;
  }
  if (fb.rep.length) {
    const { error } = await sb.from('erp_rep_handovers').upsert(fb.rep);
    if (!error) migrated += fb.rep.length;
  }
  if (fb.exp.length) {
    const { error } = await sb.from('erp_expenses').upsert(fb.exp);
    if (!error) migrated += fb.exp.length;
  }

  await load();
  if (typeof toast === 'function') toast('تم فحص وترحيل ' + migrated + ' سجل بنجاح ✓');
}

// ============================================================================
// الواجهة الرئيسية لتبويب «💼 الحسابات والعهد»
// ============================================================================
function erpView() {
  S.erpTab = S.erpTab || 'suppliers';
  S.erpPeriod = S.erpPeriod || 'all';
  const curCo = activeCompanyFilter();
  const cur = getCompanyProfile(curCo || 'متجرك').currency || BRAND.currency || 'ر.ي';
  const rng = erpRangeDates(S.erpPeriod);

  const periods = [
    ['all', 'كل الأوقات'],
    ['month', 'هذا الشهر'],
    ['today', 'اليوم'],
    ['week', 'آخر 7 أيام'],
    ['days30', 'آخر 30 يوماً'],
    ['year', 'هذه السنة']
  ];

  const headerBar = '<div class="card dsh-hero" style="margin-bottom:14px">' +
    '<div class="bar" style="gap:12px">' +
      '<div>' +
        '<div class="dsh-badge">💼 الإدارة المالية والمحاسبية المتكاملة</div>' +
        '<h2 style="margin:4px 0 2px;font-size:19px">حسابات الموردين · عهدة المناديب · المصروفات وصافي الربح' + (curCo ? ' — ' + esc(getCompanyProfile(curCo).displayName) : ' — جميع المتاجر') + '</h2>' +
        '<div class="m">الفترة المعروضة: <b>' + esc(rng.label) + '</b> · العملة: <b>' + esc(cur) + '</b></div>' +
      '</div>' +
      '<div class="row s" style="gap:6px">' +
        '<select id="erp_per" title="الفترة الزمنية">' + periods.map(([k, l]) => '<option value="' + k + '"' + (S.erpPeriod === k ? ' selected' : '') + '>📅 ' + l + '</option>').join('') + '</select>' +
      '</div>' +
    '</div>' +
    '<div class="seg" style="margin-top:12px">' +
      '<button type="button" data-etab="suppliers" class="' + (S.erpTab === 'suppliers' ? 'on' : '') + '">🏪 1. حساب الموردين (التجار)</button>' +
      '<button type="button" data-etab="reps" class="' + (S.erpTab === 'reps' ? 'on' : '') + '">🛵 2. عهدة المندوب والتحصيل</button>' +
      '<button type="button" data-etab="expenses" class="' + (S.erpTab === 'expenses' ? 'on' : '') + '">💸 3. المصروفات وصافي الربح</button>' +
      (isAdmin() ? '<button type="button" data-etab="arch" class="' + (S.erpTab === 'arch' ? 'on' : '') + '">🛡️ العزل المعماري</button>' : '') +
    '</div>' +
  '</div>';

  const body = S.erpTab === 'suppliers' ? suppliersTabHtml(rng, cur)
    : S.erpTab === 'reps' ? repCustodyTabHtml(rng, cur)
    : S.erpTab === 'expenses' ? expensesAndProfitTabHtml(rng, cur)
    : archStatusTabHtml();

  return headerBar + body;
}

function bindErp() {
  const curCo = activeCompanyFilter();
  const cur = getCompanyProfile(curCo || 'متجرك').currency || BRAND.currency || 'ر.ي';
  const rng = erpRangeDates(S.erpPeriod || 'all');

  if ($('erp_per')) $('erp_per').onchange = e => { S.erpPeriod = e.target.value; render(); };
  document.querySelectorAll('[data-etab]').forEach(b => b.onclick = () => { S.erpTab = b.dataset.etab; render(); });

  // 1) الموردين
  if ($('erp_sup_q')) $('erp_sup_q').oninput = e => { S.erpSupQ = e.target.value; render(); };
  if ($('erp_sup_pay')) $('erp_sup_pay').onclick = () => supplierPayDialog('', 0, 'payment');
  if ($('erp_sup_buy')) $('erp_sup_buy').onclick = () => supplierPayDialog('', 0, 'purchase');
  document.querySelectorAll('[data-spay]').forEach(b => b.onclick = () => supplierPayDialog(b.dataset.spay, +b.dataset.sbal || 0, 'payment'));
  document.querySelectorAll('[data-sstmt]').forEach(b => b.onclick = () => supplierStatementDialog(b.dataset.sstmt, rng, cur));
  document.querySelectorAll('[data-swa]').forEach(b => b.onclick = () => {
    const D = calcSuppliersData(rng);
    const s = D.rows.find(r => same(r.name, b.dataset.swa));
    if (s) waSummaryDialog('🏪 كشف حساب التاجر: ' + s.name, buildSupplierWaStatement(s, cur));
  });

  // 2) عهدة المناديب
  if ($('erp_rep_add')) $('erp_rep_add').onclick = () => repHandoverDialog('', 0);
  document.querySelectorAll('[data-rhand]').forEach(b => b.onclick = () => repHandoverDialog(b.dataset.rhand, +b.dataset.rbal || 0));
  document.querySelectorAll('[data-rstmt]').forEach(b => b.onclick = () => repStatementDialog(b.dataset.rstmt, rng, cur));
  document.querySelectorAll('[data-rwa]').forEach(b => b.onclick = () => {
    const D = calcRepCustodyData(rng);
    const r = D.rows.find(x => same(x.email, b.dataset.rwa));
    if (r) waSummaryDialog('🛵 كشف عهدة المندوب: ' + r.name, buildRepCustodyWaMsg(r, cur), r.phone);
  });

  // 3) المصروفات وصافي الربح
  if ($('erp_exp_add')) $('erp_exp_add').onclick = () => expenseDialog(EXP_CATS[0]);
  document.querySelectorAll('[data-qexp]').forEach(b => b.onclick = () => expenseDialog(b.dataset.qexp));
  document.querySelectorAll('[data-del-exp]').forEach(b => b.onclick = async () => {
    if (!confirm('حذف هذا المصروف؟')) return;
    await deleteErpRecord('exp', b.dataset.delExp);
  });
  if ($('erp_pnl_wa')) $('erp_pnl_wa').onclick = () => {
    const P = calcProfitAndLoss(rng);
    const stName = getCompanyProfile(curCo || 'متجرك').displayName || curCo || 'جميع المتاجر';
    const txt = [
      '📊 *تقرير الأرباح والمصروفات الصافي — ' + stName + '*',
      '🗓 الفترة: ' + rng.label,
      '────────────────',
      '💰 إجمالي المبيعات الفعّالة: *' + money(P.totalSales) + ' ' + cur + '* (' + P.ordersCount + ' طلب)',
      '📦 تكلفة البضاعة المباعة: *-' + money(P.totalCOGS) + ' ' + cur + '*',
      '📈 *مجمل ربح البضاعة: ' + money(P.grossProfit) + ' ' + cur + '*',
      '────────────────',
      '📢 مصروفات الإعلانات والترويج: *-' + money(P.adsExp) + ' ' + cur + '*',
      '👥 الرواتب والأجور: *-' + money(P.salariesExp) + ' ' + cur + '*',
      '🔧 المصروفات التشغيلية الأخرى: *-' + money(P.otherExp) + ' ' + cur + '*',
      '💸 إجمالي المصروفات: *-' + money(P.totalExpenses) + ' ' + cur + '*',
      '────────────────',
      '🏆 *صافي الربح النهائي الحقيقي: ' + money(P.netProfit) + ' ' + cur + '* (' + P.netMargin + '%)'
    ].join('\n');
    waSummaryDialog('📊 تقرير صافي الربح والمصروفات', txt);
  };

  // 4) العزل المعماري
  if ($('arch_copy_sql')) $('arch_copy_sql').onclick = async () => {
    try {
      const r = await fetch('/sql/014_clean_architecture_and_erp.sql');
      const sqlTxt = await r.text();
      await navigator.clipboard.writeText(sqlTxt);
      if (typeof toast === 'function') toast('تم نسخ كود SQL 014 بالكامل — الصقه في Supabase SQL Editor ✓');
    } catch (e) {
      alert('ملف الترقية موجود في المسار: sql/014_clean_architecture_and_erp.sql');
    }
  };
  if ($('arch_migrate_now')) $('arch_migrate_now').onclick = async () => {
    $('arch_migrate_now').disabled = true;
    $('arch_migrate_now').textContent = 'جارٍ الترحيل والتنظيف...';
    await migrateLegacyDataToExplicitColumns();
  };
}
