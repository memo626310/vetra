-- Allow scanned written prescriptions to be stored beside visit attachments.
-- Run on each clinic tenant database after vetra_visit_attachments.sql.
begin;

alter table public.visit_attachments
  drop constraint if exists visit_attachments_category_check;

alter table public.visit_attachments
  add constraint visit_attachments_category_check
  check (category in ('analysis', 'xray', 'prescription'));

commit;
