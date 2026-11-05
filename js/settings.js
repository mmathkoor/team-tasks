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
  const myCo = parseMemberMeta(S.me).company;
  const curCo = activeCompanyFilter();
  return '<div class="card org-card"><h2>🏢 إدارة الشركات والأقسام</h2>' +
    '<p class="m" style="margin-bottom:12px">أضف الشركات لعزل بيانات كل شركة وموظفيها وطلباتها ومهامها بشكل مستقل تماماً، وحدد الأقسام لتوزيع المهام عليها بضغطة واحدة.</p>' +
    ( !myCo ? '<div class="org-sec"><div class="bar" style="margin-bottom:8px"><b>🏢 الشركات والفروع (' + cos.length + ')</b>' +
      (curCo ? '<span class="co-tag">المعروض حالياً: ' + esc(curCo) + ' <button class="s" id="co_reset" style="padding:2px 8px;font-size:12px">عرض الكل</button></span>' : '<span class="m">وضع المدير العام: ترى كل الشركات</span>') + '</div>' +
      (cos.length ? '<div class="org-tags">' + cos.map(c => {
        const cnt = allM.filter(m => same(parseMemberMeta(m).company, c)).length;
        return '<div class="org-tag' + (same(curCo, c) ? ' on' : '') + '"><span data-cosw="' + esc(c) + '" style="cursor:pointer" title="اضغط لمعاينة هذه الشركة">🏢 <b>' + esc(c) + '</b> <small>(' + cnt + ' موظف)</small></span><button class="s dng" data-corm="' + esc(c) + '" title="حذف الشركة">✕</button></div>';
      }).join('') + '</div>' : '<div class="m" style="margin-bottom:8px">لم تُضف شركات بعد (جميع الموظفين في بيئة واحدة حالياً).</div>') +
      '<div class="row" style="margin-top:8px"><input id="co_in" placeholder="اسم الشركة الجديدة (مثال: الشركة الأولى للتجارة)"><button class="p s" id="co_add" type="button">＋ إضافة شركة</button></div></div><hr style="border:0;border-top:1px solid var(--line);margin:14px 0">' : '' ) +
    '<div class="org-sec"><div class="bar" style="margin-bottom:8px"><b>📂 الإدارات والأقسام (' + deps.length + ')</b>' +
      (!deps.length ? '<button class="s" id="dep_seed" type="button" style="font-size:12px">⚡ إضافة أقسام افتراضية</button>' : '') + '</div>' +
      (deps.length ? '<div class="org-tags">' + deps.map(d => {
        const cnt = (S.members || []).filter(m => same(parseMemberMeta(m).department, d)).length;
        return '<div class="org-tag"><span>📂 <b>' + esc(d) + '</b> <small>(' + cnt + ' موظف)</small></span><button class="s dng" data-deprm="' + esc(d) + '" title="حذف القسم">✕</button></div>';
      }).join('') + '</div>' : '<div class="m" style="margin-bottom:8px">لم تُضف إدارات/أقسام بعد. أضف أقسامك لتتمكن من إسناد المهام لقسم كامل.</div>') +
      '<div class="row" style="margin-top:8px"><input id="dep_in" placeholder="اسم الإدارة أو القسم (مثال: المبيعات، التسويق، المالية)"><button class="p s" id="dep_add" type="button">＋ إضافة قسم</button></div></div></div>';
}

