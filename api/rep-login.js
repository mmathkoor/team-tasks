// دخول المندوب أو الموظف برقم الجوال أو الاسم أو البريد مع كلمة المرور
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
  const bad = async (customMsg) => {
    await wait(350);
    return res.status(401).json({ error: customMsg || 'البريد أو رقم الجوال أو كلمة المرور غير صحيحة' });
  };

  if (rawInput.length < 2 || !password) return bad('الرجاء كتابة اسم المستخدم / رقم الجوال وكلمة المرور');

  try {
    const rawKey = process.env.SUPABASE_ANON_KEY;
    const anonKey = (rawKey && rawKey.startsWith('eyJ')) ? rawKey : DEFAULT_KEY;
    const anon = createClient(
      process.env.SUPABASE_URL || DEFAULT_URL,
      anonKey,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );


    // البحث عن المندوب أو العضو برقم الجوال أو بالاسم أو بالبريد
    const { data: allMem } = await supabase.from('members').select('email,phone,name,role');
    const inputPrefix = rawInput.includes('@') ? rawInput.split('@')[0].toLowerCase() : rawInput.toLowerCase();

    const matched = (allMem || []).filter(r => {
      if (rawDigits.length >= 7) {
        const rp = normPhone(r.phone);
        if (rp === p || String(r.phone || '').replace(/\D/g, '') === rawDigits || String(r.email || '').toLowerCase() === repEmail(p).toLowerCase()) return true;
      }
      const rName = String(r.name || '').trim().toLowerCase();
      const rEmail = String(r.email || '').trim().toLowerCase();
      const rPrefix = rEmail.split('@')[0];

      if (rName === rawInput.toLowerCase()) return true;
      if (rEmail === rawInput.toLowerCase()) return true;
      if (inputPrefix && (rPrefix === inputPrefix || rName === inputPrefix)) return true;
      return false;
    });

    const candidateEmails = [...new Set([
      ...matched.map(m => m.email),
      ...(rawInput.includes('@') ? [rawInput.toLowerCase(), rawInput] : []),
      ...(rawDigits.length >= 7 ? [
        p + '@staff.local',
        rawDigits + '@staff.local',
        p + '@rep.local',
        rawDigits + '@rep.local',
        repEmail(p),
        p + '@rep.invalid',
        rawDigits + '@rep.invalid'
      ] : [])
    ].filter(Boolean))];

    for (const em of candidateEmails) {
      const { data, error } = await anon.auth.signInWithPassword({ email: em, password: String(password).trim() });
      if (!error && data && data.session) {
        return res.status(200).json({ ...data.session, session: data.session, email: em });
      }
    }

    if (matched.length > 0) {
      return bad('كلمة المرور غير صحيحة لحساب (' + matched[0].name + ')');
    }

    return bad();
  } catch (e) {
    return res.status(500).json({ error: 'تعذّر تسجيل الدخول، حاول مرة أخرى' });
  }
};
