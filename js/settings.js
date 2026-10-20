/* ---------- الإعدادات ---------- */
async function autoEnablePush() {
    if (!S.me || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        // طلب الصلاحية تلقائياً إذا لم تكن ممنوحة
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return;

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        
        const key = Uint8Array.from(atob(VAPID_PUBLIC.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
        
        // إذا لم يكن هناك اشتراك، قم بإنشائه بصمت
        if (!sub) {
            sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        }
        
        // تحديث قاعدة البيانات بصمت لضمان وصول الإشعارات دائماً
        await sb.from('push_subs').upsert({ endpoint: sub.endpoint, email: S.me.email, sub: sub.toJSON() });
    } catch (e) { console.log('Auto push error:', e); }
}
  
function orgSettingsHtml() {
  if (!isAdmin()) return '';
  const cos = companiesList(), deps = departmentsList();
  const allM = S.rawMembers || S.allMembers || S.members || [];
  const canAll = isSuperAdmin();
  const curCo = activeCompanyFilter();
  const allTasks = S.rawTasks || S.tasks || [];
  const allOrders = S.rawOrders || S.orders || [];

  const coCards = cos.map(c => {
    const p = getCompanyProfile(c);
    const empCnt = allM.filter(m => m.role !== 'rep' && m.role !== 'admin' && same(parseMemberMeta(m).company, c)).length;
    const tskCnt = allTasks.filter(t => same(taskCompany(t), c)).length;
    const ordCnt = allOrders.filter(o => same(orderCompany(o), c)).length;
    const isAct = same(curCo, c);
    return '<div class="co-profile-card' + (isAct ? ' on' : '') + '">' +
      '<div class="co-pc-head">' +
        '<div class="co-pc-brand" data-cosw="' + esc(c) + '" title="اضغط للتبديل ومعاينة بيانات هذه الشركة">' +
          companyLogoHtml(c, 48) +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b style="font-size:15px">' + esc(p.displayName || c) + '</b>' + (same(c, 'متجرك') ? '<span class="chip ok" style="font-size:11px">الافتراضية</span>' : '') + (isAct ? '<span class="chip all" style="font-size:11px">المعروضة الآن ✓</span>' : '') + '</div>' +
            '<div class="m" style="font-size:12px">' + esc(p.slogan || p.appTitle || ('معرّف الشركة: ' + c)) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="row s">' +
          '<button class="s p" data-coedit="' + esc(c) + '" type="button" title="تهيئة الشعار والاسم والهوية والفاتورة">🎨 تهيئة الهوية والشعار</button>' +
          (!same(c, 'متجرك') ? '<button class="s dng" data-corm="' + esc(c) + '" type="button" title="حذف الشركة">✕</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="co-pc-stats">' +
        '<span>👥 <b>' + empCnt + '</b> موظف</span>' +
        '<span>📋 <b>' + tskCnt + '</b> مهمة</span>' +
        '<span>🛒 <b>' + ordCnt + '</b> طلب</span>' +
        '<span>💰 العملة: <b>' + esc(p.currency || 'ر.ي') + '</b></span>' +
        (p.phone ? '<span dir="ltr">📞 ' + esc(p.phone) + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  return '<div class="card org-card"><h2>🏢 إدارة الشركات والهوية المؤسسية (الشعار، الاسم، الفواتير، والأقسام)</h2>' +
    '<p class="m" style="margin-bottom:12px">خصّص لكل شركة شعارها الرسمي، اسمها التجاري، عنوانها، عملتها، وترويسة فواتيرها بشكل مستقل تماماً. <b>أنت فقط (المدير العام)</b> تملك صلاحية رؤية جميع الشركات، بينما يلتزم كل موظف بشركته المحددة فقط.</p>' +
    (canAll ? '<div class="org-sec">' +
      '<div class="bar" style="margin-bottom:10px;flex-wrap:wrap;gap:8px">' +
        '<b>🏢 الشركات والفروع المسجلة (' + cos.length + ')</b>' +
        '<div class="row s">' +
          (curCo ? '<span class="co-tag">المعروض حالياً: ' + esc(curCo) + ' <button class="s" id="co_reset" style="padding:2px 8px;font-size:12px">🌐 عرض كل الشركات</button></span>' : '<span class="chip all">👑 وضع المدير العام: ترى كل الشركات</span>') +
        '</div>' +
      '</div>' +
      '<div class="co-cards-grid">' + coCards + '</div>' +
      '<div class="row" style="margin-top:12px"><input id="co_in" placeholder="اسم شركة جديدة (مثال: شركة الأفق للتجارة)"><button class="p s" id="co_add" type="button">＋ إضافة شركة جديدة وتخصيصها</button></div>' +
      '</div><hr style="border:0;border-top:1px solid var(--line);margin:16px 0">' : '') +
    '<div class="org-sec"><div class="bar" style="margin-bottom:8px"><b>🏛️ الإدارات والأقسام (' + deps.length + ')</b>' +
      (!deps.length ? '<button class="s" id="dep_seed" type="button" style="font-size:12px">⚡ إضافة أقسام افتراضية</button>' : '') + '</div>' +
      (deps.length ? '<div class="org-tags">' + deps.map(d => {
        const cnt = (S.members || []).filter(m => same(parseMemberMeta(m).department, d)).length;
        return '<div class="org-tag"><span>🏛️ <b>' + esc(d) + '</b> <small>(' + cnt + ' موظف)</small></span><button class="s dng" data-deprm="' + esc(d) + '" title="حذف القسم">✕</button></div>';
      }).join('') + '</div>' : '<div class="m" style="margin-bottom:8px">لم تُضف إدارات/أقسام بعد. أضف أقسامك لتتمكن من إسناد المهام لقسم كامل.</div>') +
      '<div class="row" style="margin-top:8px"><input id="dep_in" placeholder="اسم الإدارة أو القسم (مثال: إدارة المبيعات، قسم التسويق، المحاسبة)"><button class="p s" id="dep_add" type="button">＋ إضافة إدارة / قسم</button></div></div></div>';
}

function companyConfigDialog(coName) {
  const p = getCompanyProfile(coName);
  let currentLogo = p.logo || '';
  const renderPreviewLogo = () => {
    if (currentLogo) return '<img src="' + esc(currentLogo) + '" style="width:68px;height:68px;object-fit:cover;border-radius:14px;border:2px solid ' + esc($('cp_accent') ? $('cp_accent').value : p.accent) + ';background:#fff">';
    const bg = $('cp_color') ? $('cp_color').value : p.color;
    const ac = $('cp_accent') ? $('cp_accent').value : p.accent;
    return '<svg width="68" height="68" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="' + esc(bg) + '"/><circle cx="32" cy="32" r="21" fill="none" stroke="' + esc(ac) + '" stroke-width="3.5"/><path d="M21 33l8 8 15-17" fill="none" stroke="#f3d78a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  };

  dlg.innerHTML = '<h2>🎨 التهيئة الاحترافية لشركة «' + esc(coName) + '»</h2>' +
    '<p class="m" style="margin-bottom:12px">تُطبّق هذه الإعدادات تلقائياً على شريط المنصة العلوي، الفواتير المطبوعة، ورسائل الواتساب الخاصة بهذه الشركة.</p>' +
    '<div class="co-cfg-logo-box">' +
      '<div id="cp_logo_prev">' + renderPreviewLogo() + '</div>' +
      '<div style="flex:1">' +
        '<b>شعار الشركة الرسمي (Logo)</b>' +
        '<div class="m" style="font-size:12px;margin:2px 0 8px">يظهر في أعلى المنصة وفي ترويسة الفواتير وملفات PDF.</div>' +
        '<div class="row s">' +
          '<label class="imgbtn" style="border-style:solid;color:var(--ink)">📷 رفع شعار من جهازك<input id="cp_logo_file" type="file" accept="image/*" hidden></label>' +
          (currentLogo ? '<button type="button" class="s dng" id="cp_logo_rm">حذف الشعار</button>' : '<button type="button" class="s dng" id="cp_logo_rm" style="display:none">حذف الشعار</button>') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="row" style="margin-top:12px">' +
      '<label>الاسم التجاري للشركة (على الفواتير والواجهة)<input id="cp_name" value="' + esc(p.displayName) + '" placeholder="مثال: متجرك للتجارة والتسوق"></label>' +
      '<label>عنوان المنصة في الأعلى<input id="cp_title" value="' + esc(p.appTitle) + '" placeholder="مثال: منصة متجرك"></label>' +
    '</div>' +
    '<div class="row" style="margin-top:10px">' +
      '<label>الوصف المختصر / الشعار اللفظي (Slogan)<input id="cp_slogan" value="' + esc(p.slogan) + '" placeholder="مثال: الجودة والسرعة في خدمتكم"></label>' +
      '<label>العملة المعتمدة<input id="cp_curr" value="' + esc(p.currency) + '" placeholder="ر.ي / ر.س / $"></label>' +
    '</div>' +
    '<div class="row" style="margin-top:10px">' +
      '<label>رقم التواصل / خدمة العملاء (يظهر في الفاتورة)<input id="cp_phone" dir="ltr" value="' + esc(p.phone) + '" placeholder="77xxxxxxx"></label>' +
      '<label>الرقم الضريبي / السجل التجاري (اختياري)<input id="cp_tax" dir="ltr" value="' + esc(p.taxNo) + '" placeholder="اختياري"></label>' +
    '</div>' +
    '<label style="margin-top:10px">العنوان التفصيلي للشركة / الفرع<input id="cp_addr" value="' + esc(p.address) + '" placeholder="مثال: صنعاء - شارع حدة"></label>' +
    '<label style="margin-top:10px">عبارة تذييل الفاتورة ورسائل العملاء<input id="cp_foot" value="' + esc(p.footer) + '" placeholder="شكراً لتعاملكم معنا 🌹"></label>' +
    '<div class="row" style="margin-top:10px">' +
      '<label>اللون الأساسي للهوية<input id="cp_color" type="color" value="' + esc(p.color || '#0b1426') + '" style="height:40px;padding:4px"></label>' +
      '<label>اللون الذهبي / المميز<input id="cp_accent" type="color" value="' + esc(p.accent || '#d4af6a') + '" style="height:40px;padding:4px"></label>' +
    '</div>' +
    '<div class="row dact" style="margin-top:16px">' +
      '<button class="s" id="cp_cx" type="button">إلغاء</button>' +
      '<button class="p" id="cp_sv" type="button">💾 حفظ هوية الشركة</button>' +
    '</div>';

  const refreshPrev = () => { if ($('cp_logo_prev')) $('cp_logo_prev').innerHTML = renderPreviewLogo(); };
  $('cp_color').oninput = refreshPrev;
  $('cp_accent').oninput = refreshPrev;
  $('cp_logo_file').onchange = async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      currentLogo = await compressLogoDataUrl(f, 180);
      refreshPrev();
      if ($('cp_logo_rm')) $('cp_logo_rm').style.display = '';
    } catch (err) { alert(err.message); }
  };
  $('cp_logo_rm').onclick = () => {
    currentLogo = '';
    refreshPrev();
    $('cp_logo_rm').style.display = 'none';
  };
  $('cp_cx').onclick = () => dlg.close();
  $('cp_sv').onclick = async () => {
    $('cp_sv').disabled = true; $('cp_sv').textContent = 'جارٍ الحفظ...';
    await saveCompanyProfile(coName, {
      displayName: $('cp_name').value.trim() || coName,
      appTitle: $('cp_title').value.trim() || ('منصة ' + coName),
      slogan: $('cp_slogan').value.trim(),
      currency: $('cp_curr').value.trim() || 'ر.ي',
      phone: $('cp_phone').value.trim(),
      taxNo: $('cp_tax').value.trim(),
      address: $('cp_addr').value.trim(),
      footer: $('cp_foot').value.trim() || 'شكراً لتعاملكم معنا 🌹',
      color: $('cp_color').value,
      accent: $('cp_accent').value,
      logo: currentLogo
    });
    dlg.close();
    await load();
  };
  dlg.showModal();
}

function vercelGuideHtml() {
  if (!isAdmin()) return '';
  return '<div class="card"><h2>🔑 كيف تجلب متغيرات البيئة من Vercel و Supabase؟</h2>' +
    '<p class="m" style="margin-bottom:8px;line-height:1.7">إذا أردت نسخ متغيرات البيئة الخاصة بك من حسابك في <b>Vercel</b> أو <b>Supabase</b>:</p>' +
    '<div class="obox m" style="line-height:1.85;margin-top:6px">' +
    '<div><b>1) من لوحة تحكم Vercel:</b> ادخل إلى <code dir="ltr">vercel.com/dashboard</code> ← اختر مشروعك ← اضغط تبويب <b>Settings</b> في الأعلى ← من القائمة الجانبية اختر <b>Environment Variables</b> ← اضغط أيقونة العين 👁 بجانب كل متغير (<code dir="ltr">SUPABASE_URL</code>, <code dir="ltr">SUPABASE_ANON_KEY</code>, <code dir="ltr">SUPABASE_SERVICE_ROLE_KEY</code>, <code dir="ltr">VAPID_PUBLIC_KEY</code>, <code dir="ltr">VAPID_PRIVATE_KEY</code>) لنسخ قيمته.</div>' +
    '<div style="margin-top:6px"><b>2) أو مباشرة من Supabase:</b> ادخل إلى <code dir="ltr">supabase.com/dashboard</code> ← اختر مشروعك ← <b>Project Settings (⚙️)</b> ← <b>API</b> ← ستجد <code dir="ltr">Project URL</code> و <code dir="ltr">anon public</code> و <code dir="ltr">service_role secret</code>.</div>' +
    '</div></div>';
}

function settingsView() {
  let adminHtml = '';
  if (isAdmin()) {
    const cos = companiesList(), deps = departmentsList();
    const myCo = isSuperAdmin() ? '' : parseMemberMeta(S.me).company;
    if (S.setAdmCo === undefined) S.setAdmCo = activeCompanyFilter() || '';
    const admCo = myCo || S.setAdmCo || '';
    const allStaff = (S.rawMembers || S.allMembers || S.members || []).filter(m => m.role !== 'rep');
    const listMembers = admCo ? allStaff.filter(m => same(parseMemberMeta(m).company, admCo) || (S.me && same(m.email, S.me.email))) : allStaff;

    let memList = listMembers.map(m => {
        const meta = parseMemberMeta(m);
        const isMeSuper = S.me && same(m.email, S.me.email) && m.role === 'admin';
        let rmBtn = (S.me && same(m.email, S.me.email)) ? '' : '<button class="dng s" data-rm="' + esc(m.email) + '">إزالة</button>';
        // المدير العام فقط يظهر له خيار «كل الشركات»، أما أي موظف فيلتزم بشركة محددة (افتراضياً: متجرك)
        const allowedCos = myCo ? [myCo] : (isMeSuper ? [''].concat(cos) : cos);
        const selectedCo = isMeSuper ? (String(m.company || (m.telegram_chat_id && m.telegram_chat_id.startsWith('{') ? (JSON.parse(m.telegram_chat_id).co || '') : '') || '').trim()) : (meta.company || 'متجرك');
        const coOpts = allowedCos.map(c => '<option value="' + esc(c) + '"' + (same(selectedCo, c) ? ' selected' : '') + '>' + (c ? '🏢 ' + esc(c) : '👑 كل الشركات (المدير العام فقط)') + '</option>').join('');
        const depSet = new Set(deps); if (meta.department) depSet.add(meta.department);
        const depOpts = '<option value="">-- بدون إدارة/قسم --</option>' + [...depSet].map(d => '<option value="' + esc(d) + '"' + (same(meta.department, d) ? ' selected' : '') + '>🏛️ ' + esc(d) + '</option>').join('');
        return '<div class="bar mem-row" style="background:var(--col);padding:10px 12px;border-radius:10px;margin-bottom:8px"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b>' + esc(m.name) + '</b> <span class="m" dir="ltr">(' + esc(m.email) + ')</span> <span class="chip' + (m.role === 'rep' ? ' pr-chip important' : m.role === 'admin' ? ' all' : '') + '">' + ({ admin: 'مدير', rep: '🛵 مندوب', member: 'عضو' }[m.role] || 'عضو') + '</span>' +
          (selectedCo ? '<span class="chip">🏢 ' + esc(selectedCo) + '</span>' : '<span class="chip all">🌐 كل الشركات</span>') +
          (meta.department ? '<span class="chip">🏛️ ' + esc(meta.department) + '</span>' : '') +
          (meta.phone ? '<span class="chip ok" dir="ltr">📱 ' + esc(meta.phone) + '</span>' : '') +
          '<button class="s" type="button" data-mwa="' + esc(m.email) + '" style="font-size:11.5px;padding:3px 8px" title="إرسال تذكير واتساب بمهام الموظف">📲 تذكير واتساب</button>' +
          '</div><div class="row" style="flex:1 1 100%;margin-top:8px;gap:6px">' +
          '<input data-mt="' + esc(m.email) + '" value="' + esc(m.title || '') + '" placeholder="المسمى الوظيفي (مثال: مسؤول التسويق)" style="flex:2 1 140px">' +
          '<input data-mph="' + esc(m.email) + '" dir="ltr" inputmode="tel" value="' + esc(meta.phone || '') + '" placeholder="📱 واتساب الموظف (77...)" style="flex:1 1 130px">' +
          '<select data-mco="' + esc(m.email) + '" title="الشركة" style="flex:1 1 125px">' + coOpts + '</select>' +
          '<select data-mdep="' + esc(m.email) + '" title="الإدارة / القسم" style="flex:1 1 125px">' + depOpts + '</select>' +
          '<select data-mrole="' + esc(m.email) + '" title="الصلاحية" style="flex:0 1 100px"><option value="member"' + (m.role !== 'admin' ? ' selected' : '') + '>👤 عضو</option><option value="admin"' + (m.role === 'admin' ? ' selected' : '') + '>👑 مدير</option></select>' +
          '<button class="s p" data-mts="' + esc(m.email) + '">حفظ</button>' + rmBtn + '</div></div>';
    }).join('');
    
    const optCos = !myCo ? cos.map(c => {
      const cnt = allStaff.filter(m => same(parseMemberMeta(m).company, c)).length;
      return '<option value="__co:' + esc(c) + '">🏢 كل موظفي متجر: ' + esc(c) + ' (' + cnt + ')</option>';
    }).join('') : '';
    const optDeps = deps.map(d => '<option value="__dep:' + esc(d) + '">🏛️ قسم: ' + esc(d) + (admCo ? ' (' + esc(admCo) + ')' : '') + '</option>').join('');
    const optMembers = listMembers.map(m => {
      const meta = parseMemberMeta(m);
      const tags = [meta.company ? '🏢 ' + meta.company : '', meta.department ? '🏛️ ' + meta.department : ''].filter(Boolean).join(' · ');
      return '<option value="' + esc(m.email) + '">👤 ' + esc(m.name) + (tags ? ' (' + esc(tags) + ')' : '') + '</option>';
    }).join('');
    const allLabel = admCo ? ('👥 كل موظفي «' + admCo + '» (' + listMembers.length + ')') : ('🌐 الكل (جميع المتاجر والأعضاء: ' + allStaff.length + ')');
    const remindLabel = admCo ? ('إرسال تذكير شامل لموظفي «' + admCo + '» 🔔') : 'إرسال تذكير شامل لجميع المتاجر 🔔';

    const defNewCo = admCo || activeCompanyFilter() || 'متجرك';
    const newCoOpts = (myCo ? [myCo] : cos).map(c => '<option value="' + esc(c) + '"' + (same(defNewCo, c) ? ' selected' : '') + '>🏢 ' + esc(c) + '</option>').join('');
    const newDepOpts = '<option value="">-- الإدارة / القسم (اختياري) --</option>' + deps.map(d => '<option value="' + esc(d) + '">🏛️ ' + esc(d) + '</option>').join('');

    const scopeBar = isSuperAdmin() ? (
      '<div class="store-scope-bar">' +
        '<span>🏢 تخصيص المتجر للتنبيهات والأعضاء:</span>' +
        '<select id="adm_co_scope">' +
          '<option value=""' + (!admCo ? ' selected' : '') + '>🌐 جميع المتاجر والشركات (' + cos.length + ')</option>' +
          cos.map(c => '<option value="' + esc(c) + '"' + (same(admCo, c) ? ' selected' : '') + '>🏢 متجر: ' + esc(getCompanyProfile(c).displayName || c) + '</option>').join('') +
        '</select>' +
      '</div>'
    ) : '';

    adminHtml = orgSettingsHtml() +
      '<div class="card" style="border-color:var(--accsoft)">' +
      '<div class="bar" style="margin-bottom:12px"><h2 style="margin:0">👑 إدارة الأعضاء والتنبيهات والصلاحيات</h2>' + scopeBar + '</div>' +
      '<div class="row" style="margin-bottom:14px;gap:8px">' +
        '<button class="p" id="admin_remind" style="flex:1 1 220px;background:var(--soon);border-color:var(--soon);color:#fff">' + esc(remindLabel) + '</button>' +
        '<button class="p" id="admin_wa_batch" type="button" style="flex:1 1 220px;background:#15803d;border-color:#15803d;color:#fff">📲 تذكير الموظفين بالمهام المتأخرة (واتساب)</button>' +
      '</div>' +
      '<h3 style="font-size:14px;margin-top:16px;color:var(--acc)">إرسال إشعار مخصص لموظف أو متجر أو إدارة:</h3>' +
      '<div class="row" style="margin-bottom:8px"><select id="ping_to"><option value="__all">' + esc(allLabel) + '</option>' + optCos + optDeps + optMembers + '</select></div>' +
      '<div class="row" style="margin-bottom:8px"><input id="ping_msg" placeholder="اكتب رسالة التنبيه (اختياري)..."></div>' +
      '<div class="row" style="margin-bottom:16px;justify-content:flex-start;gap:8px;"><input type="checkbox" id="ping_tasks" style="width:auto;margin:0" checked> <label for="ping_tasks" style="font-size:13px;cursor:pointer">تضمين تذكير بالمهام غير المنجزة (لكل شخص مهامه في متجره)</label></div>' +
      '<div class="row" style="margin-bottom:16px"><button class="p s" id="send_ping">إرسال الإشعار الآن 🔔</button></div>' +
      '<hr style="border:0;border-top:1px solid var(--line);margin:16px 0">' +
      '<div class="bar" style="margin-bottom:8px"><b>👥 قائمة الأعضاء والموظفين (' + listMembers.length + (admCo ? ' في ' + esc(admCo) : '') + ')</b></div>' +
      memList + 
      '<h3 style="font-size:14px;margin-top:16px">إضافة عضو / موظف جديد وتحديد متجره وإدارته ورقم واتساب:</h3>' +
      '<div class="row" style="gap:6px"><input id="nn" placeholder="اسم الموظف" style="flex:1 1 140px"><input id="ne" dir="ltr" placeholder="البريد الإلكتروني" style="flex:1 1 170px"><input id="nph" dir="ltr" inputmode="tel" placeholder="📱 رقم واتساب (اختياري)" style="flex:1 1 130px"><input id="ntitle" placeholder="المسمى الوظيفي (اختياري)" style="flex:1 1 140px"></div>' +
      '<div class="row" style="margin-top:8px;gap:6px"><select id="nco" style="flex:1 1 140px">' + newCoOpts + '</select><select id="ndep" style="flex:1 1 140px">' + newDepOpts + '</select><select id="nr" style="flex:0 1 130px"><option value="member">👤 صلاحية: عضو</option><option value="admin">👑 صلاحية: مدير</option></select><button class="p s" id="addm">إضافة</button></div></div>';
  }

  return '<div class="card" style="border-color:var(--oksoft)">' +
    '<h2>🔔 إعدادات الإشعارات</h2>' +
    '<p class="m" style="margin-bottom:10px;font-size:13px">الإشعارات تعمل تلقائياً في الخلفية. يمكنك اختبارها من هنا:</p>' +
    '<div class="row"><button class="s" id="test_push" style="background:var(--soon);border-color:var(--soon);color:#fff">تجربة وصول الإشعار في جوالي 🔔</button></div>' +
  '</div>' +
  '<div class="card"><h2>تغيير كلمة المرور</h2><div class="row"><input id="np" type="password" dir="ltr" placeholder="6 أحرف على الأقل"><button class="s" id="svp">حفظ التغيير</button></div></div>' +
  alertSettingsHtml() + adminHtml + (isAdmin() ? repsCardHtml() + ordSettingsHtml() + vercelGuideHtml() : '') + recurHtml() + toolsHtml() +
  '<div class="card" style="background:var(--latesoft);border-color:var(--latesoft);text-align:center"><button class="dng" id="out" style="background:transparent;width:100%;padding:10px">تسجيل الخروج الآمن</button></div>';
}

function bindSettings() {
  $('out').onclick = logout;
  bindRecur();
  bindAlertSettings();
  if (isAdmin()) bindOrdAdmin();
  bindTools();

  if ($('adm_co_scope')) {
    $('adm_co_scope').onchange = e => {
      S.setAdmCo = e.target.value;
      render();
    };
  }
  if ($('co_add')) {
    $('co_add').onclick = async () => {
      const v = $('co_in').value.trim(); if (!v) return $('co_in').focus();
      const cos = companiesList(); if (!cos.some(c => same(c, v))) cos.push(v);
      await persistOrgLists(cos, departmentsList());
      $('co_in').value = '';
      render();
      companyConfigDialog(v);
    };
  }
  document.querySelectorAll('[data-coedit]').forEach(b => b.onclick = () => companyConfigDialog(b.dataset.coedit));
  document.querySelectorAll('[data-corm]').forEach(b => b.onclick = async () => {
    const c = b.dataset.corm;
    if (same(c, 'متجرك')) return alert('شركة «متجرك» هي الشركة الأساسية ولا يمكن حذفها.');
    if (!confirm('حذف الشركة «' + c + '» من القائمة؟')) return;
    const cos = companiesList().filter(x => !same(x, c));
    if (same(S.activeCompany, c)) S.activeCompany = '';
    await persistOrgLists(cos, departmentsList());
    applyCompanyScope(); render();
  });
  document.querySelectorAll('[data-cosw]').forEach(b => b.onclick = () => {
    S.activeCompany = same(S.activeCompany, b.dataset.cosw) ? '' : b.dataset.cosw;
    S.setAdmCo = S.activeCompany;
    S.ordCfgCo = S.activeCompany || 'متجرك';
    applyCompanyScope(); render();
  });
  if ($('co_reset')) $('co_reset').onclick = () => { S.activeCompany = ''; S.setAdmCo = ''; applyCompanyScope(); render(); };

  if ($('dep_add')) {
    $('dep_add').onclick = async () => {
      const v = $('dep_in').value.trim(); if (!v) return $('dep_in').focus();
      const deps = departmentsList(); if (!deps.some(d => same(d, v))) deps.push(v);
      await persistOrgLists(companiesList(), deps);
      $('dep_in').value = ''; render();
    };
  }
  if ($('dep_seed')) {
    $('dep_seed').onclick = async () => {
      const defaults = ['إدارة المبيعات', 'إدارة التسويق', 'الإدارة المالية', 'إدارة العمليات', 'خدمة العملاء'];
      await persistOrgLists(companiesList(), defaults);
      render();
    };
  }
  document.querySelectorAll('[data-deprm]').forEach(b => b.onclick = async () => {
    const d = b.dataset.deprm;
    if (!confirm('حذف القسم «' + d + '» من القائمة؟')) return;
    const deps = departmentsList().filter(x => !same(x, d));
    await persistOrgLists(companiesList(), deps);
    render();
  });

  if ($('admin_remind')) {
    $('admin_remind').onclick = async () => {
        const admCo = (!isSuperAdmin() ? parseMemberMeta(S.me).company : (S.setAdmCo || '')) || '';
        const origTxt = $('admin_remind').textContent;
        $('admin_remind').textContent = 'جاري إرسال التذكيرات...';
        try {
            const url = '/api/remind' + (admCo ? '?company=' + encodeURIComponent(admCo) : '');
            const rr = await apiGet(url);
            alert(rr.ok ? ('تم إرسال تذكير شامل ' + (admCo ? 'لموظفي «' + admCo + '»' : 'لجميع أعضاء الفريق') + ' بنجاح! ✅') : 'تعذّر الإرسال (' + rr.status + ')');
        } catch(e) {}
        if ($('admin_remind')) $('admin_remind').textContent = origTxt;
    };
  }

  if ($('send_ping')) {
      $('send_ping').onclick = async () => {
          const to = $('ping_to').value;
          const msg = $('ping_msg').value.trim();
          const includeTasks = $('ping_tasks').checked;
          const admCo = (!isSuperAdmin() ? parseMemberMeta(S.me).company : (S.setAdmCo || '')) || '';
          const allStaff = (S.rawMembers || S.allMembers || S.members || []).filter(m => m.role !== 'rep');

          if (!to) return alert('الرجاء اختيار المستلم أولاً.');
          if (!msg && !includeTasks) return alert('يجب كتابة رسالة أو اختيار تضمين المهام.');
          
          $('send_ping').disabled = true; $('send_ping').textContent = '...';
          
          try {
              if (to.startsWith('__co:')) {
                  const targetCo = to.slice(5);
                  const targets = allStaff.filter(m => same(parseMemberMeta(m).company, targetCo));
                  if (!targets.length) { alert('لا يوجد موظفون مسجلون في متجر «' + targetCo + '» حالياً.'); $('send_ping').disabled = false; $('send_ping').textContent = 'إرسال الإشعار الآن 🔔'; return; }
                  await Promise.all(targets.map(m => apiPost('/api/notify', JSON.stringify({ title: 'تنبيه إداري (' + targetCo + ') 🔔', body: msg, assignee_email: m.email, for_all: false, is_custom: true, include_tasks: includeTasks }))));
                  alert('تم إرسال الإشعار إلى ' + targets.length + ' موظف في متجر «' + targetCo + '» ✅');
                  $('ping_msg').value = '';
              } else if (to.startsWith('__dep:')) {
                  const dep = to.slice(6);
                  const targets = allStaff.filter(m => same(parseMemberMeta(m).department, dep) && (!admCo || same(parseMemberMeta(m).company, admCo)));
                  if (!targets.length) { alert('لا يوجد موظفون في هذا القسم حالياً.'); $('send_ping').disabled = false; $('send_ping').textContent = 'إرسال الإشعار الآن 🔔'; return; }
                  await Promise.all(targets.map(m => apiPost('/api/notify', JSON.stringify({ title: 'تنبيه إداري (' + dep + ') 🔔', body: msg, assignee_email: m.email, for_all: false, is_custom: true, include_tasks: includeTasks }))));
                  alert('تم إرسال الإشعار إلى ' + targets.length + ' موظف في «' + dep + '» ✅');
                  $('ping_msg').value = '';
              } else if (to === '__all' && admCo) {
                  const targets = allStaff.filter(m => same(parseMemberMeta(m).company, admCo));
                  if (!targets.length) { alert('لا يوجد موظفون في متجر «' + admCo + '».'); $('send_ping').disabled = false; $('send_ping').textContent = 'إرسال الإشعار الآن 🔔'; return; }
                  await Promise.all(targets.map(m => apiPost('/api/notify', JSON.stringify({ title: 'تنبيه إداري (' + admCo + ') 🔔', body: msg, assignee_email: m.email, for_all: false, is_custom: true, include_tasks: includeTasks }))));
                  alert('تم إرسال الإشعار إلى جميع موظفي «' + admCo + '» (' + targets.length + ' موظف) ✅');
                  $('ping_msg').value = '';
              } else {
                  const all = to === '__all';
                  const rr = await apiPost('/api/notify', JSON.stringify({ title: 'تنبيه إداري 🔔', body: msg, assignee_email: all ? undefined : to, for_all: all, is_custom: true, include_tasks: includeTasks }));
                  const j = await rr.json().catch(() => ({}));
                  alert(rr.ok ? 'تم الإرسال ✅ وحُفظ في صندوق ' + (j.stored || 0) + ' عضو، ووصل إشعار الجوال إلى ' + (j.sent || 0) + ' جهاز.\nمن لم يصله إشعار الجوال سيرى التنبيه فور فتحه التطبيق.' : 'تعذّر الإرسال (' + (j.error || rr.status) + ')');
                  if (rr.ok) $('ping_msg').value = '';
              }
          } catch(e) {}
          if ($('send_ping')) { $('send_ping').disabled = false; $('send_ping').textContent = 'إرسال الإشعار الآن 🔔'; }
      };
  }

  $('test_push').onclick = async () => {
    if (!('serviceWorker' in navigator)) return alert('المتصفح لا يدعم الإشعارات.');
    const reg = await navigator.serviceWorker.ready;
    alert('سيصلك الإشعار خلال 3 ثوانٍ.. اخرج من التطبيق الآن للشاشة الرئيسية لترى الإشعار.');
    setTimeout(() => { reg.showNotification('🔔 تذكير تجريبي', { body: 'النظام يعمل بنجاح تام.', icon: '/icon-192.png' }); }, 3000);
  };

  $('svp').onclick = async () => { 
    const v = $('np').value; if (v.length < 6) return alert('6 أحرف على الأقل'); 
    $('svp').textContent = '...';
    const { error } = await sb.auth.updateUser({ password: v }); 
    alert(error ? error.message : 'تم التغيير.'); $('np').value = ''; $('svp').textContent = 'حفظ التغيير';
  };
  if ($('admin_wa_batch') && typeof waRemindDialog === 'function') {
    $('admin_wa_batch').onclick = () => waRemindDialog('', 'late');
  }
  document.querySelectorAll('[data-mwa]').forEach(b => b.onclick = () => {
    if (typeof waRemindDialog === 'function') waRemindDialog(b.dataset.mwa, 'late');
  });
  document.querySelectorAll('[data-mts]').forEach(b => b.onclick = async () => {
    const em = b.dataset.mts;
    const i = document.querySelector('[data-mt="' + em + '"]');
    const phEl = document.querySelector('[data-mph="' + em + '"]');
    const coEl = document.querySelector('[data-mco="' + em + '"]');
    const depEl = document.querySelector('[data-mdep="' + em + '"]');
    const roleEl = document.querySelector('[data-mrole="' + em + '"]');
    const m = (S.rawMembers || S.allMembers || S.members || []).find(x => same(x.email, em)) || {};
    const oldMeta = parseMemberMeta(m);
    const isMeSuper = S.me && same(em, S.me.email) && m.role === 'admin';
    const newCo = coEl ? coEl.value : (isMeSuper ? '' : (oldMeta.company || 'متجرك'));
    const newDep = depEl ? depEl.value : oldMeta.department;
    const newPh = phEl ? phEl.value.trim() : (oldMeta.phone || '');
    const newRole = roleEl ? roleEl.value : m.role;
    const patch = {
      title: i ? (i.value.trim() || null) : null,
      company: newCo || null,
      department: newDep || null,
      phone: newPh || null,
      telegram_chat_id: encodeMemberMeta(newCo, newDep, newPh)
    };
    if (newRole && newRole !== m.role) patch.role = newRole;
    let { error } = await sb.from('members').update(patch).eq('email', em);
    if (error && /(company|department|phone)/i.test(error.message)) {
      delete patch.company; delete patch.department; delete patch.phone;
      ({ error } = await sb.from('members').update(patch).eq('email', em));
    }
    if (error) alert('خطأ: ' + error.message);
    else if (typeof toast === 'function') toast('تم حفظ بيانات العضو ✓');
    load();
  });
  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { if (confirm('إزالة العضو نهائياً؟')) run(sb.from('members').delete().eq('email', b.dataset.rm)); });
  if ($('addm')) $('addm').onclick = async () => {
    const e = $('ne').value.trim(), n = $('nn').value.trim();
    if (!e || !n) return alert('الرجاء كتابة الاسم والبريد الإلكتروني.');
    const co = $('nco') ? $('nco').value : activeCompanyFilter();
    const dep = $('ndep') ? $('ndep').value : '';
    const ph = $('nph') ? $('nph').value.trim() : '';
    const title = $('ntitle') && $('ntitle').value.trim() ? $('ntitle').value.trim() : null;
    const row = { email: e, name: n, role: $('nr') ? $('nr').value : 'member', company: co || 'متجرك', department: dep || null, phone: ph || null };
    if (title) row.title = title;
    const metaStr = encodeMemberMeta(co, dep, ph);
    if (metaStr) row.telegram_chat_id = metaStr;
    let { error } = await sb.from('members').insert(row);
    if (error && /(company|department|phone)/i.test(error.message)) {
      delete row.company; delete row.department; delete row.phone;
      ({ error } = await sb.from('members').insert(row));
    }
    if (error) alert('خطأ: ' + error.message);
    load();
  };
}
