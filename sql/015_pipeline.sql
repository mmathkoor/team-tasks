-- 015: خط نشر المنتجات (استلام من المورد → تصميم ومحتوى → نشر على المنصات) + حالة التفرّغ للردود
-- شغّله بعد 014 (آمن لإعادة التشغيل). الصور تُخزَّن في المخزن الخاص order-images تحت المسار pl/<معرّف المنتج>/ وتُحذف بعد النشر.

create table if not exists pl_products (
  id uuid primary key default gen_random_uuid(),
  company_id text not null default 'متجرك',
  title text not null,
  supplier text,
  supplier_url text,
  source_price numeric,
  sell_price numeric,
  raw_desc text,
  content_title text,
  content_desc text,
  hashtags text,
  stage text not null default 'intake' check (stage in ('intake', 'design', 'publish', 'done')),
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  design_by text,
  publish_by text,
  return_note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  to_design_at timestamptz,
  design_done_at timestamptz,
  published_at timestamptz,
  images_purged_at timestamptz
);
create index if not exists pl_products_company_idx on pl_products(company_id);
create index if not exists pl_products_stage_idx on pl_products(stage);

create table if not exists pl_posts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references pl_products(id) on delete cascade,
  platform text not null,
  status text not null default 'pending' check (status in ('pending', 'published', 'skipped')),
  caption text,
  url text,
  posted_by text,
  posted_at timestamptz,
  unique (product_id, platform)
);
create index if not exists pl_posts_product_idx on pl_posts(product_id);

create table if not exists pl_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references pl_products(id) on delete cascade,
  kind text not null default 'source' check (kind in ('source', 'design')),
  path text not null,
  pos int not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists pl_images_product_idx on pl_images(product_id);

-- أدوار الموظف وحالة التفرّغ للردود (صف واحد لكل موظف)
create table if not exists pl_presence (
  email text primary key,
  roles text[] not null default '{}',
  reply_available boolean not null default false,
  channels text[] not null default '{}',
  available_since timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function pl_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists pl_products_touch on pl_products;
create trigger pl_products_touch before update on pl_products for each row execute function pl_touch();

alter table pl_products enable row level security;
alter table pl_posts enable row level security;
alter table pl_images enable row level security;
alter table pl_presence enable row level security;

drop policy if exists "pl products all" on pl_products;
create policy "pl products all" on pl_products for all to authenticated
  using (can_access_company(company_id)) with check (can_access_company(company_id));

drop policy if exists "pl posts all" on pl_posts;
create policy "pl posts all" on pl_posts for all to authenticated using (is_member()) with check (is_member());

drop policy if exists "pl images all" on pl_images;
create policy "pl images all" on pl_images for all to authenticated using (is_member()) with check (is_member());

drop policy if exists "pl presence read" on pl_presence;
drop policy if exists "pl presence write" on pl_presence;
create policy "pl presence read" on pl_presence for select to authenticated using (is_member());
create policy "pl presence write" on pl_presence for all to authenticated
  using (is_member() and (lower(email) = lower(auth.jwt() ->> 'email') or is_admin()))
  with check (is_member() and (lower(email) = lower(auth.jwt() ->> 'email') or is_admin()));
