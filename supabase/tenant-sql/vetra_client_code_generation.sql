-- Automatic Client ID generation for the clinic tenant database.
-- Run this file on the clinic database, not on VETRA Core.
-- New clients without client_code receive: clinic prefix (2 digits) + unique suffix (4 digits).

begin;

create unique index if not exists clients_client_code_unique
  on public.clients (clinic_id, client_code)
  where client_code is not null and btrim(client_code) <> '';

create or replace function public.vetra_allocate_client_code(p_clinic_id uuid, p_current_code text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_claims jsonb;
  v_clinic_number integer;
  v_candidate text;
  v_suffix integer;
  v_attempt integer;
begin
  if p_clinic_id is null then raise exception 'An active clinic is required'; end if;

  v_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  if (v_claims ->> 'clinic_number') ~ '^[0-9]{1,2}$' then
    v_clinic_number := (v_claims ->> 'clinic_number')::integer;
  end if;

  -- Compatibility for older clinic tokens: infer the prefix from existing IDs.
  if v_clinic_number is null then
    select min(left(c.client_code, 2)::integer)
      into v_clinic_number
      from public.clients c
     where c.clinic_id = p_clinic_id
       and c.client_code ~ '^[0-9]{6}$'
     having count(distinct left(c.client_code, 2)) = 1;
  end if;

  -- Stable fallback for a newly provisioned tenant whose token lacks clinic_number.
  if v_clinic_number is null then
    v_clinic_number := mod(abs(hashtext(p_clinic_id::text)::bigint), 99)::integer + 1;
  end if;
  if v_clinic_number < 1 or v_clinic_number > 99 then
    raise exception 'Clinic number must be between 1 and 99';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_clinic_id::text), hashtext('vetra_client_code_allocation'));

  for v_attempt in 1..100 loop
    v_suffix := floor(random() * 10000)::integer;
    v_candidate := lpad(v_clinic_number::text, 2, '0') || lpad(v_suffix::text, 4, '0');
    if v_candidate = p_current_code then continue; end if;
    if not exists (
      select 1 from public.clients c
       where c.clinic_id = p_clinic_id and c.client_code = v_candidate
    ) then
      return v_candidate;
    end if;
  end loop;

  raise exception 'Could not allocate a unique Client ID';
end;
$$;

create or replace function public.vetra_assign_client_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
begin
  if tg_op <> 'INSERT' then return new; end if;
  if v_clinic_id is null then raise exception 'An active clinic session is required'; end if;

  -- Explicit legacy/import codes remain intact; ordinary inserts are automatic.
  if nullif(btrim(new.client_code), '') is null then
    new.client_code := public.vetra_allocate_client_code(v_clinic_id);
  end if;
  return new;
end;
$$;

drop trigger if exists vetra_z_client_code_auto_generate on public.clients;
create trigger vetra_z_client_code_auto_generate
before insert on public.clients
for each row execute function public.vetra_assign_client_code();

create or replace function public.vetra_generate_client_code(p_client_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_current_code text;
  v_generated_code text;
begin
  if v_clinic_id is null then raise exception 'An active clinic session is required'; end if;
  if not public.vetra_has_clinic_staff_permission('patients', 'edit') then
    raise exception 'Patient edit permission is required';
  end if;

  select c.client_code into v_current_code
    from public.clients c
   where c.id = p_client_id and c.clinic_id = v_clinic_id
   for update;
  if not found then raise exception 'Client not found in the active clinic'; end if;

  v_generated_code := public.vetra_allocate_client_code(v_clinic_id, v_current_code);
  update public.clients
     set client_code = v_generated_code, updated_at = now()
   where id = p_client_id and clinic_id = v_clinic_id
   returning client_code into v_generated_code;
  return v_generated_code;
end;
$$;

revoke all on function public.vetra_allocate_client_code(uuid, text) from public, anon;
revoke all on function public.vetra_assign_client_code() from public, anon;
revoke all on function public.vetra_generate_client_code(uuid) from public, anon;
grant execute on function public.vetra_generate_client_code(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

select to_regprocedure('public.vetra_generate_client_code(uuid)') as client_code_rpc,
       to_regprocedure('public.vetra_assign_client_code()') as client_code_trigger_function;
