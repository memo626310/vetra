-- Run on each clinic tenant database, not VETRA CORE.
-- Deletes one pet and its clinic-owned history in dependency order.
begin;

-- Keep the database safe for the legacy direct-delete path as well.
alter table if exists public.financial_transactions
  drop constraint if exists financial_transactions_related_invoice_id_fkey;
alter table if exists public.financial_transactions
  add constraint financial_transactions_related_invoice_id_fkey
  foreign key (related_invoice_id) references public.invoices(id) on delete cascade;
alter table if exists public.invoice_returns
  drop constraint if exists invoice_returns_invoice_id_fkey;
alter table if exists public.invoice_returns
  add constraint invoice_returns_invoice_id_fkey
  foreign key (invoice_id) references public.invoices(id) on delete cascade;

create or replace function public.vetra_delete_pet_cascade(p_pet_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_pet_name text;
  v_client_id uuid;
  v_visit_ids uuid[] := '{}'::uuid[];
  v_invoice_ids uuid[] := '{}'::uuid[];
begin
  if v_clinic_id is null then
    raise exception 'An active clinic session is required';
  end if;
  if not public.vetra_has_clinic_staff_permission('patients', 'delete') then
    raise exception 'Patient delete permission is required';
  end if;

  select p.name, p.client_id
    into v_pet_name, v_client_id
  from public.pets p
  where p.id = p_pet_id and p.clinic_id = v_clinic_id
  for update;
  if not found then
    raise exception 'Pet not found in the active clinic';
  end if;

  select coalesce(array_agg(v.id), '{}'::uuid[])
    into v_visit_ids
  from public.visits v
  where v.pet_id = p_pet_id and v.clinic_id = v_clinic_id;

  select coalesce(array_agg(i.id), '{}'::uuid[])
    into v_invoice_ids
  from public.invoices i
  where i.pet_id = p_pet_id
     or i.visit_id = any(v_visit_ids);

  -- Financial ledger rows and returns use RESTRICT foreign keys to invoices.
  if to_regclass('public.financial_transactions') is not null then
    delete from public.financial_transactions
    where related_invoice_id = any(v_invoice_ids);
  end if;
  if to_regclass('public.invoice_return_items') is not null
     and to_regclass('public.invoice_returns') is not null then
    delete from public.invoice_return_items
    where return_id in (select r.id from public.invoice_returns r where r.invoice_id = any(v_invoice_ids));
  end if;
  if to_regclass('public.invoice_returns') is not null then
    delete from public.invoice_returns where invoice_id = any(v_invoice_ids);
  end if;
  if to_regclass('public.invoice_items') is not null then
    delete from public.invoice_items where invoice_id = any(v_invoice_ids);
  end if;
  delete from public.invoices where id = any(v_invoice_ids);

  if to_regclass('public.visit_medications') is not null then
    delete from public.visit_medications where visit_id = any(v_visit_ids);
  end if;
  if to_regclass('public.vaccinations') is not null then
    delete from public.vaccinations where pet_id = p_pet_id or visit_id = any(v_visit_ids);
  end if;
  if to_regclass('public.pet_medical_records') is not null then
    delete from public.pet_medical_records where pet_id = p_pet_id or visit_id = any(v_visit_ids);
  end if;
  if to_regclass('public.appointments') is not null then
    delete from public.appointments where pet_id = p_pet_id;
  end if;
  if to_regclass('public.visit_attachments') is not null then
    delete from public.visit_attachments where pet_id = p_pet_id or visit_id = any(v_visit_ids);
  end if;
  delete from public.visits where id = any(v_visit_ids);
  delete from public.pets where id = p_pet_id and clinic_id = v_clinic_id;

  return jsonb_build_object('petName', v_pet_name, 'clientId', v_client_id);
end;
$$;

revoke all on function public.vetra_delete_pet_cascade(uuid) from public, anon;
grant execute on function public.vetra_delete_pet_cascade(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
