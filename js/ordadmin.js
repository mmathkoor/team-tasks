// ===== إعدادات الطلبات للمدير: المندوبون (بالجوال) + هوية المتجر + سعر الشراء + مدة حفظ الصور =====
const genPw = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; const a = new Uint32Array(10); crypto.getRandomValues(a); a.forEach(x => { s += c[x % c.length]; }); return s; };
async function repApi(body) {
  try { const r = await apiPost('/api/rep-admin', JSON.stringify(body)); const j = await r.json().catch(() => ({})); return r.ok ? { ok: true, j } : { ok: false, error: j.error || ('خطأ ' + r.status) }; }
  catch (e) { return { ok: false, error: 'تعذّر الاتصال' }; }
}
function repsCardHtml() {
  const cos = typeof companiesList === 'function' ? companiesList() : ['متجرك'];
  const myCo = isSuperAdmin() ? '' : parseMemberMeta(S.me).company;
  if (S.repScopeCo === undefined) S.repScopeCo = activeCompanyFilter() || '';
  const repScope = myCo || S.repScopeCo || '';
  const allReps = (S.rawMembers || S.allMembers || []).filter(m => m.role === 'rep');
  const R = repScope ? allReps.filter(r => {
    const rc = parseMemberMeta(r).company;
    return same(rc, repScope) || rc === '__all';
  }) : allReps;

  const scopeSel = isSuperAdmin() ? (
    '<div class="store-scope-bar">' +
      '<span>🏢 عرض مناديب:</span>' +
      '<select id="rep_co_scope">' +
        '<option value=""' + (!repScope ? ' selected' : '') + '>🌐 كل المتاجر (' + allReps.length + ')</option>' +
        cos.map(c => '<option value="' + esc(c) + '"' + (same(repScope, c) ? ' selected' : '') + '>🏢 ' + esc(getCompanyProfile(c).displayName || c) + '</option>').join('') +
      '</select>' +
    '</div>'
  ) : '';

  const repCoOpts = curVal => (
    (myCo ? [myCo] : cos).map(c => '<option value="' + esc(c) + '"' + (same(curVal, c) ? ' selected' : '') + '>🏢 متجر: ' + esc(c) + '</option>').join('') +
    (!myCo ? '<option value="__all"' + (curVal === '__all' ? ' selected' : '') + '>🌐 كل المتاجر (مشترك)</option>' : '')
  );

  const defNewRepCo = repScope || activeCompanyFilter() || 'متجرك';

  return '<div class="card"><div class="bar" style="margin-bottom:8px"><h2 style="margin:0">🛵 مندوبو التوصيل</h2>' + scopeSel + '</div>' +
    '<p class="m" style="margin-bottom:10px">المندوب يدخل برقم جواله وكلمة مرور تضعها له (بدون بريد إلكتروني)، ويرى الطلبات المسندة إليه فقط بحسب متجره.</p>' +
    (R.length ? R.map(r => {
      const rCo = parseMemberMeta(r).company || 'متجرك';
      const coBadge = rCo === '__all' ? '<span class="chip all">🌐 كل المتاجر</span>' : '<span class="chip">🏢 ' + esc(rCo) + '</span>';
      return '<div class="bar" style="background:var(--col);padding:10px 12px;border-radius:10px;margin-bottom:8px">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b>🛵 ' + esc(r.name) + '</b> <span class="m" dir="ltr">' + esc(r.phone || '') + '</span> ' + coBadge + '</div>' +
        '<div class="row s" style="align-items:center;gap:6px">' +
          '<select data-rco="' + esc(r.email) + '" title="تغيير متجر المندوب" style="padding:6px 10px;font-size:13px">' + repCoOpts(rCo) + '</select>' +
          '<button class="s" data-rpw="' + esc(r.email) + '">🔑 كلمة مرور</button>' +
          '<button class="dng s" data-rrm="' + esc(r.email) + '">إزالة</button>' +
        '</div>' +
      '</div>';
    }).join('') : '<div class="m" style="margin-bottom:8px">لا يوجد مندوبون في هذا المتجر بعد.</div>') +
    '<h3 style="font-size:14px;margin-top:14px">إضافة مندوب توصيل جديد:</h3>' +
    '<div class="row" style="margin-top:8px;gap:6px">' +
      '<input id="rp_n" placeholder="اسم المندوب" style="flex:1 1 130px">' +
      '<input id="rp_p" dir="ltr" inputmode="tel" placeholder="رقم الجوال" style="flex:1 1 120px">' +
      '<select id="rp_co" title="المتجر التابع له المندوب" style="flex:1 1 140px">' + repCoOpts(defNewRepCo) + '</select>' +
      '<input id="rp_w" dir="ltr" placeholder="كلمة المرور (6 أحرف+)" style="flex:1 1 140px">' +
      '<button class="s" id="rp_g" type="button">توليد</button>' +
      '<button class="p s" id="rp_add">إضافة مندوب</button>' +
    '</div></div>';
}

