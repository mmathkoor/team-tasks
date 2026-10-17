// تسليم التنبيهات: يُحفظ في صندوق كل مستلم أولاً (مضمون) ثم يُرسل إشعار الجوال (best effort)
const webpush = require('web-push');
const { randomUUID } = require('crypto');
const pub = process.env.VAPID_PUBLIC_KEY || '', pri = process.env.VAPID_PRIVATE_KEY || '';
if (pub && pri) webpush.setVapidDetails('mailto:admin@matjark.com', pub, pri);
const cut = (s, n) => String(s || '').slice(0, n);
const lc = s => String(s || '').toLowerCase();

// recipients: [{ email }]  — task_map: { emailLower: taskId } لكل مستلم نسخته من المهمة
async function deliver(supabase, o) {
  const rows = o.recipients.map(r => ({
    id: randomUUID(), to_email: r.email, title: cut(o.title, 120),
    body: cut(o.bodyFor ? o.bodyFor(r.email) : o.body, 900),
    task_id: (o.task_map && o.task_map[lc(r.email)]) || o.task_id || null, from_name: o.from_name || null
  }));
  let stored = 0;
  if (rows.length) {
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) console.error('notifications insert:', error.message); else stored = rows.length;
  }
  let sent = 0, devices = 0;
  if (pub && pri && rows.length) {
    const by = {}; rows.forEach(r => { by[lc(r.to_email)] = r; });
    const { data: subs } = await supabase.from('push_subs').select('*');
    const list = (subs || []).filter(s => by[lc(s.email)]);
    devices = list.length;
    await Promise.all(list.map(s => {
      const r = by[lc(s.email)];
      const payload = JSON.stringify({
        title: r.title, body: r.body, icon: '/icon-192.png', nid: stored ? r.id : undefined,
        task_id: r.task_id || undefined, task_title: r.task_id ? cut(o.task_title || o.title, 120) : undefined, for_all: !!o.for_all,
        actions: r.task_id ? [{ action: 'done', title: 'إنجاز ✅' }, { action: 'open', title: 'عرض التفاصيل 🔍' }] : undefined
      });
      return webpush.sendNotification(s.sub, payload, { TTL: 7 * 24 * 3600, urgency: 'high' }).then(() => { sent++; })
        .catch(async e => { if ([404, 410].includes(e.statusCode)) await supabase.from('push_subs').delete().eq('endpoint', s.endpoint); else console.error('Push error:', e.statusCode, e.body); });
    }));
  }
  // تنظيف الأقدم من 30 يوماً
  Promise.resolve(supabase.from('notifications').delete().lt('created_at', new Date(Date.now() - 30 * 864e5).toISOString())).then(() => {}, () => {});
  return { stored, sent, devices };
}
// إرسال إشعار الجوال لصفوف موجودة أصلاً في صندوق التنبيهات (تُنشأ من قاعدة البيانات ثم يُدفع لها هنا)
async function pushRows(supabase, rows) {
  if (!(pub && pri) || !rows.length) return { sent: 0, devices: 0 };
  const by = {}; rows.forEach(r => { (by[lc(r.to_email)] = by[lc(r.to_email)] || []).push(r); });
  const { data: subs } = await supabase.from('push_subs').select('*');
  let sent = 0, devices = 0;
  await Promise.all((subs || []).filter(s => by[lc(s.email)]).flatMap(s => by[lc(s.email)].map(r => {
    devices++;
    const payload = JSON.stringify({ title: r.title, body: r.body, icon: '/icon-192.png', nid: r.id, order_id: r.order_id || undefined,
      actions: r.order_id ? [{ action: 'open', title: 'عرض الطلب 🔍' }] : undefined });
    return webpush.sendNotification(s.sub, payload, { TTL: 7 * 24 * 3600, urgency: 'high' }).then(() => { sent++; })
      .catch(async e => { if ([404, 410].includes(e.statusCode)) await supabase.from('push_subs').delete().eq('endpoint', s.endpoint); else console.error('Push error:', e.statusCode, e.body); });
  })));
  return { sent, devices };
}
module.exports = { deliver, pushRows, cut, lc };
