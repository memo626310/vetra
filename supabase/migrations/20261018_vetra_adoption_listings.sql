-- Run on VETRA CORE Supabase. Demo profiles are clearly marked and use
-- fictional details; they are never linked to clinic clients or pet records.
begin;

create table if not exists public.vetra_adoption_listings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  species text not null check (species in ('dog', 'cat', 'other')),
  breed text,
  color text,
  age_label text not null,
  gender text check (gender in ('male', 'female', 'unknown')),
  city text not null,
  description text not null,
  photo_url text,
  status text not null default 'pending' check (status in ('pending', 'published', 'adopted', 'rejected')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vetra_adoption_listings add column if not exists color text;

create index if not exists vetra_adoption_listings_public_idx
  on public.vetra_adoption_listings (status, created_at desc);
create unique index if not exists vetra_adoption_listings_name_demo_idx
  on public.vetra_adoption_listings (name, is_demo);

alter table public.vetra_adoption_listings enable row level security;
revoke all on public.vetra_adoption_listings from public, anon, authenticated;
grant select on public.vetra_adoption_listings to anon, authenticated;
grant all on public.vetra_adoption_listings to service_role;

drop policy if exists vetra_adoption_listings_public_read on public.vetra_adoption_listings;
create policy vetra_adoption_listings_public_read
  on public.vetra_adoption_listings for select to anon, authenticated
  using (status = 'published');

insert into public.vetra_adoption_listings
  (name, species, breed, color, age_label, gender, city, description, photo_url, status, is_demo)
values
  ('لوزة', 'cat', 'بلدي', 'أبيض ورمادي', 'سنة تقريبًا', 'female', 'القاهرة', 'قطة ودودة وهادئة، تبحث عن بيت آمن ورعاية مستمرة.', '/match-pets/demo-cat-orange.webp', 'published', true),
  ('بندق', 'dog', 'بلدي', 'بني', 'سنتان تقريبًا', 'male', 'الجيزة', 'كلب اجتماعي ونشيط، يحتاج أسرة لديها وقت للمشي واللعب.', '/match-pets/demo-dog-golden.webp', 'published', true),
  ('سمسم', 'cat', 'شيرازي خليط', 'أبيض', '٨ أشهر تقريبًا', 'male', 'الإسكندرية', 'قط فضولي ولطيف، مناسب للتعارف التدريجي داخل منزل آمن.', null, 'published', true)
on conflict (name, is_demo) do nothing;

-- Breeding profiles are kept separate from adoption. Only profiles with a
-- veterinary-approved review are real candidates; demo rows exist for UI QA.
create table if not exists public.vetra_breeding_listings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  species text not null check (species in ('dog', 'cat', 'other')),
  breed text,
  color text,
  age_label text not null,
  gender text not null check (gender in ('male', 'female', 'unknown')),
  city text not null,
  description text not null,
  photo_url text,
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  health_review_status text not null default 'pending' check (health_review_status in ('pending', 'approved', 'rejected')),
  health_reviewed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vetra_breeding_real_review_check check (
    is_demo or (health_review_status <> 'approved' or health_reviewed_at is not null)
  )
);

alter table public.vetra_breeding_listings add column if not exists color text;
alter table public.vetra_breeding_listings add column if not exists health_review_status text not null default 'pending';
alter table public.vetra_breeding_listings add column if not exists health_reviewed_at timestamptz;
alter table public.vetra_breeding_listings add column if not exists is_demo boolean not null default false;

create index if not exists vetra_breeding_listings_public_idx
  on public.vetra_breeding_listings (status, species, health_review_status, created_at desc);
create unique index if not exists vetra_breeding_listings_name_demo_idx
  on public.vetra_breeding_listings (name, is_demo);

alter table public.vetra_breeding_listings enable row level security;
revoke all on public.vetra_breeding_listings from public, anon, authenticated;
grant select on public.vetra_breeding_listings to anon, authenticated;
grant all on public.vetra_breeding_listings to service_role;
drop policy if exists vetra_breeding_listings_public_read on public.vetra_breeding_listings;
create policy vetra_breeding_listings_public_read
  on public.vetra_breeding_listings for select to anon, authenticated
  using (status = 'published' and (is_demo or health_review_status = 'approved'));

insert into public.vetra_breeding_listings
  (name, species, breed, color, age_label, gender, city, description, photo_url, status, health_review_status, is_demo)
values
  ('فلفل', 'cat', 'بلدي', 'برتقالي وأبيض', 'سنتان', 'male', 'القاهرة', 'مثال تجريبي لملف قط. يلزم فحص بيطري قبل أي تزاوج.', '/match-pets/demo-cat-orange.webp', 'published', 'pending', true),
  ('لولي', 'cat', 'شيرازي خليط', 'أبيض', 'سنة ونصف', 'female', 'الجيزة', 'مثال تجريبي لملف قطة. لا يمثل حالة صحية أو تناسلية موثقة.', null, 'published', 'pending', true),
  ('ماكس', 'dog', 'جولدن ريتريفر', 'ذهبي', '٣ سنوات', 'male', 'القاهرة', 'مثال تجريبي لملف كلب. يلزم فحص بيطري قبل أي تزاوج.', '/match-pets/demo-dog-golden.webp', 'published', 'pending', true),
  ('بيلا', 'dog', 'بلدي', 'بني وأسود', 'سنتان', 'female', 'الإسكندرية', 'مثال تجريبي لملف كلبة. لا يمثل حالة صحية أو تناسلية موثقة.', '/match-pets/demo-dog-mixed.webp', 'published', 'pending', true)
on conflict (name, is_demo) do nothing;

commit;
