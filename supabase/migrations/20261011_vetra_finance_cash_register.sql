-- VETRA Finance + Cash Registers + Sales Collections
-- Run on the Shared Clinic Database (NOT VETRA CORE).
-- Safe additive migration: creates new clinic-scoped finance tables and RPCs.
-- It does NOT import legacy Access balances or rewrite existing invoices.

begin;

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  account_type text not null check (account_type in ('cash','bank','wallet','card','other')),
  requires_session boolean not null default false,
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  is_active boolean not null default true,
  is_default boolean not null default false,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, name),
  constraint financial_accounts_cash_session_rule check (
    (account_type = 'cash' and requires_session = true)
    or (account_type <> 'cash' and requires_session = false)
  )
);

create unique index if not exists financial_accounts_one_default_type_idx
  on public.financial_accounts (clinic_id, account_type)
  where is_default = true;

create table if not exists public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  status text not null default 'open' check (status in ('open','closed')),
  opening_expected_balance numeric(14,2) not null default 0,
  opening_counted_balance numeric(14,2) not null default 0,
  opening_difference numeric(14,2) not null default 0,
  expected_closing_balance numeric(14,2),
  counted_closing_balance numeric(14,2),
  closing_difference numeric(14,2),
  opened_by uuid,
  closed_by uuid,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_notes text,
  closing_notes text,
  created_at timestamptz not null default now(),
  constraint cash_register_sessions_close_fields check (
    (status = 'open' and closed_at is null)
    or (status = 'closed' and closed_at is not null and counted_closing_balance is not null)
  )
);

create unique index if not exists cash_register_sessions_one_open_per_account_idx
  on public.cash_register_sessions (clinic_id, account_id)
  where status = 'open';

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  session_id uuid references public.cash_register_sessions(id) on delete restrict,
  direction text not null check (direction in ('in','out')),
  transaction_type text not null check (transaction_type in (
    'invoice_payment','income','expense','supplier_payment','refund',
    'transfer_in','transfer_out','adjustment'
  )),
  amount numeric(14,2) not null check (amount > 0),
  transaction_at timestamptz not null default now(),
  description text not null check (length(trim(description)) > 0),
  category text,
  payment_method text,
  reference text,
  counterparty_name text,
  related_invoice_id uuid references public.invoices(id) on delete restrict,
  transfer_group_id uuid,
  status text not null default 'posted' check (status in ('posted','voided')),
  idempotency_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint financial_transactions_type_direction_check check (
    (transaction_type = 'invoice_payment' and direction = 'in' and related_invoice_id is not null)
    or (transaction_type = 'income' and direction = 'in')
    or (transaction_type in ('expense','supplier_payment','refund','transfer_out') and direction = 'out')
    or (transaction_type = 'transfer_in' and direction = 'in')
    or (transaction_type = 'adjustment')
  )
);

create unique index if not exists financial_transactions_idempotency_idx
  on public.financial_transactions (clinic_id, idempotency_key);
create index if not exists financial_transactions_account_time_idx
  on public.financial_transactions (clinic_id, account_id, transaction_at desc);
create index if not exists financial_transactions_invoice_idx
  on public.financial_transactions (clinic_id, related_invoice_id, transaction_at desc)
  where related_invoice_id is not null;
create index if not exists financial_transactions_session_idx
  on public.financial_transactions (clinic_id, session_id, transaction_at desc)
  where session_id is not null;

-- Balance comes only from the opening balance plus posted ledger movements.
create or replace view public.financial_account_balances
with (security_invoker = true)
as
select
  a.id,
  a.clinic_id,
  a.name,
  a.account_type,
  a.requires_session,
  a.opening_balance,
  a.is_active,
  a.is_default,
  a.notes,
  a.created_at,
  a.updated_at,
  a.opening_balance + coalesce(sum(
    case when t.direction = 'in' then t.amount else -t.amount end
  ) filter (where t.status = 'posted'), 0) as current_balance
