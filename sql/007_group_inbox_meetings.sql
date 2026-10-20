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
