-- ======================================================================
-- setup_all.sql : يبني قاعدة بيانات جديدة كاملة (لنشاط/عميل جديد) من الصفر.
-- شغّله مرة واحدة فقط على مشروع Supabase فارغ، ثم أضف المدير الأول (انظر DEPLOY.md).
-- ======================================================================

-- >>>>>>>>>> sql/000_base.sql <<<<<<<<<<
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
create policy "tasks edit" on tasks for update using (is_admin() or lower(assignee_email) = lower(auth.jwt() ->> 'email') or lower(created_by) = lower(auth.jwt() ->> 'email')) with check (is_member());
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


-- >>>>>>>>>> sql/001_features.sql <<<<<<<<<<
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


-- >>>>>>>>>> sql/002_workflow.sql <<<<<<<<<<
-- شغّله مرة واحدة في Supabase > SQL Editor: مسار العمل (انتقال المهمة تلقائياً للمرحلة التالية)
alter table tasks add column if not exists flow jsonb;
alter table tasks add column if not exists flow_step int not null default 0;

create or replace function advance_flow() returns trigger language plpgsql security definer set search_path = public as $$
declare nxt text; fromn text; ton text; c int;
begin
  c := coalesce(new.flow_step, 0);
  if new.status = 'done' and old.status is distinct from 'done'
     and new.flow is not null and jsonb_typeof(new.flow) = 'array'
     and c < jsonb_array_length(new.flow) - 1 then
    nxt := new.flow -> (c + 1) ->> 'email';
    if nxt is not null and nxt <> '' then
      select name into fromn from members where lower(email) = lower(old.assignee_email);
      select name into ton from members where lower(email) = lower(nxt);
      new.flow_step := c + 1;
      new.assignee_email := nxt;
      new.status := 'todo';
      new.progress := 0;
      new.notes := coalesce(new.notes, '') || E'\n[WF_HANDOFF]' || coalesce(fromn, '') || '||' || coalesce(ton, '') || '||' || to_char(now() at time zone 'Asia/Aden', 'YYYY-MM-DD') || '||✅ أنهى مرحلته — انتقلت المهمة تلقائياً حسب المسار';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_advance_flow on tasks;
create trigger trg_advance_flow before update on tasks for each row execute function advance_flow();


-- >>>>>>>>>> sql/003_recurring_for_all.sql <<<<<<<<<<
-- شغّله مرة واحدة في Supabase > SQL Editor: المهام المتكررة لكل الأعضاء
drop policy if exists "rc admin" on recurring_tasks;
drop policy if exists "rc all" on recurring_tasks;
create policy "rc all" on recurring_tasks for all using (is_member()) with check (is_member());


-- >>>>>>>>>> sql/004_activity_checklist.sql <<<<<<<<<<
-- 004: سجل النشاط + القائمة الفرعية + وقت الإنجاز  (شغّله مرة واحدة في Supabase > SQL Editor)

-- ===== وقت الإنجاز =====
alter table tasks add column if not exists completed_at timestamptz;
alter table task_done add column if not exists done_at timestamptz default now();

create or replace function stamp_completed() returns trigger language plpgsql as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then new.completed_at := now();
  elsif new.status <> 'done' and old.completed_at is not null then new.completed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_stamp_completed on tasks;
create trigger trg_stamp_completed before update on tasks for each row execute function stamp_completed();

-- ===== سجل النشاط =====
create table if not exists activity (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_email text,
  action text not null,
  task_id uuid,
  task_title text,
  details jsonb
);
create index if not exists activity_task_idx on activity(task_id, at desc);
create index if not exists activity_at_idx on activity(at desc);
alter table activity enable row level security;
drop policy if exists "act read" on activity;
create policy "act read" on activity for select using (is_member());

