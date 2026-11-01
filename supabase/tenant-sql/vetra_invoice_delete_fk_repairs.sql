-- Run on each clinic tenant database, not VETRA CORE.
-- Deleting a pet/client intentionally removes their invoices and the
-- financial rows created only for those invoices.
begin;

alter table if exists public.financial_transactions
  drop constraint if exists financial_transactions_related_invoice_id_fkey;
alter table if exists public.financial_transactions
  add constraint financial_transactions_related_invoice_id_fkey
  foreign key (related_invoice_id) references public.invoices(id) on delete cascade;

alter table if exists public.invoice_returns
  drop constraint if exists invoice_returns_invoice_id_fkey;
alter table if exists public.invoice_returns
  add constraint invoice_returns_invoice_id_fkey
  foreign key (invoice_id) references public.invoices(id) on delete cascade;

notify pgrst, 'reload schema';
commit;
