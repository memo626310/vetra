-- VETRA Shared Clinic Database bootstrap
-- Reconstructs the tenant database schema used by the current application.
-- IMPORTANT: this is a schema bootstrap, not a data backup. It cannot restore
-- deleted clinic records. Validate on a NEW Supabase project before switching
-- VETRA Core clinic_databases to its URL/key. Never run against VETRA Core.
--
-- The original shared database dump was not available. Core table definitions
-- below are reconstructed from this repository's queries and tenant migrations;
-- review these inferred base definitions before production use.

begin;

create extension if not exists pgcrypto;

-- Clinic tokens are minted by VETRA Core. Accept the direct custom claim and
-- the common app_metadata shape; malformed/missing claims resolve to NULL.
create or replace function public.vetra_current_clinic_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_claims jsonb;
  v_value text;
begin
  v_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_value := coalesce(
    v_claims ->> 'clinic_id',
    v_claims #>> '{app_metadata,clinic_id}',
    v_claims #>> '{user_metadata,clinic_id}'
  );
  if v_value is null or v_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v_value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.vetra_set_clinic_id()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
begin
  if v_clinic_id is null then
    raise exception 'No active VETRA clinic found in token' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.clinic_id is distinct from v_clinic_id then
    raise exception 'Cannot update a row outside the active clinic' using errcode = '42501';
  end if;
  new.clinic_id := v_clinic_id;
  return new;
end;
$$;

create or replace function public.vetra_current_owner_client_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_code text := nullif(trim(v_headers ->> 'x-vetra-client-code'), '');
  v_phone text := nullif(trim(v_headers ->> 'x-vetra-client-phone'), '');
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_client_id uuid;
begin
  if v_code is null or v_phone is null or v_clinic_id is null then return null; end if;
  select c.id into v_client_id
  from public.clients c
  where c.clinic_id = v_clinic_id and c.client_code = v_code
    and regexp_replace(coalesce(c.phone, ''), '\s+', '', 'g') = regexp_replace(v_phone, '\s+', '', 'g')
  limit 1;
  return v_client_id;
exception when others then
  return null;
end;
$$;

-- Core business tables. These definitions are inferred from application usage;
-- keep this section under review when the application schema changes.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  client_code text,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  species text not null,
  breed text,
  gender text,
  birth_date date,
  color text,
  microchip text,
  weight numeric(8,2),
  photo_url text,
  is_deceased boolean not null default false,
  deceased_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep existing tenant databases compatible when this bootstrap is re-run.
alter table public.pets
  add column if not exists microchip text;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  name text not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null, barcode text, sku text, unit text not null default 'piece',
  active_ingredient text,
  quantity numeric(14,3) not null default 0, wholesale_price numeric(14,2) not null default 0,
  retail_price numeric(14,2) not null default 0, last_purchase_price numeric(14,2),
  expiry_date date, reorder_level numeric(14,3) not null default 0,
  is_active boolean not null default true, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(), clinic_id uuid,
  name text not null, active_ingredient text, concentration numeric,
  concentration_unit text, species text[] not null default '{}',
  dose_value numeric, dose_min numeric, dose_max numeric, dose_unit text,
  dose_type text, route text, frequency text, duration_days integer,
  instructions text, active boolean not null default true,
  notes text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.medications
  add column if not exists dose_min numeric,
  add column if not exists dose_max numeric,
  add column if not exists frequency text,
  add column if not exists duration_days integer,
  add column if not exists instructions text,
  add column if not exists active boolean not null default true;

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  client_id uuid not null references public.clients(id) on delete restrict,
  pet_id uuid not null references public.pets(id) on delete restrict,
  visit_date timestamptz not null default now(), reason text, symptoms text,
  examination text, heart_rate numeric(8,2), respiratory_rate numeric(8,2),
  diagnosis text, treatment text, notes text, weight numeric(8,2), temperature numeric(5,2),
  veterinarian text, veterinarian_id uuid, status text not null default 'completed',
  follow_up_date date, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), created_by uuid, updated_by uuid
);

create table if not exists public.visit_medications (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  visit_id uuid not null references public.visits(id) on delete cascade,
  medication_id uuid references public.medications(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  medication_name text, dosage text, frequency text, duration text, duration_days integer,
  weight_kg numeric(8,2), dose_per_kg numeric(12,4), concentration numeric(14,4),
  concentration_unit text,
  calculated_dose numeric, calculated_dose_unit text, calculated_volume numeric,
  volume_unit text, route text, quantity numeric(14,3), instructions text,
  created_at timestamptz not null default now()
);

create table if not exists public.vaccinations (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  pet_id uuid not null references public.pets(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  visit_id uuid references public.visits(id) on delete set null,
  vaccine_name text not null, vaccine_type text, administered_at timestamptz not null default now(),
  dose text, route text, batch_number text, manufacturer text,
  next_dose_at timestamptz, notes text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), administered_by uuid
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  pet_id uuid references public.pets(id) on delete set null,
  appointment_date date not null, start_time time not null, end_time time,
  reason text, status text not null default 'pending', notes text, source text not null default 'clinic', created_by uuid,
  arrived_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.appointment_settings (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null unique,
  online_booking_enabled boolean not null default true,
  today_booking_enabled boolean not null default true,
  client_cancellation_enabled boolean not null default true,
  client_rescheduling_enabled boolean not null default false,
  no_show_grace_minutes integer not null default 30,
  booking_start_time time not null default '09:00',
  booking_end_time time not null default '21:00',
  default_duration_minutes integer not null default 30,
  settings jsonb not null default '{}', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_settings (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null unique,
  currency text not null default 'EGP', tax_rate numeric(7,3) not null default 0,
  invoice_prefix text, invoice_footer text,
  consultation_fee numeric(14,2) not null default 0,
  injection_fee numeric(14,2) not null default 0,
  follow_up_fee numeric(14,2) not null default 0,
  auto_add_consultation_fee boolean not null default false,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  invoice_number bigint generated by default as identity unique,
  client_id uuid references public.clients(id) on delete set null,
  pet_id uuid references public.pets(id) on delete set null,
  visit_id uuid references public.visits(id) on delete set null,
  invoice_date timestamptz not null default now(), status text not null default 'draft',
  issued_at timestamptz,
  subtotal numeric(14,2) not null default 0, discount numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0, payment_method text, paid_at timestamptz,
  notes text, cancelled_at timestamptz, cancelled_by uuid, cancellation_reason text,
  created_by uuid, updated_by uuid, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text, service_name text, item_type text,
  quantity numeric(14,3) not null default 1,
  unit_price numeric(14,2) not null default 0, discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0, created_at timestamptz not null default now()
);

create table if not exists public.invoice_returns (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  return_number bigint generated by default as identity, status text not null default 'completed',
  total numeric(14,2) not null default 0, refund_amount numeric(14,2) not null default 0,
  reason text, returned_at timestamptz not null default now(),
  created_by uuid, created_at timestamptz not null default now()
);

create table if not exists public.invoice_return_items (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  return_id uuid not null references public.invoice_returns(id) on delete cascade,
  invoice_item_id uuid references public.invoice_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  description text, quantity numeric(14,3) not null default 1,
  unit_price numeric(14,2) not null default 0, refund_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null, quantity numeric(14,3) not null,
  unit_cost numeric(14,2), reference_type text, reference_id uuid,
  notes text, created_by uuid, created_at timestamptz not null default now()
);

create table if not exists public.owner_medication_checkins (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  visit_medication_id uuid not null references public.visit_medications(id) on delete cascade,
  scheduled_date date not null, dose_slot integer not null default 1,
  completed boolean not null default true, completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (visit_medication_id, scheduled_date, dose_slot)
);

create table if not exists public.clinic_drug_product_links (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null,
  product_key text not null,
  drug_eye_product_id text,
  drug_eye_name text not null,
  drug_eye_active_ingredient text,
  drug_eye_category text,
  drug_eye_manufacturer text,
  drug_eye_price text,
  vetra_medication_id uuid references public.medications(id) on delete set null,
  bsava_drug_id bigint,
  bsava_drug_name text,
  bsava_active_ingredient text,
  link_status text not null default 'unmatched' check (link_status in ('unmatched','partial','linked')),
  match_method text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (clinic_id, product_key)
);

-- Owner-side booking and pet registration RPCs used by the client portal.
create or replace function public.vetra_add_pet_for_owner(
  p_name text, p_species text, p_gender text default null, p_birth_date date default null,
  p_breed text default null, p_color text default null
) returns public.pets
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_client_id uuid := public.vetra_current_owner_client_id(); v_pet public.pets%rowtype;
begin
  if v_client_id is null then raise exception 'Pet owner session could not be verified'; end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_species), '') is null then
    raise exception 'Pet name and species are required';
  end if;
  insert into public.pets (clinic_id, client_id, name, species, gender, birth_date, breed, color)
  values (public.vetra_current_clinic_id(), v_client_id, trim(p_name), trim(p_species),
    nullif(trim(p_gender), ''), p_birth_date, nullif(trim(p_breed), ''), nullif(trim(p_color), ''))
  returning * into v_pet;
  return v_pet;
end;
$$;
revoke all on function public.vetra_add_pet_for_owner(text,text,text,date,text,text) from public;
grant execute on function public.vetra_add_pet_for_owner(text,text,text,date,text,text) to anon, authenticated;

create or replace function public.vetra_client_booking_settings(p_clinic_id uuid)
returns setof public.appointment_settings
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_client_id uuid := public.vetra_current_owner_client_id(); v_client_clinic uuid;
begin
  if v_client_id is null then raise exception 'Pet owner session could not be verified'; end if;
  select clinic_id into v_client_clinic from public.clients where id = v_client_id;
  if v_client_clinic is distinct from p_clinic_id then raise exception 'Clinic does not match owner account'; end if;
  return query select s.* from public.appointment_settings s
    where s.clinic_id = p_clinic_id and s.online_booking_enabled;
end;
$$;
revoke all on function public.vetra_client_booking_settings(uuid) from public;
grant execute on function public.vetra_client_booking_settings(uuid) to anon, authenticated;

create or replace function public.vetra_client_available_slots(
  p_clinic_id uuid, p_date date, p_exclude_appointment_id uuid default null
) returns table(start_time time)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_client_id uuid := public.vetra_current_owner_client_id();
  v_client_clinic uuid;
  v_settings public.appointment_settings%rowtype;
  v_slot time;
  v_duration integer;
begin
  if v_client_id is null then raise exception 'Pet owner session could not be verified'; end if;
  select clinic_id into v_client_clinic from public.clients where id = v_client_id;
  if v_client_clinic is distinct from p_clinic_id then raise exception 'Clinic does not match owner account'; end if;
  select * into v_settings from public.appointment_settings s where s.clinic_id = p_clinic_id;
  if not found or not v_settings.online_booking_enabled then return; end if;
  if p_date < current_date or (p_date = current_date and not v_settings.today_booking_enabled) then return; end if;
  v_duration := greatest(coalesce(v_settings.default_duration_minutes, 30), 5);
  v_slot := v_settings.booking_start_time;
  while v_slot + make_interval(mins => v_duration) <= v_settings.booking_end_time loop
    if not exists (
      select 1 from public.appointments a
      where a.clinic_id = p_clinic_id and a.appointment_date = p_date
        and a.id is distinct from p_exclude_appointment_id
        and a.status not in ('cancelled', 'no_show')
        and a.start_time < v_slot + make_interval(mins => v_duration)
        and coalesce(a.end_time, a.start_time + make_interval(mins => v_duration)) > v_slot
    ) then start_time := v_slot; return next; end if;
    v_slot := v_slot + make_interval(mins => v_duration);
  end loop;
end;
$$;
revoke all on function public.vetra_client_available_slots(uuid,date,uuid) from public;
grant execute on function public.vetra_client_available_slots(uuid,date,uuid) to anon, authenticated;


-- Basic invoice issuance required by the current application. The staff
-- permission migration below replaces this initial admin-only guard with the
-- clinic's configured invoice permission while retaining issuance logic.
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
    update public.products
       set quantity = coalesce(quantity, 0) - v_item.quantity, updated_at = now()
     where id = v_item.product_id and clinic_id = v_clinic_id
       and coalesce(is_active, true)
       and coalesce(quantity, 0) >= v_item.quantity;
    if not found then raise exception 'Product missing or insufficient stock: %', v_item.product_id; end if;
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
  if v_clinic_id is null or auth.uid() is null then raise exception 'No active VETRA clinic found in token'; end if;
  if not public.vetra_has_clinic_staff_permission('invoices', 'delete') then raise exception 'Invoice cancellation permission is required'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Cancellation reason is required'; end if;
  select * into v_invoice from public.invoices where id = p_invoice_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'cancelled' then return; end if;

  update public.invoices
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
      cancellation_reason = trim(p_reason), updated_by = auth.uid(), updated_at = now()
  where id = v_invoice.id and clinic_id = v_clinic_id;

  for v_item in
    select im.reference_type, im.reference_id, im.product_id,
      greatest(sum(case when im.movement_type = 'sale' then im.quantity else 0 end)
        - sum(case when im.movement_type in ('return', 'cancelled_sale') then im.quantity else 0 end), 0) as quantity
    from public.inventory_movements im
    where im.clinic_id = v_clinic_id
      and ((im.reference_type = 'invoice' and im.reference_id = v_invoice.id)
        or (v_invoice.visit_id is not null and im.reference_type = 'visit' and im.reference_id = v_invoice.visit_id))
      and im.movement_type in ('sale', 'return', 'cancelled_sale')
    group by im.reference_type, im.reference_id, im.product_id
    having sum(case when im.movement_type = 'sale' then im.quantity else 0 end)
      > sum(case when im.movement_type in ('return', 'cancelled_sale') then im.quantity else 0 end)
  loop
    update public.products set quantity = coalesce(quantity, 0) + v_item.quantity, updated_at = now()
      where id = v_item.product_id and clinic_id = v_clinic_id;
    if not found then raise exception 'Product % was not found while restoring invoice inventory', v_item.product_id; end if;
    insert into public.inventory_movements
      (clinic_id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
    values (v_clinic_id, v_item.product_id, 'return', v_item.quantity, v_item.reference_type, v_item.reference_id,
      'Restored inventory after invoice cancellation', auth.uid());
  end loop;
end;
$$;
revoke all on function public.vetra_cancel_invoice(uuid, text) from public, anon;
grant execute on function public.vetra_cancel_invoice(uuid, text) to authenticated;

-- Tenant isolation on all inferred clinic-owned tables. Separate permissive
-- policies are required so the later staff policies can safely add restrictions.
do $$
declare t text;
begin
  foreach t in array array[
    'clients','pets','product_categories','products','visits','visit_medications',
    'vaccinations','appointments','appointment_settings','billing_settings','invoices',
    'invoice_items','invoice_returns','invoice_return_items','inventory_movements',
    'owner_medication_checkins','clinic_drug_product_links'
  ] loop
    execute format('create index if not exists %I on public.%I (clinic_id)', t || '_clinic_id_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'vetra_tenant_select_' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (clinic_id = public.vetra_current_clinic_id())', 'vetra_tenant_select_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'vetra_tenant_insert_' || t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id())', 'vetra_tenant_insert_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'vetra_tenant_update_' || t, t);
    execute format('create policy %I on public.%I for update to authenticated using (clinic_id = public.vetra_current_clinic_id()) with check (clinic_id = public.vetra_current_clinic_id())', 'vetra_tenant_update_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'vetra_tenant_delete_' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (clinic_id = public.vetra_current_clinic_id())', 'vetra_tenant_delete_' || t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists %I on public.%I', 'vetra_set_clinic_id_' || t, t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.vetra_set_clinic_id()', 'vetra_set_clinic_id_' || t, t);
  end loop;
end;
$$;

-- The formulary is shared/read-only and can be read by clinic and owner sessions.
alter table public.medications enable row level security;
drop policy if exists vetra_medications_read on public.medications;
create policy vetra_medications_read on public.medications for select to anon, authenticated
  using (clinic_id is null or clinic_id = public.vetra_current_clinic_id());
grant select on public.medications to anon, authenticated;

-- Owner portal access is bound to the signed clinic token and the extra
-- client-code/phone headers set by the portal client.
drop policy if exists vetra_owner_select_clients on public.clients;
create policy vetra_owner_select_clients on public.clients for select to anon, authenticated
  using (id = public.vetra_current_owner_client_id());
drop policy if exists vetra_owner_select_pets on public.pets;
create policy vetra_owner_select_pets on public.pets for select to anon, authenticated
  using (client_id = public.vetra_current_owner_client_id());
drop policy if exists vetra_owner_select_visits on public.visits;
create policy vetra_owner_select_visits on public.visits for select to anon, authenticated
  using (client_id = public.vetra_current_owner_client_id());
drop policy if exists vetra_owner_select_vaccinations on public.vaccinations;
create policy vetra_owner_select_vaccinations on public.vaccinations for select to anon, authenticated
  using (exists (select 1 from public.pets p where p.id = vaccinations.pet_id and p.client_id = public.vetra_current_owner_client_id()));
drop policy if exists vetra_owner_select_appointments on public.appointments;
create policy vetra_owner_select_appointments on public.appointments for select to anon, authenticated
  using (client_id = public.vetra_current_owner_client_id());
drop policy if exists vetra_owner_insert_appointments on public.appointments;
create policy vetra_owner_insert_appointments on public.appointments for insert to anon, authenticated
  with check (client_id = public.vetra_current_owner_client_id()
    and clinic_id = public.vetra_current_clinic_id()
    and status in ('pending', 'confirmed'));
drop policy if exists vetra_owner_update_appointments on public.appointments;
create policy vetra_owner_update_appointments on public.appointments for update to anon, authenticated
  using (client_id = public.vetra_current_owner_client_id())
  with check (client_id = public.vetra_current_owner_client_id()
    and clinic_id = public.vetra_current_clinic_id()
    and status in ('pending', 'confirmed', 'cancelled'));
drop policy if exists vetra_owner_select_visit_medications on public.visit_medications;
create policy vetra_owner_select_visit_medications on public.visit_medications for select to anon, authenticated
  using (exists (select 1 from public.visits v where v.id = visit_medications.visit_id and v.client_id = public.vetra_current_owner_client_id()));
alter table public.owner_medication_checkins enable row level security;
drop policy if exists vetra_owner_select_medication_checkins on public.owner_medication_checkins;
create policy vetra_owner_select_medication_checkins on public.owner_medication_checkins for select to anon, authenticated
  using (client_id = public.vetra_current_owner_client_id());
drop policy if exists vetra_owner_insert_medication_checkins on public.owner_medication_checkins;
create policy vetra_owner_insert_medication_checkins on public.owner_medication_checkins for insert to anon, authenticated
  with check (client_id = public.vetra_current_owner_client_id()
    and clinic_id = public.vetra_current_clinic_id()
    and exists (select 1 from public.pets p where p.id = pet_id and p.client_id = client_id));
drop policy if exists vetra_owner_update_medication_checkins on public.owner_medication_checkins;
create policy vetra_owner_update_medication_checkins on public.owner_medication_checkins for update to anon, authenticated
  using (client_id = public.vetra_current_owner_client_id())
  with check (client_id = public.vetra_current_owner_client_id()
    and clinic_id = public.vetra_current_clinic_id());
grant select on public.clients, public.pets, public.visits, public.vaccinations,
  public.appointments, public.visit_medications to anon, authenticated;
grant insert, update on public.appointments to anon, authenticated;
grant select, insert, update on public.owner_medication_checkins to anon, authenticated;

create index if not exists clients_phone_idx on public.clients (clinic_id, phone);
create unique index if not exists clients_client_code_unique on public.clients (clinic_id, client_code) where client_code is not null;
create index if not exists pets_client_created_idx on public.pets (clinic_id, client_id, created_at desc);
create index if not exists visits_pet_date_idx on public.visits (clinic_id, pet_id, visit_date desc);
create index if not exists visits_client_date_idx on public.visits (clinic_id, client_id, visit_date desc);
create index if not exists appointments_start_idx on public.appointments (clinic_id, appointment_date, start_time);
create index if not exists invoices_client_date_idx on public.invoices (clinic_id, client_id, invoice_date desc);
create index if not exists invoice_items_invoice_idx on public.invoice_items (clinic_id, invoice_id);
create index if not exists inventory_movements_product_created_idx on public.inventory_movements (clinic_id, product_id, created_at desc);

commit;

-- The rest of this file contains the repository's tenant SQL modules in dependency
-- order. They add finance, permissions, staff, appointments/visits support,
-- attachment/medical records, reception, and legacy import workflows.

-- -----------------------------------------------------------------------------
-- Application and import modules
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- Application and import modules
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- Application and import modules
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- Application and import modules
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- Application and import modules
-- -----------------------------------------------------------------------------


-- >>> SOURCE: C:\Users\omnia fawzy\Downloads\VETRA_FINANCE_CASH_REGISTER.sql

-- VETRA Finance + Cash Registers + Sales Collections
-- Run on the Shared Clinic Database (NOT VETRA CORE).
-- Safe additive migration: creates new clinic-scoped finance tables and RPCs.
-- It does NOT import legacy Access balances or rewrite existing invoices.

begin;

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  account_type text not null check (account_type in ('cash','bank','wallet','card','other')),
  requires_session boolean not null default false,
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  is_active boolean not null default true,
  is_default boolean not null default false,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, name),
  constraint financial_accounts_cash_session_rule check (
    (account_type = 'cash' and requires_session = true)
    or (account_type <> 'cash' and requires_session = false)
  )
);

create unique index if not exists financial_accounts_one_default_type_idx
  on public.financial_accounts (clinic_id, account_type)
  where is_default = true;

create table if not exists public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  status text not null default 'open' check (status in ('open','closed')),
  opening_expected_balance numeric(14,2) not null default 0,
  opening_counted_balance numeric(14,2) not null default 0,
  opening_difference numeric(14,2) not null default 0,
  expected_closing_balance numeric(14,2),
  counted_closing_balance numeric(14,2),
  closing_difference numeric(14,2),
  opened_by uuid,
  closed_by uuid,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_notes text,
  closing_notes text,
  created_at timestamptz not null default now(),
  constraint cash_register_sessions_close_fields check (
    (status = 'open' and closed_at is null)
    or (status = 'closed' and closed_at is not null and counted_closing_balance is not null)
  )
);

create unique index if not exists cash_register_sessions_one_open_per_account_idx
  on public.cash_register_sessions (clinic_id, account_id)
  where status = 'open';

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  session_id uuid references public.cash_register_sessions(id) on delete restrict,
  direction text not null check (direction in ('in','out')),
  transaction_type text not null check (transaction_type in (
    'invoice_payment','income','expense','supplier_payment','refund',
    'transfer_in','transfer_out','adjustment'
  )),
  amount numeric(14,2) not null check (amount > 0),
  transaction_at timestamptz not null default now(),
  description text not null check (length(trim(description)) > 0),
  category text,
  payment_method text,
  reference text,
  counterparty_name text,
  related_invoice_id uuid references public.invoices(id) on delete restrict,
  transfer_group_id uuid,
  status text not null default 'posted' check (status in ('posted','voided')),
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint financial_transactions_type_direction_check check (
    (transaction_type = 'invoice_payment' and direction = 'in' and related_invoice_id is not null)
    or (transaction_type = 'income' and direction = 'in')
    or (transaction_type in ('expense','supplier_payment','refund','transfer_out') and direction = 'out')
    or (transaction_type = 'transfer_in' and direction = 'in')
    or (transaction_type = 'adjustment')
  )
);

create unique index if not exists financial_transactions_idempotency_idx
  on public.financial_transactions (clinic_id, idempotency_key);
create index if not exists financial_transactions_account_time_idx
  on public.financial_transactions (clinic_id, account_id, transaction_at desc);
create index if not exists financial_transactions_invoice_idx
  on public.financial_transactions (clinic_id, related_invoice_id, transaction_at desc)
  where related_invoice_id is not null;
create index if not exists financial_transactions_session_idx
  on public.financial_transactions (clinic_id, session_id, transaction_at desc)
  where session_id is not null;

-- >>> SOURCE: supabase/tenant-sql/vetra_invoice_delete_fk_repairs.sql

-- Deleting a pet/client intentionally removes their invoices and the
-- financial rows created only for those invoices.
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

-- Balance comes only from the opening balance plus posted ledger movements.
create or replace view public.financial_account_balances
with (security_invoker = true)
as
select
  a.id,
  a.clinic_id,
  a.name,
  a.account_type,
  a.requires_session,
  a.opening_balance,
  a.is_active,
  a.is_default,
  a.notes,
  a.created_at,
  a.updated_at,
  a.opening_balance + coalesce(sum(
    case when t.direction = 'in' then t.amount else -t.amount end
  ) filter (where t.status = 'posted'), 0) as current_balance
from public.financial_accounts a
left join public.financial_transactions t
  on t.account_id = a.id and t.clinic_id = a.clinic_id
 group by a.id, a.clinic_id, a.name, a.account_type, a.requires_session,
          a.opening_balance, a.is_active, a.is_default, a.notes, a.created_at, a.updated_at;

-- The dashboard can read only rows belonging to the tenant in the signed clinic token.
alter table public.financial_accounts enable row level security;
alter table public.cash_register_sessions enable row level security;
alter table public.financial_transactions enable row level security;

drop policy if exists vetra_financial_accounts_select on public.financial_accounts;
create policy vetra_financial_accounts_select on public.financial_accounts
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_cash_sessions_select on public.cash_register_sessions;
create policy vetra_cash_sessions_select on public.cash_register_sessions
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_financial_transactions_select on public.financial_transactions;
create policy vetra_financial_transactions_select on public.financial_transactions
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());

-- RLS policies do not grant SQL privileges by themselves. Authenticated users can read only;
-- all writes go through tenant-scoped SECURITY DEFINER functions below.
grant select on public.financial_accounts to authenticated;
grant select on public.cash_register_sessions to authenticated;
grant select on public.financial_transactions to authenticated;
grant select on public.financial_account_balances to authenticated;

-- Seed default accounts only for clinic IDs already present in known operational tables.
with clinic_ids as (
  select clinic_id from public.invoices where clinic_id is not null
  union select clinic_id from public.billing_settings where clinic_id is not null
  union select clinic_id from public.clients where clinic_id is not null
  union select clinic_id from public.products where clinic_id is not null
), defaults(name, account_type, requires_session) as (
  values
    ('الخزنة الرئيسية', 'cash', true),
    ('البنك', 'bank', false),
    ('المحافظ الإلكترونية', 'wallet', false),
    ('مدفوعات البطاقات', 'card', false)
)
insert into public.financial_accounts
  (clinic_id, name, account_type, requires_session, is_default)
select c.clinic_id, d.name, d.account_type, d.requires_session, true
from clinic_ids c cross join defaults d
on conflict (clinic_id, name) do nothing;

