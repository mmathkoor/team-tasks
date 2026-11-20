-- ==============================================================================
-- 018: إصلاح صلاحيات قراءة وكتابة أسعار الشراء (ord_item_costs) لجميع المخوّلين
-- يشمل: المدير، الموظف الذي لديه صلاحية canCost في ملفه، وإعداد الشركة/المتجر staff_can_cost
-- ==============================================================================

create or replace function ord_cost_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
    or (
      is_member() and (
        coalesce((select s.staff_can_cost from ord_settings s limit 1), false)
        or exists (
          select 1 from members m
          where lower(m.email) = lower(auth.jwt() ->> 'email')
            and (
              coalesce((m.permissions ->> 'canCost')::boolean, false)
              or exists (
                select 1 from companies c
                where lower(c.id) = lower(coalesce(nullif(m.company, ''), 'متجرك'))
                  and coalesce(c.staff_can_cost, false)
              )
            )
        )
      )
    );
$$;

drop policy if exists "v6 cost all" on ord_item_costs;
create policy "v6 cost all" on ord_item_costs
  for all
  using (ord_cost_ok())
  with check (ord_cost_ok());
