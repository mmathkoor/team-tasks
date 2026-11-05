// تحقق مشترك: لا يُنفَّذ أي إجراء إلا من عضو مسجّل الدخول (أو من مهمة Vercel Cron المصرّح لها)
const { createClient } = require('@supabase/supabase-js');
const DEFAULT_URL = 'https://wrmpyywosathqxrjuicx.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndybXB5eXdvc2F0aHF4cmp1aWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDg2NDQsImV4cCI6MjEwNzQ4NDY0NH0.CoSwCocuTVWlVU6QBNpp_bZiuykVkMHSHpT11KC1uvU';
const rawService = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawAnon = process.env.SUPABASE_ANON_KEY;
const validKey = (rawService && rawService.startsWith('eyJ')) ? rawService : ((rawAnon && rawAnon.startsWith('eyJ')) ? rawAnon : DEFAULT_KEY);
const supabase = createClient(process.env.SUPABASE_URL || DEFAULT_URL, validKey);


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