function bioSettingsHtml() {
  const bio = typeof getBioMeta === 'function' ? getBioMeta() : null;
  const sup = typeof bioSupported === 'function' && bioSupported();
  return '<div class="card">' +
    '<h2>👆 الدخول السريع بالبصمة وحفظ الجلسة</h2>' +
    '<p class="m" style="margin-bottom:10px;font-size:13px">يبقى حسابك مسجلاً تلقائياً دون الحاجة لإعادة كتابة كلمة المرور في كل مرة، ويمكنك ربط بصمة الإصبع أو الوجه للدخول الفوري.</p>' +
    '<div class="row" style="align-items:center">' +
      (sup ? '<button class="p s" id="bio_reg" type="button">' + (bio ? '🔄 تحديث البصمة المحفوظة' : '👆 تفعيل الدخول بالبصمة / الوجه') + '</button>' : '<span class="m">متصفحك الحالي يحفظ الجلسة تلقائياً</span>') +
      (bio ? '<span class="chip ok">✓ البصمة مفعّلة (' + esc(bio.name || '') + ')</span><button class="dng s" id="bio_clr" type="button">إلغاء البصمة</button>' : '') +
    '</div>' +
  '</div>';
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

function normalizeStaffPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('967') && d.length === 12) return d;
  if (d.length === 9 && d[0] === '7') return '967' + d;
  if (d.length === 10 && d[0] === '0') return '967' + d.slice(1);
  return d;
}

