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
  if (!canMemberAccessSettingsTab('stores')) return '';
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

function memberPermsDialog(email) {
  const m = (S.rawMembers || S.allMembers || S.members || []).find(x => same(x.email, email));
  if (!m) return;
  const meta = parseMemberMeta(m);
  const p = memberPerms(m);
  const co = meta.company || 'متجرك';
  const prof = getCompanyProfile(co);
  const isAdm = m.role === 'admin';

  const screens = [
    ['board', '📋 المهام والمشاريع', 'لوحة المهام ومتابعة سير العمل اليومي والمهام الفرعية'],
    ['pub', '📢 النشر وإدارة المحتوى', 'جدول النشر، مراحل المحتوى من الاستلام للتصميم، والتواجد للردود'],
    ['kb', '📚 مكتبة المعرفة والبرومبتات', 'أدلة العمل، البرومبتات الذكية الجاهزة، والخبرات المشتركة'],
    ['orders', '🛒 إدارة الطلبات', 'تسجيل الطلبات، إسناد للمناديب، طباعة وإرسال الفواتير'],
    ['erp', '💼 الحسابات والعهد', 'حسابات الموردين، عهدة المناديب، والمصروفات'],
    ['dash', '📊 لوحة الأرقام والتقارير', 'مؤشرات الأداء ورسوم وتحليلات المبيعات والإنجاز'],
    ['props', '🗳️ القرارات والتصويت', 'تقديم المقترحات ومشاركة الفريق في التصويت'],
    ['log', '📜 سجل النشاط', 'متابعة سجل حركات وتعديلات النظام']
  ];

  dlg.innerHTML = '<h2>🔒 صلاحيات الشاشات والطلبات: ' + esc(m.name) + '</h2>' +
    '<div class="m" style="margin-bottom:14px">البريد: <b dir="ltr">' + esc(m.email) + '</b> · المتجر: <b>' + esc(prof.displayName || co) + '</b> ' + (isAdm ? '<span class="chip all">مدير عام</span>' : '') + '</div>' +
    (isAdm ? '<div class="m" style="margin-bottom:12px;background:var(--col);padding:10px;border-radius:10px">👑 هذا الحساب يحمل رتبة «مدير» ويملك تلقائياً صلاحية كاملة على كل شاشات وطلبات النظام.</div>' : '') +
    '<div class="obox" style="margin-bottom:12px">' +
      '<b style="display:block;margin-bottom:8px">1. الشاشات المسموح للموظف بالوصول إليها:</b>' +
      screens.map(([k, l, desc]) =>
        '<label class="chk" style="margin-bottom:8px">' +
          '<input type="checkbox" data-pm-screen="' + k + '" ' + (isAdm || p.screens.includes(k) ? 'checked' : '') + (isAdm ? ' disabled' : '') + '> ' +
          '<span><b>' + l + '</b><small class="m" style="display:block;font-size:11.5px">' + desc + '</small></span>' +
        '</label>'
      ).join('') +
    '</div>' +
    '<div class="obox" style="margin-bottom:12px">' +
      '<b style="display:block;margin-bottom:8px">2. نطاق رؤية الطلبات في المتجر (خاص بالطلبات):</b>' +
      '<label style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;cursor:pointer">' +
        '<input type="radio" name="pm_ord_scope" value="all" ' + (isAdm || p.ordersScope === 'all' ? 'checked' : '') + (isAdm ? ' disabled' : '') + ' style="margin-top:4px">' +
        '<span><b>🌐 رؤية جميع طلبات الشركة</b><small class="m" style="display:block;font-size:11.5px">يحق للموظف متابعة ورؤية طلبات زملائه الآخرين في نفس الشركة/المتجر.</small></span>' +
      '</label>' +
      '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer">' +
        '<input type="radio" name="pm_ord_scope" value="own" ' + (!isAdm && p.ordersScope === 'own' ? 'checked' : '') + (isAdm ? ' disabled' : '') + ' style="margin-top:4px">' +
        '<span><b>🔒 رؤية طلباته الشخصية فقط (محجوبة عن طلبات زملائه)</b><small class="m" style="display:block;font-size:11.5px">لا يرى الموظف إلا الطلبات التي قام بتسجيلها بنفسه، وتُحجب عنه طلبات زملائه في نفس الشركة تماماً.</small></span>' +
      '</label>' +
    '</div>' +
    '<div class="obox" style="margin-bottom:14px">' +
      '<b style="display:block;margin-bottom:8px">3. التكاليف والبيانات المالية:</b>' +
      '<label class="chk">' +
        '<input type="checkbox" id="pm_can_cost" ' + (isAdm || p.canCost ? 'checked' : '') + (isAdm ? ' disabled' : '') + '> ' +
        '<span><b>💰 إظهار تكلفة شراء البضاعة وهوامش الربح</b><small class="m" style="display:block;font-size:11.5px">السماح لهذا الموظف برؤية وإدخال سعر شراء البضاعة والاطلاع على أرباح الطلبات.</small></span>' +
      '</label>' +
    '</div>' +
    '<div class="obox" style="margin-bottom:14px">' +
      '<b style="display:block;margin-bottom:8px">4. صلاحيات تبويبات الإعدادات (توزيع التبويبات بدقة):</b>' +
      '<p class="m" style="margin-bottom:8px;font-size:12px">يمكنك منح هذا الموظف إدارة تبويبات محددة في شاشة الإعدادات وفق مهامه واختصاصه:</p>' +
      '<label class="chk" style="margin-bottom:6px">' +
        '<input type="checkbox" data-pm-set="staff" ' + (isAdm || (p.settingsTabs || []).includes('staff') ? 'checked' : '') + (isAdm ? ' disabled' : '') + '> ' +
        '<span><b>👥 الموظفون وفريق العمل</b><small class="m" style="display:block;font-size:11.5px">إضافة وتعديل بيانات الأعضاء وتعيين كلمات المرور</small></span>' +
      '</label>' +
      '<label class="chk" style="margin-bottom:6px">' +
        '<input type="checkbox" data-pm-set="reps" ' + (isAdm || (p.settingsTabs || []).includes('reps') ? 'checked' : '') + (isAdm ? ' disabled' : '') + '> ' +
        '<span><b>🛵 مناديب التوصيل</b><small class="m" style="display:block;font-size:11.5px">إضافة وتعيين كلمات مرور مناديب التوصيل وإسناد المتاجر</small></span>' +
      '</label>' +
      '<label class="chk" style="margin-bottom:6px">' +
        '<input type="checkbox" data-pm-set="stores" ' + (isAdm || (p.settingsTabs || []).includes('stores') ? 'checked' : '') + (isAdm ? ' disabled' : '') + '> ' +
        '<span><b>🏢 الشركات والهوية المؤسسية</b><small class="m" style="display:block;font-size:11.5px">تخصيص الهوية والشعار وعنوان الفاتورة والأقسام</small></span>' +
      '</label>' +
      '<label class="chk" style="margin-bottom:6px">' +
        '<input type="checkbox" data-pm-set="orders_cfg" ' + (isAdm || (p.settingsTabs || []).includes('orders_cfg') ? 'checked' : '') + (isAdm ? ' disabled' : '') + '> ' +
        '<span><b>🖨️ إعدادات المتجر والطباعة والفواتير</b><small class="m" style="display:block;font-size:11.5px">طابعات البلوتوث الحرارية 80mm/58mm، شروط الفاتورة، حالات الطلبات</small></span>' +
      '</label>' +
      '<label class="chk" style="margin-bottom:6px">' +
        '<input type="checkbox" data-pm-set="notify" ' + (isAdm || (p.settingsTabs || []).includes('notify') ? 'checked' : '') + (isAdm ? ' disabled' : '') + '> ' +
        '<span><b>🔔 التنبيهات والإشعارات</b><small class="m" style="display:block;font-size:11.5px">إرسال تنبيهات جماعية وتذكيرات واتساب لموظفي المتجر</small></span>' +
      '</label>' +
      '<label class="chk" style="margin-bottom:6px">' +
        '<input type="checkbox" data-pm-set="recur" ' + (isAdm || (p.settingsTabs || []).includes('recur') ? 'checked' : '') + (isAdm ? ' disabled' : '') + '> ' +
        '<span><b>🔄 المهام المتكررة</b><small class="m" style="display:block;font-size:11.5px">إدارة وجدولة المهام التي تتكرر دورياً</small></span>' +
      '</label>' +
      '<label class="chk" style="margin-bottom:6px">' +
        '<input type="checkbox" data-pm-set="tools" ' + (isAdm || (p.settingsTabs || []).includes('tools') ? 'checked' : '') + (isAdm ? ' disabled' : '') + '> ' +
        '<span><b>🛠️ أدوات النظام والنسخ الاحتياطي</b><small class="m" style="display:block;font-size:11.5px">تصدير واستيراد البيانات وفحص سلامة النظام وتصفية المكرر</small></span>' +
      '</label>' +
    '</div>' +
    '<div class="row dact">' +
      '<button class="p s" id="pm_save" ' + (isAdm ? 'disabled' : '') + '>💾 حفظ الصلاحيات</button>' +
      '<button class="s" id="pm_cancel">إغلاق</button>' +
    '</div>';

  $('pm_cancel').onclick = () => dlg.close();
  if (!isAdm) {
    $('pm_save').onclick = async () => {
      const allowedScreens = [...document.querySelectorAll('[data-pm-screen]')].filter(c => c.checked).map(c => c.dataset.pmScreen);
      if (!allowedScreens.length) return alert('يجب تحديد شاشة واحدة على الأقل للموظف.');
      const ordScopeEl = document.querySelector('input[name="pm_ord_scope"]:checked');
      const ordersScope = ordScopeEl ? ordScopeEl.value : 'all';
      const canCostVal = $('pm_can_cost').checked;
      const allowedSetTabs = [...document.querySelectorAll('[data-pm-set]')].filter(c => c.checked).map(c => c.dataset.pmSet);

      const perms = {
        screens: allowedScreens,
        ordersScope: ordersScope,
        canCost: canCostVal,
        settingsTabs: allowedSetTabs
      };

      $('pm_save').disabled = true; $('pm_save').textContent = 'جارٍ الحفظ...';

      const patch = {
        permissions: perms,
        telegram_chat_id: encodeMemberMeta(meta.company, meta.department, meta.phone, perms)
      };

      let { error } = await sb.from('members').update(patch).eq('email', email);
      if (error && /permissions/i.test(error.message)) {
        delete patch.permissions;
        ({ error } = await sb.from('members').update(patch).eq('email', email));
      }

      m.permissions = perms;
      m.telegram_chat_id = patch.telegram_chat_id;
      if (S.me && same(S.me.email, email)) {
        S.me.permissions = perms;
        S.me.telegram_chat_id = patch.telegram_chat_id;
      }
      dlg.close();
      applyCompanyScope();
      render();
      if (typeof toast === 'function') toast('تم تحديث صلاحيات «' + m.name + '» بنجاح ✓');
    };
  }
  dlg.showModal();
}

