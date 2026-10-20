-- Run this in each clinic's tenant database (the database URL returned by VETRA Core),
-- not in the VETRA Core project. Pet owners must never receive general UPDATE access
-- to the pets table; this function limits the write to their own pet.

create or replace function public.vetra_update_pet_photo_for_owner(
  p_pet_id uuid,
  p_photo_url text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  v_client_code text := nullif(trim(v_headers ->> 'x-vetra-client-code'), '');
  v_client_phone text := nullif(trim(v_headers ->> 'x-vetra-client-phone'), '');
  v_client_id uuid;
  v_updated_pet_id uuid;
begin
  -- Owner portal requests include the same Client ID + phone pair used at login.
  -- Resolve that pair in this tenant DB; auth.uid() is not the clients.id here.
  if v_client_code is not null and v_client_phone is not null then
    begin
      select c.id into v_client_id
      from public.clients c
      where c.client_code = v_client_code
        and regexp_replace(coalesce(c.phone, ''), '\s+', '', 'g') =
            regexp_replace(v_client_phone, '\s+', '', 'g')
      limit 1;
    end;
  else
    -- Retain compatibility for deployments that put the owner UUID in the JWT.
    v_client_id := auth.uid();
    if v_client_id is null then
      begin
        v_client_id := nullif(auth.jwt() ->> 'client_id', '')::uuid;
      exception when invalid_text_representation then
        v_client_id := null;
      end;
    end if;
  end if;

  if v_client_id is null then
    raise exception 'Pet owner session could not be verified in this clinic database';
  end if;
  if p_pet_id is null then
    raise exception 'Pet ID is required';
  end if;
  if p_photo_url is not null and (
    length(p_photo_url) > 2048
    or p_photo_url !~ '^https://[^/]+\.supabase\.co/storage/v1/object/(public/)?pet-photos/'
    or strpos(p_photo_url, '/' || p_pet_id::text || '/') = 0
  ) then
    raise exception 'Invalid pet photo URL';
  end if;

  update public.pets
  set photo_url = p_photo_url
  where id = p_pet_id
    and client_id = v_client_id
  returning id into v_updated_pet_id;

  if v_updated_pet_id is null then
    raise exception 'Pet not found for this owner';
  end if;

  return v_updated_pet_id;
end;
$$;

revoke all on function public.vetra_update_pet_photo_for_owner(uuid, text) from public;
grant execute on function public.vetra_update_pet_photo_for_owner(uuid, text) to anon, authenticated;
