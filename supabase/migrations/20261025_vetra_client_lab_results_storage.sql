-- The lab report APIs reuse the existing private visit attachment bucket in VETRA Core.
-- Keep this migration safe to run even when the bucket already exists.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-attachments', 'visit-attachments', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