create or replace function log_task_change() returns trigger language plpgsql security definer set search_path = public as $$
declare actor text := coalesce(auth.jwt() ->> 'email', 'system');
begin
  if tg_op = 'INSERT' then
    insert into activity(actor_email, action, task_id, task_title, details)
    values (actor, 'created', new.id, new.title, jsonb_build_object('assignee', new.assignee_email, 'for_all', new.for_all));
  elsif tg_op = 'DELETE' then
    insert into activity(actor_email, action, task_id, task_title) values (actor, 'deleted', old.id, old.title);
  else
    if new.status is distinct from old.status then
      insert into activity(actor_email, action, task_id, task_title, details) values (actor, 'status', new.id, new.title, jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if new.assignee_email is distinct from old.assignee_email and new.flow_step is not distinct from old.flow_step then
      insert into activity(actor_email, action, task_id, task_title, details) values (actor, 'reassigned', new.id, new.title, jsonb_build_object('from', old.assignee_email, 'to', new.assignee_email));
    end if;
    if new.due_on is distinct from old.due_on then
      insert into activity(actor_email, action, task_id, task_title, details) values (actor, 'due', new.id, new.title, jsonb_build_object('from', old.due_on, 'to', new.due_on));
    end if;
    if new.title is distinct from old.title then
      insert into activity(actor_email, action, task_id, task_title, details) values (actor, 'renamed', new.id, new.title, jsonb_build_object('from', old.title));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_log_task on tasks;
create trigger trg_log_task after insert or update or delete on tasks for each row execute function log_task_change();

create or replace function log_child() returns trigger language plpgsql security definer set search_path = public as $$
declare actor text := coalesce(auth.jwt() ->> 'email', 'system'); tid uuid; ttl text; act text; det jsonb;
begin
  if tg_table_name = 'task_comments' and tg_op = 'INSERT' then tid := new.task_id; act := 'comment'; det := jsonb_build_object('text', left(new.body, 140));
  elsif tg_table_name = 'task_files' and tg_op = 'INSERT' then tid := new.task_id; act := 'file'; det := jsonb_build_object('name', new.name);
  elsif tg_table_name = 'task_files' and tg_op = 'DELETE' then tid := old.task_id; act := 'file_removed'; det := jsonb_build_object('name', old.name);
  elsif tg_table_name = 'task_items' then
    if tg_op = 'UPDATE' then
      if new.done and not old.done then tid := new.task_id; act := 'checklist'; det := jsonb_build_object('text', new.text); else return null; end if;
    else return null; end if;
  elsif tg_table_name = 'task_done' and tg_op = 'INSERT' then tid := new.task_id; act := 'done_for_all'; actor := coalesce(new.email, actor);
  else return null; end if;
  select title into ttl from tasks where id = tid;
  if ttl is null then return null; end if;
  insert into activity(actor_email, action, task_id, task_title, details) values (actor, act, tid, ttl, det);
  return null;
end $$;
drop trigger if exists trg_log_comments on task_comments; create trigger trg_log_comments after insert on task_comments for each row execute function log_child();
drop trigger if exists trg_log_files on task_files;       create trigger trg_log_files after insert or delete on task_files for each row execute function log_child();
drop trigger if exists trg_log_done on task_done;         create trigger trg_log_done after insert on task_done for each row execute function log_child();

-- تسجيل إنجاز المراحل داخل مسار العمل
create or replace function advance_flow() returns trigger language plpgsql security definer set search_path = public as $$
declare nxt text; fromn text; ton text; c int;
begin
  c := coalesce(new.flow_step, 0);
  if new.status = 'done' and old.status is distinct from 'done'
     and new.flow is not null and jsonb_typeof(new.flow) = 'array'
     and c < jsonb_array_length(new.flow) - 1 then
    nxt := new.flow -> (c + 1) ->> 'email';
    if nxt is not null and nxt <> '' then
      select name into fromn from members where lower(email) = lower(old.assignee_email);
      select name into ton from members where lower(email) = lower(nxt);
      new.flow_step := c + 1;
      new.assignee_email := nxt;
      new.status := 'todo';
      new.progress := 0;
      new.notes := coalesce(new.notes, '') || E'\n[WF_HANDOFF]' || coalesce(fromn, '') || '||' || coalesce(ton, '') || '||' || to_char(now() at time zone 'Asia/Aden', 'YYYY-MM-DD') || '||✅ أنهى مرحلته — انتقلت المهمة تلقائياً حسب المسار';
      insert into activity(actor_email, action, task_id, task_title, details)
      values (coalesce(auth.jwt() ->> 'email', 'system'), 'flow_step', new.id, new.title, jsonb_build_object('from', old.assignee_email, 'to', nxt, 'step', c + 1));
    end if;
  end if;
  return new;
end $$;

-- ===== القائمة الفرعية =====
create table if not exists task_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  pos int not null default 0,
  done_by text,
  done_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists task_items_task_idx on task_items(task_id);
alter table task_items enable row level security;
drop policy if exists "ti all" on task_items;
create policy "ti all" on task_items for all using (is_member()) with check (is_member());
drop trigger if exists trg_log_items on task_items;
create trigger trg_log_items after update on task_items for each row execute function log_child();

-- نسبة الإنجاز تُحسب من البنود، وأول بند منجز ينقل المهمة إلى «قيد العمل»
create or replace function sync_checklist() returns trigger language plpgsql security definer set search_path = public as $$
declare tid uuid := coalesce(new.task_id, old.task_id); total int; dn int;
begin
  select count(*), count(*) filter (where done) into total, dn from task_items where task_id = tid;
  update tasks set
    progress = case when total = 0 then progress else round(100.0 * dn / total)::int end,
    status = case when status = 'todo' and dn > 0 and not coalesce(for_all, false) then 'doing' else status end
  where id = tid;
  return null;
end $$;
drop trigger if exists trg_sync_checklist on task_items;
create trigger trg_sync_checklist after insert or update or delete on task_items for each row execute function sync_checklist();


-- >>>>>>>>>> sql/005_priority_realtime.sql <<<<<<<<<<
-- 005: الأولوية + التحديث اللحظي  (شغّله مرة واحدة في Supabase > SQL Editor، آمن لإعادة التشغيل)

-- ===== الأولوية =====
alter table tasks add column if not exists priority text not null default 'normal';
alter table tasks drop constraint if exists tasks_priority_check;
alter table tasks add constraint tasks_priority_check check (priority in ('urgent','important','normal'));

-- ===== التحديث اللحظي: إضافة الجداول لقناة Realtime =====
do $$ begin begin alter publication supabase_realtime add table public.tasks;     exception when duplicate_object then null; end; end $$;
do $$ begin begin alter publication supabase_realtime add table public.task_done; exception when duplicate_object then null; end; end $$;
do $$ begin begin alter publication supabase_realtime add table public.proposals; exception when duplicate_object then null; end; end $$;
do $$ begin begin alter publication supabase_realtime add table public.votes;     exception when duplicate_object then null; end; end $$;
do $$ begin begin alter publication supabase_realtime add table public.meetings;  exception when duplicate_object then null; end; end $$;
do $$ begin begin alter publication supabase_realtime add table public.members;   exception when duplicate_object then null; end; end $$;


-- >>>>>>>>>> sql/006_security.sql <<<<<<<<<<
-- 006: حماية الأدوار — يمنع أي عضو من ترقية نفسه إلى أدمن أو تغيير بريده
-- (آمن لإعادة التشغيل. العمليات من لوحة Supabase ومن مفتاح الخدمة تبقى مسموحة.)
create or replace function protect_member_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- لوحة Supabase / مفتاح الخدمة (ليس مستخدماً عادياً)
  if new.role is distinct from old.role or new.email is distinct from old.email then
    if not exists (select 1 from members m where lower(m.email) = lower(auth.jwt() ->> 'email') and m.role = 'admin') then
      raise exception 'غير مصرّح: تغيير الدور أو البريد للأدمن فقط';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_member on members;
create trigger trg_protect_member before update on members for each row execute function protect_member_fields();


-- >>>>>>>>>> sql/007_group_inbox_meetings.sql <<<<<<<<<<
-- 007: مهام جماعية بنسخة لكل عضو + صندوق التنبيهات + أي عضو يضيف قسماً
-- (شغّله مرة واحدة في Supabase > SQL Editor. آمن لإعادة التشغيل ولا يحذف بيانات.)

-- ===== 1) المهام الجماعية: كل عضو له نسخته، ويكتب ما أنجزه =====
alter table tasks add column if not exists group_id uuid;
alter table tasks add column if not exists done_note text;
create index if not exists tasks_group_idx on tasks(group_id);

