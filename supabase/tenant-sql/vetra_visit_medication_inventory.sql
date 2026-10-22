-- Link visit prescriptions to stocked products without requiring an inventory match.
-- Run on each clinic tenant database.
begin;

alter table public.products
  add column if not exists active_ingredient text;

alter table public.visit_medications
  add column if not exists product_id uuid references public.products(id) on delete set null;

create or replace function public.vetra_dispense_visit_inventory(
  p_visit_id uuid,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_item record;
  v_product public.products%rowtype;
  v_category text;
  v_existing integer;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_visit_id is null then raise exception 'Visit is required'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'Inventory items must be an array'; end if;

  select count(*) into v_existing
  from public.inventory_movements
  where clinic_id = v_clinic_id
    and reference_type = 'visit'
    and reference_id = p_visit_id
    and movement_type = 'sale';
  if v_existing > 0 then return; end if;

  for v_item in
    select product_id, sum(quantity) as quantity, min(source_type) as source_type
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, source_type text)
    group by product_id
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Every dispensed item needs a positive quantity';
    end if;

    select p.* into v_product
    from public.products p
    where p.id = v_item.product_id and p.clinic_id = v_clinic_id and p.is_active = true
    for update;
    if not found then raise exception 'One of the selected inventory products was not found'; end if;

    select lower(trim(coalesce(c.name, ''))) into v_category
    from public.product_categories c
    where c.id = v_product.category_id and c.clinic_id = v_clinic_id;
    v_category := coalesce(v_category, '');

    if v_item.source_type = 'vaccination' then
      if v_category not in ('التطعيمات', 'اللقاحات', 'تطعيمات', 'vaccines', 'vaccinations') then
        raise exception 'Vaccination products must belong to the vaccinations category';
      end if;
      if v_item.quantity <> 1 then raise exception 'A vaccination must dispense exactly one piece'; end if;
    elsif v_item.source_type = 'medication' then
      if v_category not in ('الأدوية', 'ادوية', 'medications', 'medicines') then
        raise exception 'Medication drawer products must belong to the medications category';
      end if;
    else
      raise exception 'Unknown inventory source type';
    end if;

    if coalesce(v_product.quantity, 0) < v_item.quantity then
      raise exception 'Insufficient stock for product: %', v_product.name;
    end if;

    update public.products
    set quantity = coalesce(quantity, 0) - v_item.quantity
    where id = v_item.product_id and clinic_id = v_clinic_id;

    insert into public.inventory_movements
      (clinic_id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
    values
      (v_clinic_id, v_item.product_id, 'sale', v_item.quantity, 'visit', p_visit_id,
       case when v_item.source_type = 'vaccination' then 'Vaccination dispensed from visit' else 'Medication dispensed from medication drawer' end,
       auth.uid());
  end loop;
end;
$$;

create or replace function public.vetra_restore_visit_inventory(
  p_visit_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_item record;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  for v_item in
    select product_id, sum(quantity) as quantity
    from public.inventory_movements
    where clinic_id = v_clinic_id and reference_type = 'visit' and reference_id = p_visit_id and movement_type = 'sale'
    group by product_id
  loop
    update public.products
    set quantity = coalesce(quantity, 0) + v_item.quantity
    where id = v_item.product_id and clinic_id = v_clinic_id;
    insert into public.inventory_movements
      (clinic_id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
    values
      (v_clinic_id, v_item.product_id, 'return', v_item.quantity, 'visit', p_visit_id, 'Restored inventory after visit save failure', auth.uid());
  end loop;
end;
$$;

revoke all on function public.vetra_dispense_visit_inventory(uuid, jsonb) from public;
grant execute on function public.vetra_dispense_visit_inventory(uuid, jsonb) to authenticated;
revoke all on function public.vetra_restore_visit_inventory(uuid) from public;
grant execute on function public.vetra_restore_visit_inventory(uuid) to authenticated;

create table if not exists public.visit_prescriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  visit_id uuid not null references public.visits(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  medication_name text not null,
  active_ingredient text,
  prescription text,
  source text not null check (source in ('bsava', 'drug_eye', 'manual')),
  created_at timestamptz not null default now(),
  constraint visit_prescriptions_name_present check (length(trim(medication_name)) > 0)
);

create index if not exists visit_prescriptions_visit_idx
  on public.visit_prescriptions (visit_id, created_at);

alter table public.visit_prescriptions enable row level security;
drop policy if exists vetra_visit_prescriptions_select on public.visit_prescriptions;
create policy vetra_visit_prescriptions_select on public.visit_prescriptions
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_visit_prescriptions_insert on public.visit_prescriptions;
create policy vetra_visit_prescriptions_insert on public.visit_prescriptions
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_visit_prescriptions_delete on public.visit_prescriptions;
create policy vetra_visit_prescriptions_delete on public.visit_prescriptions
  for delete to authenticated using (clinic_id = public.vetra_current_clinic_id());

grant select, insert, delete on public.visit_prescriptions to authenticated;
revoke all on public.visit_prescriptions from anon, public;

commit;
