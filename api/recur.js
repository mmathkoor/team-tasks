// يعمل يومياً 07:30 بتوقيت اليمن (04:30 UTC) وينشئ المهام المتكررة المستحقة اليوم
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');
const { randomUUID } = require('crypto');
const { member, isCron } = require('./../lib/auth');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const pub = process.env.VAPID_PUBLIC_KEY || '', pri = process.env.VAPID_PRIVATE_KEY || '';
if (pub && pri) webpush.setVapidDetails('mailto:admin@matjark.com', pub, pri);

module.exports = async (req, res) => {
  if (!isCron(req)) { const me = await member(req); if (!me || me.role !== 'admin') return res.status(401).json({ error: 'unauthorized — اضبط CRON_SECRET في Vercel أو سجّل كأدمن' }); }
  try {
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
    const created = [];
    for (const r of due) {
      const d = new Date(now); d.setUTCDate(d.getUTCDate() + (r.due_after_days || 0));
      const task = { id: randomUUID(), title: r.title, notes: r.notes, for_all: r.for_all, assignee_email: r.for_all ? null : r.assignee_email, due_on: d.toISOString().slice(0, 10), status: 'todo', created_by: r.created_by };
      const { error: e1 } = await supabase.from('tasks').insert(task);
      if (e1) { console.error(e1.message); continue; }
      await supabase.from('recurring_tasks').update({ last_run: today }).eq('id', r.id);
      created.push(task);
    }
    if (created.length && pub && pri) {
      const { data: subs } = await supabase.from('push_subs').select('*');
      await Promise.all(created.flatMap(t => (subs || []).filter(s => t.for_all || s.email === t.assignee_email).map(s =>
        webpush.sendNotification(s.sub, JSON.stringify({ title: '🔁 مهمة دورية جديدة', body: t.title, icon: '/icon-192.png', task_id: t.id, task_title: t.title, for_all: t.for_all,
          actions: [{ action: 'done', title: 'إنجاز ✅' }, { action: 'open', title: 'عرض التفاصيل 🔍' }] })).catch(() => {}))));
    }
    res.status(200).json({ created: created.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