-- ===== 2) أي عضو يضيف قسماً/اجتماعاً (التعديل والحذف يبقى للأدمن) =====
drop policy if exists "v4 meetings add" on meetings;
create policy "v4 meetings add" on meetings for insert with check (is_member());

-- ===== 3) صندوق التنبيهات: يُحفظ كل تنبيه حتى لو لم يصل إشعار الجوال =====
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  title text not null,
  body text,
  task_id uuid,
  from_name text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_to_idx on notifications (lower(to_email), created_at desc);
alter table notifications enable row level security;
drop policy if exists "v4 notif read" on notifications;
drop policy if exists "v4 notif update" on notifications;
drop policy if exists "v4 notif delete" on notifications;
create policy "v4 notif read"   on notifications for select using (lower(to_email) = lower(auth.jwt() ->> 'email'));
create policy "v4 notif update" on notifications for update using (lower(to_email) = lower(auth.jwt() ->> 'email'));
create policy "v4 notif delete" on notifications for delete using (lower(to_email) = lower(auth.jwt() ->> 'email'));
-- (الإضافة تتم من الخادم فقط بمفتاح الخدمة، فلا توجد سياسة insert للمستخدمين)

do $$ begin begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end; end $$;


-- >>>>>>>>>> sql/008_orders.sql <<<<<<<<<<
-- 008: إدارة الطلبات (متجر) — طلبات + بنود + دفعات + سجل + مندوبو التوصيل
-- شغّله مرة واحدة في Supabase > SQL Editor (آمن لإعادة التشغيل، لا يحذف بياناتك).

