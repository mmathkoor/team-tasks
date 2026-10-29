// إعدادات هذا النشر (تختلف من نشاط لآخر بمتغيرات البيئة في Vercel) — تسمح بنفس الكود لقاعدتين منفصلتين
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndybXB5eXdvc2F0aHF4cmp1aWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDg2NDQsImV4cCI6MjEwNzQ4NDY0NH0.CoSwCocuTVWlVU6QBNpp_bZiuykVkMHSHpT11KC1uvU';
module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL || 'https://wrmpyywosathqxrjuicx.supabase.co';
  const rawKey = process.env.SUPABASE_ANON_KEY;
  // حماية حاسمة: مفتاح Supabase Anon يجب أن يبدأ دائماً بـ eyJ (JWT) وليس مفتاح VAPID أو نص عشوائي
  const key = (rawKey && rawKey.startsWith('eyJ')) ? rawKey : DEFAULT_KEY;
  const cfg = { url, key, vapid: process.env.VAPID_PUBLIC_KEY || null, name: process.env.APP_NAME || null };
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  res.status(200).send('window.__CFG=' + JSON.stringify(cfg) + ';');
};

