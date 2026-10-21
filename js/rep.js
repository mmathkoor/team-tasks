// ===== واجهة مندوب التوصيل المطورة: إدارة التوصيل، سجل الطلبات السابقة مع الفلترة، وفاتورة العميل للطابعات الحرارية والبلوتوث =====
let REP_STATE = {
  tab: 'active', // 'active' | 'history'
  filter: { q: '', status: '', period: '' }
};

async function repLoad() {
  const [r, nt] = await Promise.all([
    sb.rpc('rep_orders'),
    sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(40)
  ]);
  S.rerr = r.error ? r.error.message : '';
  if (!r.error) {
    S.rorders = r.data || [];
    const paths = S.rorders.flatMap(o => (o.items || []).map(i => i.image || i.image_path).filter(Boolean));
    S.rimg = paths.length ? await imgSign(paths) : {};
  }
  if (!nt.error) S.notes = nt.data || [];
  repRender();
  if (typeof rtStart === 'function') rtStart();
  inboxAfterLoad();
}

const repImgUrl = p => (p && (S.rimg || {})[p]) || '';
const rOpen = () => (S.rorders || []).filter(o => o.status === 'preparing').sort((a, b) => {
  const ra = typeof orderCatMeta === 'function' ? orderCatMeta(a).rank : 5;
  const rb = typeof orderCatMeta === 'function' ? orderCatMeta(b).rank : 5;
  return (ra - rb) || ((b.order_no || 0) - (a.order_no || 0));
});
const rHistory = () => (S.rorders || []).filter(o => o.status !== 'preparing');
const repCleanNotes = o => typeof stripOrderMetaNotes === 'function' ? stripOrderMetaNotes((o && o.notes) || '') : String((o && o.notes) || '').replace(/\[شركة:\s*[^\]]+\]\n?/g, '').replace(/\[تصنيف:\s*[^\]]+\]\n?/g, '').trim();

function repCompanyProfile(o) {
  const coId = (o && o.company_id) || (S.me && parseMemberMeta(S.me).company) || 'متجرك';
  const prof = typeof getCompanyProfile === 'function' ? getCompanyProfile(coId) : {};
  return {
    name: prof.displayName || coId,
    phone: prof.phone || '',
    address: prof.address || '',
    currency: prof.currency || (typeof BRAND !== 'undefined' ? BRAND.currency : 'ر.ي'),
    footer: prof.footer || 'شكراً لتعاملكم معنا 🌹',
    logo: prof.logoUrl || ''
  };
}

function repMsg(o) {
  const cn = repCleanNotes(o);
  const cp = repCompanyProfile(o);
  return [
    'مرحباً كابتن *' + (S.me ? S.me.name : '') + '* 🛵',
    '📦 طلب مبيعات #' + o.order_no + ' — ' + cp.name,
    '',
    '🧑‍💼 مسجل الطلب: ' + (o.created_by_name || '—'),
    '🙍 العميل: ' + o.customer_name,
    '📞 الهاتف: ' + (o.phone || '—'),
    '📍 العنوان: ' + (o.address || '—'),
    '💵 المطلوب تحصيله: ' + money(o.collect != null ? o.collect : o.balance) + ' ' + cp.currency,
    '',
    '📋 *قائمة التجهيز:*'
  ].concat((o.items || []).map(i => {
    const u = repImgUrl(i.image || i.image_path);
    return '▫️ ' + i.name + ' × ' + (+i.qty) + (i.price ? ' (' + money(i.price) + ' ' + cp.currency + ')' : '') + (i.supplier ? '\n    🏪 التاجر: ' + i.supplier : '') + (u ? '\n    📷 صورة المنتج: ' + u : '');
  }))
  .concat(cn ? ['', '⚠️ *ملاحظات هامة:* ' + cn] : [])
  .concat(['', '🌹 قل تم وشد الهمة']).join('\n');
}

// استخلاص وحساب مبالغ الفاتورة بدقة وضمان عدم ظهور الأسعار 0
function normalizeInvoiceData(o) {
  const cp = repCompanyProfile(o);
  let items = Array.isArray(o.items) ? o.items.map(it => ({ ...it })) : [];
  let sub = o.subtotal != null ? +o.subtotal : 0;
  const dFee = +(o.delivery_fee || 0);
  const disc = +(o.discount || 0);
  let tot = o.total != null ? +o.total : (sub + dFee - disc);
  let bal = o.balance != null ? +o.balance : (+o.collect || tot);

  // إذا لم يكن الإجمالي مسجلاً أو كان 0 وكان هناك مبلغ مطلوب تحصيله (collect / balance)
  const knownPayable = +o.collect || +o.balance || 0;
  if (tot <= 0 && knownPayable > 0) {
    tot = knownPayable;
    sub = Math.max(0, tot - dFee + disc);
    bal = knownPayable;
  }

  // فحص ما إذا كانت الأصناف ينقصها السعر الفردي
  const itemsSum = items.reduce((s, i) => s + ((+i.price || 0) * (+i.qty || 1)), 0);
  if (itemsSum === 0 && sub > 0 && items.length > 0) {
    if (items.length === 1) {
      const q = +items[0].qty > 0 ? +items[0].qty : 1;
      items[0].price = sub / q;
      items[0].line_total = sub;
    } else {
      const share = sub / items.length;
      items.forEach(it => {
        const q = +it.qty > 0 ? +it.qty : 1;
        it.price = +(share / q).toFixed(2);
        it.line_total = +share.toFixed(2);
      });
    }
  } else if (sub <= 0 && itemsSum > 0) {
    sub = itemsSum;
    if (tot <= 0) tot = sub + dFee - disc;
  }

  const paid = o.paid != null ? +o.paid : Math.max(0, tot - bal);
  return { cp, items, sub, dFee, disc, tot, bal, paid };
}

