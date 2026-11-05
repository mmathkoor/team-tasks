// ===== إعدادات الطلبات للمدير: المندوبون (بالجوال) + هوية المتجر + سعر الشراء + مدة حفظ الصور =====
const genPw = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; const a = new Uint32Array(8); crypto.getRandomValues(a); a.forEach(x => { s += c[x % c.length]; }); return s; };
async function repApi(body) {
  try {
    const payload = Object.assign({}, body, S.me && S.me.email ? { _caller_email: S.me.email } : {});
    const r = await apiPost('/api/rep-admin', JSON.stringify(payload));
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, j } : { ok: false, error: j.error || ('خطأ ' + r.status), status: r.status };
  } catch (e) { return { ok: false, error: 'تعذّر الاتصال' }; }
}
function repsCardHtml() {
  const R = S.reps || [];
  return '<div class="card"><h2>🛵 مندوبو التوصيل</h2><p class="m" style="margin-bottom:10px">المندوب يدخل برقم جواله وكلمة مرور تضعها له (بدون بريد إلكتروني)، ويرى الطلبات المسندة إليه فقط.</p>' +
    (R.length ? R.map(r => '<div class="bar" style="background:var(--col);padding:10px 12px;border-radius:10px;margin-bottom:6px"><div><b>' + esc(r.name) + '</b> <span class="m" dir="ltr">' + esc(r.phone || '') + '</span></div><div class="row s"><button class="s" data-rpw="' + esc(r.email) + '">🔑 كلمة مرور</button>' + (r.phone ? '<a class="btnl" target="_blank" rel="noopener" href="https://wa.me/' + (typeof waPhone === 'function' ? waPhone(r.phone) : r.phone) + '">📲 واتساب</a>' : '') + '<button class="dng s" data-rrm="' + esc(r.email) + '">إزالة</button></div></div>').join('') : '<div class="m" style="margin-bottom:8px">لا يوجد مندوبون بعد.</div>') +
    '<div class="row" style="margin-top:10px"><input id="rp_n" placeholder="اسم المندوب"><input id="rp_p" dir="ltr" inputmode="tel" placeholder="رقم الجوال"><input id="rp_w" dir="ltr" placeholder="كلمة المرور (6 أحرف+)"><button class="s" id="rp_g" type="button">🎲 توليد</button><button class="p s" id="rp_add">＋ إضافة مندوب</button></div></div>';
}
function ordSettingsHtml() {
  const s = S.ordSet || {};
  return '<div class="card"><h2>⚙ إعدادات الطلبات والفواتير</h2>' +
    '<div class="row"><label>اسم المتجر (على الفاتورة)<input id="os_n" value="' + esc(s.store_name || '') + '" placeholder="' + esc(BRAND.name) + '"></label><label>جوال المتجر<input id="os_p" dir="ltr" value="' + esc(s.store_phone || '') + '"></label></div>' +
    '<label style="margin-top:8px">عنوان المتجر<input id="os_a" value="' + esc(s.store_address || '') + '"></label>' +
    '<label class="chk" style="margin-top:12px"><input type="checkbox" id="os_c" ' + (s.staff_can_cost ? 'checked' : '') + '> يرى الموظفون سعر الشراء ويدخلونه (افتراضياً: للمدير فقط)</label>' +
    '<label style="margin-top:10px">حذف صور الأصناف بعد انتهاء الطلب<select id="os_k">' + [[0, 'فوراً عند التسليم/الإلغاء'], [1, 'بعد يوم'], [2, 'بعد يومين'], [3, 'بعد 3 أيام'], [7, 'بعد أسبوع']].map(([v, l]) => '<option value="' + v + '"' + ((s.image_keep_days == null ? 1 : s.image_keep_days) === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<div class="row" style="margin-top:10px"><button class="p s" id="os_sv">حفظ الإعدادات</button></div></div>' + viewsCardHtml() + dupCardHtml();
}
const VIEW_LIST = [['board', 'المهام والمشاريع'], ['orders', 'إدارة الطلبات'], ['dash', 'لوحة الأرقام'], ['props', 'القرارات والتصويت'], ['log', 'سجل النشاط']];
function viewsCardHtml() {
  const s = S.ordSet || {}, hid = s.hidden_views || [];
  return '<div class="card"><h2>🧩 الشاشات واسم التطبيق</h2><p class="m" style="margin-bottom:8px">أخفِ ما لا تحتاجه في هذا النشاط (يختفي من كل الأعضاء). الإعدادات تبقى دائماً.</p>' +
    VIEW_LIST.map(([k, l]) => '<label class="chk" style="margin-bottom:6px"><input type="checkbox" data-vw="' + k + '" ' + (hid.includes(k) ? '' : 'checked') + '> ' + l + '</label>').join('') +
    '<label style="margin-top:10px">اسم التطبيق (يظهر في الأعلى)<input id="vw_n" value="' + esc(s.app_name || '') + '" placeholder="مدير المهام"></label>' +
    '<div class="row" style="margin-top:10px"><button class="p s" id="vw_sv">حفظ</button></div></div>';
}
function credsDialog(name, loginId, pw, roleLabel) {
  const msg = 'مرحباً ' + name + ' 👋\nتم إعداد حسابك' + (roleLabel ? ' (' + roleLabel + ')' : '') + ' في ' + (typeof bn === 'function' ? bn() : BRAND.name) + ':\n🌐 الرابط: ' + location.origin + '\n👤 معرف الدخول: ' + loginId + (pw ? '\n🔑 كلمة المرور: ' + pw : '') + '\n\nيمكنك تفعيل الدخول السريع بالبصمة والإشعارات من ⚙ الإعدادات بعد الدخول.';
  const ph = String(loginId || '').replace(/\D/g, '');
  dlg.innerHTML = '<h2>✅ بيانات حساب ' + esc(name) + '</h2><pre class="msgp">' + esc(msg) + '</pre><p class="m" style="margin-top:8px">انسخ البيانات أو أرسلها مباشرة عبر واتساب:</p><div class="row dact"><button class="s" id="cr_cp">📋 نسخ</button>' + (ph.length >= 7 ? '<button class="p s" id="cr_wa">📲 إرسال عبر واتساب</button>' : '<button class="p s" id="cr_wa_any">📲 مشاركة واتساب</button>') + '<button class="s" id="cr_x">إغلاق</button></div>';
  $('cr_x').onclick = () => dlg.close();
  $('cr_cp').onclick = async () => { try { await navigator.clipboard.writeText(msg); $('cr_cp').textContent = 'تم النسخ ✓'; } catch (e) {} };
  if ($('cr_wa')) $('cr_wa').onclick = () => window.open('https://wa.me/' + (typeof waPhone === 'function' ? waPhone(ph) : ph) + '?text=' + encodeURIComponent(msg), '_blank');
  if ($('cr_wa_any')) $('cr_wa_any').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
  dlg.showModal();
}
function dupGroups() {
  const m = {};
  (S.tasks || []).forEach(t => { const k = [String(t.assignee_email || '').toLowerCase(), String(t.title || '').trim().toLowerCase(), t.due_on || '', t.for_all ? 'a' : ''].join('|'); (m[k] = m[k] || []).push(t); });
  return Object.values(m).filter(g => g.length > 1).map(g => g.slice().sort((a, b) => String(a.created_at) < String(b.created_at) ? -1 : 1));
}
function dupCardHtml() {
  if (!isAdmin()) return '';
  const G = dupGroups();
  return '<div class="card"><h2>🧹 فحص المهام المكررة</h2>' + (G.length ? '<p class="m" style="margin-bottom:8px">وُجدت ' + G.length + ' مجموعة مهام متشابهة (نفس العنوان والمسؤول والموعد). يُحذف الأحدث وتبقى الأقدم.</p>' +
    G.map(g => '<div class="bar pr-r"><span><b>' + esc(g[0].title) + '</b> — ' + esc(nm(g[0].assignee_email)) + ' <span class="m">(' + g.length + ' نسخ: ' + g.map(x => esc(ST[x.status] || x.status)).join(' / ') + ')</span></span><button class="dng s" data-dup="' + g.slice(1).map(x => x.id).join(',') + '">حذف المكرر</button></div>').join('') : '<p class="m">لا توجد مهام مكررة ✓</p>') + '</div>';
}
function bindDupCard() {
  document.querySelectorAll('[data-dup]').forEach(b => b.onclick = () => { const ids = b.dataset.dup.split(','); if (confirm('حذف ' + ids.length + ' نسخة مكررة؟')) run(sb.from('tasks').delete().in('id', ids)); });
}
function bindViewsCard() {
  bindDupCard();
  if (!$('vw_sv')) return;
  $('vw_sv').onclick = async () => {
    const hidden = [...document.querySelectorAll('[data-vw]')].filter(c => !c.checked).map(c => c.dataset.vw);
    if (hidden.length >= VIEW_LIST.length) return alert('أبقِ شاشة واحدة على الأقل ظاهرة');
    const orgTags = ((S.ordSet && S.ordSet.hidden_views) || []).filter(x => String(x).startsWith('__co:') || String(x).startsWith('__dep:'));
    const finalHidden = orgTags.length ? hidden.concat(orgTags) : hidden;
    const { error } = await sb.from('ord_settings').update({ hidden_views: finalHidden, app_name: $('vw_n').value.trim() || null }).eq('id', true);
    if (error) return alert('تعذّر الحفظ: ' + error.message + '\n(شغّل sql/011_titles_views.sql أولاً)');
    await load();
  };
}
function bindOrdAdmin() {
  bindViewsCard();
  $('rp_g').onclick = () => { $('rp_w').value = genPw(); };
  $('rp_add').onclick = async () => {
    const n = $('rp_n').value.trim(), p = $('rp_p').value.trim(), w = $('rp_w').value;
    if (!n || !p || w.length < 6) return alert('اكتب الاسم ورقم الجوال وكلمة مرور من 6 أحرف على الأقل');
    $('rp_add').disabled = true; const r = await repApi({ action: 'create', name: n, phone: p, password: w, role: 'rep' }); $('rp_add').disabled = false;
    if (!r.ok) return alert(r.error);
    await load(); credsDialog(n, r.j.phone || p, w, 'مندوب توصيل');
  };
  document.querySelectorAll('[data-rpw]').forEach(b => b.onclick = async () => {
    const rep = (S.reps || []).find(x => x.email === b.dataset.rpw), w = prompt('كلمة المرور الجديدة للمندوب ' + (rep ? rep.name : '') + ' (6 أحرف أو أكثر، اتركها فارغة للتوليد):', '');
    if (w === null) return; const pw = w.trim() || genPw(); if (pw.length < 6) return alert('6 أحرف على الأقل');
    const r = await repApi({ action: 'password', email: b.dataset.rpw, password: pw }); if (!r.ok) return alert(r.error);
    if (rep) credsDialog(rep.name, rep.phone || rep.email, pw, 'مندوب توصيل');
  });
  document.querySelectorAll('[data-rrm]').forEach(b => b.onclick = async () => {
    const rep = (S.reps || []).find(x => x.email === b.dataset.rrm);
    if (!confirm('إزالة المندوب ' + (rep ? rep.name : '') + ' وحذف حسابه؟ (طلباته السابقة تبقى محفوظة)')) return;
    const r = await repApi({ action: 'remove', email: b.dataset.rrm }); if (!r.ok) return alert(r.error); load();
  });
  $('os_sv').onclick = async () => {
    const { error } = await sb.from('ord_settings').update({ store_name: $('os_n').value.trim() || null, store_phone: $('os_p').value.trim() || null, store_address: $('os_a').value.trim() || null, staff_can_cost: $('os_c').checked, image_keep_days: +$('os_k').value }).eq('id', true);
    if (error) return alert('تعذّر الحفظ: ' + error.message + '\n(تأكد من تشغيل ملفات SQL: 008 و009 و010)');
    $('os_sv').textContent = 'تم ✓'; load();
  };
}
