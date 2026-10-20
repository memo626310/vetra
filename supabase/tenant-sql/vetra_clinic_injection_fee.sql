-- Default per-injection fee used for medication charges on new visit invoices.
-- Run this on the clinic tenant database (not VETRA CORE).

alter table public.billing_settings
  add column if not exists injection_fee numeric(14,2) not null default 0;
