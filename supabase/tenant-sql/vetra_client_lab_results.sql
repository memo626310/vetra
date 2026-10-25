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