-- Create a financial account through a tenant-checked server function.
create or replace function public.vetra_create_financial_account(
  p_name text,
  p_account_type text,
  p_opening_balance numeric default 0,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_id uuid;
  v_type text := lower(trim(coalesce(p_account_type, '')));
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Account name is required'; end if;
  if v_type not in ('cash','bank','wallet','card','other') then raise exception 'Invalid account type'; end if;
  if coalesce(p_opening_balance, 0) < 0 then raise exception 'Opening balance cannot be negative'; end if;

  insert into public.financial_accounts
    (clinic_id, name, account_type, requires_session, opening_balance, is_default, notes, created_by)
  values
    (v_clinic_id, trim(p_name), v_type, v_type = 'cash', coalesce(p_opening_balance, 0), false,
     nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.vetra_open_cash_register(
  p_account_id uuid,
  p_counted_opening numeric,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_account public.financial_accounts%rowtype;
  v_expected numeric(14,2);
  v_session_id uuid;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_counted_opening is null or p_counted_opening < 0 then raise exception 'Enter a valid opening cash count'; end if;

  select * into v_account
  from public.financial_accounts
  where id = p_account_id and clinic_id = v_clinic_id
  for update;
  if not found then raise exception 'Financial account not found for this clinic'; end if;
  if not v_account.is_active then raise exception 'This account is inactive'; end if;
  if not v_account.requires_session then raise exception 'This account does not use cash register sessions'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_clinic_id::text || ':' || p_account_id::text, 0));
  if exists (select 1 from public.cash_register_sessions s
             where s.clinic_id = v_clinic_id and s.account_id = p_account_id and s.status = 'open') then
    raise exception 'There is already an open session for this register';
  end if;

  select v_account.opening_balance + coalesce(sum(
    case when t.direction = 'in' then t.amount else -t.amount end
  ) filter (where t.status = 'posted'), 0)
  into v_expected
  from public.financial_transactions t
  where t.clinic_id = v_clinic_id and t.account_id = p_account_id;

  insert into public.cash_register_sessions
    (clinic_id, account_id, opening_expected_balance, opening_counted_balance,
     opening_difference, opened_by, opening_notes)
  values
    (v_clinic_id, p_account_id, coalesce(v_expected, v_account.opening_balance), p_counted_opening,
     p_counted_opening - coalesce(v_expected, v_account.opening_balance), auth.uid(), nullif(trim(p_notes), ''))
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.vetra_close_cash_register(
  p_session_id uuid,
  p_counted_closing numeric,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_session public.cash_register_sessions%rowtype;
  v_expected numeric(14,2);
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_counted_closing is null or p_counted_closing < 0 then raise exception 'Enter a valid closing cash count'; end if;

  select * into v_session from public.cash_register_sessions
  where id = p_session_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Cash register session not found'; end if;
  if v_session.status <> 'open' then raise exception 'This register session is already closed'; end if;

  select v_session.opening_expected_balance + coalesce(sum(
    case when t.direction = 'in' then t.amount else -t.amount end
  ) filter (where t.status = 'posted'), 0)
  into v_expected
  from public.financial_transactions t
  where t.clinic_id = v_clinic_id and t.session_id = v_session.id;

  update public.cash_register_sessions
  set status = 'closed', closed_at = now(), closed_by = auth.uid(),
      expected_closing_balance = coalesce(v_expected, v_session.opening_expected_balance),
      counted_closing_balance = p_counted_closing,
      closing_difference = p_counted_closing - coalesce(v_expected, v_session.opening_expected_balance),
      closing_notes = nullif(trim(p_notes), '')
  where id = v_session.id and clinic_id = v_clinic_id;

  return v_session.id;
end;
$$;

create or replace function public.vetra_post_financial_transaction(
  p_account_id uuid,
  p_direction text,
  p_transaction_type text,
  p_amount numeric,
  p_description text,
  p_category text default null,
  p_payment_method text default null,
  p_reference text default null,
  p_counterparty_name text default null,
  p_session_id uuid default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_account public.financial_accounts%rowtype;
  v_session_id uuid := p_session_id;
  v_transaction_id uuid;
  v_existing public.financial_transactions%rowtype;
  v_direction text := lower(trim(coalesce(p_direction, '')));
  v_type text := lower(trim(coalesce(p_transaction_type, '')));
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if nullif(trim(p_description), '') is null then raise exception 'Description is required'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;
  if v_direction not in ('in','out') then raise exception 'Direction must be in or out'; end if;
  if v_type not in ('income','expense','supplier_payment','refund','adjustment') then raise exception 'Invalid transaction type'; end if;
  if v_type = 'income' and v_direction <> 'in' then raise exception 'Income must be an incoming transaction'; end if;
  if v_type in ('expense','supplier_payment','refund') and v_direction <> 'out' then raise exception 'This transaction type must be outgoing'; end if;

  select * into v_account from public.financial_accounts
  where id = p_account_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Financial account not found for this clinic'; end if;
  if not v_account.is_active then raise exception 'This account is inactive'; end if;

  if v_account.requires_session then
    if v_session_id is null then
      select id into v_session_id from public.cash_register_sessions
      where clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
      order by opened_at desc limit 1 for update;
    else
      perform 1 from public.cash_register_sessions
      where id = v_session_id and clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
      for update;
      if not found then raise exception 'Selected cash register session is not open'; end if;
    end if;
    if v_session_id is null then raise exception 'Open this cash register before posting a movement'; end if;
  elsif v_session_id is not null then
    perform 1 from public.cash_register_sessions
    where id = v_session_id and clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
    for update;
    if not found then raise exception 'Selected register session is invalid'; end if;
  end if;

  insert into public.financial_transactions
    (clinic_id, account_id, session_id, direction, transaction_type, amount, description,
     category, payment_method, reference, counterparty_name, idempotency_key, created_by)
  values
    (v_clinic_id, p_account_id, v_session_id, v_direction, v_type, p_amount, trim(p_description),
     nullif(trim(p_category), ''), nullif(trim(p_payment_method), ''), nullif(trim(p_reference), ''),
     nullif(trim(p_counterparty_name), ''), trim(p_idempotency_key), auth.uid())
  on conflict (clinic_id, idempotency_key) do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    select * into v_existing from public.financial_transactions
    where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
    if not found then raise exception 'Transaction retry could not be resolved'; end if;
    if v_existing.account_id <> p_account_id or v_existing.amount <> p_amount or v_existing.direction <> v_direction then
      raise exception 'Idempotency key was already used for a different transaction';
    end if;
    return v_existing.id;
  end if;

  return v_transaction_id;
end;
$$;

create or replace function public.vetra_transfer_between_accounts(
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_description text,
  p_reference text default null,
  p_source_session_id uuid default null,
  p_destination_session_id uuid default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_source public.financial_accounts%rowtype;
  v_destination public.financial_accounts%rowtype;
  v_source_session uuid := p_source_session_id;
  v_destination_session uuid := p_destination_session_id;
  v_group uuid := gen_random_uuid();
  v_out_id uuid;
  v_existing public.financial_transactions%rowtype;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_source_account_id = p_destination_account_id then raise exception 'Source and destination accounts must differ'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if nullif(trim(p_description), '') is null then raise exception 'Transfer description is required'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;

  select * into v_existing from public.financial_transactions
  where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.transaction_type <> 'transfer_out' or v_existing.amount <> p_amount then
      raise exception 'Idempotency key was already used for a different transaction';
    end if;
    return v_existing.id;
  end if;

  select * into v_source from public.financial_accounts
  where id = p_source_account_id and clinic_id = v_clinic_id for update;
  if not found or not v_source.is_active then raise exception 'Source account not found or inactive'; end if;
  select * into v_destination from public.financial_accounts
  where id = p_destination_account_id and clinic_id = v_clinic_id for update;
  if not found or not v_destination.is_active then raise exception 'Destination account not found or inactive'; end if;

  if v_source.requires_session then
    if v_source_session is null then
      select id into v_source_session from public.cash_register_sessions
      where clinic_id = v_clinic_id and account_id = p_source_account_id and status = 'open'
      order by opened_at desc limit 1 for update;
    else
      perform 1 from public.cash_register_sessions where id = v_source_session and clinic_id = v_clinic_id
        and account_id = p_source_account_id and status = 'open' for update;
      if not found then raise exception 'Source register session is not open'; end if;
    end if;
    if v_source_session is null then raise exception 'Open the source cash register before transferring'; end if;
  end if;

  if v_destination.requires_session then
    if v_destination_session is null then
      select id into v_destination_session from public.cash_register_sessions
      where clinic_id = v_clinic_id and account_id = p_destination_account_id and status = 'open'
      order by opened_at desc limit 1 for update;
    else
      perform 1 from public.cash_register_sessions where id = v_destination_session and clinic_id = v_clinic_id
        and account_id = p_destination_account_id and status = 'open' for update;
      if not found then raise exception 'Destination register session is not open'; end if;
    end if;
    if v_destination_session is null then raise exception 'Open the destination cash register before transferring'; end if;
  end if;

  insert into public.financial_transactions
    (clinic_id, account_id, session_id, direction, transaction_type, amount, description,
     category, reference, counterparty_name, transfer_group_id, idempotency_key, created_by)
  values
    (v_clinic_id, p_source_account_id, v_source_session, 'out', 'transfer_out', p_amount,
     trim(p_description), 'تحويل بين الحسابات', nullif(trim(p_reference), ''), v_destination.name,
     v_group, trim(p_idempotency_key), auth.uid())
  returning id into v_out_id;

  insert into public.financial_transactions
    (clinic_id, account_id, session_id, direction, transaction_type, amount, description,
     category, reference, counterparty_name, transfer_group_id, idempotency_key, created_by)
  values
    (v_clinic_id, p_destination_account_id, v_destination_session, 'in', 'transfer_in', p_amount,
     trim(p_description), 'تحويل بين الحسابات', nullif(trim(p_reference), ''), v_source.name,
     v_group, trim(p_idempotency_key) || ':in', auth.uid());

  return v_out_id;
end;
$$;

create or replace function public.vetra_record_invoice_payment(
  p_invoice_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null,
  p_notes text default null,
  p_session_id uuid default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_invoice public.invoices%rowtype;
  v_account public.financial_accounts%rowtype;
  v_session_id uuid := p_session_id;
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_payment_id uuid;
  v_existing public.financial_transactions%rowtype;
  v_new_paid numeric(14,2);
  v_new_status text;
  v_description text;
  v_client_name text;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;
  if v_method not in ('cash','card','wallet','bank_transfer','other') then raise exception 'Invalid payment method'; end if;

  select * into v_invoice from public.invoices
  where id = p_invoice_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Invoice not found for this clinic'; end if;
  if v_invoice.status in ('draft','cancelled','returned') then raise exception 'This invoice cannot receive a payment in its current status'; end if;

  select c.name into v_client_name
  from public.clients c
  where c.id = v_invoice.client_id and c.clinic_id = v_clinic_id;

  select * into v_existing from public.financial_transactions
  where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.transaction_type <> 'invoice_payment' or v_existing.related_invoice_id <> p_invoice_id or v_existing.amount <> p_amount then
      raise exception 'Idempotency key was already used for a different payment';
    end if;
    return v_existing.id;
  end if;

  select * into v_account from public.financial_accounts
  where id = p_account_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Financial account not found for this clinic'; end if;
  if not v_account.is_active then raise exception 'This account is inactive'; end if;
  if (v_method = 'cash' and v_account.account_type <> 'cash')
     or (v_method = 'card' and v_account.account_type <> 'card')
     or (v_method = 'wallet' and v_account.account_type <> 'wallet')
     or (v_method = 'bank_transfer' and v_account.account_type <> 'bank') then
    raise exception 'Selected account does not match the payment method';
  end if;

  if p_amount > greatest(coalesce(v_invoice.total,0) - coalesce(v_invoice.paid_amount,0),0) then
    raise exception 'Payment amount exceeds the remaining invoice balance';
  end if;

  if v_account.requires_session then
    if v_session_id is null then
      select id into v_session_id from public.cash_register_sessions
      where clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
      order by opened_at desc limit 1 for update;
    else
      perform 1 from public.cash_register_sessions
      where id = v_session_id and clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
      for update;
      if not found then raise exception 'Selected cash register session is not open'; end if;
    end if;
    if v_session_id is null then raise exception 'Open the selected cash register before collecting money'; end if;
  end if;

  v_description := 'تحصيل فاتورة رقم #' || v_invoice.invoice_number::text;
  if nullif(trim(p_notes), '') is not null then v_description := v_description || ' — ' || trim(p_notes); end if;

  insert into public.financial_transactions
    (clinic_id, account_id, session_id, direction, transaction_type, amount, description,
     payment_method, reference, counterparty_name, related_invoice_id, idempotency_key, created_by)
  values
    (v_clinic_id, p_account_id, v_session_id, 'in', 'invoice_payment', p_amount, v_description,
     v_method, nullif(trim(p_reference), ''), v_client_name, p_invoice_id, trim(p_idempotency_key), auth.uid())
  on conflict (clinic_id, idempotency_key) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    select * into v_existing from public.financial_transactions
    where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
    if not found or v_existing.transaction_type <> 'invoice_payment'
       or v_existing.related_invoice_id <> p_invoice_id or v_existing.amount <> p_amount then
      raise exception 'Duplicate payment retry could not be resolved';
    end if;
    return v_existing.id;
  end if;

  v_new_paid := coalesce(v_invoice.paid_amount,0) + p_amount;
  if v_invoice.status in ('partially_returned') then
    v_new_status := 'partially_returned';
  elsif v_new_paid >= coalesce(v_invoice.total,0) then
    v_new_status := 'paid';
  elsif v_new_paid > 0 then
    v_new_status := 'partially_paid';
  else
    v_new_status := 'unpaid';
  end if;

  update public.invoices
  set paid_amount = v_new_paid,
      payment_method = v_method,
      status = v_new_status,
      paid_at = case when v_new_paid >= coalesce(total,0) then coalesce(paid_at, now()) else paid_at end,
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_invoice_id and clinic_id = v_clinic_id;

  return v_payment_id;
end;
$$;

revoke all on function public.vetra_create_financial_account(text,text,numeric,text) from public;
revoke all on function public.vetra_open_cash_register(uuid,numeric,text) from public;
revoke all on function public.vetra_close_cash_register(uuid,numeric,text) from public;
revoke all on function public.vetra_post_financial_transaction(uuid,text,text,numeric,text,text,text,text,text,uuid,text) from public;
revoke all on function public.vetra_transfer_between_accounts(uuid,uuid,numeric,text,text,uuid,uuid,text) from public;
revoke all on function public.vetra_record_invoice_payment(uuid,uuid,numeric,text,text,text,uuid,text) from public;
grant execute on function public.vetra_create_financial_account(text,text,numeric,text) to authenticated;
grant execute on function public.vetra_open_cash_register(uuid,numeric,text) to authenticated;
grant execute on function public.vetra_close_cash_register(uuid,numeric,text) to authenticated;
grant execute on function public.vetra_post_financial_transaction(uuid,text,text,numeric,text,text,text,text,text,uuid,text) to authenticated;
grant execute on function public.vetra_transfer_between_accounts(uuid,uuid,numeric,text,text,uuid,uuid,text) to authenticated;
grant execute on function public.vetra_record_invoice_payment(uuid,uuid,numeric,text,text,text,uuid,text) to authenticated;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_auto_open_cash_register.sql

-- Automatically ensure a cash register session exists for issued sales and receipts.
-- Run on each Shared Clinic Database after the finance cash-register migration.

begin;

create or replace function public.vetra_ensure_cash_register_open(
  p_account_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_account public.financial_accounts%rowtype;
  v_expected numeric(14,2);
  v_session_id uuid;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;

  select * into v_account
  from public.financial_accounts
  where id = p_account_id and clinic_id = v_clinic_id
  for update;
  if not found then raise exception 'Financial account not found for this clinic'; end if;
  if not v_account.is_active then raise exception 'This account is inactive'; end if;
  if not v_account.requires_session or v_account.account_type <> 'cash' then
    raise exception 'This account does not use cash register sessions';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_clinic_id::text || ':' || p_account_id::text, 0));

  select id into v_session_id
  from public.cash_register_sessions
  where clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
  order by opened_at desc
  limit 1
  for update;
  if v_session_id is not null then return v_session_id; end if;

  select v_account.opening_balance + coalesce(sum(
    case when t.direction = 'in' then t.amount else -t.amount end
  ) filter (where t.status = 'posted'), 0)
  into v_expected
  from public.financial_transactions t
  where t.clinic_id = v_clinic_id and t.account_id = p_account_id;

  insert into public.cash_register_sessions
    (clinic_id, account_id, opening_expected_balance, opening_counted_balance,
     opening_difference, opened_by, opening_notes)
  values
    (v_clinic_id, p_account_id, coalesce(v_expected, v_account.opening_balance),
     coalesce(v_expected, v_account.opening_balance), 0, auth.uid(),
     'Automatically opened for a sales invoice or customer collection')
  returning id into v_session_id;

  return v_session_id;
end;
$$;

revoke all on function public.vetra_ensure_cash_register_open(uuid) from public;
grant execute on function public.vetra_ensure_cash_register_open(uuid) to authenticated;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_clinic_staff.sql

-- Clinic staff directory and links to VETRA Core login accounts. Passwords are never stored here.
-- Run on each clinic tenant database, not VETRA CORE.
begin;

create table if not exists public.clinic_staff (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  full_name text not null check (char_length(full_name) between 1 and 120),
  staff_type text not null check (staff_type in ('doctor', 'assistant', 'front_desk')),
  phone text,
  email text,
  specialty text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clinic_staff
  add column if not exists auth_user_id uuid,
  add column if not exists login_email text,
  add column if not exists must_change_password boolean not null default false;

create unique index if not exists clinic_staff_auth_user_id_idx
  on public.clinic_staff (auth_user_id) where auth_user_id is not null;

create index if not exists clinic_staff_clinic_created_idx
  on public.clinic_staff (clinic_id, created_at desc);

alter table public.clinic_staff enable row level security;
drop policy if exists vetra_clinic_staff_select on public.clinic_staff;
create policy vetra_clinic_staff_select on public.clinic_staff
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_staff_insert on public.clinic_staff;
create policy vetra_clinic_staff_insert on public.clinic_staff
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_staff_update on public.clinic_staff;
create policy vetra_clinic_staff_update on public.clinic_staff
  for update to authenticated using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_staff_delete on public.clinic_staff;
create policy vetra_clinic_staff_delete on public.clinic_staff
  for delete to authenticated using (clinic_id = public.vetra_current_clinic_id());

grant select, insert, delete on public.clinic_staff to authenticated;
revoke all on public.clinic_staff from anon, public;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_clinic_staff_permissions.sql

-- Per-staff permissions for the clinic tenant database.
begin;

alter table public.clinic_staff
  add column if not exists permissions jsonb not null default '{}'::jsonb;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_staff_permission_rls.sql

-- Enforce staff permissions for invoice records at the clinic database boundary.
-- Run on each clinic tenant database after vetra_clinic_staff_permissions.sql.
begin;

create or replace function public.vetra_has_clinic_staff_permission(
  p_permission text,
  p_action text
) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_permissions jsonb;
begin
  if v_clinic_id is null or auth.uid() is null then
    return false;
  end if;

  select permissions into v_permissions
  from public.clinic_staff
  where clinic_id = v_clinic_id and auth_user_id = auth.uid()
  limit 1;

  -- Clinic members without a staff-directory row are clinic owners/admins.
  if not found then
    return true;
  end if;

  return coalesce((v_permissions #>> array[p_permission, p_action])::boolean, false);
end;
$$;

revoke all on function public.vetra_has_clinic_staff_permission(text, text) from public, anon;
grant execute on function public.vetra_has_clinic_staff_permission(text, text) to authenticated;

-- Only the following checked routines may update clinic_staff after the raw UPDATE grant is revoked.
create or replace function public.vetra_update_clinic_staff_permissions(
  p_staff_id uuid,
  p_permissions jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_group record;
  v_action record;
  v_saved jsonb;
  v_allowed_groups text[] := array['patients','appointments','medical_records','vaccinations','invoices','finance_page','inventory','financial_sensitive_data','reports','messages','staff','clinic_settings'];
  v_allowed_actions text[] := array['view','create','edit','delete','export'];
begin
  if v_clinic_id is null or auth.uid() is null then
    raise exception 'No active VETRA clinic found in token';
  end if;
  if p_staff_id is null or jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'Invalid staff permissions payload';
  end if;
  if not public.vetra_has_clinic_staff_permission('staff', 'view')
     or not public.vetra_has_clinic_staff_permission('staff', 'edit') then
    raise exception 'Staff edit permission is required';
  end if;

  for v_group in select key, value from jsonb_each(p_permissions)
  loop
    if not (v_group.key = any(v_allowed_groups)) or jsonb_typeof(v_group.value) <> 'object' then
      raise exception 'Invalid staff permission group';
    end if;
    for v_action in select key, value from jsonb_each(v_group.value)
    loop
      if not (v_action.key = any(v_allowed_actions)) or jsonb_typeof(v_action.value) <> 'boolean' then
        raise exception 'Invalid staff permission action';
      end if;
      if v_action.value = 'true'::jsonb
         and not public.vetra_has_clinic_staff_permission(v_group.key, v_action.key) then
        raise exception 'Cannot grant a permission the current user does not have';
      end if;
    end loop;
  end loop;

  update public.clinic_staff
  set permissions = p_permissions, updated_at = now()
  where id = p_staff_id and clinic_id = v_clinic_id
  returning permissions into v_saved;
  if not found then raise exception 'Staff member not found in this clinic'; end if;
  return v_saved;
end;
$$;

create or replace function public.vetra_link_clinic_staff_account(
  p_staff_id uuid,
  p_auth_user_id uuid,
  p_login_email text,
  p_must_change_password boolean
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_existing_auth_user_id uuid;
begin
  if v_clinic_id is null or auth.uid() is null then
    raise exception 'No active VETRA clinic found in token';
  end if;
  if p_staff_id is null or p_auth_user_id is null or nullif(trim(p_login_email), '') is null then
    raise exception 'Invalid staff account link';
  end if;

  select auth_user_id into v_existing_auth_user_id
  from public.clinic_staff
  where id = p_staff_id and clinic_id = v_clinic_id
  for update;
  if not found then raise exception 'Staff member not found in this clinic'; end if;

  if v_existing_auth_user_id is null then
    if not public.vetra_has_clinic_staff_permission('staff', 'view')
       or not public.vetra_has_clinic_staff_permission('staff', 'create') then
      raise exception 'Staff create permission is required';
    end if;
  else
    if p_auth_user_id <> v_existing_auth_user_id then
      raise exception 'An existing staff login cannot be relinked';
    end if;
    if not public.vetra_has_clinic_staff_permission('staff', 'view')
       or not public.vetra_has_clinic_staff_permission('staff', 'edit') then
      raise exception 'Staff edit permission is required';
    end if;
  end if;

  update public.clinic_staff
  set auth_user_id = p_auth_user_id,
      login_email = trim(p_login_email),
      must_change_password = coalesce(p_must_change_password, true),
      updated_at = now()
  where id = p_staff_id and clinic_id = v_clinic_id;
end;
$$;

create or replace function public.vetra_mark_clinic_staff_password_changed()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
begin
  if v_clinic_id is null or auth.uid() is null then
    raise exception 'No active VETRA clinic found in token';
  end if;
  update public.clinic_staff
  set must_change_password = false, updated_at = now()
  where clinic_id = v_clinic_id and auth_user_id = auth.uid();
end;
$$;

revoke all on function public.vetra_update_clinic_staff_permissions(uuid, jsonb) from public, anon;
revoke all on function public.vetra_link_clinic_staff_account(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.vetra_mark_clinic_staff_password_changed() from public, anon;
grant execute on function public.vetra_update_clinic_staff_permissions(uuid, jsonb) to authenticated;
grant execute on function public.vetra_link_clinic_staff_account(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.vetra_mark_clinic_staff_password_changed() to authenticated;
revoke update on public.clinic_staff from authenticated;

alter table public.invoices enable row level security;
drop policy if exists vetra_staff_invoices_select_guard on public.invoices;
create policy vetra_staff_invoices_select_guard on public.invoices
  as restrictive for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'view')
        or public.vetra_has_clinic_staff_permission('finance_page', 'view')
        or public.vetra_has_clinic_staff_permission('invoices', 'create')
    )
  );
drop policy if exists vetra_staff_invoices_select on public.invoices;
create policy vetra_staff_invoices_select on public.invoices
  for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'view')
  );
drop policy if exists vetra_staff_invoices_insert_guard on public.invoices;
create policy vetra_staff_invoices_insert_guard on public.invoices
  as restrictive for insert to authenticated
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'create')
  );
drop policy if exists vetra_staff_invoices_insert on public.invoices;
create policy vetra_staff_invoices_insert on public.invoices
  for insert to authenticated
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'create')
  );
drop policy if exists vetra_staff_invoices_update_guard on public.invoices;
create policy vetra_staff_invoices_update_guard on public.invoices
  as restrictive for update to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  )
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  );
drop policy if exists vetra_staff_invoices_update on public.invoices;
create policy vetra_staff_invoices_update on public.invoices
  for update to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  )
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  );
drop policy if exists vetra_staff_invoices_delete_guard on public.invoices;
create policy vetra_staff_invoices_delete_guard on public.invoices
  as restrictive for delete to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'delete')
  );
drop policy if exists vetra_staff_invoices_delete on public.invoices;
create policy vetra_staff_invoices_delete on public.invoices
  for delete to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'delete')
  );

alter table public.invoice_items enable row level security;
drop policy if exists vetra_staff_invoice_items_select_guard on public.invoice_items;
create policy vetra_staff_invoice_items_select_guard on public.invoice_items
  as restrictive for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'view')
        or public.vetra_has_clinic_staff_permission('finance_page', 'view')
        or public.vetra_has_clinic_staff_permission('invoices', 'create')
    )
  );
drop policy if exists vetra_staff_invoice_items_select on public.invoice_items;
create policy vetra_staff_invoice_items_select on public.invoice_items
  for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_staff_invoice_items_insert_guard on public.invoice_items;
create policy vetra_staff_invoice_items_insert_guard on public.invoice_items
  as restrictive for insert to authenticated
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'create')
  );
drop policy if exists vetra_staff_invoice_items_insert on public.invoice_items;
create policy vetra_staff_invoice_items_insert on public.invoice_items
  for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_staff_invoice_items_update_guard on public.invoice_items;
create policy vetra_staff_invoice_items_update_guard on public.invoice_items
  as restrictive for update to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  )
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  );
drop policy if exists vetra_staff_invoice_items_update on public.invoice_items;
create policy vetra_staff_invoice_items_update on public.invoice_items
  for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_staff_invoice_items_delete_guard on public.invoice_items;
create policy vetra_staff_invoice_items_delete_guard on public.invoice_items
  as restrictive for delete to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'delete')
  );
drop policy if exists vetra_staff_invoice_items_delete on public.invoice_items;
create policy vetra_staff_invoice_items_delete on public.invoice_items
  for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id());

grant select, insert, update, delete on public.invoices, public.invoice_items to authenticated;
revoke all on public.invoices, public.invoice_items from anon, public;

-- The existing issue_invoice function contains an admin-only guard. Replace only
-- that guard with the saved invoice-create permission while preserving the
-- function's existing issuance and inventory logic.
do $$
declare
  v_function record;
  v_definition text;
  v_replacement text := 'if not public.vetra_has_clinic_staff_permission(''invoices'', ''create'') then raise exception ''Invoice creation permission is required''; end if;';
  v_updated integer := 0;
begin
  for v_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'issue_invoice'
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if v_definition ~* 'raise[[:space:]]+exception[[:space:]]+''Only admins can issue invoices''[[:space:]]*;' then
      v_definition := regexp_replace(
        v_definition,
        'raise[[:space:]]+exception[[:space:]]+''Only admins can issue invoices''[[:space:]]*;',
        v_replacement,
        'gi'
      );
      execute v_definition;
      v_updated := v_updated + 1;
    end if;
  end loop;

  if v_updated = 0 then
    raise exception 'Could not find the expected admin-only guard in public.issue_invoice. No invoice function was changed.';
  end if;
end;
$$;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_inventory_purchases.sql

-- VETRA inventory purchases
-- Run on each shared clinic database after the finance and inventory tables exist.

begin;

create table if not exists public.inventory_suppliers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (clinic_id, name)
);

create table if not exists public.inventory_purchases (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  supplier_id uuid not null references public.inventory_suppliers(id) on delete restrict,
  supplier_name text not null,
  account_id uuid references public.financial_accounts(id) on delete restrict,
  payment_type text not null default 'cash' check (payment_type in ('cash', 'credit')),
  financial_transaction_id uuid references public.financial_transactions(id) on delete restrict,
  total_amount numeric(14,2) not null check (total_amount > 0),
  invoice_reference text,
  notes text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (clinic_id, idempotency_key)
);

-- Upgrade existing clinic databases as well as fresh installations.
alter table public.inventory_purchases alter column account_id drop not null;
alter table public.inventory_purchases add column if not exists payment_type text not null default 'cash';
alter table public.inventory_purchases drop constraint if exists inventory_purchases_payment_type_check;
alter table public.inventory_purchases add constraint inventory_purchases_payment_type_check
  check (payment_type in ('cash', 'credit'));
alter table public.inventory_purchases drop constraint if exists inventory_purchases_payment_account_check;
alter table public.inventory_purchases add constraint inventory_purchases_payment_account_check
  check ((payment_type = 'cash' and account_id is not null) or
         (payment_type = 'credit' and account_id is null and financial_transaction_id is null));

create table if not exists public.inventory_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.inventory_purchases(id) on delete cascade,
  clinic_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists inventory_purchases_clinic_created_idx
  on public.inventory_purchases (clinic_id, created_at desc);
create index if not exists inventory_purchase_items_purchase_idx
  on public.inventory_purchase_items (purchase_id);

alter table public.inventory_suppliers enable row level security;
alter table public.inventory_purchases enable row level security;
alter table public.inventory_purchase_items enable row level security;

drop policy if exists vetra_inventory_suppliers_select on public.inventory_suppliers;
create policy vetra_inventory_suppliers_select on public.inventory_suppliers
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());

drop policy if exists vetra_inventory_purchases_select on public.inventory_purchases;
create policy vetra_inventory_purchases_select on public.inventory_purchases
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());

drop policy if exists vetra_inventory_purchase_items_select on public.inventory_purchase_items;
create policy vetra_inventory_purchase_items_select on public.inventory_purchase_items
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());

grant select on public.inventory_suppliers to authenticated;
grant select on public.inventory_purchases to authenticated;
grant select on public.inventory_purchase_items to authenticated;

create or replace function public.vetra_create_inventory_supplier(
  p_name text,
  p_phone text default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_id uuid;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if not public.vetra_has_clinic_staff_permission('inventory', 'create') then raise exception 'Inventory creation permission is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Supplier name is required'; end if;

  insert into public.inventory_suppliers (clinic_id, name, phone, notes, created_by)
  values (v_clinic_id, trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_notes), ''), auth.uid())
  on conflict (clinic_id, name) do update set
    phone = coalesce(excluded.phone, inventory_suppliers.phone),
    notes = coalesce(excluded.notes, inventory_suppliers.notes),
    is_active = true
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.vetra_create_inventory_supplier(text, text, text) from public;
grant execute on function public.vetra_create_inventory_supplier(text, text, text) to authenticated;

