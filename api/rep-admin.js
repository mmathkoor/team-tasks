// إدارة الموظفين والمناديب (للمدير فقط): إنشاء / تحديث / كلمة مرور جديدة / إزالة
const { supabase, member, SUPABASE_URL, DEFAULT_KEY } = require('../lib/auth');
const { normPhone, repEmail } = require('../lib/phone');

async function createAuthAccount(email, password, meta) {
  // المحاولة الأولى: عبر صلاحية service_role إن كانت مضبوطة
  try {
    const { data: u, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: meta || {}
    });
    if (!error && u && u.user) return { user: u.user, error: null };
  } catch (e) {}

  // المحاولة الثانية (تلقائية): عبر واجهة التسجيل المباشر في Supabase Auth
  try {
    const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_KEY;
    const r = await fetch(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, data: meta || {} })
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && (j.id || (j.user && j.user.id))) {
      return { user: j.user || { id: j.id, email }, error: null };
    }
    return { user: null, error: { message: j.msg || j.error_description || j.message || 'تعذّر إنشاء حساب المصادقة' } };
  } catch (e) {
    return { user: null, error: { message: e.message } };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const me = await member(req);
  if (!me) return res.status(401).json({ error: 'غير مسجّل الدخول — يرجى تحديث الصفحة والمحاولة مرة أخرى' });
  if (me.role !== 'admin') return res.status(403).json({ error: 'هذه الصلاحية للمدير فقط' });
  try {
    const { action, name, phone, password, email, role, title, telegram_chat_id } = req.body || {};
    if (action === 'create') {
      const nm = String(name || '').trim();
      const rawPhone = String(phone || '').trim();
      const p = rawPhone ? normPhone(rawPhone) : '';
      const targetRole = ['admin', 'member', 'rep'].includes(role) ? role : 'rep';
      if (nm.length < 2) return res.status(400).json({ error: 'اكتب الاسم بشكل صحيح' });
      if (!email && p.length < 9) return res.status(400).json({ error: 'اكتب رقم الجوال أو البريد الإلكتروني' });
      const minPw = targetRole === 'rep' ? 6 : 6;
      if (password && String(password).length < minPw) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });

      const em = (email && String(email).includes('@')) ? String(email).trim().toLowerCase() : repEmail(p);
      const orFilter = p ? ('phone.eq.' + p + ',email.eq.' + em) : ('email.eq.' + em);
      const { data: ex } = await supabase.from('members').select('email').or(orFilter);
      if (ex && ex.length) return res.status(409).json({ error: 'هذا المستخدم (البريد أو رقم الجوال) مضاف مسبقاً' });

      let authId = null;
      if (password) {
        const { user, error } = await createAuthAccount(em, String(password), { role: targetRole, phone: p || undefined, name: nm });
        if (error) return res.status(400).json({ error: 'تعذّر إنشاء الحساب: ' + error.message });
        authId = user && user.id ? user.id : null;
      }

      const row = { email: em, name: nm, role: targetRole };
      if (p) row.phone = p;
      if (authId) row.auth_id = authId;
      if (title) row.title = String(title).trim();
      if (telegram_chat_id) row.telegram_chat_id = telegram_chat_id;

      let { error: e2 } = await supabase.from('members').insert(row);
      if (e2 && /column .* does not exist/i.test(e2.message)) {
        // توافق مع قواعد البيانات التي لم تُشغّل كل ملفات الترقية بعد
        const safeRow = { email: em, name: nm, role: targetRole };
        if (telegram_chat_id) safeRow.telegram_chat_id = telegram_chat_id;
        ({ error: e2 } = await supabase.from('members').insert(safeRow));
      }
      if (e2) {
        if (authId) try { await supabase.auth.admin.deleteUser(authId); } catch (_) {}
        return res.status(500).json({ error: e2.message });
      }
      return res.status(200).json({ ok: true, email: em, phone: p });
    }

    const { data: m } = await supabase.from('members').select('*').eq('email', email).maybeSingle();
    if (!m) return res.status(404).json({ error: 'المستخدم غير موجود' });

    if (action === 'password') {
      if (String(password || '').length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
      if (m.auth_id) {
        const { error } = await supabase.auth.admin.updateUserById(m.auth_id, { password });
        if (!error) return res.status(200).json({ ok: true });
      }
      // إن لم يكن له auth_id مسجل سابقاً نحاول إنشاء أو ربط حسابه
      const { user, error: createErr } = await createAuthAccount(m.email, String(password), { name: m.name, role: m.role });
      if (!createErr && user && user.id) {
        await supabase.from('members').update({ auth_id: user.id }).eq('email', m.email);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: (createErr && createErr.message) || 'لتغيير كلمة مرور موظف آخر يلزم ضبط SUPABASE_SERVICE_ROLE_KEY في إعدادات الخادم' });
    }

    if (action === 'remove') {
      await supabase.from('members').delete().eq('email', m.email);
      if (m.auth_id) try { await supabase.auth.admin.deleteUser(m.auth_id); } catch (_) {}
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'إجراء غير معروف' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
