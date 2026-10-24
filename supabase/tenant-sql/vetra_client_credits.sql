-- VETRA client due balances and overpayment credits.
-- Run on every Shared Clinic Database after the finance cash-register SQL.

begin;

create table if not exists public.client_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric(14,2) not null check (amount > 0),
  description text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint client_credit_ledger_description_present
    check (description is null or length(trim(description)) > 0)
);

create index if not exists client_credit_ledger_client_idx
  on public.client_credit_ledger (clinic_id, client_id, created_at desc);

-- Keep this index non-partial so ON CONFLICT can infer it inside the RPC.
-- PostgreSQL permits multiple NULL values in a regular unique index.
drop index if exists public.client_credit_ledger_idempotency_idx;
create unique index client_credit_ledger_idempotency_idx
  on public.client_credit_ledger (clinic_id, idempotency_key);

alter table public.client_credit_ledger enable row level security;
drop policy if exists vetra_client_credit_ledger_select on public.client_credit_ledger;
create policy vetra_client_credit_ledger_select on public.client_credit_ledger
  for select to authenticated
  using (clinic_id = public.vetra_current_clinic_id());
grant select on public.client_credit_ledger to authenticated;
revoke all on public.client_credit_ledger from anon, public;

create or replace function public.vetra_record_invoice_payment(
  p_invoice_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null,
  p_notes text default null,
  p_session_id uuid default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_invoice public.invoices%rowtype;
  v_account public.financial_accounts%rowtype;
  v_session_id uuid := p_session_id;
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_payment_id uuid;
  v_existing public.financial_transactions%rowtype;
  v_invoice_due numeric(14,2);
  v_credit_amount numeric(14,2);
  v_new_paid numeric(14,2);
  v_new_status text;
  v_description text;
  v_client_name text;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;
  if v_method not in ('cash','card','wallet','bank_transfer','other') then raise exception 'Invalid payment method'; end if;

  select * into v_invoice from public.invoices
  where id = p_invoice_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Invoice not found for this clinic'; end if;
  if v_invoice.status in ('draft','cancelled','returned') then raise exception 'This invoice cannot receive a payment in its current status'; end if;

  select c.name into v_client_name from public.clients c
  where c.id = v_invoice.client_id and c.clinic_id = v_clinic_id;

  select * into v_existing from public.financial_transactions
  where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.transaction_type <> 'invoice_payment'
       or v_existing.related_invoice_id <> p_invoice_id
       or v_existing.amount <> p_amount then
      raise exception 'Idempotency key was already used for a different payment';
    end if;
    return v_existing.id;
  end if;

  select * into v_account from public.financial_accounts
  where id = p_account_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Financial account not found for this clinic'; end if;
  if not v_account.is_active then raise exception 'This account is inactive'; end if;
  if (v_method = 'cash' and v_account.account_type <> 'cash')
     or (v_method = 'card' and v_account.account_type <> 'card')
     or (v_method = 'wallet' and v_account.account_type <> 'wallet')
     or (v_method = 'bank_transfer' and v_account.account_type <> 'bank') then
    raise exception 'Selected account does not match the payment method';
  end if;

  if v_account.requires_session then
    if v_session_id is null then
      select id into v_session_id from public.cash_register_sessions
      where clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
      order by opened_at desc limit 1 for update;
    else
      perform 1 from public.cash_register_sessions
      where id = v_session_id and clinic_id = v_clinic_id
        and account_id = p_account_id and status = 'open' for update;
      if not found then raise exception 'Selected cash register session is not open'; end if;
    end if;
    if v_session_id is null then raise exception 'Open the selected cash register before collecting money'; end if;
  end if;

  v_invoice_due := greatest(coalesce(v_invoice.total, 0) - coalesce(v_invoice.paid_amount, 0), 0);
  v_credit_amount := greatest(p_amount - v_invoice_due, 0);
  v_description := 'تحصيل فاتورة رقم #' || v_invoice.invoice_number::text;
  if nullif(trim(p_notes), '') is not null then v_description := v_description || ' — ' || trim(p_notes); end if;

  insert into public.financial_transactions
    (clinic_id, account_id, session_id, direction, transaction_type, amount,
     description, payment_method, reference, counterparty_name,
     related_invoice_id, idempotency_key, created_by)
  values
    (v_clinic_id, p_account_id, v_session_id, 'in', 'invoice_payment', p_amount,
     v_description, v_method, nullif(trim(p_reference), ''), v_client_name,
     p_invoice_id, trim(p_idempotency_key), auth.uid())
  on conflict (clinic_id, idempotency_key) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    select * into v_existing from public.financial_transactions
    where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
    if not found or v_existing.transaction_type <> 'invoice_payment'
       or v_existing.related_invoice_id <> p_invoice_id or v_existing.amount <> p_amount then
      raise exception 'Duplicate payment retry could not be resolved';
    end if;
    return v_existing.id;
  end if;

  v_new_paid := least(coalesce(v_invoice.total, 0), coalesce(v_invoice.paid_amount, 0) + p_amount);
  if v_invoice.status in ('partially_returned') then
    v_new_status := 'partially_returned';
  elsif v_new_paid >= coalesce(v_invoice.total, 0) then
    v_new_status := 'paid';
  elsif v_new_paid > 0 then
    v_new_status := 'partially_paid';
  else
    v_new_status := 'unpaid';
  end if;

  update public.invoices
  set paid_amount = v_new_paid,
      payment_method = v_method,
      status = v_new_status,
      paid_at = case when v_new_paid >= coalesce(total, 0) then coalesce(paid_at, now()) else paid_at end,
      updated_at = now(), updated_by = auth.uid()
  where id = p_invoice_id and clinic_id = v_clinic_id;

  if v_credit_amount > 0 and v_invoice.client_id is not null then
    insert into public.client_credit_ledger
      (clinic_id, client_id, invoice_id, direction, amount, description, idempotency_key, created_by)
    values
      (v_clinic_id, v_invoice.client_id, p_invoice_id, 'credit', v_credit_amount,
       'رصيد زائد من تحصيل الفاتورة #' || v_invoice.invoice_number::text,
       trim(p_idempotency_key) || ':credit', auth.uid())
    on conflict (clinic_id, idempotency_key) do nothing;
  end if;
  return v_payment_id;
end;
$$;

create or replace function public.vetra_get_owner_financial_summary(p_client_id uuid)
returns table (due_amount numeric, credit_amount numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_code text := nullif(trim(v_headers ->> 'x-vetra-client-code'), '');
  v_phone text := nullif(trim(v_headers ->> 'x-vetra-client-phone'), '');
  v_client_id uuid;
  v_clinic_id uuid;
begin
  if v_code is null or v_phone is null then raise exception 'Pet owner session could not be verified'; end if;
  select c.id, c.clinic_id into v_client_id, v_clinic_id
  from public.clients c
  where c.id = p_client_id and c.client_code = v_code
    and regexp_replace(coalesce(c.phone, ''), '\s+', '', 'g') = regexp_replace(v_phone, '\s+', '', 'g');
  if v_client_id is null then raise exception 'Pet owner session could not be verified'; end if;

  return query select
    coalesce((select sum(greatest(coalesce(i.total, 0) - coalesce(i.paid_amount, 0), 0))
      from public.invoices i where i.clinic_id = v_clinic_id and i.client_id = v_client_id
        and i.status not in ('draft', 'cancelled', 'returned')), 0)::numeric(14,2),
    greatest(coalesce((select sum(case when l.direction = 'credit' then l.amount else -l.amount end)
      from public.client_credit_ledger l where l.clinic_id = v_clinic_id and l.client_id = v_client_id), 0), 0)::numeric(14,2);
end;
$$;

revoke all on function public.vetra_get_owner_financial_summary(uuid) from public;
grant execute on function public.vetra_get_owner_financial_summary(uuid) to anon, authenticated;
revoke all on function public.vetra_record_invoice_payment(uuid,uuid,numeric,text,text,text,uuid,text) from public;
grant execute on function public.vetra_record_invoice_payment(uuid,uuid,numeric,text,text,text,uuid,text) to authenticated;

commit;
