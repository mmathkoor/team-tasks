const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';

webpush.setVapidDetails(
  'mailto:admin@matjark.com',
  publicVapidKey,
  privateVapidKey
);

module.exports = async (req, res) => {
  if (!publicVapidKey || !privateVapidKey) {
      return res.status(500).json({ error: "VAPID keys are missing in Vercel settings" });
  }

  try {
    const today = new Date();
    const targetDate = new Date();
    targetDate.setDate(today.getDate() + 3);
    const dateString = targetDate.toISOString().slice(0, 10);

    const { data: subs } = await supabase.from('push_subs').select('*');
    if (!subs || subs.length === 0) return res.status(200).json({ message: 'لا توجد أجهزة مسجلة' });

    const { data: tasks } = await supabase.from('tasks')
      .select('*')
      .neq('status', 'done')
      .lte('due_on', dateString);

    const { data: dn } = await supabase.from('task_done').select('*');
    const { data: proposals } = await supabase.from('proposals').select('*').eq('status', 'open');

    let sendPromises = [];

    if (tasks) {
      tasks.forEach(task => {
        const payload = JSON.stringify({
          title: '⏳ تذكير بمهمة تقترب',
          body: `المهمة: ${task.title}\nتاريخ التسليم: ${task.due_on}`,
          icon: '/icon-192.png',
          task_id: task.id,
          for_all: !!task.for_all,
          actions: [{ action: 'done', title: 'إنجاز ✅' }, { action: 'open', title: 'عرض التفاصيل 🔍' }]
        });

        subs.forEach(subRow => {
          if (task.for_all && (dn || []).some(d => d.task_id === task.id && d.email === subRow.email)) return;
          if (task.for_all || task.assignee_email === subRow.email) {
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
