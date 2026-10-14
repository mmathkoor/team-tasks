const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

webpush.setVapidDetails(
  'mailto:admin@matjark.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async (req, res) => {
  try {
    // تحديد التاريخ بعد 3 أيام من اليوم
    const today = new Date();
    const targetDate = new Date();
    targetDate.setDate(today.getDate() + 3);
    const dateString = targetDate.toISOString().slice(0, 10);

    // 1. جلب اشتراكات الجوالات
    const { data: subs } = await supabase.from('push_subs').select('*');
    if (!subs || subs.length === 0) return res.status(200).json({ message: 'لا توجد أجهزة مسجلة' });

    // 2. جلب المهام غير المنجزة والتي تاريخها خلال 3 أيام أو أقل
    const { data: tasks } = await supabase.from('tasks')
      .select('*')
      .neq('status', 'done')
      .lte('due_on', dateString);

    // 3. جلب المقترحات المفتوحة
    const { data: proposals } = await supabase.from('proposals').select('*').eq('status', 'open');

    let sendPromises = [];

    // إرسال تذكيرات المهام
    if (tasks) {
      tasks.forEach(task => {
        const payload = JSON.stringify({
          title: '⏳ تذكير بمهمة تقترب',
          body: `المهمة: ${task.title}\nتاريخ التسليم: ${task.due_on}`,
          icon: '/icon-192.png'
        });

        subs.forEach(subRow => {
          // إرسال للشخص المسؤول، أو للكل إذا كانت مهمة جماعية
          if (task.for_all || task.assignee_email === subRow.email) {
            sendPromises.push(webpush.sendNotification(subRow.sub, payload).catch(e => console.error(e)));
          }
        });
      });
    }

    // إرسال تذكيرات التصويت
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
