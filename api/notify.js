const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// التعديل هنا: التأكد من سحب المفاتيح كنصوص 
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';

webpush.setVapidDetails(
  'mailto:admin@matjark.com',
  publicVapidKey,
  privateVapidKey
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  
  if (!publicVapidKey || !privateVapidKey) {
      return res.status(500).json({ error: "VAPID keys are missing in Vercel settings" });
  }

  try {
    const { title, body, assignee_email, for_all, sender_name, is_custom, task_id, to_admins } = req.body;
    
    const { data: subs } = await supabase.from('push_subs').select('*');
    if (!subs || subs.length === 0) return res.status(200).json({ message: 'لا توجد أجهزة مسجلة' });

    let finalTitle = is_custom ? title : '🆕 مهمة جديدة';
    let finalBody = is_custom ? `من ${sender_name}: ${body}` : `تم تكليفك بمهمة جديدة من ${sender_name}:\n"${title}"`;

    let adminEmails = [];
    if (to_admins) { const { data: ad } = await supabase.from('members').select('email').eq('role', 'admin'); adminEmails = (ad || []).map(a => a.email.toLowerCase()); }
    const payload = JSON.stringify({
      title: finalTitle,
      body: finalBody,
      icon: '/icon-192.png',
      task_id: task_id || undefined,
      for_all: !!for_all,
      actions: task_id && !is_custom ? [{ action: 'done', title: 'إنجاز ✅' }, { action: 'open', title: 'عرض التفاصيل 🔍' }] : undefined
    });

    let sendPromises = [];
    subs.forEach(subRow => {
      if (to_admins ? adminEmails.includes(String(subRow.email).toLowerCase()) : (for_all || subRow.email === assignee_email)) {
        sendPromises.push(webpush.sendNotification(subRow.sub, payload).catch(e => console.error('Push error:', e)));
      }
    });

    await Promise.all(sendPromises);
    return res.status(200).json({ success: true });
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
