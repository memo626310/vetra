-- Run on each tenant after the staff permission helper is installed.
-- Uses invoices.view for invoice lists, details, and lines.
begin;
drop policy if exists vetra_staff_invoices_select_guard on public.invoices;
create policy vetra_staff_invoices_select_guard on public.invoices
  as restrictive for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'view')
        or public.vetra_has_clinic_staff_permission('finance_page', 'view')
        or public.vetra_has_clinic_staff_permission('invoices', 'create')
    )
  );

drop policy if exists vetra_staff_invoices_select on public.invoices;
create policy vetra_staff_invoices_select on public.invoices
  for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and public.vetra_has_clinic_staff_permission('invoices', 'view')
  );

drop policy if exists vetra_staff_invoice_items_select_guard on public.invoice_items;
create policy vetra_staff_invoice_items_select_guard on public.invoice_items
  as restrictive for select to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'view')
        or public.vetra_has_clinic_staff_permission('finance_page', 'view')
        or public.vetra_has_clinic_staff_permission('invoices', 'create')
    )
  );
commit;
