-- Lab orders and surgical history shared between clinic and owner portal.
-- Run on each clinic tenant database, not VETRA CORE.
begin;

create table if not exists public.pet_medical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  pet_id uuid not null references public.pets(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  visit_id uuid references public.visits(id) on delete set null,
  record_type text not null check (record_type in ('lab', 'surgery')),
  title text not null,
  status text not null default 'ordered',
  result text,
  notes text,
  performed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint pet_medical_records_title_present check (length(trim(title)) > 0)
);

create index if not exists pet_medical_records_pet_date_idx
  on public.pet_medical_records (pet_id, created_at desc);

alter table public.pet_medical_records enable row level security;
drop policy if exists vetra_pet_medical_records_clinic_select on public.pet_medical_records;
create policy vetra_pet_medical_records_clinic_select on public.pet_medical_records
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_pet_medical_records_clinic_insert on public.pet_medical_records;
create policy vetra_pet_medical_records_clinic_insert on public.pet_medical_records
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_pet_medical_records_clinic_update on public.pet_medical_records;
create policy vetra_pet_medical_records_clinic_update on public.pet_medical_records
  for update to authenticated using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_pet_medical_records_clinic_delete on public.pet_medical_records;
create policy vetra_pet_medical_records_clinic_delete on public.pet_medical_records
  for delete to authenticated using (clinic_id = public.vetra_current_clinic_id());

grant select, insert, update, delete on public.pet_medical_records to authenticated;
revoke all on public.pet_medical_records from anon, public;

create or replace function public.vetra_get_pet_medical_records(p_pet_id uuid)
returns setof public.pet_medical_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_code text := nullif(trim(v_headers ->> 'x-vetra-client-code'), '');
  v_phone text := nullif(trim(v_headers ->> 'x-vetra-client-phone'), '');
  v_client_id uuid;
begin
  if v_code is null or v_phone is null then
    raise exception 'Pet owner session could not be verified';
  end if;
  select c.id into v_client_id
  from public.clients c
  where c.client_code = v_code
    and regexp_replace(coalesce(c.phone, ''), '\s+', '', 'g') = regexp_replace(v_phone, '\s+', '', 'g')
  limit 1;
  if v_client_id is null then raise exception 'Pet owner session could not be verified'; end if;
  return query select r.* from public.pet_medical_records r
    where r.pet_id = p_pet_id and r.client_id = v_client_id
    order by r.created_at desc;
end;
$$;

revoke all on function public.vetra_get_pet_medical_records(uuid) from public;
grant execute on function public.vetra_get_pet_medical_records(uuid) to anon, authenticated;
commit;