function settingsView() {
  let adminHtml = '';
  if (isAdmin()) {
    const cos = companiesList(), deps = departmentsList();
    const myCo = parseMemberMeta(S.me).company;
    const listMembers = myCo ? S.members : (S.rawMembers || S.allMembers || S.members).filter(m => m.role !== 'rep');
    let memList = listMembers.map(m => {
        const meta = parseMemberMeta(m);
        let rmBtn = (S.me && same(m.email, S.me.email)) ? '' : '<button class="dng s" data-rm="' + esc(m.email) + '">إزالة</button>';
        const coOpts = (myCo ? [myCo] : [''].concat(cos)).map(c => '<option value="' + esc(c) + '"' + (same(meta.company, c) ? ' selected' : '') + '>' + (c ? '🏢 ' + esc(c) : '🌐 كل الشركات (عام)') + '</option>').join('');
        const depSet = new Set(deps); if (meta.department) depSet.add(meta.department);
        const depOpts = '<option value="">-- بدون إدارة/قسم --</option>' + [...depSet].map(d => '<option value="' + esc(d) + '"' + (same(meta.department, d) ? ' selected' : '') + '>📂 ' + esc(d) + '</option>').join('');
        const dispPhone = m.phone || (String(m.email || '').includes('@rep.') ? String(m.email).split('@')[0] : '');
        return '<div class="mem-card" style="background:var(--col);padding:12px 14px;border-radius:12px;margin-bottom:10px;border:1px solid var(--line)">' +
          '<div class="bar" style="margin-bottom:8px"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
            '<b style="font-size:15px">' + esc(m.name) + '</b> ' +
            '<span class="chip' + (m.role === 'rep' ? ' pr-chip important' : m.role === 'admin' ? ' all' : '') + '">' + ({ admin: '👑 مدير', rep: '🛵 مندوب', member: '👤 عضو' }[m.role] || 'عضو') + '</span>' +
            (meta.company ? '<span class="chip">🏢 ' + esc(meta.company) + '</span>' : '<span class="chip">🌐 عام</span>') +
            (meta.department ? '<span class="chip">📂 ' + esc(meta.department) + '</span>' : '') +
            (dispPhone ? '<span class="chip" dir="ltr">📱 ' + esc(dispPhone) + '</span>' : '<span class="m" dir="ltr">(' + esc(m.email) + ')</span>') +
          '</div>' +
          '<div class="row s" style="gap:6px">' +
            '<button class="s" data-mpw="' + esc(m.email) + '" type="button">🔑 كلمة المرور</button>' +
            (dispPhone ? '<a class="btnl" target="_blank" rel="noopener" href="https://wa.me/' + (typeof waPhone === 'function' ? waPhone(dispPhone) : dispPhone) + '" style="font-size:12.5px;padding:5px 10px">📲 واتساب</a>' : '') +
            rmBtn +
          '</div></div>' +
          '<div class="row" style="gap:6px">' +
            '<input data-mt="' + esc(m.email) + '" value="' + esc(m.title || '') + '" placeholder="المسمى الوظيفي (مثال: محاسب / مبيعات)" style="flex:2 1 140px">' +
            '<select data-mco="' + esc(m.email) + '" title="الشركة" style="flex:1 1 125px">' + coOpts + '</select>' +
            '<select data-mdep="' + esc(m.email) + '" title="الإدارة / القسم" style="flex:1 1 125px">' + depOpts + '</select>' +
            '<select data-mrole="' + esc(m.email) + '" title="الصلاحية" style="flex:0 1 105px"><option value="member"' + (m.role !== 'admin' ? ' selected' : '') + '>👤 عضو</option><option value="admin"' + (m.role === 'admin' ? ' selected' : '') + '>👑 مدير</option></select>' +
            '<button class="s p" data-mts="' + esc(m.email) + '">حفظ التعديل</button>' +
          '</div></div>';
    }).join('');
    
    let optDeps = deps.map(d => '<option value="__dep:' + esc(d) + '">📂 قسم: ' + esc(d) + '</option>').join('');
    let optMembers = '<option value="">-- اختر الموظف أو القسم --</option>' + optDeps + S.members.map(m => '<option value="' + esc(m.email) + '">' + esc(m.name) + (memberDept(m.email) ? ' (' + esc(memberDept(m.email)) + ')' : '') + '</option>').join('');
    const newCoOpts = (myCo ? [myCo] : [''].concat(cos)).map(c => '<option value="' + esc(c) + '"' + (same(activeCompanyFilter(), c) ? ' selected' : '') + '>' + (c ? '🏢 ' + esc(c) : '🌐 كل الشركات (عام)') + '</option>').join('');
    const newDepOpts = '<option value="">-- الإدارة / القسم (اختياري) --</option>' + deps.map(d => '<option value="' + esc(d) + '">📂 ' + esc(d) + '</option>').join('');

    adminHtml = orgSettingsHtml() +
      '<div class="card"><h2>👑 إدارة الأعضاء والتنبيهات والصلاحيات</h2>' +
      '<button class="p" id="admin_remind" style="width:100%;margin-bottom:16px;background:var(--soon);border-color:var(--soon);color:#fff">إرسال تذكير شامل للفريق 🔔</button>' +
      '<h3 style="font-size:14px;margin-top:12px;color:var(--acc)">إرسال تنبيه فوري لموظف أو قسم:</h3>' +
      '<div class="row" style="margin-bottom:8px"><select id="ping_to"><option value="__all">👥 الكل (جميع الأعضاء)</option>' + optMembers + '</select></div>' +
      '<div class="row" style="margin-bottom:8px"><input id="ping_msg" placeholder="اكتب رسالة التنبيه (اختياري)..."></div>' +
      '<div class="row" style="margin-bottom:14px;justify-content:flex-start;gap:8px;"><input type="checkbox" id="ping_tasks" style="width:auto;margin:0" checked> <label for="ping_tasks" style="font-size:13px;cursor:pointer">تضمين تذكير بالمهام غير المنجزة (لكل شخص مهامه هو)</label></div>' +
      '<div class="row" style="margin-bottom:16px"><button class="p s" id="send_ping">إرسال الإشعار للموظف 🔔</button></div>' +
      '<hr style="border:0;border-top:1px solid var(--line);margin:16px 0">' +
      memList + 
      '<div style="background:var(--col);padding:14px;border-radius:12px;border:1px solid var(--line);margin-top:14px">' +
      '<h3 style="font-size:14.5px;margin:0 0 10px">➕ إضافة عضو / موظف جديد (برقم الجوال أو البريد الإلكتروني):</h3>' +
      '<div class="row" style="gap:8px">' +
        '<input id="nn" placeholder="اسم الموظف" style="flex:1 1 150px">' +
        '<input id="nph" dir="ltr" inputmode="tel" placeholder="📱 رقم الجوال (للدخول بالجوال)" style="flex:1 1 150px">' +
        '<input id="ne" dir="ltr" placeholder="✉️ البريد الإلكتروني (اختياري)" style="flex:1 1 160px">' +
      '</div>' +
      '<div class="row" style="margin-top:8px;gap:8px">' +
        '<input id="npw" dir="ltr" placeholder="🔑 كلمة المرور (6 أحرف+)" style="flex:1 1 150px">' +
        '<button class="s" id="npw_g" type="button">🎲 توليد كلمة مرور</button>' +
        '<input id="ntitle" placeholder="المسمى الوظيفي (اختياري)" style="flex:1 1 150px">' +
      '</div>' +
      '<div class="row" style="margin-top:8px;gap:8px">' +
        '<select id="nco" style="flex:1 1 140px">' + newCoOpts + '</select>' +
        '<select id="ndep" style="flex:1 1 140px">' + newDepOpts + '</select>' +
        '<select id="nr" style="flex:0 1 130px"><option value="member">👤 عضو</option><option value="admin">👑 مدير</option><option value="rep">🛵 مندوب توصيل</option></select>' +
        '<button class="p s" id="addm" type="button">＋ إنشاء حساب الموظف</button>' +
      '</div></div></div>';
  }

  return bioSettingsHtml() +
    '<div class="card">' +
    '<h2>🔔 إعدادات الإشعارات والتنبيهات</h2>' +
    '<p class="m" style="margin-bottom:10px;font-size:13px">الإشعارات تعمل في شريط النظام العلوي وداخل التطبيق مع نغمة تنبيه:</p>' +
    '<div class="row"><button class="p s" id="enable_push_btn" type="button">🔔 تفعيل إشعارات النظام</button><button class="s" id="test_push" type="button">تجربة وصول إشعار على جوالي 🔔</button></div>' +
  '</div>' +
  '<div class="card"><h2>🔑 تغيير كلمة المرور الخاصة بي</h2><div class="row"><input id="np" type="password" dir="ltr" placeholder="6 أحرف على الأقل"><button class="p s" id="svp">حفظ التغيير</button></div></div>' +
  alertSettingsHtml() + adminHtml + (isAdmin() ? repsCardHtml() + ordSettingsHtml() + vercelGuideHtml() : '') + recurHtml() + toolsHtml() +
  '<div class="card" style="background:var(--latesoft);border-color:var(--latesoft);text-align:center"><button class="dng" id="out" style="background:transparent;width:100%;padding:10px">تسجيل الخروج الآمن</button></div>';
}

