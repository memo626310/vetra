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
drop policy if exists vetra_visit_attachments_delete on public.visit_attachments;
create policy vetra_visit_attachments_delete on public.visit_attachments
  for delete to authenticated using (clinic_id = public.vetra_current_clinic_id());

grant select, insert, delete on public.visit_attachments to authenticated;
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
