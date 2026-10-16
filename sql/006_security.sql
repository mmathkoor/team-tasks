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