-- ===== 1) دور «مندوب توصيل» (rep): لا يرى المهام ولا شيئاً من تطبيق الفريق =====
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'public.members'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%' loop
    execute format('alter table public.members drop constraint %I', c.conname);
  end loop;
end $$;
alter table members add constraint members_role_check check (role in ('admin','member','rep')) not valid;

-- is_member() يستثني المندوبين، فتنطبق عليهم تلقائياً كل سياسات الفريق (مغلقة أمامهم)
create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where lower(m.email) = lower(auth.jwt() ->> 'email') and coalesce(m.role, 'member') <> 'rep');
$$;

-- يقرأ كل مستخدم صفّه هو في members (يحتاجه المندوب ليعرف نفسه)
drop policy if exists "v5 members self" on members;
create policy "v5 members self" on members for select using (lower(email) = lower(auth.jwt() ->> 'email'));

-- ===== 2) الجداول =====
create table if not exists ord_orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigint generated by default as identity unique,
  order_date date not null default current_date,
  customer_name text not null,
  phone text, address text, channel text, notes text,
  status text not null default 'new' check (status in ('new','preparing','delivered','cancelled','returned')),
  rep_email text,
  delivery_fee numeric not null default 0 check (delivery_fee >= 0),
  discount numeric not null default 0 check (discount >= 0),
  subtotal numeric not null default 0,
  paid numeric not null default 0,
  total numeric generated always as (subtotal + delivery_fee - discount) stored,
  balance numeric generated always as (subtotal + delivery_fee - discount - paid) stored,
  cancel_reason text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint ord_cancel_reason check (status <> 'cancelled' or length(trim(coalesce(cancel_reason, ''))) >= 3)
);
create index if not exists ord_orders_status_idx on ord_orders (status);
create index if not exists ord_orders_rep_idx on ord_orders (lower(rep_email));
create index if not exists ord_orders_date_idx on ord_orders (order_date desc);

create table if not exists ord_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references ord_orders(id) on delete cascade,
  pos int not null default 0,
  name text not null,
  qty numeric not null default 1 check (qty > 0),
  price numeric not null default 0 check (price >= 0),
  line_total numeric generated always as (qty * price) stored
);
create index if not exists ord_items_order_idx on ord_items (order_id);

