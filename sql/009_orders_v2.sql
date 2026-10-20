-- 009: التاجر وسعر الشراء لكل صنف + إعدادات المتجر + المندوب بالجوال (بدون إيميل)
-- شغّله بعد 008 (آمن لإعادة التشغيل ولا يحذف بيانات).

-- ===== المندوب برقم الجوال =====
alter table members add column if not exists phone text;
alter table members add column if not exists auth_id uuid;
create unique index if not exists members_phone_uidx on members (phone) where phone is not null;

-- ===== التاجر (من أين يُشترى الصنف): يراه الفريق والمندوب =====
alter table ord_items add column if not exists supplier text;

-- ===== إعدادات الطلبات (صف واحد) =====
create table if not exists ord_settings (
  id boolean primary key default true check (id),
  staff_can_cost boolean not null default false,     -- هل يرى الموظفون سعر الشراء ويدخلونه؟ (المدير دائماً نعم)
  store_name text, store_phone text, store_address text
);
insert into ord_settings (id) values (true) on conflict do nothing;
alter table ord_settings enable row level security;
drop policy if exists "v6 set read" on ord_settings; drop policy if exists "v6 set edit" on ord_settings;
create policy "v6 set read" on ord_settings for select using (is_member());
create policy "v6 set edit" on ord_settings for update using (is_admin());

create or replace function ord_cost_ok() returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or (is_member() and coalesce((select s.staff_can_cost from ord_settings s limit 1), false));
$$;

-- ===== سعر الشراء: جدول منفصل لا يقرؤه إلا المدير (أو الموظفون إن سمحت) — ولا يصل المندوب أبداً =====
create table if not exists ord_item_costs (
  item_id uuid primary key references ord_items(id) on delete cascade,
  cost numeric not null default 0 check (cost >= 0)
);
alter table ord_item_costs enable row level security;
drop policy if exists "v6 cost all" on ord_item_costs;
create policy "v6 cost all" on ord_item_costs for all using (ord_cost_ok()) with check (ord_cost_ok());

-- ===== واجهة المندوب: تضيف اسم التاجر لكل صنف (بدون أي سعر) =====
create or replace function rep_orders() returns table (
  id uuid, order_no bigint, order_date date, customer_name text, phone text, address text, notes text,
  status text, cancel_reason text, created_by_name text, delivered_at timestamptz, collect numeric, items jsonb)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_no, o.order_date, o.customer_name, o.phone, o.address, o.notes, o.status, o.cancel_reason,
         (select m.name from members m where lower(m.email) = lower(o.created_by)), o.delivered_at, o.balance,
         coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'supplier', i.supplier) order by i.pos) from ord_items i where i.order_id = o.id), '[]'::jsonb)
  from ord_orders o
  where lower(o.rep_email) = lower(auth.jwt() ->> 'email')
    and (o.status = 'preparing' or (o.status in ('delivered', 'cancelled') and coalesce(o.delivered_at, o.updated_at) > now() - interval '2 days'))
  order by (o.status = 'preparing') desc, o.order_no desc;
$$;