function bindSettings() {
  $('out').onclick = logout;
  bindRecur();
  bindAlertSettings();
  if (isAdmin()) bindOrdAdmin();
  bindTools();

  if ($('bio_reg')) {
    $('bio_reg').onclick = async () => {
      $('bio_reg').disabled = true;
      const r = await bioRegister(S.me && S.me.name);
      $('bio_reg').disabled = false;
      if (!r.ok) return alert(r.error);
      alert('تم تفعيل الدخول السريع بالبصمة على هذا الجهاز بنجاح ✅');
      render();
    };
  }
  if ($('bio_clr')) {
    $('bio_clr').onclick = async () => {
      try { localStorage.removeItem('sbs_bio'); } catch (e) {}
      if (typeof idbSet === 'function') await idbSet('sbs_bio', null);
      render();
    };
  }

  if ($('enable_push_btn')) {
    $('enable_push_btn').onclick = async () => {
      await autoEnablePush();
      alert(Notification.permission === 'granted' ? 'تم تفعيل إشعارات الجوال والنظام بنجاح ✅' : 'الرجاء السماح بالإشعارات من إعدادات المتصفح.');
    };
  }

  if ($('co_add')) {
    $('co_add').onclick = async () => {
      const v = $('co_in').value.trim(); if (!v) return $('co_in').focus();
      const cos = companiesList(); if (!cos.some(c => same(c, v))) cos.push(v);
      await persistOrgLists(cos, departmentsList());
      $('co_in').value = ''; render();
    };
  }
  document.querySelectorAll('[data-corm]').forEach(b => b.onclick = async () => {
    const c = b.dataset.corm;
    if (!confirm('حذف الشركة «' + c + '» من القائمة؟')) return;
    const cos = companiesList().filter(x => !same(x, c));
    if (same(S.activeCompany, c)) S.activeCompany = '';
    await persistOrgLists(cos, departmentsList());
    applyCompanyScope(); render();
  });
  document.querySelectorAll('[data-cosw]').forEach(b => b.onclick = () => {
    S.activeCompany = same(S.activeCompany, b.dataset.cosw) ? '' : b.dataset.cosw;
    applyCompanyScope(); render();
  });
  if ($('co_reset')) $('co_reset').onclick = () => { S.activeCompany = ''; applyCompanyScope(); render(); };

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
      const defaults = ['المبيعات', 'التسويق', 'المالية', 'العمليات', 'خدمة العملاء'];
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
        $('admin_remind').textContent = 'جاري إرسال التذكيرات...';
        try {
            const rr = await apiGet('/api/remind');
            alert(rr.ok ? 'تم إرسال تذكير شامل لجميع أعضاء الفريق!' : 'تعذّر الإرسال (' + rr.status + ')');
        } catch(e) {}
        $('admin_remind').textContent = 'إرسال تذكير شامل للفريق 🔔';
    };
  }

  if ($('send_ping')) {
      $('send_ping').onclick = async () => {
          const to = $('ping_to').value;
          const msg = $('ping_msg').value.trim();
          const includeTasks = $('ping_tasks').checked;

          if (!to) return alert('الرجاء اختيار الموظف أو القسم أولاً.');
          if (!msg && !includeTasks) return alert('يجب كتابة رسالة أو اختيار تضمين المهام.');
          
          $('send_ping').disabled = true; $('send_ping').textContent = '...';
          
          try {
              if (to.startsWith('__dep:')) {
                  const dep = to.slice(6);
                  const targets = S.members.filter(m => same(memberDept(m.email), dep));
                  if (!targets.length) { alert('لا يوجد موظفون في هذا القسم حالياً.'); $('send_ping').disabled = false; $('send_ping').textContent = 'إرسال الإشعار للموظف 🔔'; return; }
                  // إدراج في جدول notifications مباشرة لضمان وصوله اللحظي + استدعاء الخادم
                  const rows = targets.map(m => ({ recipient_email: m.email, title: 'تنبيه إداري (' + dep + ') 🔔', body: msg || 'لديك تذكير بمهامك المفتوحة' }));
                  await sb.from('notifications').insert(rows);
                  await Promise.all(targets.map(m => apiPost('/api/notify', JSON.stringify({ title: 'تنبيه إداري (' + dep + ') 🔔', body: msg, assignee_email: m.email, for_all: false, is_custom: true, include_tasks: includeTasks })).catch(() => {})));
                  alert('تم إرسال الإشعار إلى ' + targets.length + ' موظف في «' + dep + '» ✅');
                  $('ping_msg').value = '';
              } else {
                  const all = to === '__all';
                  const rr = await apiPost('/api/notify', JSON.stringify({ title: 'تنبيه إداري 🔔', body: msg, assignee_email: all ? undefined : to, for_all: all, is_custom: true, include_tasks: includeTasks }));
                  const j = await rr.json().catch(() => ({}));
                  if (!rr.ok) {
                      // ضمان الحفظ المباشر في جدول التنبيهات حتى لو تعذر WebPush
                      const rec = all ? S.members.filter(m => !same(m.email, S.me.email)) : S.members.filter(m => same(m.email, to));
                      if (rec.length) await sb.from('notifications').insert(rec.map(m => ({ recipient_email: m.email, title: 'تنبيه إداري 🔔', body: 'من ' + S.me.name + ': ' + (msg || 'يرجى مراجعة مهامك المفتوحة') })));
                      alert('تم إرسال التنبيه فوراً لصندوق التنبيهات والنافذة المنبثقة لدى المستلم ✅');
                  } else {
                      alert('تم الإرسال ✅ وحُفظ في صندوق ' + (j.stored || 1) + ' عضو، ووصل إشعار الجوال إلى ' + (j.sent || 0) + ' جهاز.');
                  }
                  $('ping_msg').value = '';
              }
          } catch(e) {}
          $('send_ping').disabled = false; $('send_ping').textContent = 'إرسال الإشعار للموظف 🔔';
      };
  }

  $('test_push').onclick = async () => {
    unlockAudio();
    showAlert({ title: '🔔 تنبيه تجريبي فوري', body: 'نظام التنبيهات الصوتي والمرئي يعمل بنجاح تام.' });
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (Notification.permission !== 'granted') await Notification.requestPermission();
        if (Notification.permission === 'granted') {
          reg.showNotification('🔔 إشعار النظام العلوي', { body: 'تعمل إشعارات شريط الجوال العلوي والنافذة المنبثقة معاً بنجاح.', icon: '/icon-192.png', badge: '/badge-96.png', vibrate: [300, 120, 300] });
        }
      } catch (e) {}
    }
  };

  $('svp').onclick = async () => { 
    const v = $('np').value; if (v.length < 6) return alert('6 أحرف على الأقل'); 
    $('svp').textContent = '...';
    const { error } = await sb.auth.updateUser({ password: v }); 
    alert(error ? error.message : 'تم التغيير بنجاح.'); $('np').value = ''; $('svp').textContent = 'حفظ التغيير';
  };

  document.querySelectorAll('[data-mts]').forEach(b => b.onclick = () => {
    const em = b.dataset.mts;
    const i = document.querySelector('[data-mt="' + em + '"]');
    const coEl = document.querySelector('[data-mco="' + em + '"]');
    const depEl = document.querySelector('[data-mdep="' + em + '"]');
    const roleEl = document.querySelector('[data-mrole="' + em + '"]');
    const m = (S.rawMembers || S.allMembers || S.members || []).find(x => same(x.email, em)) || {};
    const oldMeta = parseMemberMeta(m);
    const newCo = coEl ? coEl.value : oldMeta.company;
    const newDep = depEl ? depEl.value : oldMeta.department;
    const newRole = roleEl ? roleEl.value : m.role;
    const patch = { title: i ? (i.value.trim() || null) : null };
    if (newCo !== oldMeta.company || newDep !== oldMeta.department) patch.telegram_chat_id = encodeMemberMeta(newCo, newDep);
    if (newRole && newRole !== m.role) patch.role = newRole;
    run(sb.from('members').update(patch).eq('email', em));
  });

  document.querySelectorAll('[data-mpw]').forEach(b => b.onclick = async () => {
    const em = b.dataset.mpw;
    const m = (S.rawMembers || S.allMembers || S.members || []).find(x => same(x.email, em));
    const w = prompt('كلمة المرور الجديدة لـ ' + (m ? m.name : em) + ' (6 أحرف أو أكثر، اتركها فارغة للتوليد التلقائي):', '');
    if (w === null) return;
    const pw = w.trim() || genPw();
    if (pw.length < 6) return alert('كلمة المرور 6 أحرف على الأقل');
    const r = await repApi({ action: 'password', email: em, password: pw });
    if (!r.ok) return alert(r.error);
    if (m) credsDialog(m.name, m.phone || m.email, pw, m.role === 'admin' ? 'مدير' : 'موظف');
  });

  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { if (confirm('إزالة العضو نهائياً؟')) run(sb.from('members').delete().eq('email', b.dataset.rm)); });

  if ($('npw_g')) {
    $('npw_g').onclick = () => { if ($('npw')) $('npw').value = genPw(); };
  }

  if ($('addm')) $('addm').onclick = async () => {
    const n = $('nn').value.trim();
    const rawPhone = $('nph') ? $('nph').value.trim() : '';
    const normP = rawPhone ? normalizeStaffPhone(rawPhone) : '';
    const rawEmail = $('ne') ? $('ne').value.trim().toLowerCase() : '';
    const pw = $('npw') ? $('npw').value.trim() : '';
    const role = $('nr') ? $('nr').value : 'member';
    const co = $('nco') ? $('nco').value : activeCompanyFilter();
    const dep = $('ndep') ? $('ndep').value : '';
    const title = $('ntitle') && $('ntitle').value.trim() ? $('ntitle').value.trim() : null;
    const metaStr = encodeMemberMeta(co, dep);

    if (!n) return alert('الرجاء كتابة اسم الموظف.');
    if (!rawEmail && normP.length < 7) return alert('الرجاء كتابة رقم الجوال أو البريد الإلكتروني للموظف.');
    if (pw && pw.length < 6) return alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');

    const finalEmail = rawEmail || (normP + '@rep.local');
    const finalPw = pw || (normP ? genPw() : '');

    $('addm').disabled = true; $('addm').textContent = 'جارٍ الإنشاء...';

    // 1) المحاولة عبر نقطة النهاية الخلفية أولاً
    if (finalPw) {
      const apiRes = await repApi({
        action: 'create',
        name: n,
        phone: normP || undefined,
        email: finalEmail,
        password: finalPw,
        role,
        title,
        telegram_chat_id: metaStr
      });
      if (apiRes.ok) {
        $('addm').disabled = false; $('addm').textContent = '＋ إنشاء حساب الموظف';
        await load();
        credsDialog(n, normP || finalEmail, finalPw, role === 'admin' ? 'مدير' : role === 'rep' ? 'مندوب توصيل' : 'موظف');
        return;
      }
    }

    // 2) الإنشاء المباشر المضمون من المتصفح (يعمل دائماً حتى بدون service_role على Vercel)
    try {
      let authId = null;
      if (finalPw) {
        const sr = await fetch(API + '/auth/v1/signup', {
          method: 'POST',
          headers: { apikey: KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: finalEmail, password: finalPw, data: { name: n, phone: normP || undefined, role } })
        });
        const sj = await sr.json().catch(() => ({}));
        if (sr.ok && (sj.id || (sj.user && sj.user.id))) {
          authId = (sj.user && sj.user.id) || sj.id;
        }
      }

      const row = { email: finalEmail, name: n, role };
      if (normP) row.phone = normP;
      if (authId) row.auth_id = authId;
      if (title) row.title = title;
      if (metaStr) row.telegram_chat_id = metaStr;

      let { error } = await sb.from('members').upsert(row);
      if (error && /column .* does not exist/i.test(error.message)) {
        const fallbackRow = { email: finalEmail, name: n, role };
        if (title) fallbackRow.title = title;
        if (metaStr) fallbackRow.telegram_chat_id = metaStr;
        ({ error } = await sb.from('members').upsert(fallbackRow));
      }
      $('addm').disabled = false; $('addm').textContent = '＋ إنشاء حساب الموظف';
      if (error) return alert('تعذّر إضافة المستخدم: ' + error.message);
      await load();
      if (finalPw) credsDialog(n, normP || finalEmail, finalPw, role === 'admin' ? 'مدير' : role === 'rep' ? 'مندوب توصيل' : 'موظف');
    } catch (e) {
      $('addm').disabled = false; $('addm').textContent = '＋ إنشاء حساب الموظف';
      alert('تعذّر الاتصال: ' + e.message);
    }
  };
}
