-- شغّل هذا الملف كاملاً في Supabase > SQL Editor
create table members (
  email text primary key,
  name text not null,
  telegram_chat_id text
);
create table meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  held_on date not null default current_date
);
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  meeting_id uuid references meetings(id) on delete set null,
  assignee_email text references members(email),
  due_on date,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  created_at timestamptz default now()
);

alter table members enable row level security;
alter table meetings enable row level security;
alter table tasks enable row level security;

create function is_member() returns boolean language sql stable security definer as $$
  select exists (select 1 from members where lower(email) = lower(auth.jwt()->>'email'));
$$;

create policy "read members" on members for select using (is_member());
create policy "update own row" on members for update using (lower(email) = lower(auth.jwt()->>'email'));
create policy "meetings all" on meetings for all using (is_member()) with check (is_member());
create policy "tasks all" on tasks for all using (is_member()) with check (is_member());

-- ضع هنا إيميلات الأربعة (يدخل فقط من هو مسجّل هنا)
insert into members (email, name) values
 ('you@example.com', 'اسمك'),
 ('partner1@example.com', 'الشريك 1'),
 ('partner2@example.com', 'الشريك 2'),
 ('partner3@example.com', 'الشريك 3');

-- إشعارات الجوال (Web Push)
create table push_subs (
  endpoint text primary key,
  email text not null,
  sub jsonb not null
);
alter table push_subs enable row level security;
create policy "own subs" on push_subs for all
  using (lower(email) = lower(auth.jwt()->>'email'))
  with check (lower(email) = lower(auth.jwt()->>'email'));
