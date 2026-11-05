# خريطة المشروع (اقرأها أولاً قبل أي تعديل)

تطبيق ويب عربي RTL (PWA) لإدارة مهام الفريق + إدارة طلبات متجر إلكتروني. **بلا مكتبات واجهة ولا خطوة بناء**: ملفات JS عادية تُحمَّل بالترتيب من `index.html` وتشترك في النطاق العام. الخلفية: Supabase (قاعدة + دخول + تخزين) ودوال Vercel في `api/`.

## قواعد العمل (للمساعد)
1. اقرأ هذا الملف ثم عدّل مباشرة. لا تعد قراءة الملفات كلها. افتح فقط الملف المعني.
2. بعد كل تعديل: `node scripts/check.js` ثم الاختبار المناسب من `tests/` (انظر `tests/README.md`).
3. **لا تنشئ اسماً عاماً (`const/let/function`) موجوداً في ملف آخر** — يكسر التطبيق بصمت. الفاحص يكشفه.
4. أي نص من المستخدم داخل `innerHTML` يمرّ عبر `esc()`. لا مفاتيح سرية في الواجهة.
5. تغيير قاعدة البيانات = ملف جديد `sql/0NN_*.sql` (آمن لإعادة التشغيل) + إضافته إلى `update_all.sql` و`setup_all.sql` (تُولَّدان بجمع الملفات بالترتيب) + اختباره على PostgreSQL (`tests/pg`).
6. لا تكتب فوق `js/config.js` (فيه إعدادات الاتصال). المالك يعدّله يدوياً على GitHub أحياناً: اسحب (`git pull --rebase`) قبل أي رفع.
7. النشر: الدمج في `main` ينشر تلقائياً على Vercel. الـ token لا يستطيع فتح Pull Request، فيُدفع إلى فرع ثم يُدمج fast-forward في `main` بإذن المالك. تحقق من النشر عبر `GET /repos/mmathkoor/team-tasks/commits/<sha>/status`.
8. ارفع `js/version.js` مع كل إصدار (يظهر شريط «نسخة جديدة» للمستخدمين).

## ترتيب تحميل JS (index.html)
`boot, version, /api/config, config, brand, core, sync, helpers, priority, groups, tasks, orders, rep, reports, erp, ordadmin, task-extras, recurring, proposals, settings, ui, app, checklist, activity, dashboard, tools, realtime, inbox, alerts, main`
- **core**: اتصال Supabase المصغّر (`Q`, `sb`, `sb.rpc`, الدخول، `fetchAll` للصفحات). **app**: `init()`, `load()`, `render()` وتوزيع الشاشات. **ui**: القائمة السفلية، الترويسة، المظهر، إخفاء الشاشات. **tasks/groups/priority/checklist/task-extras/recurring**: المهام والفلترة المتقدمة. **orders/reports/ordadmin**: الطلبات، تصنيف الطلبات، وإرسال فواتير PDF مباشرة. **erp**: حزمة النظام المحاسبي المبسط (سندات، صندوق، موردون، عهد، مصروفات وأرباح). **rep**: واجهة المندوب. **settings**: الإعدادات المقسمة لتبويبات فرعية. **realtime/inbox/alerts/sync**: التحديث اللحظي والتنبيهات والعمل دون اتصال.
- الحالة كلها في الكائن العام `S` (`S.me, S.members, S.reps, S.tasks, S.orders, S.oitems, S.opay, S.ocost, S.ordSet, S.notes ...`). `load()` يجلب كل شيء ثم `render()`.

## الأدوار
`admin` (مدير)، `member` (عضو)، `rep` (مندوب توصيل: لا يرى المهام ولا الأسعار؛ يدخل برقم جواله عبر `/api/rep-login`؛ بياناته من دالتي `rep_orders()` و`rep_set_status()`).
`is_member()` في قاعدة البيانات يستثني `rep`، فتُغلق عليه كل جداول الفريق تلقائياً.

## قاعدة البيانات (`sql/`)
- `000_base` أساس قاعدة **جديدة فقط**. `001-012` تعديلات متراكمة. **`setup_all.sql`** = كل شيء من الصفر لنشاط جديد. **`update_all.sql`** = تحديث قاعدة مذكور ستور الحية (006 و008-012).
- أهم الجداول: members, meetings, tasks (+group_id, done_note, priority, flow), task_done, task_items, task_comments, task_files, recurring_tasks, activity, proposals, votes, notifications, push_subs, ord_orders / ord_items / ord_payments / ord_events / ord_item_costs (سعر الشراء: للمدير فقط) / ord_settings (صف واحد: إعدادات المتجر، الشاشات المخفية، اسم التطبيق).
- مجاميع الطلب (`subtotal, paid, total, balance`) تُحسب بمشغّلات، لا من المتصفح.
- Supabase يُرجع 1000 صف كحد أقصى في الطلب → استخدم `fetchAll`.
- سياسات UPDATE لازم تحمل `WITH CHECK` صريحاً وإلا فشلت الإحالة (خطأ حدث فعلاً، مصلَّح في 012).

## دوال الخادم (`api/`)
`notify` (إشعار + صندوق)، `order-push` (دفع إشعارات الطلبات)، `recur` (مهام متكررة، تُستدعى من الجدولة ومن التطبيق)، `remind` (تذكير يومي)، `rep-admin` (إنشاء/كلمة مرور/إزالة مندوب)، `rep-login`، `purge-images` (حذف صور الأصناف بعد التسليم)، `config` و`manifest` (إعدادات كل نشر).
المساعدات: `lib/auth.js` (عميل الخدمة + `member()`), `lib/push.js`, `lib/phone.js`, `lib/purge.js`.

## متغيرات البيئة (Vercel)
`SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET`، واختيارياً `APP_NAME, REP_EMAIL_DOMAIN, PHONE_COUNTRY, VAPID_SUBJECT`.

## تركيب نشاط جديد
`DEPLOY.md`. (ملاحظة: `js/config.js` مكتوب بمفاتيح ثابتة حالياً؛ تخصيصه لكل نشر بمتغيرات Vercel يحتاج إعادة ميزة `window.__CFG` إن طُلب.)

## أخطاء سابقة لا تتكرر
- كتابة فوق `js/config.js` الموجود. • اسم عام مكرر (`pct`, `fetchAll`) بين ملفين. • `WITH CHECK` غائب في سياسة UPDATE. • نافذة `dlg` تُغلق بالنقر خارجها وتضيع الكتابة (صارت محمية بـ `_dirty`). • الحقول `subtotal/paid` تُثبَّت في المشغّل فلا تُرسل من العميل. • ملفات الاختبار القديمة تتوقع تبويبات القائمة السابقة.
