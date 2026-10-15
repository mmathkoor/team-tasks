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
drop trigger if exists trg_log_items on task_items;       -- (يُنشأ بعد إنشاء الجدول أدناه)
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
