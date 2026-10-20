-- Editable bilingual WhatsApp message templates for each clinic tenant.
begin;

create table if not exists public.clinic_message_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  template_key text not null check (template_key in (
    'appointment_reminder', 'surgery_reminder', 'followup_reminder',
    'prescription_sharing', 'vaccination_due', 'vaccination_overdue', 'invoice_sharing'
  )),
  language text not null check (language in ('ar', 'en')),
  message text not null check (char_length(message) <= 6000),
  updated_at timestamptz not null default now(),
  unique (clinic_id, template_key, language)
);

alter table public.clinic_message_templates enable row level security;
drop policy if exists vetra_clinic_message_templates_select on public.clinic_message_templates;
create policy vetra_clinic_message_templates_select on public.clinic_message_templates
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_message_templates_insert on public.clinic_message_templates;
create policy vetra_clinic_message_templates_insert on public.clinic_message_templates
  for insert to authenticated with check (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_clinic_message_templates_update on public.clinic_message_templates;
create policy vetra_clinic_message_templates_update on public.clinic_message_templates
  for update to authenticated using (clinic_id = public.vetra_current_clinic_id())
  with check (clinic_id = public.vetra_current_clinic_id());

grant select, insert, update on public.clinic_message_templates to authenticated;
revoke all on public.clinic_message_templates from anon, public;

commit;
