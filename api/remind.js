const webpush = require('web-push');
const { supabase, member, isCron } = require('../lib/auth');

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';

if (publicVapidKey && privateVapidKey) {
  webpush.setVapidDetails(
    'mailto:admin@matjark.com',
    publicVapidKey,
    privateVapidKey
  );
}

module.exports = async (req, res) => {
  const cronCall = isCron(req);
  const me = cronCall ? null : await member(req);
  if (!cronCall && !me) {
    return res.status(401).json({ error: 'unauthorized — سجّل الدخول أو اضبط CRON_SECRET' });
  }
  if (!publicVapidKey || !privateVapidKey) {
    return res.status(500).json({ error: 'VAPID keys are missing in Vercel settings' });
  }

  try {
    const q = Object.assign({}, req.query || {}, req.body || {});
    const isSelf = String(q.self || '') === '1' || q.self === true;
    const isTest = String(q.test || '') === '1' || q.test === true;
    const todayStr = new Date().toISOString().slice(0, 10);

    // 1) إرسال إشعار خارجي فوري لجهاز المستخدم نفسه (عند الاختبار أو عند حلول الساعة المجدولة)
    if (isSelf && me) {
      const { data: mySubs } = await supabase.from('push_subs').select('*');
      const targetSubs = (mySubs || []).filter(s => String(s.email || '').toLowerCase() === String(me.email || '').toLowerCase());
      if (!targetSubs.length) {
        return res.status(200).json({ success: true, sent: 0, message: 'لا يوجد اشتراك إشعارات مسجّل لهذا الجهاز بعد' });
      }
      const title = q.title || (isTest ? '🔔 إشعار خارجي من مدير المهام' : '⏰ تذكير بالمهام المتأخرة');
      const body = q.body || (isTest ? 'وصلك هذا الإشعار بنجاح وأنت خارج التطبيق على شاشة الجوال!' : 'لديك مهام متأخرة بانتظار الإنجاز');
      const payload = JSON.stringify({
        title,
        body,
        icon: '/icon-192.png',
        task_id: q.task_id || undefined,
        task_title: q.task_title || undefined,
        is_azkar_remind: true,
        actions: q.task_id
          ? [{ action: 'done', title: '✅ تم الإنجاز' }, { action: 'open', title: '📋 فتح المهام' }]
          : [{ action: 'open', title: '📋 فتح المهام' }]
      });
      let sent = 0;
      await Promise.all(targetSubs.map(subRow =>
        webpush.sendNotification(subRow.sub, payload, { TTL: 86400, urgency: 'high' })
          .then(() => { sent++; })
          .catch(async e => {
            if ([404, 410].includes(e.statusCode)) {
              await supabase.from('push_subs').delete().eq('endpoint', subRow.endpoint);
            }
          })
      ));
      return res.status(200).json({ success: true, sent, devices: targetSubs.length });
    }

    // 2) إرسال تذكير مجدول لجميع الموظفين الذين لديهم مهام متأخرة أو مستحقة اليوم (مرسل من الكرون أو في الساعة المحددة)
    const filterCo = String(q.company || '').trim().toLowerCase();
    const { data: allMembers } = await supabase.from('members').select('email,name,role,company,telegram_chat_id');
    const getMemCo = m => {
      if (!m) return 'متجرك';
      let c = m.company || '';
      if (!c && m.telegram_chat_id && String(m.telegram_chat_id).trim().startsWith('{')) {
        try { c = JSON.parse(m.telegram_chat_id).co || ''; } catch (e) {}
      }
      c = String(c || '').trim();
      return (!c && m.role !== 'admin') ? 'متجرك' : (c || 'متجرك');
    };
    const memMap = {};
    (allMembers || []).forEach(m => { memMap[String(m.email || '').toLowerCase()] = getMemCo(m); });

    const { data: subs0 } = await supabase.from('push_subs').select('*');
    const subs = (subs0 || []).filter(s => !filterCo || (memMap[String(s.email || '').toLowerCase()] || 'متجرك').toLowerCase() === filterCo);
    if (!subs || subs.length === 0) return res.status(200).json({ message: 'لا توجد أجهزة مسجلة', sent: 0 });

    const { data: tasks0 } = await supabase.from('tasks')
      .select('*')
      .neq('status', 'done')
      .lte('due_on', todayStr);

    const getTaskCo = t => {
      const m = String(t.notes || '').match(/\[شركة:\s*([^\]]+)\]/);
      if (m) return m[1].trim();
      if (t.assignee_email) return memMap[String(t.assignee_email).toLowerCase()] || 'متجرك';
      return 'متجرك';
    };
    const tasks = (tasks0 || []).filter(t => !filterCo || getTaskCo(t).toLowerCase() === filterCo);
    const { data: dn } = await supabase.from('task_done').select('*');

    // تجميع المهام المتأخرة والمستحقة اليوم لكل موظف في إشعار واحد واضح وغير مزعج
    const byEmail = {};
    (tasks || []).forEach(task => {
      const tCo = getTaskCo(task);
      subs.forEach(subRow => {
        const em = String(subRow.email || '').toLowerCase();
        if (!em) return;
        if (task.for_all && (dn || []).some(d => d.task_id === task.id && String(d.email || '').toLowerCase() === em)) return;
        const subCo = memMap[em] || 'متجرك';
        if (task.for_all && subCo.toLowerCase() !== tCo.toLowerCase()) return;
        if (task.for_all || String(task.assignee_email || '').toLowerCase() === em) {
          if (!byEmail[em]) byEmail[em] = { late: [], today: [] };
          const bucket = task.due_on < todayStr ? byEmail[em].late : byEmail[em].today;
          if (!bucket.some(x => x.id === task.id)) bucket.push(task);
        }
      });
    });

    let sent = 0;
    const sendPromises = [];
    subs.forEach(subRow => {
      const em = String(subRow.email || '').toLowerCase();
      const info = byEmail[em];
      if (!info || (!info.late.length && !info.today.length)) return;
      const sample = (info.late.length ? info.late : info.today).slice(0, 3);
      const firstTask = sample[0];
      const title = info.late.length > 0
        ? ('🚨 تذكير: لديك ' + info.late.length + ' مهام متأخرة')
        : ('🔥 تذكير: لديك ' + info.today.length + ' مهام مستحقة اليوم');
      const body = '• ' + sample.map(t => t.title).join('\n• ');
      const payload = JSON.stringify({
        title,
        body,
        icon: '/icon-192.png',
        task_id: firstTask ? firstTask.id : undefined,
        task_title: firstTask ? firstTask.title : undefined,
        for_all: firstTask ? !!firstTask.for_all : false,
        is_azkar_remind: true,
        actions: firstTask
          ? [{ action: 'done', title: '✅ تم الإنجاز' }, { action: 'open', title: '📋 فتح المهام' }]
          : [{ action: 'open', title: '📋 فتح المهام' }]
      });
      sendPromises.push(
        webpush.sendNotification(subRow.sub, payload, { TTL: 86400, urgency: 'high' })
          .then(() => { sent++; })
          .catch(async e => {
            if ([404, 410].includes(e.statusCode)) {
              await supabase.from('push_subs').delete().eq('endpoint', subRow.endpoint);
            }
          })
      );
    });

    await Promise.all(sendPromises);
    return res.status(200).json({ success: true, sent, message: 'تم إرسال التذكيرات بنجاح' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