-- Remove the old overload so PostgREST resolves both old cash callers and new
-- callers to this function. The new trailing argument defaults to cash.
drop function if exists public.vetra_create_inventory_purchase(text, uuid, jsonb, text, text, text);
create or replace function public.vetra_create_inventory_purchase(
  p_supplier_name text,
  p_account_id uuid,
  p_items jsonb,
  p_invoice_reference text default null,
  p_notes text default null,
  p_idempotency_key text default null,
  p_payment_type text default 'cash'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_supplier_id uuid;
  v_purchase_id uuid;
  v_financial_transaction_id uuid;
  v_total numeric(14,2) := 0;
  v_item record;
  v_product public.products%rowtype;
  v_existing public.inventory_purchases%rowtype;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if not public.vetra_has_clinic_staff_permission('inventory', 'create') or not public.vetra_has_clinic_staff_permission('payments', 'create') then raise exception 'Inventory and payment creation permissions are required'; end if;
  if not public.vetra_has_clinic_staff_permission('finance_page', 'view') then raise exception 'Finance access permission is required'; end if;
  if p_payment_type is null or p_payment_type not in ('cash', 'credit') then raise exception 'Payment type must be cash or credit'; end if;
  if p_payment_type = 'cash' and p_account_id is null then raise exception 'A vault is required for a cash purchase'; end if;
  if p_payment_type = 'credit' and p_account_id is not null then raise exception 'Credit purchases must not debit a vault'; end if;
  if nullif(trim(p_supplier_name), '') is null then raise exception 'Supplier name is required'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Purchase idempotency key is required'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'Purchase items must be an array'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'Add at least one purchased item'; end if;

  select * into v_existing
  from public.inventory_purchases
  where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
  if found then return v_existing.id; end if;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, unit_cost numeric)
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Every purchase line needs a product and a positive quantity';
    end if;
    if v_item.unit_cost is null or v_item.unit_cost < 0 then
      raise exception 'Every purchase line needs a valid unit cost';
    end if;

    select * into v_product
    from public.products
    where id = v_item.product_id and clinic_id = v_clinic_id and is_active = true
    for update;
    if not found then raise exception 'One of the selected products was not found or is inactive'; end if;

    v_total := v_total + round(v_item.quantity * v_item.unit_cost, 2);
  end loop;

  if v_total <= 0 then raise exception 'Purchase total must be greater than zero'; end if;

  insert into public.inventory_suppliers (clinic_id, name, created_by)
  values (v_clinic_id, trim(p_supplier_name), auth.uid())
  on conflict (clinic_id, name) do update set is_active = true
  returning id into v_supplier_id;

  insert into public.inventory_purchases
    (clinic_id, supplier_id, supplier_name, account_id, payment_type, total_amount, invoice_reference, notes, idempotency_key, created_by)
  values
    (v_clinic_id, v_supplier_id, trim(p_supplier_name), p_account_id, p_payment_type, v_total,
     nullif(trim(p_invoice_reference), ''), nullif(trim(p_notes), ''), trim(p_idempotency_key), auth.uid())
  returning id into v_purchase_id;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, unit_cost numeric)
  loop
    update public.products
    set quantity = coalesce(quantity, 0) + v_item.quantity,
        wholesale_price = v_item.unit_cost,
        last_purchase_price = v_item.unit_cost
    where id = v_item.product_id and clinic_id = v_clinic_id;

    insert into public.inventory_purchase_items
      (purchase_id, clinic_id, product_id, quantity, unit_cost, line_total)
    values
      (v_purchase_id, v_clinic_id, v_item.product_id, v_item.quantity, v_item.unit_cost,
       round(v_item.quantity * v_item.unit_cost, 2));

    insert into public.inventory_movements
      (clinic_id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
    values
      (v_clinic_id, v_item.product_id, 'purchase', v_item.quantity, 'inventory_purchase', v_purchase_id,
       'Inventory purchase from ' || trim(p_supplier_name), auth.uid());
  end loop;

  if p_payment_type = 'cash' then
    v_financial_transaction_id := public.vetra_post_financial_transaction(
      p_account_id,
      'out',
      'supplier_payment',
      v_total,
      'Inventory purchase from ' || trim(p_supplier_name),
      'inventory_purchase',
      'cash',
      v_purchase_id::text,
      trim(p_supplier_name),
      null,
      trim(p_idempotency_key) || ':payment'
    );

    update public.inventory_purchases
    set financial_transaction_id = v_financial_transaction_id
    where id = v_purchase_id and clinic_id = v_clinic_id;
  end if;

  return v_purchase_id;
end;
$$;

revoke all on function public.vetra_create_inventory_purchase(text, uuid, jsonb, text, text, text, text) from public;
grant execute on function public.vetra_create_inventory_purchase(text, uuid, jsonb, text, text, text, text) to authenticated;

create or replace function public.vetra_update_inventory_purchase(
  p_purchase_id uuid,
  p_supplier_name text,
  p_account_id uuid,
  p_items jsonb,
  p_invoice_reference text default null,
  p_notes text default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_purchase public.inventory_purchases%rowtype;
  v_account public.financial_accounts%rowtype;
  v_supplier_id uuid;
  v_total numeric(14,2) := 0;
  v_item record;
  v_financial_transaction_id uuid;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if not public.vetra_has_clinic_staff_permission('inventory', 'edit') or not public.vetra_has_clinic_staff_permission('payments', 'edit') then raise exception 'Inventory and payment edit permissions are required'; end if;
  if not public.vetra_has_clinic_staff_permission('finance_page', 'view') then raise exception 'Finance access permission is required'; end if;
  if p_purchase_id is null then raise exception 'Purchase invoice is required'; end if;
  if nullif(trim(p_supplier_name), '') is null then raise exception 'Supplier name is required'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Edit idempotency key is required'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one purchased item';
  end if;

  select * into v_purchase
  from public.inventory_purchases
  where id = p_purchase_id and clinic_id = v_clinic_id
  for update;
  if not found then raise exception 'Purchase invoice not found'; end if;

  -- Editing preserves the invoice's payment type. A credit edit only adjusts
  -- inventory and the supplier invoice amount; it must never post a payment.
  if v_purchase.payment_type = 'cash' then
    select * into v_account
    from public.financial_accounts
    where id = p_account_id and clinic_id = v_clinic_id and is_active = true
    for update;
    if not found then raise exception 'Financial account not found or inactive'; end if;
  elsif p_account_id is not null then
    raise exception 'Credit purchases must not debit a vault';
  end if;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, unit_cost numeric)
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Every purchase line needs a product and a positive quantity';
    end if;
    if v_item.unit_cost is null or v_item.unit_cost < 0 then
      raise exception 'Every purchase line needs a valid unit cost';
    end if;
    perform 1 from public.products
    where id = v_item.product_id and clinic_id = v_clinic_id and is_active = true
    for update;
    if not found then raise exception 'One of the selected products was not found or is inactive'; end if;
    v_total := v_total + round(v_item.quantity * v_item.unit_cost, 2);
  end loop;
  if v_total <= 0 then raise exception 'Purchase total must be greater than zero'; end if;

  insert into public.inventory_suppliers (clinic_id, name, created_by)
  values (v_clinic_id, trim(p_supplier_name), auth.uid())
  on conflict (clinic_id, name) do update set is_active = true
  returning id into v_supplier_id;

  for v_item in
    select product_id, sum(old_quantity) as old_quantity, sum(new_quantity) as new_quantity
    from (
      select product_id, quantity as old_quantity, 0::numeric as new_quantity
      from public.inventory_purchase_items
      where purchase_id = p_purchase_id and clinic_id = v_clinic_id
      union all
      select x.product_id, 0::numeric, x.quantity
      from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, unit_cost numeric)
    ) as deltas
    group by product_id
    order by product_id
  loop
    update public.products
    set quantity = coalesce(quantity, 0) + coalesce(v_item.new_quantity, 0) - coalesce(v_item.old_quantity, 0)
    where id = v_item.product_id and clinic_id = v_clinic_id
      and coalesce(quantity, 0) + coalesce(v_item.new_quantity, 0) - coalesce(v_item.old_quantity, 0) >= 0;
    if not found then
      raise exception 'This invoice cannot be edited because the change would make product stock negative';
    end if;
    if coalesce(v_item.new_quantity, 0) <> coalesce(v_item.old_quantity, 0) then
      insert into public.inventory_movements
        (clinic_id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
      values
        (v_clinic_id, v_item.product_id, 'adjustment', coalesce(v_item.new_quantity, 0) - coalesce(v_item.old_quantity, 0), 'inventory_purchase_edit', p_purchase_id,
         'Stock difference from purchase invoice edit', auth.uid());
    end if;
  end loop;

  delete from public.inventory_purchase_items
  where purchase_id = p_purchase_id and clinic_id = v_clinic_id;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, unit_cost numeric)
  loop
    update public.products
    set wholesale_price = v_item.unit_cost,
        last_purchase_price = v_item.unit_cost
    where id = v_item.product_id and clinic_id = v_clinic_id and is_active = true;

    insert into public.inventory_purchase_items
      (purchase_id, clinic_id, product_id, quantity, unit_cost, line_total)
    values
      (p_purchase_id, v_clinic_id, v_item.product_id, v_item.quantity, v_item.unit_cost,
       round(v_item.quantity * v_item.unit_cost, 2));

  end loop;

  if v_purchase.payment_type = 'cash' then
    if v_purchase.account_id = p_account_id then
      if v_total > v_purchase.total_amount then
        v_financial_transaction_id := public.vetra_post_financial_transaction(
          p_account_id, 'out', 'adjustment', v_total - v_purchase.total_amount,
          'Purchase invoice edit: additional payment', 'inventory_purchase_edit', 'cash', p_purchase_id::text,
          trim(p_supplier_name), null, trim(p_idempotency_key) || ':additional');
      elsif v_total < v_purchase.total_amount then
        v_financial_transaction_id := public.vetra_post_financial_transaction(
          p_account_id, 'in', 'adjustment', v_purchase.total_amount - v_total,
          'Purchase invoice edit: refund difference', 'inventory_purchase_edit', 'cash', p_purchase_id::text,
          trim(p_supplier_name), null, trim(p_idempotency_key) || ':refund');
      end if;
    else
      v_financial_transaction_id := public.vetra_post_financial_transaction(
        v_purchase.account_id, 'in', 'adjustment', v_purchase.total_amount,
        'Purchase invoice edit: return previous payment', 'inventory_purchase_edit', 'cash', p_purchase_id::text,
        v_purchase.supplier_name, null, trim(p_idempotency_key) || ':old-account');
      v_financial_transaction_id := public.vetra_post_financial_transaction(
        p_account_id, 'out', 'adjustment', v_total,
        'Purchase invoice edit: replacement payment', 'inventory_purchase_edit', 'cash', p_purchase_id::text,
        trim(p_supplier_name), null, trim(p_idempotency_key) || ':new-account');
    end if;

  end if;

  update public.inventory_purchases
  set supplier_id = v_supplier_id,
      supplier_name = trim(p_supplier_name),
      account_id = p_account_id,
      total_amount = v_total,
      invoice_reference = nullif(trim(p_invoice_reference), ''),
      notes = nullif(trim(p_notes), '')
  where id = p_purchase_id and clinic_id = v_clinic_id;

  return p_purchase_id;
end;
$$;

revoke all on function public.vetra_update_inventory_purchase(uuid, text, uuid, jsonb, text, text, text) from public;
grant execute on function public.vetra_update_inventory_purchase(uuid, text, uuid, jsonb, text, text, text) to authenticated;

-- Refresh the RPC schema cache after upgrading the signature.
notify pgrst, 'reload schema';
commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_client_credits.sql

-- VETRA client due balances and overpayment credits.
-- Run on every Shared Clinic Database after the finance cash-register SQL.

begin;

create table if not exists public.client_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric(14,2) not null check (amount > 0),
  description text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint client_credit_ledger_description_present
    check (description is null or length(trim(description)) > 0)
);

create index if not exists client_credit_ledger_client_idx
  on public.client_credit_ledger (clinic_id, client_id, created_at desc);

-- Keep this index non-partial so ON CONFLICT can infer it inside the RPC.
-- PostgreSQL permits multiple NULL values in a regular unique index.
drop index if exists public.client_credit_ledger_idempotency_idx;
create unique index client_credit_ledger_idempotency_idx
  on public.client_credit_ledger (clinic_id, idempotency_key);

alter table public.client_credit_ledger enable row level security;
drop policy if exists vetra_client_credit_ledger_select on public.client_credit_ledger;
create policy vetra_client_credit_ledger_select on public.client_credit_ledger
  for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id());
grant select on public.client_credit_ledger to authenticated;
revoke all on public.client_credit_ledger from anon, public;

create or replace function public.vetra_record_invoice_payment(
  p_invoice_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null,
  p_notes text default null,
  p_session_id uuid default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_invoice public.invoices%rowtype;
  v_account public.financial_accounts%rowtype;
  v_session_id uuid := p_session_id;
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_payment_id uuid;
  v_existing public.financial_transactions%rowtype;
  v_invoice_due numeric(14,2);
  v_credit_amount numeric(14,2);
  v_new_paid numeric(14,2);
  v_new_status text;
  v_description text;
  v_client_name text;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;
  if v_method not in ('cash','card','wallet','bank_transfer','other') then raise exception 'Invalid payment method'; end if;

  select * into v_invoice from public.invoices
  where id = p_invoice_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Invoice not found for this clinic'; end if;
  if v_invoice.status in ('draft','cancelled','returned') then raise exception 'This invoice cannot receive a payment in its current status'; end if;

  select c.name into v_client_name from public.clients c
  where c.id = v_invoice.client_id and c.clinic_id = v_clinic_id;

  select * into v_existing from public.financial_transactions
  where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.transaction_type <> 'invoice_payment'
       or v_existing.related_invoice_id <> p_invoice_id
       or v_existing.amount <> p_amount then
      raise exception 'Idempotency key was already used for a different payment';
    end if;
    return v_existing.id;
  end if;

  select * into v_account from public.financial_accounts
  where id = p_account_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Financial account not found for this clinic'; end if;
  if not v_account.is_active then raise exception 'This account is inactive'; end if;
  if (v_method = 'cash' and v_account.account_type <> 'cash')
     or (v_method = 'card' and v_account.account_type <> 'card')
     or (v_method = 'wallet' and v_account.account_type <> 'wallet')
     or (v_method = 'bank_transfer' and v_account.account_type <> 'bank') then
    raise exception 'Selected account does not match the payment method';
  end if;

  if v_account.requires_session then
    if v_session_id is null then
      select id into v_session_id from public.cash_register_sessions
      where clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
      order by opened_at desc limit 1 for update;
    else
      perform 1 from public.cash_register_sessions
      where id = v_session_id and clinic_id = v_clinic_id
        and account_id = p_account_id and status = 'open' for update;
      if not found then raise exception 'Selected cash register session is not open'; end if;
    end if;
    if v_session_id is null then raise exception 'Open the selected cash register before collecting money'; end if;
  end if;

  v_invoice_due := greatest(coalesce(v_invoice.total, 0) - coalesce(v_invoice.paid_amount, 0), 0);
  v_credit_amount := greatest(p_amount - v_invoice_due, 0);
  v_description := 'تحصيل فاتورة رقم #' || v_invoice.invoice_number::text;
  if nullif(trim(p_notes), '') is not null then v_description := v_description || ' — ' || trim(p_notes); end if;

  insert into public.financial_transactions
    (clinic_id, account_id, session_id, direction, transaction_type, amount,
     description, payment_method, reference, counterparty_name,
     related_invoice_id, idempotency_key, created_by)
  values
    (v_clinic_id, p_account_id, v_session_id, 'in', 'invoice_payment', p_amount,
     v_description, v_method, nullif(trim(p_reference), ''), v_client_name,
     p_invoice_id, trim(p_idempotency_key), auth.uid())
  on conflict (clinic_id, idempotency_key) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    select * into v_existing from public.financial_transactions
    where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
    if not found or v_existing.transaction_type <> 'invoice_payment'
       or v_existing.related_invoice_id <> p_invoice_id or v_existing.amount <> p_amount then
      raise exception 'Duplicate payment retry could not be resolved';
    end if;
    return v_existing.id;
  end if;

  v_new_paid := least(coalesce(v_invoice.total, 0), coalesce(v_invoice.paid_amount, 0) + p_amount);
  if v_invoice.status in ('partially_returned') then
    v_new_status := 'partially_returned';
  elsif v_new_paid >= coalesce(v_invoice.total, 0) then
    v_new_status := 'paid';
  elsif v_new_paid > 0 then
    v_new_status := 'partially_paid';
  else
    v_new_status := 'unpaid';
  end if;

  update public.invoices
  set paid_amount = v_new_paid,
      payment_method = v_method,
      status = v_new_status,
      paid_at = case when v_new_paid >= coalesce(total, 0) then coalesce(paid_at, now()) else paid_at end,
      updated_at = now(), updated_by = auth.uid()
  where id = p_invoice_id and clinic_id = v_clinic_id;

  if v_credit_amount > 0 and v_invoice.client_id is not null then
    insert into public.client_credit_ledger
      (clinic_id, client_id, invoice_id, direction, amount, description, idempotency_key, created_by)
    values
      (v_clinic_id, v_invoice.client_id, p_invoice_id, 'credit', v_credit_amount,
       'رصيد زائد من تحصيل الفاتورة #' || v_invoice.invoice_number::text,
       trim(p_idempotency_key) || ':credit', auth.uid())
    on conflict (clinic_id, idempotency_key) do nothing;
  end if;
  return v_payment_id;
end;
$$;

create or replace function public.vetra_get_owner_financial_summary(p_client_id uuid)
returns table (due_amount numeric, credit_amount numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_code text := nullif(trim(v_headers ->> 'x-vetra-client-code'), '');
  v_phone text := nullif(trim(v_headers ->> 'x-vetra-client-phone'), '');
  v_client_id uuid;
  v_clinic_id uuid;
begin
  if v_code is null or v_phone is null then raise exception 'Pet owner session could not be verified'; end if;
  select c.id, c.clinic_id into v_client_id, v_clinic_id
  from public.clients c
  where c.id = p_client_id and c.client_code = v_code
    and regexp_replace(coalesce(c.phone, ''), '\s+', '', 'g') = regexp_replace(v_phone, '\s+', '', 'g');
  if v_client_id is null then raise exception 'Pet owner session could not be verified'; end if;

  return query select
    coalesce((select sum(greatest(coalesce(i.total, 0) - coalesce(i.paid_amount, 0), 0))
      from public.invoices i where i.clinic_id = v_clinic_id and i.client_id = v_client_id
        and i.status not in ('draft', 'cancelled', 'returned')), 0)::numeric(14,2),
    greatest(coalesce((select sum(case when l.direction = 'credit' then l.amount else -l.amount end)
      from public.client_credit_ledger l where l.clinic_id = v_clinic_id and l.client_id = v_client_id), 0), 0)::numeric(14,2);
end;
$$;

revoke all on function public.vetra_get_owner_financial_summary(uuid) from public;
grant execute on function public.vetra_get_owner_financial_summary(uuid) to anon, authenticated;
revoke all on function public.vetra_record_invoice_payment(uuid,uuid,numeric,text,text,text,uuid,text) from public;
grant execute on function public.vetra_record_invoice_payment(uuid,uuid,numeric,text,text,text,uuid,text) to authenticated;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_staff_permission_policies.sql

-- Additive permission gates for staff, inventory, and financial reads.
-- Apply after finance SQL, vetra_auto_open_cash_register.sql, vetra_clinic_staff.sql,
-- vetra_clinic_staff_permissions.sql, vetra_inventory_purchases.sql, and updated vetra_staff_permission_rls.sql.
begin;

do $$
declare
  v_required record;
begin
  if to_regprocedure('public.vetra_has_clinic_staff_permission(text,text)') is null then
    raise exception 'Apply vetra_staff_permission_rls.sql first; permission helper is missing.';
  end if;
  if to_regprocedure('public.vetra_update_clinic_staff_permissions(uuid,jsonb)') is null
     or to_regprocedure('public.vetra_link_clinic_staff_account(uuid,uuid,text,boolean)') is null
     or to_regprocedure('public.vetra_mark_clinic_staff_password_changed()') is null then
    raise exception 'Apply the updated vetra_staff_permission_rls.sql first; checked clinic_staff update routines are missing.';
  end if;

  -- Do not enable RLS on product tables unless their old tenant policies exist.
  -- If this check fails, no policy changes are committed; add/verify base policies first.
  for v_required in
    select * from (values
      ('products', 'SELECT'), ('products', 'INSERT'), ('products', 'UPDATE'),
      ('clients', 'SELECT'), ('clients', 'INSERT'), ('clients', 'UPDATE'), ('clients', 'DELETE'),
      ('pets', 'SELECT'), ('pets', 'INSERT'), ('pets', 'UPDATE'), ('pets', 'DELETE'),
      ('product_categories', 'SELECT'), ('product_categories', 'INSERT'),
      ('product_categories', 'UPDATE'), ('product_categories', 'DELETE'),
      ('inventory_suppliers', 'SELECT'), ('inventory_purchases', 'SELECT'),
      ('inventory_purchase_items', 'SELECT'), ('financial_accounts', 'SELECT'),
      ('cash_register_sessions', 'SELECT'), ('financial_transactions', 'SELECT')
    ) as required_policy(table_name, command_name)
  loop
    if not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_required.table_name
        and p.permissive = 'PERMISSIVE'
        and (p.cmd = v_required.command_name or p.cmd = 'ALL')
    ) then
      raise exception 'Missing existing permissive tenant policy for %.%. No permission policies were applied.', v_required.command_name, v_required.table_name;
    end if;
  end loop;
end;
$$;

alter table public.clinic_staff enable row level security;
alter table public.clients enable row level security;
alter table public.pets enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.inventory_suppliers enable row level security;
alter table public.inventory_purchases enable row level security;
alter table public.inventory_purchase_items enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.cash_register_sessions enable row level security;
alter table public.financial_transactions enable row level security;

-- clinic_staff: users can read their own permission row; listing and mutations require view plus the requested action.
drop policy if exists vetra_staff_directory_select_guard on public.clinic_staff;
create policy vetra_staff_directory_select_guard on public.clinic_staff
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (auth_user_id = auth.uid() or public.vetra_has_clinic_staff_permission('staff', 'view')));
drop policy if exists vetra_staff_directory_insert_guard on public.clinic_staff;
create policy vetra_staff_directory_insert_guard on public.clinic_staff
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'create'));
drop policy if exists vetra_staff_directory_update_guard on public.clinic_staff;
create policy vetra_staff_directory_update_guard on public.clinic_staff
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'edit'));
drop policy if exists vetra_staff_directory_delete_guard on public.clinic_staff;
create policy vetra_staff_directory_delete_guard on public.clinic_staff
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'delete'));

-- Patient records keep their existing permissive clinic-isolation policies.
-- These restrictive policies add per-action permissions without replacing those policies.
drop policy if exists vetra_staff_clients_select_guard on public.clients;
create policy vetra_staff_clients_select_guard on public.clients
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('patients', 'view')
      or public.vetra_has_clinic_staff_permission('appointments', 'view')
      or public.vetra_has_clinic_staff_permission('appointments', 'create')
      or public.vetra_has_clinic_staff_permission('medical_records', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'view')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'create')
      or public.vetra_has_clinic_staff_permission('invoices', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')
      or public.vetra_has_clinic_staff_permission('reports', 'view')
      or public.vetra_has_clinic_staff_permission('messages', 'view')
      or public.vetra_has_clinic_staff_permission('messages', 'create')
    ));
drop policy if exists vetra_staff_clients_insert_guard on public.clients;
create policy vetra_staff_clients_insert_guard on public.clients
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('patients', 'create'));
drop policy if exists vetra_staff_clients_update_guard on public.clients;
create policy vetra_staff_clients_update_guard on public.clients
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('patients', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('patients', 'edit'));
drop policy if exists vetra_staff_clients_delete_guard on public.clients;
create policy vetra_staff_clients_delete_guard on public.clients
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('patients', 'delete'));

drop policy if exists vetra_staff_pets_select_guard on public.pets;
create policy vetra_staff_pets_select_guard on public.pets
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('patients', 'view')
      or public.vetra_has_clinic_staff_permission('appointments', 'view')
      or public.vetra_has_clinic_staff_permission('appointments', 'create')
      or public.vetra_has_clinic_staff_permission('medical_records', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'view')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'create')
      or public.vetra_has_clinic_staff_permission('invoices', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')
      or public.vetra_has_clinic_staff_permission('reports', 'view')
      or public.vetra_has_clinic_staff_permission('messages', 'view')
      or public.vetra_has_clinic_staff_permission('messages', 'create')
    ));
drop policy if exists vetra_staff_pets_insert_guard on public.pets;
create policy vetra_staff_pets_insert_guard on public.pets
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('patients', 'create'));
drop policy if exists vetra_staff_pets_update_guard on public.pets;
create policy vetra_staff_pets_update_guard on public.pets
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('patients', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('patients', 'edit'));
drop policy if exists vetra_staff_pets_delete_guard on public.pets;
create policy vetra_staff_pets_delete_guard on public.pets
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('patients', 'delete'));

-- Inventory tables: keep the existing clinic isolation policies and add permission checks.
drop policy if exists vetra_staff_products_select_guard on public.products;
create policy vetra_staff_products_select_guard on public.products
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('inventory', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'view')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'create')
      or public.vetra_has_clinic_staff_permission('invoices', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')
    ));
drop policy if exists vetra_staff_products_insert_guard on public.products;
create policy vetra_staff_products_insert_guard on public.products
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_products_update_guard on public.products;
create policy vetra_staff_products_update_guard on public.products
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_products_delete_guard on public.products;
create policy vetra_staff_products_delete_guard on public.products
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

drop policy if exists vetra_staff_product_categories_select_guard on public.product_categories;
create policy vetra_staff_product_categories_select_guard on public.product_categories
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('inventory', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'view')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'create')
      or public.vetra_has_clinic_staff_permission('invoices', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')
    ));
drop policy if exists vetra_staff_product_categories_insert_guard on public.product_categories;
create policy vetra_staff_product_categories_insert_guard on public.product_categories
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_product_categories_update_guard on public.product_categories;
create policy vetra_staff_product_categories_update_guard on public.product_categories
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_product_categories_delete_guard on public.product_categories;
create policy vetra_staff_product_categories_delete_guard on public.product_categories
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

-- Supplier and purchase direct table access is restricted too; SECURITY DEFINER purchase functions
-- receive the same checks in vetra_inventory_purchases.sql.
drop policy if exists vetra_staff_inventory_suppliers_select_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_select_guard on public.inventory_suppliers
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'view'));
drop policy if exists vetra_staff_inventory_suppliers_insert_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_insert_guard on public.inventory_suppliers
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_inventory_suppliers_update_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_update_guard on public.inventory_suppliers
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_inventory_suppliers_delete_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_delete_guard on public.inventory_suppliers
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

drop policy if exists vetra_staff_inventory_purchases_select_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_select_guard on public.inventory_purchases
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'view'));
drop policy if exists vetra_staff_inventory_purchases_insert_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_insert_guard on public.inventory_purchases
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_inventory_purchases_update_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_update_guard on public.inventory_purchases
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_inventory_purchases_delete_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_delete_guard on public.inventory_purchases
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

-- Purchase line items must follow the same view/create/edit/delete boundaries as the parent purchase.
drop policy if exists vetra_staff_inventory_purchase_items_select_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_select_guard on public.inventory_purchase_items
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'view'));
drop policy if exists vetra_staff_inventory_purchase_items_insert_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_insert_guard on public.inventory_purchase_items
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_inventory_purchase_items_update_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_update_guard on public.inventory_purchase_items
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_inventory_purchase_items_delete_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_delete_guard on public.inventory_purchase_items
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

-- Financial reads are split between Finance and register permissions.
-- The Finance page may read account balances, invoice summaries, and the movement ledger;
-- the cash-register page uses finance_page.view.
drop policy if exists vetra_staff_financial_accounts_select_guard on public.financial_accounts;
create policy vetra_staff_financial_accounts_select_guard on public.financial_accounts
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (public.vetra_has_clinic_staff_permission('finance_page', 'view')
      or public.vetra_has_clinic_staff_permission('finance_page', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')));
drop policy if exists vetra_staff_cash_sessions_select_guard on public.cash_register_sessions;
create policy vetra_staff_cash_sessions_select_guard on public.cash_register_sessions
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('finance_page', 'view'));
drop policy if exists vetra_staff_financial_transactions_select_guard on public.financial_transactions;
create policy vetra_staff_financial_transactions_select_guard on public.financial_transactions
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (public.vetra_has_clinic_staff_permission('finance_page', 'view')
      or public.vetra_has_clinic_staff_permission('finance_page', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')));

-- The existing invoice and invoice-item select guards are also recreated by the updated
-- vetra_staff_permission_rls.sql so Finance can show its authorized invoice summaries.
commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_permissions_function_guards.sql

-- Idempotently add permission checks to existing SECURITY DEFINER finance, cash-register and purchase functions.
-- Run on each clinic tenant database after finance, inventory-purchase SQL and vetra_staff_permission_rls.sql.
begin;

do $vetra_permission_patch$
declare
  v_target record;
  v_definition text;
  v_anchor text := 'if v_clinic_id is null then raise exception ''No active VETRA clinic found in token''; end if;';
  v_guard text;
  v_seen integer := 0;
begin
  if to_regprocedure('public.vetra_has_clinic_staff_permission(text,text)') is null then
    raise exception 'Apply vetra_staff_permission_rls.sql first; permission helper is missing.';
  end if;

  for v_target in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'vetra_create_financial_account',
        'vetra_open_cash_register',
        'vetra_close_cash_register',
        'vetra_post_financial_transaction',
        'vetra_transfer_between_accounts',
        'vetra_record_invoice_payment',
        'vetra_ensure_cash_register_open',
        'vetra_create_inventory_supplier',
        'vetra_create_inventory_purchase',
        'vetra_update_inventory_purchase'
      )
  loop
    v_definition := pg_get_functiondef(v_target.oid);
    case v_target.proname
      when 'vetra_create_financial_account' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Financial account creation permission is required''; end if;';
      when 'vetra_open_cash_register' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Cash register opening permission is required''; end if;';
      when 'vetra_close_cash_register' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Cash register closing permission is required''; end if;';
      when 'vetra_post_financial_transaction' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Financial transaction creation permission is required''; end if;';
      when 'vetra_transfer_between_accounts' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Financial transfer permission is required''; end if;';
      when 'vetra_record_invoice_payment' then
        v_guard := 'if not (public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') or public.vetra_has_clinic_staff_permission(''invoices'', ''create'')) then raise exception ''Payment creation permission is required''; end if;';
      when 'vetra_ensure_cash_register_open' then
        v_guard := 'if not (public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') or public.vetra_has_clinic_staff_permission(''invoices'', ''create'')) then raise exception ''Cash register operation permission is required''; end if;';
      when 'vetra_create_inventory_supplier' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''inventory'', ''create'') then raise exception ''Inventory creation permission is required''; end if;';
      when 'vetra_create_inventory_purchase' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''inventory'', ''create'') or not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Inventory and payment creation permissions are required''; end if;';
      when 'vetra_update_inventory_purchase' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''inventory'', ''edit'') or not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Inventory and payment edit permissions are required''; end if;';
    end case;

    -- Replace the original finance-only guards when this patch is re-run on a
    -- tenant that already applied an earlier version of this migration.
    if v_target.proname = 'vetra_record_invoice_payment' then
      v_definition := replace(v_definition,
        'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Payment creation permission is required''; end if;',
        v_guard);
    elsif v_target.proname = 'vetra_ensure_cash_register_open' then
      v_definition := replace(v_definition,
        'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Cash register operation permission is required''; end if;',
        v_guard);
    end if;

    if position(v_guard in v_definition) > 0 then
      execute v_definition;
      v_seen := v_seen + 1;
      continue;
    end if;
    if position(v_anchor in v_definition) = 0 then
      raise exception 'Could not find the expected clinic-token guard in %. No function was changed.', v_target.proname;
    end if;

    v_definition := replace(v_definition, v_anchor, v_anchor || E'\n  ' || v_guard);
    execute v_definition;
    v_seen := v_seen + 1;
  end loop;

  if v_seen < 10 then
    raise exception 'Expected 10 permission-guarded functions, but found only %. Run all required finance, auto-open cash-register, inventory-purchase and permission SQL first.', v_seen;
  end if;
end;
$vetra_permission_patch$;

commit;

-- >>> SOURCE: supabase/tenant-sql/vetra_visit_medication_inventory.sql

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


-- >>> SOURCE: supabase/tenant-sql/vetra_vaccination_product_mappings.sql

-- Map clinic vaccination protocols to stocked products.
-- Run on each clinic tenant database.
begin;

