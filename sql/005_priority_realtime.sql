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
