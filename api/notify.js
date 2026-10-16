const { supabase, member } = require('../lib/auth');
const { deliver, cut, lc } = require('../lib/push');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const me = await member(req);                       // لا يُقبل إلا عضو مسجّل الدخول
  if (!me) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { title, body, assignee_email, for_all, is_custom, task_id, task_title, to_admins, priority, task_map, include_tasks } = req.body || {};
    const sender = me.name;                            // الاسم من قاعدة البيانات لا من الطلب (منع الانتحال)
    const { data: members } = await supabase.from('members').select('email,role');
    let rec;
    if (to_admins) rec = members.filter(m => m.role === 'admin' && lc(m.email) !== lc(me.email));
    else if (for_all) rec = members.filter(m => lc(m.email) !== lc(me.email));
    else rec = members.filter(m => lc(m.email) === lc(assignee_email));
    if (!rec.length) return res.status(200).json({ success: true, sent: 0, stored: 0 });

    const base = is_custom ? 'من ' + sender + ':' + (body ? ' ' + cut(body, 400) : '') : 'تم تكليفك بمهمة جديدة من ' + sender + ':\n"' + cut(title, 120) + '"';
    let bodyFor = null;
    if (include_tasks && is_custom) {                  // قائمة المهام المفتوحة تُحسب لكل مستلم على حدة
      const [{ data: open }, { data: td }] = await Promise.all([
        supabase.from('tasks').select('id,title,assignee_email,for_all,status').neq('status', 'done'),
        supabase.from('task_done').select('task_id,email')]);
      bodyFor = email => {
        const mine = (open || []).filter(t => t.for_all ? !(td || []).some(d => d.task_id === t.id && lc(d.email) === lc(email)) : lc(t.assignee_email) === lc(email));
        return base + '\n\n' + (mine.length ? 'مهامك المفتوحة:\n' + mine.slice(0, 15).map(t => '🔸 ' + t.title).join('\n') : '(ليس لديك أي مهام مفتوحة حالياً)');
      };
    }
    const r = await deliver(supabase, {
      recipients: rec, from_name: sender, bodyFor, body: base, task_id, task_map, for_all,
      task_title: task_title || title,
      title: is_custom ? cut(title, 80) : (priority === 'urgent' ? '🔴 مهمة عاجلة جديدة' : priority === 'important' ? '🟠 مهمة مهمة جديدة' : '🆕 مهمة جديدة')
    });
    return res.status(200).json({ success: true, sent: r.sent, devices: r.devices, stored: r.stored });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