create table if not exists public.clinic_vaccination_products (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  protocol_key text not null check (protocol_key in ('viral', 'rabies', 'deworm', 'parasite')),
  product_id uuid not null references public.products(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (clinic_id, protocol_key, product_id)
);

alter table public.clinic_vaccination_products
  drop constraint if exists clinic_vaccination_products_clinic_id_protocol_key_key;

alter table public.vaccinations
  add column if not exists product_id uuid references public.products(id) on delete set null;

alter table public.clinic_vaccination_products enable row level security;

drop policy if exists vetra_clinic_vaccination_products_select on public.clinic_vaccination_products;
create policy vetra_clinic_vaccination_products_select
  on public.clinic_vaccination_products for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id());

drop policy if exists vetra_clinic_vaccination_products_insert on public.clinic_vaccination_products;
create policy vetra_clinic_vaccination_products_insert
  on public.clinic_vaccination_products for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id());

drop policy if exists vetra_clinic_vaccination_products_update on public.clinic_vaccination_products;
create policy vetra_clinic_vaccination_products_update
  on public.clinic_vaccination_products for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());

drop policy if exists vetra_clinic_vaccination_products_delete on public.clinic_vaccination_products;
create policy vetra_clinic_vaccination_products_delete
  on public.clinic_vaccination_products for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id());

grant select, insert, update, delete on public.clinic_vaccination_products to authenticated;
revoke all on public.clinic_vaccination_products from anon, public;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_clinic_condition_protocols.sql

-- Clinic-scoped reusable treatment protocols for common conditions.
-- Run this on the clinic tenant database (not VETRA CORE).

begin;

create table if not exists public.clinic_condition_protocols (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  species text not null,
  name_ar text not null default '',
  name_en text not null default '',
  medication_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_condition_protocols_name_present
    check (length(trim(name_ar)) > 0 or length(trim(name_en)) > 0),
  constraint clinic_condition_protocols_species_present
    check (length(trim(species)) > 0)
);

-- Older clinic installations may have created this as uuid[]. BSAVA references
-- (for example "bsava:237:IV") are strings, so retain existing UUID values as
-- text and allow both clinic medication IDs and formulary references.
alter table public.clinic_condition_protocols
  alter column medication_ids type text[]
  using medication_ids::text[];

create index if not exists clinic_condition_protocols_clinic_species_name_idx
  on public.clinic_condition_protocols (clinic_id, species, name_en);

alter table public.clinic_condition_protocols enable row level security;

drop policy if exists vetra_condition_protocols_select on public.clinic_condition_protocols;
create policy vetra_condition_protocols_select on public.clinic_condition_protocols
  for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id());

drop policy if exists vetra_condition_protocols_insert on public.clinic_condition_protocols;
create policy vetra_condition_protocols_insert on public.clinic_condition_protocols
  for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id());

drop policy if exists vetra_condition_protocols_update on public.clinic_condition_protocols;
create policy vetra_condition_protocols_update on public.clinic_condition_protocols
  for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());

drop policy if exists vetra_condition_protocols_delete on public.clinic_condition_protocols;
create policy vetra_condition_protocols_delete on public.clinic_condition_protocols
  for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id());

revoke all on public.clinic_condition_protocols from anon, public;
grant select, insert, update, delete on public.clinic_condition_protocols to authenticated;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_human_medication_templates.sql

-- Run on each clinic tenant database after vetra_staff_permission_rls.sql.
-- Reusable human-medication settings are not patient prescription records.
begin;

create table if not exists public.human_medication_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  medication_name text not null check (length(trim(medication_name)) > 0),
  name_key text generated always as (lower(regexp_replace(trim(medication_name), '\s+', ' ', 'g'))) stored,
  prescription text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, name_key)
);

alter table public.human_medication_templates enable row level security;
drop policy if exists vetra_human_medication_templates_select on public.human_medication_templates;
create policy vetra_human_medication_templates_select on public.human_medication_templates
  for select to authenticated using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('medical_records', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('medical_records', 'edit')
    )
  );

drop policy if exists vetra_human_medication_templates_insert on public.human_medication_templates;
create policy vetra_human_medication_templates_insert on public.human_medication_templates
  for insert to authenticated with check (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('medical_records', 'edit')
    )
  );

drop policy if exists vetra_human_medication_templates_update on public.human_medication_templates;
create policy vetra_human_medication_templates_update on public.human_medication_templates
  for update to authenticated using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('medical_records', 'edit')
    )
  ) with check (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('medical_records', 'edit')
    )
  );

grant select, insert, update on public.human_medication_templates to authenticated;
revoke all on public.human_medication_templates from public, anon;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_clinic_message_templates.sql

-- Editable bilingual WhatsApp message templates for each clinic tenant.
begin;

create table if not exists public.clinic_message_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  template_key text not null check (template_key in (
    'appointment_reminder', 'surgery_reminder', 'followup_reminder',
    'prescription_sharing', 'vaccination_due', 'vaccination_overdue', 'invoice_sharing'
  )),
  language text not null check (language in ('ar', 'en')),
  message text not null check (char_length(message) <= 6000),
  updated_at timestamptz not null default now(),
  unique (clinic_id, template_key, language)
);

alter table public.clinic_message_templates enable row level security;
drop policy if exists vetra_clinic_message_templates_select on public.clinic_message_templates;
create policy vetra_clinic_message_templates_select on public.clinic_message_templates
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_message_templates_insert on public.clinic_message_templates;
create policy vetra_clinic_message_templates_insert on public.clinic_message_templates
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_message_templates_update on public.clinic_message_templates;
create policy vetra_clinic_message_templates_update on public.clinic_message_templates
  for update to authenticated using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());

grant select, insert, update on public.clinic_message_templates to authenticated;
revoke all on public.clinic_message_templates from anon, public;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_clinic_profile_settings.sql

-- Clinic-specific printable identity and public brand assets.
-- Run on each clinic tenant database, not VETRA CORE.
begin;

create table if not exists public.clinic_profile_settings (
  clinic_id uuid primary key,
  display_name text not null check (char_length(display_name) between 1 and 120),
  doctor_name text,
  doctor_name_changed_at timestamptz,
  website_url text,
  logo_url text,
  logo_path text,
  updated_at timestamptz not null default now()
);

alter table public.clinic_profile_settings
  add column if not exists doctor_name text,
  add column if not exists doctor_name_changed_at timestamptz;

create or replace function public.vetra_limit_clinic_doctor_name_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.doctor_name is distinct from old.doctor_name then
    if old.doctor_name_changed_at is not null
      and old.doctor_name_changed_at > now() - interval '6 months' then
      raise exception 'Doctor name can only be changed once every six months.'
        using errcode = 'check_violation';
    end if;

    new.doctor_name_changed_at := now();
  else
    new.doctor_name_changed_at := old.doctor_name_changed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists vetra_clinic_doctor_name_change_limit on public.clinic_profile_settings;
create trigger vetra_clinic_doctor_name_change_limit
  before update on public.clinic_profile_settings
  for each row execute function public.vetra_limit_clinic_doctor_name_changes();

alter table public.clinic_profile_settings enable row level security;
drop policy if exists vetra_clinic_profile_settings_select on public.clinic_profile_settings;
create policy vetra_clinic_profile_settings_select on public.clinic_profile_settings
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_profile_settings_insert on public.clinic_profile_settings;
create policy vetra_clinic_profile_settings_insert on public.clinic_profile_settings
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_profile_settings_update on public.clinic_profile_settings;
create policy vetra_clinic_profile_settings_update on public.clinic_profile_settings
  for update to authenticated using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());
grant select, insert, update on public.clinic_profile_settings to authenticated;
revoke all on public.clinic_profile_settings from anon, public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinic-branding', 'clinic-branding', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vetra_clinic_branding_select on storage.objects;
create policy vetra_clinic_branding_select on storage.objects
  for select to authenticated using (
    bucket_id = 'clinic-branding'
    and split_part(name, '/', 1) = public.vetra_current_clinic_id()::text
  );
drop policy if exists vetra_clinic_branding_insert on storage.objects;
create policy vetra_clinic_branding_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'clinic-branding'
    and split_part(name, '/', 1) = public.vetra_current_clinic_id()::text
  );
drop policy if exists vetra_clinic_branding_delete on storage.objects;
create policy vetra_clinic_branding_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'clinic-branding'
    and split_part(name, '/', 1) = public.vetra_current_clinic_id()::text
  );

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_clinic_injection_fee.sql

-- Default per-injection fee used for medication charges on new visit invoices.
-- Run this on the clinic tenant database (not VETRA CORE).

alter table public.billing_settings
  add column if not exists injection_fee numeric(14,2) not null default 0;


-- >>> SOURCE: supabase/tenant-sql/vetra_clinic_follow_up_fee.sql

-- Default follow-up visit fee used when creating invoices from visits.
-- Run this on the clinic tenant database (not VETRA CORE).

alter table public.billing_settings
  add column if not exists follow_up_fee numeric(14,2) not null default 0;


-- >>> SOURCE: supabase/tenant-sql/vetra_reception_queue.sql

-- Explicit queue for visit invoices the doctor chooses to send to reception.
-- Run on each clinic tenant database, not VETRA CORE.
begin;

create table if not exists public.clinic_reception_queue (
  clinic_id uuid not null,
  visit_id uuid not null references public.visits(id) on delete cascade,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  primary key (clinic_id, visit_id)
);

alter table public.clinic_reception_queue enable row level security;
drop policy if exists vetra_reception_queue_select on public.clinic_reception_queue;
create policy vetra_reception_queue_select on public.clinic_reception_queue
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_reception_queue_insert on public.clinic_reception_queue;
create policy vetra_reception_queue_insert on public.clinic_reception_queue
  for insert to authenticated with check (
    clinic_id = public.vetra_current_clinic_id()
    and (sent_by is null or sent_by = auth.uid())
  );

grant select, insert on public.clinic_reception_queue to authenticated;
revoke all on public.clinic_reception_queue from anon, public;

-- The dedicated visit workflow stores these notes. Queue insertion in the trigger
-- shares the transaction that changes the invoice from draft to issued.
create or replace function public.vetra_enqueue_reception_visit_invoice()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'draft'
     and new.status in ('issued', 'unpaid', 'partially_paid')
     and new.visit_id is not null
     and new.notes in ('فاتورة من الزيارة للاستقبال', 'Invoice from visit for reception') then
    insert into public.clinic_reception_queue (clinic_id, visit_id, sent_by)
    values (new.clinic_id, new.visit_id, auth.uid())
    on conflict (clinic_id, visit_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists vetra_enqueue_reception_visit_invoice on public.invoices;
create trigger vetra_enqueue_reception_visit_invoice
  after update of status on public.invoices
  for each row execute function public.vetra_enqueue_reception_visit_invoice();

-- Backfill invoices previously sent through the same dedicated workflow.
insert into public.clinic_reception_queue (clinic_id, visit_id, sent_at)
select i.clinic_id, i.visit_id, coalesce(i.issued_at, now())
from public.invoices i
where i.visit_id is not null
  and i.status in ('issued', 'unpaid', 'partially_paid')
  and i.notes in ('فاتورة من الزيارة للاستقبال', 'Invoice from visit for reception')
on conflict (clinic_id, visit_id) do nothing;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_checkout_dismissals.sql

-- Hide an unbilled visit from the reception checkout queue without deleting its medical record.
-- Run on each clinic tenant database, not VETRA CORE.
begin;

create table if not exists public.clinic_checkout_dismissals (
  clinic_id uuid not null,
  visit_id uuid not null references public.visits(id) on delete cascade,
  dismissed_by uuid not null,
  dismissed_at timestamptz not null default now(),
  primary key (clinic_id, visit_id)
);

alter table public.clinic_checkout_dismissals enable row level security;
drop policy if exists vetra_checkout_dismissals_select on public.clinic_checkout_dismissals;
create policy vetra_checkout_dismissals_select on public.clinic_checkout_dismissals
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_checkout_dismissals_insert on public.clinic_checkout_dismissals;
create policy vetra_checkout_dismissals_insert on public.clinic_checkout_dismissals
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());

grant select, insert on public.clinic_checkout_dismissals to authenticated;
revoke all on public.clinic_checkout_dismissals from anon, public;

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_reception_draft_checkout.sql

-- Run on each clinic tenant database after vetra_staff_permission_rls.sql.
-- Reception can prepare visit drafts with invoice-create permission; issued
-- invoices retain their existing edit restrictions and payment workflow.
begin;

create or replace function public.vetra_can_checkout_visit_draft(
  p_clinic_id uuid,
  p_visit_id uuid,
  p_status text,
  p_paid_amount numeric
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_clinic_id = public.vetra_current_clinic_id()
    and auth.uid() is not null
    and p_status = 'draft'
    and coalesce(p_paid_amount, 0) = 0
    and public.vetra_has_clinic_staff_permission('invoices', 'create')
    and exists (
      select 1 from public.clinic_staff s
      where s.clinic_id = p_clinic_id
        and s.auth_user_id = auth.uid()
        and s.staff_type = 'front_desk'
    )
    and exists (
      select 1 from public.visits v
      where v.id = p_visit_id and v.clinic_id = p_clinic_id
    );
$$;

revoke all on function public.vetra_can_checkout_visit_draft(uuid, uuid, text, numeric) from public, anon;
grant execute on function public.vetra_can_checkout_visit_draft(uuid, uuid, text, numeric) to authenticated;

drop policy if exists vetra_staff_invoices_update_guard on public.invoices;
create policy vetra_staff_invoices_update_guard on public.invoices
  as restrictive for update to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'edit')
      or public.vetra_can_checkout_visit_draft(clinic_id, visit_id, status::text, paid_amount)
    )
  )
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'edit')
      or public.vetra_can_checkout_visit_draft(clinic_id, visit_id, status::text, paid_amount)
    )
  );

drop policy if exists vetra_staff_invoices_update on public.invoices;
create policy vetra_staff_invoices_update on public.invoices
  for update to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'edit')
      or public.vetra_can_checkout_visit_draft(clinic_id, visit_id, status::text, paid_amount)
    )
  )
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'edit')
      or public.vetra_can_checkout_visit_draft(clinic_id, visit_id, status::text, paid_amount)
    )
  );

drop policy if exists vetra_staff_invoice_items_delete_guard on public.invoice_items;
create policy vetra_staff_invoice_items_delete_guard on public.invoice_items
  as restrictive for delete to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'edit')
      or exists (
        select 1 from public.invoices i
        where i.id = invoice_items.invoice_id
          and i.clinic_id = invoice_items.clinic_id
          and public.vetra_can_checkout_visit_draft(i.clinic_id, i.visit_id, i.status::text, i.paid_amount)
      )
    )
  );

commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_reception_invoice_edit.sql

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


-- >>> SOURCE: supabase/tenant-sql/vetra_invoice_view_permissions.sql

-- Run on each tenant after the staff permission helper is installed.
-- Uses invoices.view for invoice lists, details, and lines.
begin;
drop policy if exists vetra_staff_invoices_select_guard on public.invoices;
create policy vetra_staff_invoices_select_guard on public.invoices
  as restrictive for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'view')
        or public.vetra_has_clinic_staff_permission('finance_page', 'view')
        or public.vetra_has_clinic_staff_permission('invoices', 'create')
    )
  );

drop policy if exists vetra_staff_invoices_select on public.invoices;
create policy vetra_staff_invoices_select on public.invoices
  for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'view')
  );

drop policy if exists vetra_staff_invoice_items_select_guard on public.invoice_items;
create policy vetra_staff_invoice_items_select_guard on public.invoice_items
  as restrictive for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'view')
        or public.vetra_has_clinic_staff_permission('finance_page', 'view')
        or public.vetra_has_clinic_staff_permission('invoices', 'create')
    )
  );
commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_pet_medical_records.sql

-- Lab orders and surgical history shared between clinic and owner portal.
-- Run on each clinic tenant database, not VETRA CORE.
begin;

create table if not exists public.pet_medical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  pet_id uuid not null references public.pets(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  record_type text not null check (record_type in ('lab', 'surgery')),
  title text not null,
  status text not null default 'ordered',
  result text,
  notes text,
  performed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pet_medical_records_title_present check (length(trim(title)) > 0)
);

create index if not exists pet_medical_records_pet_date_idx
  on public.pet_medical_records (pet_id, created_at desc);

alter table public.pet_medical_records enable row level security;
drop policy if exists vetra_pet_medical_records_clinic_select on public.pet_medical_records;
create policy vetra_pet_medical_records_clinic_select on public.pet_medical_records
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_pet_medical_records_clinic_insert on public.pet_medical_records;
create policy vetra_pet_medical_records_clinic_insert on public.pet_medical_records
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_pet_medical_records_clinic_update on public.pet_medical_records;
create policy vetra_pet_medical_records_clinic_update on public.pet_medical_records
  for update to authenticated using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_pet_medical_records_clinic_delete on public.pet_medical_records;
create policy vetra_pet_medical_records_clinic_delete on public.pet_medical_records
  for delete to authenticated using (clinic_id = public.vetra_current_clinic_id());

grant select, insert, update, delete on public.pet_medical_records to authenticated;
revoke all on public.pet_medical_records from anon, public;

create or replace function public.vetra_get_pet_medical_records(p_pet_id uuid)
returns setof public.pet_medical_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_code text := nullif(trim(v_headers ->> 'x-vetra-client-code'), '');
  v_phone text := nullif(trim(v_headers ->> 'x-vetra-client-phone'), '');
  v_client_id uuid;
begin
  if v_code is null or v_phone is null then
    raise exception 'Pet owner session could not be verified';
  end if;
  select c.id into v_client_id
  from public.clients c
  where c.client_code = v_code
    and regexp_replace(coalesce(c.phone, ''), '\s+', '', 'g') = regexp_replace(v_phone, '\s+', '', 'g')
  limit 1;
  if v_client_id is null then raise exception 'Pet owner session could not be verified'; end if;
  return query select r.* from public.pet_medical_records r
    where r.pet_id = p_pet_id and r.client_id = v_client_id
    order by r.created_at desc;
end;
$$;

revoke all on function public.vetra_get_pet_medical_records(uuid) from public;
grant execute on function public.vetra_get_pet_medical_records(uuid) to anon, authenticated;
commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_visit_attachments.sql

-- Private analysis and imaging attachments for clinic visits.
-- Run on each clinic tenant database, not VETRA CORE.
begin;

create table if not exists public.visit_attachments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  visit_id uuid not null references public.visits(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  category text not null check (category in ('analysis', 'xray')),
  created_at timestamptz not null default now()
);

create index if not exists visit_attachments_visit_created_idx
  on public.visit_attachments (visit_id, created_at desc);

alter table public.visit_attachments enable row level security;
drop policy if exists vetra_visit_attachments_select on public.visit_attachments;
create policy vetra_visit_attachments_select on public.visit_attachments
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_visit_attachments_insert on public.visit_attachments;
create policy vetra_visit_attachments_insert on public.visit_attachments
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_visit_attachments_update on public.visit_attachments;
create policy vetra_visit_attachments_update on public.visit_attachments
  for update to authenticated using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_visit_attachments_delete on public.visit_attachments;
create policy vetra_visit_attachments_delete on public.visit_attachments
  for delete to authenticated using (clinic_id = public.vetra_current_clinic_id());

grant select, insert, update, delete on public.visit_attachments to authenticated;
revoke all on public.visit_attachments from anon, public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-attachments', 'visit-attachments', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vetra_visit_attachment_objects_select on storage.objects;
create policy vetra_visit_attachment_objects_select on storage.objects
  for select to authenticated using (
    bucket_id = 'visit-attachments'
    and split_part(name, '/', 1) = public.vetra_current_clinic_id()::text
  );
drop policy if exists vetra_visit_attachment_objects_insert on storage.objects;
create policy vetra_visit_attachment_objects_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'visit-attachments'
    and split_part(name, '/', 1) = public.vetra_current_clinic_id()::text
  );
drop policy if exists vetra_visit_attachment_objects_delete on storage.objects;
create policy vetra_visit_attachment_objects_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'visit-attachments'
    and split_part(name, '/', 1) = public.vetra_current_clinic_id()::text
  );

commit;

-- >>> SOURCE: supabase/tenant-sql/vetra_medical_record_permissions.sql

-- Apply to each clinic tenant database after vetra_staff_permission_rls.sql.
-- Adds action guards to existing tenant isolation; does not replace it.
begin;
do $$
declare
  t text;
  a text;
  permission_action text;
  policy_name text;
begin
  foreach t in array array['visits', 'pet_medical_records', 'visit_attachments'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'Required medical table missing: %', t;
    end if;
    foreach a in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = t
          and permissive = 'PERMISSIVE' and cmd in (a, 'ALL')
      ) then
        raise exception 'Missing tenant policy for % on %', a, t;
      end if;
      permission_action := case a when 'INSERT' then 'create' when 'UPDATE' then 'edit' else 'delete' end;
      policy_name := 'vetra_medical_' || lower(a) || '_guard';
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', policy_name, t);
      if a = 'INSERT' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''medical_records'', %L))', policy_name, t, permission_action);
      elsif a = 'UPDATE' then
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''medical_records'', %L)) with check (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''medical_records'', %L))', policy_name, t, permission_action, permission_action);
      else
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''medical_records'', %L))', policy_name, t, permission_action);
      end if;
    end loop;
  end loop;
end;
$$;
commit;



-- >>> SOURCE: supabase/tenant-sql/vetra_client_lab_results.sql

-- Owner-submitted laboratory reports and their private files.
-- Run this on every clinic tenant database after vetra_pet_medical_records.sql.
begin;

create table if not exists public.pet_medical_record_attachments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  record_id uuid not null references public.pet_medical_records(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

create index if not exists pet_medical_record_attachments_record_idx
  on public.pet_medical_record_attachments (record_id, created_at desc);

alter table public.pet_medical_record_attachments enable row level security;
drop policy if exists vetra_pet_lab_attachments_clinic_select on public.pet_medical_record_attachments;
create policy vetra_pet_lab_attachments_clinic_select on public.pet_medical_record_attachments
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission('medical_records', 'view'));
drop policy if exists vetra_pet_lab_attachments_clinic_insert on public.pet_medical_record_attachments;
create policy vetra_pet_lab_attachments_clinic_insert on public.pet_medical_record_attachments
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id() and (public.vetra_has_clinic_staff_permission('medical_records', 'create') or public.vetra_has_clinic_staff_permission('medical_records', 'edit')));
drop policy if exists vetra_pet_lab_attachments_clinic_update on public.pet_medical_record_attachments;
create policy vetra_pet_lab_attachments_clinic_update on public.pet_medical_record_attachments
  for update to authenticated using (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission('medical_records', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission('medical_records', 'edit'));
drop policy if exists vetra_pet_lab_attachments_clinic_delete on public.pet_medical_record_attachments;
create policy vetra_pet_lab_attachments_clinic_delete on public.pet_medical_record_attachments
  for delete to authenticated using (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission('medical_records', 'delete'));

grant select, insert, update, delete on public.pet_medical_record_attachments to authenticated;
revoke all on public.pet_medical_record_attachments from anon, public;

create or replace function public.vetra_get_pet_lab_records(p_pet_id uuid)
returns setof public.pet_medical_records
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_code text := nullif(trim(v_headers ->> 'x-vetra-client-code'), '');
  v_phone text := nullif(trim(v_headers ->> 'x-vetra-client-phone'), '');
  v_client_id uuid;
begin
  select c.id into v_client_id from public.clients c
    where c.client_code = v_code
      and regexp_replace(coalesce(c.phone, ''), '\s+', '', 'g') = regexp_replace(coalesce(v_phone, ''), '\s+', '', 'g')
    limit 1;
  if v_client_id is null then raise exception 'Pet owner session could not be verified'; end if;
  return query select r.* from public.pet_medical_records r
    where r.pet_id = p_pet_id and r.client_id = v_client_id and r.record_type = 'lab'
    order by coalesce(r.performed_at, r.created_at) desc;
end;
$$;

create or replace function public.vetra_get_pet_lab_attachments(p_pet_id uuid)
returns setof public.pet_medical_record_attachments
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_code text := nullif(trim(v_headers ->> 'x-vetra-client-code'), '');
  v_phone text := nullif(trim(v_headers ->> 'x-vetra-client-phone'), '');
  v_client_id uuid;
begin
  select c.id into v_client_id from public.clients c
    where c.client_code = v_code
      and regexp_replace(coalesce(c.phone, ''), '\s+', '', 'g') = regexp_replace(coalesce(v_phone, ''), '\s+', '', 'g')
    limit 1;
  if v_client_id is null then raise exception 'Pet owner session could not be verified'; end if;
  return query select a.* from public.pet_medical_record_attachments a
    where a.pet_id = p_pet_id and a.client_id = v_client_id order by a.created_at desc;
end;
$$;

create or replace function public.vetra_submit_pet_lab_result(
  p_pet_id uuid, p_title text, p_result text, p_notes text, p_performed_at timestamptz
)
returns public.pet_medical_records
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_code text := nullif(trim(v_headers ->> 'x-vetra-client-code'), '');
  v_phone text := nullif(trim(v_headers ->> 'x-vetra-client-phone'), '');
  v_client_id uuid;
  v_clinic_id uuid;
  v_record public.pet_medical_records;
begin
  if nullif(trim(p_title), '') is null then raise exception 'A report title is required'; end if;
  select c.id, c.clinic_id into v_client_id, v_clinic_id from public.clients c
    where c.client_code = v_code
      and regexp_replace(coalesce(c.phone, ''), '\s+', '', 'g') = regexp_replace(coalesce(v_phone, ''), '\s+', '', 'g')
    limit 1;
  if v_client_id is null then raise exception 'Pet owner session could not be verified'; end if;
  if not exists (select 1 from public.pets p where p.id = p_pet_id and p.client_id = v_client_id) then
    raise exception 'Pet does not belong to this account';
  end if;
  insert into public.pet_medical_records (clinic_id, pet_id, client_id, record_type, title, status, result, notes, performed_at)
  values (v_clinic_id, p_pet_id, v_client_id, 'lab', trim(p_title), 'submitted', nullif(p_result, ''), nullif(p_notes, ''), coalesce(p_performed_at, now()))
  returning * into v_record;
  return v_record;
end;
$$;

create or replace function public.vetra_attach_pet_lab_file(
  p_record_id uuid, p_file_name text, p_storage_path text, p_mime_type text, p_size_bytes bigint
)
returns public.pet_medical_record_attachments
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_code text := nullif(trim(v_headers ->> 'x-vetra-client-code'), '');
  v_phone text := nullif(trim(v_headers ->> 'x-vetra-client-phone'), '');
  v_client_id uuid;
  v_row public.pet_medical_record_attachments;
  v_record public.pet_medical_records;
begin
  select c.id into v_client_id from public.clients c
    where c.client_code = v_code
      and regexp_replace(coalesce(c.phone, ''), '\s+', '', 'g') = regexp_replace(coalesce(v_phone, ''), '\s+', '', 'g')
    limit 1;
  select * into v_record from public.pet_medical_records where id = p_record_id and client_id = v_client_id and record_type = 'lab';
  if v_record.id is null then raise exception 'Lab report could not be verified'; end if;
  insert into public.pet_medical_record_attachments (clinic_id, record_id, pet_id, client_id, file_name, storage_path, mime_type, size_bytes)
  values (v_record.clinic_id, v_record.id, v_record.pet_id, v_record.client_id, p_file_name, p_storage_path, p_mime_type, p_size_bytes)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.vetra_get_pet_lab_records(uuid) from public;
revoke all on function public.vetra_get_pet_lab_attachments(uuid) from public;
revoke all on function public.vetra_submit_pet_lab_result(uuid, text, text, text, timestamptz) from public;
revoke all on function public.vetra_attach_pet_lab_file(uuid, text, text, text, bigint) from public;
grant execute on function public.vetra_get_pet_lab_records(uuid) to anon, authenticated;
grant execute on function public.vetra_get_pet_lab_attachments(uuid) to anon, authenticated;
grant execute on function public.vetra_submit_pet_lab_result(uuid, text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.vetra_attach_pet_lab_file(uuid, text, text, text, bigint) to anon, authenticated;
commit;


-- >>> SOURCE: supabase/tenant-sql/vetra_update_pet_photo_for_owner.sql

-- Run this in each clinic's tenant database (the database URL returned by VETRA Core),
-- not in the VETRA Core project. Pet owners must never receive general UPDATE access
-- to the pets table; this function limits the write to their own pet.

create or replace function public.vetra_update_pet_photo_for_owner(
  p_pet_id uuid,
  p_photo_url text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  v_client_code text := nullif(trim(v_headers ->> 'x-vetra-client-code'), '');
  v_client_phone text := nullif(trim(v_headers ->> 'x-vetra-client-phone'), '');
  v_client_id uuid;
  v_updated_pet_id uuid;
begin
  -- Owner portal requests include the same Client ID + phone pair used at login.
  -- Resolve that pair in this tenant DB; auth.uid() is not the clients.id here.
  if v_client_code is not null and v_client_phone is not null then
    begin
      select c.id into v_client_id
      from public.clients c
      where c.client_code = v_client_code
        and regexp_replace(coalesce(c.phone, ''), '\s+', '', 'g') =
            regexp_replace(v_client_phone, '\s+', '', 'g')
      limit 1;
    end;
  else
    -- Retain compatibility for deployments that put the owner UUID in the JWT.
    v_client_id := auth.uid();
    if v_client_id is null then
      begin
        v_client_id := nullif(auth.jwt() ->> 'client_id', '')::uuid;
      exception when invalid_text_representation then
        v_client_id := null;
      end;
    end if;
  end if;

  if v_client_id is null then
    raise exception 'Pet owner session could not be verified in this clinic database';
  end if;
  if p_pet_id is null then
    raise exception 'Pet ID is required';
  end if;
  if p_photo_url is not null and (
    length(p_photo_url) > 2048
    or p_photo_url !~ '^https://[^/]+\.supabase\.co/storage/v1/object/(public/)?pet-photos/'
    or strpos(p_photo_url, '/' || p_pet_id::text || '/') = 0
  ) then
    raise exception 'Invalid pet photo URL';
  end if;

  update public.pets
  set photo_url = p_photo_url
  where id = p_pet_id
    and client_id = v_client_id
  returning id into v_updated_pet_id;

  if v_updated_pet_id is null then
    raise exception 'Pet not found for this owner';
  end if;

  return v_updated_pet_id;
end;
$$;

revoke all on function public.vetra_update_pet_photo_for_owner(uuid, text) from public;
grant execute on function public.vetra_update_pet_photo_for_owner(uuid, text) to anon, authenticated;


-- >>> SOURCE: supabase/tenant-sql/vetra_delete_client_cascade.sql

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


-- >>> SOURCE: supabase/tenant-sql/vetra_delete_pet_cascade.sql

-- Deletes one pet and its clinic-owned history in dependency order.
begin;

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
  if v_clinic_id is null then raise exception 'An active clinic session is required'; end if;
  if not public.vetra_has_clinic_staff_permission('patients', 'delete') then
    raise exception 'Patient delete permission is required';
  end if;
  select p.name, p.client_id into v_pet_name, v_client_id
  from public.pets p where p.id = p_pet_id and p.clinic_id = v_clinic_id for update;
  if not found then raise exception 'Pet not found in the active clinic'; end if;

  select coalesce(array_agg(v.id), '{}'::uuid[]) into v_visit_ids
  from public.visits v where v.pet_id = p_pet_id and v.clinic_id = v_clinic_id;
  select coalesce(array_agg(i.id), '{}'::uuid[]) into v_invoice_ids
  from public.invoices i where i.pet_id = p_pet_id or i.visit_id = any(v_visit_ids);

  if to_regclass('public.financial_transactions') is not null then
    delete from public.financial_transactions where related_invoice_id = any(v_invoice_ids);
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


-- >>> SOURCE: supabase/tenant-sql/vetra_client_code_generation.sql

-- Automatic Client ID generation for the clinic tenant database.
-- Run this file on the clinic database, not on VETRA Core.
-- New clients without client_code receive: clinic prefix (2 digits) + unique suffix (4 digits).

begin;

create unique index if not exists clients_client_code_unique
  on public.clients (clinic_id, client_code)
  where client_code is not null and btrim(client_code) <> '';

create or replace function public.vetra_allocate_client_code(p_clinic_id uuid, p_current_code text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_claims jsonb;
  v_clinic_number integer;
  v_candidate text;
  v_suffix integer;
  v_attempt integer;
begin
  if p_clinic_id is null then raise exception 'An active clinic is required'; end if;

  v_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  if (v_claims ->> 'clinic_number') ~ '^[0-9]{1,2}$' then
    v_clinic_number := (v_claims ->> 'clinic_number')::integer;
  end if;

  -- Compatibility for older clinic tokens: infer the prefix from existing IDs.
  if v_clinic_number is null then
    select min(left(c.client_code, 2)::integer)
      into v_clinic_number
      from public.clients c
     where c.clinic_id = p_clinic_id
       and c.client_code ~ '^[0-9]{6}$'
     having count(distinct left(c.client_code, 2)) = 1;
  end if;

  -- Stable fallback for a newly provisioned tenant whose token lacks clinic_number.
  if v_clinic_number is null then
    v_clinic_number := mod(abs(hashtext(p_clinic_id::text)::bigint), 99)::integer + 1;
  end if;
  if v_clinic_number < 1 or v_clinic_number > 99 then
    raise exception 'Clinic number must be between 1 and 99';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_clinic_id::text), hashtext('vetra_client_code_allocation'));

  for v_attempt in 1..100 loop
    v_suffix := floor(random() * 10000)::integer;
    v_candidate := lpad(v_clinic_number::text, 2, '0') || lpad(v_suffix::text, 4, '0');
    if v_candidate = p_current_code then continue; end if;
    if not exists (
      select 1 from public.clients c
       where c.clinic_id = p_clinic_id and c.client_code = v_candidate
    ) then
      return v_candidate;
    end if;
  end loop;

  raise exception 'Could not allocate a unique Client ID';
end;
$$;

create or replace function public.vetra_assign_client_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
begin
  if tg_op <> 'INSERT' then return new; end if;
  if v_clinic_id is null then raise exception 'An active clinic session is required'; end if;

  -- Explicit legacy/import codes remain intact; ordinary inserts are automatic.
  if nullif(btrim(new.client_code), '') is null then
    new.client_code := public.vetra_allocate_client_code(v_clinic_id);
  end if;
  return new;
end;
$$;

drop trigger if exists vetra_z_client_code_auto_generate on public.clients;
create trigger vetra_z_client_code_auto_generate
before insert on public.clients
for each row execute function public.vetra_assign_client_code();

create or replace function public.vetra_generate_client_code(p_client_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_current_code text;
  v_generated_code text;
begin
  if v_clinic_id is null then raise exception 'An active clinic session is required'; end if;
  if not public.vetra_has_clinic_staff_permission('patients', 'edit') then
    raise exception 'Patient edit permission is required';
  end if;

  select c.client_code into v_current_code
    from public.clients c
   where c.id = p_client_id and c.clinic_id = v_clinic_id
   for update;
  if not found then raise exception 'Client not found in the active clinic'; end if;

  v_generated_code := public.vetra_allocate_client_code(v_clinic_id, v_current_code);
  update public.clients
     set client_code = v_generated_code, updated_at = now()
   where id = p_client_id and clinic_id = v_clinic_id
   returning client_code into v_generated_code;
  return v_generated_code;
end;
$$;

revoke all on function public.vetra_allocate_client_code(uuid, text) from public, anon;
revoke all on function public.vetra_assign_client_code() from public, anon;
revoke all on function public.vetra_generate_client_code(uuid) from public, anon;
grant execute on function public.vetra_generate_client_code(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

select to_regprocedure('public.vetra_generate_client_code(uuid)') as client_code_rpc,
       to_regprocedure('public.vetra_assign_client_code()') as client_code_trigger_function;

-- >>> SOURCE: supabase/tenant-sql/vetra_dashboard_stats.sql

-- Server-side dashboard counts for the active clinic.
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


-- >>> SOURCE: supabase/tenant-sql/vetra_vaccination_permissions.sql

-- Apply to each clinic tenant database after vetra_staff_permission_rls.sql.
-- Adds read/write action guards to existing tenant isolation; does not replace it.
begin;
do $$
declare
  t text;
  a text;
  permission_action text;
  policy_name text;
begin
  foreach t in array array['vaccinations', 'clinic_vaccination_products'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'Required vaccination table missing: %', t;
    end if;
    foreach a in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = t
          and permissive = 'PERMISSIVE' and cmd in (a, 'ALL')
      ) then
        raise exception 'Missing tenant policy for % on %', a, t;
      end if;
      permission_action := case a when 'SELECT' then 'view' when 'INSERT' then 'create' when 'UPDATE' then 'edit' else 'delete' end;
      policy_name := 'vetra_vaccination_' || lower(a) || '_guard';
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', policy_name, t);
      if a = 'SELECT' then
        execute format('create policy %I on public.%I as restrictive for select to authenticated using (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''vaccinations'', ''view''))', policy_name, t);
      elsif a = 'INSERT' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''vaccinations'', %L))', policy_name, t, permission_action);
      elsif a = 'UPDATE' then
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''vaccinations'', %L)) with check (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''vaccinations'', %L))', policy_name, t, permission_action, permission_action);
      else
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''vaccinations'', %L))', policy_name, t, permission_action);
      end if;
    end loop;
  end loop;
