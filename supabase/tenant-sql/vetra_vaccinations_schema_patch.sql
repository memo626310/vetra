-- Make the vaccination tracker work on older clinic tenant databases.
-- Run on the clinic tenant database (not VETRA Core).
begin;

create table if not exists public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  pet_id uuid not null references public.pets(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  visit_id uuid references public.visits(id) on delete set null,
  vaccine_name text not null,
  vaccine_type text,
  administered_at timestamptz not null default now(),
  dose text,
  route text,
  batch_number text,
  manufacturer text,
  next_dose_at timestamptz,
  notes text,
  product_id uuid references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  administered_by uuid
);

alter table public.vaccinations
  add column if not exists clinic_id uuid,
  add column if not exists pet_id uuid,
  add column if not exists client_id uuid,
  add column if not exists visit_id uuid,
  add column if not exists vaccine_name text,
  add column if not exists vaccine_type text,
  add column if not exists administered_at timestamptz default now(),
  add column if not exists dose text,
  add column if not exists route text,
  add column if not exists batch_number text,
  add column if not exists manufacturer text,
  add column if not exists next_dose_at timestamptz,
  add column if not exists notes text,
  add column if not exists product_id uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists administered_by uuid;

create table if not exists public.clinic_vaccination_products (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  protocol_key text not null check (protocol_key in ('viral', 'rabies', 'deworm', 'parasite')),
  product_id uuid not null references public.products(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (clinic_id, protocol_key, product_id)
);

alter table public.vaccinations enable row level security;
drop policy if exists vetra_vaccinations_schema_select on public.vaccinations;
create policy vetra_vaccinations_schema_select on public.vaccinations
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_vaccinations_schema_insert on public.vaccinations;
create policy vetra_vaccinations_schema_insert on public.vaccinations
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_vaccinations_schema_update on public.vaccinations;
create policy vetra_vaccinations_schema_update on public.vaccinations
  for update to authenticated using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_vaccinations_schema_delete on public.vaccinations;
create policy vetra_vaccinations_schema_delete on public.vaccinations
  for delete to authenticated using (clinic_id = public.vetra_current_clinic_id());

alter table public.clinic_vaccination_products enable row level security;
drop policy if exists vetra_clinic_vaccination_products_schema_select on public.clinic_vaccination_products;
create policy vetra_clinic_vaccination_products_schema_select on public.clinic_vaccination_products
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_vaccination_products_schema_insert on public.clinic_vaccination_products;
create policy vetra_clinic_vaccination_products_schema_insert on public.clinic_vaccination_products
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_vaccination_products_schema_update on public.clinic_vaccination_products;
create policy vetra_clinic_vaccination_products_schema_update on public.clinic_vaccination_products
  for update to authenticated using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_vaccination_products_schema_delete on public.clinic_vaccination_products;
create policy vetra_clinic_vaccination_products_schema_delete on public.clinic_vaccination_products
  for delete to authenticated using (clinic_id = public.vetra_current_clinic_id());

grant select, insert, update, delete on public.vaccinations to authenticated;
grant select, insert, update, delete on public.clinic_vaccination_products to authenticated;
notify pgrst, 'reload schema';
commit;
