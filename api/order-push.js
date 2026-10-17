// يدفع إشعار الجوال لتنبيهات الطلب التي أنشأتها قاعدة البيانات (تغيير حالة / إسناد). التنبيه نفسه محفوظ مسبقاً في الصندوق.
const { supabase, member } = require('../lib/auth');
const { pushRows } = require('../lib/push');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const me = await member(req);
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { order_id } = req.body || {};
    if (!/^[0-9a-f-]{36}$/i.test(String(order_id || ''))) return res.status(400).json({ error: 'bad order_id' });
    const since = new Date(Date.now() - 5 * 60e3).toISOString();
    const { data: rows } = await supabase.from('notifications').select('*').eq('order_id', order_id).eq('pushed', false).gt('created_at', since);
    if (!rows || !rows.length) return res.status(200).json({ sent: 0 });
    await supabase.from('notifications').update({ pushed: true }).in('id', rows.map(r => r.id));
    const r = await pushRows(supabase, rows);
    return res.status(200).json({ sent: r.sent, devices: r.devices, notifications: rows.length });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
