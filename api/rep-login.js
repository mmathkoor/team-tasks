// دخول الموظف أو المندوب برقم الجوال وكلمة المرور (الإيميل الداخلي يبقى على الخادم)
const { createClient } = require('@supabase/supabase-js');
const { supabase, SUPABASE_URL, DEFAULT_KEY } = require('../lib/auth');
const { normPhone, repEmail } = require('../lib/phone');
const wait = ms => new Promise(r => setTimeout(r, ms));

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { phone, password } = req.body || {}, p = normPhone(phone), bad = async () => { await wait(400); return res.status(401).json({ error: 'رقم الجوال أو كلمة المرور غير صحيحة' }); };
  if (p.length < 7 || !password) return bad();
  try {
    const fallbackEm = repEmail(p);
    const { data: rows } = await supabase.from('members').select('email,phone').or('phone.eq.' + p + ',email.eq.' + fallbackEm);
    const m = (rows && rows[0]) || { email: fallbackEm };
    const anon = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || DEFAULT_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email: m.email, password });
    if (error || !data || !data.session) return bad();
    return res.status(200).json(Object.assign({}, data.session, { session: data.session }));
  } catch (e) { return res.status(500).json({ error: 'تعذّر الدخول، حاول لاحقاً' }); }
};
