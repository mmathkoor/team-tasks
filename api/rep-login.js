// دخول المندوب برقم الجوال وكلمة المرور (الإيميل الداخلي يبقى على الخادم)
const { createClient } = require('@supabase/supabase-js');
const { supabase } = require('../lib/auth');
const { normPhone } = require('../lib/phone');
const wait = ms => new Promise(r => setTimeout(r, ms));

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { phone, password } = req.body || {}, p = normPhone(phone), bad = async () => { await wait(600); return res.status(401).json({ error: 'رقم الجوال أو كلمة المرور غير صحيحة' }); };
  if (p.length < 9 || !password) return bad();
  try {
    const { data: m } = await supabase.from('members').select('email').eq('phone', p).eq('role', 'rep').maybeSingle();
    if (!m) return bad();
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email: m.email, password });
    if (error || !data.session) return bad();
    return res.status(200).json({ session: data.session });
  } catch (e) { return res.status(500).json({ error: 'تعذّر الدخول، حاول لاحقاً' }); }
};