// نص الفاتورة المهيأ للعميل والرسائل والطابعات
function receiptPlainText(o) {
  const { cp, items, sub, dFee, disc, tot, bal, paid } = normalizeInvoiceData(o);

  const lines = [
    '🧾 *فاتورة مبيعات* — *' + cp.name + '*',
    (cp.phone ? '📞 هاتف المتجر: ' + cp.phone : ''),
    (cp.address ? '📍 العنوان: ' + cp.address : ''),
    '--------------------------------',
    '📦 طلب رقم: #' + o.order_no,
    '📅 التاريخ: ' + (o.order_date || today()),
    '👤 العميل: ' + o.customer_name + (o.phone ? ' (' + o.phone + ')' : ''),
    (o.address ? '📍 العنوان: ' + o.address : ''),
    '🛵 المندوب: ' + (S.me ? S.me.name : ''),
    '--------------------------------',
    '📋 *تفاصيل الأصناف:*'
  ].filter(Boolean);

  items.forEach((it, idx) => {
    const p = +it.price || 0, q = +it.qty || 1, lt = it.line_total != null ? +it.line_total : (p * q);
    lines.push((idx + 1) + '. ' + it.name + '\n   ' + q + ' × ' + money(p) + ' = ' + money(lt) + ' ' + cp.currency);
  });

  lines.push('--------------------------------');
  lines.push('المجموع: ' + money(sub) + ' ' + cp.currency);
  if (dFee > 0) lines.push('أجور التوصيل: ' + money(dFee) + ' ' + cp.currency);
  if (disc > 0) lines.push('الخصم: ' + money(disc) + ' ' + cp.currency);
  lines.push('*المجموع الكلي: ' + money(tot) + ' ' + cp.currency + '*');
  if (paid > 0) lines.push('المدفوع: ' + money(paid) + ' ' + cp.currency);
  lines.push('*المطلوب سداده / المحصل: ' + money(bal) + ' ' + cp.currency + '*');
  lines.push('--------------------------------');
  lines.push(cp.footer);
  lines.push('🛡️ فاتورة إلكترونية معتمدة');

  return lines.join('\n');
}

// وثيقة الإيصال الحراري 80mm / 58mm الجاهزة للطباعة بالبلوتوث
function thermalReceiptHtml(o) {
  const { cp, items, sub, dFee, disc, tot, bal, paid } = normalizeInvoiceData(o);

  return '<div class="thermal-paper" id="thermal_print_target">' +
    '<div class="t-center">' +
      (cp.logo ? '<img src="' + esc(cp.logo) + '" alt="" style="max-height:48px;max-width:140px;margin-bottom:6px;object-fit:contain">' : '') +
      '<div class="t-title">' + esc(cp.name) + '</div>' +
      (cp.phone ? '<div class="t-sub" dir="ltr">هاتف: ' + esc(cp.phone) + '</div>' : '') +
      (cp.address ? '<div class="t-sub">' + esc(cp.address) + '</div>' : '') +
      '<div style="font-size:14px;font-weight:800;margin-top:4px;border:1px solid #000;display:inline-block;padding:1px 10px;border-radius:4px">فاتورة مبيعات</div>' +
    '</div>' +
    '<hr class="t-dash">' +
    '<div class="t-row"><span>رقم الفاتورة:</span><b class="t-bold">#' + o.order_no + '</b></div>' +
    '<div class="t-row"><span>التاريخ:</span><span>' + esc(o.order_date || today()) + '</span></div>' +
    '<div class="t-row"><span>العميل:</span><b class="t-bold">' + esc(o.customer_name) + '</b></div>' +
    (o.phone ? '<div class="t-row"><span>الهاتف:</span><span dir="ltr">' + esc(o.phone) + '</span></div>' : '') +
    (o.address ? '<div class="t-row"><span>العنوان:</span><span>' + esc(o.address) + '</span></div>' : '') +
    '<div class="t-row"><span>المندوب:</span><span>' + esc(S.me ? S.me.name : '') + '</span></div>' +
    '<hr class="t-dash">' +
    '<table>' +
      '<thead><tr><th>الصنف</th><th style="text-align:center">الكمية</th><th style="text-align:left">السعر</th><th style="text-align:left">الإجمالي</th></tr></thead>' +
      '<tbody>' +
        items.map(it => {
          const p = +it.price || 0, q = +it.qty || 1, lt = it.line_total != null ? +it.line_total : (p * q);
          return '<tr>' +
            '<td style="font-weight:700">' + esc(it.name) + '</td>' +
            '<td style="text-align:center">' + q + '</td>' +
            '<td style="text-align:left">' + money(p) + '</td>' +
            '<td style="text-align:left;font-weight:700">' + money(lt) + '</td>' +
          '</tr>';
        }).join('') +
      '</tbody>' +
    '</table>' +
    '<hr class="t-dash">' +
    '<div class="t-row"><span>المجموع:</span><span>' + money(sub) + ' ' + esc(cp.currency) + '</span></div>' +
    (dFee > 0 ? '<div class="t-row"><span>أجور التوصيل:</span><span>' + money(dFee) + ' ' + esc(cp.currency) + '</span></div>' : '') +
    (disc > 0 ? '<div class="t-row"><span>الخصم:</span><span>-' + money(disc) + ' ' + esc(cp.currency) + '</span></div>' : '') +
    '<hr class="t-dash">' +
    '<div class="t-row t-big t-bold"><span>المجموع الكلي:</span><span>' + money(tot) + ' ' + esc(cp.currency) + '</span></div>' +
    (paid > 0 ? '<div class="t-row"><span>المدفوع مسبقاً:</span><span>' + money(paid) + ' ' + esc(cp.currency) + '</span></div>' : '') +
    '<div class="t-row t-big t-bold" style="background:#f1f5f9;padding:4px 6px;border-radius:4px;margin-top:4px"><span>المطلوب تحصيله:</span><span>' + money(bal) + ' ' + esc(cp.currency) + '</span></div>' +
    '<hr class="t-dash">' +
    '<div class="t-center" style="margin-top:8px">' +
      '<div style="font-size:12px;font-weight:700;margin-bottom:2px">' + esc(cp.footer) + '</div>' +
      '<div style="font-size:11px;color:#64748b">فاتورة إلكترونية معتمدة آلياً</div>' +
      '<div class="t-barcode">*' + o.order_no + '*</div>' +
      '<div style="font-size:10px;color:#94a3b8">' + new Date().toLocaleString('ar') + '</div>' +
    '</div>' +
  '</div>';
}