from public.financial_accounts a
left join public.financial_transactions t
  on t.account_id = a.id and t.clinic_id = a.clinic_id
 group by a.id, a.clinic_id, a.name, a.account_type, a.requires_session,
          a.opening_balance, a.is_active, a.is_default, a.notes, a.created_at, a.updated_at;

-- The dashboard can read only rows belonging to the tenant in the signed clinic token.
alter table public.financial_accounts enable row level security;
alter table public.cash_register_sessions enable row level security;
alter table public.financial_transactions enable row level security;

drop policy if exists vetra_financial_accounts_select on public.financial_accounts;
create policy vetra_financial_accounts_select on public.financial_accounts
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_cash_sessions_select on public.cash_register_sessions;
create policy vetra_cash_sessions_select on public.cash_register_sessions
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_financial_transactions_select on public.financial_transactions;
create policy vetra_financial_transactions_select on public.financial_transactions
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());

-- RLS policies do not grant SQL privileges by themselves. Authenticated users can read only;
-- all writes go through tenant-scoped SECURITY DEFINER functions below.
grant select on public.financial_accounts to authenticated;
grant select on public.cash_register_sessions to authenticated;
grant select on public.financial_transactions to authenticated;
grant select on public.financial_account_balances to authenticated;

-- Seed default accounts only for clinic IDs already present in known operational tables.
with clinic_ids as (
  select clinic_id from public.invoices where clinic_id is not null
  union select clinic_id from public.billing_settings where clinic_id is not null
  union select clinic_id from public.clients where clinic_id is not null
  union select clinic_id from public.products where clinic_id is not null
), defaults(name, account_type, requires_session) as (
  values
    ('الخزنة الرئيسية', 'cash', true),
    ('البنك', 'bank', false),
    ('المحافظ الإلكترونية', 'wallet', false),
    ('مدفوعات البطاقات', 'card', false),
    ('حسابات أخرى', 'other', false)
)
insert into public.financial_accounts
  (clinic_id, name, account_type, requires_session, is_default)
select c.clinic_id, d.name, d.account_type, d.requires_session, true
from clinic_ids c cross join defaults d
on conflict (clinic_id, name) do nothing;

