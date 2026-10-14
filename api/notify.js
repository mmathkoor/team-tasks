const webpush = require('web-push');
const { supabase, member } = require('../lib/auth');

const pub = process.env.VAPID_PUBLIC_KEY || '', pri = process.env.VAPID_PRIVATE_KEY || '';
if (pub && pri) webpush.setVapidDetails('mailto:admin@matjark.com', pub, pri);
const cut = (s, n) => String(s || '').slice(0, n);
const lc = s => String(s || '').toLowerCase();

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  if (!pub || !pri) return res.status(500).json({ error: 'VAPID keys are missing in Vercel settings' });

  const me = await member(req);                       // لا يُقبل إلا عضو مسجّل الدخول
  if (!me) return res.status(401).json({ error: 'unauthorized' });

  try {
    const { title, body, assignee_email, for_all, is_custom, task_id, task_title, to_admins } = req.body || {};
    const sender = me.name;                            // الاسم من قاعدة البيانات لا من الطلب (منع الانتحال)
    const { data: members } = await supabase.from('members').select('email,role');

    let targets;
    if (to_admins) targets = members.filter(m => m.role === 'admin').map(m => lc(m.email)).filter(e => e !== lc(me.email));
    else if (for_all) targets = members.map(m => lc(m.email)).filter(e => e !== lc(me.email));
    else targets = members.map(m => lc(m.email)).filter(e => e === lc(assignee_email));
    if (!targets.length) return res.status(200).json({ success: true, sent: 0 });

    const { data: subs } = await supabase.from('push_subs').select('*');
    const list = (subs || []).filter(s => targets.includes(lc(s.email)));

    const payload = JSON.stringify({
      title: is_custom ? cut(title, 80) : '🆕 مهمة جديدة',
      body: is_custom ? `من ${sender}: ${cut(body, 400)}` : `تم تكليفك بمهمة جديدة من ${sender}:\n"${cut(title, 120)}"`,
      icon: '/icon-192.png',
      task_id: task_id || undefined,
      task_title: task_id ? cut(task_title || title, 120) : undefined,
      for_all: !!for_all,
      actions: task_id ? [{ action: 'done', title: 'إنجاز ✅' }, { action: 'open', title: 'عرض التفاصيل 🔍' }] : undefined
    });

    let sent = 0;
    await Promise.all(list.map(s => webpush.sendNotification(s.sub, payload).then(() => { sent++; })
      .catch(async e => { if ([404, 410].includes(e.statusCode)) await supabase.from('push_subs').delete().eq('endpoint', s.endpoint); else console.error('Push error:', e.statusCode, e.body); })));
    return res.status(200).json({ success: true, sent, devices: list.length });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
