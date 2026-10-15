-- Durable custom habit icons (#56): a private bucket where each user owns the
-- objects under their own user-id folder, e.g. habit-icons/<uid>/<habitId>.jpg.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('habit-icons', 'habit-icons', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "habit icons: owner read" on storage.objects;
create policy "habit icons: owner read" on storage.objects for select
  using (bucket_id = 'habit-icons' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "habit icons: owner insert" on storage.objects;
create policy "habit icons: owner insert" on storage.objects for insert
  with check (bucket_id = 'habit-icons' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "habit icons: owner update" on storage.objects;
create policy "habit icons: owner update" on storage.objects for update
  using (bucket_id = 'habit-icons' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "habit icons: owner delete" on storage.objects;
create policy "habit icons: owner delete" on storage.objects for delete
  using (bucket_id = 'habit-icons' and (storage.foldername(name))[1] = auth.uid()::text);

alter table habits add column if not exists icon_storage_path text;
