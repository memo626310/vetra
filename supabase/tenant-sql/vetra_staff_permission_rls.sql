-- Enforce staff permissions for invoice records at the clinic database boundary.
-- Run on each clinic tenant database after vetra_clinic_staff_permissions.sql.
begin;

create or replace function public.vetra_has_clinic_staff_permission(
  p_permission text,
  p_action text
) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_permissions jsonb;
begin
  if v_clinic_id is null or auth.uid() is null then
    return false;
  end if;

  select permissions into v_permissions
  from public.clinic_staff
  where clinic_id = v_clinic_id and auth_user_id = auth.uid()
  limit 1;

  -- Clinic members without a staff-directory row are clinic owners/admins.
  if not found then
    return true;
  end if;

  return coalesce((v_permissions #>> array[p_permission, p_action])::boolean, false);
end;
$$;

revoke all on function public.vetra_has_clinic_staff_permission(text, text) from public, anon;
grant execute on function public.vetra_has_clinic_staff_permission(text, text) to authenticated;

-- Only the following checked routines may update clinic_staff after the raw UPDATE grant is revoked.
create or replace function public.vetra_update_clinic_staff_permissions(
  p_staff_id uuid,
  p_permissions jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_group record;
  v_action record;
  v_saved jsonb;
  v_allowed_groups text[] := array['patients','all_patients','appointments','medical_records','prescriptions','vaccinations','invoices_page','invoices','finance_page','payments','inventory','reports','messages','staff','clinic_settings'];
  v_allowed_actions text[] := array['view','create','edit','delete','export'];
begin
  if v_clinic_id is null or auth.uid() is null then
    raise exception 'No active VETRA clinic found in token';
  end if;
  if p_staff_id is null or jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'Invalid staff permissions payload';
  end if;
  if not public.vetra_has_clinic_staff_permission('staff', 'view')
     or not public.vetra_has_clinic_staff_permission('staff', 'edit') then
    raise exception 'Staff edit permission is required';
  end if;

  for v_group in select key, value from jsonb_each(p_permissions)
  loop
    if not (v_group.key = any(v_allowed_groups)) or jsonb_typeof(v_group.value) <> 'object' then
      raise exception 'Invalid staff permission group';
    end if;
    for v_action in select key, value from jsonb_each(v_group.value)
    loop
      if not (v_action.key = any(v_allowed_actions)) or jsonb_typeof(v_action.value) <> 'boolean' then
        raise exception 'Invalid staff permission action';
      end if;
      if v_action.value = 'true'::jsonb
         and not public.vetra_has_clinic_staff_permission(v_group.key, v_action.key) then
        raise exception 'Cannot grant a permission the current user does not have';
      end if;
    end loop;
  end loop;

  update public.clinic_staff
  set permissions = p_permissions, updated_at = now()
  where id = p_staff_id and clinic_id = v_clinic_id
  returning permissions into v_saved;
  if not found then raise exception 'Staff member not found in this clinic'; end if;
  return v_saved;
end;
$$;

create or replace function public.vetra_link_clinic_staff_account(
  p_staff_id uuid,
  p_auth_user_id uuid,
  p_login_email text,
  p_must_change_password boolean
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_existing_auth_user_id uuid;
begin
  if v_clinic_id is null or auth.uid() is null then
    raise exception 'No active VETRA clinic found in token';
  end if;
  if p_staff_id is null or p_auth_user_id is null or nullif(trim(p_login_email), '') is null then
    raise exception 'Invalid staff account link';
  end if;

  select auth_user_id into v_existing_auth_user_id
  from public.clinic_staff
  where id = p_staff_id and clinic_id = v_clinic_id
  for update;
  if not found then raise exception 'Staff member not found in this clinic'; end if;

  if v_existing_auth_user_id is null then
    if not public.vetra_has_clinic_staff_permission('staff', 'view')
       or not public.vetra_has_clinic_staff_permission('staff', 'create') then
      raise exception 'Staff create permission is required';
    end if;
  else
    if p_auth_user_id <> v_existing_auth_user_id then
      raise exception 'An existing staff login cannot be relinked';
    end if;
    if not public.vetra_has_clinic_staff_permission('staff', 'view')
       or not public.vetra_has_clinic_staff_permission('staff', 'edit') then
      raise exception 'Staff edit permission is required';
    end if;
  end if;

  update public.clinic_staff
  set auth_user_id = p_auth_user_id,
      login_email = trim(p_login_email),
      must_change_password = coalesce(p_must_change_password, true),
      updated_at = now()
  where id = p_staff_id and clinic_id = v_clinic_id;
end;
$$;

create or replace function public.vetra_mark_clinic_staff_password_changed()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
begin
  if v_clinic_id is null or auth.uid() is null then
    raise exception 'No active VETRA clinic found in token';
  end if;
  update public.clinic_staff
  set must_change_password = false, updated_at = now()
  where clinic_id = v_clinic_id and auth_user_id = auth.uid();
end;
$$;

revoke all on function public.vetra_update_clinic_staff_permissions(uuid, jsonb) from public, anon;
revoke all on function public.vetra_link_clinic_staff_account(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.vetra_mark_clinic_staff_password_changed() from public, anon;
grant execute on function public.vetra_update_clinic_staff_permissions(uuid, jsonb) to authenticated;
grant execute on function public.vetra_link_clinic_staff_account(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.vetra_mark_clinic_staff_password_changed() to authenticated;
revoke update on public.clinic_staff from authenticated;

alter table public.invoices enable row level security;
drop policy if exists vetra_staff_invoices_select_guard on public.invoices;
create policy vetra_staff_invoices_select_guard on public.invoices
  as restrictive for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices_page', 'view')
        or public.vetra_has_clinic_staff_permission('finance_page', 'view')
        or public.vetra_has_clinic_staff_permission('invoices', 'create')
    )
  );
drop policy if exists vetra_staff_invoices_select on public.invoices;
create policy vetra_staff_invoices_select on public.invoices
  for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices_page', 'view')
  );
drop policy if exists vetra_staff_invoices_insert_guard on public.invoices;
create policy vetra_staff_invoices_insert_guard on public.invoices
  as restrictive for insert to authenticated
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'create')
  );
drop policy if exists vetra_staff_invoices_insert on public.invoices;
create policy vetra_staff_invoices_insert on public.invoices
  for insert to authenticated
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'create')
  );
