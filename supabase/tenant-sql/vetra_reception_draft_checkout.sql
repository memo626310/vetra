-- Run on each clinic tenant database after vetra_staff_permission_rls.sql.
-- Reception can prepare visit drafts with invoice-create permission; issued
-- invoices retain their existing edit restrictions and payment workflow.
begin;

create or replace function public.vetra_can_checkout_visit_draft(
  p_clinic_id uuid,
  p_visit_id uuid,
  p_status text,
  p_paid_amount numeric
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_clinic_id = public.vetra_current_clinic_id()
    and auth.uid() is not null
    and p_status = 'draft'
    and coalesce(p_paid_amount, 0) = 0
    and public.vetra_has_clinic_staff_permission('invoices', 'create')
    and exists (
      select 1 from public.clinic_staff s
      where s.clinic_id = p_clinic_id
        and s.auth_user_id = auth.uid()
        and s.staff_type = 'front_desk'
    )
    and exists (
      select 1 from public.visits v
      where v.id = p_visit_id and v.clinic_id = p_clinic_id
    );
$$;

revoke all on function public.vetra_can_checkout_visit_draft(uuid, uuid, text, numeric) from public, anon;
grant execute on function public.vetra_can_checkout_visit_draft(uuid, uuid, text, numeric) to authenticated;

drop policy if exists vetra_staff_invoices_update_guard on public.invoices;
create policy vetra_staff_invoices_update_guard on public.invoices
  as restrictive for update to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'edit')
      or public.vetra_can_checkout_visit_draft(clinic_id, visit_id, status::text, paid_amount)
    )
  )
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'edit')
      or public.vetra_can_checkout_visit_draft(clinic_id, visit_id, status::text, paid_amount)
    )
  );

drop policy if exists vetra_staff_invoices_update on public.invoices;
create policy vetra_staff_invoices_update on public.invoices
  for update to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'edit')
      or public.vetra_can_checkout_visit_draft(clinic_id, visit_id, status::text, paid_amount)
    )
  )
  with check (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'edit')
      or public.vetra_can_checkout_visit_draft(clinic_id, visit_id, status::text, paid_amount)
    )
  );

drop policy if exists vetra_staff_invoice_items_delete_guard on public.invoice_items;
create policy vetra_staff_invoice_items_delete_guard on public.invoice_items
  as restrictive for delete to authenticated
  using (
    clinic_id = public.vetra_current_clinic_id()
    and (
      public.vetra_has_clinic_staff_permission('invoices', 'edit')
      or exists (
        select 1 from public.invoices i
        where i.id = invoice_items.invoice_id
          and i.clinic_id = invoice_items.clinic_id
          and public.vetra_can_checkout_visit_draft(i.clinic_id, i.visit_id, i.status::text, i.paid_amount)
      )
    )
  );

commit;
