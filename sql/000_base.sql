-- 000: الأساس لقاعدة بيانات جديدة (للتركيب لنشاط/عميل جديد فقط — لا تشغّله على قاعدة قائمة)
create table members (
  email text primary key,
  name text not null,
  telegram_chat_id text,
  role text not null default 'member'
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
  assignee_email text references members(email) on delete set null,
  due_on date,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  created_at timestamptz default now(),
  created_by text,
  for_all boolean not null default false
);
create table task_done (
  task_id uuid not null references tasks(id) on delete cascade,
  email text not null,
  done_at timestamptz default now(),
  primary key (task_id, email)
);
create table proposals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  author_email text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create table votes (
  proposal_id uuid not null references proposals(id) on delete cascade,
  email text not null,
  value smallint not null check (value in (1, -1)),
  primary key (proposal_id, email)
);
create table push_subs (
  endpoint text primary key,
  email text not null,
  sub jsonb not null
);

create function is_member() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where lower(email) = lower(auth.jwt() ->> 'email'));
$$;
create function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where lower(email) = lower(auth.jwt() ->> 'email') and role = 'admin');
$$;

alter table members enable row level security;  alter table meetings enable row level security;
alter table tasks enable row level security;    alter table task_done enable row level security;
alter table proposals enable row level security; alter table votes enable row level security;
alter table push_subs enable row level security;

create policy "read members" on members for select using (is_member());
create policy "members admin add" on members for insert with check (is_admin());
create policy "members admin remove" on members for delete using (is_admin());
create policy "update own row" on members for update using (lower(email) = lower(auth.jwt() ->> 'email'));

create policy "meetings read" on meetings for select using (is_member());
create policy "meetings admin write" on meetings for all using (is_admin()) with check (is_admin());

create policy "tasks read" on tasks for select using (is_member());
create policy "tasks add" on tasks for insert with check (is_member());
create policy "tasks edit" on tasks for update using (is_admin() or lower(assignee_email) = lower(auth.jwt() ->> 'email') or lower(created_by) = lower(auth.jwt() ->> 'email'));
create policy "tasks remove" on tasks for delete using (is_admin() or lower(created_by) = lower(auth.jwt() ->> 'email'));

create policy "done read" on task_done for select using (is_member());
create policy "done insert own" on task_done for insert with check (is_member() and lower(email) = lower(auth.jwt() ->> 'email'));
create policy "done update own" on task_done for update using (lower(email) = lower(auth.jwt() ->> 'email'));
create policy "done delete own" on task_done for delete using (lower(email) = lower(auth.jwt() ->> 'email'));

create policy "proposals read" on proposals for select using (is_member());
create policy "proposals insert" on proposals for insert with check (is_member() and lower(author_email) = lower(auth.jwt() ->> 'email'));
create policy "proposals update" on proposals for update using (lower(author_email) = lower(auth.jwt() ->> 'email') or is_admin());
create policy "proposals delete" on proposals for delete using (lower(author_email) = lower(auth.jwt() ->> 'email') or is_admin());

create policy "votes read" on votes for select using (is_member());
create policy "votes insert" on votes for insert with check (is_member() and lower(email) = lower(auth.jwt() ->> 'email'));
create policy "votes update" on votes for update using (lower(email) = lower(auth.jwt() ->> 'email'));
create policy "votes delete" on votes for delete using (lower(email) = lower(auth.jwt() ->> 'email'));

create policy "own subs" on push_subs for all using (lower(email) = lower(auth.jwt() ->> 'email')) with check (lower(email) = lower(auth.jwt() ->> 'email'));
