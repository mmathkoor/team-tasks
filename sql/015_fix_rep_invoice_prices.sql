-- ==============================================================================
-- 015: ترقية وتصحيح واجهة إيصالات وفواتير المندوب (إرجاع أسعار الأصناف والإجمالي كاملاً)
-- ==============================================================================

-- 1) إسقاط النسخ القديمة ذات الـ 12 عموداً الخالية من الأسعار لتجنب خطأ PostgreSQL:
-- "cannot change return type of existing function"
drop function if exists rep_orders();

-- 2) إنشاء دالة طلبات المندوب الشاملة لأسعار البيع والإجماليات
create or replace function rep_orders() returns table (
  id uuid,
  order_no bigint,
  order_date date,
  customer_name text,
  phone text,
  address text,
  notes text,
  status text,
  cancel_reason text,
  created_by_name text,
  delivered_at timestamptz,
  collect numeric,
  subtotal numeric,
  delivery_fee numeric,
  discount numeric,
  total numeric,
  paid numeric,
  balance numeric,
  company_id text,
  items jsonb
)
language sql stable security definer set search_path = public as $$
  select o.id,
         o.order_no,
         o.order_date,
         o.customer_name,
         o.phone,
         o.address,
         o.notes,
         o.status,
         o.cancel_reason,
         (select m.name from members m where lower(m.email) = lower(o.created_by)),
         o.delivered_at,
         coalesce(o.balance, (o.subtotal + o.delivery_fee - o.discount - o.paid), 0) as collect,
         coalesce(o.subtotal, 0) as subtotal,
         coalesce(o.delivery_fee, 0) as delivery_fee,
         coalesce(o.discount, 0) as discount,
         coalesce(o.total, (o.subtotal + o.delivery_fee - o.discount), 0) as total,
         coalesce(o.paid, 0) as paid,
         coalesce(o.balance, (o.subtotal + o.delivery_fee - o.discount - o.paid), 0) as balance,
         coalesce(o.company_id, 'متجرك') as company_id,
         coalesce((select jsonb_agg(jsonb_build_object(
           'name', i.name,
           'qty', coalesce(i.qty, 1),
           'price', coalesce(i.price, 0),
           'line_total', coalesce(i.line_total, (coalesce(i.qty, 1) * coalesce(i.price, 0))),
           'supplier', i.supplier,
           'image', i.image_path
         ) order by i.pos) from ord_items i where i.order_id = o.id), '[]'::jsonb) as items
  from ord_orders o
  where lower(o.rep_email) = lower(auth.jwt() ->> 'email')
  order by (o.status = 'preparing') desc, o.order_no desc;
$$;

revoke all on function rep_orders() from public, anon;
grant execute on function rep_orders() to authenticated;
