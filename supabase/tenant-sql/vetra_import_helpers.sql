-- Shared import parsing helpers used by the staged legacy import engine.
-- The original VETRA_TWO_PAGE_IMPORT_ENGINE.sql referenced by older installer
-- files is not present in the repository or local SQL downloads. These
-- compatible helpers cover the functions required by the current staged UI.
begin;

create or replace function public.vetra_legacy_json_text(
  p_payload jsonb,
  p_candidates text[]
) returns text
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  v_key text;
  v_value text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or p_candidates is null then
    return null;
  end if;
  foreach v_key in array p_candidates loop
    if p_payload ? v_key then
      v_value := p_payload ->> v_key;
      if nullif(btrim(v_value), '') is not null then
        return btrim(v_value);
      end if;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.vetra_legacy_try_numeric(p_value text)
returns numeric
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  v text := nullif(btrim(p_value), '');
  v_comma integer;
  v_dot integer;
begin
  if v is null then return null; end if;
  v := regexp_replace(v, '[^0-9,.+ -]', '', 'g');
  v := replace(v, ' ', '');
  if v = '' or v in ('-', '+', '.', ',') then return null; end if;
  v_comma := strpos(reverse(v), ',');
  v_dot := strpos(reverse(v), '.');

  if position(',' in v) > 0 and position('.' in v) > 0 then
    if v_comma < v_dot then
      v := replace(v, '.', '');
      v := replace(v, ',', '.');
    else
      v := replace(v, ',', '');
    end if;
  elsif position(',' in v) > 0 then
    if length(v) - length(regexp_replace(v, ',', '', 'g')) = 1
       and length(v) - strpos(v, ',') in (1, 2) then
      v := replace(v, ',', '.');
    else
      v := replace(v, ',', '');
    end if;
  elsif length(v) - length(regexp_replace(v, '\.', '', 'g')) > 1 then
    v := replace(v, '.', '');
  end if;

  return v::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.vetra_legacy_try_date(p_value text)
returns date
language plpgsql
stable
parallel safe
set search_path = pg_catalog
as $$
declare
  v text := nullif(btrim(p_value), '');
  m text[];
begin
  if v is null then return null; end if;
  if v ~ '^([0-3]?[0-9])/([0-1]?[0-9])/([0-9]{4})$' then
    m := regexp_match(v, '^([0-3]?[0-9])/([0-1]?[0-9])/([0-9]{4})$');
    return make_date(m[3]::integer, m[2]::integer, m[1]::integer);
  end if;
  if v ~ '^([0-9]{4})/([0-1]?[0-9])/([0-3]?[0-9])$' then
    m := regexp_match(v, '^([0-9]{4})/([0-1]?[0-9])/([0-3]?[0-9])$');
    return make_date(m[1]::integer, m[2]::integer, m[3]::integer);
  end if;
  return v::date;
exception when others then
  return null;
end;
$$;

create or replace function public.vetra_legacy_try_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
parallel safe
set search_path = pg_catalog
as $$
declare
  v text := nullif(btrim(p_value), '');
  m text[];
begin
  if v is null then return null; end if;
  begin
    return v::timestamptz;
  exception when others then
    null;
  end;
  if v ~ '^([0-3]?[0-9])/([0-1]?[0-9])/([0-9]{4})([ T].*)?$' then
    m := regexp_match(v, '^([0-3]?[0-9])/([0-1]?[0-9])/([0-9]{4})([ T].*)?$');
    return (make_date(m[3]::integer, m[2]::integer, m[1]::integer)::timestamp
      + coalesce(nullif(btrim(m[4]), '')::time, time '00:00'))::timestamptz;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

revoke all on function public.vetra_legacy_json_text(jsonb, text[]) from public, anon;
revoke all on function public.vetra_legacy_try_numeric(text) from public, anon;
revoke all on function public.vetra_legacy_try_date(text) from public, anon;
revoke all on function public.vetra_legacy_try_timestamptz(text) from public, anon;
grant execute on function public.vetra_legacy_json_text(jsonb, text[]) to authenticated;
grant execute on function public.vetra_legacy_try_numeric(text) to authenticated;
grant execute on function public.vetra_legacy_try_date(text) to authenticated;
grant execute on function public.vetra_legacy_try_timestamptz(text) to authenticated;

commit;
