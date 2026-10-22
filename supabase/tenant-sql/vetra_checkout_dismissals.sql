-- Hide an unbilled visit from the reception checkout queue without deleting its medical record.
-- Run on each clinic tenant database, not VETRA CORE.
begin;

create table if not exists public.clinic_checkout_dismissals (
  clinic_id uuid not null,
  visit_id uuid not null references public.visits(id) on delete cascade,
  dismissed_by uuid not null,
  dismissed_at timestamptz not null default now(),
  primary key (clinic_id, visit_id)
);

alter table public.clinic_checkout_dismissals enable row level security;
drop policy if exists vetra_checkout_dismissals_select on public.clinic_checkout_dismissals;
create policy vetra_checkout_dismissals_select on public.clinic_checkout_dismissals
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_checkout_dismissals_insert on public.clinic_checkout_dismissals;
create policy vetra_checkout_dismissals_insert on public.clinic_checkout_dismissals
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());

grant select, insert on public.clinic_checkout_dismissals to authenticated;
revoke all on public.clinic_checkout_dismissals from anon, public;

commit;
