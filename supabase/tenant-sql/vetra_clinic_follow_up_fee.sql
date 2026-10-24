-- Default follow-up visit fee used when creating invoices from visits.
-- Run this on the clinic tenant database (not VETRA CORE).

alter table public.billing_settings
  add column if not exists follow_up_fee numeric(14,2) not null default 0;
