-- VETRA invoice cancellation audit fields.
-- Run on the shared clinic database, not VETRA CORE.
begin;

alter table if exists public.invoices
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancellation_reason text;

create or replace function public.vetra_cancel_invoice(
  p_invoice_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_invoice public.invoices%rowtype;
  v_item record;
begin
  if v_clinic_id is null or auth.uid() is null then
    raise exception 'No active VETRA clinic found in token';
  end if;
  if not public.vetra_has_clinic_staff_permission('invoices', 'delete') then
    raise exception 'Invoice cancellation permission is required';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Cancellation reason is required';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id and clinic_id = v_clinic_id
  for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled' then return; end if;

  update public.invoices
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      cancellation_reason = trim(p_reason), updated_by = auth.uid(), updated_at = now()
  where id = v_invoice.id and clinic_id = v_clinic_id;

  for v_item in
    select im.reference_type, im.reference_id, im.product_id,
      greatest(
        sum(case when im.movement_type = 'sale' then im.quantity else 0 end)
        - sum(case when im.movement_type in ('return', 'cancelled_sale') then im.quantity else 0 end),
        0
      ) as quantity
    from public.inventory_movements im
    where im.clinic_id = v_clinic_id
      and (
        (im.reference_type = 'invoice' and im.reference_id = v_invoice.id)
        or (v_invoice.visit_id is not null and im.reference_type = 'visit' and im.reference_id = v_invoice.visit_id)
      )
      and im.movement_type in ('sale', 'return', 'cancelled_sale')
    group by im.reference_type, im.reference_id, im.product_id
    having sum(case when im.movement_type = 'sale' then im.quantity else 0 end)
      > sum(case when im.movement_type in ('return', 'cancelled_sale') then im.quantity else 0 end)
  loop
    update public.products
    set quantity = coalesce(quantity, 0) + v_item.quantity, updated_at = now()
    where id = v_item.product_id and clinic_id = v_clinic_id;
    if not found then raise exception 'Product % was not found while restoring invoice inventory', v_item.product_id; end if;

    insert into public.inventory_movements
      (clinic_id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
    values
      (v_clinic_id, v_item.product_id, 'return', v_item.quantity, v_item.reference_type, v_item.reference_id,
       'Restored inventory after invoice cancellation', auth.uid());
  end loop;
end;
$$;

revoke all on function public.vetra_cancel_invoice(uuid, text) from public, anon;
grant execute on function public.vetra_cancel_invoice(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
