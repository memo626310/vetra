-- Server-side dashboard counts for the active clinic.
-- Apply to each clinic tenant database.
begin;

create or replace function public.get_dashboard_inventory_stats(
  p_today date,
  p_expiry_until date
) returns table(
  low_stock bigint,
  out_of_stock bigint,
  near_expiry bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where quantity > 0 and quantity <= reorder_level),
    count(*) filter (where quantity <= 0),
    count(*) filter (
      where expiry_date is not null
        and expiry_date >= p_today
        and expiry_date <= p_expiry_until
    )
  from public.products
  where clinic_id = public.vetra_current_clinic_id()
    and is_active = true;
$$;

revoke all on function public.get_dashboard_inventory_stats(date, date) from public, anon;
grant execute on function public.get_dashboard_inventory_stats(date, date) to authenticated;

commit;
