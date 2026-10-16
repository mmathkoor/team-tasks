-- شغّله مرة واحدة في Supabase > SQL Editor: المهام المتكررة لكل الأعضاء
drop policy if exists "rc admin" on recurring_tasks;
drop policy if exists "rc all" on recurring_tasks;
create policy "rc all" on recurring_tasks for all using (is_member()) with check (is_member());
