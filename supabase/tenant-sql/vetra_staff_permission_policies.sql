-- Additive permission gates for staff, inventory, and financial reads.
-- Apply after finance SQL, vetra_auto_open_cash_register.sql, vetra_clinic_staff.sql,
-- vetra_clinic_staff_permissions.sql, vetra_inventory_purchases.sql, and updated vetra_staff_permission_rls.sql.
begin;

do $$
declare
  v_required record;
begin
  if to_regprocedure('public.vetra_has_clinic_staff_permission(text,text)') is null then
    raise exception 'Apply vetra_staff_permission_rls.sql first; permission helper is missing.';
  end if;
  if to_regprocedure('public.vetra_update_clinic_staff_permissions(uuid,jsonb)') is null
     or to_regprocedure('public.vetra_link_clinic_staff_account(uuid,uuid,text,boolean)') is null
     or to_regprocedure('public.vetra_mark_clinic_staff_password_changed()') is null then
    raise exception 'Apply the updated vetra_staff_permission_rls.sql first; checked clinic_staff update routines are missing.';
  end if;

  -- Do not enable RLS on product tables unless their old tenant policies exist.
  -- If this check fails, no policy changes are committed; add/verify base policies first.
  for v_required in
    select * from (values
      ('products', 'SELECT'), ('products', 'INSERT'), ('products', 'UPDATE'),
      ('product_categories', 'SELECT'), ('product_categories', 'INSERT'),
      ('product_categories', 'UPDATE'), ('product_categories', 'DELETE'),
      ('inventory_suppliers', 'SELECT'), ('inventory_purchases', 'SELECT'),
      ('inventory_purchase_items', 'SELECT'), ('financial_accounts', 'SELECT'),
      ('cash_register_sessions', 'SELECT'), ('financial_transactions', 'SELECT')
    ) as required_policy(table_name, command_name)
  loop
    if not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = v_required.table_name
        and p.permissive = 'PERMISSIVE'
        and (p.cmd = v_required.command_name or p.cmd = 'ALL')
    ) then
      raise exception 'Missing existing permissive tenant policy for %.%. No permission policies were applied.', v_required.command_name, v_required.table_name;
    end if;
  end loop;
end;
$$;

alter table public.clinic_staff enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.inventory_suppliers enable row level security;
alter table public.inventory_purchases enable row level security;
alter table public.inventory_purchase_items enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.cash_register_sessions enable row level security;
alter table public.financial_transactions enable row level security;

-- clinic_staff: users can read their own permission row; listing and mutations require view plus the requested action.
drop policy if exists vetra_staff_directory_select_guard on public.clinic_staff;
create policy vetra_staff_directory_select_guard on public.clinic_staff
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (auth_user_id = auth.uid() or public.vetra_has_clinic_staff_permission('staff', 'view')));
drop policy if exists vetra_staff_directory_insert_guard on public.clinic_staff;
create policy vetra_staff_directory_insert_guard on public.clinic_staff
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'create'));
drop policy if exists vetra_staff_directory_update_guard on public.clinic_staff;
create policy vetra_staff_directory_update_guard on public.clinic_staff
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'edit'));
drop policy if exists vetra_staff_directory_delete_guard on public.clinic_staff;
create policy vetra_staff_directory_delete_guard on public.clinic_staff
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('staff', 'view')
    and public.vetra_has_clinic_staff_permission('staff', 'delete'));

-- Inventory tables: keep the existing clinic isolation policies and add permission checks.
drop policy if exists vetra_staff_products_select_guard on public.products;
create policy vetra_staff_products_select_guard on public.products
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('inventory', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('prescriptions', 'view')
      or public.vetra_has_clinic_staff_permission('prescriptions', 'create')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'view')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'create')
      or public.vetra_has_clinic_staff_permission('invoices_page', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')
    ));
drop policy if exists vetra_staff_products_insert_guard on public.products;
create policy vetra_staff_products_insert_guard on public.products
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_products_update_guard on public.products;
create policy vetra_staff_products_update_guard on public.products
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_products_delete_guard on public.products;
create policy vetra_staff_products_delete_guard on public.products
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

