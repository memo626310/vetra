-- Apply to each clinic tenant database after vetra_staff_permission_rls.sql.
-- Adds action guards to existing tenant isolation; does not replace it.
begin;
do $$
declare
  t text;
  a text;
  permission_action text;
  policy_name text;
begin
  foreach t in array array['visits', 'pet_medical_records', 'visit_attachments'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'Required medical table missing: %', t;
    end if;
    foreach a in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = t
          and permissive = 'PERMISSIVE' and cmd in (a, 'ALL')
      ) then
        raise exception 'Missing tenant policy for % on %', a, t;
      end if;
      permission_action := case a when 'INSERT' then 'create' when 'UPDATE' then 'edit' else 'delete' end;
      policy_name := 'vetra_medical_' || lower(a) || '_guard';
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', policy_name, t);
      if a = 'INSERT' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''medical_records'', %L))', policy_name, t, permission_action);
      elsif a = 'UPDATE' then
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''medical_records'', %L)) with check (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''medical_records'', %L))', policy_name, t, permission_action, permission_action);
      else
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using (clinic_id = public.vetra_current_clinic_id() and public.vetra_has_clinic_staff_permission(''medical_records'', %L))', policy_name, t, permission_action);
      end if;
    end loop;
  end loop;
end;
$$;
commit;