create table if not exists ord_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references ord_orders(id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text, note text,
  paid_on date not null default current_date,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists ord_payments_order_idx on ord_payments (order_id);

create table if not exists ord_events (
  id bigint generated always as identity primary key,
  order_id uuid not null,
  at timestamptz not null default now(),
  actor text, kind text not null, detail jsonb
);
create index if not exists ord_events_order_idx on ord_events (order_id, at);

alter table notifications add column if not exists order_id uuid;
alter table notifications add column if not exists pushed boolean not null default false;

-- ===== 3) المجاميع تُحسب في قاعدة البيانات (لا يمكن التلاعب بها من المتصفح) =====
create or replace function ord_recalc_subtotal() returns trigger language plpgsql security definer set search_path = public as $$
declare oid_ uuid := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
begin
  update ord_orders set subtotal = coalesce((select sum(line_total) from ord_items where order_id = oid_), 0) where id = oid_;
  return null;
end $$;
drop trigger if exists trg_ord_items_sum on ord_items;
create trigger trg_ord_items_sum after insert or update or delete on ord_items for each row execute function ord_recalc_subtotal();

create or replace function ord_recalc_paid() returns trigger language plpgsql security definer set search_path = public as $$
declare oid_ uuid := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
begin
  update ord_orders set paid = coalesce((select sum(amount) from ord_payments where order_id = oid_), 0) where id = oid_;
  return null;
end $$;
drop trigger if exists trg_ord_pay_sum on ord_payments;
create trigger trg_ord_pay_sum after insert or update or delete on ord_payments for each row execute function ord_recalc_paid();

create or replace function ord_orders_before() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then   -- مستخدم عادي: ثبّت الحقول المحسوبة والمُنشئ
    new.created_by := coalesce((select m.email from members m where lower(m.email) = lower(auth.jwt() ->> 'email')), new.created_by);
  end if;
  if tg_op = 'INSERT' then
    if pg_trigger_depth() = 1 then new.subtotal := 0; new.paid := 0; end if;
    if new.status = 'delivered' then new.delivered_at := now(); end if;
  else
    new.updated_at := now();
    new.created_by := old.created_by;
    if pg_trigger_depth() = 1 then new.subtotal := old.subtotal; new.paid := old.paid; end if;
    if new.status = 'delivered' and old.status is distinct from 'delivered' then new.delivered_at := now(); end if;
    if new.status <> 'delivered' then new.delivered_at := null; end if;
    if new.status <> 'cancelled' and old.status = 'cancelled' then new.cancel_reason := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_ord_orders_before on ord_orders;
create trigger trg_ord_orders_before before insert or update on ord_orders for each row execute function ord_orders_before();

-- ===== 4) سجل الطلب + التنبيهات (تُنشأ من قاعدة البيانات فلا تضيع) =====
create or replace function ord_orders_after() returns trigger language plpgsql security definer set search_path = public as $$
declare actor text := lower(auth.jwt() ->> 'email'); aname text; r record; ttl text; bd text;
begin
  select m.name into aname from members m where lower(m.email) = actor;
  if tg_op = 'INSERT' then
    insert into ord_events (order_id, actor, kind, detail) values (new.id, actor, 'created', jsonb_build_object('status', new.status));
  else
    if new.status is distinct from old.status then
      insert into ord_events (order_id, actor, kind, detail) values (new.id, actor, 'status', jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.cancel_reason));
    end if;
    if new.rep_email is distinct from old.rep_email then
      insert into ord_events (order_id, actor, kind, detail) values (new.id, actor, 'assigned', jsonb_build_object('from', old.rep_email, 'to', new.rep_email));
    end if;
  end if;

  -- إسناد للمندوب (أو عودة الطلب لحالة التجهيز)
  if new.rep_email is not null and new.status = 'preparing'
     and (tg_op = 'INSERT' or old.rep_email is distinct from new.rep_email or old.status is distinct from new.status) then
    insert into notifications (to_email, title, body, order_id, from_name)
    values (lower(new.rep_email), '🛵 طلب جديد للتوصيل #' || new.order_no,
            new.customer_name || coalesce(E'\n' || nullif(new.address, ''), ''), new.id, aname);
  end if;

  -- نتيجة التوصيل: تصل لمن سجّل الطلب وللمالك
  if tg_op = 'UPDATE' and new.status in ('delivered', 'cancelled') and old.status is distinct from new.status then
    ttl := case when new.status = 'delivered' then '✅ تم توصيل الطلب #' else '❌ أُلغي الطلب #' end || new.order_no;
    bd := new.customer_name || case when new.status = 'cancelled' then E'\nالسبب: ' || coalesce(new.cancel_reason, '') else '' end;
    for r in select distinct lower(x.e) as e from (select new.created_by as e union select m.email from members m where m.role = 'admin') x
             where lower(x.e) is distinct from actor loop
      insert into notifications (to_email, title, body, order_id, from_name) values (r.e, ttl, bd, new.id, aname);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists trg_ord_orders_after on ord_orders;
