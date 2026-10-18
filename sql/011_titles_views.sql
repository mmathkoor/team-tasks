-- 011: مسمّى وظيفي لكل عضو + إخفاء/إظهار الشاشات (للمدير) + اسم التطبيق
alter table members add column if not exists title text;     -- مثال: مسؤول التسويق، المسؤول المالي
drop policy if exists "v8 members admin edit" on members;
create policy "v8 members admin edit" on members for update using (is_admin());

alter table ord_settings add column if not exists hidden_views text[] not null default '{}';
alter table ord_settings add column if not exists app_name text;
