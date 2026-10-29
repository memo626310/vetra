-- VETRA inventory purchases
-- Run on each shared clinic database after the finance and inventory tables exist.

begin;

create table if not exists public.inventory_suppliers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (clinic_id, name)
);

create table if not exists public.inventory_purchases (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  supplier_id uuid not null references public.inventory_suppliers(id) on delete restrict,
  supplier_name text not null,
  account_id uuid references public.financial_accounts(id) on delete restrict,
  payment_type text not null default 'cash' check (payment_type in ('cash', 'credit')),
  financial_transaction_id uuid references public.financial_transactions(id) on delete restrict,
  total_amount numeric(14,2) not null check (total_amount > 0),
  invoice_reference text,
  notes text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (clinic_id, idempotency_key)
);

-- Upgrade existing clinic databases as well as fresh installations.
alter table public.inventory_purchases alter column account_id drop not null;
alter table public.inventory_purchases add column if not exists payment_type text not null default 'cash';
alter table public.inventory_purchases drop constraint if exists inventory_purchases_payment_type_check;
alter table public.inventory_purchases add constraint inventory_purchases_payment_type_check
  check (payment_type in ('cash', 'credit'));
alter table public.inventory_purchases drop constraint if exists inventory_purchases_payment_account_check;
alter table public.inventory_purchases add constraint inventory_purchases_payment_account_check
  check ((payment_type = 'cash' and account_id is not null) or
         (payment_type = 'credit' and account_id is null and financial_transaction_id is null));

create table if not exists public.inventory_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.inventory_purchases(id) on delete cascade,
  clinic_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists inventory_purchases_clinic_created_idx
  on public.inventory_purchases (clinic_id, created_at desc);
create index if not exists inventory_purchase_items_purchase_idx
  on public.inventory_purchase_items (purchase_id);

alter table public.inventory_suppliers enable row level security;
alter table public.inventory_purchases enable row level security;
alter table public.inventory_purchase_items enable row level security;

drop policy if exists vetra_inventory_suppliers_select on public.inventory_suppliers;
create policy vetra_inventory_suppliers_select on public.inventory_suppliers
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());

drop policy if exists vetra_inventory_purchases_select on public.inventory_purchases;
create policy vetra_inventory_purchases_select on public.inventory_purchases
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());

drop policy if exists vetra_inventory_purchase_items_select on public.inventory_purchase_items;
create policy vetra_inventory_purchase_items_select on public.inventory_purchase_items
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());

grant select on public.inventory_suppliers to authenticated;
grant select on public.inventory_purchases to authenticated;
grant select on public.inventory_purchase_items to authenticated;

create or replace function public.vetra_create_inventory_supplier(
  p_name text,
  p_phone text default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_id uuid;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if not public.vetra_has_clinic_staff_permission('inventory', 'create') then raise exception 'Inventory creation permission is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Supplier name is required'; end if;

  insert into public.inventory_suppliers (clinic_id, name, phone, notes, created_by)
  values (v_clinic_id, trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_notes), ''), auth.uid())
  on conflict (clinic_id, name) do update set
    phone = coalesce(excluded.phone, inventory_suppliers.phone),
    notes = coalesce(excluded.notes, inventory_suppliers.notes),
    is_active = true
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.vetra_create_inventory_supplier(text, text, text) from public;
grant execute on function public.vetra_create_inventory_supplier(text, text, text) to authenticated;