end;
$$;
commit;


-- >>> SOURCE: C:\Users\omnia fawzy\Downloads\VETRA_LEGACY_IMPORT_TRACKING_PHASE2.sql

-- VETRA Legacy Import Phase 2: metadata-only batch/row tracking
-- Run in the SHARED CLINIC DATABASE (NOT VETRA CORE).
-- This creates audit tables only. It does not insert/change clients, pets, products, invoices or stock.
-- Assumes the existing tenant functions public.vetra_current_clinic_id() and public.vetra_set_clinic_id().

begin;

create table if not exists public.legacy_import_batches (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  source_file_name text not null check (length(trim(source_file_name)) between 1 and 255),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-fA-F]{64}$'),
  source_size_bytes bigint not null default 0 check (source_size_bytes >= 0),
  audit_version text not null default 'phase2-v1',
  status text not null default 'dry_run' check (status in (
    'dry_run', 'needs_review', 'ready_to_import', 'importing', 'committed', 'failed', 'cancelled'
  )),
  source_table_counts jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint legacy_import_batches_id_clinic_unique unique (id, clinic_id)
);

create table if not exists public.legacy_import_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  clinic_id uuid not null,
  source_table text not null check (length(trim(source_table)) > 0),
  source_key text not null check (length(trim(source_key)) > 0),
  source_row_number bigint not null check (source_row_number > 0),
  source_key_column text,
  row_fingerprint text not null check (row_fingerprint ~ '^[0-9a-fA-F]{64}$'),
  candidate_target_table text,
  target_id uuid,
  decision text not null default 'needs_review' check (decision in (
    'candidate', 'needs_review', 'unsupported', 'skip', 'reject'
  )),
  status text not null default 'profiled' check (status in (
    'profiled', 'needs_review', 'error', 'imported', 'skipped'
  )),
  issue_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(issue_codes) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legacy_import_records_batch_clinic_fk
    foreign key (batch_id, clinic_id)
    references public.legacy_import_batches(id, clinic_id)
    on delete cascade,
  constraint legacy_import_records_batch_table_key_unique
    unique (batch_id, source_table, source_key),
  constraint legacy_import_records_batch_table_row_unique
    unique (batch_id, source_table, source_row_number)
);

create index if not exists legacy_import_batches_clinic_created_idx
  on public.legacy_import_batches (clinic_id, created_at desc);
create index if not exists legacy_import_batches_source_hash_idx
  on public.legacy_import_batches (clinic_id, source_sha256);
create index if not exists legacy_import_records_batch_status_idx
  on public.legacy_import_records (clinic_id, batch_id, status);
create index if not exists legacy_import_records_source_idx
  on public.legacy_import_records (clinic_id, source_table, source_key);

-- The clinic is assigned from the signed VETRA clinic token, never trusted from the browser.
drop trigger if exists legacy_import_batches_set_clinic_id on public.legacy_import_batches;
create trigger legacy_import_batches_set_clinic_id
before insert or update on public.legacy_import_batches
for each row execute function public.vetra_set_clinic_id();

drop trigger if exists legacy_import_records_set_clinic_id on public.legacy_import_records;
create trigger legacy_import_records_set_clinic_id
before insert or update on public.legacy_import_records
for each row execute function public.vetra_set_clinic_id();

alter table public.legacy_import_batches enable row level security;
alter table public.legacy_import_records enable row level security;

drop policy if exists legacy_import_batches_select_same_clinic on public.legacy_import_batches;
create policy legacy_import_batches_select_same_clinic
on public.legacy_import_batches for select
using (clinic_id = public.vetra_current_clinic_id());

drop policy if exists legacy_import_batches_insert_same_clinic on public.legacy_import_batches;
create policy legacy_import_batches_insert_same_clinic
on public.legacy_import_batches for insert
with check (clinic_id = public.vetra_current_clinic_id());

drop policy if exists legacy_import_batches_update_same_clinic on public.legacy_import_batches;
create policy legacy_import_batches_update_same_clinic
on public.legacy_import_batches for update
using (clinic_id = public.vetra_current_clinic_id())
with check (clinic_id = public.vetra_current_clinic_id());

drop policy if exists legacy_import_records_select_same_clinic on public.legacy_import_records;
create policy legacy_import_records_select_same_clinic
on public.legacy_import_records for select
using (clinic_id = public.vetra_current_clinic_id());

drop policy if exists legacy_import_records_insert_same_clinic on public.legacy_import_records;
create policy legacy_import_records_insert_same_clinic
on public.legacy_import_records for insert
with check (
  clinic_id = public.vetra_current_clinic_id()
  and exists (
    select 1 from public.legacy_import_batches b
    where b.id = legacy_import_records.batch_id
      and b.clinic_id = public.vetra_current_clinic_id()
  )
);

drop policy if exists legacy_import_records_update_same_clinic on public.legacy_import_records;
create policy legacy_import_records_update_same_clinic
on public.legacy_import_records for update
using (clinic_id = public.vetra_current_clinic_id())
with check (clinic_id = public.vetra_current_clinic_id());

-- No DELETE policy is created for the app. Audit history cannot be erased through the ordinary client.
grant select, insert, update on public.legacy_import_batches to authenticated;
grant select, insert, update on public.legacy_import_records to authenticated;

commit;

-- Verification: should return exactly the two new tracking tables and their RLS status.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('legacy_import_batches', 'legacy_import_records')
order by c.relname;


-- >>> SOURCE: C:\Users\omnia fawzy\Downloads\VETRA_LEGACY_IMPORT_SOURCE_STAGING_PHASE3.sql

-- VETRA Legacy Import — Phase 3: tenant-scoped source archive staging
-- Run ONLY in the SHARED CLINIC DATABASE, not VETRA CORE.
-- This creates a protected holding table for the ORIGINAL legacy rows as JSONB.
-- It DOES NOT write to business tables (clients/products/invoices/stock/etc).
-- Raw source rows contain potentially personal/accounting data and are only saved
-- when the clinic owner explicitly starts the staging operation in the app.

begin;

create table if not exists public.legacy_import_source_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  clinic_id uuid not null,
  source_table text not null check (length(trim(source_table)) between 1 and 255),
  source_key text not null check (length(trim(source_key)) between 1 and 500),
  source_row_number bigint not null check (source_row_number > 0),
  row_fingerprint text not null check (row_fingerprint ~ '^[0-9a-fA-F]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legacy_import_source_rows_batch_clinic_fk
    foreign key (batch_id, clinic_id)
    references public.legacy_import_batches(id, clinic_id)
    on delete cascade,
  constraint legacy_import_source_rows_batch_table_key_unique
    unique (batch_id, source_table, source_key),
  constraint legacy_import_source_rows_batch_table_row_unique
    unique (batch_id, source_table, source_row_number)
);

create index if not exists legacy_import_source_rows_clinic_batch_idx
  on public.legacy_import_source_rows (clinic_id, batch_id, source_table, source_row_number);

create index if not exists legacy_import_source_rows_fingerprint_idx
  on public.legacy_import_source_rows (clinic_id, batch_id, row_fingerprint);

drop trigger if exists legacy_import_source_rows_set_clinic_id
  on public.legacy_import_source_rows;
create trigger legacy_import_source_rows_set_clinic_id
before insert or update on public.legacy_import_source_rows
for each row execute function public.vetra_set_clinic_id();

alter table public.legacy_import_source_rows enable row level security;

-- No delete policy: source archive cannot be removed through the ordinary app client.
drop policy if exists legacy_import_source_rows_select_same_clinic
  on public.legacy_import_source_rows;
create policy legacy_import_source_rows_select_same_clinic
on public.legacy_import_source_rows for select
using (
  clinic_id = public.vetra_current_clinic_id()
  and exists (
    select 1 from public.legacy_import_batches b
    where b.id = legacy_import_source_rows.batch_id
      and b.clinic_id = public.vetra_current_clinic_id()
  )
);

drop policy if exists legacy_import_source_rows_insert_same_clinic
  on public.legacy_import_source_rows;
create policy legacy_import_source_rows_insert_same_clinic
on public.legacy_import_source_rows for insert
with check (
  clinic_id = public.vetra_current_clinic_id()
  and exists (
    select 1 from public.legacy_import_batches b
    where b.id = legacy_import_source_rows.batch_id
      and b.clinic_id = public.vetra_current_clinic_id()
  )
);

drop policy if exists legacy_import_source_rows_update_same_clinic
  on public.legacy_import_source_rows;
create policy legacy_import_source_rows_update_same_clinic
on public.legacy_import_source_rows for update
using (
  clinic_id = public.vetra_current_clinic_id()
  and exists (
    select 1 from public.legacy_import_batches b
    where b.id = legacy_import_source_rows.batch_id
      and b.clinic_id = public.vetra_current_clinic_id()
  )
)
with check (
  clinic_id = public.vetra_current_clinic_id()
  and exists (
    select 1 from public.legacy_import_batches b
    where b.id = legacy_import_source_rows.batch_id
      and b.clinic_id = public.vetra_current_clinic_id()
  )
);

grant select, insert, update on public.legacy_import_source_rows to authenticated;

commit;

-- Verification only: no source or business rows are read.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'legacy_import_source_rows';


-- Legacy import mapping table (not included in the historical phase 2/3 files).
create table if not exists public.legacy_import_id_map (
  id uuid primary key default gen_random_uuid(), batch_id uuid not null, clinic_id uuid not null,
  source_table text not null, source_key text not null,
  decision text not null default 'needs_review', mapping_status text not null default 'pending',
  target_table text, target_id uuid, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint legacy_import_id_map_batch_clinic_fk foreign key (batch_id, clinic_id)
    references public.legacy_import_batches(id, clinic_id) on delete cascade,
  unique (batch_id, source_table, source_key)
);
create index if not exists legacy_import_id_map_batch_idx
  on public.legacy_import_id_map (clinic_id, batch_id, source_table);
alter table public.legacy_import_id_map enable row level security;
drop policy if exists legacy_import_id_map_select on public.legacy_import_id_map;
create policy legacy_import_id_map_select on public.legacy_import_id_map for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists legacy_import_id_map_insert on public.legacy_import_id_map;
create policy legacy_import_id_map_insert on public.legacy_import_id_map for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists legacy_import_id_map_update on public.legacy_import_id_map;
create policy legacy_import_id_map_update on public.legacy_import_id_map for update to authenticated using (clinic_id = public.vetra_current_clinic_id()) with check (clinic_id = public.vetra_current_clinic_id());
grant select, insert, update on public.legacy_import_id_map to authenticated;
drop trigger if exists legacy_import_id_map_set_clinic_id on public.legacy_import_id_map;
create trigger legacy_import_id_map_set_clinic_id before insert or update on public.legacy_import_id_map for each row execute function public.vetra_set_clinic_id();


-- >>> SOURCE: supabase/tenant-sql/vetra_import_helpers.sql

-- Shared import parsing helpers used by the staged legacy import engine.
-- The original VETRA_TWO_PAGE_IMPORT_ENGINE.sql referenced by older installer
-- files is not present in the repository or local SQL downloads. These
-- compatible helpers cover the functions required by the current staged UI.
begin;

create or replace function public.vetra_legacy_json_text(
  p_payload jsonb,
  p_candidates text[]
) returns text
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_value text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or p_candidates is null then
    return null;
  end if;
  foreach v_key in array p_candidates loop
    if p_payload ? v_key then
      v_value := p_payload ->> v_key;
      if nullif(btrim(v_value), '') is not null then
        return btrim(v_value);
      end if;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.vetra_legacy_try_numeric(p_value text)
returns numeric
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  v text := nullif(btrim(p_value), '');
  v_comma integer;
  v_dot integer;
begin
  if v is null then return null; end if;
  v := regexp_replace(v, '[^0-9,.+ -]', '', 'g');
  v := replace(v, ' ', '');
  if v = '' or v in ('-', '+', '.', ',') then return null; end if;
  v_comma := strpos(reverse(v), ',');
  v_dot := strpos(reverse(v), '.');

  if position(',' in v) > 0 and position('.' in v) > 0 then
    if v_comma < v_dot then
      v := replace(v, '.', '');
      v := replace(v, ',', '.');
    else
      v := replace(v, ',', '');
    end if;
  elsif position(',' in v) > 0 then
    if length(v) - length(regexp_replace(v, ',', '', 'g')) = 1
       and length(v) - strpos(v, ',') in (1, 2) then
      v := replace(v, ',', '.');
    else
      v := replace(v, ',', '');
    end if;
  elsif length(v) - length(regexp_replace(v, '\.', '', 'g')) > 1 then
    v := replace(v, '.', '');
  end if;

  return v::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.vetra_legacy_try_date(p_value text)
returns date
language plpgsql
stable
parallel safe
set search_path = pg_catalog
as $$
declare
  v text := nullif(btrim(p_value), '');
  m text[];
begin
  if v is null then return null; end if;
  if v ~ '^([0-3]?[0-9])/([0-1]?[0-9])/([0-9]{4})$' then
    m := regexp_match(v, '^([0-3]?[0-9])/([0-1]?[0-9])/([0-9]{4})$');
    return make_date(m[3]::integer, m[2]::integer, m[1]::integer);
  end if;
  if v ~ '^([0-9]{4})/([0-1]?[0-9])/([0-3]?[0-9])$' then
    m := regexp_match(v, '^([0-9]{4})/([0-1]?[0-9])/([0-3]?[0-9])$');
    return make_date(m[1]::integer, m[2]::integer, m[3]::integer);
  end if;
  return v::date;
exception when others then
  return null;
end;
$$;

create or replace function public.vetra_legacy_try_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
parallel safe
set search_path = pg_catalog
as $$
declare
  v text := nullif(btrim(p_value), '');
  m text[];
begin
  if v is null then return null; end if;
  begin
    return v::timestamptz;
  exception when others then
    null;
  end;
  if v ~ '^([0-3]?[0-9])/([0-1]?[0-9])/([0-9]{4})([ T].*)?$' then
    m := regexp_match(v, '^([0-3]?[0-9])/([0-1]?[0-9])/([0-9]{4})([ T].*)?$');
    return (make_date(m[3]::integer, m[2]::integer, m[1]::integer)::timestamp
      + coalesce(nullif(btrim(m[4]), '')::time, time '00:00'))::timestamptz;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

revoke all on function public.vetra_legacy_json_text(jsonb, text[]) from public, anon;
revoke all on function public.vetra_legacy_try_numeric(text) from public, anon;
revoke all on function public.vetra_legacy_try_date(text) from public, anon;
revoke all on function public.vetra_legacy_try_timestamptz(text) from public, anon;
grant execute on function public.vetra_legacy_json_text(jsonb, text[]) to authenticated;
grant execute on function public.vetra_legacy_try_numeric(text) to authenticated;
grant execute on function public.vetra_legacy_try_date(text) to authenticated;
grant execute on function public.vetra_legacy_try_timestamptz(text) to authenticated;

commit;

-- >>> SOURCE: C:\Users\omnia fawzy\Downloads\VETRA_IMPORT_PROGRESS_ENGINE.sql

-- VETRA import progress and resumable batches
-- Run ONCE in the SHARED CLINIC DATABASE (NOT VETRA CORE).
-- Adds a staged importer so each committed step can report real progress to the UI.
-- Previous completed steps survive a later timeout; the invoice cursor is persisted.
-- No business data is imported by running this installer alone.

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.legacy_import_source_rows') IS NULL THEN
    RAISE EXCEPTION 'Missing public.legacy_import_source_rows. Run the source archive migration first.';
  END IF;
  IF to_regclass('public.legacy_import_id_map') IS NULL THEN
    RAISE EXCEPTION 'Missing public.legacy_import_id_map. Run the import tracking migration first.';
  END IF;
  IF to_regclass('public.legacy_import_batches') IS NULL THEN
    RAISE EXCEPTION 'Missing public.legacy_import_batches. Run the import tracking migration first.';
  END IF;
  IF to_regprocedure('public.vetra_legacy_json_text(jsonb,text[])') IS NULL
     OR to_regprocedure('public.vetra_legacy_try_numeric(text)') IS NULL
     OR to_regprocedure('public.vetra_legacy_try_timestamptz(text)') IS NULL
     OR to_regprocedure('public.vetra_legacy_try_date(text)') IS NULL THEN
    RAISE EXCEPTION 'Import helper functions are missing. Install VETRA_TWO_PAGE_IMPORT_ENGINE.sql first.';
  END IF;
END;
$preflight$;

-- Idempotent indexes for repeated source lookups.
CREATE INDEX IF NOT EXISTS legacy_src_sales_inv_no_expr_idx
  ON public.legacy_import_source_rows (batch_id, (public.vetra_legacy_json_text(payload, ARRAY['invoice_no','invoice_number','invoiceNo','invoiceNumber'])))
  WHERE source_table = 'SalesInvoices';
CREATE INDEX IF NOT EXISTS legacy_src_sales_detail_inv_expr_idx
  ON public.legacy_import_source_rows (batch_id, (public.vetra_legacy_json_text(payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])))
  WHERE source_table = 'SalesInvoiceDetails';
CREATE INDEX IF NOT EXISTS legacy_src_sales_detail_product_expr_idx
  ON public.legacy_import_source_rows (batch_id, (public.vetra_legacy_json_text(payload, ARRAY['prod_id','productId','product_id'])))
  WHERE source_table = 'SalesInvoiceDetails';
CREATE INDEX IF NOT EXISTS legacy_src_customer_id_expr_idx
  ON public.legacy_import_source_rows (batch_id, (public.vetra_legacy_json_text(payload, ARRAY['id','customerId','customer_id'])))
  WHERE source_table = 'Customer';
CREATE INDEX IF NOT EXISTS legacy_src_product_id_expr_idx
  ON public.legacy_import_source_rows (batch_id, (public.vetra_legacy_json_text(payload, ARRAY['id','productId','product_id'])))
  WHERE source_table = 'Product';
CREATE INDEX IF NOT EXISTS legacy_src_category_id_expr_idx
  ON public.legacy_import_source_rows (batch_id, (public.vetra_legacy_json_text(payload, ARRAY['id','categoryId','category_id'])))
  WHERE source_table = 'Category';
CREATE INDEX IF NOT EXISTS legacy_src_subcategory_id_expr_idx
  ON public.legacy_import_source_rows (batch_id, (public.vetra_legacy_json_text(payload, ARRAY['id','subcategoryId','subcategory_id'])))
  WHERE source_table = 'Subcategory';

ANALYZE public.legacy_import_source_rows;
ANALYZE public.legacy_import_id_map;