-- Create a financial account through a tenant-checked server function.
create or replace function public.vetra_create_financial_account(
  p_name text,
  p_account_type text,
  p_opening_balance numeric default 0,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_id uuid;
  v_type text := lower(trim(coalesce(p_account_type, '')));
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Account name is required'; end if;
  if v_type not in ('cash','bank','wallet','card','other') then raise exception 'Invalid account type'; end if;
  if coalesce(p_opening_balance, 0) < 0 then raise exception 'Opening balance cannot be negative'; end if;

  insert into public.financial_accounts
    (clinic_id, name, account_type, requires_session, opening_balance, is_default, notes, created_by)
  values
    (v_clinic_id, trim(p_name), v_type, v_type = 'cash', coalesce(p_opening_balance, 0), false,
     nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.vetra_open_cash_register(
  p_account_id uuid,
  p_counted_opening numeric,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_account public.financial_accounts%rowtype;
  v_expected numeric(14,2);
  v_session_id uuid;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_counted_opening is null or p_counted_opening < 0 then raise exception 'Enter a valid opening cash count'; end if;

  select * into v_account
  from public.financial_accounts
  where id = p_account_id and clinic_id = v_clinic_id
  for update;
  if not found then raise exception 'Financial account not found for this clinic'; end if;
  if not v_account.is_active then raise exception 'This account is inactive'; end if;
  if not v_account.requires_session then raise exception 'This account does not use cash register sessions'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_clinic_id::text || ':' || p_account_id::text, 0));
  if exists (select 1 from public.cash_register_sessions s
             where s.clinic_id = v_clinic_id and s.account_id = p_account_id and s.status = 'open') then
    raise exception 'There is already an open session for this register';
  end if;

  select v_account.opening_balance + coalesce(sum(
    case when t.direction = 'in' then t.amount else -t.amount end
  ) filter (where t.status = 'posted'), 0)
  into v_expected
  from public.financial_transactions t
  where t.clinic_id = v_clinic_id and t.account_id = p_account_id;

  insert into public.cash_register_sessions
    (clinic_id, account_id, opening_expected_balance, opening_counted_balance,
     opening_difference, opened_by, opening_notes)
  values
    (v_clinic_id, p_account_id, coalesce(v_expected, v_account.opening_balance), p_counted_opening,
     p_counted_opening - coalesce(v_expected, v_account.opening_balance), auth.uid(), nullif(trim(p_notes), ''))
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.vetra_close_cash_register(
  p_session_id uuid,
  p_counted_closing numeric,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_session public.cash_register_sessions%rowtype;
  v_expected numeric(14,2);
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_counted_closing is null or p_counted_closing < 0 then raise exception 'Enter a valid closing cash count'; end if;

  select * into v_session from public.cash_register_sessions
  where id = p_session_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Cash register session not found'; end if;
  if v_session.status <> 'open' then raise exception 'This register session is already closed'; end if;

  select v_session.opening_expected_balance + coalesce(sum(
    case when t.direction = 'in' then t.amount else -t.amount end
  ) filter (where t.status = 'posted'), 0)
  into v_expected
  from public.financial_transactions t
  where t.clinic_id = v_clinic_id and t.session_id = v_session.id;

  update public.cash_register_sessions
  set status = 'closed', closed_at = now(), closed_by = auth.uid(),
      expected_closing_balance = coalesce(v_expected, v_session.opening_expected_balance),
      counted_closing_balance = p_counted_closing,
      closing_difference = p_counted_closing - coalesce(v_expected, v_session.opening_expected_balance),
      closing_notes = nullif(trim(p_notes), '')
  where id = v_session.id and clinic_id = v_clinic_id;

  return v_session.id;
end;
$$;

create or replace function public.vetra_post_financial_transaction(
  p_account_id uuid,
  p_direction text,
  p_transaction_type text,
  p_amount numeric,
  p_description text,
  p_category text default null,
  p_payment_method text default null,
  p_reference text default null,
  p_counterparty_name text default null,
  p_session_id uuid default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_account public.financial_accounts%rowtype;
  v_session_id uuid := p_session_id;
  v_transaction_id uuid;
  v_existing public.financial_transactions%rowtype;
  v_direction text := lower(trim(coalesce(p_direction, '')));
  v_type text := lower(trim(coalesce(p_transaction_type, '')));
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if nullif(trim(p_description), '') is null then raise exception 'Description is required'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;
  if v_direction not in ('in','out') then raise exception 'Direction must be in or out'; end if;
  if v_type not in ('income','expense','supplier_payment','refund','adjustment') then raise exception 'Invalid transaction type'; end if;
  if v_type = 'income' and v_direction <> 'in' then raise exception 'Income must be an incoming transaction'; end if;
  if v_type in ('expense','supplier_payment','refund') and v_direction <> 'out' then raise exception 'This transaction type must be outgoing'; end if;

  select * into v_account from public.financial_accounts
  where id = p_account_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'Financial account not found for this clinic'; end if;
  if not v_account.is_active then raise exception 'This account is inactive'; end if;

  if v_account.requires_session then
    if v_session_id is null then
      select id into v_session_id from public.cash_register_sessions
      where clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
      order by opened_at desc limit 1 for update;
    else
      perform 1 from public.cash_register_sessions
      where id = v_session_id and clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
      for update;
      if not found then raise exception 'Selected cash register session is not open'; end if;
    end if;
    if v_session_id is null then raise exception 'Open this cash register before posting a movement'; end if;
  elsif v_session_id is not null then
    perform 1 from public.cash_register_sessions
    where id = v_session_id and clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
    for update;
    if not found then raise exception 'Selected register session is invalid'; end if;
  end if;

  insert into public.financial_transactions
    (clinic_id, account_id, session_id, direction, transaction_type, amount, description,
     category, payment_method, reference, counterparty_name, idempotency_key, created_by)
  values
    (v_clinic_id, p_account_id, v_session_id, v_direction, v_type, p_amount, trim(p_description),
     nullif(trim(p_category), ''), nullif(trim(p_payment_method), ''), nullif(trim(p_reference), ''),
     nullif(trim(p_counterparty_name), ''), trim(p_idempotency_key), auth.uid())
  on conflict (clinic_id, idempotency_key) do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    select * into v_existing from public.financial_transactions
    where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
    if not found then raise exception 'Transaction retry could not be resolved'; end if;
    if v_existing.account_id <> p_account_id or v_existing.amount <> p_amount or v_existing.direction <> v_direction then
      raise exception 'Idempotency key was already used for a different transaction';
    end if;
    return v_existing.id;
  end if;

  return v_transaction_id;
end;
$$;

create or replace function public.vetra_transfer_between_accounts(
  p_source_account_id uuid,
  p_destination_account_id uuid,
  p_amount numeric,
  p_description text,
  p_reference text default null,
  p_source_session_id uuid default null,
  p_destination_session_id uuid default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clinic_id uuid := public.vetra_current_clinic_id();
  v_source public.financial_accounts%rowtype;
  v_destination public.financial_accounts%rowtype;
  v_source_session uuid := p_source_session_id;
  v_destination_session uuid := p_destination_session_id;
  v_group uuid := gen_random_uuid();
  v_out_id uuid;
  v_existing public.financial_transactions%rowtype;
begin
  if v_clinic_id is null then raise exception 'No active VETRA clinic found in token'; end if;
  if p_source_account_id = p_destination_account_id then raise exception 'Source and destination accounts must differ'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if nullif(trim(p_description), '') is null then raise exception 'Transfer description is required'; end if;
  if nullif(trim(p_idempotency_key), '') is null then raise exception 'Idempotency key is required'; end if;

  select * into v_existing from public.financial_transactions
  where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.transaction_type <> 'transfer_out' or v_existing.amount <> p_amount then
      raise exception 'Idempotency key was already used for a different transaction';
    end if;
    return v_existing.id;
  end if;

  select * into v_source from public.financial_accounts
  where id = p_source_account_id and clinic_id = v_clinic_id for update;
  if not found or not v_source.is_active then raise exception 'Source account not found or inactive'; end if;
  select * into v_destination from public.financial_accounts
  where id = p_destination_account_id and clinic_id = v_clinic_id for update;
  if not found or not v_destination.is_active then raise exception 'Destination account not found or inactive'; end if;

  if v_source.requires_session then
    if v_source_session is null then
      select id into v_source_session from public.cash_register_sessions
      where clinic_id = v_clinic_id and account_id = p_source_account_id and status = 'open'
      order by opened_at desc limit 1 for update;
    else
      perform 1 from public.cash_register_sessions where id = v_source_session and clinic_id = v_clinic_id
        and account_id = p_source_account_id and status = 'open' for update;
      if not found then raise exception 'Source register session is not open'; end if;
    end if;
    if v_source_session is null then raise exception 'Open the source cash register before transferring'; end if;
  end if;

  if v_destination.requires_session then
    if v_destination_session is null then
      select id into v_destination_session from public.cash_register_sessions
      where clinic_id = v_clinic_id and account_id = p_destination_account_id and status = 'open'
      order by opened_at desc limit 1 for update;
    else
      perform 1 from public.cash_register_sessions where id = v_destination_session and clinic_id = v_clinic_id
        and account_id = p_destination_account_id and status = 'open' for update;
      if not found then raise exception 'Destination register session is not open'; end if;
    end if;
    if v_destination_session is null then raise exception 'Open the destination cash register before transferring'; end if;
  end if;

  insert into public.financial_transactions
    (clinic_id, account_id, session_id, direction, transaction_type, amount, description,
     category, reference, counterparty_name, transfer_group_id, idempotency_key, created_by)
  values
    (v_clinic_id, p_source_account_id, v_source_session, 'out', 'transfer_out', p_amount,
     trim(p_description), 'تحويل بين الحسابات', nullif(trim(p_reference), ''), v_destination.name,
     v_group, trim(p_idempotency_key), auth.uid())
  returning id into v_out_id;

  insert into public.financial_transactions
    (clinic_id, account_id, session_id, direction, transaction_type, amount, description,
     category, reference, counterparty_name, transfer_group_id, idempotency_key, created_by)
  values
    (v_clinic_id, p_destination_account_id, v_destination_session, 'in', 'transfer_in', p_amount,
     trim(p_description), 'تحويل بين الحسابات', nullif(trim(p_reference), ''), v_source.name,
     v_group, trim(p_idempotency_key) || ':in', auth.uid());

  return v_out_id;
end;
$$;

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

  select c.name into v_client_name
  from public.clients c
  where c.id = v_invoice.client_id and c.clinic_id = v_clinic_id;

  select * into v_existing from public.financial_transactions
  where clinic_id = v_clinic_id and idempotency_key = trim(p_idempotency_key);
  if found then
    if v_existing.transaction_type <> 'invoice_payment' or v_existing.related_invoice_id <> p_invoice_id or v_existing.amount <> p_amount then
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

  if p_amount > greatest(coalesce(v_invoice.total,0) - coalesce(v_invoice.paid_amount,0),0) then
    raise exception 'Payment amount exceeds the remaining invoice balance';
  end if;

  if v_account.requires_session then
    if v_session_id is null then
      select id into v_session_id from public.cash_register_sessions
      where clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
      order by opened_at desc limit 1 for update;
    else
      perform 1 from public.cash_register_sessions
      where id = v_session_id and clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
      for update;
      if not found then raise exception 'Selected cash register session is not open'; end if;
    end if;
    if v_session_id is null then raise exception 'Open the selected cash register before collecting money'; end if;
  end if;

  v_description := 'تحصيل فاتورة رقم #' || v_invoice.invoice_number::text;
  if nullif(trim(p_notes), '') is not null then v_description := v_description || ' — ' || trim(p_notes); end if;

  insert into public.financial_transactions
    (clinic_id, account_id, session_id, direction, transaction_type, amount, description,
     payment_method, reference, counterparty_name, related_invoice_id, idempotency_key, created_by)
  values
    (v_clinic_id, p_account_id, v_session_id, 'in', 'invoice_payment', p_amount, v_description,
     v_method, nullif(trim(p_reference), ''), v_client_name, p_invoice_id, trim(p_idempotency_key), auth.uid())
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

  v_new_paid := coalesce(v_invoice.paid_amount,0) + p_amount;
  if v_invoice.status in ('partially_returned') then
    v_new_status := 'partially_returned';
  elsif v_new_paid >= coalesce(v_invoice.total,0) then
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
      paid_at = case when v_new_paid >= coalesce(total,0) then coalesce(paid_at, now()) else paid_at end,
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_invoice_id and clinic_id = v_clinic_id;

  return v_payment_id;
end;
$$;

revoke all on function public.vetra_create_financial_account(text,text,numeric,text) from public;
revoke all on function public.vetra_open_cash_register(uuid,numeric,text) from public;
revoke all on function public.vetra_close_cash_register(uuid,numeric,text) from public;
revoke all on function public.vetra_post_financial_transaction(uuid,text,text,numeric,text,text,text,text,text,uuid,text) from public;
revoke all on function public.vetra_transfer_between_accounts(uuid,uuid,numeric,text,text,uuid,uuid,text) from public;
revoke all on function public.vetra_record_invoice_payment(uuid,uuid,numeric,text,text,text,uuid,text) from public;
grant execute on function public.vetra_create_financial_account(text,text,numeric,text) to authenticated;
grant execute on function public.vetra_open_cash_register(uuid,numeric,text) to authenticated;
grant execute on function public.vetra_close_cash_register(uuid,numeric,text) to authenticated;
grant execute on function public.vetra_post_financial_transaction(uuid,text,text,numeric,text,text,text,text,text,uuid,text) to authenticated;
grant execute on function public.vetra_transfer_between_accounts(uuid,uuid,numeric,text,text,uuid,uuid,text) to authenticated;
grant execute on function public.vetra_record_invoice_payment(uuid,uuid,numeric,text,text,text,uuid,text) to authenticated;

commit;
