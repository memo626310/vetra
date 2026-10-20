-- Run on VETRA CORE Supabase.
-- Push subscription endpoints are private user/device data. Reads and writes
-- are performed only by the VETRA server using the service-role key.

begin;

create table if not exists public.vetra_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('owner', 'clinic')),
  clinic_id uuid not null,
  owner_client_id uuid,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vetra_push_subscription_identity_check check (
    (audience = 'owner' and owner_client_id is not null)
    or (audience = 'clinic' and owner_client_id is null)
  )
);

create index if not exists vetra_push_subscriptions_clinic_idx
  on public.vetra_push_subscriptions (clinic_id, audience);

create index if not exists vetra_push_subscriptions_owner_idx
  on public.vetra_push_subscriptions (clinic_id, owner_client_id)
  where audience = 'owner';

create table if not exists public.vetra_push_deliveries (
  event_key text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.vetra_push_reminders (
  id uuid primary key default gen_random_uuid(),
  reminder_key text not null unique,
  clinic_id uuid not null,
  owner_client_id uuid not null,
  pet_id uuid not null,
  pet_name text not null,
  protocol_key text not null check (protocol_key in ('viral', 'rabies', 'deworm', 'parasite')),
  due_date date not null,
  scheduled_at timestamptz not null,
  language text not null default 'ar' check (language in ('ar', 'en')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'skipped', 'failed', 'cancelled')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vetra_push_reminders_due_idx
  on public.vetra_push_reminders (scheduled_at)
  where status = 'pending';

create index if not exists vetra_push_reminders_owner_idx
  on public.vetra_push_reminders (clinic_id, owner_client_id, pet_id);

alter table public.vetra_push_subscriptions enable row level security;
revoke all on public.vetra_push_subscriptions from public, anon, authenticated;
grant all on public.vetra_push_subscriptions to service_role;

alter table public.vetra_push_deliveries enable row level security;
revoke all on public.vetra_push_deliveries from public, anon, authenticated;
grant all on public.vetra_push_deliveries to service_role;

alter table public.vetra_push_reminders enable row level security;
revoke all on public.vetra_push_reminders from public, anon, authenticated;
grant all on public.vetra_push_reminders to service_role;

commit;