drop policy if exists vetra_staff_product_categories_select_guard on public.product_categories;
create policy vetra_staff_product_categories_select_guard on public.product_categories
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('inventory', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'view')
      or public.vetra_has_clinic_staff_permission('medical_records', 'create')
      or public.vetra_has_clinic_staff_permission('prescriptions', 'view')
      or public.vetra_has_clinic_staff_permission('prescriptions', 'create')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'view')
      or public.vetra_has_clinic_staff_permission('vaccinations', 'create')
      or public.vetra_has_clinic_staff_permission('invoices_page', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')
    ));
drop policy if exists vetra_staff_product_categories_insert_guard on public.product_categories;
create policy vetra_staff_product_categories_insert_guard on public.product_categories
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_product_categories_update_guard on public.product_categories;
create policy vetra_staff_product_categories_update_guard on public.product_categories
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_product_categories_delete_guard on public.product_categories;
create policy vetra_staff_product_categories_delete_guard on public.product_categories
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

-- Supplier and purchase direct table access is restricted too; SECURITY DEFINER purchase functions
-- receive the same checks in vetra_inventory_purchases.sql.
drop policy if exists vetra_staff_inventory_suppliers_select_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_select_guard on public.inventory_suppliers
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'view'));
drop policy if exists vetra_staff_inventory_suppliers_insert_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_insert_guard on public.inventory_suppliers
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_inventory_suppliers_update_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_update_guard on public.inventory_suppliers
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_inventory_suppliers_delete_guard on public.inventory_suppliers;
create policy vetra_staff_inventory_suppliers_delete_guard on public.inventory_suppliers
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

drop policy if exists vetra_staff_inventory_purchases_select_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_select_guard on public.inventory_purchases
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'view'));
drop policy if exists vetra_staff_inventory_purchases_insert_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_insert_guard on public.inventory_purchases
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_inventory_purchases_update_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_update_guard on public.inventory_purchases
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_inventory_purchases_delete_guard on public.inventory_purchases;
create policy vetra_staff_inventory_purchases_delete_guard on public.inventory_purchases
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

-- Purchase line items must follow the same view/create/edit/delete boundaries as the parent purchase.
drop policy if exists vetra_staff_inventory_purchase_items_select_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_select_guard on public.inventory_purchase_items
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'view'));
drop policy if exists vetra_staff_inventory_purchase_items_insert_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_insert_guard on public.inventory_purchase_items
  as restrictive for insert to authenticated
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'create'));
drop policy if exists vetra_staff_inventory_purchase_items_update_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_update_guard on public.inventory_purchase_items
  as restrictive for update to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'))
  with check (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'edit'));
drop policy if exists vetra_staff_inventory_purchase_items_delete_guard on public.inventory_purchase_items;
create policy vetra_staff_inventory_purchase_items_delete_guard on public.inventory_purchase_items
  as restrictive for delete to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('inventory', 'delete'));

-- Financial reads are split between Finance and register permissions.
-- The Finance page may read account balances, invoice summaries, and the movement ledger;
-- the cash-register page requires the more specific payments.view permission.
drop policy if exists vetra_staff_financial_accounts_select_guard on public.financial_accounts;
create policy vetra_staff_financial_accounts_select_guard on public.financial_accounts
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (public.vetra_has_clinic_staff_permission('finance_page', 'view')
      or public.vetra_has_clinic_staff_permission('payments', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')));
drop policy if exists vetra_staff_cash_sessions_select_guard on public.cash_register_sessions;
create policy vetra_staff_cash_sessions_select_guard on public.cash_register_sessions
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('payments', 'view'));
drop policy if exists vetra_staff_financial_transactions_select_guard on public.financial_transactions;
create policy vetra_staff_financial_transactions_select_guard on public.financial_transactions
  as restrictive for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id()
    and (public.vetra_has_clinic_staff_permission('finance_page', 'view')
      or public.vetra_has_clinic_staff_permission('payments', 'view')
      or public.vetra_has_clinic_staff_permission('invoices', 'create')));

-- The existing invoice and invoice-item select guards are also recreated by the updated
-- vetra_staff_permission_rls.sql so Finance can show its authorized invoice summaries.
commit;