function printThermalReceipt(o) {
  const content = thermalReceiptHtml(o);
  const printWindow = window.open('', '_blank', 'width=380,height=600');
  if (!printWindow) {
    alert('الرجاء السماح بالنوافذ المنبثقة لطباعة الإيصال.');
    return;
  }
  const doc = printWindow.document;
  doc.open();
  doc.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>إيصال #' + o.order_no + '</title>' +
    '<style>' +
      '@page{size:80mm auto;margin:0}' +
      '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
      'body{margin:0;padding:4mm 2mm;font-family:Courier,monospace,Tahoma,sans-serif;background:#fff;color:#000;direction:rtl}' +
      '.thermal-paper{max-width:76mm;margin:0 auto;border:none;box-shadow:none;padding:0}' +
      '.t-center{text-align:center}.t-title{font-size:18px;font-weight:900;margin-bottom:2px}.t-sub{font-size:12px;color:#475569}' +
      '.t-dash{border:0;border-top:1px dashed #000;margin:8px 0}' +
      '.t-row{display:flex;justify-content:space-between;font-size:13px;margin:3px 0}.t-bold{font-weight:800}.t-big{font-size:15px}' +
      'table{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}th{text-align:start;border-bottom:1px dashed #000;padding:3px 0}' +
      'td{padding:3px 0;vertical-align:top}.t-barcode{font-size:22px;letter-spacing:4px;margin:6px 0 2px;font-weight:900}' +
      '.no-print{text-align:center;margin-bottom:12px;padding:8px;background:#f8fafc;border-bottom:1px solid #e2e8f0}' +
      '.no-print button{padding:8px 16px;font-weight:700;border-radius:8px;border:none;background:#0b1426;color:#f6e3a8;cursor:pointer;margin:0 4px}' +
      '@media print{.no-print{display:none}}' +
    '</style></head><body>' +
    '<div class="no-print"><button onclick="window.print()">🖨 طباعة الإيصال (طابعة حرارية / بلوتوث)</button><button onclick="window.close()" style="background:#e2e8f0;color:#0f172a">إغلاق</button></div>' +
    content +
    '<script>setTimeout(()=>{ window.print(); }, 400);</script>' +
    '</body></html>');
  doc.close();
}

async function sendRepInvoicePdf(o, btnEl) {
  if (!o || typeof shareOrSendInvoicePdf !== 'function') return;
  const needsFetch = !o.subtotal || !(o.items && o.items.some(i => +i.price > 0));
  if (needsFetch && o.id) {
    try {
      const rr = await apiPost('/api/rep-admin', JSON.stringify({ action: 'get_order_invoice', order_id: o.id }));
      const j = await rr.json().catch(() => ({}));
      if (rr.ok && j && j.order) Object.assign(o, j.order);
    } catch (e) {}
  }
  const { cp, items, sub, dFee, disc, tot, paid, bal } = normalizeInvoiceData(o);
  const catM = typeof orderCatMeta === 'function' ? orderCatMeta(o) : { badge: 'عادي', bg: '#f1f5f9', fg: '#475569' };
  await shareOrSendInvoicePdf({
    storeName: cp.name,
    storePhone: cp.phone || '',
    storeAddress: cp.address || '',
    currency: cp.currency,
    footer: cp.footer,
    orderNo: o.order_no,
    orderDate: o.order_date,
    customerName: o.customer_name,
    customerPhone: o.phone || '',
    customerAddress: o.address || '',
    repName: S.me ? S.me.name : '',
    categoryLabel: catM.badge,
    categoryBg: catM.bg,
    categoryColor: catM.fg,
    items: items.map(it => ({ name: it.name, qty: +it.qty || 1, price: +it.price || 0, line_total: +it.line_total || ((+it.qty || 1) * (+it.price || 0)) })),
    subtotal: sub,
    deliveryFee: dFee,
    discount: disc,
    total: tot,
    paid: paid,
    balance: bal
  }, o.phone, btnEl);
}

