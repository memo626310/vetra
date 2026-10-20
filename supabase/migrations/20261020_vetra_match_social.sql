-- VETRA Match social layer. Run on the VETRA CORE Supabase project
-- after 20261019_vetra_match_workflows.sql.
begin;

create table if not exists public.vetra_match_social_profiles (
  owner_key text primary key,
  display_name text not null check (char_length(display_name) between 2 and 80),
  bio text not null default '' check (char_length(bio) <= 500),
  city text,
  avatar_path text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vetra_match_follows (
  follower_key text not null,
  following_key text not null,
  created_at timestamptz not null default now(),
  primary key (follower_key, following_key),
  check (follower_key <> following_key)
);
create index if not exists vetra_match_follows_following_idx
  on public.vetra_match_follows (following_key, created_at desc);

create table if not exists public.vetra_match_posts (
  id uuid primary key default gen_random_uuid(),
  author_key text not null,
  author_display_name text not null check (char_length(author_display_name) between 2 and 80),
  body text not null check (char_length(body) between 1 and 2000),
  post_type text not null default 'story' check (post_type in ('story','care','question','adoption','breeding')),
  pet_name text,
  pet_species text check (pet_species is null or pet_species in ('dog','cat','other')),
  media_path text,
  status text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vetra_match_posts_feed_idx
  on public.vetra_match_posts (status, created_at desc);
create index if not exists vetra_match_posts_author_idx
  on public.vetra_match_posts (author_key, created_at desc);

create table if not exists public.vetra_match_post_likes (
  post_id uuid not null references public.vetra_match_posts(id) on delete cascade,
  actor_key text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, actor_key)
);
create index if not exists vetra_match_post_likes_actor_idx
  on public.vetra_match_post_likes (actor_key, created_at desc);

create table if not exists public.vetra_match_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.vetra_match_posts(id) on delete cascade,
  author_key text not null,
  author_display_name text not null check (char_length(author_display_name) between 2 and 80),
  body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'published' check (status in ('published','hidden','removed')),
  created_at timestamptz not null default now()
);
create index if not exists vetra_match_post_comments_idx
  on public.vetra_match_post_comments (post_id, created_at asc);

create table if not exists public.vetra_match_saved_posts (
  post_id uuid not null references public.vetra_match_posts(id) on delete cascade,
  actor_key text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, actor_key)
);

alter table public.vetra_match_notifications
  drop constraint if exists vetra_match_notifications_event_type_check;
alter table public.vetra_match_notifications
  add constraint vetra_match_notifications_event_type_check
  check (event_type in ('adoption_inquiry','breeding_match','message','follow','post_like','comment'));

alter table public.vetra_match_social_profiles enable row level security;
alter table public.vetra_match_follows enable row level security;
alter table public.vetra_match_posts enable row level security;
alter table public.vetra_match_post_likes enable row level security;
alter table public.vetra_match_post_comments enable row level security;
alter table public.vetra_match_saved_posts enable row level security;

revoke all on public.vetra_match_social_profiles, public.vetra_match_follows,
  public.vetra_match_posts, public.vetra_match_post_likes,
  public.vetra_match_post_comments, public.vetra_match_saved_posts
  from public, anon, authenticated;
grant all on public.vetra_match_social_profiles, public.vetra_match_follows,
  public.vetra_match_posts, public.vetra_match_post_likes,
  public.vetra_match_post_comments, public.vetra_match_saved_posts
  to service_role;

commit;
