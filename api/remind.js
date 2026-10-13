// يعمل يومياً 9 صباحاً بتوقيت اليمن (06:00 UTC) عبر Vercel Cron
const webpush = require('web-push');
const { VAPID_PUBLIC, VAPID_PRIVATE } = process.env;
const { SUPABASE_URL, SUPABASE_SERVICE_KEY, TELEGRAM_BOT_TOKEN, RESEND_API_KEY, MAIL_FROM, CRON_SECRET, MEETING_DAY } = process.env;
const H = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };
const get = async (p) => (await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H })).json();

module.exports = async (req, res) => {
  if (CRON_SECRET && req.headers.authorization !== `Bearer ${CRON_SECRET}`) return res.status(401).end();
  if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails('mailto:' + (MAIL_FROM || 'admin@example.com'), VAPID_PUBLIC, VAPID_PRIVATE);
  const subs = await get('push_subs?select=*');
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const isMeetingDay = String(new Date().getUTCDay()) === (MEETING_DAY ?? '');
  const members = await get('members?select=*');
  const open = await get('tasks?status=neq.done&select=*&order=due_on');
  const doneRows = await get('task_done?select=*');
  const doneSet = new Set((Array.isArray(doneRows) ? doneRows : []).map(d => d.task_id + '|' + String(d.email).toLowerCase()));
  let sent = 0;
  for (const m of members) {
    // مهام "الكل" تصل لكل عضو لم يُنجز حصته بعد
    const mine = open.filter(t => t.for_all ? !doneSet.has(t.id + '|' + m.email.toLowerCase()) : t.assignee_email === m.email);
    // اليوم المحدد للاجتماع: ملخص بكل المهام المفتوحة، وغيره: فقط المتأخر وما يستحق اليوم/غداً
    const list = isMeetingDay ? open : mine.filter(t => t.due_on && t.due_on <= tomorrow);
    if (!list.length) continue;
    const line = t => `${t.due_on && t.due_on < today ? '🔴' : '🟡'} ${t.title}${t.due_on ? ' (' + t.due_on + ')' : ''}${isMeetingDay ? ' — ' + (t.for_all ? 'الكل' : (members.find(x => x.email === t.assignee_email)?.name || '')) : ''}`;
    const text = `مرحباً ${m.name}\n${isMeetingDay ? 'ملخص المهام المفتوحة قبل الاجتماع:' : 'مهامك القادمة والمتأخرة:'}\n` + list.map(line).join('\n');
    if (TELEGRAM_BOT_TOKEN && m.telegram_chat_id)
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: m.telegram_chat_id, text }) });
    if (VAPID_PUBLIC && VAPID_PRIVATE)
      for (const x of subs.filter(x => x.email === m.email))
        await webpush.sendNotification(x.sub, JSON.stringify({ title: 'مهام الفريق', body: text }))
          .catch(async err => { if ([404, 410].includes(err.statusCode)) await fetch(SUPABASE_URL + '/rest/v1/push_subs?endpoint=eq.' + encodeURIComponent(x.endpoint), { method: 'DELETE', headers: H }); });
    if (RESEND_API_KEY)
      await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: MAIL_FROM, to: m.email, subject: 'تذكير بالمهام', text }) });
    sent++;
  }
  res.status(200).json({ sent });
};