-- Remove the old overload so PostgREST resolves both old cash callers and new
-- callers to this function. The new trailing argument defaults to cash.
drop function if exists public.vetra_create_inventory_purchase(text, uuid, jsonb, text, text, text);
create or replace function public.vetra_create_inventory_purchase(
  p_supplier_name text,
  p_account_id uuid,
  p_items jsonb,
  p_invoice_reference text default null,
  p_notes text default null,
  p_idempotency_key text default null,
  p_payment_type text default 'cash'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_supplier_id uuid;
  v_purchase_id uuid;
  v_financial_transaction_id uuid;
  v_total numeric(14,2) := 0;
  v_item record;
  v_product public.products%rowtype;
  v_existing public.inventory_purchases%rowtype;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if not public.vetra_has_clinic_staff_permission('inventory', 'create') or not public.vetra_has_clinic_staff_permission('payments', 'create') then raise exception 'Inventory and payment creation permissions are required'; end if;
  if not public.vetra_has_clinic_staff_permission('finance_page', 'view') then raise exception 'Finance access permission is required'; end if;
  if p_payment_type is null or p_payment_type not in ('cash', 'credit') then raise exception 'Payment type must be cash or credit'; end if;
  if p_payment_type = 'cash' and p_account_id is null then raise exception 'A vault is required for a cash purchase'; end if;
  if p_payment_type = 'credit' and p_account_id is not null then raise exception 'Credit purchases must not debit a vault'; end if;
  if nullif(trim(p_supplier_name), '') is null then raise exception 'Supplier name is required'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Purchase idempotency key is required'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then raise exception 'Purchase items must be an array'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'Add at least one purchased item'; end if;

  select * into v_existing
  from public.inventory_purchases
  where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
  if found then return v_existing.id; end if;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, unit_cost numeric)
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Every purchase line needs a product and a positive quantity';
    end if;
    if v_item.unit_cost is null or v_item.unit_cost < 0 then
      raise exception 'Every purchase line needs a valid unit cost';
    end if;

    select * into v_product
    from public.products
    where id = v_item.product_id and clinic_id = v_clinic_id and is_active = true
    for update;
    if not found then raise exception 'One of the selected products was not found or is inactive'; end if;

    v_total := v_total + round(v_item.quantity * v_item.unit_cost, 2);
  end loop;

  if v_total <= 0 then raise exception 'Purchase total must be greater than zero'; end if;

  insert into public.inventory_suppliers (clinic_id, name, created_by)
  values (v_clinic_id, trim(p_supplier_name), auth.uid())
  on conflict (clinic_id, name) do update set is_active = true
  returning id into v_supplier_id;

  insert into public.inventory_purchases
    (clinic_id, supplier_id, supplier_name, account_id, payment_type, total_amount, invoice_reference, notes, idempotency_key, created_by)
  values
    (v_clinic_id, v_supplier_id, trim(p_supplier_name), p_account_id, p_payment_type, v_total,
     nullif(trim(p_invoice_reference), ''), nullif(trim(p_notes), ''), trim(p_idempotency_key), auth.uid())
  returning id into v_purchase_id;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, unit_cost numeric)
  loop
    update public.products
    set quantity = coalesce(quantity, 0) + v_item.quantity,
        wholesale_price = v_item.unit_cost,
        last_purchase_price = v_item.unit_cost
    where id = v_item.product_id and clinic_id = v_clinic_id;

    insert into public.inventory_purchase_items
      (purchase_id, clinic_id, product_id, quantity, unit_cost, line_total)
    values
      (v_purchase_id, v_clinic_id, v_item.product_id, v_item.quantity, v_item.unit_cost,
       round(v_item.quantity * v_item.unit_cost, 2));

    insert into public.inventory_movements
      (clinic_id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
    values
      (v_clinic_id, v_item.product_id, 'purchase', v_item.quantity, 'inventory_purchase', v_purchase_id,
       'Inventory purchase from ' || trim(p_supplier_name), auth.uid());
  end loop;

  if p_payment_type = 'cash' then
    v_financial_transaction_id := public.vetra_post_financial_transaction(
      p_account_id,
      'out',
      'supplier_payment',
      v_total,
      'Inventory purchase from ' || trim(p_supplier_name),
      'inventory_purchase',
      'cash',
      v_purchase_id::text,
      trim(p_supplier_name),
      null,
      trim(p_idempotency_key) || ':payment'
    );

    update public.inventory_purchases
    set financial_transaction_id = v_financial_transaction_id
    where id = v_purchase_id and clinic_id = v_clinic_id;
  end if;

  return v_purchase_id;
end;
$$;

revoke all on function public.vetra_create_inventory_purchase(text, uuid, jsonb, text, text, text, text) from public;
grant execute on function public.vetra_create_inventory_purchase(text, uuid, jsonb, text, text, text, text) to authenticated;

create or replace function public.vetra_update_inventory_purchase(
  p_purchase_id uuid,
  p_supplier_name text,
  p_account_id uuid,
  p_items jsonb,
  p_invoice_reference text default null,
  p_notes text default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_purchase public.inventory_purchases%rowtype;
  v_account public.financial_accounts%rowtype;
  v_supplier_id uuid;
  v_total numeric(14,2) := 0;
  v_item record;
  v_financial_transaction_id uuid;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if not public.vetra_has_clinic_staff_permission('inventory', 'edit') or not public.vetra_has_clinic_staff_permission('payments', 'edit') then raise exception 'Inventory and payment edit permissions are required'; end if;
  if not public.vetra_has_clinic_staff_permission('finance_page', 'view') then raise exception 'Finance access permission is required'; end if;
  if p_purchase_id is null then raise exception 'Purchase invoice is required'; end if;
  if nullif(trim(p_supplier_name), '') is null then raise exception 'Supplier name is required'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Edit idempotency key is required'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one purchased item';
  end if;

  select * into v_purchase
  from public.inventory_purchases
  where id = p_purchase_id and clinic_id = v_clinic_id
  for update;
  if not found then raise exception 'Purchase invoice not found'; end if;

  -- Editing preserves the invoice's payment type. A credit edit only adjusts
  -- inventory and the supplier invoice amount; it must never post a payment.
  if v_purchase.payment_type = 'cash' then
    select * into v_account
    from public.financial_accounts
    where id = p_account_id and clinic_id = v_clinic_id and is_active = true
    for update;
    if not found then raise exception 'Financial account not found or inactive'; end if;
  elsif p_account_id is not null then
    raise exception 'Credit purchases must not debit a vault';
  end if;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, unit_cost numeric)
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Every purchase line needs a product and a positive quantity';
    end if;
    if v_item.unit_cost is null or v_item.unit_cost < 0 then
      raise exception 'Every purchase line needs a valid unit cost';
    end if;
    perform 1 from public.products
    where id = v_item.product_id and clinic_id = v_clinic_id and is_active = true
    for update;
    if not found then raise exception 'One of the selected products was not found or is inactive'; end if;
    v_total := v_total + round(v_item.quantity * v_item.unit_cost, 2);
  end loop;
  if v_total <= 0 then raise exception 'Purchase total must be greater than zero'; end if;

  insert into public.inventory_suppliers (clinic_id, name, created_by)
  values (v_clinic_id, trim(p_supplier_name), auth.uid())
  on conflict (clinic_id, name) do update set is_active = true
  returning id into v_supplier_id;

  for v_item in
    select product_id, sum(old_quantity) as old_quantity, sum(new_quantity) as new_quantity
    from (
      select product_id, quantity as old_quantity, 0::numeric as new_quantity
      from public.inventory_purchase_items
      where purchase_id = p_purchase_id and clinic_id = v_clinic_id
      union all
      select x.product_id, 0::numeric, x.quantity
      from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, unit_cost numeric)
    ) as deltas
    group by product_id
    order by product_id
  loop
    update public.products
    set quantity = coalesce(quantity, 0) + coalesce(v_item.new_quantity, 0) - coalesce(v_item.old_quantity, 0)
    where id = v_item.product_id and clinic_id = v_clinic_id
      and coalesce(quantity, 0) + coalesce(v_item.new_quantity, 0) - coalesce(v_item.old_quantity, 0) >= 0;
    if not found then
      raise exception 'This invoice cannot be edited because the change would make product stock negative';
    end if;
    if coalesce(v_item.new_quantity, 0) <> coalesce(v_item.old_quantity, 0) then
      insert into public.inventory_movements
        (clinic_id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_by)
      values
        (v_clinic_id, v_item.product_id, 'adjustment', coalesce(v_item.new_quantity, 0) - coalesce(v_item.old_quantity, 0), 'inventory_purchase_edit', p_purchase_id,
         'Stock difference from purchase invoice edit', auth.uid());
    end if;
  end loop;

  delete from public.inventory_purchase_items
  where purchase_id = p_purchase_id and clinic_id = v_clinic_id;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, unit_cost numeric)
  loop
    update public.products
    set wholesale_price = v_item.unit_cost,
        last_purchase_price = v_item.unit_cost
    where id = v_item.product_id and clinic_id = v_clinic_id and is_active = true;

    insert into public.inventory_purchase_items
      (purchase_id, clinic_id, product_id, quantity, unit_cost, line_total)
    values
      (p_purchase_id, v_clinic_id, v_item.product_id, v_item.quantity, v_item.unit_cost,
       round(v_item.quantity * v_item.unit_cost, 2));

  end loop;

  if v_purchase.payment_type = 'cash' then
    if v_purchase.account_id = p_account_id then
      if v_total > v_purchase.total_amount then
        v_financial_transaction_id := public.vetra_post_financial_transaction(
          p_account_id, 'out', 'adjustment', v_total - v_purchase.total_amount,
          'Purchase invoice edit: additional payment', 'inventory_purchase_edit', 'cash', p_purchase_id::text,
          trim(p_supplier_name), null, trim(p_idempotency_key) || ':additional');
      elsif v_total < v_purchase.total_amount then
        v_financial_transaction_id := public.vetra_post_financial_transaction(
          p_account_id, 'in', 'adjustment', v_purchase.total_amount - v_total,
          'Purchase invoice edit: refund difference', 'inventory_purchase_edit', 'cash', p_purchase_id::text,
          trim(p_supplier_name), null, trim(p_idempotency_key) || ':refund');
      end if;
    else
      v_financial_transaction_id := public.vetra_post_financial_transaction(
        v_purchase.account_id, 'in', 'adjustment', v_purchase.total_amount,
        'Purchase invoice edit: return previous payment', 'inventory_purchase_edit', 'cash', p_purchase_id::text,
        v_purchase.supplier_name, null, trim(p_idempotency_key) || ':old-account');
      v_financial_transaction_id := public.vetra_post_financial_transaction(
        p_account_id, 'out', 'adjustment', v_total,
        'Purchase invoice edit: replacement payment', 'inventory_purchase_edit', 'cash', p_purchase_id::text,
        trim(p_supplier_name), null, trim(p_idempotency_key) || ':new-account');
    end if;

  end if;

  update public.inventory_purchases
  set supplier_id = v_supplier_id,
      supplier_name = trim(p_supplier_name),
      account_id = p_account_id,
      total_amount = v_total,
      invoice_reference = nullif(trim(p_invoice_reference), ''),
      notes = nullif(trim(p_notes), '')
  where id = p_purchase_id and clinic_id = v_clinic_id;

  return p_purchase_id;
end;
$$;

revoke all on function public.vetra_update_inventory_purchase(uuid, text, uuid, jsonb, text, text, text) from public;
grant execute on function public.vetra_update_inventory_purchase(uuid, text, uuid, jsonb, text, text, text) to authenticated;

-- Refresh the RPC schema cache after upgrading the signature.
notify pgrst, 'reload schema';
commit;