async function repInvoiceDialog(o) {
  if (!o) return;

  const renderContent = () => {
    const rawText = receiptPlainText(o);
    const cp = repCompanyProfile(o);

    dlg.innerHTML = '<div class="bar" style="margin-bottom:12px">' +
      '<h2 style="margin:0">🧾 فاتورة وإيصال العميل #' + o.order_no + '</h2>' +
      '<span class="chip ok">🏢 ' + esc(cp.name) + '</span>' +
    '</div>' +
    '<div id="riv_body" style="max-height:60vh;overflow-y:auto;margin-bottom:12px;padding:4px">' +
      thermalReceiptHtml(o) +
    '</div>' +
    '<div class="row dact" style="gap:6px;flex-wrap:wrap">' +
      '<button class="p s" id="riv_pdf" type="button" style="background:#15803d;color:#fff;border-color:#15803d">📄 إرسال فاتورة PDF للعميل مباشرة</button>' +
      '<button class="p s" id="riv_th" type="button" style="background:#0b1426;color:#f6e3a8">🖨 طباعة إيصال حراري (بلوتوث)</button>' +
      '<button class="s" id="riv_a4" type="button">📄 طباعة A4 / حفظ PDF</button>' +
      (o.phone ? '<button class="s" id="riv_wa" type="button">💬 إرسال نص واتساب</button>' : '') +
      '<button class="s" id="riv_bt" type="button" title="إرسال لتطبيق طابعة البلوتوث RawBT">📱 تطبيق البلوتوث (RawBT)</button>' +
      '<button class="s" id="riv_cp" type="button">📋 نسخ النص</button>' +
      '<button class="s" id="riv_x" type="button">إغلاق</button>' +
    '</div>';

    if ($('riv_x')) $('riv_x').onclick = () => dlg.close();
    if ($('riv_pdf')) $('riv_pdf').onclick = () => sendRepInvoicePdf(o, $('riv_pdf'));
    if ($('riv_th')) $('riv_th').onclick = () => printThermalReceipt(o);
    if ($('riv_a4')) $('riv_a4').onclick = () => {
      if (typeof printInvoice === 'function') printInvoice(o);
      else printThermalReceipt(o);
    };
    if ($('riv_wa')) {
      $('riv_wa').onclick = () => {
        const ph = typeof waPhone === 'function' ? waPhone(o.phone) : o.phone;
        window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(rawText), '_blank');
      };
    }
    if ($('riv_bt')) {
      $('riv_bt').onclick = () => {
        window.location.href = 'rawbt:' + encodeURIComponent(rawText);
        setTimeout(() => {
          if (typeof toast === 'function') toast('تم إرسال الإيصال لتطبيق طابعة البلوتوث ✓');
        }, 500);
      };
    }
    if ($('riv_cp')) {
      $('riv_cp').onclick = async () => {
        try {
          await navigator.clipboard.writeText(rawText);
          $('riv_cp').textContent = 'تم النسخ ✓';
          if (typeof toast === 'function') toast('تم نسخ نص الفاتورة ✓');
        } catch (e) { alert('تعذّر النسخ'); }
      };
    }
  };

  renderContent();
  dlg.showModal();

  // جلب الأسعار الدقيقة وتفاصيل الأصناف من الخادم إن لم تكن متوفرة
  const needsFetch = !o.subtotal || !(o.items && o.items.some(i => +i.price > 0));
  if (needsFetch && o.id) {
    try {
      const rr = await apiPost('/api/rep-admin', JSON.stringify({ action: 'get_order_invoice', order_id: o.id }));
      const j = await rr.json().catch(() => ({}));
      if (rr.ok && j && j.order) {
        Object.assign(o, j.order);
        if (dlg.open && document.getElementById('riv_body')) {
          renderContent();
        }
      }
    } catch (e) {}
  }
}

