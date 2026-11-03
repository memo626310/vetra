-- Run on each clinic tenant database, not VETRA CORE.
-- Legacy products may have a NULL is_active value. Treat NULL as active so
-- an item with sufficient stock can still be issued.
begin;

create or replace function public.issue_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_invoice public.invoices%rowtype;
  v_item record;
  v_product_name text;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if not public.vetra_has_clinic_staff_permission('invoices', 'create') then
    raise exception 'Only admins can issue invoices';
  end if;
  select * into v_invoice from public.invoices
    where id = p_invoice_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status <> 'draft' then raise exception 'Only draft invoices can be issued'; end if;
  if not exists (select 1 from public.invoice_items where invoice_id = p_invoice_id and clinic_id = v_clinic_id) then
    raise exception 'Invoice has no line items';
  end if;

  for v_item in
    select product_id, sum(quantity) as quantity
    from public.invoice_items
    where invoice_id = p_invoice_id and clinic_id = v_clinic_id and product_id is not null
    group by product_id
  loop
    select name into v_product_name from public.products
    where id = v_item.product_id and clinic_id = v_clinic_id;

    update public.products
       set quantity = coalesce(quantity, 0) - v_item.quantity, updated_at = now()
     where id = v_item.product_id and clinic_id = v_clinic_id
       and coalesce(is_active, true)
       and coalesce(quantity, 0) >= v_item.quantity;
    if not found then
      raise exception 'Product missing or insufficient stock: % (requested %, available %)',
        coalesce(v_product_name, v_item.product_id::text), v_item.quantity,
        coalesce((select quantity from public.products where id = v_item.product_id and clinic_id = v_clinic_id), 0);
    end if;
    insert into public.inventory_movements
      (clinic_id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
    values (v_clinic_id, v_item.product_id, 'sale', v_item.quantity, 'invoice', p_invoice_id,
      'Stock deducted when invoice was issued', auth.uid());
  end loop;

  update public.invoices
     set status = 'unpaid', issued_at = now(), updated_at = now(), updated_by = auth.uid()
   where id = p_invoice_id and clinic_id = v_clinic_id;
end;
$$;

revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
