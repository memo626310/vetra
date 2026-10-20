-- Run on VETRA CORE Supabase. Activity writes and reads use the service role.
begin;

create table if not exists public.vetra_client_activity (
  clinic_id uuid not null,
  owner_client_id uuid not null,
  last_seen_at timestamptz not null default now(),
  primary key (clinic_id, owner_client_id)
);

create index if not exists vetra_client_activity_recent_idx
  on public.vetra_client_activity (clinic_id, last_seen_at desc);

alter table public.vetra_client_activity enable row level security;
revoke all on public.vetra_client_activity from public, anon, authenticated;
grant all on public.vetra_client_activity to service_role;

commit;
