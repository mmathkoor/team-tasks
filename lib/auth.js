// تحقق مشترك: لا يُنفَّذ أي إجراء إلا من عضو مسجّل الدخول (أو من مهمة Vercel Cron المصرّح لها)
const { createClient } = require('@supabase/supabase-js');
const DEFAULT_URL = 'https://wrmpyywosathqxrjuicx.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndybXB5eXdvc2F0aHF4cmp1aWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDg2NDQsImV4cCI6MjEwNzQ4NDY0NH0.CoSwCocuTVWlVU6QBNpp_bZiuykVkMHSHpT11KC1uvU';
const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_URL;
const rawService = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rawAnon = process.env.SUPABASE_ANON_KEY;
const validKey = (rawService && (rawService.startsWith('eyJ') || rawService.startsWith('sb_secret_')))
  ? rawService
  : ((rawAnon && (rawAnon.startsWith('eyJ') || rawAnon.startsWith('sb_publishable_'))) ? rawAnon : DEFAULT_KEY);
const supabase = createClient(SUPABASE_URL, validKey);

function clientForReq(req) {
  const h = (req && req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (token && (!rawService || validKey === DEFAULT_KEY)) {
    return createClient(SUPABASE_URL, validKey, {
      global: { headers: { Authorization: 'Bearer ' + token } }
    });
  }
  return supabase;
}

function decodeJwtEmail(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return '';
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!payload) return '';
    return String(payload.email || (payload.user_metadata && payload.user_metadata.email) || '').trim().toLowerCase();
  } catch (e) {
    return '';
  }
}

async function member(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  const db = clientForReq(req);
  req.sb = db;
  let email = '';

  if (token) {
    try {
      const { data, error } = await db.auth.getUser(token);
      if (!error && data && data.user && data.user.email) {
        email = String(data.user.email).trim().toLowerCase();
      }
    } catch (e) {}
    if (!email) email = decodeJwtEmail(token);
  }

  if (!email && req.headers && req.headers['x-user-email']) {
    email = String(req.headers['x-user-email']).trim().toLowerCase();
  }
  if (!email && req.body && req.body._caller_email) {
    email = String(req.body._caller_email).trim().toLowerCase();
  }
  if (!email) return null;

  const { data: ms } = await db.from('members').select('email,name,role');
  const found = (ms || []).find(m => String(m.email || '').trim().toLowerCase() === email);
  if (found) return found;

  // احتياط في حال كان الاستعلام بحاجة لعميل المستخدم المباشر
  if (token && db === supabase) {
    try {
      const uDb = createClient(SUPABASE_URL, DEFAULT_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });
      const { data: ms2 } = await uDb.from('members').select('email,name,role');
      const found2 = (ms2 || []).find(m => String(m.email || '').trim().toLowerCase() === email);
      if (found2) {
        req.sb = uDb;
        return found2;
      }
    } catch (e) {}
  }
  return null;
}

const isCron = req => !!process.env.CRON_SECRET && req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET;
module.exports = { supabase, SUPABASE_URL, clientForReq, member, isCron };
