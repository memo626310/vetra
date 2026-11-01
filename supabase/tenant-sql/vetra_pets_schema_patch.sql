-- Run on each clinic tenant database, not VETRA CORE.
-- Older tenant databases may have been created before the pets fields used by
-- the current client and medical-record screens were added.
begin;

alter table if exists public.pets
  add column if not exists microchip text;

notify pgrst, 'reload schema';
commit;
