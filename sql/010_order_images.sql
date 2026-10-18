-- 010: صورة توضيحية لكل صنف (يراها المندوب) + تُحذف تلقائياً بعد التسليم لتوفير المساحة
-- شغّله بعد 009 (آمن لإعادة التشغيل).

alter table ord_items add column if not exists image_path text;
alter table ord_settings add column if not exists image_keep_days int not null default 1 check (image_keep_days between 0 and 30);

-- مخزن خاص: صور مضغوطة فقط وبحد أقصى 1MB للصورة
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-images', 'order-images', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- هل هذه الصورة تخص طلباً مُسنداً للمندوب الحالي؟ (المسار: <معرّف الطلب>/<ملف>)
create or replace function ord_img_rep_ok(p text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ord_orders o where o.id::text = split_part(p, '/', 1) and lower(o.rep_email) = lower(auth.jwt() ->> 'email'));
$$;

drop policy if exists "v7 img staff" on storage.objects;
drop policy if exists "v7 img rep read" on storage.objects;
create policy "v7 img staff" on storage.objects for all to authenticated
  using (bucket_id = 'order-images' and is_member()) with check (bucket_id = 'order-images' and is_member());
create policy "v7 img rep read" on storage.objects for select to authenticated
  using (bucket_id = 'order-images' and ord_img_rep_ok(name));

-- المندوب يستلم مسار الصورة مع كل صنف
create or replace function rep_orders() returns table (
  id uuid, order_no bigint, order_date date, customer_name text, phone text, address text, notes text,
  status text, cancel_reason text, created_by_name text, delivered_at timestamptz, collect numeric, items jsonb)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_no, o.order_date, o.customer_name, o.phone, o.address, o.notes, o.status, o.cancel_reason,
         (select m.name from members m where lower(m.email) = lower(o.created_by)), o.delivered_at, o.balance,
         coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'supplier', i.supplier, 'image', i.image_path) order by i.pos) from ord_items i where i.order_id = o.id), '[]'::jsonb)
  from ord_orders o
  where lower(o.rep_email) = lower(auth.jwt() ->> 'email')
    and (o.status = 'preparing' or (o.status in ('delivered', 'cancelled') and coalesce(o.delivered_at, o.updated_at) > now() - interval '2 days'))
  order by (o.status = 'preparing') desc, o.order_no desc;
$$;