drop policy if exists vetra_staff_invoices_update_guard on public.invoices;
create policy vetra_staff_invoices_update_guard on public.invoices
  as restrictive for update to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  )
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  );
drop policy if exists vetra_staff_invoices_update on public.invoices;
create policy vetra_staff_invoices_update on public.invoices
  for update to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  )
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  );
drop policy if exists vetra_staff_invoices_delete_guard on public.invoices;
create policy vetra_staff_invoices_delete_guard on public.invoices
  as restrictive for delete to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'delete')
  );
drop policy if exists vetra_staff_invoices_delete on public.invoices;
create policy vetra_staff_invoices_delete on public.invoices
  for delete to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'delete')
  );

alter table public.invoice_items enable row level security;
drop policy if exists vetra_staff_invoice_items_select_guard on public.invoice_items;
create policy vetra_staff_invoice_items_select_guard on public.invoice_items
  as restrictive for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices_page', 'view')
        or public.vetra_has_clinic_staff_permission('finance_page', 'view')
        or public.vetra_has_clinic_staff_permission('invoices', 'create')
    )
  );
drop policy if exists vetra_staff_invoice_items_select on public.invoice_items;
create policy vetra_staff_invoice_items_select on public.invoice_items
  for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_staff_invoice_items_insert_guard on public.invoice_items;
create policy vetra_staff_invoice_items_insert_guard on public.invoice_items
  as restrictive for insert to authenticated
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'create')
  );
drop policy if exists vetra_staff_invoice_items_insert on public.invoice_items;
create policy vetra_staff_invoice_items_insert on public.invoice_items
  for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_staff_invoice_items_update_guard on public.invoice_items;
create policy vetra_staff_invoice_items_update_guard on public.invoice_items
  as restrictive for update to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  )
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'edit')
  );
drop policy if exists vetra_staff_invoice_items_update on public.invoice_items;
create policy vetra_staff_invoice_items_update on public.invoice_items
  for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_staff_invoice_items_delete_guard on public.invoice_items;
create policy vetra_staff_invoice_items_delete_guard on public.invoice_items
  as restrictive for delete to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'delete')
  );
drop policy if exists vetra_staff_invoice_items_delete on public.invoice_items;
create policy vetra_staff_invoice_items_delete on public.invoice_items
  for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id());

grant select, insert, update, delete on public.invoices, public.invoice_items to authenticated;
revoke all on public.invoices, public.invoice_items from anon, public;

-- The existing issue_invoice function contains an admin-only guard. Replace only
-- that guard with the saved invoice-create permission while preserving the
-- function's existing issuance and inventory logic.
do $$
declare
  v_function record;
  v_definition text;
  v_replacement text := 'if not public.vetra_has_clinic_staff_permission(''invoices'', ''create'') then raise exception ''Invoice creation permission is required''; end if;';
  v_updated integer := 0;
begin
  for v_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'issue_invoice'
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if v_definition ~* 'raise[[:space:]]+exception[[:space:]]+''Only admins can issue invoices''[[:space:]]*;' then
      v_definition := regexp_replace(
        v_definition,
        'raise[[:space:]]+exception[[:space:]]+''Only admins can issue invoices''[[:space:]]*;',
        v_replacement,
        'gi'
      );
      execute v_definition;
      v_updated := v_updated + 1;
    end if;
  end loop;

  if v_updated = 0 then
    raise exception 'Could not find the expected admin-only guard in public.issue_invoice. No invoice function was changed.';
  end if;
end;
$$;

commit;
