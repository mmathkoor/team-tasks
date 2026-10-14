// تحقق مشترك: لا يُنفَّذ أي إجراء إلا من عضو مسجّل الدخول (أو من مهمة Vercel Cron المصرّح لها)
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function member(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  const email = data && data.user && data.user.email;
  if (error || !email) return null;
  const { data: ms } = await supabase.from('members').select('email,name,role');
  return (ms || []).find(m => String(m.email).toLowerCase() === email.toLowerCase()) || null;
}
const isCron = req => !!process.env.CRON_SECRET && req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET;
module.exports = { supabase, member, isCron };
