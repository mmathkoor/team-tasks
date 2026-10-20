// ===== واجهة المندوب: لا مهام، لا أسعار، لا فتح للطلب كاملاً — فقط ما يلزم للتوصيل =====
async function repLoad() {
  const [r, nt] = await Promise.all([sb.rpc('rep_orders'), sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(40)]);
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
const rOpen = () => (S.rorders || []).filter(o => o.status === 'preparing');
const repCleanNotes = o => String((o && o.notes) || '').replace(/\[شركة:\s*[^\]]+\]\n?/g, '').trim();
function repMsg(o) {
  const cn = repCleanNotes(o);
  return ['مرحباً كابتن *' + S.me.name + '* 🛵', '📦 طلب #' + o.order_no, '', '🧑‍💼 مسجل الطلب: ' + (o.created_by_name || '—'), '🙍 العميل: ' + o.customer_name, '📞 الهاتف: ' + (o.phone || '—'), '📍 العنوان: ' + (o.address || '—'),
    '💵 المطلوب تحصيله: ' + money(o.collect) + ' ' + BRAND.currency, '', '📋 *قائمة التجهيز:*'].concat((o.items || []).map(i => {
      const u = repImgUrl(i.image || i.image_path);
      return '▫️ ' + i.name + ' × ' + (+i.qty) + (i.supplier ? '\n    🏪 التاجر: ' + i.supplier : '') + (u ? '\n    📷 صورة المنتج: ' + u : '');
    }))
    .concat(cn ? ['', '⚠️ *ملاحظات هامة:* ' + cn] : []).concat(['', '🌹 قل تم وشد الهمة']).join('\n');
}
function repCard(o) {
  const ph = o.phone ? digits(o.phone) : '';
  const cn = repCleanNotes(o);
  const its = o.items || [];
  const imgItems = its.filter(i => repImgUrl(i.image || i.image_path));
  return '<div class="card rcard" data-roid="' + o.id + '"><div class="bar"><b class="rno">#' + o.order_no + '</b><span class="m">' + esc(o.order_date) + '</span></div>' +
    '<div class="rn">' + esc(o.customer_name) + '</div>' +
    (o.phone ? '<div class="rcall"><a class="btnl" href="tel:' + esc(ph) + '">📞 اتصال</a><a class="btnl" target="_blank" rel="noopener" href="https://wa.me/' + waPhone(o.phone) + '">💬 واتساب</a><span class="m" dir="ltr">' + esc(o.phone) + '</span></div>' : '') +
    (o.address ? '<div class="ra">📍 ' + esc(o.address) + ' <a class="btnl" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address) + '">🗺 الخريطة</a></div>' : '') +
    '<div class="rlist"><div class="bar" style="margin-bottom:6px"><b>📋 قائمة التجهيز (' + its.length + ')</b>' + (imgItems.length ? '<span class="chip ok">📷 ' + imgItems.length + ' صور مرفقة</span>' : '') + '</div>' +
    its.map(i => {
      const u = repImgUrl(i.image || i.image_path);
      return '<div class="ritem">' +
        (u ? '<img class="thumb" src="' + esc(u) + '" alt="' + esc(i.name) + '" data-zoom="' + esc(u) + '" title="اضغط لتكبير صورة المنتج" style="width:64px;height:64px;object-fit:cover;border-radius:10px;border:2px solid var(--acc);cursor:zoom-in">' : '') +
        '<span style="flex:1"><b>' + esc(i.name) + '</b>' +
        (i.supplier ? '<span class="rsup">🏪 التاجر: ' + esc(i.supplier) + '</span>' : '') +
        (u ? '<span class="m" style="display:block;font-size:11.5px;color:var(--ok);margin-top:2px">🔍 اضغط على الصورة لتكبيرها ومطابقة الصنف</span>' : '') +
        '</span><b>× ' + (+i.qty) + '</b></div>';
    }).join('') + '</div>' +
    (imgItems.length ? '<div style="margin:8px 0;padding:10px;border-radius:12px;background:var(--bg);border:1px solid var(--line)"><div style="font-size:12px;font-weight:700;margin-bottom:6px">🖼️ معرض صور المنتجات السريع (اضغط للتكبير):</div><div style="display:flex;gap:8px;flex-wrap:wrap">' + imgItems.map(i => { const u = repImgUrl(i.image || i.image_path); return '<div style="text-align:center;cursor:zoom-in" data-zoom="' + esc(u) + '"><img src="' + esc(u) + '" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1.5px solid var(--line);display:block"><span style="font-size:11px;display:block;max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">' + esc(i.name) + '</span></div>'; }).join('') + '</div></div>' : '') +
    (cn ? '<div class="dnote" style="background:var(--soonsoft);color:var(--soon)">⚠️ ' + esc(cn) + '</div>' : '') +
    (+o.collect > 0 ? '<div class="rcol">💵 المطلوب تحصيله: <b>' + money(o.collect) + ' ' + BRAND.currency + '</b></div>' : '') +
    '<div class="m" style="margin:6px 0">سجّله: ' + esc(o.created_by_name || '—') + ' (للاستفسار عن الطلب)</div>' +
    '<div class="acts ract"><button class="p" data-rd="' + o.id + '">✅ تم التوصيل</button><button class="dng" data-rc="' + o.id + '">❌ إلغاء</button><button data-re="' + o.id + '" aria-label="معاينة الرسالة">👁</button></div></div>';
}
function repDone(o) {
  return '<div class="card rdone ' + o.status + '"><div class="bar"><b>#' + o.order_no + ' · ' + esc(o.customer_name) + '</b><span class="chip ' + (o.status === 'delivered' ? 'ok' : 'late') + '">' + (o.status === 'delivered' ? '✅ تم التوصيل' : '❌ ملغي') + '</span></div>' +
    (o.cancel_reason ? '<div class="m">السبب: ' + esc(o.cancel_reason) + '</div>' : '') + '</div>';
}
function repRender() {
  if (!S.me) return;
  const act = rOpen(), rec = (S.rorders || []).filter(o => o.status !== 'preparing'), td = today();
  const dn = rec.filter(o => o.status === 'delivered' && String(o.delivered_at || '').slice(0, 10) === td).length;
  $app.innerHTML = headerHtml() + '<div class="view">' +
    (S.rerr ? '<div class="card"><b>تعذّر تحميل الطلبات.</b><p class="m">' + esc(S.rerr) + '</p></div>' : '') +
    '<div class="stats kpis rep-k"><div class="stat"><b>' + act.length + '</b><span>للتوصيل الآن</span></div><div class="stat ok"><b>' + dn + '</b><span>وصّلتها اليوم</span></div></div>' +
    (act.length ? act.map(repCard).join('') : '<div class="card empty">لا توجد طلبات للتوصيل الآن 🎉<br><span class="m">سيصلك إشعار فور إسناد طلب جديد لك.</span></div>') +
    (rec.length ? '<h2 style="margin:20px 4px 8px">آخر النتائج</h2>' + rec.map(repDone).join('') : '') +
    '<div class="row" style="margin-top:18px;justify-content:center"><button class="s" id="rep_set">⚙ الإعدادات</button></div></div>';
  bindHeader();
  document.querySelectorAll('[data-rd]').forEach(b => b.onclick = () => repDeliver(b.dataset.rd));
  document.querySelectorAll('[data-rc]').forEach(b => b.onclick = () => repCancel(b.dataset.rc));
  document.querySelectorAll('[data-zoom]').forEach(im => im.onclick = () => { dlg.innerHTML = '<img src="' + im.dataset.zoom + '" alt="" class="zoomimg"><div class="row dact"><button class="s" id="zm_x">إغلاق</button></div>'; $('zm_x').onclick = () => dlg.close(); dlg.showModal(); });
  document.querySelectorAll('[data-re]').forEach(b => b.onclick = () => repPreview((S.rorders || []).find(o => o.id === b.dataset.re)));
  $('rep_set').onclick = repSettings;
}
function repFocus(id) {
  repRender(); const el = document.querySelector('[data-roid="' + id + '"]');
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2200); }
}
function repPreview(o) {
  if (!o) return;
  const imgItems = (o.items || []).filter(i => repImgUrl(i.image || i.image_path));
  const gal = imgItems.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' + imgItems.map(i => { const u = repImgUrl(i.image || i.image_path); return '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"></a>'; }).join('') + '</div>' : '';
  dlg.innerHTML = '<h2>👁 معاينة الطلب #' + o.order_no + '</h2>' + gal + '<pre class="msgp">' + esc(repMsg(o)) + '</pre><div class="row dact"><button class="s" id="rv_cp">نسخ</button><button class="s" id="rv_x">إغلاق</button></div>';
  $('rv_x').onclick = () => dlg.close();
  $('rv_cp').onclick = async () => { try { await navigator.clipboard.writeText(repMsg(o)); $('rv_cp').textContent = 'تم النسخ ✓'; } catch (e) { alert('تعذّر النسخ'); } };
  dlg.showModal();
}
async function repSet(id, status, reason) {
  const { error } = await sb.rpc('rep_set_status', { p_order: id, p_status: status, p_reason: reason || null });
  if (error) { alert('تعذّر التنفيذ: ' + error.message); return false; }
  apiPost('/api/order-push', JSON.stringify({ order_id: id })).catch(() => {});
  await repLoad(); return true;
}
function repDeliver(id) {
  const o = (S.rorders || []).find(x => x.id === id); if (!o) return;
  dlg.innerHTML = '<h2>✅ تأكيد التوصيل</h2><div style="font-weight:700;margin-bottom:6px">#' + o.order_no + ' · ' + esc(o.customer_name) + '</div>' + (+o.collect > 0 ? '<p>هل استلمت المبلغ <b>' + money(o.collect) + ' ' + BRAND.currency + '</b>؟</p>' : '') +
    '<div class="row dact"><button class="p" id="rdv_ok">نعم، تم التوصيل</button><button class="s" id="rdv_x">رجوع</button></div>';
  $('rdv_x').onclick = () => dlg.close();
  $('rdv_ok').onclick = async () => { $('rdv_ok').disabled = true; dlg.close(); await repSet(id, 'delivered'); };
  dlg.showModal();
}
function repCancel(id) {
  const o = (S.rorders || []).find(x => x.id === id); if (!o) return;
  dlg.innerHTML = '<h2>❌ إلغاء الطلب #' + o.order_no + '</h2><p class="m">أنت بصدد إلغاء الطلب، اذكر السبب:</p><label>سبب الإلغاء (إجباري)<textarea id="rc_r" rows="3" placeholder="مثال: العميل لا يرد"></textarea></label><div class="row dact"><button class="dng" id="rc_ok" disabled>تأكيد الإلغاء</button><button class="s" id="rc_x">رجوع</button></div>';
  $('rc_x').onclick = () => dlg.close();
  $('rc_r').oninput = () => { $('rc_ok').disabled = $('rc_r').value.trim().length < 3; };
  $('rc_ok').onclick = async () => { const r = $('rc_r').value.trim(); $('rc_ok').disabled = true; dlg.close(); await repSet(id, 'cancelled', r); };
  dlg.showModal(); $('rc_r').focus();
}
function repSettings() {
  dlg.innerHTML = '<h2>⚙ الإعدادات</h2><div class="row"><button class="p" id="rs_push">🔔 تفعيل إشعارات الجوال</button></div><p class="m" id="rs_pm">فعّلها ليصلك إشعار فور إسناد طلب جديد لك.</p>' +
    '<label style="margin-top:10px">تغيير كلمة المرور<input id="rs_pw" type="password" dir="ltr" placeholder="كلمة مرور جديدة (8 أحرف على الأقل)"></label><div class="row" style="margin-top:6px"><button class="s" id="rs_pwb">حفظ كلمة المرور</button></div>' +
    '<div class="row dact"><button class="dng s" id="rs_out">تسجيل خروج</button><button class="s" id="rs_x">إغلاق</button></div><p class="m" style="text-align:center">النسخة ' + VERSION + '</p>';
  $('rs_x').onclick = () => dlg.close(); $('rs_out').onclick = logout;
  $('rs_push').onclick = async () => { await autoEnablePush(); $('rs_pm').textContent = Notification.permission === 'granted' ? 'تم تفعيل الإشعارات على هذا الجهاز ✅' : 'لم تُمنح صلاحية الإشعارات، فعّلها من إعدادات المتصفح.'; };
  $('rs_pwb').onclick = async () => { const v = $('rs_pw').value; if (v.length < 8) return alert('8 أحرف على الأقل'); const { error } = await sb.auth.updateUser({ password: v }); alert(error ? error.message : 'تم تغيير كلمة المرور'); $('rs_pw').value = ''; };
  dlg.showModal();
}
