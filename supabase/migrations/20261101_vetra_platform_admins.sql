-- Run on VETRA CORE Supabase.
-- This is intentionally separate from the VETRA Tinder migration so the
-- central console can be enabled on an existing Core project safely.

begin;

create table if not exists public.vetra_match_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('moderator', 'veterinarian', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.vetra_match_moderators enable row level security;
revoke all on public.vetra_match_moderators from public, anon, authenticated;
grant all on public.vetra_match_moderators to service_role;

commit;

-- After running the migration, grant the console to a verified Core account.
-- Replace the email with the platform administrator's actual Core email.
-- insert into public.vetra_match_moderators (user_id, role)
-- select id, 'admin'
-- from auth.users
-- where lower(email) = lower('admin@example.com')
-- on conflict (user_id) do update
-- set role = excluded.role, active = true;
