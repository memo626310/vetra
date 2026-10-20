begin;

alter table public.clinic_members
  add column if not exists must_change_password boolean not null default false;

commit;
