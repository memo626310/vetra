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

alter table public.invoices enable row level security;
drop policy if exists vetra_staff_invoices_select_guard on public.invoices;
create policy vetra_staff_invoices_select_guard on public.invoices
  as restrictive for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices_page', 'view')
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
