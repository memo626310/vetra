-- Clinic-specific printable identity and public brand assets.
-- Run on each clinic tenant database, not VETRA CORE.
begin;

create table if not exists public.clinic_profile_settings (
  clinic_id uuid primary key,
  display_name text not null check (char_length(display_name) between 1 and 120),
  website_url text,
  logo_url text,
  logo_path text,
  updated_at timestamptz not null default now()
);

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