create trigger trg_ord_orders_after after insert or update on ord_orders for each row execute function ord_orders_after();

create or replace function ord_payments_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into ord_events (order_id, actor, kind, detail)
  values (new.order_id, lower(auth.jwt() ->> 'email'), 'payment', jsonb_build_object('amount', new.amount, 'method', new.method));
  return null;
end $$;
drop trigger if exists trg_ord_pay_log on ord_payments;
create trigger trg_ord_pay_log after insert on ord_payments for each row execute function ord_payments_log();

-- ===== 5) الصلاحيات (RLS): الفريق يدير، المندوب لا يقرأ الجداول إطلاقاً =====
alter table ord_orders enable row level security;
alter table ord_items enable row level security;
alter table ord_payments enable row level security;
alter table ord_events enable row level security;

drop policy if exists "v5 ord read" on ord_orders;   drop policy if exists "v5 ord add" on ord_orders;
drop policy if exists "v5 ord edit" on ord_orders;   drop policy if exists "v5 ord del" on ord_orders;
create policy "v5 ord read" on ord_orders for select using (is_member());
create policy "v5 ord add"  on ord_orders for insert with check (is_member());
create policy "v5 ord edit" on ord_orders for update using (is_member());
create policy "v5 ord del"  on ord_orders for delete using (is_admin());

drop policy if exists "v5 itm all" on ord_items;
create policy "v5 itm all" on ord_items for all using (is_member()) with check (is_member());

drop policy if exists "v5 pay read" on ord_payments; drop policy if exists "v5 pay add" on ord_payments;
drop policy if exists "v5 pay edit" on ord_payments; drop policy if exists "v5 pay del" on ord_payments;
create policy "v5 pay read" on ord_payments for select using (is_member());
create policy "v5 pay add"  on ord_payments for insert with check (is_member());
create policy "v5 pay edit" on ord_payments for update using (is_admin() or lower(created_by) = lower(auth.jwt() ->> 'email'));
create policy "v5 pay del"  on ord_payments for delete using (is_admin() or lower(created_by) = lower(auth.jwt() ->> 'email'));

drop policy if exists "v5 evt read" on ord_events;
create policy "v5 evt read" on ord_events for select using (is_member());

-- ===== 6) واجهة المندوب: دالتان فقط، بلا أسعار وبلا فتح الطلب كاملاً =====
-- (تم دمج وترقية rep_orders لاحقاً في قسم ترقية واجهة المندوب والفواتير لتعود بجميع الأسعار)

create or replace function rep_set_status(p_order uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o ord_orders%rowtype;
begin
  if p_status not in ('delivered', 'cancelled') then raise exception 'حالة غير مسموحة'; end if;
  select * into o from ord_orders where id = p_order for update;
  if not found or lower(o.rep_email) is distinct from lower(auth.jwt() ->> 'email') then raise exception 'غير مصرّح'; end if;
  if o.status <> 'preparing' then raise exception 'الطلب ليس قيد التجهيز'; end if;
  if p_status = 'cancelled' and length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'سبب الإلغاء مطلوب'; end if;
  update ord_orders set status = p_status, cancel_reason = case when p_status = 'cancelled' then trim(p_reason) else null end where id = p_order;
end $$;

revoke all on function rep_orders() from public, anon;
revoke all on function rep_set_status(uuid, text, text) from public, anon;
grant execute on function rep_orders() to authenticated;
grant execute on function rep_set_status(uuid, text, text) to authenticated;

-- ===== 7) التحديث اللحظي =====
do $$ begin begin alter publication supabase_realtime add table public.ord_orders;   exception when duplicate_object then null; end; end $$;
do $$ begin begin alter publication supabase_realtime add table public.ord_items;    exception when duplicate_object then null; end; end $$;
do $$ begin begin alter publication supabase_realtime add table public.ord_payments; exception when duplicate_object then null; end; end $$;


