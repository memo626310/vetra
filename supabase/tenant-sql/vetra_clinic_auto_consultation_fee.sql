-- Add the optional consultation fee flag to existing clinic tenants.
-- Safe to run repeatedly.
begin;
alter table public.billing_settings
  add column if not exists auto_add_consultation_fee boolean not null default true;
commit;
