# تركيب نشاط جديد (قاعدة بيانات منفصلة + نشر منفصل) — نفس الكود

كل نشاط (مذكور ستور، متجرك، أي عميل) = **مشروع Supabase خاص به + مشروع Vercel خاص به**، والكود واحد (هذا المستودع).

## 1) قاعدة البيانات (Supabase) — حوالي 10 دقائق
1. supabase.com ← New project (اسم النشاط، كلمة مرور قوية للقاعدة، المنطقة الأقرب).
2. SQL Editor ← **+** ← New snippet (الزر الأعلى على Database).
3. الصق محتوى `sql/setup_all.sql` كاملاً ← Run. (يُشغَّل مرة واحدة على مشروع **فارغ** فقط.)
4. أضف المدير الأول (غيّر الإيميل والاسم) ← Run:
   ```sql
   insert into members (email, name, role) values ('owner@example.com', 'اسم المالك', 'admin');
   ```
5. Authentication ← Users ← **Add user**: نفس إيميل المدير + كلمة مرور (Auto Confirm).
6. Authentication ← أوقف «Allow new users to sign up»، وارفع الحد الأدنى لكلمة المرور إلى 10.
7. Project Settings ← API: انسخ `Project URL` و`anon key` و`service_role key`.

## 2) النشر (Vercel)
1. Add New ← Project ← نفس المستودع (`mmathkoor/team-tasks`) ← Deploy.
2. Settings ← Environment Variables (لكل نشر قيمه الخاصة):

| المتغير | القيمة |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (سرّي) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | يُولَّدان بالأمر `npx web-push generate-vapid-keys` (**مفاتيح مختلفة لكل نشاط**) |
| `CRON_SECRET` | نص عشوائي طويل |
| `APP_NAME` | اسم النشاط (يظهر على الجوال عند التثبيت) |
| `REP_EMAIL_DOMAIN` | اختياري: نطاق المندوبين الداخلي (الافتراضي `rep.invalid`) |

3. Deployments ← Redeploy (ليقرأ المتغيرات).
4. افتح الموقع وسجّل بإيميل المدير، ثم من الإعدادات: اسم التطبيق، الشاشات الظاهرة، إعدادات المتجر، وأضف الأعضاء والمناديب.

## 3) التحديثات لاحقاً
- تعديل الكود: يُدمج في المستودع فيتحدث **كل** الأنشطة تلقائياً.
- تعديل قاعدة البيانات: ملف `sql/0NN_*.sql` جديد يُشغَّل يدوياً في **كل** مشروع Supabase.

## ملاحظات
- Supabase المجاني يسمح بمشروعين نشطين فقط ويوقف المشروع بعد أسبوع بلا نشاط؛ وVercel المجاني للاستخدام غير التجاري. للأعمال التجارية يُنصح بالخطط المدفوعة.
- بيانات كل نشاط معزولة تماماً عن الآخر.