-- >>>>>>>>>> sql/009_orders_v2.sql <<<<<<<<<<
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

-- (دالة rep_orders المحدثة بكافة تفاصيل الفاتورة معرّفة في الأسفل)

-- >>>>>>>>>> sql/010_order_images.sql <<<<<<<<<<
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


-- >>>>>>>>>> sql/011_titles_views.sql <<<<<<<<<<
-- 011: مسمّى وظيفي لكل عضو + إخفاء/إظهار الشاشات (للمدير) + اسم التطبيق
alter table members add column if not exists title text;     -- مثال: مسؤول التسويق، المسؤول المالي
drop policy if exists "v8 members admin edit" on members;
create policy "v8 members admin edit" on members for update using (is_admin());

alter table ord_settings add column if not exists hidden_views text[] not null default '{}';
alter table ord_settings add column if not exists app_name text;


-- >>>>>>>>>> sql/012_fix_task_edit.sql <<<<<<<<<<
-- 012: إصلاح خطأ "new row violates row-level security policy for table tasks"
-- السبب: سياسة تعديل المهام كانت تتحقق من الصف الجديد بنفس شرط الصف القديم، فيفشل أي تعديل
-- يغيّر المسؤول عن المهمة (إحالة المهمة للتالي في المسار، أو إسنادها يدوياً لشخص آخر) لغير الأدمن.
drop policy if exists "tasks edit" on tasks;
create policy "tasks edit" on tasks for update
  using (is_admin() or lower(assignee_email) = lower(auth.jwt() ->> 'email') or lower(created_by) = lower(auth.jwt() ->> 'email'))
  with check (is_member());


-- >>>>>>>>>> sql/013_companies_departments.sql <<<<<<<<<<
-- 013: دعم تعدد الشركات (عزل بيانات كل شركة) + الإدارات والأقسام
alter table members add column if not exists company text;
alter table members add column if not exists department text;

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


-- >>>>>>>>>> sql/014_clean_architecture_and_erp.sql <<<<<<<<<<
create table if not exists companies (
  id text primary key,
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

alter table members add column if not exists company text default 'متجرك';
alter table members add column if not exists department text default '';
alter table members add column if not exists phone text;
alter table members add column if not exists permissions jsonb default '{}'::jsonb;

alter table tasks add column if not exists company_id text not null default 'متجرك';
alter table ord_orders add column if not exists company_id text not null default 'متجرك';
alter table meetings add column if not exists company_id text not null default 'متجرك';
alter table proposals add column if not exists company_id text not null default 'متجرك';

create index if not exists tasks_company_id_idx on tasks(company_id);
create index if not exists ord_orders_company_id_idx on ord_orders(company_id);

create or replace function current_user_company() returns text
language sql stable security definer set search_path = public as $$
  select case
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

alter table companies enable row level security;
drop policy if exists "companies_read" on companies;
drop policy if exists "companies_write" on companies;
create policy "companies_read" on companies for select using (is_member() or is_rep());
create policy "companies_write" on companies for all using (is_admin()) with check (is_admin());

create table if not exists erp_supplier_payments (
  id uuid primary key default gen_random_uuid(),
  company_id text not null default 'متجرك',
  supplier_name text not null,
  entry_type text not null default 'payment' check (entry_type in ('payment', 'purchase')),
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

create table if not exists erp_rep_handovers (
  id uuid primary key default gen_random_uuid(),
  company_id text not null default 'متجرك',
  rep_email text not null,
  entry_type text not null default 'handover' check (entry_type in ('handover', 'collect_adj')),
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

create table if not exists erp_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id text not null default 'متجرك',
  category text not null default 'إعلانات وترويج',
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


