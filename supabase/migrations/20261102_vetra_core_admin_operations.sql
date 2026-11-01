-- Run on VETRA CORE Supabase.
begin;

alter table public.subscriptions
  add column if not exists billing_period text not null default 'trial'
    check (billing_period in ('trial', 'monthly', 'two_months', 'yearly', 'lifetime'));

update public.subscriptions
set billing_period = case
  when status = 'trial' then 'trial'
  when status in ('active', 'past_due') and ends_at is null then 'lifetime'
  when status in ('active', 'past_due') then 'monthly'
  else 'trial'
end;

create table if not exists public.vetra_platform_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  route text not null,
  page_label text not null,
  event_type text not null default 'page_view' check (event_type in ('page_view', 'heartbeat')),
  created_at timestamptz not null default now()
);

create index if not exists vetra_platform_activity_recent_idx
  on public.vetra_platform_activity (created_at desc);
create index if not exists vetra_platform_activity_clinic_user_idx
  on public.vetra_platform_activity (clinic_id, user_id, created_at desc);

alter table public.vetra_platform_activity enable row level security;
revoke all on public.vetra_platform_activity from public, anon, authenticated;
grant all on public.vetra_platform_activity to service_role;

commit;
