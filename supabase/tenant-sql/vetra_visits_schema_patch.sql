-- Keep the visit history page compatible with older clinic tenant databases.
-- Run on the clinic tenant database (not VETRA Core).
begin;

alter table if exists public.visits
  add column if not exists examination text,
  add column if not exists diagnosis text,
  add column if not exists prognosis text,
  add column if not exists treatment text,
  add column if not exists notes text,
  add column if not exists weight numeric(8,2),
  add column if not exists temperature numeric(5,2),
  add column if not exists heart_rate numeric(8,2),
  add column if not exists respiratory_rate numeric(8,2);

notify pgrst, 'reload schema';
commit;
