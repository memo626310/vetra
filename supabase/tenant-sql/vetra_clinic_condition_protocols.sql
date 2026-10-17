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
