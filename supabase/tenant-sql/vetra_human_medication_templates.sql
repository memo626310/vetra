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