function settingsBlockHtml(id, icon, title, desc, metaBadge, bodyContent, isOpen) {
  const openClass = isOpen ? ' open' : ' closed';
  return '<div class="set-acc-card' + openClass + '" id="sb_' + id + '" data-setblock="' + id + '">' +
    '<div class="set-acc-head" data-block-toggle="' + id + '" role="button" tabindex="0" title="انقر للفتح أو الإغلاق">' +
      '<div class="set-acc-title">' +
        '<span class="set-acc-icon">' + icon + '</span>' +
        '<div class="set-acc-text">' +
          '<b>' + esc(title) + '</b>' +
          (desc ? '<span class="desc">' + esc(desc) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="set-acc-meta">' +
        (metaBadge || '') +
        '<span class="set-acc-arrow">▾</span>' +
      '</div>' +
    '</div>' +
    '<div class="set-acc-body" style="padding-top:14px">' + bodyContent + '</div>' +
  '</div>';
}

function staffBlockHtml() {
  const cos = companiesList(), deps = departmentsList();
  const myCo = isSuperAdmin() ? '' : parseMemberMeta(S.me).company;
  if (S.setAdmCo === undefined) S.setAdmCo = activeCompanyFilter() || '';
  const admCo = myCo || S.setAdmCo || '';
  const allStaff = (S.rawMembers || S.allMembers || S.members || []).filter(m => m.role !== 'rep');
  const listMembers = admCo ? allStaff.filter(m => same(parseMemberMeta(m).company, admCo) || (S.me && same(m.email, S.me.email))) : allStaff;

  const memList = listMembers.map(m => {
      const meta = parseMemberMeta(m);
      const p = memberPerms(m);
      const isMeSuper = S.me && same(m.email, S.me.email) && m.role === 'admin';
      let rmBtn = (S.me && same(m.email, S.me.email)) ? '' : '<button class="dng s" data-rm="' + esc(m.email) + '">إزالة</button>';
      const allowedCos = myCo ? [myCo] : (isMeSuper ? [''].concat(cos) : cos);
      const selectedCo = isMeSuper ? (String(m.company || (m.telegram_chat_id && m.telegram_chat_id.startsWith('{') ? (JSON.parse(m.telegram_chat_id).co || '') : '') || '').trim()) : (meta.company || 'متجرك');
      const coOpts = allowedCos.map(c => '<option value="' + esc(c) + '"' + (same(selectedCo, c) ? ' selected' : '') + '>' + (c ? '🏢 ' + esc(c) : '👑 كل الشركات (المدير العام فقط)') + '</option>').join('');
      const depSet = new Set(deps); if (meta.department) depSet.add(meta.department);
      const depOpts = '<option value="">-- بدون إدارة/قسم --</option>' + [...depSet].map(d => '<option value="' + esc(d) + '"' + (same(meta.department, d) ? ' selected' : '') + '>🏛️ ' + esc(d) + '</option>').join('');
      const ordScopeBadge = m.role === 'admin' ? '' : (p.ordersScope === 'own' ? '<span class="chip late" style="font-size:11px" title="لا يرى إلا طلباته الشخصية">🔒 طلباته فقط</span>' : '<span class="chip ok" style="font-size:11px" title="يرى كل طلبات الشركة">🌐 كل الطلبات</span>');
      return '<div class="bar mem-row" style="background:var(--col);padding:10px 12px;border-radius:10px;margin-bottom:8px"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b>' + esc(m.name) + '</b> <span class="m" dir="ltr">(' + esc(m.email) + ')</span> <span class="chip' + (m.role === 'rep' ? ' pr-chip important' : m.role === 'admin' ? ' all' : '') + '">' + ({ admin: 'مدير', rep: '🛵 مندوب', member: 'عضو' }[m.role] || 'عضو') + '</span>' +
        (selectedCo ? '<span class="chip">🏢 ' + esc(selectedCo) + '</span>' : '<span class="chip all">🌐 كل الشركات</span>') +
        (meta.department ? '<span class="chip">🏛️ ' + esc(meta.department) + '</span>' : '') +
        (meta.phone ? '<span class="chip ok" dir="ltr">📱 ' + esc(meta.phone) + '</span>' : '') +
        ordScopeBadge +
        '<button class="s" type="button" data-mpw="' + esc(m.email) + '" style="font-size:11.5px;padding:3px 8px;background:var(--card);border-color:var(--line)" title="تعيين أو تغيير كلمة مرور الموظف">🔑 كلمة المرور</button>' +
        '<button class="s" type="button" data-mperms="' + esc(m.email) + '" style="font-size:11.5px;padding:3px 8px;background:var(--card);border-color:var(--line)" title="صلاحيات الشاشات ونطاق رؤية الطلبات">🔒 الصلاحيات والشاشات</button>' +
        '<button class="s" type="button" data-mwa="' + esc(m.email) + '" style="font-size:11.5px;padding:3px 8px" title="إرسال تذكير واتساب بمهام الموظف">📲 تذكير واتساب</button>' +
        '</div><div class="row" style="flex:1 1 100%;margin-top:8px;gap:6px">' +
        '<input data-mt="' + esc(m.email) + '" value="' + esc(m.title || '') + '" placeholder="المسمى الوظيفي (مثال: مسؤول التسويق)" style="flex:2 1 140px">' +
        '<input data-mph="' + esc(m.email) + '" dir="ltr" inputmode="tel" value="' + esc(meta.phone || '') + '" placeholder="📱 واتساب الموظف (77...)" style="flex:1 1 130px">' +
        '<select data-mco="' + esc(m.email) + '" title="الشركة" style="flex:1 1 125px">' + coOpts + '</select>' +
        '<select data-mdep="' + esc(m.email) + '" title="الإدارة / القسم" style="flex:1 1 125px">' + depOpts + '</select>' +
        '<select data-mrole="' + esc(m.email) + '" title="الصلاحية" style="flex:0 1 100px"><option value="member"' + (m.role !== 'admin' ? ' selected' : '') + '>👤 عضو</option><option value="admin"' + (m.role === 'admin' ? ' selected' : '') + '>👑 مدير</option></select>' +
        '<button class="s p" data-mts="' + esc(m.email) + '">حفظ</button>' + rmBtn + '</div></div>';
  }).join('');

  const defNewCo = admCo || activeCompanyFilter() || 'متجرك';
  const newCoOpts = (myCo ? [myCo] : cos).map(c => '<option value="' + esc(c) + '"' + (same(defNewCo, c) ? ' selected' : '') + '>🏢 ' + esc(c) + '</option>').join('');
  const newDepOpts = '<option value="">-- الإدارة / القسم (اختياري) --</option>' + deps.map(d => '<option value="' + esc(d) + '">🏛️ ' + esc(d) + '</option>').join('');

  const scopeBar = isSuperAdmin() ? (
    '<div class="store-scope-bar" style="margin-bottom:12px">' +
      '<span>🏢 تصفية الموظفين بحسب المتجر:</span>' +
      '<select id="adm_co_scope">' +
        '<option value=""' + (!admCo ? ' selected' : '') + '>🌐 جميع المتاجر والشركات (' + cos.length + ')</option>' +
        cos.map(c => '<option value="' + esc(c) + '"' + (same(admCo, c) ? ' selected' : '') + '>🏢 متجر: ' + esc(getCompanyProfile(c).displayName || c) + '</option>').join('') +
      '</select>' +
    '</div>'
  ) : '';

  return scopeBar +
    '<div class="bar" style="margin-bottom:10px"><b>👥 قائمة الموظفين والأعضاء (' + listMembers.length + (admCo ? ' في ' + esc(admCo) : '') + ')</b></div>' +
    (memList || '<p class="m">لا يوجد موظفون مسجلون في هذا النطاق.</p>') +
    '<hr style="border:0;border-top:1px solid var(--line);margin:16px 0">' +
    '<h3 style="font-size:14px;margin-top:14px">➕ إضافة عضو / موظف جديد (مع دعم الدخول بالجوال فقط وتوليد كلمة المرور):</h3>' +
    '<p class="m" style="margin-bottom:10px;font-size:12.5px">يمكنك إضافة موظف برقم جواله فقط (بدون إيميل) وسيتولى النظام إنشاء حساب الدخول وتعيين كلمة المرور ورسالة الواتساب الجاهزة فوراً.</p>' +
    '<div class="row" style="gap:6px">' +
      '<input id="nn" placeholder="اسم الموظف *" style="flex:1 1 140px">' +
      '<input id="nph" dir="ltr" inputmode="tel" placeholder="📱 رقم الجوال للدخول (77...)" style="flex:1 1 140px">' +
      '<input id="ne" dir="ltr" placeholder="البريد الإلكتروني (اختياري عند إدخال الجوال)" style="flex:1 1 170px">' +
      '<input id="ntitle" placeholder="المسمى الوظيفي (اختياري)" style="flex:1 1 130px">' +
    '</div>' +
    '<div class="row" style="margin-top:8px;gap:6px">' +
      '<input id="npw" dir="ltr" placeholder="🔑 كلمة المرور (6 أحرف+)" style="flex:1 1 150px">' +
      '<button class="s" id="npw_g" type="button" style="font-size:12px;white-space:nowrap">🎲 توليد كلمة مرور</button>' +
      '<select id="nco" style="flex:1 1 130px">' + newCoOpts + '</select>' +
      '<select id="ndep" style="flex:1 1 130px">' + newDepOpts + '</select>' +
      '<select id="nr" style="flex:0 1 110px"><option value="member">👤 عضو</option><option value="admin">👑 مدير</option></select>' +
      '<button class="p s" id="addm" style="white-space:nowrap">➕ إنشاء حساب الموظف</button>' +
    '</div>';
}

function notifyBlockHtml() {
  const cos = companiesList(), deps = departmentsList();
  const myCo = isSuperAdmin() ? '' : parseMemberMeta(S.me).company;
  const admCo = myCo || S.setAdmCo || '';
  const allStaff = (S.rawMembers || S.allMembers || S.members || []).filter(m => m.role !== 'rep');
  const listMembers = admCo ? allStaff.filter(m => same(parseMemberMeta(m).company, admCo) || (S.me && same(m.email, S.me.email))) : allStaff;

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

  return '<div class="row" style="margin-bottom:14px;gap:8px">' +
      '<button class="p" id="admin_remind" style="flex:1 1 220px;background:var(--soon);border-color:var(--soon);color:#fff">' + esc(remindLabel) + '</button>' +
      '<button class="p" id="admin_wa_batch" type="button" style="flex:1 1 220px;background:#15803d;border-color:#15803d;color:#fff">📲 تذكير الموظفين بالمهام المتأخرة (واتساب)</button>' +
    '</div>' +
    '<div style="background:var(--col);padding:12px;border-radius:12px;margin-bottom:14px">' +
      '<h3 style="font-size:14px;margin:0 0 8px;color:var(--acc)">إرسال إشعار مخصص لموظف أو متجر أو إدارة:</h3>' +
      '<div class="row" style="margin-bottom:8px"><select id="ping_to"><option value="__all">' + esc(allLabel) + '</option>' + optCos + optDeps + optMembers + '</select></div>' +
      '<div class="row" style="margin-bottom:8px"><input id="ping_msg" placeholder="اكتب رسالة التنبيه (اختياري)..."></div>' +
      '<div class="row" style="margin-bottom:12px;justify-content:flex-start;gap:8px;"><input type="checkbox" id="ping_tasks" style="width:auto;margin:0" checked> <label for="ping_tasks" style="font-size:13px;cursor:pointer">تضمين تذكير بالمهام غير المنجزة (لكل شخص مهامه في متجره)</label></div>' +
      '<div class="row"><button class="p s" id="send_ping">إرسال الإشعار الآن 🔔</button></div>' +
    '</div>' +
    alertSettingsHtml();
}

function toolsBlockHtml() {
  return toolsHtml() + (typeof dupCardHtml === 'function' ? dupCardHtml() : '');
}

function accountBlockHtml() {
  const me = S.me || {};
  const meta = parseMemberMeta(me);
  const myRole = me.role === 'admin' ? '👑 مدير عام' : (me.role === 'rep' ? '🛵 مندوب توصيل' : '👤 عضو في الفريق');
  return '<div style="background:var(--col);padding:12px 14px;border-radius:12px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
    '<div>' +
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b style="font-size:15px">' + esc(me.name || 'حسابي') + '</b> <span class="chip all">' + esc(myRole) + '</span>' + (meta.company ? '<span class="chip">🏢 ' + esc(meta.company) + '</span>' : '') + '</div>' +
      '<div class="m" style="font-size:12px;margin-top:3px" dir="ltr">' + esc(me.email || '') + (meta.phone ? ' · 📱 ' + esc(meta.phone) : '') + '</div>' +
    '</div>' +
  '</div>' +
  '<div class="card" style="margin-bottom:12px"><h3>🔑 تغيير كلمة المرور الخاصة بحسابي</h3><div class="row" style="margin-top:8px"><input id="np" type="password" dir="ltr" placeholder="6 أحرف على الأقل"><button class="s" id="svp">حفظ التغيير</button></div></div>' +
  '<div class="card" style="margin-bottom:12px;border-color:var(--oksoft)">' +
    '<h3>🔔 تجربة الإشعارات الفورية على هذا الجهاز</h3>' +
    '<p class="m" style="margin-bottom:10px;font-size:12.5px">تأكد من تفعيل إشعارات المتصفح حتى تصلك التنبيهات حتى والتطبيق مغلق.</p>' +
    '<div class="row"><button class="s" id="test_push" style="background:var(--soon);border-color:var(--soon);color:#fff">تجربة وصول الإشعار في جوالي 🔔</button></div>' +
  '</div>' +
  '<div class="card" style="margin-bottom:12px;background:var(--col);border-color:var(--line)">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
      '<div>' +
        '<div style="font-weight:700;font-size:14px">📱 إصدار النظام الحالي: <span class="chip ok" style="font-size:12px">v' + VERSION + '</span></div>' +
        '<div class="m" style="font-size:11.5px;margin-top:3px">مزامنة أحدث الشاشات والتقسيمات ومسح الكاش للتطبيق على جوالك.</div>' +
      '</div>' +
      '<button class="s p" id="force_refresh_app" type="button" style="font-size:12px">🔄 تحديث ومزامنة الإصدار الآن</button>' +
    '</div>' +
  '</div>' +
  '<div class="card" style="background:var(--latesoft);border-color:var(--latesoft);text-align:center"><button class="dng" id="out" style="background:transparent;width:100%;padding:10px">تسجيل الخروج الآمن</button></div>';
}

function settingsView() {
  const cos = companiesList();
  const allStaff = (S.rawMembers || S.allMembers || S.members || []).filter(m => m.role !== 'rep');
  const allReps = (S.rawMembers || S.allMembers || S.reps || []).filter(m => m.role === 'rep');

  // تعريف التبويبات المتاحة
  const allTabs = [
    { id: 'all', label: '🌟 كل الأقسام', desc: 'عرض كافة أقسام الإعدادات بأكورديون قابل للطي' },
    { id: 'staff', label: '👥 الموظفون', count: allStaff.length, desc: 'إدارة فريق العمل وحسابات الدخول' },
    { id: 'reps', label: '🛵 المناديب', count: allReps.length, desc: 'مناديب التوصيل وكلمات المرور' },
    { id: 'stores', label: '🏢 الشركات', count: cos.length, desc: 'الهوية والشعارات والأقسام' },
    { id: 'orders_cfg', label: '🖨️ المتجر والطباعة', desc: 'إعدادات الفاتورة والطباعة الحرارية والشاشات' },
    { id: 'notify', label: '🔔 الإشعارات', desc: 'التنبيهات وتذكيرات واتساب' },
    { id: 'recur', label: '🔄 المتكررة', desc: 'جدولة المهام الدورية' },
    { id: 'tools', label: '🛠️ أدوات النظام', desc: 'النسخ الاحتياطي وفحص النظام' },
    { id: 'account', label: '👤 حسابي', desc: 'كلمة المرور وتحديث الإصدار والخروج' }
  ];

  // تصفية التبويبات بحسب صلاحيات الموظف الدقيقة
  const visibleTabs = allTabs.filter(t => {
    if (t.id === 'all') return isAdmin();
    if (t.id === 'account') return true;
    return canMemberAccessSettingsTab(t.id);
  });

  // تحديد التبويب النشط
  if (!S.settingsSubTab || !visibleTabs.some(t => t.id === S.settingsSubTab)) {
    S.settingsSubTab = visibleTabs.length > 1 ? visibleTabs[0].id : 'account';
  }
  const curTab = S.settingsSubTab;

  // شريط التبويبات الفرعية في الأعلى
  const subtabsBar = '<div class="set-subtabs" role="tablist">' + visibleTabs.map(t => {
    const isAct = t.id === curTab;
    const badge = t.count !== undefined ? '<span class="badge">' + t.count + '</span>' : '';
    return '<button type="button" class="set-tab-btn' + (isAct ? ' on' : '') + '" data-set-tab="' + t.id + '">' + t.label + badge + '</button>';
  }).join('') + '</div>';

  S.settingsCollapsed = S.settingsCollapsed || {};
  const isBlockOpen = id => {
    if (curTab !== 'all') return curTab === id;
    return !S.settingsCollapsed[id];
  };

  // تجميع البلوكات المتاحة للمستخدم
  const blocks = [];

  if (canMemberAccessSettingsTab('staff')) {
    blocks.push({
      id: 'staff',
      icon: '👥',
      title: 'إدارة الموظفين وفريق العمل',
      desc: 'إضافة أعضاء بالجوال، تعيين كلمات المرور، وتحديد صلاحيات الشاشات والطلبات',
      badge: '<span class="chip ok">' + allStaff.length + ' موظف</span>',
      html: staffBlockHtml()
    });
  }

  if (canMemberAccessSettingsTab('reps')) {
    blocks.push({
      id: 'reps',
      icon: '🛵',
      title: 'مندوبو التوصيل',
      desc: 'إدارة حسابات المناديب بالجوال، توليد كلمات المرور، وإسناد المتاجر',
      badge: '<span class="chip all">' + allReps.length + ' مندوب</span>',
      html: typeof repsCardHtml === 'function' ? repsCardHtml() : ''
    });
  }

  if (canMemberAccessSettingsTab('stores')) {
    blocks.push({
      id: 'stores',
      icon: '🏢',
      title: 'إدارة الشركات والهوية المؤسسية',
      desc: 'تخصيص الشعار الرسمي، الألوان، العملة، الترويسة، والأقسام والإدارات',
      badge: '<span class="chip">' + cos.length + ' شركات</span>',
      html: orgSettingsHtml()
    });
  }

  if (canMemberAccessSettingsTab('orders_cfg')) {
    blocks.push({
      id: 'orders_cfg',
      icon: '🖨️',
      title: 'إعدادات المتجر والطباعة والفواتير',
      desc: 'طابعات البلوتوث الحرارية 80mm/58mm، شروط وتذييل الفاتورة، حالات الطلبات',
      badge: '<span class="chip ok">طابعات وفواتير</span>',
      html: typeof ordSettingsHtml === 'function' ? ordSettingsHtml() : ''
    });
  }

  if (canMemberAccessSettingsTab('notify')) {
    blocks.push({
      id: 'notify',
      icon: '🔔',
      title: 'التنبيهات والإشعارات الفورية',
      desc: 'إرسال تنبيهات جماعية، تذكيرات واتساب، واختبار وصول الإشعار بالجوال',
      badge: '<span class="chip all">إشعارات وواتساب</span>',
      html: notifyBlockHtml()
    });
  }

  if (canMemberAccessSettingsTab('recur')) {
    blocks.push({
      id: 'recur',
      icon: '🔄',
      title: 'المهام الدورية والمتكررة',
      desc: 'جدولة المهام التي تتكرر دورياً يومياً أو أسبوعياً أو شهرياً',
      badge: '<span class="chip">مهام مجدولة</span>',
      html: typeof recurHtml === 'function' ? recurHtml() : ''
    });
  }

  if (canMemberAccessSettingsTab('tools')) {
    blocks.push({
      id: 'tools',
      icon: '🛠️',
      title: 'أدوات النظام والنسخ الاحتياطي',
      desc: 'تصدير نسخة احتياطية JSON، فحص سلامة النظام، وتصفية المهام المكررة',
      badge: '<span class="chip late">تشخيص وصيانة</span>',
      html: toolsBlockHtml()
    });
  }

  // حسابي والأمان (متاح دائماً لكل مستخدم)
  blocks.push({
    id: 'account',
    icon: '👤',
    title: 'حسابي والأمان ورقم الإصدار',
    desc: 'تغيير كلمة المرور الشخصية، فحص الإشعارات، وتحديث إصدار النظام',
    badge: '<span class="chip ok">v' + VERSION + '</span>',
    html: accountBlockHtml()
  });

  const filteredBlocks = curTab === 'all' ? blocks : blocks.filter(b => b.id === curTab);

  const toolbar = curTab === 'all' ? (
    '<div class="set-toolbar">' +
      '<span class="m" style="font-size:12.5px">أقسام الإعدادات المتاحة لك (' + filteredBlocks.length + ' أقسام) · انقر على أي سهم لفتحه أو طيّه:</span>' +
      '<div class="row s" style="gap:6px">' +
        '<button type="button" class="s" id="set_expand_all" style="font-size:12px;padding:3px 8px">⤢ فتح كل الأقسام</button>' +
        '<button type="button" class="s" id="set_collapse_all" style="font-size:12px;padding:3px 8px">⤡ طي الكل</button>' +
      '</div>' +
    '</div>'
  ) : '';

  return subtabsBar + toolbar + filteredBlocks.map(b => settingsBlockHtml(b.id, b.icon, b.title, b.desc, b.badge, b.html, isBlockOpen(b.id))).join('');
}

function bindSettings() {
  if ($('out')) $('out').onclick = logout;
  bindRecur();
  bindAlertSettings();
  if (isAdmin() || (typeof canMemberAccessSettingsTab === 'function' && (canMemberAccessSettingsTab('reps') || canMemberAccessSettingsTab('orders_cfg')))) bindOrdAdmin();
  bindTools();

  // تفعيل النقر على التبويبات الفرعية
  document.querySelectorAll('[data-set-tab]').forEach(b => {
    b.onclick = () => {
      S.settingsSubTab = b.dataset.setTab;
      render();
    };
  });

  // تفعيل طي وفتح البلوكات عند النقر على السهم أو العنوان
  document.querySelectorAll('[data-block-toggle]').forEach(h => {
    h.onclick = () => {
      const id = h.dataset.blockToggle;
      S.settingsCollapsed = S.settingsCollapsed || {};
      S.settingsCollapsed[id] = !S.settingsCollapsed[id];
      render();
    };
  });

  // فتح كل الأقسام
  if ($('set_expand_all')) {
    $('set_expand_all').onclick = () => {
      S.settingsCollapsed = {};
      render();
    };
  }

  // طي كل الأقسام
  if ($('set_collapse_all')) {
    $('set_collapse_all').onclick = () => {
      S.settingsCollapsed = { staff: true, reps: true, stores: true, orders_cfg: true, notify: true, recur: true, tools: true, account: true };
      render();
    };
  }

  // تحديث ومزامنة إصدار النظام فوراً ومسح الكاش
  if ($('force_refresh_app')) {
    $('force_refresh_app').onclick = async () => {
      $('force_refresh_app').disabled = true;
      $('force_refresh_app').textContent = 'جارٍ المزامنة والتحديث...';
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.update();
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const k of keys) await caches.delete(k);
        }
      } catch (e) {}
      location.reload(true);
    };
  }

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

  if ($('test_push')) {
    $('test_push').onclick = async () => {
      if (!('serviceWorker' in navigator)) return alert('المتصفح لا يدعم الإشعارات.');
      const reg = await navigator.serviceWorker.ready;
      alert('سيصلك الإشعار خلال 3 ثوانٍ.. اخرج من التطبيق الآن للشاشة الرئيسية لترى الإشعار.');
      setTimeout(() => { reg.showNotification('🔔 تذكير تجريبي', { body: 'النظام يعمل بنجاح تام.', icon: '/icon-192.png' }); }, 3000);
    };
  }

  if ($('svp')) {
    $('svp').onclick = async () => { 
      const v = $('np') ? $('np').value : ''; if (v.length < 6) return alert('6 أحرف على الأقل'); 
      $('svp').textContent = '...';
      const { error } = await sb.auth.updateUser({ password: v }); 
      alert(error ? error.message : 'تم التغيير.'); if ($('np')) $('np').value = ''; if ($('svp')) $('svp').textContent = 'حفظ التغيير';
    };
  }
  if ($('admin_wa_batch') && typeof waRemindDialog === 'function') {
    $('admin_wa_batch').onclick = () => waRemindDialog('', 'late');
  }
  document.querySelectorAll('[data-mwa]').forEach(b => b.onclick = () => {
    if (typeof waRemindDialog === 'function') waRemindDialog(b.dataset.mwa, 'late');
  });
  document.querySelectorAll('[data-mperms]').forEach(b => b.onclick = () => memberPermsDialog(b.dataset.mperms));
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

  document.querySelectorAll('[data-mpw]').forEach(b => b.onclick = async () => {
    const em = b.dataset.mpw;
    const all = (S.rawMembers || S.allMembers || S.members || []);
    const m = all.find(x => same(x.email, em));
    const gen = typeof genPw === 'function' ? genPw() : Math.random().toString(36).slice(-8);
    const w = prompt('تعيين كلمة مرور جديدة للموظف ' + (m ? m.name : '') + ':\n(اتركها فارغة للتوليد التلقائي: ' + gen + ')', gen);
    if (w === null) return;
    const pw = w.trim() || gen;
    if (pw.length < 6) return alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
    b.disabled = true;
    try {
      const rr = await apiPost('/api/rep-admin', JSON.stringify({ action: 'member_password', email: em, password: pw }));
      const j = await rr.json().catch(() => ({}));
      b.disabled = false;
      if (!rr.ok) return alert(j.error || 'تعذّر تعيين كلمة المرور');
      memberCredsDialog({
        name: (m && m.name) || j.name || 'الموظف',
        email: em,
        phone: (m && m.phone) || j.phone || '',
        password: pw,
        company: (m && parseMemberMeta(m).company) || j.company || 'متجرك',
        role: (m && m.role) || 'member',
        department: (m && parseMemberMeta(m).department) || ''
      });
    } catch (e) {
      b.disabled = false;
      alert('تعذّر الاتصال بخادم الحسابات');
    }
  });

  if ($('npw_g')) {
    $('npw_g').onclick = () => {
      const g = typeof genPw === 'function' ? genPw() : Math.random().toString(36).slice(-8);
      if ($('npw')) $('npw').value = g;
    };
  }

  if ($('addm')) $('addm').onclick = async () => {
    const n = $('nn') ? $('nn').value.trim() : '';
    const ph = $('nph') ? $('nph').value.trim() : '';
    const e = $('ne') ? $('ne').value.trim() : '';
    const pw = $('npw') ? $('npw').value.trim() : '';
    const co = $('nco') ? $('nco').value : activeCompanyFilter();
    const dep = $('ndep') ? $('ndep').value : '';
    const title = $('ntitle') && $('ntitle').value.trim() ? $('ntitle').value.trim() : null;
    const role = $('nr') ? $('nr').value : 'member';

    if (n.length < 2) return alert('الرجاء كتابة اسم الموظف.');
    if (!ph && !e) return alert('الرجاء إدخال رقم الجوال للدخول (أو البريد الإلكتروني).');

    $('addm').disabled = true;
    $('addm').textContent = 'جارٍ إنشاء الحساب...';

    try {
      const rr = await apiPost('/api/rep-admin', JSON.stringify({
        action: 'create_member',
        name: n,
        phone: ph,
        email: e,
        password: pw,
        company: co || 'متجرك',
        department: dep || '',
        title: title || '',
        role: role
      }));
      const j = await rr.json().catch(() => ({}));
      $('addm').disabled = false;
      $('addm').textContent = '➕ إنشاء حساب الموظف';

      if (!rr.ok) return alert(j.error || ('تعذّر إنشاء الحساب (' + rr.status + ')'));

      // تفريغ الحقول بعد النجاح
      if ($('nn')) $('nn').value = '';
      if ($('nph')) $('nph').value = '';
      if ($('ne')) $('ne').value = '';
      if ($('npw')) $('npw').value = '';
      if ($('ntitle')) $('ntitle').value = '';

      await load();
      memberCredsDialog(j);
    } catch (e) {
      $('addm').disabled = false;
      $('addm').textContent = '➕ إنشاء حساب الموظف';
      alert('تعذّر الاتصال بخادم الحسابات');
    }
  };
}

