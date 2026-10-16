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
  
function settingsView() {
  let adminHtml = '';
  if (isAdmin()) {
    let memList = S.members.map(m => {
        let rmBtn = (S.me && same(m.email, S.me.email)) ? '' : '<button class="dng s" data-rm="' + esc(m.email) + '">إزالة</button>';
        return '<div class="bar" style="background:var(--col);padding:8px 12px;border-radius:8px;margin-bottom:6px"><div><b>' + esc(m.name) + '</b> <span class="m" dir="ltr">(' + esc(m.email) + ')</span></div>' + rmBtn + '</div>';
    }).join('');
    
    let optMembers = '<option value="">-- اختر الموظف --</option>' + S.members.map(m => '<option value="' + esc(m.email) + '">' + esc(m.name) + '</option>').join('');

    adminHtml = '<div class="card" style="border-color:var(--accsoft)"><h2>👑 إدارة الأعضاء والتنبيهات</h2>' +
      '<button class="p" id="admin_remind" style="width:100%;margin-bottom:16px;background:var(--soon);border-color:var(--soon)">إرسال تذكير شامل للفريق 🔔</button>' +
      '<h3 style="font-size:14px;margin-top:16px;color:var(--acc)">إرسال إشعار مخصص لموظف:</h3>' +
      '<div class="row" style="margin-bottom:8px"><select id="ping_to">' + optMembers + '</select></div>' +
      '<div class="row" style="margin-bottom:8px"><input id="ping_msg" placeholder="اكتب رسالة التنبيه (اختياري)..."></div>' +
      '<div class="row" style="margin-bottom:16px;justify-content:flex-start;gap:8px;"><input type="checkbox" id="ping_tasks" style="width:auto;margin:0" checked> <label for="ping_tasks" style="font-size:13px;cursor:pointer">تضمين تذكير بمهامه غير المنجزة</label></div>' +
      '<div class="row" style="margin-bottom:16px"><button class="p s" id="send_ping">إرسال الإشعار للموظف 🔔</button></div>' +
      '<hr style="border:0;border-top:1px solid var(--line);margin:16px 0">' +
      memList + 
      '<h3 style="font-size:14px;margin-top:16px">إضافة عضو:</h3><div class="row"><input id="nn" placeholder="اسم العضو"><input id="ne" dir="ltr" placeholder="البريد الإلكتروني"><button class="p s" id="addm">إضافة للفريق</button></div></div>';
  }

  return '<div class="card" style="border-color:var(--oksoft)">' +
    '<h2>🔔 إعدادات الإشعارات</h2>' +
    '<p class="m" style="margin-bottom:10px;font-size:13px">الإشعارات تعمل تلقائياً في الخلفية. يمكنك اختبارها من هنا:</p>' +
    '<div class="row"><button class="s" id="test_push" style="background:var(--soon);border-color:var(--soon);color:#fff">تجربة وصول الإشعار في جوالي 🔔</button></div>' +
  '</div>' +
  '<div class="card"><h2>تغيير كلمة المرور</h2><div class="row"><input id="np" type="password" dir="ltr" placeholder="6 أحرف على الأقل"><button class="s" id="svp">حفظ التغيير</button></div></div>' +
  adminHtml + recurHtml() + toolsHtml() +
  '<div class="card" style="background:var(--latesoft);border-color:var(--latesoft);text-align:center"><button class="dng" id="out" style="background:transparent;width:100%;padding:10px">تسجيل الخروج الآمن</button></div>';
}

function bindSettings() {
  $('out').onclick = logout;
  bindRecur();
  bindTools();

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

          if (!to) return alert('الرجاء اختيار الموظف أولاً.');
          if (!msg && !includeTasks) return alert('يجب كتابة رسالة أو اختيار تضمين المهام.');
          
          $('send_ping').disabled = true; $('send_ping').textContent = '...';
          
          // تجميع نص الإشعار
          let finalBody = msg;
          if (includeTasks) {
              const userTasks = S.tasks.filter(t => t.assignee_email === to && t.status !== 'done');
              if (userTasks.length > 0) {
                  const tasksList = userTasks.map(t => '🔸 ' + t.title).join('\n');
                  finalBody += (finalBody ? '\n\n' : '') + 'المهام المفتوحة لديك:\n' + tasksList;
              } else {
                  finalBody += (finalBody ? '\n\n' : '') + '(ليس لديك أي مهام مفتوحة حالياً)';
              }
          }

          try {
              await apiPost('/api/notify', JSON.stringify({ title: 'تنبيه إداري 🔔', body: finalBody, assignee_email: to, for_all: false, sender_name: S.me.name, is_custom: true }));
              alert('تم إرسال الإشعار بنجاح.');
              $('ping_msg').value = '';
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
  document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { if (confirm('إزالة العضو نهائياً؟')) run(sb.from('members').delete().eq('email', b.dataset.rm)); });
  if ($('addm')) $('addm').onclick = () => { const e = $('ne').value.trim(), n = $('nn').value.trim(); if (e && n) run(sb.from('members').insert({ email: e, name: n })); };
}
