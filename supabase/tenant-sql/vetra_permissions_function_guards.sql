-- Idempotently add permission checks to existing SECURITY DEFINER finance, cash-register and purchase functions.
-- Run on each clinic tenant database after finance, inventory-purchase SQL and vetra_staff_permission_rls.sql.
begin;

do $vetra_permission_patch$
declare
  v_target record;
  v_definition text;
  v_anchor text := 'if v_clinic_id is null then raise exception ''No active VETRA clinic found in token''; end if;';
  v_guard text;
  v_seen integer := 0;
begin
  if to_regprocedure('public.vetra_has_clinic_staff_permission(text,text)') is null then
    raise exception 'Apply vetra_staff_permission_rls.sql first; permission helper is missing.';
  end if;

  for v_target in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'vetra_create_financial_account',
        'vetra_open_cash_register',
        'vetra_close_cash_register',
        'vetra_post_financial_transaction',
        'vetra_transfer_between_accounts',
        'vetra_record_invoice_payment',
        'vetra_ensure_cash_register_open',
        'vetra_create_inventory_supplier',
        'vetra_create_inventory_purchase',
        'vetra_update_inventory_purchase'
      )
  loop
    v_definition := pg_get_functiondef(v_target.oid);
    case v_target.proname
      when 'vetra_create_financial_account' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Financial account creation permission is required''; end if;';
      when 'vetra_open_cash_register' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Cash register opening permission is required''; end if;';
      when 'vetra_close_cash_register' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Cash register closing permission is required''; end if;';
      when 'vetra_post_financial_transaction' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Financial transaction creation permission is required''; end if;';
      when 'vetra_transfer_between_accounts' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Financial transfer permission is required''; end if;';
      when 'vetra_record_invoice_payment' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Payment creation permission is required''; end if;';
      when 'vetra_ensure_cash_register_open' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Cash register operation permission is required''; end if;';
      when 'vetra_create_inventory_supplier' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''inventory'', ''create'') then raise exception ''Inventory creation permission is required''; end if;';
      when 'vetra_create_inventory_purchase' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''inventory'', ''create'') or not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Inventory and payment creation permissions are required''; end if;';
      when 'vetra_update_inventory_purchase' then
        v_guard := 'if not public.vetra_has_clinic_staff_permission(''inventory'', ''edit'') or not public.vetra_has_clinic_staff_permission(''finance_page'', ''view'') then raise exception ''Inventory and payment edit permissions are required''; end if;';
    end case;

    if position(v_guard in v_definition) > 0 then
      v_seen := v_seen + 1;
      continue;
    end if;
    if position(v_anchor in v_definition) = 0 then
      raise exception 'Could not find the expected clinic-token guard in %. No function was changed.', v_target.proname;
    end if;

    v_definition := replace(v_definition, v_anchor, v_anchor || E'\n  ' || v_guard);
    execute v_definition;
    v_seen := v_seen + 1;
  end loop;

  if v_seen < 10 then
    raise exception 'Expected 10 permission-guarded functions, but found only %. Run all required finance, auto-open cash-register, inventory-purchase and permission SQL first.', v_seen;
  end if;
end;
$vetra_permission_patch$;

commit;