function memberCredsDialog(res) {
  if (!res) return;
  const storeTitle = res.company && res.company !== '__all' ? (getCompanyProfile(res.company).displayName || res.company) : (typeof bn === 'function' ? bn() : BRAND.name);
  const localPh = res.phone ? (String(res.phone).startsWith('967') ? String(res.phone).slice(3) : res.phone) : '';
  const loginId = localPh || res.loginIdentifier || res.email;
  const roleName = res.role === 'admin' ? 'مدير' : (res.role === 'rep' ? 'مندوب توصيل' : 'عضو في الفريق');
  
  const msg = [
    'مرحباً بك أستاذ/ة *' + res.name + '* 👋',
    'تم إنشاء وتفعيل حسابك في نظام إدارة العمليات (*' + storeTitle + '*):',
    '🌐 رابط النظام: ' + location.origin,
    '👤 اسم الدخول / رقم الجوال: ' + loginId,
    '🔑 كلمة المرور: ' + res.password,
    (res.department ? '🏛️ الإدارة: ' + res.department : ''),
    '📋 الصلاحية: ' + roleName,
    '',
    '(يمكنك الدخول مباشرة برقم جوالك ' + (localPh || loginId) + ' أو بريدك مع كلمة المرور أعلاه، ثم تفعيل الإشعارات فور الدخول).'
  ].filter(Boolean).join('\n');

  dlg.innerHTML = '<div style="text-align:center;margin-bottom:12px">' +
    '<div style="font-size:36px;margin-bottom:4px">🎉</div>' +
    '<h2 style="margin:0;color:var(--ok)">بيانات دخول الموظف جاهزة!</h2>' +
    '<p class="m" style="margin-top:4px">تم إنشاء حساب الدخول وتعيين كلمة المرور بنجاح.</p>' +
  '</div>' +
  '<div class="card" style="background:var(--col);border:1px solid var(--line);margin-bottom:14px;padding:12px 14px">' +
    '<div class="bar" style="margin-bottom:6px"><b>👤 ' + esc(res.name) + '</b> <span class="chip ok">' + esc(roleName) + '</span></div>' +
    '<div style="font-size:13px;color:var(--mute);margin-bottom:8px">🏢 المتجر: <b>' + esc(storeTitle) + '</b>' + (res.department ? ' · 🏛️ ' + esc(res.department) : '') + '</div>' +
    '<div style="background:var(--bg);padding:10px 12px;border-radius:10px;border:1px solid var(--line)">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px"><span>اسم المستخدم للدخول:</span><b dir="ltr">' + esc(loginId) + '</b></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px"><span>كلمة المرور:</span><b dir="ltr" style="font-size:15px;color:var(--gold);background:var(--card);padding:2px 8px;border-radius:6px;border:1px solid var(--line)">' + esc(res.password) + '</b></div>' +
    '</div>' +
  '</div>' +
  '<div style="font-size:12.5px;font-weight:700;margin-bottom:6px">📲 نص الرسالة الترحيبية الجاهزة للموظف:</div>' +
  '<pre class="msgp" style="max-height:160px;overflow-y:auto;white-space:pre-wrap;font-size:12.5px;margin-bottom:12px">' + esc(msg) + '</pre>' +
  '<div class="row dact" style="gap:8px">' +
    '<button class="s" id="mcr_cp" type="button" style="flex:1">📋 نسخ البيانات</button>' +
    (res.phone ? '<button class="p s" id="mcr_wa" type="button" style="flex:1;background:#15803d;border-color:#15803d">📲 إرسال عبر واتساب</button>' : '') +
    '<button class="s" id="mcr_x" type="button">إغلاق</button>' +
  '</div>';

  $('mcr_x').onclick = () => dlg.close();
  $('mcr_cp').onclick = async () => {
    try {
      await navigator.clipboard.writeText(msg);
      $('mcr_cp').textContent = 'تم النسخ ✓';
      if (typeof toast === 'function') toast('تم نسخ بيانات الدخول ✓');
    } catch (e) { alert('تعذّر النسخ'); }
  };
  if ($('mcr_wa')) {
    $('mcr_wa').onclick = () => {
      const ph = typeof waPhone === 'function' ? waPhone(res.phone) : res.phone;
      window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(msg), '_blank');
    };
  }
  dlg.showModal();
}