function repCard(o) {
  const ph = o.phone ? digits(o.phone) : '';
  const cn = repCleanNotes(o);
  const its = o.items || [];
  const imgItems = its.filter(i => repImgUrl(i.image || i.image_path));
  const cp = repCompanyProfile(o);
  const collAmount = o.collect != null ? +o.collect : (+o.balance || 0);
  const catKey = typeof orderCatOf === 'function' ? orderCatOf(o) : 'normal';
  const catM = typeof orderCatMeta === 'function' ? orderCatMeta(o) : { badge: '📦 عادي', cls: '' };
  const urgStyle = catKey === 'urgent' ? ' style="border-inline-start:4px solid var(--late);box-shadow:0 4px 14px rgba(185,28,28,.12)"' : catKey === 'vip' ? ' style="border-inline-start:4px solid var(--gold)"' : '';

  return '<div class="card rcard" data-roid="' + o.id + '"' + urgStyle + '>' +
    '<div class="bar">' +
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
        '<b class="rno">#' + o.order_no + '</b>' +
        (catKey !== 'normal' ? '<span class="chip ' + catM.cls + '" style="font-weight:700">' + esc(catM.badge) + '</span>' : '') +
        '<span class="chip" style="font-size:11px">🏢 ' + esc(cp.name) + '</span>' +
      '</div>' +
      '<span class="m">' + esc(o.order_date || '') + '</span>' +
    '</div>' +
    '<div class="rn" style="font-size:16px;font-weight:800;margin:6px 0 4px">' + esc(o.customer_name) + '</div>' +
    (o.phone ? '<div class="rcall" style="margin-bottom:8px"><a class="btnl" href="tel:' + esc(ph) + '">📞 اتصال</a><a class="btnl" target="_blank" rel="noopener" href="https://wa.me/' + waPhone(o.phone) + '">💬 واتساب</a><span class="m" dir="ltr">' + esc(o.phone) + '</span></div>' : '') +
    (o.address ? '<div class="ra" style="margin-bottom:10px">📍 ' + esc(o.address) + ' <a class="btnl" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address) + '">🗺 الخريطة</a></div>' : '') +
    '<div class="rlist"><div class="bar" style="margin-bottom:6px"><b>📋 قائمة التجهيز (' + its.length + ' أصناف)</b>' + (imgItems.length ? '<span class="chip ok">📷 ' + imgItems.length + ' صور</span>' : '') + '</div>' +
    its.map(i => {
      const u = repImgUrl(i.image || i.image_path);
      return '<div class="ritem" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--line)">' +
        (u ? '<img class="thumb" src="' + esc(u) + '" alt="' + esc(i.name) + '" data-zoom="' + esc(u) + '" title="اضغط لتكبير الصورة" style="width:60px;height:60px;object-fit:cover;border-radius:10px;border:2px solid var(--acc);cursor:zoom-in;flex:none">' : '') +
        '<div style="flex:1;min-width:0">' +
          '<b style="display:block;font-size:13.5px">' + esc(i.name) + '</b>' +
          (i.price ? '<span style="font-size:12px;color:var(--mute)">السعر: ' + money(i.price) + ' ' + cp.currency + '</span>' : '') +
          (i.supplier ? '<span class="rsup" style="display:block;font-size:11.5px;color:var(--acc)">🏪 التاجر: ' + esc(i.supplier) + '</span>' : '') +
        '</div>' +
        '<b style="font-size:15px;flex:none">× ' + (+i.qty) + '</b>' +
      '</div>';
    }).join('') + '</div>' +
    (imgItems.length ? '<div style="margin:8px 0;padding:10px;border-radius:12px;background:var(--bg);border:1px solid var(--line)"><div style="font-size:12px;font-weight:700;margin-bottom:6px">🖼️ معرض صور الأصناف (اضغط للتكبير والمطابقة):</div><div style="display:flex;gap:8px;flex-wrap:wrap">' + imgItems.map(i => { const u = repImgUrl(i.image || i.image_path); return '<div style="text-align:center;cursor:zoom-in" data-zoom="' + esc(u) + '"><img src="' + esc(u) + '" alt="" style="width:68px;height:68px;object-fit:cover;border-radius:10px;border:1.5px solid var(--line);display:block"><span style="font-size:10.5px;display:block;max-width:68px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">' + esc(i.name) + '</span></div>'; }).join('') + '</div></div>' : '') +
    (cn ? '<div class="dnote" style="background:var(--soonsoft);color:var(--soon);margin:8px 0">⚠️ ' + esc(cn) + '</div>' : '') +
    (collAmount > 0 ? '<div class="rcol" style="background:var(--goldsoft);border:1px solid var(--gold);border-radius:12px;padding:10px 14px;margin:10px 0;font-size:16px;display:flex;justify-content:space-between;align-items:center"><span>💵 المطلوب تحصيله نقداً:</span><b style="font-size:18px;color:var(--ink)">' + money(collAmount) + ' ' + cp.currency + '</b></div>' : '<div class="m" style="margin:8px 0;color:var(--ok)">✅ مدفوع بالكامل مسبقاً (لا تحصيل نقدي)</div>') +
    '<div class="m" style="margin:6px 0;font-size:12px">مسجل الطلب: ' + esc(o.created_by_name || '—') + '</div>' +
    '<div class="acts ract" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' +
      '<button class="p" data-rd="' + o.id + '" style="flex:2 1 110px">✅ تم التوصيل</button>' +
      '<button class="s" data-rpdf="' + o.id + '" style="flex:2 1 110px;font-weight:700;background:#15803d;color:#fff;border-color:#15803d" title="إرسال الفاتورة بصيغة PDF مباشرة للعميل">📄 إرسال PDF</button>' +
      '<button class="s" data-rinv="' + o.id + '" style="flex:1 1 90px;font-weight:700" title="طباعة فاتورة أو إيصال حراري للعميل">🧾 إيصال</button>' +
      '<button class="dng s" data-rc="' + o.id + '" style="flex:1 1 70px">❌ إلغاء</button>' +
      '<button class="s" data-re="' + o.id + '" aria-label="معاينة الرسالة" style="flex:0 0 42px">👁</button>' +
    '</div></div>';
}

function repHistoryCard(o) {
  const isDelivered = o.status === 'delivered';
  const cp = repCompanyProfile(o);
  const collAmount = o.collect != null ? +o.collect : (+o.balance || 0);
  const delTime = o.delivered_at ? new Date(o.delivered_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '';
  const delDate = o.delivered_at ? String(o.delivered_at).slice(0, 10) : o.order_date;

  return '<div class="card rcard" style="padding:12px 14px;margin-bottom:10px;border-right:4px solid ' + (isDelivered ? 'var(--ok)' : 'var(--late)') + '">' +
    '<div class="bar" style="margin-bottom:6px">' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        '<b class="rno" style="font-size:15px">#' + o.order_no + '</b>' +
        '<span class="chip ' + (isDelivered ? 'ok' : 'late') + '">' + (isDelivered ? '✅ تم التوصيل' : '❌ ملغي') + '</span>' +
        '<span class="chip" style="font-size:11px">🏢 ' + esc(cp.name) + '</span>' +
      '</div>' +
      '<span class="m" style="font-size:12px">' + esc(delDate) + (delTime ? ' · ' + esc(delTime) : '') + '</span>' +
    '</div>' +
    '<div style="font-size:15px;font-weight:700;margin-bottom:4px">' + esc(o.customer_name) + '</div>' +
    (o.phone ? '<div class="m" dir="ltr" style="font-size:12.5px;margin-bottom:4px">📞 ' + esc(o.phone) + (o.address ? ' · 📍 ' + esc(o.address) : '') + '</div>' : '') +
    (o.cancel_reason ? '<div class="dnote" style="background:var(--latesoft);color:var(--late);margin:6px 0;font-size:12.5px">سبب الإلغاء: ' + esc(o.cancel_reason) + '</div>' : '') +
    (isDelivered && collAmount > 0 ? '<div style="font-size:13.5px;margin:6px 0;color:var(--ok)">💵 تم تحصيل: <b>' + money(collAmount) + ' ' + cp.currency + '</b></div>' : '') +
    '<div class="m" style="font-size:12px;margin:4px 0">' + (o.items || []).length + ' أصناف: ' + esc((o.items || []).map(i => i.name + ' (' + i.qty + ')').join('، ')) + '</div>' +
    '<div class="row s" style="margin-top:8px;gap:6px;justify-content:flex-start">' +
      '<button class="s" data-rinv="' + o.id + '" style="font-weight:700">🧾 فاتورة / إيصال حراري</button>' +
      (o.phone ? '<a class="btnl s" target="_blank" rel="noopener" href="https://wa.me/' + waPhone(o.phone) + '">💬 واتساب</a>' : '') +
      '<button class="s" data-re="' + o.id + '">👁 تفاصيل الطلب</button>' +
    '</div></div>';
}

function repFilterHistory(historyOrders) {
  const q = String(REP_STATE.filter.q || '').trim().toLowerCase();
  const st = REP_STATE.filter.status || '';
  const pe = REP_STATE.filter.period || '';
  const td = today();

  return historyOrders.filter(o => {
    if (st && o.status !== st) return false;

    if (pe === 'today') {
      const d = String(o.delivered_at || o.order_date || '').slice(0, 10);
      if (d !== td) return false;
    } else if (pe === 'yesterday') {
      const d = String(o.delivered_at || o.order_date || '').slice(0, 10);
      const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (d !== y) return false;
    } else if (pe === 'week') {
      const t = new Date(o.delivered_at || o.order_date || 0).getTime();
      if (Date.now() - t > 7 * 86400000) return false;
    } else if (pe === 'month') {
      const ym = td.slice(0, 7);
      const d = String(o.delivered_at || o.order_date || '').slice(0, 7);
      if (d !== ym) return false;
    }

    if (q) {
      const no = String(o.order_no || '');
      const cust = String(o.customer_name || '').toLowerCase();
      const ph = String(o.phone || '').replace(/\D/g, '');
      const addr = String(o.address || '').toLowerCase();
      if (!no.includes(q) && !cust.includes(q) && !ph.includes(q) && !addr.includes(q)) return false;
    }

    return true;
  });
}

function repRender() {
  if (!S.me) return;
  const act = rOpen();
  const allPast = rHistory();
  const filteredPast = repFilterHistory(allPast);

  const td = today();
  const deliveredToday = allPast.filter(o => o.status === 'delivered' && String(o.delivered_at || o.order_date || '').slice(0, 10) === td);
  const moneyToday = deliveredToday.reduce((sum, o) => sum + (+o.collect || +o.balance || 0), 0);
  const totalDeliveredPast = allPast.filter(o => o.status === 'delivered');
  const totalCollectedPast = totalDeliveredPast.reduce((sum, o) => sum + (+o.collect || +o.balance || 0), 0);

  const curTab = REP_STATE.tab || 'active';

  $app.innerHTML = headerHtml() + '<div class="view">' +
    (S.rerr ? '<div class="card" style="border-color:var(--late)"><b>تعذّر تحميل الطلبات:</b><p class="m">' + esc(S.rerr) + '</p></div>' : '') +

    // شريط المؤشرات للمندوب
    '<div class="stats kpis rep-k" style="grid-template-columns:repeat(4,1fr)!important;gap:8px;margin-bottom:12px">' +
      '<div class="stat"><b>' + act.length + '</b><span>للتوصيل الآن</span></div>' +
      '<div class="stat ok"><b>' + deliveredToday.length + '</b><span>مسلّمة اليوم</span></div>' +
      '<div class="stat ok" style="grid-column:span 1"><b>' + money(moneyToday) + '</b><span>تحصيل اليوم</span></div>' +
      '<div class="stat"><b>' + allPast.length + '</b><span>إجمالي السجل</span></div>' +
    '</div>' +

    // تبويبات التنقل
    '<div class="rep-nav-tabs">' +
      '<button class="rep-tab-btn ' + (curTab === 'active' ? 'on' : '') + '" id="rtab_act">' +
        '🛵 الطلبات الجارية للتوصيل <span class="badge">' + act.length + '</span>' +
      '</button>' +
      '<button class="rep-tab-btn ' + (curTab === 'history' ? 'on' : '') + '" id="rtab_hist">' +
        '📜 سجل الطلبات السابقة <span class="badge">' + allPast.length + '</span>' +
      '</button>' +
    '</div>' +

    // محتوى التبويب النشط
    (curTab === 'active' ? (
      act.length ? act.map(repCard).join('') :
      '<div class="card empty" style="text-align:center;padding:32px 16px">' +
        '<div style="font-size:42px;margin-bottom:8px">🎉</div>' +
        '<b>لا توجد طلبات قيد التوصيل حالياً.</b><br>' +
        '<span class="m" style="display:inline-block;margin-top:6px">سيصلك إشعار فوري على جوالك عند إسناد أي طلب جديد لك.</span>' +
      '</div>'
    ) : (
      // محتوى تبويب السجل السابق مع الفلترة
      '<div class="rep-filter-box">' +
        '<div class="rep-filter-row" style="margin-bottom:8px">' +
          '<input id="rf_q" placeholder="🔍 بحث برقم الطلب، اسم العميل، الهاتف..." value="' + esc(REP_STATE.filter.q || '') + '" style="flex:2 1 200px">' +
          '<select id="rf_st" style="flex:1 1 120px">' +
            '<option value="">كل الحالات (' + allPast.length + ')</option>' +
            '<option value="delivered"' + (REP_STATE.filter.status === 'delivered' ? ' selected' : '') + '>✅ تم التوصيل (' + totalDeliveredPast.length + ')</option>' +
            '<option value="cancelled"' + (REP_STATE.filter.status === 'cancelled' ? ' selected' : '') + '>❌ ملغي (' + (allPast.length - totalDeliveredPast.length) + ')</option>' +
          '</select>' +
          '<select id="rf_pe" style="flex:1 1 120px">' +
            '<option value=""' + (!REP_STATE.filter.period ? ' selected' : '') + '>كل الفترات</option>' +
            '<option value="today"' + (REP_STATE.filter.period === 'today' ? ' selected' : '') + '>اليوم</option>' +
            '<option value="yesterday"' + (REP_STATE.filter.period === 'yesterday' ? ' selected' : '') + '>أمس</option>' +
            '<option value="week"' + (REP_STATE.filter.period === 'week' ? ' selected' : '') + '>آخر 7 أيام</option>' +
            '<option value="month"' + (REP_STATE.filter.period === 'month' ? ' selected' : '') + '>هذا الشهر</option>' +
          '</select>' +
          (REP_STATE.filter.q || REP_STATE.filter.status || REP_STATE.filter.period ? '<button class="s" id="rf_reset" type="button">إعادة ضبط</button>' : '') +
        '</div>' +
        '<div style="font-size:12.5px;color:var(--mute);display:flex;justify-content:space-between;align-items:center;padding:4px 2px">' +
          '<span>عدد الطلبات المعروضة: <b>' + filteredPast.length + '</b></span>' +
          '<span>إجمالي المبالغ المحصلة: <b style="color:var(--ok)">' + money(filteredPast.filter(o => o.status === 'delivered').reduce((s, o) => s + (+o.collect || +o.balance || 0), 0)) + ' ' + (typeof BRAND !== 'undefined' ? BRAND.currency : 'ر.ي') + '</b></span>' +
        '</div>' +
      '</div>' +
      (filteredPast.length ? filteredPast.map(repHistoryCard).join('') :
        '<div class="card empty" style="text-align:center;padding:24px">لا توجد طلبات سابقة مطابقة للفلتر المحدد.</div>')
    )) +

    '<div class="row" style="margin-top:20px;justify-content:center">' +
      '<button class="s" id="rep_set">⚙ الإعدادات وتغيير كلمة المرور</button>' +
    '</div></div>';

  bindHeader();

  // أزرار التبويبات
  $('rtab_act').onclick = () => { REP_STATE.tab = 'active'; repRender(); };
  $('rtab_hist').onclick = () => { REP_STATE.tab = 'history'; repRender(); };

  // عناصر الفلترة
  if ($('rf_q')) {
    let debounceTimer;
    $('rf_q').oninput = e => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        REP_STATE.filter.q = e.target.value;
        repRender();
      }, 250);
    };
  }
  if ($('rf_st')) $('rf_st').onchange = e => { REP_STATE.filter.status = e.target.value; repRender(); };
  if ($('rf_pe')) $('rf_pe').onchange = e => { REP_STATE.filter.period = e.target.value; repRender(); };
  if ($('rf_reset')) $('rf_reset').onclick = () => { REP_STATE.filter = { q: '', status: '', period: '' }; repRender(); };

  // أحداث الطلبات
  document.querySelectorAll('[data-rd]').forEach(b => b.onclick = () => repDeliver(b.dataset.rd));
  document.querySelectorAll('[data-rc]').forEach(b => b.onclick = () => repCancel(b.dataset.rc));
  document.querySelectorAll('[data-rpdf]').forEach(b => b.onclick = () => {
    const o = (S.rorders || []).find(x => x.id === b.dataset.rpdf);
    if (o) sendRepInvoicePdf(o, b);
  });
  document.querySelectorAll('[data-rinv]').forEach(b => b.onclick = () => {
    const o = (S.rorders || []).find(x => x.id === b.dataset.rinv);
    if (o) repInvoiceDialog(o);
  });
  document.querySelectorAll('[data-zoom]').forEach(im => im.onclick = () => {
    dlg.innerHTML = '<img src="' + im.dataset.zoom + '" alt="" class="zoomimg"><div class="row dact"><button class="s" id="zm_x">إغلاق</button></div>';
    $('zm_x').onclick = () => dlg.close();
    dlg.showModal();
  });
  document.querySelectorAll('[data-re]').forEach(b => b.onclick = () => repPreview((S.rorders || []).find(o => o.id === b.dataset.re)));
  $('rep_set').onclick = repSettings;
}

