-- شغّله في Supabase > SQL Editor: يسمح لكل الأعضاء بتعديل ونقل أي مهمة
drop policy if exists "tasks edit" on tasks;
create policy "tasks edit" on tasks for update using (is_member()) with check (is_member());
