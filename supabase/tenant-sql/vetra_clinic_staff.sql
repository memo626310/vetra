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
