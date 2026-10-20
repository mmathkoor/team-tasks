// إعدادات هذا النشر (تختلف من نشاط لآخر بمتغيرات البيئة في Vercel) — تسمح بنفس الكود لقاعدتين منفصلتين
module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  const cfg = url && key ? { url, key, vapid: process.env.VAPID_PUBLIC_KEY || null, name: process.env.APP_NAME || null } : null;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  res.status(200).send('window.__CFG=' + JSON.stringify(cfg) + ';');
};
