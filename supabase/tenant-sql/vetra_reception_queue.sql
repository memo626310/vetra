-- Explicit queue for visit invoices the doctor chooses to send to reception.
-- Run on each clinic tenant database, not VETRA CORE.
begin;

create table if not exists public.clinic_reception_queue (
  clinic_id uuid not null,
  visit_id uuid not null references public.visits(id) on delete cascade,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  primary key (clinic_id, visit_id)
);

alter table public.clinic_reception_queue enable row level security;
drop policy if exists vetra_reception_queue_select on public.clinic_reception_queue;
create policy vetra_reception_queue_select on public.clinic_reception_queue
  for select to authenticated using (clinic_id = public.vetra_current_clinic_id());
drop policy if exists vetra_reception_queue_insert on public.clinic_reception_queue;
create policy vetra_reception_queue_insert on public.clinic_reception_queue
  for insert to authenticated with check (
    clinic_id = public.vetra_current_clinic_id()
    and (sent_by is null or sent_by = auth.uid())
  );

grant select, insert on public.clinic_reception_queue to authenticated;
revoke all on public.clinic_reception_queue from anon, public;

-- The dedicated visit workflow stores these notes. Queue insertion in the trigger
-- shares the transaction that changes the invoice from draft to issued.
create or replace function public.vetra_enqueue_reception_visit_invoice()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'draft'
     and new.status in ('issued', 'unpaid', 'partially_paid')
     and new.visit_id is not null
     and new.notes in ('فاتورة من الزيارة للاستقبال', 'Invoice from visit for reception') then
    insert into public.clinic_reception_queue (clinic_id, visit_id, sent_by)
    values (new.clinic_id, new.visit_id, auth.uid())
    on conflict (clinic_id, visit_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists vetra_enqueue_reception_visit_invoice on public.invoices;
create trigger vetra_enqueue_reception_visit_invoice
  after update of status on public.invoices
  for each row execute function public.vetra_enqueue_reception_visit_invoice();

-- Backfill invoices previously sent through the same dedicated workflow.
insert into public.clinic_reception_queue (clinic_id, visit_id, sent_at)
select i.clinic_id, i.visit_id, coalesce(i.issued_at, now())
from public.invoices i
where i.visit_id is not null
  and i.status in ('issued', 'unpaid', 'partially_paid')
  and i.notes in ('فاتورة من الزيارة للاستقبال', 'Invoice from visit for reception')
on conflict (clinic_id, visit_id) do nothing;

commit;
