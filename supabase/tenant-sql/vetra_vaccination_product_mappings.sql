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
