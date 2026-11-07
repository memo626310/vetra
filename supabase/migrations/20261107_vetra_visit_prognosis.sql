-- Store the clinician's prognosis selection on each visit.
-- Run on each clinic tenant database.
begin;

alter table if exists public.visits
  add column if not exists prognosis text;

alter table public.visits
  drop constraint if exists visits_prognosis_check;

alter table public.visits
  add constraint visits_prognosis_check
  check (prognosis is null or prognosis in ('good', 'mild', 'moderate', 'sever', 'fear', 'bad'));

notify pgrst, 'reload schema';
commit;
