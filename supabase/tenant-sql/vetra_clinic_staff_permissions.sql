-- Per-staff permissions for the clinic tenant database.
begin;

alter table public.clinic_staff
  add column if not exists permissions jsonb not null default '{}'::jsonb;

commit;
