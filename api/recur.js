// ينشئ المهام المتكررة المستحقة اليوم. يعمل يومياً 07:30 بتوقيت اليمن (04:30 UTC)،
// ويُستدعى أيضاً عند فتح التطبيق من أي عضو (آمن: كل قاعدة تُنفَّذ مرة واحدة في اليوم).
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
const { member, isCron } = require('./../lib/auth');
const { deliver } = require('../lib/push');
const { purgeImages } = require('../lib/purge');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async (req, res) => {
  if (!isCron(req)) { const me = await member(req); if (!me) return res.status(401).json({ error: 'unauthorized' }); }
  try {
    await purgeImages(supabase).catch(e => console.error('purge:', e.message));   // تنظيف صور الطلبات المنتهية
    const now = new Date(Date.now() + 3 * 3600e3);
    const today = now.toISOString().slice(0, 10), dow = now.getUTCDay(), dom = now.getUTCDate();
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const { data: rules, error } = await supabase.from('recurring_tasks').select('*').eq('active', true);
    if (error) throw error;
    const due = rules.filter(r => r.last_run !== today && (r.for_all || r.assignee_email) && (
      r.frequency === 'daily' ||
      (r.frequency === 'weekly' && r.weekday === dow) ||
      (r.frequency === 'monthly' && Math.min(r.day_of_month || 1, lastDay) === dom) ||
      (r.frequency === 'month_end' && dom === lastDay)));
    if (!due.length) return res.status(200).json({ created: 0 });
    const { data: members } = await supabase.from('members').select('email').neq('role', 'rep');
    const made = [];
    for (const r of due) {
      // حجز القاعدة لهذا اليوم بشكل ذري كي لا تتكرر المهمة لو فتح تطبيقين معاً
      const { data: claimed, error: ce } = await supabase.from('recurring_tasks').update({ last_run: today }).eq('id', r.id).or('last_run.is.null,last_run.neq.' + today).select('id');
      if (ce || !claimed || !claimed.length) continue;
      const d = new Date(now); d.setUTCDate(d.getUTCDate() + (r.due_after_days || 0));
      const base = { title: r.title, notes: r.notes, due_on: d.toISOString().slice(0, 10), status: 'todo', created_by: r.created_by, for_all: false };
      const gid = randomUUID();
      const rows = r.for_all ? members.map(m => ({ ...base, id: randomUUID(), assignee_email: m.email, group_id: gid })) : [{ ...base, id: randomUUID(), assignee_email: r.assignee_email }];
      const { error: e1 } = await supabase.from('tasks').insert(rows);
      if (e1) { console.error(e1.message); await supabase.from('recurring_tasks').update({ last_run: r.last_run }).eq('id', r.id); continue; }
      made.push({ r, rows });
    }
    for (const { r, rows } of made) {
      const map = {}; rows.forEach(t => { map[String(t.assignee_email).toLowerCase()] = t.id; });
      await deliver(supabase, { recipients: rows.map(t => ({ email: t.assignee_email })), title: '🔁 مهمة دورية جديدة', body: r.title, task_map: map, task_title: r.title, for_all: !!r.for_all, from_name: 'النظام' });
    }
    res.status(200).json({ created: made.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
