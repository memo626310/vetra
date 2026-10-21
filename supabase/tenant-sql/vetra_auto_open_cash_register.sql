-- Automatically ensure a cash register session exists for issued sales and receipts.
-- Run on each Shared Clinic Database after the finance cash-register migration.

begin;

create or replace function public.vetra_ensure_cash_register_open(
  p_account_id uuid
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

  select * into v_account
  from public.financial_accounts
  where id = p_account_id and clinic_id = v_clinic_id
  for update;
  if not found then raise exception 'Financial account not found for this clinic'; end if;
  if not v_account.is_active then raise exception 'This account is inactive'; end if;
  if not v_account.requires_session or v_account.account_type <> 'cash' then
    raise exception 'This account does not use cash register sessions';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_clinic_id::text || ':' || p_account_id::text, 0));

  select id into v_session_id
  from public.cash_register_sessions
  where clinic_id = v_clinic_id and account_id = p_account_id and status = 'open'
  order by opened_at desc
  limit 1
  for update;
  if v_session_id is not null then return v_session_id; end if;

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
    (v_clinic_id, p_account_id, coalesce(v_expected, v_account.opening_balance),
     coalesce(v_expected, v_account.opening_balance), 0, auth.uid(),
     'Automatically opened for a sales invoice or customer collection')
  returning id into v_session_id;

  return v_session_id;
end;
$$;

revoke all on function public.vetra_ensure_cash_register_open(uuid) from public;
grant execute on function public.vetra_ensure_cash_register_open(uuid) to authenticated;

commit;
