-- Run in VETRA Core only, after the repair script verifies the actual tenant
-- PostgREST JWT secret and stores it as vetra_tenant_jwt_secret in Core Vault.
-- Preserve the old secret for rollback. Do not rotate Auth keys or API keys.
-- CREATE OR REPLACE retains the existing function privileges and owner.
begin;
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'vetra_tenant_jwt_secret' and decrypted_secret <> '') then
    raise exception 'Verify and store the tenant PostgREST signing secret first';
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.issue_pet_owner_access_token(p_client_code text, p_phone text)
 RETURNS TABLE(access_token text, database_url text, database_publishable_key text, clinic_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_client_code text;
  v_phone text;

  v_clinic_number integer;
  v_clinic_id uuid;

  v_database_url text;
  v_database_key text;

  v_secret text;

  v_now bigint;
  v_exp bigint;

  v_header text;
  v_payload text;
  v_unsigned text;
  v_signature text;
begin
  v_client_code :=
    regexp_replace(
      trim(coalesce(p_client_code, '')),
      '\s+',
      '',
      'g'
    );

  v_phone :=
    regexp_replace(
      trim(coalesce(p_phone, '')),
      '\s+',
      '',
      'g'
    );

  -- New Client ID format:
  -- 01 2746 = Clinic 01 / Client 2746
  if v_client_code !~ '^[0-9]{6}$' then
    raise exception 'Invalid Client ID format';
  end if;

  if v_phone = '' then
    raise exception 'Phone number is required';
  end if;

  v_clinic_number :=
    left(v_client_code, 2)::integer;

  if v_clinic_number < 1
     or v_clinic_number > 99 then
    raise exception 'Invalid clinic number';
  end if;

  select c.id
  into v_clinic_id
  from public.clinics c
  where c.clinic_number = v_clinic_number
    and c.status = 'active'
  limit 1;

  if v_clinic_id is null then
    raise exception 'Clinic not found';
  end if;

  select
    cd.database_url,
    cd.database_publishable_key
  into
    v_database_url,
    v_database_key
  from public.clinic_databases cd
  where cd.clinic_id = v_clinic_id
    and cd.status = 'ready'
    and cd.database_url is not null
    and cd.database_publishable_key is not null
  order by cd.created_at asc
  limit 1;

  if v_database_url is null
     or v_database_key is null then
    raise exception 'Clinic database is not ready';
  end if;

  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name = 'vetra_tenant_jwt_secret'
  limit 1;

  if v_secret is null or v_secret = '' then
    raise exception 'VETRA tenant JWT secret is missing';
  end if;

  v_now :=
    extract(
      epoch from clock_timestamp()
    )::bigint;

  v_exp := v_now + 1800;

  -- JWT HEADER
  v_header :=
    regexp_replace(
      encode(
        convert_to(
          jsonb_build_object(
            'alg', 'HS256',
            'typ', 'JWT'
          )::text,
          'UTF8'
        ),
        'base64'
      ),
      '\s',
      '',
      'g'
    );

  v_header := replace(v_header, '+', '-');
  v_header := replace(v_header, '/', '_');
  v_header := rtrim(v_header, '=');

  -- JWT PAYLOAD
  v_payload :=
    regexp_replace(
      encode(
        convert_to(
          jsonb_build_object(
            'sub',
              md5(
                v_clinic_id::text
                || '|'
                || v_client_code
                || '|'
                || v_phone
                || '|'
                || v_now::text
              ),
            'role', 'authenticated',
            'aud', 'authenticated',
            'actor_type', 'pet_owner',
            'clinic_id', v_clinic_id::text,
            'clinic_number', v_clinic_number,
            'client_code', v_client_code,
            'pet_owner_phone', v_phone,
            'iat', v_now,
            'exp', v_exp
          )::text,
          'UTF8'
        ),
        'base64'
      ),
      '\s',
      '',
      'g'
    );

  v_payload := replace(v_payload, '+', '-');
  v_payload := replace(v_payload, '/', '_');
  v_payload := rtrim(v_payload, '=');

  v_unsigned :=
    v_header || '.' || v_payload;

  -- HS256 SIGNATURE
  v_signature :=
    regexp_replace(
      encode(
        extensions.hmac(
          v_unsigned,
          v_secret,
          'sha256'
        ),
        'base64'
      ),
      '\s',
      '',
      'g'
    );

  v_signature := replace(v_signature, '+', '-');
  v_signature := replace(v_signature, '/', '_');
  v_signature := rtrim(v_signature, '=');

  return query
  select
    v_unsigned || '.' || v_signature,
    v_database_url,
    v_database_key,
    v_clinic_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.issue_my_clinic_access_token()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_clinic_id uuid;
  v_clinic_number integer;
  v_doctor_id uuid;
  v_secret text;

  v_now bigint;
  v_exp bigint;

  v_header text;
  v_payload text;
  v_unsigned text;
  v_signature text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT
    clinic_id,
    doctor_id
  INTO
    v_clinic_id,
    v_doctor_id
  FROM public.get_my_clinic_context()
  LIMIT 1;

  IF v_clinic_id IS NULL OR v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'No active clinic context found';
  END IF;

  SELECT clinic_number
  INTO v_clinic_number
  FROM public.clinics
  WHERE id = v_clinic_id;

  IF v_clinic_number IS NULL THEN
    RAISE EXCEPTION 'Clinic number is missing';
  END IF;

  SELECT decrypted_secret
  INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'vetra_tenant_jwt_secret'
  LIMIT 1;

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'VETRA tenant JWT secret is missing';
  END IF;

  v_now := extract(epoch FROM clock_timestamp())::bigint;
  v_exp := v_now + 1800;

  v_header :=
    regexp_replace(
      encode(
        convert_to(
          jsonb_build_object(
            'alg', 'HS256',
            'typ', 'JWT'
          )::text,
          'UTF8'
        ),
        'base64'
      ),
      '\s',
      '',
      'g'
    );

  v_header := replace(v_header, '+', '-');
  v_header := replace(v_header, '/', '_');
  v_header := rtrim(v_header, '=');

  v_payload :=
    regexp_replace(
      encode(
        convert_to(
          jsonb_build_object(
            'sub', v_doctor_id::text,
            'role', 'authenticated',
            'aud', 'authenticated',
            'actor_type', 'doctor',
            'clinic_id', v_clinic_id::text,
            'clinic_number', v_clinic_number,
            'iat', v_now,
            'exp', v_exp
          )::text,
          'UTF8'
        ),
        'base64'
      ),
      '\s',
      '',
      'g'
    );

  v_payload := replace(v_payload, '+', '-');
  v_payload := replace(v_payload, '/', '_');
  v_payload := rtrim(v_payload, '=');

  v_unsigned := v_header || '.' || v_payload;

  v_signature :=
    regexp_replace(
      encode(
        extensions.hmac(
          v_unsigned,
          v_secret,
          'sha256'
        ),
        'base64'
      ),
      '\s',
      '',
      'g'
    );

  v_signature := replace(v_signature, '+', '-');
  v_signature := replace(v_signature, '/', '_');
  v_signature := rtrim(v_signature, '=');

  RETURN v_unsigned || '.' || v_signature;
END;
$function$;

notify pgrst, 'reload schema';
commit;
