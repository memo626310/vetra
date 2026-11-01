-- Run on each clinic tenant database, not VETRA CORE.
-- Generates the six-digit Client ID used by the client portal:
--   first two digits = the clinic number from the signed clinic JWT
--   last four digits = a unique random client suffix within that clinic
begin;

create or replace function public.vetra_generate_client_code(p_client_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_claims jsonb;
  v_clinic_number integer;
  v_current_code text;
  v_candidate text;
  v_generated_code text;
  v_random bytea;
  v_suffix integer;
  v_attempt integer;
begin
  if v_clinic_id is null then
    raise exception 'An active clinic session is required';
  end if;

  if not public.vetra_has_clinic_staff_permission('patients', 'edit') then
    raise exception 'Patient edit permission is required';
  end if;

  select c.client_code
    into v_current_code
  from public.clients c
  where c.id = p_client_id
    and c.clinic_id = v_clinic_id
  for update;

  if not found then
    raise exception 'Client not found in the active clinic';
  end if;

  v_claims := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
  if (v_claims ->> 'clinic_number') ~ '^[0-9]{1,2}$' then
    v_clinic_number := (v_claims ->> 'clinic_number')::integer;
  end if;

  -- Keep existing six-digit clients working with older clinic tokens while
  -- the signed clinic_number claim is rolled out everywhere.
  if v_clinic_number is null and v_current_code ~ '^[0-9]{6}$' then
    v_clinic_number := left(v_current_code, 2)::integer;
  end if;

  if v_clinic_number is null then
    select min(left(c.client_code, 2)::integer)
      into v_clinic_number
    from public.clients c
    where c.clinic_id = v_clinic_id
      and c.client_code ~ '^[0-9]{6}$'
    having count(distinct left(c.client_code, 2)) = 1;
  end if;

  if v_clinic_number is null or v_clinic_number < 1 or v_clinic_number > 99 then
    raise exception 'Clinic number is missing from the active clinic token';
  end if;

  for v_attempt in 1..100 loop
    v_random := gen_random_bytes(2);
    v_suffix := mod(get_byte(v_random, 0) * 256 + get_byte(v_random, 1), 10000);
    v_candidate := lpad(v_clinic_number::text, 2, '0') || lpad(v_suffix::text, 4, '0');

    if v_candidate = v_current_code then
      continue;
    end if;

    begin
      if exists (
        select 1
        from public.clients c
        where c.clinic_id = v_clinic_id
          and c.client_code = v_candidate
      ) then
        continue;
      end if;

      update public.clients
      set client_code = v_candidate,
          updated_at = now()
      where id = p_client_id
        and clinic_id = v_clinic_id
      returning client_code into v_generated_code;

      if v_generated_code is not null then
        return v_generated_code;
      end if;
    exception when unique_violation then
      -- A concurrent generator may have claimed this suffix after the
      -- existence check. Retry with another suffix.
      null;
    end;
  end loop;

  raise exception 'Could not allocate a unique Client ID';
end;
$$;

revoke all on function public.vetra_generate_client_code(uuid) from public, anon;
grant execute on function public.vetra_generate_client_code(uuid) to authenticated;
commit;