CREATE OR REPLACE FUNCTION public.vetra_import_legacy_batch_progress(
  p_batch_id uuid,
  p_phase text,
  p_after_row bigint DEFAULT 0,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
SET statement_timeout = '55s'
AS $$
DECLARE
  v_clinic_id uuid;
  v_batch public.legacy_import_batches%ROWTYPE;
  v_expected_count bigint;
  v_archive_count bigint;
  v_map_count bigint;

  v_row record;
  v_detail record;
  v_map record;

  v_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_notes text;
  v_code text;
  v_candidate_name text;
  v_base_name text;
  v_suffix integer;
  v_parent_id_text text;
  v_parent_name text;
  v_category_id uuid;
  v_target_id uuid;
  v_client_id uuid;
  v_product_id uuid;
  v_invoice_id uuid;
  v_invoice_item_id uuid;
  v_new_invoice_number bigint;
  v_original_invoice_number bigint;
  v_original_invoice_number_text text;
  v_invoice_total numeric;
  v_paid numeric;
  v_quantity numeric;
  v_price numeric;
  v_final_price numeric;
  v_last_purchase numeric;
  v_unit_source text;
  v_original_invoice_numeric numeric;
  v_selected_sum numeric;
  v_sum_price_qty numeric;
  v_sum_final_qty numeric;
  v_sum_final_plain numeric;
  v_line_count bigint;
  v_bad_quantity bigint;
  v_bad_price bigint;
  v_bad_final_price bigint;
  v_unmapped_products bigint;
  v_price_matches boolean;
  v_final_matches boolean;
  v_final_plain_matches boolean;
  v_price_mode text;
  v_date timestamptz;
  v_existing_count bigint;
  v_max_target_invoice bigint;
  v_max_source_invoice bigint;
  v_next_invoice_number bigint;
  v_existing_client_id uuid;

  v_clients_imported bigint := 0;
  v_categories_imported bigint := 0;
  v_products_imported bigint := 0;
  v_invoices_imported bigint := 0;
  v_invoice_items_imported bigint := 0;
  v_invoices_held bigint := 0;
  v_unsupported_rows bigint := 0;
  v_pending_rows bigint := 0;
  v_result jsonb;
  v_invoice_max_row bigint := 0;
  v_progress_after bigint := 0;
  v_progress_done boolean := false;
BEGIN
  IF p_phase IS NULL OR p_phase NOT IN ('categories', 'clients', 'products', 'invoices', 'finalize') THEN
    RAISE EXCEPTION 'Invalid import progress phase: %', p_phase;
  END IF;
  IF p_after_row IS NULL OR p_after_row < 0 THEN
    RAISE EXCEPTION 'Invoice cursor must be zero or greater';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Import chunk limit must be between 1 and 100';
  END IF;

  v_clinic_id := public.vetra_current_clinic_id();
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'No active VETRA clinic found in JWT';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_clinic_id::text), hashtext(p_batch_id::text));

  SELECT *
    INTO v_batch
    FROM public.legacy_import_batches b
   WHERE b.id = p_batch_id
     AND b.clinic_id = v_clinic_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import batch was not found for the active clinic';
  END IF;

  IF v_batch.status IN ('committed', 'cancelled') THEN
    RAISE EXCEPTION 'This import batch is already %', v_batch.status;
  END IF;

  IF coalesce(v_batch.summary ->> 'archiveVerified', 'false') NOT IN ('true', 'TRUE') THEN
    RAISE EXCEPTION 'The source archive has not been verified';
  END IF;

  v_expected_count := public.vetra_legacy_try_numeric(
    coalesce(v_batch.summary ->> 'sourceRowsRead', v_batch.summary ->> 'sourcePayloadRowsStored')
  )::bigint;
  IF v_expected_count IS NULL OR v_expected_count <= 0 THEN
    RAISE EXCEPTION 'The archive summary does not contain a valid source row count';
  END IF;

  SELECT count(*) INTO v_archive_count
    FROM public.legacy_import_source_rows r
   WHERE r.batch_id = p_batch_id
     AND r.clinic_id = v_clinic_id;

  IF v_archive_count <> v_expected_count THEN
    RAISE EXCEPTION 'Archive count mismatch: expected %, found %', v_expected_count, v_archive_count;
  END IF;

  SELECT count(*) INTO v_map_count
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id
     AND m.clinic_id = v_clinic_id;

  IF v_map_count <> v_archive_count THEN
    RAISE EXCEPTION 'Mapping count mismatch: archive has %, map has %', v_archive_count, v_map_count;
  END IF;

  SELECT coalesce(max(r.source_row_number), 0)
    INTO v_invoice_max_row
    FROM public.legacy_import_source_rows r
   WHERE r.batch_id = p_batch_id
     AND r.clinic_id = v_clinic_id
     AND r.source_table = 'SalesInvoices';

  IF p_phase = 'categories' THEN
  -- 1) Import top-level categories. Existing names are never merged automatically;
  --    a unique display name is generated for legacy data.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id = r.batch_id AND m.source_table = r.source_table AND m.source_key = r.source_key
     WHERE r.batch_id = p_batch_id AND r.clinic_id = v_clinic_id
       AND r.source_table = 'Category'
       AND m.mapping_status <> 'imported'
     ORDER BY r.source_row_number
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','categoryName','category_name'])), '');
    IF v_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='اسم التصنيف غير موجود؛ تم الاحتفاظ بالسجل في الأرشيف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_base_name := left(v_name, 200);
    v_candidate_name := v_base_name;
    v_suffix := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.product_categories c
       WHERE c.clinic_id = v_clinic_id AND lower(c.name) = lower(v_candidate_name)
    ) LOOP
      v_suffix := v_suffix + 1;
      v_candidate_name := left(v_base_name, 170) || ' (قديم ' || v_suffix::text || ')';
    END LOOP;

    INSERT INTO public.product_categories(name) VALUES (v_candidate_name) RETURNING id INTO v_target_id;
    UPDATE public.legacy_import_id_map
       SET target_table='product_categories', target_id=v_target_id,
           decision='create_new', mapping_status='imported', notes='تم استيراد التصنيف دون دمجه مع تصنيف موجود.', updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_categories_imported := v_categories_imported + 1;
  END LOOP;

  -- 2) Subcategories are represented as flat VETRA categories, with their parent in the label.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id = r.batch_id AND m.source_table = r.source_table AND m.source_key = r.source_key
     WHERE r.batch_id = p_batch_id AND r.clinic_id = v_clinic_id
       AND r.source_table = 'Subcategory'
       AND m.mapping_status <> 'imported'
     ORDER BY r.source_row_number
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','subcategoryName','subcategory_name'])), '');
    v_parent_id_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['catId','categoryId','category_id','parentId','parent_id']);
    v_parent_name := NULL;
    v_category_id := NULL;

    IF v_parent_id_text IS NOT NULL THEN
      SELECT c.id, c.name
        INTO v_category_id, v_parent_name
        FROM public.legacy_import_source_rows sr
        JOIN public.legacy_import_id_map sm
          ON sm.batch_id=sr.batch_id AND sm.source_table=sr.source_table AND sm.source_key=sr.source_key
        JOIN public.product_categories c ON c.id=sm.target_id AND c.clinic_id=v_clinic_id
       WHERE sr.batch_id=p_batch_id AND sr.source_table='Category'
         AND public.vetra_legacy_json_text(sr.payload, ARRAY['id','categoryId','category_id']) = v_parent_id_text
         AND sm.target_table='product_categories' AND sm.mapping_status='imported'
       LIMIT 1;
    END IF;

    IF v_name IS NULL OR v_parent_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='اسم التصنيف الفرعي أو التصنيف الأب غير واضح؛ السجل محفوظ للمراجعة.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_base_name := left(v_parent_name || ' / ' || v_name, 200);
    v_candidate_name := v_base_name;
    v_suffix := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.product_categories c
       WHERE c.clinic_id=v_clinic_id AND lower(c.name)=lower(v_candidate_name)
    ) LOOP
      v_suffix := v_suffix + 1;
      v_candidate_name := left(v_base_name, 165) || ' (قديم ' || v_suffix::text || ')';
    END LOOP;

    INSERT INTO public.product_categories(name) VALUES (v_candidate_name) RETURNING id INTO v_target_id;
    UPDATE public.legacy_import_id_map
       SET target_table='product_categories', target_id=v_target_id,
           decision='create_new', mapping_status='imported', notes='تم حفظ التصنيف الفرعي كتصنيف مستقل باسم يتضمن التصنيف الأب.', updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_categories_imported := v_categories_imported + 1;
  END LOOP;

  END IF;

  IF p_phase = 'clients' THEN
  -- 3) Clients. An exact existing name+phone is held for human review rather than merged.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id=r.batch_id AND m.source_table=r.source_table AND m.source_key=r.source_key
     WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
       AND r.source_table='Customer' AND m.mapping_status <> 'imported'
     ORDER BY r.source_row_number
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','customerName','customer_name'])), '');
    v_phone := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['phone','mobile','telephone'])), '');
    v_email := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['email','e_mail'])), '');
    v_address := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['address','customerAddress','customer_address'])), '');
    v_notes := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['notes','note','comment'])), '');
    v_code := public.vetra_legacy_json_text(v_row.payload, ARRAY['code','customerCode','customer_code']);

    IF v_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='اسم العميل فارغ؛ لم يتم إنشاء عميل غير مكتمل.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_existing_client_id := NULL;
    IF v_phone IS NOT NULL THEN
      SELECT c.id INTO v_existing_client_id
        FROM public.clients c
       WHERE c.clinic_id=v_clinic_id
         AND lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g'))
         AND regexp_replace(coalesce(c.phone,''), '\s+', '', 'g') = regexp_replace(v_phone, '\s+', '', 'g')
       LIMIT 1;
    END IF;

    IF v_existing_client_id IS NOT NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='يوجد عميل حالي بالاسم والهاتف نفسيهما؛ لم يتم الدمج أو الربط تلقائيًا.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_notes := concat_ws(E'\n', v_notes,
      'مستورد من قاعدة قديمة: ' || v_batch.source_file_name,
      CASE WHEN v_code IS NOT NULL THEN 'كود العميل الأصلي: ' || v_code ELSE NULL END,
      CASE WHEN public.vetra_legacy_json_text(v_row.payload, ARRAY['phone2','phone_2','mobile2']) IS NOT NULL
        THEN 'هاتف إضافي قديم: ' || public.vetra_legacy_json_text(v_row.payload, ARRAY['phone2','phone_2','mobile2']) ELSE NULL END);

    INSERT INTO public.clients(name, phone, email, address, notes, client_code)
    VALUES (
      v_name, v_phone, v_email, v_address, v_notes,
      'LEG-CUST-' || upper(substr(md5(v_row.source_key), 1, 16))
    ) RETURNING id INTO v_target_id;

    UPDATE public.legacy_import_id_map
       SET target_table='clients', target_id=v_target_id, decision='create_new', mapping_status='imported',
           notes='تم إنشاء عميل مستقل مع الاحتفاظ بالكود القديم في الملاحظات.', updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_clients_imported := v_clients_imported + 1;
  END LOOP;

  END IF;

  IF p_phase = 'products' THEN
  -- 4) Products. Quantity is intentionally zero until opening stock is reconciled.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id=r.batch_id AND m.source_table=r.source_table AND m.source_key=r.source_key
     WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
       AND r.source_table='Product' AND m.mapping_status <> 'imported'
     ORDER BY r.source_row_number
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','productName','product_name'])), '');
    v_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['buyPrice','buy_price','wholesale_price']));
    v_final_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['sellPrice','sell_price','retail_price']));
    v_last_purchase := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['lastBuyPrice','last_buy_price','last_purchase_price']));
    v_unit_source := public.vetra_legacy_json_text(v_row.payload, ARRAY['unit','unitName','unit_name']);
    v_notes := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['notes','note','description'])), '');
    v_code := public.vetra_legacy_json_text(v_row.payload, ARRAY['code','productCode','product_code','barcode']);
    v_category_id := NULL;
    v_parent_id_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['subcatId','subcategoryId','subcategory_id']);

    IF v_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='اسم الصنف فارغ؛ لم يتم إنشاء صنف غير معروف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;
    IF (public.vetra_legacy_json_text(v_row.payload, ARRAY['buyPrice','buy_price','wholesale_price']) IS NOT NULL AND v_price IS NULL)
       OR (public.vetra_legacy_json_text(v_row.payload, ARRAY['sellPrice','sell_price','retail_price']) IS NOT NULL AND v_final_price IS NULL)
       OR (public.vetra_legacy_json_text(v_row.payload, ARRAY['lastBuyPrice','last_buy_price','last_purchase_price']) IS NOT NULL AND v_last_purchase IS NULL)
       OR v_price < 0 OR v_final_price < 0 OR v_last_purchase < 0 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='سعر الشراء أو البيع غير صالح؛ تم ترك الصنف للأرشيف والمراجعة.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    IF v_parent_id_text IS NOT NULL THEN
      SELECT sm.target_id INTO v_category_id
        FROM public.legacy_import_source_rows sr
        JOIN public.legacy_import_id_map sm
          ON sm.batch_id=sr.batch_id AND sm.source_table=sr.source_table AND sm.source_key=sr.source_key
       WHERE sr.batch_id=p_batch_id AND sr.source_table='Subcategory'
         AND public.vetra_legacy_json_text(sr.payload, ARRAY['id','subcategoryId','subcategory_id'])=v_parent_id_text
         AND sm.target_table='product_categories' AND sm.mapping_status='imported'
       LIMIT 1;
    END IF;
    IF v_category_id IS NULL THEN
      v_parent_id_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['catId','categoryId','category_id']);
      IF v_parent_id_text IS NOT NULL THEN
        SELECT cm.target_id INTO v_category_id
          FROM public.legacy_import_source_rows sr
          JOIN public.legacy_import_id_map cm
            ON cm.batch_id=sr.batch_id AND cm.source_table=sr.source_table AND cm.source_key=sr.source_key
         WHERE sr.batch_id=p_batch_id AND sr.source_table='Category'
           AND public.vetra_legacy_json_text(sr.payload, ARRAY['id','categoryId','category_id'])=v_parent_id_text
           AND cm.target_table='product_categories' AND cm.mapping_status='imported'
         LIMIT 1;
      END IF;
    END IF;

    v_notes := concat_ws(E'\n', v_notes,
      'مستورد من قاعدة قديمة: ' || v_batch.source_file_name,
      CASE WHEN v_code IS NOT NULL THEN 'الكود الأصلي محفوظ وليس باركود VETRA: ' || v_code ELSE NULL END,
      CASE WHEN v_price IS NULL THEN 'سعر الشراء غير مسجل في المصدر؛ تم تركه صفرًا لحين المراجعة.' ELSE NULL END,
      CASE WHEN v_final_price IS NULL THEN 'سعر البيع غير مسجل في المصدر؛ تم تركه صفرًا لحين المراجعة.' ELSE NULL END,
      CASE WHEN v_last_purchase IS NULL THEN 'آخر سعر شراء غير مسجل في المصدر.' ELSE NULL END,
      CASE WHEN v_unit_source IS NOT NULL THEN 'قيمة الوحدة في المصدر: ' || v_unit_source ELSE NULL END,
      'رصيد الافتتاح لم يُنقل؛ كمية الصنف في VETRA تبدأ من صفر حتى مطابقة المخزون القديم.');

    INSERT INTO public.products(
      name, category_id, barcode, unit, quantity, wholesale_price, retail_price,
      last_purchase_price, expiry_date, reorder_level, notes
    ) VALUES (
      v_name,
      v_category_id,
      NULL,
      CASE WHEN v_unit_source IS NULL OR btrim(v_unit_source) = '' OR v_unit_source ~ '^[0-9]+$' THEN 'piece' ELSE left(v_unit_source, 100) END,
      0,
      coalesce(v_price, 0),
      coalesce(v_final_price, 0),
      coalesce(v_last_purchase, 0),
      public.vetra_legacy_try_date(public.vetra_legacy_json_text(v_row.payload, ARRAY['expDate','expiry_date','expiryDate'])),
      greatest(coalesce(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['miniQuantity','mini_quantity','reorder_level'])), 0), 0),
      v_notes
    ) RETURNING id INTO v_target_id;

    UPDATE public.legacy_import_id_map
       SET target_table='products', target_id=v_target_id, decision='create_new', mapping_status='imported',
           notes='تم إنشاء الصنف دون باركود قديم أو كمية مخزون غير مؤكدة.', updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_products_imported := v_products_imported + 1;
  END LOOP;

  END IF;

  IF p_phase = 'invoices' THEN
  -- 5) Import sales invoices only when the source number/customer/items/prices/total/payments
  --    can be interpreted without guessing. All invoice and line writes are in this transaction.
  SELECT coalesce(max(i.invoice_number), 0) INTO v_max_target_invoice
    FROM public.invoices i WHERE i.clinic_id=v_clinic_id;
  SELECT coalesce(max(
           CASE WHEN s.invoice_number_numeric > 0
                     AND s.invoice_number_numeric <= 9223372036854775807
                     AND s.invoice_number_numeric = trunc(s.invoice_number_numeric)
                THEN s.invoice_number_numeric::bigint ELSE NULL END
         ), 0)
    INTO v_max_source_invoice
    FROM (
      SELECT public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(r.payload, ARRAY['invoice_no','invoice_number','invoiceNo','invoiceNumber'])) AS invoice_number_numeric
        FROM public.legacy_import_source_rows r
       WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id AND r.source_table='SalesInvoices'
    ) s;
  v_next_invoice_number := greatest(v_max_target_invoice, v_max_source_invoice) + 1;

  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id=r.batch_id AND m.source_table=r.source_table AND m.source_key=r.source_key
     WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
       AND r.source_table='SalesInvoices' AND m.mapping_status <> 'imported'
       AND r.source_row_number > p_after_row
       AND r.source_row_number <= p_after_row + p_limit
     ORDER BY r.source_row_number
  LOOP
    v_original_invoice_number_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['invoice_no','invoice_number','invoiceNo','invoiceNumber']);
    v_invoice_total := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['total','totalAmount','total_amount','netTotal']));
    v_original_invoice_numeric := public.vetra_legacy_try_numeric(v_original_invoice_number_text);
    v_original_invoice_number := NULL;
    v_client_id := NULL;
    v_invoice_id := NULL;

    IF v_original_invoice_number_text IS NULL OR v_original_invoice_numeric IS NULL
       OR v_original_invoice_numeric <= 0
       OR v_original_invoice_numeric <> trunc(v_original_invoice_numeric)
       OR v_original_invoice_numeric > 9223372036854775807 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='رقم الفاتورة القديم ليس رقمًا صحيحًا موجبًا؛ تم الاحتفاظ بها للمراجعة.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_original_invoice_number := v_original_invoice_numeric::bigint;

    SELECT count(*) INTO v_existing_count
      FROM public.legacy_import_source_rows sr

     WHERE sr.batch_id=p_batch_id AND sr.source_table='SalesInvoices'
       AND public.vetra_legacy_json_text(sr.payload, ARRAY['invoice_no','invoice_number','invoiceNo','invoiceNumber'])=v_original_invoice_number_text;
    IF v_existing_count <> 1 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='رقم الفاتورة مكرر داخل الملف القديم؛ لا يمكن التأكد من البنود التابعة لها.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    SELECT cm.target_id INTO v_client_id
      FROM public.legacy_import_source_rows cr
      JOIN public.legacy_import_id_map cm
        ON cm.batch_id=cr.batch_id AND cm.source_table=cr.source_table AND cm.source_key=cr.source_key
     WHERE cr.batch_id=p_batch_id AND cr.source_table='Customer'
       AND public.vetra_legacy_json_text(cr.payload, ARRAY['id','customerId','customer_id']) =
           public.vetra_legacy_json_text(v_row.payload, ARRAY['cust_id','customerId','customer_id','customer_id_fk'])
       AND cm.target_table='clients' AND cm.mapping_status='imported'
     LIMIT 1;

    IF v_client_id IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='العميل المرتبط بالفاتورة لم يُنقل أو يحتاج مراجعة؛ الفاتورة محفوظة دون استيراد.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    SELECT
      count(*),
      count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty'])) IS NULL OR public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty'])) <= 0),
      count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['price','unit_price','unitPrice'])) IS NULL OR public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['price','unit_price','unitPrice'])) < 0),
      count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price'])) IS NULL OR public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price'])) < 0),
      coalesce(sum(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['price','unit_price','unitPrice'])) * public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty']))), 0),
      coalesce(sum(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price'])) * public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty']))), 0),
      coalesce(sum(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price']))), 0)
      INTO v_line_count, v_bad_quantity, v_bad_price, v_bad_final_price,
           v_sum_price_qty, v_sum_final_qty, v_sum_final_plain
      FROM public.legacy_import_source_rows d
     WHERE d.batch_id=p_batch_id AND d.clinic_id=v_clinic_id AND d.source_table='SalesInvoiceDetails'
       AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text;

    IF v_line_count = 0 OR v_bad_quantity > 0 OR (v_bad_price = v_line_count AND v_bad_final_price = v_line_count) THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='الفاتورة ليس لها بنود قابلة للاستيراد أو تحتوي كمية/سعرًا غير صالح؛ بقيت في الأرشيف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_unmapped_products
      FROM public.legacy_import_source_rows d
     WHERE d.batch_id=p_batch_id AND d.clinic_id=v_clinic_id AND d.source_table='SalesInvoiceDetails'
       AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text
       AND NOT EXISTS (
         SELECT 1
           FROM public.legacy_import_source_rows pr
           JOIN public.legacy_import_id_map pm
             ON pm.batch_id=pr.batch_id AND pm.source_table=pr.source_table AND pm.source_key=pr.source_key
          WHERE pr.batch_id=p_batch_id AND pr.source_table='Product'
            AND public.vetra_legacy_json_text(pr.payload, ARRAY['id','productId','product_id']) =
                public.vetra_legacy_json_text(d.payload, ARRAY['prod_id','productId','product_id'])
            AND pm.target_table='products' AND pm.mapping_status='imported'
       );
    IF v_unmapped_products > 0 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='بعض أصناف الفاتورة لم تُنقل أو تحتاج مراجعة؛ الفاتورة وبنودها بقيت بالأرشيف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_price_matches := v_bad_price = 0 AND abs(v_sum_price_qty - coalesce(v_invoice_total, -999999999)) <= 0.03;
    v_final_matches := v_bad_final_price = 0 AND abs(v_sum_final_qty - coalesce(v_invoice_total, -999999999)) <= 0.03;
    v_final_plain_matches := v_bad_final_price = 0 AND
      (SELECT count(*) = count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty'])) = 1)
         FROM public.legacy_import_source_rows d
        WHERE d.batch_id=p_batch_id AND d.source_table='SalesInvoiceDetails'
          AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text)
      AND abs(v_sum_final_plain - coalesce(v_invoice_total, -999999999)) <= 0.03;

    v_price_mode := NULL;
    IF v_invoice_total IS NOT NULL THEN
      IF v_price_matches AND (NOT v_final_matches OR abs(v_sum_price_qty - v_sum_final_qty) <= 0.03) THEN
        v_price_mode := 'price';
        v_selected_sum := v_sum_price_qty;
      ELSIF v_final_matches AND NOT v_price_matches THEN
        v_price_mode := 'final_price';
        v_selected_sum := v_sum_final_qty;
      ELSIF v_final_plain_matches AND NOT v_price_matches AND NOT v_final_matches THEN
        v_price_mode := 'final_price';
        v_selected_sum := v_sum_final_plain;
      END IF;
    END IF;

    IF v_price_mode IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='إجمالي رأس الفاتورة لا يتطابق بشكل واضح مع أسعار البنود والكميات؛ لم يتم تعديل أي مبلغ.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_paid := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['paid','paidAmount','paid_amount']));
    IF v_paid IS NULL OR v_paid < 0 OR v_paid > v_invoice_total
       OR (v_paid = 1 AND v_invoice_total > 1) THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='قيمة المدفوع غير واضحة أو لا تتفق مع إجمالي الفاتورة؛ لم يتم تخمين حالة السداد.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_date := public.vetra_legacy_try_timestamptz(public.vetra_legacy_json_text(v_row.payload, ARRAY['date','invoiceDate','invoice_date','created_at']));
    v_notes := public.vetra_legacy_json_text(v_row.payload, ARRAY['notes','note','comment']);
    v_notes := concat_ws(E'\n', nullif(btrim(v_notes), ''),
      'مستورد من قاعدة قديمة: ' || v_batch.source_file_name,
      'رقم الفاتورة الأصلي: ' || v_original_invoice_number::text,
      'قيمة الإجمالي الأصلية: ' || v_invoice_total::text,
      CASE WHEN abs(v_selected_sum - v_invoice_total) > 0 THEN 'فرق تقريب بين مجموع البنود ورأس الفاتورة: ' || (v_invoice_total - v_selected_sum)::text ELSE NULL END);

    v_new_invoice_number := v_original_invoice_number;
    IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.clinic_id=v_clinic_id AND i.invoice_number=v_original_invoice_number) THEN
      LOOP
        WHILE EXISTS (SELECT 1 FROM public.invoices i WHERE i.clinic_id=v_clinic_id AND i.invoice_number=v_next_invoice_number) LOOP
          v_next_invoice_number := v_next_invoice_number + 1;
        END LOOP;
        v_new_invoice_number := v_next_invoice_number;
        v_next_invoice_number := v_next_invoice_number + 1;
        EXIT;
      END LOOP;
    END IF;

    INSERT INTO public.invoices(
      invoice_number, client_id, status, payment_method, subtotal, discount,
      total, paid_amount, notes, issued_at, created_by, updated_by
    ) VALUES (
      v_new_invoice_number, v_client_id,
      CASE WHEN v_paid = v_invoice_total THEN 'paid'
           WHEN v_paid > 0 THEN 'partially_paid' ELSE 'unpaid' END,
      NULL,
      v_selected_sum,
      0,
      v_invoice_total,
      v_paid,
      v_notes,
      v_date,
      auth.uid(),
      auth.uid()
    ) RETURNING id INTO v_invoice_id;

    UPDATE public.legacy_import_id_map
       SET target_table='invoices', target_id=v_invoice_id, decision='create_new', mapping_status='imported',
           notes=CASE WHEN v_new_invoice_number <> v_original_invoice_number
             THEN 'تم نقل الفاتورة برقم جديد لتفادي التعارض؛ الرقم الأصلي محفوظ في ملاحظات الفاتورة.'
             ELSE 'تم نقل الفاتورة بعد التحقق من إجمالي البنود.' END,
           updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;

    FOR v_detail IN
      SELECT d.*
        FROM public.legacy_import_source_rows d
       WHERE d.batch_id=p_batch_id AND d.clinic_id=v_clinic_id AND d.source_table='SalesInvoiceDetails'
         AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text
       ORDER BY d.source_row_number
    LOOP
      SELECT pm.target_id INTO v_product_id
        FROM public.legacy_import_source_rows pr
        JOIN public.legacy_import_id_map pm
          ON pm.batch_id=pr.batch_id AND pm.source_table=pr.source_table AND pm.source_key=pr.source_key
       WHERE pr.batch_id=p_batch_id AND pr.source_table='Product'
         AND public.vetra_legacy_json_text(pr.payload, ARRAY['id','productId','product_id']) =
             public.vetra_legacy_json_text(v_detail.payload, ARRAY['prod_id','productId','product_id'])
         AND pm.target_table='products' AND pm.mapping_status='imported'
       LIMIT 1;

      v_quantity := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_detail.payload, ARRAY['quantity','qty']));
      IF v_price_mode = 'price' THEN
        v_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_detail.payload, ARRAY['price','unit_price','unitPrice']));
      ELSE
        v_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_detail.payload, ARRAY['final_price','finalPrice','final_unit_price']));
      END IF;
      v_notes := public.vetra_legacy_json_text(v_detail.payload, ARRAY['prod_name','productName','product_name','description']);
      v_code := public.vetra_legacy_json_text(v_detail.payload, ARRAY['price','unit_price','unitPrice']);
      v_notes := concat_ws(E'\n', nullif(btrim(v_notes), ''),
        'سعر الوحدة الأصلي: ' || coalesce(v_code, 'غير مسجل'),
        'تم الاحتفاظ بوصف الصنف من الفاتورة القديمة.');

      INSERT INTO public.invoice_items(
        invoice_id, item_type, product_id, service_name, description,
        quantity, unit_price, discount, total
      ) VALUES (
        v_invoice_id, 'product', v_product_id, NULL, v_notes,
        v_quantity, v_price, 0, v_quantity * v_price
      ) RETURNING id INTO v_invoice_item_id;

      UPDATE public.legacy_import_id_map
         SET target_table='invoice_items', target_id=v_invoice_item_id,
             decision='create_new', mapping_status='imported', notes='تم نقل بند الفاتورة مع الاحتفاظ بوصف المصدر.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table='SalesInvoiceDetails' AND source_key=v_detail.source_key;
      v_invoice_items_imported := v_invoice_items_imported + 1;
    END LOOP;

    v_invoices_imported := v_invoices_imported + 1;
  END LOOP;

  END IF;

  IF p_phase <> 'finalize' THEN
    IF p_phase = 'invoices' THEN
      v_progress_after := least(p_after_row + p_limit, v_invoice_max_row);
      v_progress_done := v_progress_after >= v_invoice_max_row;
    ELSE
      v_progress_after := 0;
      v_progress_done := true;
    END IF;

    UPDATE public.legacy_import_batches
       SET summary = coalesce(summary, '{}'::jsonb) || jsonb_build_object(
         'lastImportProgress', jsonb_build_object(
           'phase', p_phase,
           'afterRow', v_progress_after,
           'limit', p_limit,
           'phaseDone', v_progress_done,
           'updatedAt', now()
         )
       ),
           updated_at = now()
     WHERE id = p_batch_id AND clinic_id = v_clinic_id;

    RETURN jsonb_build_object(
      'phase', p_phase,
      'afterRow', v_progress_after,
      'phaseDone', v_progress_done,
      'invoiceRowsTotal', v_invoice_max_row,
      'committedAt', now()
    );
  END IF;

  -- Final totals are recomputed from the durable mapping table, not per-call variables.
  SELECT count(*) INTO v_categories_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'product_categories' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_clients_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'clients' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_products_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'products' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_invoices_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'invoices' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_invoice_items_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'invoice_items' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_invoices_held
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.source_table = 'SalesInvoices'
     AND m.mapping_status <> 'imported'
     AND m.decision = 'needs_review';

  SELECT count(*) INTO v_unsupported_rows
    FROM public.legacy_import_source_rows r
   WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
     AND r.source_table NOT IN ('Customer','Category','Subcategory','Product','SalesInvoices','SalesInvoiceDetails');

  SELECT count(*) INTO v_pending_rows
    FROM public.legacy_import_id_map m
   WHERE m.batch_id=p_batch_id AND m.clinic_id=v_clinic_id
     AND m.mapping_status <> 'imported';

  v_result := jsonb_build_object(
    'batchId', p_batch_id,
    'clientsImported', v_clients_imported,
    'categoriesImported', v_categories_imported,
    'productsImported', v_products_imported,
    'invoicesImported', v_invoices_imported,
    'invoiceItemsImported', v_invoice_items_imported,
    'invoicesHeldForReview', v_invoices_held,
    'unsupportedRowsPreserved', v_unsupported_rows,
    'pendingRows', v_pending_rows,
    'archiveRowsVerified', v_archive_count,
    'mappingRowsVerified', v_map_count,
    'businessTablesModified', (v_clients_imported + v_categories_imported + v_products_imported + v_invoices_imported + v_invoice_items_imported) > 0,
    'completedAt', now()
  );

  UPDATE public.legacy_import_batches
     SET status='needs_review',
         summary=coalesce(summary, '{}'::jsonb) || jsonb_build_object(
           'lastImportRun', v_result,
           'lastImportRunAt', now(),
         'lastImportProgress', jsonb_build_object('phase', 'complete', 'afterRow', v_invoice_max_row, 'phaseDone', true, 'updatedAt', now()),
           'businessDataWritten', (coalesce((summary ->> 'businessDataWritten')::boolean, false) OR (v_clients_imported + v_categories_imported + v_products_imported + v_invoices_imported + v_invoice_items_imported) > 0)
         ),
         updated_at=now()
   WHERE id=p_batch_id AND clinic_id=v_clinic_id;

  RETURN v_result;
END;
$$;


