# مهام الفريق

## 1) قاعدة البيانات (Supabase – مجاني)
1. أنشئ مشروعاً في supabase.com
2. SQL Editor ← الصق محتوى `supabase.sql` (بعد تعديل الإيميلات الأربعة) ← Run
3. Project Settings ← API: انسخ Project URL و anon key وضعهما أعلى `index.html`
4. Authentication ← URL Configuration: ضع رابط vercel.app في Site URL

## 2) الرفع
GitHub ← New repo ← ارفع الملفات ← Vercel ← Import Project ← Deploy

## 3) التذكيرات (Vercel ← Settings ← Environment Variables)
- SUPABASE_URL , SUPABASE_SERVICE_KEY (service_role، سرّي، لا تضعه في index.html)
- TELEGRAM_BOT_TOKEN (من @BotFather) — كل عضو يراسل البوت ويأخذ Chat ID من @userinfobot ثم يحفظه في الصفحة
- RESEND_API_KEY , MAIL_FROM (اختياري للإيميل)
- MEETING_DAY (0 الأحد … 6 السبت) يوم الاجتماع: يصل الجميع ملخص كل المهام
- CRON_SECRET (أي نص طويل عشوائي)
