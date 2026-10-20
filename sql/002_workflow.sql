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
