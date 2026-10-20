-- =================================================================================
-- 014: الهيكلة المعمارية النظيفة (عزل حقيقي بأعمدة صريحة + RLS)
--      + نظام الحسابات المتكامل (حساب الموردين + عهدة المناديب + المصروفات وصافي الربح)
-- =================================================================================

-- 1) جدول الشركات والمتاجر المستقل (بدل التخزين داخل hidden_views أو localStorage)
create table if not exists companies (
  id text primary key,                        -- المعرّف النصي للشركة (مثال: 'متجرك'، 'مذكور ستور')
  display_name text not null,
  slogan text default '',
  logo text default '',
  phone text default '',
  address text default '',
  currency text not null default 'ر.ي',
  tax_no text default '',
  accent text not null default '#c9a24e',
  footer text default 'شكراً لتعاملكم معنا وثقتكم بنا 🌹',
  staff_can_cost boolean not null default false,
  image_keep_days int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into companies (id, display_name)
values ('متجرك', 'متجرك')
on conflict (id) do nothing;

-- 2) أعمدة صريحة في جدول الأعضاء (members) بدل الحيل داخل telegram_chat_id
alter table members add column if not exists company text default 'متجرك';
alter table members add column if not exists department text default '';
alter table members add column if not exists phone text;
alter table members add column if not exists permissions jsonb default '{}'::jsonb;

-- ترحيل بيانات الأعضاء المخزنة سابقاً كـ JSON في telegram_chat_id إلى الأعمدة الصريحة
update members
set
  company = coalesce(nullif(trim(company), ''), nullif(trim((telegram_chat_id::jsonb ->> 'co')), ''), 'متجرك'),
  department = coalesce(nullif(trim(department), ''), coalesce((telegram_chat_id::jsonb ->> 'dep'), '')),
  phone = coalesce(nullif(trim(phone), ''), nullif(trim((telegram_chat_id::jsonb ->> 'ph')), ''))
where telegram_chat_id is not null and telegram_chat_id like '{%';

-- 3) أعمدة صريحة للشركة (company_id) في جداول المهام والطلبات والاجتماعات والمقترحات
alter table tasks add column if not exists company_id text not null default 'متجرك';
alter table ord_orders add column if not exists company_id text not null default 'متجرك';
alter table meetings add column if not exists company_id text not null default 'متجرك';
alter table proposals add column if not exists company_id text not null default 'متجرك';

create index if not exists tasks_company_id_idx on tasks(company_id);
create index if not exists ord_orders_company_id_idx on ord_orders(company_id);

-- استخراج اسم الشركة من وسم [شركة: ...] القديم في ملاحظات المهام والطلبات ثم تنظيف الملاحظات نهائياً
update tasks
set
  company_id = coalesce(nullif(trim((regexp_match(notes, '\[شركة:\s*([^\]]+)\]'))[1]), ''), company_id, 'متجرك'),
  notes = nullif(trim(regexp_replace(coalesce(notes, ''), '\[شركة:\s*[^\]]+\]\n?', '', 'g')), '')
where notes like '%[شركة:%';

update ord_orders
set
  company_id = coalesce(nullif(trim((regexp_match(notes, '\[شركة:\s*([^\]]+)\]'))[1]), ''), company_id, 'متجرك'),
  notes = nullif(trim(regexp_replace(coalesce(notes, ''), '\[شركة:\s*[^\]]+\]\n?', '', 'g')), '')
where notes like '%[شركة:%';

-- 4) دوال التحقق والعزل الحقيقي على مستوى قاعدة البيانات (Row-Level Security)
create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where lower(m.email) = lower(auth.jwt() ->> 'email') and coalesce(m.role, 'member') <> 'rep');
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where lower(m.email) = lower(auth.jwt() ->> 'email') and m.role = 'admin');
$$;

create or replace function is_rep() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where lower(m.email) = lower(auth.jwt() ->> 'email') and m.role = 'rep');
$$;

create or replace function current_user_company() returns text
language sql stable security definer set search_path = public as $$
  select case
    -- المدير العام الذي شركته فارغة أو '__all' يرى كل الشركات
    when m.role = 'admin' and (m.company is null or trim(m.company) = '' or trim(m.company) = '__all') then null
    else coalesce(nullif(trim(m.company), ''), 'متجرك')
  end
  from members m
  where lower(m.email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;

create or replace function can_access_company(row_company text) returns boolean
language sql stable security definer set search_path = public as $$
  select
    is_member() and (
      current_user_company() is null
      or lower(coalesce(nullif(trim(row_company), ''), 'متجرك')) = lower(current_user_company())
    );
$$;

-- تفعيل سياسات العزل الصارم على جدول الشركات
alter table companies enable row level security;
drop policy if exists "companies_read" on companies;
drop policy if exists "companies_write" on companies;
create policy "companies_read" on companies for select using (is_member() or is_rep());
create policy "companies_write" on companies for all using (is_admin()) with check (is_admin());

-- تحديث سياسات المهام والطلبات لتعتمد على can_access_company(company_id)
drop policy if exists "read all" on tasks;
create policy "read all" on tasks for select using (can_access_company(company_id));

drop policy if exists "v6 ord staff all" on ord_orders;
create policy "v6 ord staff all" on ord_orders for all
  using (can_access_company(company_id))
  with check (can_access_company(company_id));

-- =================================================================================
-- 5) الجداول المالية الجديدة (الموردين + عهدة المناديب + المصروفات)
-- =================================================================================

