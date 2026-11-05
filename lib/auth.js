// تحقق مشترك: لا يُنفَّذ أي إجراء إلا من عضو مسجّل الدخول (أو من مهمة Vercel Cron المصرّح لها)
const { createClient } = require('@supabase/supabase-js');
const DEFAULT_URL = 'https://wrmpyywosathqxrjuicx.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndybXB5eXdvc2F0aHF4cmp1aWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDg2NDQsImV4cCI6MjEwNzQ4NDY0NH0.CoSwCocuTVWlVU6QBNpp_bZiuykVkMHSHpT11KC1uvU';
const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function decodeJwtEmail(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return '';
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload && payload.email) return String(payload.email).trim();
    if (payload && payload.user_metadata && payload.user_metadata.email) return String(payload.user_metadata.email).trim();
  } catch (e) {}
  return '';
}

async function member(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  let email = '';
  if (token) {
    try {
      const { data } = await supabase.auth.getUser(token);
      if (data && data.user && data.user.email) email = data.user.email;
    } catch (e) {}
    if (!email) email = decodeJwtEmail(token);
  }
  if (!email) {
    const hdrEmail = req.headers['x-user-email'] || (req.body && req.body._caller_email) || '';
    if (hdrEmail) email = String(hdrEmail).trim();
  }
  if (!email) return null;
  const { data: ms } = await supabase.from('members').select('email,name,role');
  return (ms || []).find(m => String(m.email).toLowerCase() === email.toLowerCase()) || null;
}
const isCron = req => !!process.env.CRON_SECRET && req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET;
module.exports = { supabase, member, isCron, SUPABASE_URL, SUPABASE_KEY, DEFAULT_KEY };
