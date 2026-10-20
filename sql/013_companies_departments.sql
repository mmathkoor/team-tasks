-- 013: دعم تعدد الشركات (عزل بيانات كل شركة) + الإدارات والأقسام + صلاحيات تعديل الأعضاء للمدير
alter table members add column if not exists title text;
alter table members add column if not exists company text;
alter table members add column if not exists department text;

-- منح الصلاحيات وسياسات الأمان (RLS) لتمكين المدير من تعديل وإضافة وحذف الأعضاء وإعدادات الشركات
grant select, insert, update, delete on table public.members to authenticated;
grant select, insert, update on table public.ord_settings to authenticated;

drop policy if exists "v8 members admin edit" on members;
create policy "v8 members admin edit" on members for update using (is_admin()) with check (is_admin());

drop policy if exists "members admin add" on members;
create policy "members admin add" on members for insert with check (is_admin());

drop policy if exists "members admin remove" on members;
create policy "members admin remove" on members for delete using (is_admin());

-- دالة مساعدة لمعرفة شركة المستخدم الحالي (إن وُجدت)
create or replace function current_user_company() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(trim(m.company), ''),
    case when m.telegram_chat_id like '{%' then (m.telegram_chat_id::jsonb ->> 'co') else null end
  )
  from members m
  where lower(m.email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;

-- دالة تتحقق من أن المستخدم في نفس الشركة (أو مدير عام لكل الشركات)
create or replace function same_company_as(target_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select
    (is_admin() and current_user_company() is null)
    or current_user_company() is null
    or lower(coalesce(current_user_company(), '')) = lower(coalesce((
      select coalesce(
        nullif(trim(m.company), ''),
        case when m.telegram_chat_id like '{%' then (m.telegram_chat_id::jsonb ->> 'co') else null end
      )
      from members m
      where lower(m.email) = lower(target_email)
      limit 1
    ), ''));
$$;
