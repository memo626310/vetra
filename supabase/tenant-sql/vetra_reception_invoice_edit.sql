begin;

create or replace function public.vetra_update_reception_invoice(
  p_invoice_id uuid,
  p_client_id uuid,
  p_pet_id uuid,
  p_discount numeric,
  p_notes text,
  p_items jsonb
) returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_invoice public.invoices%rowtype;
  v_result public.invoices%rowtype;
  v_subtotal numeric(14,2);
  v_discount numeric(14,2) := greatest(coalesce(p_discount, 0), 0);
  v_total numeric(14,2);
begin
  if v_clinic_id is null or auth.uid() is null then
    raise exception 'No active VETRA clinic found in token';
  end if;
  if not exists (
    select 1 from public.clinic_staff
    where clinic_id = v_clinic_id and auth_user_id = auth.uid() and staff_type = 'front_desk'
  ) then
    raise exception 'Reception access is required';
  end if;
  if p_invoice_id is null or p_client_id is null or p_pet_id is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Invoice data is incomplete';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id and clinic_id = v_clinic_id
  for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.visit_id is null or v_invoice.status not in ('issued', 'unpaid') or coalesce(v_invoice.paid_amount, 0) > 0 then
    raise exception 'Only unpaid visit invoices can be edited';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and clinic_id = v_clinic_id) then
    raise exception 'Client not found';
  end if;
  if not exists (select 1 from public.pets where id = p_pet_id and client_id = p_client_id and clinic_id = v_clinic_id) then
    raise exception 'Pet does not belong to this client';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as item
    where item->>'item_type' is distinct from 'service' or nullif(item->>'product_id', '') is not null
  ) then
    raise exception 'Visit invoices can contain services only';
  end if;
  if not exists (
    select 1 from public.visits v
    where v.id = v_invoice.visit_id and v.clinic_id = v_clinic_id
      and v.client_id = p_client_id and v.pet_id = p_pet_id
  ) then
    raise exception 'Invoice client and pet must match the linked visit';
  end if;

  select coalesce(sum(
    greatest(coalesce((item->>'quantity')::numeric, 0), 0)
    * greatest(coalesce((item->>'unit_price')::numeric, 0), 0)
    - greatest(coalesce((item->>'discount')::numeric, 0), 0)
  ), 0)::numeric(14,2)
  into v_subtotal
  from jsonb_array_elements(p_items) as item;

  if v_discount > v_subtotal then v_discount := v_subtotal; end if;
  v_total := greatest(v_subtotal - v_discount, 0);

  update public.invoices
  set client_id = p_client_id,
      pet_id = p_pet_id,
      subtotal = v_subtotal,
      discount = v_discount,
      total = v_total,
      payment_method = null,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now(),
      updated_by = auth.uid()
  where id = v_invoice.id and clinic_id = v_clinic_id
  returning * into v_result;

  delete from public.invoice_items where invoice_id = v_invoice.id and clinic_id = v_clinic_id;
  insert into public.invoice_items
    (clinic_id, invoice_id, item_type, product_id, service_name, description, quantity, unit_price, discount, total)
  select
    v_clinic_id,
    v_invoice.id,
    'service',
    null,
    nullif(trim(item->>'service_name'), ''),
    nullif(trim(item->>'description'), ''),
    greatest(coalesce((item->>'quantity')::numeric, 0), 0),
    greatest(coalesce((item->>'unit_price')::numeric, 0), 0),
    greatest(coalesce((item->>'discount')::numeric, 0), 0),
    greatest(
      greatest(coalesce((item->>'quantity')::numeric, 0), 0)
      * greatest(coalesce((item->>'unit_price')::numeric, 0), 0)
      - greatest(coalesce((item->>'discount')::numeric, 0), 0), 0
    )
  from jsonb_array_elements(p_items) as item;

  return v_result;
end;
$$;

revoke all on function public.vetra_update_reception_invoice(uuid, uuid, uuid, numeric, text, jsonb) from public, anon;
grant execute on function public.vetra_update_reception_invoice(uuid, uuid, uuid, numeric, text, jsonb) to authenticated;

commit;
