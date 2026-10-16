-- فحص أمني (قراءة فقط، لا يغيّر شيئاً): شغّله ثم صدّر النتيجة CSV وأرسلها
select c.relname as table_name, c.relrowsecurity as rls_on,
       p.policyname, p.cmd, p.qual as using_expr, p.with_check
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
where c.relkind = 'r'
order by c.relname, p.policyname;