function repFocus(id) {
  repRender();
  const el = document.querySelector('[data-roid="' + id + '"]');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2200);
  }
}

function repPreview(o) {
  if (!o) return;
  const imgItems = (o.items || []).filter(i => repImgUrl(i.image || i.image_path));
  const gal = imgItems.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' + imgItems.map(i => {
    const u = repImgUrl(i.image || i.image_path);
    return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"></a>';
  }).join('') + '</div>' : '';

  dlg.innerHTML = '<h2>👁 معاينة الطلب #' + o.order_no + '</h2>' + gal +
    '<pre class="msgp">' + esc(repMsg(o)) + '</pre>' +
    '<div class="row dact" style="gap:6px">' +
      '<button class="p s" id="rv_inv" type="button">🧾 فاتورة للعميل</button>' +
      '<button class="s" id="rv_cp" type="button">📋 نسخ</button>' +
      '<button class="s" id="rv_x" type="button">إغلاق</button>' +
    '</div>';

  $('rv_x').onclick = () => dlg.close();
  $('rv_inv').onclick = () => { dlg.close(); repInvoiceDialog(o); };
  $('rv_cp').onclick = async () => {
    try {
      await navigator.clipboard.writeText(repMsg(o));
      $('rv_cp').textContent = 'تم النسخ ✓';
    } catch (e) { alert('تعذّر النسخ'); }
  };
  dlg.showModal();
}