REVOKE ALL ON FUNCTION public.vetra_import_legacy_batch_progress(uuid, text, bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vetra_import_legacy_batch_progress(uuid, text, bigint, integer) TO authenticated;

COMMIT;

-- Ask PostgREST to reload its function schema cache after installing the new RPC.
NOTIFY pgrst, 'reload schema';

-- Verification: the staged RPC should be executable by authenticated users.
SELECT
  p.oid::regprocedure AS function_name,
  p.proconfig,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'vetra_import_legacy_batch_progress';


-- >>> SOURCE: supabase/tenant-sql/vetra_import_legacy_batch_progress_invoice_lock.sql

CREATE OR REPLACE FUNCTION public.vetra_import_legacy_batch_progress(p_batch_id uuid, p_phase text, p_after_row bigint DEFAULT 0, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '55s'
AS $function$
DECLARE
  v_clinic_id uuid;
  v_batch public.legacy_import_batches%ROWTYPE;
  v_expected_count bigint;
  v_archive_count bigint;
  v_map_count bigint;

  v_row record;
  v_detail record;
  v_map record;

  v_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_notes text;
  v_code text;
  v_candidate_name text;
  v_base_name text;
  v_suffix integer;
  v_parent_id_text text;
  v_parent_name text;
  v_category_id uuid;
  v_target_id uuid;
  v_client_id uuid;
  v_product_id uuid;
  v_invoice_id uuid;
  v_invoice_item_id uuid;
  v_new_invoice_number bigint;
  v_original_invoice_number bigint;
  v_original_invoice_number_text text;
  v_invoice_total numeric;
  v_paid numeric;
  v_quantity numeric;
  v_price numeric;
  v_final_price numeric;
  v_last_purchase numeric;
  v_stock numeric;
  v_stock_row_count bigint;
  v_stock_value_count bigint;
  v_stock_raw text;
  v_product_id_text text;
  v_stock_source text;
  v_prior_target_id uuid;
  v_prior_stock numeric;
  v_prior_batch_id uuid;
  v_prior_detail_id uuid;
  v_unit_source text;
  v_original_invoice_numeric numeric;
  v_selected_sum numeric;
  v_sum_price_qty numeric;
  v_sum_final_qty numeric;
  v_sum_final_plain numeric;
  v_line_count bigint;
  v_bad_quantity bigint;
  v_bad_price bigint;
  v_bad_final_price bigint;
  v_unmapped_products bigint;
  v_price_matches boolean;
  v_final_matches boolean;
  v_final_plain_matches boolean;
  v_price_mode text;
  v_date timestamptz;
  v_existing_count bigint;
  v_max_target_invoice bigint;
  v_max_source_invoice bigint;
  v_next_invoice_number bigint;
  v_invoice_insert_attempts integer := 0;
  v_max_conflicting_invoice bigint;
  v_existing_client_id uuid;

  v_clients_imported bigint := 0;
  v_categories_imported bigint := 0;
  v_products_imported bigint := 0;
  v_invoices_imported bigint := 0;
  v_invoice_items_imported bigint := 0;
  v_invoices_held bigint := 0;
  v_unsupported_rows bigint := 0;
  v_pending_rows bigint := 0;
  v_result jsonb;
  v_invoice_max_row bigint := 0;
  v_progress_after bigint := 0;
  v_progress_done boolean := false;
  v_phase_remaining bigint := 0;
  v_sequence_name text;
  v_sequence_max bigint;
BEGIN
  IF p_phase IS NULL OR p_phase NOT IN ('categories', 'clients', 'products', 'invoices', 'finalize') THEN
    RAISE EXCEPTION 'Invalid import progress phase: %', p_phase;
  END IF;
  IF p_after_row IS NULL OR p_after_row < 0 THEN
    RAISE EXCEPTION 'Invoice cursor must be zero or greater';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Import chunk limit must be between 1 and 100';
  END IF;

  v_clinic_id := public.vetra_current_clinic_id();
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'No active VETRA clinic found in JWT';
  END IF;

  -- Serialize invoice-number selection across every import batch for this clinic.
  PERFORM pg_advisory_xact_lock(hashtext(v_clinic_id::text), hashtext('vetra_import_legacy_batch_invoice_numbers'));
  -- Serialize matching/upserts across batches so two imports of the same source cannot create duplicate targets concurrently.
  PERFORM pg_advisory_xact_lock(hashtext(v_clinic_id::text), hashtext('vetra_import_legacy_batch_source_sync'));

  SELECT *
    INTO v_batch
    FROM public.legacy_import_batches b
   WHERE b.id = p_batch_id
     AND b.clinic_id = v_clinic_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import batch was not found for the active clinic';
  END IF;

  IF v_batch.status IN ('committed', 'cancelled') THEN
    RAISE EXCEPTION 'This import batch is already %', v_batch.status;
  END IF;

  IF coalesce(v_batch.summary ->> 'archiveVerified', 'false') NOT IN ('true', 'TRUE') THEN
    RAISE EXCEPTION 'The source archive has not been verified';
  END IF;

  v_expected_count := public.vetra_legacy_try_numeric(
    coalesce(v_batch.summary ->> 'sourceRowsRead', v_batch.summary ->> 'sourcePayloadRowsStored')
  )::bigint;
  IF v_expected_count IS NULL OR v_expected_count <= 0 THEN
    RAISE EXCEPTION 'The archive summary does not contain a valid source row count';
  END IF;

  SELECT count(*) INTO v_archive_count
    FROM public.legacy_import_source_rows r
   WHERE r.batch_id = p_batch_id
     AND r.clinic_id = v_clinic_id;

  IF v_archive_count <> v_expected_count THEN
    RAISE EXCEPTION 'Archive count mismatch: expected %, found %', v_expected_count, v_archive_count;
  END IF;

  SELECT count(*) INTO v_map_count
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id
     AND m.clinic_id = v_clinic_id;

  IF v_map_count <> v_archive_count THEN
    RAISE EXCEPTION 'Mapping count mismatch: archive has %, map has %', v_archive_count, v_map_count;
  END IF;

  SELECT coalesce(max(r.source_row_number), 0)
    INTO v_invoice_max_row
    FROM public.legacy_import_source_rows r
   WHERE r.batch_id = p_batch_id
     AND r.clinic_id = v_clinic_id
     AND r.source_table = 'SalesInvoices';

  IF p_phase = 'categories' THEN
  -- 1) Import top-level categories. Existing names are never merged automatically;
  --    a unique display name is generated for legacy data.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id = r.batch_id AND m.source_table = r.source_table AND m.source_key = r.source_key
     WHERE r.batch_id = p_batch_id AND r.clinic_id = v_clinic_id
       AND r.source_table = 'Category'
       AND m.mapping_status = 'pending'
     ORDER BY r.source_row_number
     LIMIT p_limit
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','categoryName','category_name'])), '');
    IF v_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='اسم التصنيف غير موجود؛ تم الاحتفاظ بالسجل في الأرشيف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_base_name := left(v_name, 200);
    v_candidate_name := v_base_name;
    SELECT pm.target_id INTO v_prior_target_id
      FROM public.legacy_import_source_rows old_row
      JOIN public.legacy_import_batches old_batch ON old_batch.id=old_row.batch_id AND old_batch.clinic_id=old_row.clinic_id
      JOIN public.legacy_import_id_map pm ON pm.batch_id=old_row.batch_id AND pm.source_table=old_row.source_table AND pm.source_key=old_row.source_key
      JOIN public.product_categories old_category ON old_category.id=pm.target_id AND old_category.clinic_id=v_clinic_id
     WHERE old_row.clinic_id=v_clinic_id AND old_row.batch_id<>p_batch_id
       AND old_batch.source_file_name=v_batch.source_file_name
       AND old_row.source_table=v_row.source_table AND old_row.source_key=v_row.source_key
       AND old_row.source_key NOT LIKE 'row:%'
       AND pm.target_table='product_categories' AND pm.mapping_status='imported'
     ORDER BY old_batch.created_at DESC LIMIT 1;
    IF v_prior_target_id IS NOT NULL THEN
      UPDATE public.product_categories SET name=v_candidate_name WHERE id=v_prior_target_id AND clinic_id=v_clinic_id;
      v_target_id := v_prior_target_id;
    ELSE
    v_suffix := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.product_categories c
       WHERE c.clinic_id = v_clinic_id AND lower(c.name) = lower(v_candidate_name)
    ) LOOP
      v_suffix := v_suffix + 1;
      v_candidate_name := left(v_base_name, 170) || ' (قديم ' || v_suffix::text || ')';
    END LOOP;

    INSERT INTO public.product_categories(name) VALUES (v_candidate_name) RETURNING id INTO v_target_id;
    END IF;
    UPDATE public.legacy_import_id_map
       SET target_table='product_categories', target_id=v_target_id,
           decision=CASE WHEN v_prior_target_id IS NULL THEN 'create_new' ELSE 'reuse_existing' END,
           mapping_status='imported', notes=CASE WHEN v_prior_target_id IS NULL THEN 'تم استيراد التصنيف.' ELSE 'تم تحديث التصنيف المطابق من الاستيراد السابق.' END, updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_categories_imported := v_categories_imported + 1;
  END LOOP;

  -- 2) Subcategories are represented as flat VETRA categories, with their parent in the label.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id = r.batch_id AND m.source_table = r.source_table AND m.source_key = r.source_key
     WHERE r.batch_id = p_batch_id AND r.clinic_id = v_clinic_id
       AND r.source_table = 'Subcategory'
       AND m.mapping_status = 'pending'
     ORDER BY r.source_row_number
     LIMIT p_limit
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','subcategoryName','subcategory_name'])), '');
    v_parent_id_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['catId','categoryId','category_id','parentId','parent_id']);
    v_parent_name := NULL;
    v_category_id := NULL;

    IF v_parent_id_text IS NOT NULL THEN
      SELECT c.id, c.name
        INTO v_category_id, v_parent_name
        FROM public.legacy_import_source_rows sr
        JOIN public.legacy_import_id_map sm
          ON sm.batch_id=sr.batch_id AND sm.source_table=sr.source_table AND sm.source_key=sr.source_key
        JOIN public.product_categories c ON c.id=sm.target_id AND c.clinic_id=v_clinic_id
       WHERE sr.batch_id=p_batch_id AND sr.source_table='Category'
         AND public.vetra_legacy_json_text(sr.payload, ARRAY['id','categoryId','category_id']) = v_parent_id_text
         AND sm.target_table='product_categories' AND sm.mapping_status='imported'
       LIMIT 1;
    END IF;

    IF v_name IS NULL OR v_parent_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='اسم التصنيف الفرعي أو التصنيف الأب غير واضح؛ السجل محفوظ للمراجعة.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_base_name := left(v_parent_name || ' / ' || v_name, 200);
    v_candidate_name := v_base_name;
    SELECT pm.target_id INTO v_prior_target_id
      FROM public.legacy_import_source_rows old_row
      JOIN public.legacy_import_batches old_batch ON old_batch.id=old_row.batch_id AND old_batch.clinic_id=old_row.clinic_id
      JOIN public.legacy_import_id_map pm ON pm.batch_id=old_row.batch_id AND pm.source_table=old_row.source_table AND pm.source_key=old_row.source_key
      JOIN public.product_categories old_category ON old_category.id=pm.target_id AND old_category.clinic_id=v_clinic_id
     WHERE old_row.clinic_id=v_clinic_id AND old_row.batch_id<>p_batch_id
       AND old_batch.source_file_name=v_batch.source_file_name
       AND old_row.source_table=v_row.source_table AND old_row.source_key=v_row.source_key
       AND old_row.source_key NOT LIKE 'row:%'
       AND pm.target_table='product_categories' AND pm.mapping_status='imported'
     ORDER BY old_batch.created_at DESC LIMIT 1;
    IF v_prior_target_id IS NOT NULL THEN
      UPDATE public.product_categories SET name=v_candidate_name WHERE id=v_prior_target_id AND clinic_id=v_clinic_id;
      v_target_id := v_prior_target_id;
    ELSE
    v_suffix := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.product_categories c
       WHERE c.clinic_id=v_clinic_id AND lower(c.name)=lower(v_candidate_name)
    ) LOOP
      v_suffix := v_suffix + 1;
      v_candidate_name := left(v_base_name, 165) || ' (قديم ' || v_suffix::text || ')';
    END LOOP;

    INSERT INTO public.product_categories(name) VALUES (v_candidate_name) RETURNING id INTO v_target_id;
    END IF;
    UPDATE public.legacy_import_id_map
       SET target_table='product_categories', target_id=v_target_id,
           decision=CASE WHEN v_prior_target_id IS NULL THEN 'create_new' ELSE 'reuse_existing' END,
           mapping_status='imported', notes=CASE WHEN v_prior_target_id IS NULL THEN 'تم حفظ التصنيف الفرعي.' ELSE 'تم تحديث التصنيف الفرعي المطابق من الاستيراد السابق.' END, updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_categories_imported := v_categories_imported + 1;
  END LOOP;

  END IF;

  IF p_phase = 'clients' THEN
  -- 3) Clients. An exact existing name+phone is held for human review rather than merged.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id=r.batch_id AND m.source_table=r.source_table AND m.source_key=r.source_key
     WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
       AND r.source_table='Customer' AND m.mapping_status = 'pending'
     ORDER BY r.source_row_number
     LIMIT p_limit
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','customerName','customer_name'])), '');
    v_phone := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['phone','mobile','telephone'])), '');
    v_email := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['email','e_mail'])), '');
    v_address := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['address','customerAddress','customer_address'])), '');
    v_notes := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['notes','note','comment'])), '');
    v_code := public.vetra_legacy_json_text(v_row.payload, ARRAY['code','customerCode','customer_code']);

    IF v_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='اسم العميل فارغ؛ لم يتم إنشاء عميل غير مكتمل.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_existing_client_id := NULL;
    v_prior_target_id := NULL;
    SELECT pm.target_id INTO v_prior_target_id
      FROM public.legacy_import_source_rows old_row
      JOIN public.legacy_import_batches old_batch ON old_batch.id=old_row.batch_id AND old_batch.clinic_id=old_row.clinic_id
      JOIN public.legacy_import_id_map pm ON pm.batch_id=old_row.batch_id AND pm.source_table=old_row.source_table AND pm.source_key=old_row.source_key
      JOIN public.clients old_client ON old_client.id=pm.target_id AND old_client.clinic_id=v_clinic_id
     WHERE old_row.clinic_id=v_clinic_id AND old_row.batch_id<>p_batch_id
       AND old_batch.source_file_name=v_batch.source_file_name
       AND old_row.source_table=v_row.source_table AND old_row.source_key=v_row.source_key
       AND old_row.source_key NOT LIKE 'row:%'
       AND pm.target_table='clients' AND pm.mapping_status='imported'
     ORDER BY old_batch.created_at DESC LIMIT 1;
    IF v_phone IS NOT NULL AND v_prior_target_id IS NULL THEN
      SELECT c.id INTO v_existing_client_id
        FROM public.clients c
       WHERE c.clinic_id=v_clinic_id
         AND lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g'))
         AND regexp_replace(coalesce(c.phone,''), '\s+', '', 'g') = regexp_replace(v_phone, '\s+', '', 'g')
       LIMIT 1;
    END IF;

    IF v_existing_client_id IS NOT NULL AND v_prior_target_id IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='يوجد عميل حالي بالاسم والهاتف نفسيهما؛ لم يتم الدمج أو الربط تلقائيًا.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_notes := concat_ws(E'\n', v_notes,
      'مستورد من قاعدة قديمة: ' || v_batch.source_file_name,
      CASE WHEN v_code IS NOT NULL THEN 'كود العميل الأصلي: ' || v_code ELSE NULL END,
      CASE WHEN public.vetra_legacy_json_text(v_row.payload, ARRAY['phone2','phone_2','mobile2']) IS NOT NULL
        THEN 'هاتف إضافي قديم: ' || public.vetra_legacy_json_text(v_row.payload, ARRAY['phone2','phone_2','mobile2']) ELSE NULL END);

    IF v_prior_target_id IS NOT NULL THEN
      UPDATE public.clients SET name=v_name, phone=v_phone, email=v_email, address=v_address, notes=v_notes
       WHERE id=v_prior_target_id AND clinic_id=v_clinic_id;
      v_target_id := v_prior_target_id;
    ELSE
      INSERT INTO public.clients(name, phone, email, address, notes, client_code)
      VALUES (v_name, v_phone, v_email, v_address, v_notes,
        'LEG-CUST-' || upper(substr(md5(v_row.source_key), 1, 16))) RETURNING id INTO v_target_id;
    END IF;

    UPDATE public.legacy_import_id_map
       SET target_table='clients', target_id=v_target_id,
           decision=CASE WHEN v_prior_target_id IS NULL THEN 'create_new' ELSE 'reuse_existing' END, mapping_status='imported',
           notes=CASE WHEN v_prior_target_id IS NULL THEN 'تم إنشاء عميل مستقل مع الاحتفاظ بالكود القديم في الملاحظات.' ELSE 'تم تحديث العميل المطابق من الاستيراد السابق.' END, updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_clients_imported := v_clients_imported + 1;
  END LOOP;

  END IF;

  IF p_phase = 'products' THEN
  -- 4) Products. Import the current source balance as opening stock when available.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id=r.batch_id AND m.source_table=r.source_table AND m.source_key=r.source_key
     WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
       AND r.source_table='Product' AND m.mapping_status = 'pending'
     ORDER BY r.source_row_number
     LIMIT p_limit
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','productName','product_name'])), '');
    v_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['buyPrice','buy_price','wholesale_price']));
    v_final_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['sellPrice','sell_price','retail_price']));
    v_last_purchase := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['lastBuyPrice','last_buy_price','last_purchase_price']));
    v_stock := NULL;
    v_stock_source := NULL;
    v_product_id_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['id','productId','product_id']);
    v_unit_source := public.vetra_legacy_json_text(v_row.payload, ARRAY['unit','unitName','unit_name']);
    v_notes := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['notes','note','description'])), '');
    v_code := public.vetra_legacy_json_text(v_row.payload, ARRAY['code','productCode','product_code','barcode']);
    v_category_id := NULL;
    v_parent_id_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['subcatId','subcategoryId','subcategory_id']);

    IF v_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='اسم الصنف فارغ؛ لم يتم إنشاء صنف غير معروف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;
    IF (public.vetra_legacy_json_text(v_row.payload, ARRAY['buyPrice','buy_price','wholesale_price']) IS NOT NULL AND v_price IS NULL)
       OR (public.vetra_legacy_json_text(v_row.payload, ARRAY['sellPrice','sell_price','retail_price']) IS NOT NULL AND v_final_price IS NULL)
       OR (public.vetra_legacy_json_text(v_row.payload, ARRAY['lastBuyPrice','last_buy_price','last_purchase_price']) IS NOT NULL AND v_last_purchase IS NULL)
       OR v_price < 0 OR v_final_price < 0 OR v_last_purchase < 0 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='سعر الشراء أو البيع غير صالح؛ تم ترك الصنف للأرشيف والمراجعة.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    -- Temp_stock is the source system's dedicated current-balance table. Only
    -- use it when there is one unambiguous row for this product.
    v_stock_row_count := 0;
    v_stock_value_count := 0;
    v_stock_raw := NULL;
    IF v_product_id_text IS NOT NULL THEN
      SELECT count(*),
             count(public.vetra_legacy_json_text(sr.payload, ARRAY['quantity','currentQuantity','current_quantity','stock','qty'])),
             min(public.vetra_legacy_json_text(sr.payload, ARRAY['quantity','currentQuantity','current_quantity','stock','qty']))
        INTO v_stock_row_count, v_stock_value_count, v_stock_raw
        FROM public.legacy_import_source_rows sr
       WHERE sr.batch_id = p_batch_id
         AND sr.clinic_id = v_clinic_id
         AND sr.source_table = 'Temp_stock'
         AND public.vetra_legacy_json_text(sr.payload, ARRAY['prod_id','productId','product_id']) = v_product_id_text;
    END IF;

    IF v_stock_row_count > 1 THEN
      UPDATE public.legacy_import_id_map
         SET decision='needs_review', mapping_status='held',
             notes='للصنف أكثر من صف رصيد في Temp_stock؛ بقي الصنف ورصيده بالأرشيف حتى لا يتم جمع أو تخمين المخزون.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    IF v_stock_row_count = 1 THEN
      IF v_stock_value_count = 0 THEN
        UPDATE public.legacy_import_id_map
           SET decision='needs_review', mapping_status='held',
               notes='صف Temp_stock المرتبط بالصنف لا يحتوي كمية حالية واضحة؛ بقي الصنف بالأرشيف للمراجعة.', updated_at=now()
         WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
        CONTINUE;
      END IF;
      v_stock := public.vetra_legacy_try_numeric(v_stock_raw);
      IF v_stock IS NULL OR v_stock < 0 THEN
        UPDATE public.legacy_import_id_map
           SET decision='needs_review', mapping_status='held',
               notes='كمية Temp_stock غير رقمية أو سالبة؛ بقي الصنف بالأرشيف للمراجعة.', updated_at=now()
         WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
        CONTINUE;
      END IF;
      v_stock_source := 'Temp_stock';
    ELSE
      v_stock_raw := public.vetra_legacy_json_text(v_row.payload, ARRAY['quantity','currentQuantity','current_quantity','stock','qty','available_quantity']);
      IF v_stock_raw IS NOT NULL THEN
        v_stock := public.vetra_legacy_try_numeric(v_stock_raw);
        IF v_stock IS NULL OR v_stock < 0 THEN
          UPDATE public.legacy_import_id_map
             SET decision='needs_review', mapping_status='held',
                 notes='كمية الصنف المسجلة في Product غير صالحة؛ بقي الصنف بالأرشيف للمراجعة.', updated_at=now()
           WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
          CONTINUE;
        END IF;
        v_stock_source := 'Product';
      ELSE
        v_stock := 0;
      END IF;
    END IF;

    IF v_parent_id_text IS NOT NULL THEN
      SELECT sm.target_id INTO v_category_id
        FROM public.legacy_import_source_rows sr
        JOIN public.legacy_import_id_map sm
          ON sm.batch_id=sr.batch_id AND sm.source_table=sr.source_table AND sm.source_key=sr.source_key
       WHERE sr.batch_id=p_batch_id AND sr.source_table='Subcategory'
         AND public.vetra_legacy_json_text(sr.payload, ARRAY['id','subcategoryId','subcategory_id'])=v_parent_id_text
         AND sm.target_table='product_categories' AND sm.mapping_status='imported'
       LIMIT 1;
    END IF;
    IF v_category_id IS NULL THEN
      v_parent_id_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['catId','categoryId','category_id']);
      IF v_parent_id_text IS NOT NULL THEN
        SELECT cm.target_id INTO v_category_id
          FROM public.legacy_import_source_rows sr
          JOIN public.legacy_import_id_map cm
            ON cm.batch_id=sr.batch_id AND cm.source_table=sr.source_table AND cm.source_key=sr.source_key
         WHERE sr.batch_id=p_batch_id AND sr.source_table='Category'
           AND public.vetra_legacy_json_text(sr.payload, ARRAY['id','categoryId','category_id'])=v_parent_id_text
           AND cm.target_table='product_categories' AND cm.mapping_status='imported'
         LIMIT 1;
      END IF;
    END IF;

    v_notes := concat_ws(E'\n', v_notes,
      'مستورد من قاعدة قديمة: ' || v_batch.source_file_name,
      CASE WHEN v_code IS NOT NULL THEN 'الكود الأصلي محفوظ وليس باركود VETRA: ' || v_code ELSE NULL END,
      CASE WHEN v_price IS NULL THEN 'سعر الشراء غير مسجل في المصدر؛ تم تركه صفرًا لحين المراجعة.' ELSE NULL END,
      CASE WHEN v_final_price IS NULL THEN 'سعر البيع غير مسجل في المصدر؛ تم تركه صفرًا لحين المراجعة.' ELSE NULL END,
      CASE WHEN v_last_purchase IS NULL THEN 'آخر سعر شراء غير مسجل في المصدر.' ELSE NULL END,
      CASE WHEN v_unit_source IS NOT NULL THEN 'قيمة الوحدة في المصدر: ' || v_unit_source ELSE NULL END,
      CASE WHEN v_stock_source IS NOT NULL THEN 'تم نقل الرصيد الافتتاحي ' || v_stock::text || ' من جدول ' || v_stock_source || '.'
           ELSE 'المصدر لا يحتوي رصيدًا حاليًا واضحًا لهذا الصنف؛ تم تسجيله بكمية صفر.' END);

    v_prior_target_id := NULL;
    v_prior_stock := NULL;
    SELECT pm.target_id INTO v_prior_target_id
      FROM public.legacy_import_source_rows old_row
      JOIN public.legacy_import_batches old_batch ON old_batch.id=old_row.batch_id AND old_batch.clinic_id=old_row.clinic_id
      JOIN public.legacy_import_id_map pm ON pm.batch_id=old_row.batch_id AND pm.source_table=old_row.source_table AND pm.source_key=old_row.source_key
      JOIN public.products old_product ON old_product.id=pm.target_id AND old_product.clinic_id=v_clinic_id
     WHERE old_row.clinic_id=v_clinic_id AND old_row.batch_id<>p_batch_id
       AND old_batch.source_file_name=v_batch.source_file_name
       AND old_row.source_table=v_row.source_table AND old_row.source_key=v_row.source_key
       AND old_row.source_key NOT LIKE 'row:%'
       AND pm.target_table='products' AND pm.mapping_status='imported'
     ORDER BY old_batch.created_at DESC LIMIT 1;

    IF v_prior_target_id IS NOT NULL THEN
      SELECT quantity INTO v_prior_stock FROM public.products WHERE id=v_prior_target_id AND clinic_id=v_clinic_id;
      UPDATE public.products SET
        name=v_name, category_id=v_category_id,
        unit=CASE WHEN v_unit_source IS NULL OR btrim(v_unit_source) = '' OR v_unit_source ~ '^[0-9]+$' THEN 'piece' ELSE left(v_unit_source, 100) END,
        quantity=coalesce(v_stock, 0), wholesale_price=coalesce(v_price, 0), retail_price=coalesce(v_final_price, 0),
        last_purchase_price=coalesce(v_last_purchase, 0),
        expiry_date=public.vetra_legacy_try_date(public.vetra_legacy_json_text(v_row.payload, ARRAY['expDate','expiry_date','expiryDate'])),
        reorder_level=greatest(coalesce(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['miniQuantity','mini_quantity','reorder_level'])), 0), 0),
        notes=v_notes, updated_at=now()
       WHERE id=v_prior_target_id AND clinic_id=v_clinic_id;
      v_target_id := v_prior_target_id;
    ELSE
      INSERT INTO public.products(
        name, category_id, barcode, unit, quantity, wholesale_price, retail_price,
        last_purchase_price, expiry_date, reorder_level, notes
      ) VALUES (
        v_name, v_category_id, NULL,
        CASE WHEN v_unit_source IS NULL OR btrim(v_unit_source) = '' OR v_unit_source ~ '^[0-9]+$' THEN 'piece' ELSE left(v_unit_source, 100) END,
        coalesce(v_stock, 0), coalesce(v_price, 0), coalesce(v_final_price, 0), coalesce(v_last_purchase, 0),
        public.vetra_legacy_try_date(public.vetra_legacy_json_text(v_row.payload, ARRAY['expDate','expiry_date','expiryDate'])),
        greatest(coalesce(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['miniQuantity','mini_quantity','reorder_level'])), 0), 0),
        v_notes
      ) RETURNING id INTO v_target_id;
    END IF;

    IF v_prior_target_id IS NOT NULL AND coalesce(v_prior_stock, 0) <> coalesce(v_stock, 0) THEN
      INSERT INTO public.inventory_movements(
        clinic_id, product_id, movement_type, quantity, unit_cost,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        v_clinic_id, v_target_id, 'adjustment', coalesce(v_stock, 0) - coalesce(v_prior_stock, 0), coalesce(v_last_purchase, v_price),
        'legacy_import', p_batch_id, 'تحديث رصيد الصنف من نسخة أحدث لقاعدة ' || v_batch.source_file_name, auth.uid()
      );
    ELSIF v_prior_target_id IS NULL AND coalesce(v_stock, 0) > 0 THEN
      INSERT INTO public.inventory_movements(
        clinic_id, product_id, movement_type, quantity, unit_cost,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        v_clinic_id, v_target_id, 'opening_balance', v_stock, coalesce(v_last_purchase, v_price),
        'legacy_import', p_batch_id,
        'رصيد افتتاحي من قاعدة قديمة: ' || v_batch.source_file_name || '؛ المصدر: ' || coalesce(v_stock_source, 'غير محدد'),
        auth.uid()
      );
    END IF;

    UPDATE public.legacy_import_id_map
       SET target_table='products', target_id=v_target_id,
           decision=CASE WHEN v_prior_target_id IS NULL THEN 'create_new' ELSE 'reuse_existing' END, mapping_status='imported',
           notes=CASE WHEN v_prior_target_id IS NOT NULL THEN 'تم تحديث الصنف ورصيده من نسخة أحدث لقاعدة المصدر.' WHEN v_stock_source IS NOT NULL THEN 'تم إنشاء الصنف ونقل رصيده الافتتاحي من المصدر.' ELSE 'تم إنشاء الصنف دون كمية موثقة في المصدر؛ الكمية صفر.' END, updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_products_imported := v_products_imported + 1;
  END LOOP;

  END IF;

  IF p_phase = 'invoices' THEN
  -- 5) Import sales invoices only when the source number/customer/items/prices/total/payments
  --    can be interpreted without guessing. All invoice and line writes are in this transaction.
  SELECT coalesce(max(i.invoice_number), 0) INTO v_max_target_invoice
    FROM public.invoices i;
  SELECT coalesce(max(
           CASE WHEN s.invoice_number_numeric > 0
                     AND s.invoice_number_numeric <= 9223372036854775807
                     AND s.invoice_number_numeric = trunc(s.invoice_number_numeric)
                THEN s.invoice_number_numeric::bigint ELSE NULL END
         ), 0)
    INTO v_max_source_invoice
    FROM (
      SELECT public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(r.payload, ARRAY['invoice_no','invoice_number','invoiceNo','invoiceNumber'])) AS invoice_number_numeric
        FROM public.legacy_import_source_rows r
       WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id AND r.source_table='SalesInvoices'
    ) s;
  v_next_invoice_number := greatest(v_max_target_invoice, v_max_source_invoice) + 1;

  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id=r.batch_id AND m.source_table=r.source_table AND m.source_key=r.source_key
     WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
       AND r.source_table='SalesInvoices' AND m.mapping_status = 'pending'
       AND r.source_row_number > p_after_row
       AND r.source_row_number <= p_after_row + p_limit
     ORDER BY r.source_row_number
     LIMIT p_limit
  LOOP
    v_original_invoice_number_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['invoice_no','invoice_number','invoiceNo','invoiceNumber']);
    v_invoice_total := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['total','totalAmount','total_amount','netTotal']));
    v_original_invoice_numeric := public.vetra_legacy_try_numeric(v_original_invoice_number_text);
    v_original_invoice_number := NULL;
    v_client_id := NULL;
    v_invoice_id := NULL;

    IF v_original_invoice_number_text IS NULL OR v_original_invoice_numeric IS NULL
       OR v_original_invoice_numeric <= 0
       OR v_original_invoice_numeric <> trunc(v_original_invoice_numeric)
       OR v_original_invoice_numeric > 9223372036854775807 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='رقم الفاتورة القديم ليس رقمًا صحيحًا موجبًا؛ تم الاحتفاظ بها للمراجعة.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_original_invoice_number := v_original_invoice_numeric::bigint;

    SELECT count(*) INTO v_existing_count
      FROM public.legacy_import_source_rows sr

     WHERE sr.batch_id=p_batch_id AND sr.source_table='SalesInvoices'
       AND public.vetra_legacy_json_text(sr.payload, ARRAY['invoice_no','invoice_number','invoiceNo','invoiceNumber'])=v_original_invoice_number_text;
    IF v_existing_count <> 1 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='رقم الفاتورة مكرر داخل الملف القديم؛ لا يمكن التأكد من البنود التابعة لها.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    SELECT cm.target_id INTO v_client_id
      FROM public.legacy_import_source_rows cr
      JOIN public.legacy_import_id_map cm
        ON cm.batch_id=cr.batch_id AND cm.source_table=cr.source_table AND cm.source_key=cr.source_key
     WHERE cr.batch_id=p_batch_id AND cr.source_table='Customer'
       AND public.vetra_legacy_json_text(cr.payload, ARRAY['id','customerId','customer_id']) =
           public.vetra_legacy_json_text(v_row.payload, ARRAY['cust_id','customerId','customer_id','customer_id_fk'])
       AND cm.target_table='clients' AND cm.mapping_status='imported'
     LIMIT 1;

    IF v_client_id IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='العميل المرتبط بالفاتورة لم يُنقل أو يحتاج مراجعة؛ الفاتورة محفوظة دون استيراد.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    SELECT
      count(*),
      count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty'])) IS NULL OR public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty'])) <= 0),
      count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['price','unit_price','unitPrice'])) IS NULL OR public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['price','unit_price','unitPrice'])) < 0),
      count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price'])) IS NULL OR public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price'])) < 0),
      coalesce(sum(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['price','unit_price','unitPrice'])) * public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty']))), 0),
      coalesce(sum(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price'])) * public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty']))), 0),
      coalesce(sum(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price']))), 0)
      INTO v_line_count, v_bad_quantity, v_bad_price, v_bad_final_price,
           v_sum_price_qty, v_sum_final_qty, v_sum_final_plain
      FROM public.legacy_import_source_rows d
     WHERE d.batch_id=p_batch_id AND d.clinic_id=v_clinic_id AND d.source_table='SalesInvoiceDetails'
       AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text;

    IF v_line_count = 0 OR v_bad_quantity > 0 OR (v_bad_price = v_line_count AND v_bad_final_price = v_line_count) THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='الفاتورة ليس لها بنود قابلة للاستيراد أو تحتوي كمية/سعرًا غير صالح؛ بقيت في الأرشيف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_unmapped_products
      FROM public.legacy_import_source_rows d
     WHERE d.batch_id=p_batch_id AND d.clinic_id=v_clinic_id AND d.source_table='SalesInvoiceDetails'
       AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text
       AND NOT EXISTS (
         SELECT 1
           FROM public.legacy_import_source_rows pr
           JOIN public.legacy_import_id_map pm
             ON pm.batch_id=pr.batch_id AND pm.source_table=pr.source_table AND pm.source_key=pr.source_key
          WHERE pr.batch_id=p_batch_id AND pr.source_table='Product'
            AND public.vetra_legacy_json_text(pr.payload, ARRAY['id','productId','product_id']) =
                public.vetra_legacy_json_text(d.payload, ARRAY['prod_id','productId','product_id'])
            AND pm.target_table='products' AND pm.mapping_status='imported'
       );
    IF v_unmapped_products > 0 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='بعض أصناف الفاتورة لم تُنقل أو تحتاج مراجعة؛ الفاتورة وبنودها بقيت بالأرشيف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_price_matches := v_bad_price = 0 AND abs(v_sum_price_qty - coalesce(v_invoice_total, -999999999)) <= 0.03;
    v_final_matches := v_bad_final_price = 0 AND abs(v_sum_final_qty - coalesce(v_invoice_total, -999999999)) <= 0.03;
    v_final_plain_matches := v_bad_final_price = 0 AND
      (SELECT count(*) = count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty'])) = 1)
         FROM public.legacy_import_source_rows d
        WHERE d.batch_id=p_batch_id AND d.source_table='SalesInvoiceDetails'
          AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text)
      AND abs(v_sum_final_plain - coalesce(v_invoice_total, -999999999)) <= 0.03;

    v_price_mode := NULL;
    IF v_invoice_total IS NOT NULL THEN
      IF v_price_matches AND (NOT v_final_matches OR abs(v_sum_price_qty - v_sum_final_qty) <= 0.03) THEN
        v_price_mode := 'price';
        v_selected_sum := v_sum_price_qty;
      ELSIF v_final_matches AND NOT v_price_matches THEN
        v_price_mode := 'final_price';
        v_selected_sum := v_sum_final_qty;
      ELSIF v_final_plain_matches AND NOT v_price_matches AND NOT v_final_matches THEN
        v_price_mode := 'final_price';
        v_selected_sum := v_sum_final_plain;
      END IF;
    END IF;

    IF v_price_mode IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='إجمالي رأس الفاتورة لا يتطابق بشكل واضح مع أسعار البنود والكميات؛ لم يتم تعديل أي مبلغ.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_paid := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['paid','paidAmount','paid_amount']));
    IF v_paid IS NULL OR v_paid < 0 OR v_paid > v_invoice_total
       OR (v_paid = 1 AND v_invoice_total > 1) THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='held', notes='قيمة المدفوع غير واضحة أو لا تتفق مع إجمالي الفاتورة؛ لم يتم تخمين حالة السداد.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_date := public.vetra_legacy_try_timestamptz(public.vetra_legacy_json_text(v_row.payload, ARRAY['date','invoiceDate','invoice_date','created_at']));
    v_notes := public.vetra_legacy_json_text(v_row.payload, ARRAY['notes','note','comment']);
    v_notes := concat_ws(E'\n', nullif(btrim(v_notes), ''),
      'مستورد من قاعدة قديمة: ' || v_batch.source_file_name,
      'رقم الفاتورة الأصلي: ' || v_original_invoice_number::text,
      'قيمة الإجمالي الأصلية: ' || v_invoice_total::text,
      CASE WHEN abs(v_selected_sum - v_invoice_total) > 0 THEN 'فرق تقريب بين مجموع البنود ورأس الفاتورة: ' || (v_invoice_total - v_selected_sum)::text ELSE NULL END);

    v_prior_target_id := NULL;
    v_prior_batch_id := NULL;
    SELECT pm.target_id, pm.batch_id INTO v_prior_target_id, v_prior_batch_id
      FROM public.legacy_import_source_rows old_row
      JOIN public.legacy_import_batches old_batch ON old_batch.id=old_row.batch_id AND old_batch.clinic_id=old_row.clinic_id
      JOIN public.legacy_import_id_map pm ON pm.batch_id=old_row.batch_id AND pm.source_table=old_row.source_table AND pm.source_key=old_row.source_key
      JOIN public.invoices old_invoice ON old_invoice.id=pm.target_id AND old_invoice.clinic_id=v_clinic_id
     WHERE old_row.clinic_id=v_clinic_id AND old_row.batch_id<>p_batch_id
       AND old_batch.source_file_name=v_batch.source_file_name
       AND old_row.source_table=v_row.source_table AND old_row.source_key=v_row.source_key
       AND old_row.source_key NOT LIKE 'row:%'
       AND pm.target_table='invoices' AND pm.mapping_status='imported'
     ORDER BY old_batch.created_at DESC LIMIT 1;

    IF v_prior_target_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.financial_transactions ft WHERE ft.related_invoice_id=v_prior_target_id)
      OR EXISTS (SELECT 1 FROM public.invoice_returns ir WHERE ir.invoice_id=v_prior_target_id)
    ) THEN
      UPDATE public.legacy_import_id_map
         SET decision='needs_review', mapping_status='held',
             notes='الفاتورة مرتبطة بحركات مالية أو مرتجعات؛ لم يتم تحديثها تلقائيًا للحفاظ على الأرصدة والمرتجعات.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    IF v_prior_target_id IS NOT NULL THEN
      v_invoice_id := v_prior_target_id;
      SELECT invoice_number INTO v_new_invoice_number FROM public.invoices WHERE id=v_invoice_id AND clinic_id=v_clinic_id;
      UPDATE public.invoices SET
        client_id=v_client_id,
        status=CASE WHEN v_paid = v_invoice_total THEN 'paid' WHEN v_paid > 0 THEN 'partially_paid' ELSE 'unpaid' END,
        subtotal=v_selected_sum, discount=0, total=v_invoice_total, paid_amount=v_paid,
        notes=v_notes, invoice_date=coalesce(v_date, now()), issued_at=v_date, updated_by=auth.uid(), updated_at=now()
       WHERE id=v_invoice_id AND clinic_id=v_clinic_id;
    ELSE
    v_new_invoice_number := v_original_invoice_number;
    IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.invoice_number=v_original_invoice_number) THEN
      LOOP
        WHILE EXISTS (SELECT 1 FROM public.invoices i WHERE i.invoice_number=v_next_invoice_number) LOOP
          v_next_invoice_number := v_next_invoice_number + 1;
        END LOOP;
        v_new_invoice_number := v_next_invoice_number;
        v_next_invoice_number := v_next_invoice_number + 1;
        EXIT;
      END LOOP;
    END IF;

    v_invoice_insert_attempts := 0;
    LOOP
      v_invoice_id := NULL;
      INSERT INTO public.invoices(
        invoice_number, client_id, status, payment_method, subtotal, discount,
        total, paid_amount, notes, invoice_date, issued_at, created_by, updated_by
      ) VALUES (
        v_new_invoice_number, v_client_id,
        CASE WHEN v_paid = v_invoice_total THEN 'paid'
             WHEN v_paid > 0 THEN 'partially_paid' ELSE 'unpaid' END,
        NULL,
        v_selected_sum,
        0,
        v_invoice_total,
        v_paid,
        v_notes,
        coalesce(v_date, now()),
        v_date,
        auth.uid(),
        auth.uid()
      ) ON CONFLICT DO NOTHING
      RETURNING id INTO v_invoice_id;

      EXIT WHEN v_invoice_id IS NOT NULL;
      v_invoice_insert_attempts := v_invoice_insert_attempts + 1;
      IF v_invoice_insert_attempts > 20 THEN
        RAISE EXCEPTION 'Could not reserve a unique invoice number after 20 attempts';
      END IF;

      SELECT coalesce(max(i.invoice_number), 0) + 1
        INTO v_max_conflicting_invoice
        FROM public.invoices i;
      v_new_invoice_number := greatest(v_next_invoice_number, v_max_conflicting_invoice);
      v_next_invoice_number := v_new_invoice_number + 1;
    END LOOP;
    END IF;

    UPDATE public.legacy_import_id_map
       SET target_table='invoices', target_id=v_invoice_id,
           decision=CASE WHEN v_prior_target_id IS NULL THEN 'create_new' ELSE 'reuse_existing' END, mapping_status='imported',
           notes=CASE WHEN v_prior_target_id IS NOT NULL THEN 'تم تحديث الفاتورة من نسخة أحدث لقاعدة المصدر.' WHEN v_new_invoice_number <> v_original_invoice_number
             THEN 'تم نقل الفاتورة برقم جديد لتفادي التعارض؛ الرقم الأصلي محفوظ في ملاحظات الفاتورة.'
             ELSE 'تم نقل الفاتورة بعد التحقق من إجمالي البنود.' END,
           updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;

    IF v_prior_batch_id IS NOT NULL THEN
      DELETE FROM public.invoice_items old_item
       USING public.legacy_import_id_map old_map
       WHERE old_map.batch_id=v_prior_batch_id AND old_map.clinic_id=v_clinic_id
         AND old_map.source_table='SalesInvoiceDetails' AND old_map.target_table='invoice_items'
         AND old_map.mapping_status='imported' AND old_map.target_id=old_item.id
         AND old_item.invoice_id=v_invoice_id
         AND NOT EXISTS (
           SELECT 1 FROM public.legacy_import_id_map new_map
            WHERE new_map.batch_id=p_batch_id AND new_map.clinic_id=v_clinic_id
              AND new_map.source_table='SalesInvoiceDetails' AND new_map.source_key=old_map.source_key
         );
    END IF;

    FOR v_detail IN
      SELECT d.*
        FROM public.legacy_import_source_rows d
       WHERE d.batch_id=p_batch_id AND d.clinic_id=v_clinic_id AND d.source_table='SalesInvoiceDetails'
         AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text
       ORDER BY d.source_row_number
    LOOP
      SELECT pm.target_id INTO v_product_id
        FROM public.legacy_import_source_rows pr
        JOIN public.legacy_import_id_map pm
          ON pm.batch_id=pr.batch_id AND pm.source_table=pr.source_table AND pm.source_key=pr.source_key
       WHERE pr.batch_id=p_batch_id AND pr.source_table='Product'
         AND public.vetra_legacy_json_text(pr.payload, ARRAY['id','productId','product_id']) =
             public.vetra_legacy_json_text(v_detail.payload, ARRAY['prod_id','productId','product_id'])
         AND pm.target_table='products' AND pm.mapping_status='imported'
       LIMIT 1;

      v_quantity := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_detail.payload, ARRAY['quantity','qty']));
      IF v_price_mode = 'price' THEN
        v_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_detail.payload, ARRAY['price','unit_price','unitPrice']));
      ELSE
        v_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_detail.payload, ARRAY['final_price','finalPrice','final_unit_price']));
      END IF;
      v_notes := public.vetra_legacy_json_text(v_detail.payload, ARRAY['prod_name','productName','product_name','description']);
      v_code := public.vetra_legacy_json_text(v_detail.payload, ARRAY['price','unit_price','unitPrice']);
      v_notes := concat_ws(E'\n', nullif(btrim(v_notes), ''),
        'سعر الوحدة الأصلي: ' || coalesce(v_code, 'غير مسجل'),
        'تم الاحتفاظ بوصف الصنف من الفاتورة القديمة.');

      v_prior_detail_id := NULL;
      IF v_prior_batch_id IS NOT NULL THEN
        SELECT old_map.target_id INTO v_prior_detail_id
          FROM public.legacy_import_id_map old_map
          JOIN public.invoice_items old_item ON old_item.id=old_map.target_id AND old_item.invoice_id=v_invoice_id
         WHERE old_map.batch_id=v_prior_batch_id AND old_map.clinic_id=v_clinic_id
           AND old_map.source_table='SalesInvoiceDetails' AND old_map.source_key=v_detail.source_key
           AND old_map.target_table='invoice_items' AND old_map.mapping_status='imported';
      END IF;

      IF v_prior_detail_id IS NOT NULL THEN
        UPDATE public.invoice_items SET product_id=v_product_id, description=v_notes,
          quantity=v_quantity, unit_price=v_price, discount=0, total=v_quantity*v_price
         WHERE id=v_prior_detail_id AND invoice_id=v_invoice_id;
        v_invoice_item_id := v_prior_detail_id;
      ELSE
        INSERT INTO public.invoice_items(
          invoice_id, item_type, product_id, service_name, description,
          quantity, unit_price, discount, total
        ) VALUES (
          v_invoice_id, 'product', v_product_id, NULL, v_notes,
          v_quantity, v_price, 0, v_quantity * v_price
        ) RETURNING id INTO v_invoice_item_id;
      END IF;

      UPDATE public.legacy_import_id_map
         SET target_table='invoice_items', target_id=v_invoice_item_id,
             decision=CASE WHEN v_prior_detail_id IS NULL THEN 'create_new' ELSE 'reuse_existing' END,
             mapping_status='imported', notes=CASE WHEN v_prior_detail_id IS NULL THEN 'تم نقل بند الفاتورة مع الاحتفاظ بوصف المصدر.' ELSE 'تم تحديث بند الفاتورة من نسخة أحدث.' END, updated_at=now()
       WHERE batch_id=p_batch_id AND source_table='SalesInvoiceDetails' AND source_key=v_detail.source_key;
      v_invoice_items_imported := v_invoice_items_imported + 1;
    END LOOP;

    v_invoices_imported := v_invoices_imported + 1;
  END LOOP;

  END IF;

  IF p_phase IN ('categories', 'clients', 'products') THEN
    SELECT count(*) INTO v_phase_remaining
      FROM public.legacy_import_id_map m
     WHERE m.batch_id = p_batch_id
       AND m.clinic_id = v_clinic_id
       AND m.mapping_status = 'pending'
       AND (
         (p_phase = 'categories' AND m.source_table IN ('Category', 'Subcategory'))
         OR (p_phase = 'clients' AND m.source_table = 'Customer')
         OR (p_phase = 'products' AND m.source_table = 'Product')
       );
    v_progress_done := v_phase_remaining = 0;
  END IF;

  IF p_phase <> 'finalize' THEN
    IF p_phase = 'invoices' THEN
      v_progress_after := least(p_after_row + p_limit, v_invoice_max_row);
      v_progress_done := v_progress_after >= v_invoice_max_row;
    ELSE
      v_progress_after := 0;
      v_progress_done := (v_phase_remaining = 0);
    END IF;

    UPDATE public.legacy_import_batches
       SET summary = coalesce(summary, '{}'::jsonb) || jsonb_build_object(
         'lastImportProgress', jsonb_build_object(
           'phase', p_phase,
           'afterRow', v_progress_after,
           'limit', p_limit,
           'phaseDone', v_progress_done,
           'updatedAt', now()
         )
       ),
           updated_at = now()
     WHERE id = p_batch_id AND clinic_id = v_clinic_id;

    RETURN jsonb_build_object(
      'phase', p_phase,
      'afterRow', v_progress_after,
      'phaseDone', v_progress_done,
      'invoiceRowsTotal', v_invoice_max_row,
      'committedAt', now()
    );
  END IF;

  -- Final totals are recomputed from the durable mapping table, not per-call variables.
  SELECT count(*) INTO v_categories_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'product_categories' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_clients_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'clients' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_products_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'products' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_invoices_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'invoices' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_invoice_items_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'invoice_items' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_invoices_held
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.source_table = 'SalesInvoices'
     AND m.mapping_status <> 'imported'
     AND m.decision = 'needs_review';

  SELECT count(*) INTO v_unsupported_rows
    FROM public.legacy_import_source_rows r
   WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
     AND r.source_table NOT IN ('Customer','Category','Subcategory','Product','SalesInvoices','SalesInvoiceDetails','Temp_stock');

  SELECT count(*) INTO v_pending_rows
    FROM public.legacy_import_id_map m
   WHERE m.batch_id=p_batch_id AND m.clinic_id=v_clinic_id
     AND m.mapping_status <> 'imported';

  -- Explicit legacy invoice numbers do not advance an identity sequence.
  -- Synchronize it before returning so the next normal invoice cannot collide.
  LOCK TABLE public.invoices IN SHARE ROW EXCLUSIVE MODE;
  v_sequence_name := pg_get_serial_sequence('public.invoices', 'invoice_number');
  IF v_sequence_name IS NOT NULL THEN
    SELECT coalesce(max(i.invoice_number), 0)
      INTO v_sequence_max
      FROM public.invoices i;
    IF v_sequence_max > 0 THEN
      PERFORM setval(v_sequence_name::regclass, v_sequence_max, true);
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'batchId', p_batch_id,
    'clientsImported', v_clients_imported,
    'categoriesImported', v_categories_imported,
    'productsImported', v_products_imported,
    'invoicesImported', v_invoices_imported,
    'invoiceItemsImported', v_invoice_items_imported,
    'invoicesHeldForReview', v_invoices_held,
    'unsupportedRowsPreserved', v_unsupported_rows,
    'pendingRows', v_pending_rows,
    'archiveRowsVerified', v_archive_count,
    'mappingRowsVerified', v_map_count,
    'businessTablesModified', (v_clients_imported + v_categories_imported + v_products_imported + v_invoices_imported + v_invoice_items_imported) > 0,
    'completedAt', now()
  );

  UPDATE public.legacy_import_batches
     SET status='needs_review',
         summary=coalesce(summary, '{}'::jsonb) || jsonb_build_object(
           'lastImportRun', v_result,
           'lastImportRunAt', now(),
         'lastImportProgress', jsonb_build_object('phase', 'complete', 'afterRow', v_invoice_max_row, 'phaseDone', true, 'updatedAt', now()),
           'businessDataWritten', (coalesce((summary ->> 'businessDataWritten')::boolean, false) OR (v_clients_imported + v_categories_imported + v_products_imported + v_invoices_imported + v_invoice_items_imported) > 0)
         ),
         updated_at=now()
   WHERE id=p_batch_id AND clinic_id=v_clinic_id;

  RETURN v_result;
