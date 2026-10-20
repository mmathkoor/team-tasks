# الاختبارات (لا تُنشر مع التطبيق)

```bash
node scripts/check.js                       # فحص الصياغة والأسماء المكررة (ثانيتان)
cd tests && npm i && cd ..                  # مرة واحدة (jsdom)
for t in tests/*.smoke.js; do node $t; done # اختبارات الواجهة (تطبع JSON، والمطلوب errs: [])
python3 -m venv /tmp/pgenv && /tmp/pgenv/bin/pip install pgserver psycopg2-binary   # مرة واحدة
/tmp/pgenv/bin/python tests/pg/orders_rls.py     # صلاحيات الطلبات والمناديب (يجب ألا يظهر FAIL)
/tmp/pgenv/bin/python tests/pg/fresh_install.py  # setup_all.sql على قاعدة فارغة
/tmp/pgenv/bin/python tests/pg/live_update.py    # update_all.sql على قاعدة تشبه الحية
```
ملاحظة: بعض اختبارات الواجهة تتوقع تبويبات/عناصر محددة؛ إن غيّرت الواجهة عن قصد فحدّث الاختبار المقابل.
