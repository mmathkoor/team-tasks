-- شغّله مرة واحدة في Supabase > SQL Editor (قبل رفع الملفات الجديدة)
alter table tasks add column if not exists progress int not null default 0 check (progress between 0 and 100);

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_email text not null,
  body text not null,
  created_at timestamptz default now()
);
create table if not exists task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  path text not null,
  name text not null,
  size int,
  uploaded_by text,
  created_at timestamptz default now()
);
create table if not exists recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  assignee_email text references members(email) on delete set null,
  for_all boolean not null default false,
  frequency text not null check (frequency in ('daily','weekly','monthly','month_end')),
  weekday int check (weekday between 0 and 6),
  day_of_month int check (day_of_month between 1 and 31),
  due_after_days int not null default 0,
  active boolean not null default true,
  last_run date,
  created_by text,
  created_at timestamptz default now()
);
alter table task_comments enable row level security;
alter table task_files enable row level security;
alter table recurring_tasks enable row level security;

drop policy if exists "cm read" on task_comments;   create policy "cm read" on task_comments for select using (is_member());
drop policy if exists "cm add" on task_comments;    create policy "cm add" on task_comments for insert with check (is_member() and lower(author_email) = lower(auth.jwt()->>'email'));
drop policy if exists "cm del" on task_comments;    create policy "cm del" on task_comments for delete using (is_admin() or lower(author_email) = lower(auth.jwt()->>'email'));
drop policy if exists "tf read" on task_files;      create policy "tf read" on task_files for select using (is_member());
drop policy if exists "tf add" on task_files;       create policy "tf add" on task_files for insert with check (is_member());
drop policy if exists "tf del" on task_files;       create policy "tf del" on task_files for delete using (is_admin() or lower(uploaded_by) = lower(auth.jwt()->>'email'));
drop policy if exists "rc admin" on recurring_tasks; create policy "rc admin" on recurring_tasks for all using (is_admin()) with check (is_admin());

-- مخزن المرفقات (خاص، حد 10 ميجابايت للملف)
insert into storage.buckets (id, name, public, file_size_limit) values ('task-files', 'task-files', false, 10485760)
  on conflict (id) do update set file_size_limit = 10485760;
drop policy if exists "tfo read" on storage.objects;   create policy "tfo read" on storage.objects for select using (bucket_id = 'task-files' and is_member());
drop policy if exists "tfo add" on storage.objects;    create policy "tfo add" on storage.objects for insert with check (bucket_id = 'task-files' and is_member());
drop policy if exists "tfo del" on storage.objects;    create policy "tfo del" on storage.objects for delete using (bucket_id = 'task-files' and is_member());