END;
$function$;



-- >>> SOURCE: C:\Users\omnia fawzy\Downloads\VETRA_REPAIR_CLIENT_CODES_RPC.sql

-- VETRA: install an authenticated, clinic-scoped repair RPC.
-- Run this installer in the SHARED CLINIC DATABASE (NOT VETRA CORE).
-- IMPORTANT: this file only creates the function; it does NOT update clients when run in SQL Editor.
-- Execute the repair later from the signed-in VETRA page using getClinicDb().rpc(...).

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.clients') IS NULL
     OR to_regclass('public.legacy_import_id_map') IS NULL
     OR to_regclass('public.legacy_import_source_rows') IS NULL THEN
    RAISE EXCEPTION 'Required VETRA client/import mapping tables are missing.';
  END IF;

  IF to_regprocedure('public.vetra_current_clinic_id()') IS NULL
     OR to_regprocedure('public.vetra_legacy_json_text(jsonb,text[])') IS NULL THEN
    RAISE EXCEPTION 'Required VETRA clinic-context/import helper functions are missing.';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.vetra_repair_legacy_client_codes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_clinic_id uuid;
  v_bad bigint := 0;
  v_updated bigint := 0;
  v_remaining bigint := 0;
BEGIN
  v_clinic_id := public.vetra_current_clinic_id();
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'No active VETRA clinic in JWT. Open the app while signed in to the target clinic and retry.';
  END IF;

  -- Stop if any target row needs repair but its original source ID is unavailable.
  SELECT count(*) INTO v_bad
  FROM public.legacy_import_id_map m
  JOIN public.legacy_import_source_rows r
    ON r.batch_id = m.batch_id
   AND r.clinic_id = m.clinic_id
   AND r.source_table = m.source_table
   AND r.source_key = m.source_key
  JOIN public.clients c
    ON c.id = m.target_id
   AND c.clinic_id = v_clinic_id
  WHERE m.clinic_id = v_clinic_id
    AND r.clinic_id = v_clinic_id
    AND m.source_table = 'Customer'
    AND m.target_table = 'clients'
    AND m.mapping_status = 'imported'
    AND c.client_code ~* '^LEG-CUST-[0-9A-F]{16}$'
    AND nullif(btrim(public.vetra_legacy_json_text(r.payload, ARRAY['id','customerId','customer_id'])), '') IS NULL;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Repair stopped: % imported customer(s) have no original Customer.id in the archived source.', v_bad;
  END IF;

  -- Stop if two source rows would be assigned the same code.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT c.id AS target_id,
             'LEG-CUST-' || btrim(public.vetra_legacy_json_text(r.payload, ARRAY['id','customerId','customer_id'])) AS proposed_code
      FROM public.legacy_import_id_map m
      JOIN public.legacy_import_source_rows r
        ON r.batch_id = m.batch_id
       AND r.clinic_id = m.clinic_id
       AND r.source_table = m.source_table
       AND r.source_key = m.source_key
      JOIN public.clients c
        ON c.id = m.target_id
       AND c.clinic_id = v_clinic_id
      WHERE m.clinic_id = v_clinic_id
        AND r.clinic_id = v_clinic_id
        AND m.source_table = 'Customer'
        AND m.target_table = 'clients'
        AND m.mapping_status = 'imported'
        AND c.client_code ~* '^LEG-CUST-[0-9A-F]{16}$'
    ) proposed
    GROUP BY proposed_code
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Repair stopped: duplicate original Customer.id values would produce duplicate client codes.';
  END IF;

  -- Stop if a proposed code is already owned by another client in this clinic.
  IF EXISTS (
    SELECT 1
    FROM public.legacy_import_id_map m
    JOIN public.legacy_import_source_rows r
      ON r.batch_id = m.batch_id
     AND r.clinic_id = m.clinic_id
     AND r.source_table = m.source_table
     AND r.source_key = m.source_key
    JOIN public.clients c
      ON c.id = m.target_id
     AND c.clinic_id = v_clinic_id
    JOIN public.clients other
      ON other.clinic_id = v_clinic_id
     AND other.client_code = ('LEG-CUST-' || btrim(public.vetra_legacy_json_text(r.payload, ARRAY['id','customerId','customer_id'])))
     AND other.id <> c.id
    WHERE m.clinic_id = v_clinic_id
      AND r.clinic_id = v_clinic_id
      AND m.source_table = 'Customer'
      AND m.target_table = 'clients'
      AND m.mapping_status = 'imported'
      AND c.client_code ~* '^LEG-CUST-[0-9A-F]{16}$'
  ) THEN
    RAISE EXCEPTION 'Repair stopped: a proposed source-derived client code already belongs to another client in this clinic. No changes were made.';
  END IF;

  WITH candidates AS (
    SELECT c.id AS target_id,
           c.clinic_id,
           c.client_code AS old_code,
           'LEG-CUST-' || btrim(public.vetra_legacy_json_text(r.payload, ARRAY['id','customerId','customer_id'])) AS new_code
    FROM public.legacy_import_id_map m
    JOIN public.legacy_import_source_rows r
      ON r.batch_id = m.batch_id
     AND r.clinic_id = m.clinic_id
     AND r.source_table = m.source_table
     AND r.source_key = m.source_key
    JOIN public.clients c
      ON c.id = m.target_id
     AND c.clinic_id = v_clinic_id
    WHERE m.clinic_id = v_clinic_id
      AND r.clinic_id = v_clinic_id
      AND m.source_table = 'Customer'
      AND m.target_table = 'clients'
      AND m.mapping_status = 'imported'
      AND c.client_code ~* '^LEG-CUST-[0-9A-F]{16}$'
      AND nullif(btrim(public.vetra_legacy_json_text(r.payload, ARRAY['id','customerId','customer_id'])), '') IS NOT NULL
  ), updated AS (
    UPDATE public.clients c
       SET client_code = candidates.new_code
      FROM candidates
     WHERE c.id = candidates.target_id
       AND c.clinic_id = candidates.clinic_id
       AND c.client_code = candidates.old_code
     RETURNING c.id
  )
  SELECT count(*) INTO v_updated FROM updated;

  SELECT count(*) INTO v_remaining
  FROM public.legacy_import_id_map m
  JOIN public.clients c ON c.id = m.target_id AND c.clinic_id = v_clinic_id
  WHERE m.clinic_id = v_clinic_id
    AND m.source_table = 'Customer'
    AND m.target_table = 'clients'
    AND m.mapping_status = 'imported'
    AND c.client_code ~* '^LEG-CUST-[0-9A-F]{16}$';

  RETURN jsonb_build_object(
    'clinic_id', v_clinic_id,
    'updated_clients', v_updated,
    'remaining_generated_legacy_client_codes', v_remaining
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.vetra_repair_legacy_client_codes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vetra_repair_legacy_client_codes() TO authenticated;

COMMIT;

-- Verification that the RPC exists; this does not execute the repair.
SELECT to_regprocedure('public.vetra_repair_legacy_client_codes()') AS installed_rpc;


-- >>> SOURCE: supabase/tenant-sql/vetra_repair_invoice_number_sequence.sql

-- Run on the clinic tenant database (not VETRA CORE).
-- Repairs the invoice_number identity/serial sequence after explicit legacy imports.
-- It does not change any invoice rows.

DO $repair_invoice_number_sequence$
DECLARE
  v_sequence_name text;
  v_sequence regclass;
  v_max_invoice_number bigint;
  v_sequence_last_value bigint;
  v_sequence_is_called boolean;
  v_next_value bigint;
BEGIN
  -- Prevent a new invoice from being issued while the sequence is being synchronized.
  LOCK TABLE public.invoices IN ACCESS EXCLUSIVE MODE;

  v_sequence_name := pg_get_serial_sequence('public.invoices', 'invoice_number');
  IF v_sequence_name IS NULL THEN
    RAISE EXCEPTION 'public.invoices.invoice_number has no identity/serial sequence; no change was made';
  END IF;
  v_sequence := v_sequence_name::regclass;

  SELECT coalesce(max(invoice_number), 0)::bigint
    INTO v_max_invoice_number
    FROM public.invoices;

  EXECUTE format('SELECT last_value, is_called FROM %s', v_sequence)
    INTO v_sequence_last_value, v_sequence_is_called;

  v_next_value := greatest(
    v_max_invoice_number + 1,
    v_sequence_last_value + CASE WHEN v_sequence_is_called THEN 1 ELSE 0 END
  );

  PERFORM setval(v_sequence, v_next_value, false);
  RAISE NOTICE 'Invoice number sequence synchronized. Next number will be %.', v_next_value;
END;
$repair_invoice_number_sequence$;


do $$
declare
  v_missing_relations text[];
  v_missing_functions text[];
begin
  select array_agg(required.object_name order by required.object_name)
    into v_missing_relations
  from (values
    ('clients'), ('pets'), ('product_categories'), ('products'), ('medications'),
    ('visits'), ('visit_medications'), ('vaccinations'), ('appointments'),
    ('appointment_settings'), ('billing_settings'), ('invoices'), ('invoice_items'),
    ('invoice_returns'), ('invoice_return_items'), ('inventory_movements'),
    ('owner_medication_checkins'), ('clinic_drug_product_links'),
    ('financial_accounts'), ('financial_account_balances'), ('cash_register_sessions'),
    ('financial_transactions'), ('clinic_staff'), ('inventory_suppliers'),
    ('inventory_purchases'), ('inventory_purchase_items'), ('client_credit_ledger'),
    ('visit_prescriptions'), ('clinic_vaccination_products'), ('clinic_condition_protocols'),
    ('human_medication_templates'), ('clinic_message_templates'), ('clinic_profile_settings'),
    ('clinic_reception_queue'), ('clinic_checkout_dismissals'), ('pet_medical_records'),
    ('visit_attachments'), ('pet_medical_record_attachments'), ('legacy_import_batches'),
    ('legacy_import_records'), ('legacy_import_source_rows'), ('legacy_import_id_map')
  ) required(object_name)
  where to_regclass('public.' || required.object_name) is null;

  if v_missing_relations is not null then
    raise exception 'VETRA bootstrap is incomplete; missing tenant tables/views: %', v_missing_relations;
  end if;

  select array_agg(required.function_name order by required.function_name)
    into v_missing_functions
  from (values
    ('vetra_current_clinic_id'), ('vetra_current_owner_client_id'),
    ('vetra_add_pet_for_owner'), ('vetra_client_booking_settings'),
    ('vetra_client_available_slots'), ('vetra_create_financial_account'),
    ('vetra_open_cash_register'), ('vetra_close_cash_register'),
    ('vetra_post_financial_transaction'), ('vetra_transfer_between_accounts'),
    ('vetra_record_invoice_payment'), ('vetra_ensure_cash_register_open'),
    ('vetra_has_clinic_staff_permission'), ('vetra_update_clinic_staff_permissions'),
    ('vetra_link_clinic_staff_account'), ('vetra_mark_clinic_staff_password_changed'),
    ('vetra_create_inventory_supplier'), ('vetra_create_inventory_purchase'),
    ('vetra_update_inventory_purchase'), ('vetra_get_owner_financial_summary'),
    ('vetra_dispense_visit_inventory'), ('vetra_restore_visit_inventory'),
    ('vetra_enqueue_reception_visit_invoice'), ('vetra_can_checkout_visit_draft'),
    ('vetra_update_reception_invoice'), ('vetra_get_pet_medical_records'),
    ('vetra_get_pet_lab_records'), ('vetra_get_pet_lab_attachments'),
    ('vetra_submit_pet_lab_result'), ('vetra_attach_pet_lab_file'),
     ('vetra_update_pet_photo_for_owner'), ('vetra_delete_client_cascade'),
    ('vetra_delete_pet_cascade'), ('vetra_generate_client_code'),
    ('vetra_allocate_client_code'), ('vetra_assign_client_code'),
    ('vetra_legacy_json_text'), ('vetra_legacy_try_numeric'),
    ('vetra_legacy_try_date'), ('vetra_legacy_try_timestamptz'),
    ('vetra_import_legacy_batch_progress'), ('vetra_repair_legacy_client_codes')
  ) required(function_name)
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = required.function_name
  );

  if v_missing_functions is not null then
    raise exception 'VETRA bootstrap is incomplete; missing tenant RPCs/functions: %', v_missing_functions;
  end if;
end;
$$;
