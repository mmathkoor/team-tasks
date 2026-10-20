// إدارة المناديب بالجوال (للمدير فقط): إنشاء / كلمة مرور جديدة / إزالة
const { supabase, member } = require('../lib/auth');
const { normPhone, repEmail } = require('../lib/phone');

async function findAuthUserByEmail(email) {
  try {
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return (data && data.users || []).find(u => String(u.email || '').toLowerCase() === String(email || '').toLowerCase()) || null;
  } catch (e) { return null; }
}

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
      if (String(password || '').length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
      const em = repEmail(p);
      let userId = null;
      const { data: u, error } = await supabase.auth.admin.createUser({
        email: em,
        password: String(password).trim(),
        email_confirm: true,
        user_metadata: { rep: true, phone: p, name: nm }
      });
      if (error) {
        // إذا كان الحساب موجوداً مسبقاً في Auth نحدث كلمة مروره ونربطه
        const existing = await findAuthUserByEmail(em);
        if (existing) {
          const { error: upErr } = await supabase.auth.admin.updateUserById(existing.id, {
            password: String(password).trim(),
            email_confirm: true,
            user_metadata: { rep: true, phone: p, name: nm }
          });
          if (upErr) return res.status(400).json({ error: 'تعذّر تحديث حساب المندوب: ' + upErr.message });
          userId = existing.id;
        } else {
          return res.status(400).json({ error: 'تعذّر إنشاء الحساب: ' + error.message });
        }
      } else {
        userId = u.user.id;
      }

      const tgMeta = JSON.stringify({ co: co || 'متجرك', dep: '', ph: p });
      const row = { email: em, name: nm, role: 'rep', phone: p, auth_id: userId, telegram_chat_id: tgMeta, company: co || 'متجرك' };
      let { error: e2 } = await supabase.from('members').upsert(row, { onConflict: 'email' });
      if (e2 && /company/i.test(e2.message)) {
        delete row.company;
        ({ error: e2 } = await supabase.from('members').upsert(row, { onConflict: 'email' }));
      }
      if (e2) return res.status(500).json({ error: e2.message });
      return res.status(200).json({ ok: true, phone: p, email: em });
    }
    const { data: m } = await supabase.from('members').select('*').eq('email', email).eq('role', 'rep').maybeSingle();
    if (!m) return res.status(404).json({ error: 'المندوب غير موجود' });
    if (action === 'password') {
      if (String(password || '').length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
      let uid = m.auth_id;
      if (!uid) {
        const ex = await findAuthUserByEmail(m.email);
        if (ex) {
          uid = ex.id;
          await supabase.from('members').update({ auth_id: uid }).eq('email', m.email);
        }
      }
      if (!uid) return res.status(400).json({ error: 'حساب المندوب غير مرتبط في نظام الدخول' });
      const { error } = await supabase.auth.admin.updateUserById(uid, { password: String(password).trim(), email_confirm: true });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }
    if (action === 'set_company') {
      const co = String(company || 'متجرك').trim();
      const tgMeta = JSON.stringify({ co: co || 'متجرك', dep: '', ph: m.phone || '' });
      let { error } = await supabase.from('members').update({ telegram_chat_id: tgMeta, company: co || 'متجرك' }).eq('email', m.email);
      if (error && /company/i.test(error.message)) {
        ({ error } = await supabase.from('members').update({ telegram_chat_id: tgMeta }).eq('email', m.email));
      }
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
