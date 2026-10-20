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
  return '<div class="card org-card"><h2>🏢 إدارة الشركات والإدارات (عزل البيانات والأقسام)</h2>' +
    '<p class="m" style="margin-bottom:12px">أضف الشركات لعزل بيانات كل شركة وموظفيها وطلباتها ومهامها بشكل مستقل تماماً، وحدد الإدارات والأقسام لتوزيع المهام عليها بضغطة واحدة.</p>' +
    ( !myCo ? '<div class="org-sec"><div class="bar" style="margin-bottom:8px"><b>🏢 الشركات والفروع (' + cos.length + ')</b>' +
      (curCo ? '<span class="co-tag">المعروض حالياً: ' + esc(curCo) + ' <button class="s" id="co_reset" style="padding:2px 8px;font-size:12px">عرض الكل</button></span>' : '<span class="m">وضع المدير العام: ترى كل الشركات</span>') + '</div>' +
      (cos.length ? '<div class="org-tags">' + cos.map(c => {
        const cnt = allM.filter(m => same(parseMemberMeta(m).company, c)).length;
        return '<div class="org-tag' + (same(curCo, c) ? ' on' : '') + '"><span data-cosw="' + esc(c) + '" style="cursor:pointer" title="اضغط لمعاينة هذه الشركة">🏢 <b>' + esc(c) + '</b> <small>(' + cnt + ' موظف)</small></span><button class="s dng" data-corm="' + esc(c) + '" title="حذف الشركة">✕</button></div>';
      }).join('') + '</div>' : '<div class="m" style="margin-bottom:8px">لم تُضف شركات بعد (جميع الموظفين في بيئة واحدة حالياً).</div>') +
      '<div class="row" style="margin-top:8px"><input id="co_in" placeholder="اسم الشركة الجديدة (مثال: الشركة الأولى للتجارة)"><button class="p s" id="co_add" type="button">＋ إضافة شركة</button></div></div><hr style="border:0;border-top:1px solid var(--line);margin:14px 0">' : '' ) +
    '<div class="org-sec"><div class="bar" style="margin-bottom:8px"><b>🏛️ الإدارات والأقسام (' + deps.length + ')</b>' +
      (!deps.length ? '<button class="s" id="dep_seed" type="button" style="font-size:12px">⚡ إضافة أقسام افتراضية</button>' : '') + '</div>' +
      (deps.length ? '<div class="org-tags">' + deps.map(d => {
        const cnt = (S.members || []).filter(m => same(parseMemberMeta(m).department, d)).length;
        return '<div class="org-tag"><span>🏛️ <b>' + esc(d) + '</b> <small>(' + cnt + ' موظف)</small></span><button class="s dng" data-deprm="' + esc(d) + '" title="حذف القسم">✕</button></div>';
      }).join('') + '</div>' : '<div class="m" style="margin-bottom:8px">لم تُضف إدارات/أقسام بعد. أضف أقسامك لتتمكن من إسناد المهام لقسم كامل.</div>') +
      '<div class="row" style="margin-top:8px"><input id="dep_in" placeholder="اسم الإدارة أو القسم (مثال: إدارة المبيعات، قسم التسويق، المحاسبة)"><button class="p s" id="dep_add" type="button">＋ إضافة إدارة / قسم</button></div></div></div>';
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
    const myCo = parseMemberMeta(S.me).company;
    const listMembers = myCo ? S.members : (S.rawMembers || S.allMembers || S.members).filter(m => m.role !== 'rep');
    let memList = listMembers.map(m => {
        const meta = parseMemberMeta(m);
        let rmBtn = (S.me && same(m.email, S.me.email)) ? '' : '<button class="dng s" data-rm="' + esc(m.email) + '">إزالة</button>';
        const coOpts = (myCo ? [myCo] : [''].concat(cos)).map(c => '<option value="' + esc(c) + '"' + (same(meta.company, c) ? ' selected' : '') + '>' + (c ? '🏢 ' + esc(c) : '🌐 كل الشركات (عام)') + '</option>').join('');
        const depSet = new Set(deps); if (meta.department) depSet.add(meta.department);
        const depOpts = '<option value="">-- بدون إدارة/قسم --</option>' + [...depSet].map(d => '<option value="' + esc(d) + '"' + (same(meta.department, d) ? ' selected' : '') + '>🏛️ ' + esc(d) + '</option>').join('');
        return '<div class="bar mem-row" style="background:var(--col);padding:10px 12px;border-radius:10px;margin-bottom:8px"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b>' + esc(m.name) + '</b> <span class="m" dir="ltr">(' + esc(m.email) + ')</span> <span class="chip' + (m.role === 'rep' ? ' pr-chip important' : m.role === 'admin' ? ' all' : '') + '">' + ({ admin: 'مدير', rep: '🛵 مندوب', member: 'عضو' }[m.role] || 'عضو') + '</span>' +
          (meta.company ? '<span class="chip">🏢 ' + esc(meta.company) + '</span>' : '') +
          (meta.department ? '<span class="chip">🏛️ ' + esc(meta.department) + '</span>' : '') +
          '</div><div class="row" style="flex:1 1 100%;margin-top:8px;gap:6px">' +
          '<input data-mt="' + esc(m.email) + '" value="' + esc(m.title || '') + '" placeholder="المسمى الوظيفي (مثال: مسؤول التسويق)" style="flex:2 1 150px">' +
          '<select data-mco="' + esc(m.email) + '" title="الشركة" style="flex:1 1 130px">' + coOpts + '</select>' +
          '<select data-mdep="' + esc(m.email) + '" title="الإدارة / القسم" style="flex:1 1 130px">' + depOpts + '</select>' +
          '<select data-mrole="' + esc(m.email) + '" title="الصلاحية" style="flex:0 1 105px"><option value="member"' + (m.role !== 'admin' ? ' selected' : '') + '>👤 عضو</option><option value="admin"' + (m.role === 'admin' ? ' selected' : '') + '>👑 مدير</option></select>' +
          '<button class="s p" data-mts="' + esc(m.email) + '">حفظ المسمى</button>' + rmBtn + '</div></div>';
    }).join('');
    
    let optDeps = deps.map(d => '<option value="__dep:' + esc(d) + '">🏛️ قسم: ' + esc(d) + '</option>').join('');
    let optMembers = '<option value="">-- اختر الموظف أو القسم --</option>' + optDeps + S.members.map(m => '<option value="' + esc(m.email) + '">' + esc(m.name) + (memberDept(m.email) ? ' (' + esc(memberDept(m.email)) + ')' : '') + '</option>').join('');
    const newCoOpts = (myCo ? [myCo] : [''].concat(cos)).map(c => '<option value="' + esc(c) + '"' + (same(activeCompanyFilter(), c) ? ' selected' : '') + '>' + (c ? '🏢 ' + esc(c) : '🌐 كل الشركات (عام)') + '</option>').join('');
    const newDepOpts = '<option value="">-- الإدارة / القسم (اختياري) --</option>' + deps.map(d => '<option value="' + esc(d) + '">🏛️ ' + esc(d) + '</option>').join('');

    adminHtml = orgSettingsHtml() +
      '<div class="card" style="border-color:var(--accsoft)"><h2>👑 إدارة الأعضاء والتنبيهات والصلاحيات</h2>' +
      '<button class="p" id="admin_remind" style="width:100%;margin-bottom:16px;background:var(--soon);border-color:var(--soon)">إرسال تذكير شامل للفريق 🔔</button>' +
      '<h3 style="font-size:14px;margin-top:16px;color:var(--acc)">إرسال إشعار مخصص لموظف أو إدارة:</h3>' +
      '<div class="row" style="margin-bottom:8px"><select id="ping_to"><option value="__all">👥 الكل (جميع الأعضاء)</option>' + optMembers + '</select></div>' +
      '<div class="row" style="margin-bottom:8px"><input id="ping_msg" placeholder="اكتب رسالة التنبيه (اختياري)..."></div>' +
      '<div class="row" style="margin-bottom:16px;justify-content:flex-start;gap:8px;"><input type="checkbox" id="ping_tasks" style="width:auto;margin:0" checked> <label for="ping_tasks" style="font-size:13px;cursor:pointer">تضمين تذكير بالمهام غير المنجزة (لكل شخص مهامه هو)</label></div>' +
      '<div class="row" style="margin-bottom:16px"><button class="p s" id="send_ping">إرسال الإشعار للموظف 🔔</button></div>' +
      '<hr style="border:0;border-top:1px solid var(--line);margin:16px 0">' +
      memList + 
      '<h3 style="font-size:14px;margin-top:16px">إضافة عضو / مستخدم جديد وتحديد شركته وإدارته:</h3>' +
      '<div class="row" style="gap:6px"><input id="nn" placeholder="اسم العضو" style="flex:1 1 140px"><input id="ne" dir="ltr" placeholder="البريد الإلكتروني" style="flex:1 1 170px"><input id="ntitle" placeholder="المسمى الوظيفي (اختياري)" style="flex:1 1 140px"></div>' +
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
                  await Promise.all(targets.map(m => apiPost('/api/notify', JSON.stringify({ title: 'تنبيه إداري (' + dep + ') 🔔', body: msg, assignee_email: m.email, for_all: false, is_custom: true, include_tasks: includeTasks }))));
                  alert('تم إرسال الإشعار إلى ' + targets.length + ' موظف في «' + dep + '» ✅');
                  $('ping_msg').value = '';
              } else {
                  const all = to === '__all';
                  const rr = await apiPost('/api/notify', JSON.stringify({ title: 'تنبيه إداري 🔔', body: msg, assignee_email: all ? undefined : to, for_all: all, is_custom: true, include_tasks: includeTasks }));
                  const j = await rr.json().catch(() => ({}));
                  alert(rr.ok ? 'تم الإرسال ✅ وحُفظ في صندوق ' + (j.stored || 0) + ' عضو، ووصل إشعار الجوال إلى ' + (j.sent || 0) + ' جهاز.\nمن لم يصله إشعار الجوال سيرى التنبيه فور فتحه التطبيق.' : 'تعذّر الإرسال (' + (j.error || rr.status) + ')');
                  if (rr.ok) $('ping_msg').value = '';
              }
          } catch(e) {}
          $('send_ping').disabled = false; $('send_ping').textContent = 'إرسال الإشعار للموظف 🔔';
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
  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { if (confirm('إزالة العضو نهائياً؟')) run(sb.from('members').delete().eq('email', b.dataset.rm)); });
  if ($('addm')) $('addm').onclick = () => {
    const e = $('ne').value.trim(), n = $('nn').value.trim();
    if (!e || !n) return alert('الرجاء كتابة الاسم والبريد الإلكتروني.');
    const co = $('nco') ? $('nco').value : activeCompanyFilter();
    const dep = $('ndep') ? $('ndep').value : '';
    const title = $('ntitle') && $('ntitle').value.trim() ? $('ntitle').value.trim() : null;
    const row = { email: e, name: n, role: $('nr') ? $('nr').value : 'member' };
    if (title) row.title = title;
    const metaStr = encodeMemberMeta(co, dep);
    if (metaStr) row.telegram_chat_id = metaStr;
    run(sb.from('members').insert(row));
  };
}