function ordSettingsHtml() {
  const cos = typeof companiesList === 'function' ? companiesList() : ['متجرك'];
  const myCo = isSuperAdmin() ? '' : parseMemberMeta(S.me).company;
  const targetCo = myCo || S.ordCfgCo || activeCompanyFilter() || 'متجرك';
  const p = getCompanyProfile(targetCo);

  const coSelector = isSuperAdmin() ? (
    '<div class="store-scope-bar">' +
      '<span>🏢 المتجر المراد ضبط إعداداته:</span>' +
      '<select id="os_co">' +
        cos.map(c => '<option value="' + esc(c) + '"' + (same(targetCo, c) ? ' selected' : '') + '>🏢 ' + esc(getCompanyProfile(c).displayName || c) + ' (' + esc(c) + ')</option>').join('') +
      '</select>' +
      '<button type="button" class="s" id="os_brand_btn" title="الشعار والألوان والهوية الكاملة">🎨 الشعار والهوية</button>' +
    '</div>'
  ) : '<span class="co-tag">🏢 متجر: ' + esc(p.displayName || targetCo) + '</span>';

  return '<div class="card">' +
    '<div class="bar" style="margin-bottom:12px"><h2 style="margin:0">⚙ إعدادات الطلبات والفواتير (لكل متجر)</h2>' + coSelector + '</div>' +
    '<div class="row">' +
      '<label>اسم المتجر (على الفاتورة)<input id="os_n" value="' + esc(p.displayName || '') + '" placeholder="' + esc(targetCo) + '"></label>' +
      '<label>جوال المتجر (للتواصل على الفاتورة)<input id="os_p" dir="ltr" value="' + esc(p.phone || '') + '" placeholder="77xxxxxxx"></label>' +
    '</div>' +
    '<div class="row" style="margin-top:8px">' +
      '<label style="flex:2 1 200px">عنوان المتجر / الفرع<input id="os_a" value="' + esc(p.address || '') + '" placeholder="مثال: صنعاء - شارع حدة"></label>' +
      '<label style="flex:1 1 110px">العملة المعتمدة<input id="os_curr" value="' + esc(p.currency || 'ر.ي') + '" placeholder="ر.ي / ر.س / $"></label>' +
    '</div>' +
    '<label style="margin-top:8px">عبارة تذييل الفاتورة ورسائل الواتساب<input id="os_foot" value="' + esc(p.footer || 'شكراً لتعاملكم معنا 🌹') + '"></label>' +
    '<label class="chk" style="margin-top:12px"><input type="checkbox" id="os_c" ' + (p.staffCanCost ? 'checked' : '') + '> يرى موظفو متجر «' + esc(p.displayName || targetCo) + '» سعر الشراء ويدخلونه (افتراضياً: للمدير فقط)</label>' +
    '<label style="margin-top:10px">حذف صور الأصناف بعد انتهاء الطلب<select id="os_k">' + [[0, 'فوراً عند التسليم/الإلغاء'], [1, 'بعد يوم'], [2, 'بعد يومين'], [3, 'بعد 3 أيام'], [7, 'بعد أسبوع']].map(([v, l]) => '<option value="' + v + '"' + ((p.imageKeepDays == null ? 1 : +p.imageKeepDays) === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<div class="row" style="margin-top:12px"><button class="p s" id="os_sv">💾 حفظ إعدادات متجر «' + esc(p.displayName || targetCo) + '»</button></div></div>' + viewsCardHtml() + dupCardHtml();
}
const VIEW_LIST = [['board', 'المهام والمشاريع'], ['orders', 'إدارة الطلبات'], ['erp', 'الحسابات والعهد والمصروفات'], ['dash', 'لوحة الأرقام'], ['props', 'القرارات والتصويت'], ['log', 'سجل النشاط']];
function viewsCardHtml() {
  const s = S.ordSet || {}, hid = (s.hidden_views || []).filter(x => !String(x).startsWith('__'));
  return '<div class="card"><h2>🧩 الشاشات واسم التطبيق العام</h2><p class="m" style="margin-bottom:8px">أخفِ ما لا تحتاجه في هذا النشاط (يختفي من كل الأعضاء). الإعدادات تبقى دائماً.</p>' +
    VIEW_LIST.map(([k, l]) => '<label class="chk" style="margin-bottom:6px"><input type="checkbox" data-vw="' + k + '" ' + (hid.includes(k) ? '' : 'checked') + '> ' + l + '</label>').join('') +
    '<label style="margin-top:10px">اسم التطبيق العام (يظهر عند عرض كل الشركات)<input id="vw_n" value="' + esc(s.app_name || '') + '" placeholder="مدير المهام"></label>' +
    '<div class="row" style="margin-top:10px"><button class="p s" id="vw_sv">حفظ</button></div></div>';
}
function credsDialog(name, phone, pw, coName) {
  const storeTitle = coName && coName !== '__all' ? getCompanyProfile(coName).displayName : (typeof bn === 'function' ? bn() : BRAND.name);
  const localPh = String(phone || '').startsWith('967') ? String(phone).slice(3) : phone;
  const msg = 'مرحباً كابتن ' + name + ' 👋\nحسابك كمندوب توصيل في *' + storeTitle + '*:\n🌐 الرابط: ' + location.origin + '\n📱 رقم الجوال للدخول: ' + localPh + '\n🔑 كلمة المرور: ' + pw + '\n\n(يمكنك الدخول بكتابة رقم جوالك ' + localPh + ' أو ' + phone + ' مع كلمة المرور، وبعد الدخول فعّل الإشعارات من ⚙ الإعدادات).';
  dlg.innerHTML = '<h2>✅ بيانات دخول المندوب جاهزة</h2><pre class="msgp">' + esc(msg) + '</pre><p class="m">احفظ كلمة المرور أو أرسلها للمندوب الآن.</p><div class="row dact"><button class="s" id="cr_cp">📋 نسخ البيانات</button><button class="p s" id="cr_wa">📲 إرسال للمندوب واتساب</button><button class="s" id="cr_x">إغلاق</button></div>';
  $('cr_x').onclick = () => dlg.close();
  $('cr_cp').onclick = async () => { try { await navigator.clipboard.writeText(msg); $('cr_cp').textContent = 'تم النسخ ✓'; } catch (e) {} };
  $('cr_wa').onclick = () => window.open('https://wa.me/' + (typeof waPhone === 'function' ? waPhone(phone) : phone) + '?text=' + encodeURIComponent(msg), '_blank');
  dlg.showModal();
}
function dupGroups() {
  const m = {};
  (S.tasks || []).forEach(t => { const k = [String(taskCompany(t)).toLowerCase(), String(t.assignee_email || '').toLowerCase(), String(t.title || '').trim().toLowerCase(), t.due_on || '', t.for_all ? 'a' : ''].join('|'); (m[k] = m[k] || []).push(t); });
  return Object.values(m).filter(g => g.length > 1).map(g => g.slice().sort((a, b) => String(a.created_at) < String(b.created_at) ? -1 : 1));
}
function dupCardHtml() {
  if (!isAdmin()) return '';
  const G = dupGroups();
  return '<div class="card"><h2>🧹 فحص المهام المكررة</h2>' + (G.length ? '<p class="m" style="margin-bottom:8px">وُجدت ' + G.length + ' مجموعة مهام متشابهة (نفس العنوان والمسؤول والموعد). يُحذف الأحدث وتبقى الأقدم.</p>' +
    G.map(g => '<div class="bar pr-r"><span><b>' + esc(g[0].title) + '</b> <span class="chip" style="font-size:11px">🏢 ' + esc(taskCompany(g[0])) + '</span> — ' + esc(nm(g[0].assignee_email)) + ' <span class="m">(' + g.length + ' نسخ: ' + g.map(x => esc(ST[x.status] || x.status)).join(' / ') + ')</span></span><button class="dng s" data-dup="' + g.slice(1).map(x => x.id).join(',') + '">حذف المكرر</button></div>').join('') : '<p class="m">لا توجد مهام مكررة ✓</p>') + '</div>';
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
    const orgTags = ((S.ordSet && S.ordSet.hidden_views) || []).filter(x => String(x).startsWith('__'));
    const finalHidden = orgTags.length ? hidden.concat(orgTags) : hidden;
    const { error } = await sb.from('ord_settings').update({ hidden_views: finalHidden, app_name: $('vw_n').value.trim() || null }).eq('id', true);
    if (error) return alert('تعذّر الحفظ: ' + error.message + '\n(شغّل sql/011_titles_views.sql أولاً)');
    await load();
  };
}
function bindOrdAdmin() {
  bindViewsCard();
  if ($('rep_co_scope')) {
    $('rep_co_scope').onchange = e => {
      S.repScopeCo = e.target.value;
      render();
    };
  }
  if ($('os_co')) {
    $('os_co').onchange = e => {
      S.ordCfgCo = e.target.value;
      render();
    };
  }
  if ($('os_brand_btn')) {
    $('os_brand_btn').onclick = () => {
      const targetCo = ($('os_co') && $('os_co').value) || S.ordCfgCo || activeCompanyFilter() || 'متجرك';
      if (typeof companyConfigDialog === 'function') companyConfigDialog(targetCo);
    };
  }
  $('rp_g').onclick = () => { $('rp_w').value = genPw(); };
  $('rp_add').onclick = async () => {
    const n = $('rp_n').value.trim(), p = $('rp_p').value.trim(), w = $('rp_w').value.trim();
    const co = ($('rp_co') && $('rp_co').value) || activeCompanyFilter() || 'متجرك';
    if (!n || !p || w.length < 6) return alert('اكتب الاسم ورقم الجوال وكلمة مرور من 6 أحرف على الأقل');
    $('rp_add').disabled = true; const r = await repApi({ action: 'create', name: n, phone: p, password: w, company: co }); $('rp_add').disabled = false;
    if (!r.ok) return alert(r.error);
    await load(); credsDialog(n, r.j.phone, w, co);
  };
  document.querySelectorAll('[data-rco]').forEach(sel => sel.onchange = async () => {
    const em = sel.dataset.rco, newCo = sel.value;
    sel.disabled = true;
    const r = await repApi({ action: 'set_company', email: em, company: newCo });
    sel.disabled = false;
    if (!r.ok) {
      await sb.from('members').update({ telegram_chat_id: encodeMemberMeta(newCo, '') }).eq('email', em);
    }
    await load();
  });
  document.querySelectorAll('[data-rpw]').forEach(b => b.onclick = async () => {
    const allReps = (S.rawMembers || S.allMembers || S.reps || []).filter(m => m.role === 'rep');
    const rep = allReps.find(x => x.email === b.dataset.rpw), w = prompt('كلمة المرور الجديدة للمندوب ' + (rep ? rep.name : '') + ' (6 أحرف أو أكثر، اتركها فارغة للتوليد):', '');
    if (w === null) return; const pw = w.trim() || genPw(); if (pw.length < 6) return alert('6 أحرف على الأقل');
    const r = await repApi({ action: 'password', email: b.dataset.rpw, password: pw }); if (!r.ok) return alert(r.error);
    if (rep) credsDialog(rep.name, rep.phone, pw, parseMemberMeta(rep).company);
  });
  document.querySelectorAll('[data-rrm]').forEach(b => b.onclick = async () => {
    const allReps = (S.rawMembers || S.allMembers || S.reps || []).filter(m => m.role === 'rep');
    const rep = allReps.find(x => x.email === b.dataset.rrm);
    if (!confirm('إزالة المندوب ' + (rep ? rep.name : '') + ' وحذف حسابه؟ (طلباته السابقة تبقى محفوظة)')) return;
    const r = await repApi({ action: 'remove', email: b.dataset.rrm }); if (!r.ok) return alert(r.error); load();
  });
  $('os_sv').onclick = async () => {
    const myCo = isSuperAdmin() ? '' : parseMemberMeta(S.me).company;
    const targetCo = myCo || ($('os_co') && $('os_co').value) || S.ordCfgCo || activeCompanyFilter() || 'متجرك';
    $('os_sv').disabled = true; $('os_sv').textContent = 'جارٍ الحفظ...';
    await saveCompanyProfile(targetCo, {
      displayName: $('os_n').value.trim() || targetCo,
      phone: $('os_p').value.trim(),
      address: $('os_a').value.trim(),
      currency: ($('os_curr') && $('os_curr').value.trim()) || 'ر.ي',
      footer: ($('os_foot') && $('os_foot').value.trim()) || 'شكراً لتعاملكم معنا 🌹',
      staffCanCost: $('os_c').checked,
      imageKeepDays: +$('os_k').value
    });
    if (!same(targetCo, 'متجرك') && S.ordSet) {
      // أيضاً تحديث image_keep_days العام إن لزم
      await sb.from('ord_settings').update({ image_keep_days: +$('os_k').value }).eq('id', true);
    }
    $('os_sv').disabled = false; $('os_sv').textContent = 'تم الحفظ ✓';
    await load();
  };
}
