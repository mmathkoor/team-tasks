-- 012: إصلاح خطأ "new row violates row-level security policy for table tasks"
-- السبب: سياسة تعديل المهام كانت تتحقق من الصف الجديد بنفس شرط الصف القديم، فيفشل أي تعديل
-- يغيّر المسؤول عن المهمة (إحالة المهمة للتالي في المسار، أو إسنادها يدوياً لشخص آخر) لغير الأدمن.
drop policy if exists "tasks edit" on tasks;
create policy "tasks edit" on tasks for update
  using (is_admin() or lower(assignee_email) = lower(auth.jwt() ->> 'email') or lower(created_by) = lower(auth.jwt() ->> 'email'))
  with check (is_member());