async function repSet(id, status, reason) {
  const { error } = await sb.rpc('rep_set_status', { p_order: id, p_status: status, p_reason: reason || null });
  if (error) {
    alert('تعذّر التنفيذ: ' + error.message);
    return false;
  }
  apiPost('/api/order-push', JSON.stringify({ order_id: id })).catch(() => {});
  await repLoad();
  return true;
}

function repDeliver(id) {
  const o = (S.rorders || []).find(x => x.id === id);
  if (!o) return;
  const collAmount = o.collect != null ? +o.collect : (+o.balance || 0);
  const cp = repCompanyProfile(o);

  dlg.innerHTML = '<h2>✅ تأكيد توصيل الطلب #' + o.order_no + '</h2>' +
    '<div style="font-weight:700;margin-bottom:6px;font-size:15px">' + esc(o.customer_name) + '</div>' +
    (collAmount > 0 ? '<div style="background:var(--goldsoft);padding:10px 14px;border-radius:10px;margin-bottom:12px;font-size:15px">هل استلمت المبلغ المطلوب: <b>' + money(collAmount) + ' ' + cp.currency + '</b>؟</div>' : '<p>تأكيد تسليم الطلب للعميل؟</p>') +
    '<div class="row dact" style="gap:8px">' +
      '<button class="p" id="rdv_ok">نعم، تم التوصيل بنجاح</button>' +
      '<button class="s" id="rdv_x">رجوع</button>' +
    '</div>';

  $('rdv_x').onclick = () => dlg.close();
  $('rdv_ok').onclick = async () => {
    $('rdv_ok').disabled = true;
    dlg.close();
    const ok = await repSet(id, 'delivered');
    if (ok) {
      // فتح خيار الفاتورة فور التوصيل لطباعتها أو إرسالها للعميل
      setTimeout(() => {
        if (confirm('هل ترغب بإصدار وطباعة فاتورة / إيصال حراري للعميل الآن؟')) {
          repInvoiceDialog(o);
        }
      }, 300);
    }
  };
  dlg.showModal();
}

