-- VETRA Match production workflows. Run on the VETRA CORE project.
begin;

create table if not exists public.vetra_match_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  terms_version text not null default '2026-10-v1',
  terms_accepted_at timestamptz not null default now(),
  adult_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vetra_match_pets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  species text not null check (species in ('dog','cat','other')),
  breed text,
  color text,
  birth_date date,
  gender text not null default 'unknown' check (gender in ('male','female','unknown')),
  city text not null,
  description text not null check (char_length(description) between 10 and 1200),
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vetra_match_pets_owner_idx on public.vetra_match_pets(owner_user_id, created_at desc);

alter table public.vetra_adoption_listings
  add column if not exists owner_key text,
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists owner_client_id uuid,
  add column if not exists clinic_id uuid,
  add column if not exists source_pet_id uuid,
  add column if not exists source_match_pet_id uuid references public.vetra_match_pets(id) on delete cascade,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists moderation_note text;
alter table public.vetra_adoption_listings drop constraint if exists vetra_adoption_listings_status_check;
alter table public.vetra_adoption_listings add constraint vetra_adoption_listings_status_check
  check (status in ('pending','published','adopted','rejected','withdrawn'));

alter table public.vetra_breeding_listings
  add column if not exists owner_key text,
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists owner_client_id uuid,
  add column if not exists clinic_id uuid,
  add column if not exists source_pet_id uuid,
  add column if not exists source_match_pet_id uuid references public.vetra_match_pets(id) on delete cascade,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists moderation_note text,
  add column if not exists reproductive_review_status text not null default 'pending'
    check (reproductive_review_status in ('pending','approved','rejected')),
  add column if not exists welfare_review_status text not null default 'pending'
    check (welfare_review_status in ('pending','approved','rejected'));
alter table public.vetra_breeding_listings drop constraint if exists vetra_breeding_listings_status_check;
alter table public.vetra_breeding_listings add constraint vetra_breeding_listings_status_check
  check (status in ('pending','published','rejected','withdrawn'));

create table if not exists public.vetra_match_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('moderator','veterinarian','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.vetra_match_interactions (
  id uuid primary key default gen_random_uuid(),
  actor_key text not null,
  target_listing_id uuid not null,
  listing_type text not null check (listing_type in ('adoption','breeding')),
  action text not null check (action in ('like','pass','inquiry')),
  created_at timestamptz not null default now(),
  unique (actor_key, target_listing_id)
);
create index if not exists vetra_match_interactions_inbox_idx
  on public.vetra_match_interactions (target_listing_id, created_at desc)
  where action in ('like','inquiry');

create table if not exists public.vetra_match_blocks (
  owner_key text not null,
  blocked_owner_key text not null,
  created_at timestamptz not null default now(),
  primary key (owner_key, blocked_owner_key),
  check (owner_key <> blocked_owner_key)
);

create table if not exists public.vetra_match_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_key text not null,
  target_listing_id uuid not null,
  listing_type text not null check (listing_type in ('adoption','breeding')),
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists vetra_match_reports_queue_idx
  on public.vetra_match_reports (status, created_at asc);
create unique index if not exists vetra_match_reports_once_idx
  on public.vetra_match_reports (reporter_key, target_listing_id);

create table if not exists public.vetra_match_threads (
  id uuid primary key default gen_random_uuid(),
  listing_type text not null check (listing_type in ('adoption','breeding')),
  listing_id uuid not null,
  requester_key text not null,
  listing_owner_key text not null,
  status text not null default 'open' check (status in ('open','closed','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, requester_key),
  check (requester_key <> listing_owner_key)
);

create table if not exists public.vetra_match_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.vetra_match_threads(id) on delete cascade,
  sender_key text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists vetra_match_messages_thread_idx
  on public.vetra_match_messages (thread_id, created_at asc);

create table if not exists public.vetra_match_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_key text not null,
  actor_key text,
  event_type text not null check (event_type in ('adoption_inquiry','breeding_match','message')),
  thread_id uuid references public.vetra_match_threads(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists vetra_match_notifications_inbox_idx
  on public.vetra_match_notifications (recipient_key, created_at desc);

drop policy if exists vetra_breeding_listings_public_read on public.vetra_breeding_listings;
create policy vetra_breeding_listings_public_read
  on public.vetra_breeding_listings for select to anon, authenticated
  using (status = 'published' and (is_demo or (
    health_review_status = 'approved'
    and reproductive_review_status = 'approved'
    and welfare_review_status = 'approved'
  )));

-- Keep owner keys and clinic/client identifiers server-only. Only public
-- profile fields are selectable directly by anonymous or signed-in clients.
revoke select on public.vetra_adoption_listings, public.vetra_breeding_listings from anon, authenticated;
grant select (id,name,species,breed,color,age_label,gender,city,description,photo_url,status,is_demo,created_at)
  on public.vetra_adoption_listings to anon, authenticated;
grant select (id,name,species,breed,color,age_label,gender,city,description,photo_url,status,is_demo,health_review_status,reproductive_review_status,welfare_review_status,created_at)
  on public.vetra_breeding_listings to anon, authenticated;

alter table public.vetra_match_profiles enable row level security;
alter table public.vetra_match_pets enable row level security;
alter table public.vetra_match_moderators enable row level security;
alter table public.vetra_match_interactions enable row level security;
alter table public.vetra_match_blocks enable row level security;
alter table public.vetra_match_reports enable row level security;
alter table public.vetra_match_threads enable row level security;
alter table public.vetra_match_messages enable row level security;
alter table public.vetra_match_notifications enable row level security;
revoke all on public.vetra_match_profiles, public.vetra_match_pets, public.vetra_match_moderators,
  public.vetra_match_interactions, public.vetra_match_blocks, public.vetra_match_reports,
  public.vetra_match_threads, public.vetra_match_messages, public.vetra_match_notifications from public, anon, authenticated;
grant all on public.vetra_match_profiles, public.vetra_match_pets, public.vetra_match_moderators,
  public.vetra_match_interactions, public.vetra_match_blocks, public.vetra_match_reports,
  public.vetra_match_threads, public.vetra_match_messages, public.vetra_match_notifications to service_role;

-- All writes go through authenticated, server-validated route handlers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vetra-match-pets', 'vetra-match-pets', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;

-- After deploying, explicitly grant moderator access to verified Core users.
-- Example (replace the email and role after confirming the account identity):
-- insert into public.vetra_match_moderators(user_id, role)
-- select id, 'veterinarian' from auth.users where lower(email) = lower('vet@example.com')
-- on conflict (user_id) do update set role = excluded.role, active = true;
