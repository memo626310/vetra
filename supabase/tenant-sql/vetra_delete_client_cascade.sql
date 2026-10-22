-- Run on each clinic tenant database, not VETRA CORE.
-- Permanently removes one client and all clinic records owned by that client.
begin;

create or replace function public.vetra_delete_client_cascade(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_pet_ids uuid[];
  v_visit_ids uuid[];
  v_invoice_ids uuid[];
  v_client_name text;
begin
  if v_clinic_id is null then
    raise exception 'An active clinic session is required';
  end if;

  select c.name into v_client_name
  from public.clients c
  where c.id = p_client_id and c.clinic_id = v_clinic_id
  for update;
  if v_client_name is null then
    raise exception 'Client not found in the active clinic';
  end if;

  select coalesce(array_agg(p.id), '{}'::uuid[]) into v_pet_ids
  from public.pets p where p.client_id = p_client_id;
  select coalesce(array_agg(v.id), '{}'::uuid[]) into v_visit_ids
  from public.visits v where v.pet_id = any(v_pet_ids);
  select coalesce(array_agg(i.id), '{}'::uuid[]) into v_invoice_ids
  from public.invoices i
  where i.client_id = p_client_id
     or i.pet_id = any(v_pet_ids)
     or i.visit_id = any(v_visit_ids);

  -- Remove ledger rows first because they restrict invoice deletion.
  if to_regclass('public.financial_transactions') is not null then
    delete from public.financial_transactions
    where related_invoice_id = any(v_invoice_ids);
  end if;
  if to_regclass('public.invoice_items') is not null then
    delete from public.invoice_items where invoice_id = any(v_invoice_ids);
  end if;
  delete from public.invoices where id = any(v_invoice_ids);

  if to_regclass('public.visit_medications') is not null then
    delete from public.visit_medications where visit_id = any(v_visit_ids);
  end if;
  if to_regclass('public.vaccinations') is not null then
    delete from public.vaccinations
    where pet_id = any(v_pet_ids) or visit_id = any(v_visit_ids);
  end if;
  if to_regclass('public.pet_medical_records') is not null then
    delete from public.pet_medical_records
    where client_id = p_client_id or pet_id = any(v_pet_ids) or visit_id = any(v_visit_ids);
  end if;
  if to_regclass('public.appointments') is not null then
    delete from public.appointments
    where client_id = p_client_id or pet_id = any(v_pet_ids);
  end if;
  delete from public.visits where id = any(v_visit_ids);
  delete from public.pets where id = any(v_pet_ids);
  delete from public.clients where id = p_client_id and clinic_id = v_clinic_id;

  return jsonb_build_object('clientName', v_client_name, 'petIds', to_jsonb(v_pet_ids));
end;
$$;

revoke all on function public.vetra_delete_client_cascade(uuid) from public, anon;
grant execute on function public.vetra_delete_client_cascade(uuid) to authenticated;
commit;
