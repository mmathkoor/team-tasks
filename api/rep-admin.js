// إدارة المناديب بالجوال (للمدير فقط): إنشاء / كلمة مرور جديدة / إزالة
const { supabase, member } = require('../lib/auth');
const { normPhone, repEmail } = require('../lib/phone');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const me = await member(req);
  if (!me || me.role !== 'admin') return res.status(403).json({ error: 'للمدير فقط' });
  try {
    const { action, name, phone, password, email, company } = req.body || {};
    if (action === 'create') {
      const p = normPhone(phone), nm = String(name || '').trim(), co = String(company || 'متجرك').trim();
      if (nm.length < 2) return res.status(400).json({ error: 'اكتب اسم المندوب' });
      if (p.length < 9) return res.status(400).json({ error: 'رقم الجوال غير صحيح' });
      if (String(password || '').length < 8) return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل' });
      const em = repEmail(p);
      const { data: ex } = await supabase.from('members').select('email').or('phone.eq.' + p + ',email.eq.' + em);
      if (ex && ex.length) return res.status(409).json({ error: 'هذا الرقم مضاف مسبقاً' });
      const { data: u, error } = await supabase.auth.admin.createUser({ email: em, password, email_confirm: true, user_metadata: { rep: true, phone: p } });
      if (error) return res.status(400).json({ error: 'تعذّر إنشاء الحساب: ' + error.message + ' — إن كان السبب رفض النطاق الوهمي فاضبط REP_EMAIL_DOMAIN في Vercel.' });
      const tgMeta = JSON.stringify({ co: co || 'متجرك', dep: '' });
      const { error: e2 } = await supabase.from('members').insert({ email: em, name: nm, role: 'rep', phone: p, auth_id: u.user.id, telegram_chat_id: tgMeta });
      if (e2) { await supabase.auth.admin.deleteUser(u.user.id); return res.status(500).json({ error: e2.message }); }
      return res.status(200).json({ ok: true, phone: p });
    }
    const { data: m } = await supabase.from('members').select('*').eq('email', email).eq('role', 'rep').maybeSingle();
    if (!m) return res.status(404).json({ error: 'المندوب غير موجود' });
    if (action === 'password') {
      if (String(password || '').length < 8) return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل' });
      if (!m.auth_id) return res.status(400).json({ error: 'حساب المندوب غير مرتبط' });
      const { error } = await supabase.auth.admin.updateUserById(m.auth_id, { password });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    if (action === 'set_company') {
      const co = String(company || 'متجرك').trim();
      const tgMeta = JSON.stringify({ co: co || 'متجرك', dep: '' });
      const { error } = await supabase.from('members').update({ telegram_chat_id: tgMeta }).eq('email', m.email);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    if (action === 'remove') {
      await supabase.from('members').delete().eq('email', m.email);
      if (m.auth_id) await supabase.auth.admin.deleteUser(m.auth_id);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'إجراء غير معروف' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
