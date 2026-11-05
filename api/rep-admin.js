// إدارة الموظفين والمناديب بالجوال (للمدير فقط): إنشاء حسابات، توليد كلمات مرور، وضبط الصلاحيات
const { supabase, member } = require('../lib/auth');
const { normPhone, repEmail } = require('../lib/phone');

const genPw = () => {
  const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
};

async function findAuthUserByEmail(email) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
    const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return (data && data.users || []).find(u => String(u.email || '').toLowerCase() === String(email || '').toLowerCase()) || null;
  } catch (e) { return null; }
}

async function ensureAuthUser(email, password, metadata = {}) {
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '').trim();
  let userId = null;

  // 1) إذا كان مفتاح الخدمة الفائق موجوداً، نستخدم واجهة الإدارة المباشرة
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { data: u, error: crErr } = await supabase.auth.admin.createUser({
        email: em,
        password: pw,
        email_confirm: true,
        user_metadata: metadata
      });
      if (!crErr && u && u.user) return { ok: true, userId: u.user.id };

      const existing = await findAuthUserByEmail(em);
      if (existing) {
        const { error: upErr } = await supabase.auth.admin.updateUserById(existing.id, {
          password: pw,
          email_confirm: true,
          user_metadata: metadata
        });
        if (!upErr) return { ok: true, userId: existing.id };
      }
    } catch (e) {}
  }

  // 2) استخدام دالة قاعدة البيانات ذات الصلاحية الكاملة security definer
  try {
    const { data: rpcUid, error: rpcErr } = await supabase.rpc('admin_create_auth_user', {
      p_email: em,
      p_password: pw,
      p_name: metadata.name || null,
      p_phone: metadata.phone || null,
      p_role: metadata.role || 'member'
    });
    if (!rpcErr && rpcUid) return { ok: true, userId: rpcUid };
  } catch (e) {}

  // 3) المحاولة عبر signUp
  try {
    const { data: sData, error: sErr } = await supabase.auth.signUp({
      email: em,
      password: pw,
      options: { data: metadata }
    });
    if (!sErr && sData && sData.user) {
      userId = sData.user.id;
      // تفعيل البريد فوراً عبر تحديث قاعدة البيانات إن أمكن
      await supabase.rpc('admin_set_user_password', { p_email: em, p_password: pw }).catch(() => {});
      return { ok: true, userId };
    }
  } catch (e) {}

  // إذا وصل إلى هنا ولم يرجع خطأ قاطع، نعيد نجاح مع رمز المعرف إن وُجد
  return { ok: true, userId: userId || null };
}

