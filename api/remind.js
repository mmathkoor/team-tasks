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
  if (!isCron(req)) { const me = await member(req); if (!me || me.role !== 'admin') return res.status(401).json({ error: 'unauthorized — اضبط CRON_SECRET في Vercel أو سجّل كأدمن' }); }
  if (!publicVapidKey || !privateVapidKey) {
      return res.status(500).json({ error: "VAPID keys are missing in Vercel settings" });
  }

  try {
    const today = new Date();
    const targetDate = new Date();
    targetDate.setDate(today.getDate() + 3);
    const dateString = targetDate.toISOString().slice(0, 10);

    const filterCo = String((req.query && req.query.company) || (req.body && req.body.company) || '').trim().toLowerCase();
    const { data: allMembers } = await supabase.from('members').select('email,role,company,telegram_chat_id');
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
    if (!subs || subs.length === 0) return res.status(200).json({ message: 'لا توجد أجهزة مسجلة' });

    const { data: tasks0 } = await supabase.from('tasks')
      .select('*')
      .neq('status', 'done')
      .lte('due_on', dateString);

    const getTaskCo = t => {
      const m = String(t.notes || '').match(/\[شركة:\s*([^\]]+)\]/);
      if (m) return m[1].trim();
      if (t.assignee_email) return memMap[String(t.assignee_email).toLowerCase()] || 'متجرك';
      return 'متجرك';
    };
    const tasks = (tasks0 || []).filter(t => !filterCo || getTaskCo(t).toLowerCase() === filterCo);

    const { data: dn } = await supabase.from('task_done').select('*');
    const { data: proposals } = await supabase.from('proposals').select('*').eq('status', 'open');

    let sendPromises = [];

    if (tasks) {
      tasks.forEach(task => {
        const tCo = getTaskCo(task);
        const payload = JSON.stringify({
          title: '⏳ تذكير بمهمة تقترب (' + tCo + ')',
          body: `المهمة: ${task.title}\nتاريخ التسليم: ${task.due_on}`,
          icon: '/icon-192.png',
          task_id: task.id,
          task_title: task.title,
          for_all: !!task.for_all,
          actions: [{ action: 'done', title: 'إنجاز ✅' }, { action: 'open', title: 'عرض التفاصيل 🔍' }]
        });

        subs.forEach(subRow => {
          if (task.for_all && (dn || []).some(d => d.task_id === task.id && d.email === subRow.email)) return;
          const subCo = memMap[String(subRow.email || '').toLowerCase()] || 'متجرك';
          if (task.for_all && subCo.toLowerCase() !== tCo.toLowerCase()) return;
          if (task.for_all || String(task.assignee_email || '').toLowerCase() === String(subRow.email || '').toLowerCase()) {
            sendPromises.push(webpush.sendNotification(subRow.sub, payload).catch(e => console.error(e)));
          }
        });
      });
    }

    if (proposals) {
      proposals.forEach(prop => {
        const payload = JSON.stringify({
          title: '📊 تذكير بالتصويت',
          body: `يوجد مقترح مفتوح للتصويت: ${prop.title}`,
          icon: '/icon-192.png'
        });
        subs.forEach(subRow => {
          sendPromises.push(webpush.sendNotification(subRow.sub, payload).catch(e => console.error(e)));
        });
      });
    }

    await Promise.all(sendPromises);
    return res.status(200).json({ success: true, message: 'تم إرسال التذكيرات بنجاح' });
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