function repCancel(id) {
  const o = (S.rorders || []).find(x => x.id === id);
  if (!o) return;
  dlg.innerHTML = '<h2>❌ إلغاء الطلب #' + o.order_no + '</h2>' +
    '<p class="m">أنت بصدد إلغاء هذا الطلب، يرجى كتابة السبب بوضوح:</p>' +
    '<label>سبب الإلغاء (إجباري)<textarea id="rc_r" rows="3" placeholder="مثال: العميل لا يرد / رفض الاستلام / طلب التأجيل..."></textarea></label>' +
    '<div class="row dact"><button class="dng" id="rc_ok" disabled>تأكيد الإلغاء</button><button class="s" id="rc_x">رجوع</button></div>';

  $('rc_x').onclick = () => dlg.close();
  $('rc_r').oninput = () => { $('rc_ok').disabled = $('rc_r').value.trim().length < 3; };
  $('rc_ok').onclick = async () => {
    const r = $('rc_r').value.trim();
    $('rc_ok').disabled = true;
    dlg.close();
    await repSet(id, 'cancelled', r);
  };
  dlg.showModal();
  $('rc_r').focus();
}

function repSettings() {
  dlg.innerHTML = '<h2>⚙ إعدادات المندوب</h2>' +
    '<div class="row"><button class="p" id="rs_push" style="width:100%">🔔 تفعيل إشعارات الجوال الفورية</button></div>' +
    '<p class="m" id="rs_pm" style="margin:6px 0 14px">فعّلها ليصلك تنبيه صوتي فوري عند إسناد أي طلب توصيل لك.</p>' +
    '<label style="margin-top:10px">تغيير كلمة المرور الخاصة بك<input id="rs_pw" type="password" dir="ltr" placeholder="كلمة مرور جديدة (6 أحرف على الأقل)"></label>' +
    '<div class="row" style="margin-top:8px"><button class="s" id="rs_pwb">حفظ كلمة المرور الجديدة</button></div>' +
    '<div class="row dact" style="margin-top:16px"><button class="dng s" id="rs_out">تسجيل الخروج</button><button class="s" id="rs_x">إغلاق</button></div>' +
    '<p class="m" style="text-align:center;margin-top:10px">إصدار النظام ' + (typeof VERSION !== 'undefined' ? VERSION : '1.0') + '</p>';

  $('rs_x').onclick = () => dlg.close();
  $('rs_out').onclick = logout;
  $('rs_push').onclick = async () => {
    await autoEnablePush();
    $('rs_pm').textContent = Notification.permission === 'granted' ? 'تم تفعيل الإشعارات بنجاح على هذا الجهاز ✅' : 'لم تُمنح صلاحية الإشعارات، فعّلها من إعدادات المتصفح.';
  };
  $('rs_pwb').onclick = async () => {
    const v = $('rs_pw').value.trim();
    if (v.length < 6) return alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    const { error } = await sb.auth.updateUser({ password: v });
    alert(error ? error.message : 'تم تغيير كلمة المرور بنجاح ✅');
    $('rs_pw').value = '';
  };
  dlg.showModal();
}
