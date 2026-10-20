// دخول المندوب برقم الجوال وكلمة المرور (الإيميل الداخلي يبقى على الخادم)
const { createClient } = require('@supabase/supabase-js');
const { supabase } = require('../lib/auth');
const { normPhone, repEmail } = require('../lib/phone');
const DEFAULT_URL = 'https://wrmpyywosathqxrjuicx.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndybXB5eXdvc2F0aHF4cmp1aWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDg2NDQsImV4cCI6MjEwNzQ4NDY0NH0.CoSwCocuTVWlVU6QBNpp_bZiuykVkMHSHpT11KC1uvU';
const wait = ms => new Promise(r => setTimeout(r, ms));

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { phone, password } = req.body || {};
  const rawInput = String(phone || '').trim();
  const p = normPhone(rawInput), rawDigits = rawInput.replace(/\D/g, '');
  const bad = async () => { await wait(400); return res.status(401).json({ error: 'رقم الجوال / اسم المستخدم أو كلمة المرور غير صحيحة' }); };
  if (rawInput.length < 2 || !password) return bad();
  try {
    const anon = createClient(
      process.env.SUPABASE_URL || DEFAULT_URL,
      process.env.SUPABASE_ANON_KEY || DEFAULT_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    // البحث عن المندوب أو العضو برقم الجوال أو بالاسم
    const { data: allMem } = await supabase.from('members').select('email,phone,name,role');
    const matched = (allMem || []).filter(r => {
      if (rawDigits.length >= 7) {
        const rp = normPhone(r.phone);
        if (rp === p || String(r.phone || '').replace(/\D/g, '') === rawDigits || String(r.email || '').toLowerCase() === repEmail(p).toLowerCase()) return true;
      }
      if (r.name && String(r.name).trim().toLowerCase() === rawInput.toLowerCase()) return true;
      return false;
    });
    const candidateEmails = [...new Set([
      ...matched.map(m => m.email),
      ...(rawDigits.length >= 7 ? [repEmail(p), rawDigits + '@rep.invalid', p + '@rep.local'] : [])
    ].filter(Boolean))];

    for (const em of candidateEmails) {
      const { data, error } = await anon.auth.signInWithPassword({ email: em, password: String(password).trim() });
      if (!error && data && data.session) {
        return res.status(200).json({ ...data.session, session: data.session, email: em });
      }
    }
    return bad();
  } catch (e) { return res.status(500).json({ error: 'تعذّر الدخول، حاول لاحقاً' }); }
};