-- أ) جدول دفعات الموردين / التجار (كم اشتريت وكم دفعت وكم بقي)
create table if not exists erp_supplier_payments (
  id uuid primary key default gen_random_uuid(),
  company_id text not null default 'متجرك',
  supplier_name text not null,
  entry_type text not null default 'payment' check (entry_type in ('payment', 'purchase')), -- payment = دفعة سداد للتاجر، purchase = فاتورة شراء إضافية
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'نقداً',
  paid_on date not null default ((now() at time zone 'Asia/Aden')::date),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists erp_sup_co_idx on erp_supplier_payments(company_id, supplier_name);
alter table erp_supplier_payments enable row level security;
drop policy if exists "erp_sup_all" on erp_supplier_payments;
create policy "erp_sup_all" on erp_supplier_payments for all
  using (can_access_company(company_id))
  with check (can_access_company(company_id));

-- ب) جدول تسليم عهدة المناديب (كم حصّل نقداً وكم سلّمك)
create table if not exists erp_rep_handovers (
  id uuid primary key default gen_random_uuid(),
  company_id text not null default 'متجرك',
  rep_email text not null,
  entry_type text not null default 'handover' check (entry_type in ('handover', 'collect_adj')), -- handover = توريد من المندوب للصندوق، collect_adj = تسوية تحصيل
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'نقداً',
  handed_on date not null default ((now() at time zone 'Asia/Aden')::date),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists erp_rep_co_idx on erp_rep_handovers(company_id, rep_email);
alter table erp_rep_handovers enable row level security;
drop policy if exists "erp_rep_all" on erp_rep_handovers;
create policy "erp_rep_all" on erp_rep_handovers for all
  using (can_access_company(company_id))
  with check (can_access_company(company_id));

-- ج) جدول المصروفات التشغيلية (الإعلانات، الرواتب، الإيجارات، النقل، إلخ)
create table if not exists erp_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id text not null default 'متجرك',
  category text not null default 'إعلانات وترويج', -- إعلانات وترويج | رواتب وأجور | إيجارات وفواتير | نقل وتوصيل | تغليف ومستلزمات | مصروفات أخرى
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'نقداً',
  spent_on date not null default ((now() at time zone 'Asia/Aden')::date),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists erp_exp_co_idx on erp_expenses(company_id, spent_on desc);
alter table erp_expenses enable row level security;
drop policy if exists "erp_exp_all" on erp_expenses;
create policy "erp_exp_all" on erp_expenses for all
  using (can_access_company(company_id))
  with check (can_access_company(company_id));

-- 6) ترقية دالة طلبات المندوب لتشمل السجل الكامل وتفاصيل الفاتورة والإيصال الحراري
drop function if exists rep_orders();
create or replace function rep_orders() returns table (
  id uuid, order_no bigint, order_date date, customer_name text, phone text, address text, notes text,
  status text, cancel_reason text, created_by_name text, delivered_at timestamptz,
  collect numeric, subtotal numeric, delivery_fee numeric, discount numeric, total numeric, paid numeric, balance numeric, company_id text, items jsonb)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_no, o.order_date, o.customer_name, o.phone, o.address, o.notes, o.status, o.cancel_reason,
         (select m.name from members m where lower(m.email) = lower(o.created_by)), o.delivered_at,
         o.balance as collect, o.subtotal, o.delivery_fee, o.discount, o.total, o.paid, o.balance,
         coalesce(o.company_id, 'متجرك'),
         coalesce((select jsonb_agg(jsonb_build_object(
           'name', i.name,
           'qty', i.qty,
           'price', i.price,
           'line_total', i.line_total,
           'supplier', i.supplier,
           'image', i.image_path
         ) order by i.pos) from ord_items i where i.order_id = o.id), '[]'::jsonb)
  from ord_orders o
  where lower(o.rep_email) = lower(auth.jwt() ->> 'email')
  order by (o.status = 'preparing') desc, o.order_no desc;
$$;
grant execute on function rep_orders() to authenticated;

-- 7) دوال مساعدة للمدير لإنشاء حسابات الموظفين والمناديب وتعيين كلمات المرور بدون مشاكل التفعيل
create extension if not exists pgcrypto;

create or replace function public.admin_create_auth_user(
  p_email text,
  p_password text,
  p_name text default null,
  p_phone text default null,
  p_role text default 'member'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid;
  v_encrypted text;
begin
  if not is_admin() then
    raise exception 'للمدير فقط';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(p_email);
  v_encrypted := crypt(p_password, gen_salt('bf'));

  if v_uid is not null then
    update auth.users
    set encrypted_password = v_encrypted,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('name', p_name, 'phone', p_phone, 'role', p_role),
        updated_at = now()
    where id = v_uid;
    return v_uid;
  end if;

  v_uid := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, recovery_sent_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid,
    'authenticated',
    'authenticated',
    lower(p_email),
    v_encrypted,
    now(),
    null,
    null,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name, 'phone', p_phone, 'role', p_role),
    now(),
    now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_uid,
    v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', lower(p_email)),
    'email',
    null,
    now(),
    now()
  ) on conflict (provider, id) do nothing;

  return v_uid;
end;
$$;

create or replace function public.admin_set_user_password(p_email text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid;
begin
  if not is_admin() then
    raise exception 'للمدير فقط';
  end if;
  
  select id into v_uid from auth.users where lower(email) = lower(p_email);
  if v_uid is null then
    return false;
  end if;
  
  update auth.users
  set encrypted_password = crypt(p_password, gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = v_uid;
  
  return true;
end;
$$;

grant execute on function public.admin_create_auth_user(text, text, text, text, text) to authenticated;
grant execute on function public.admin_set_user_password(text, text) to authenticated;