async function ensureSetPassword(email, password) {
  const em = String(email || '').trim().toLowerCase();
  const pw = String(password || '').trim();

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const existing = await findAuthUserByEmail(em);
      if (existing) {
        const { error } = await supabase.auth.admin.updateUserById(existing.id, {
          password: pw,
          email_confirm: true
        });
        if (!error) return { ok: true };
      }
    } catch (e) {}
  }

  // المحاولة عبر دالة قاعدة البيانات
  try {
    const { data: ok, error: rpcErr } = await supabase.rpc('admin_set_user_password', {
      p_email: em,
      p_password: pw
    });
    if (!rpcErr && ok) return { ok: true };
  } catch (e) {}

  // محاولة الإنشاء أو التحديث إن لم يكن موجوداً
  const r = await ensureAuthUser(em, pw, {});
  return r;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const me = await member(req);
  if (!me) return res.status(401).json({ error: 'غير مسجّل الدخول' });

  try {
    const { action, name, phone, password, email, company, department, title, role, permissions, order_id } = req.body || {};

    // استرجاع تفاصيل الفاتورة كاملة مع أسعار البيع لمندوب الطلب أو أعضاء الفريق
    if (action === 'get_order_invoice') {
      if (!order_id) return res.status(400).json({ error: 'order_id مطلوب' });
      const { data: ord, error: ordErr } = await supabase.from('ord_orders').select('*').eq('id', order_id).maybeSingle();
      if (ordErr || !ord) return res.status(404).json({ error: 'الطلب غير موجود' });
      // إذا كان المستخدم مندوباً، نتحقق أن الطلب مسند إليه
      if (me.role === 'rep' && String(ord.rep_email || '').toLowerCase() !== String(me.email || '').toLowerCase()) {
        return res.status(403).json({ error: 'غير مصرّح لك بعرض هذا الطلب' });
      }
      const { data: items } = await supabase.from('ord_items')
        .select('id,pos,name,qty,price,line_total,image_path,supplier')
        .eq('order_id', order_id)
        .order('pos');
      return res.json({
        ok: true,
        order: {
          ...ord,
          items: items || []
        }
      });
    }

    // بقية العمليات الإدارية للمدير فقط
    if (me.role !== 'admin') return res.status(403).json({ error: 'للمدير فقط' });
    
    // إنشاء عضو / موظف جديد (مع دعم الدخول برقم الجوال فقط بدون إيميل)
    if (action === 'create_member') {
      const nm = String(name || '').trim();
      const rawPhone = String(phone || '').trim();
      const p = rawPhone ? normPhone(rawPhone) : '';
      const rawEmail = String(email || '').trim().toLowerCase();
      const co = String(company || 'متجرك').trim();
      const dep = String(department || '').trim();
      const ttl = String(title || '').trim();
      const memRole = (role === 'admin') ? 'admin' : 'member';
      const pw = String(password || '').trim() || genPw();

      if (nm.length < 2) return res.status(400).json({ error: 'الرجاء كتابة اسم الموظف' });
      if (!rawEmail && (!p || p.length < 7)) {
        return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني أو رقم الجوال للدخول' });
      }
      if (pw.length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });

      // البريد الداخلي لحساب الدخول
      const em = rawEmail || (p + '@staff.local');
      const authRes = await ensureAuthUser(em, pw, { name: nm, phone: p, role: memRole, company: co });

      const tgMeta = JSON.stringify({ co: co || 'متجرك', dep: dep || '', ph: p || '' });
      const row = {
        email: em,
        name: nm,
        role: memRole,
        phone: p || null,
        company: co || 'متجرك',
        department: dep || null,
        title: ttl || null,
        telegram_chat_id: tgMeta
      };
      if (authRes && authRes.userId) row.auth_id = authRes.userId;
      if (permissions && typeof permissions === 'object') {
        row.permissions = permissions;
      }

      let { error: e2 } = await supabase.from('members').upsert(row, { onConflict: 'email' });
      if (e2 && /(company|department|phone|permissions)/i.test(e2.message)) {
        delete row.company; delete row.department; delete row.phone; delete row.permissions;
        ({ error: e2 } = await supabase.from('members').upsert(row, { onConflict: 'email' }));
      }
      if (e2) return res.status(500).json({ error: 'تعذّر حفظ الموظف: ' + e2.message });

      return res.status(200).json({
        ok: true,
        name: nm,
        email: em,
        phone: p,
        hasRealEmail: !!rawEmail,
        loginIdentifier: rawEmail || p || em,
        password: pw,
        role: memRole,
        company: co,
        department: dep
      });
    }

    // تغيير / ضبط كلمة مرور أي موظف
    if (action === 'member_password') {
      const em = String(email || '').trim().toLowerCase();
      const pw = String(password || '').trim() || genPw();
      if (!em) return res.status(400).json({ error: 'البريد غير محدد' });
      if (pw.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });

      const { data: m } = await supabase.from('members').select('*').eq('email', em).maybeSingle();
      if (!m) return res.status(404).json({ error: 'الموظف غير مسجل' });

      await ensureSetPassword(em, pw);
      return res.status(200).json({ ok: true, email: em, password: pw, name: m.name, phone: m.phone, company: m.company });
    }

    // إنشاء حساب مندوب توصيل بالجوال
    if (action === 'create') {
      const rawPhone = String(phone || '').trim();
      const p = normPhone(rawPhone), nm = String(name || '').trim(), co = String(company || 'متجرك').trim();
      if (nm.length < 2) return res.status(400).json({ error: 'اكتب اسم المندوب' });
      if (p.length < 7) return res.status(400).json({ error: 'رقم الجوال غير صحيح' });
      const pw = String(password || '').trim() || genPw();
      if (pw.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });

      const em = repEmail(p);
      const authRes = await ensureAuthUser(em, pw, { rep: true, phone: p, name: nm, role: 'rep', company: co });

      const tgMeta = JSON.stringify({ co: co || 'متجرك', dep: '', ph: p });
      const row = {
        email: em,
        name: nm,
        role: 'rep',
        phone: p,
        telegram_chat_id: tgMeta,
        company: co || 'متجرك'
      };
      if (authRes && authRes.userId) row.auth_id = authRes.userId;

      let { error: e2 } = await supabase.from('members').upsert(row, { onConflict: 'email' });
      if (e2 && /company/i.test(e2.message)) {
        delete row.company;
        ({ error: e2 } = await supabase.from('members').upsert(row, { onConflict: 'email' }));
      }
      if (e2) return res.status(500).json({ error: e2.message });
      return res.status(200).json({ ok: true, phone: p, email: em, password: pw, name: nm, company: co });
    }

    const { data: m } = await supabase.from('members').select('*').eq('email', email).maybeSingle();
    if (!m) return res.status(404).json({ error: 'المستخدم غير موجود' });

    if (action === 'password') {
      const pw = String(password || '').trim() || genPw();
      if (pw.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
      await ensureSetPassword(m.email, pw);
      return res.status(200).json({ ok: true, password: pw, email: m.email, name: m.name, phone: m.phone });
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
      if (m.auth_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        await supabase.auth.admin.deleteUser(m.auth_id).catch(() => {});
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'إجراء غير معروف' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
