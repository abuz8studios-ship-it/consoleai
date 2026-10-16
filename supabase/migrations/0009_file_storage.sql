-- ConsoleAI real file storage: private per-console folders in Supabase Storage.
-- Path convention: {console_id}/{uuid}-{filename}. Browser uploads as the
-- signed-in user; storage policies check the console folder against memberships.
insert into storage.buckets (id, name, public, file_size_limit)
values ('consoleai-files', 'consoleai-files', false, 10485760)
on conflict (id) do nothing;

drop policy if exists consoleai_files_select on storage.objects;
create policy consoleai_files_select on storage.objects
for select to authenticated
using (
  bucket_id = 'consoleai-files'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and ((storage.foldername(name))[1])::uuid in (select private.my_console_ids())
);

drop policy if exists consoleai_files_insert on storage.objects;
create policy consoleai_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'consoleai-files'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can_write_console(((storage.foldername(name))[1])::uuid)
);

drop policy if exists consoleai_files_update on storage.objects;
create policy consoleai_files_update on storage.objects
for update to authenticated
using (
  bucket_id = 'consoleai-files'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can_write_console(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'consoleai-files'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can_write_console(((storage.foldername(name))[1])::uuid)
);

drop policy if exists consoleai_files_delete on storage.objects;
create policy consoleai_files_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'consoleai-files'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and private.can_write_console(((storage.foldername(name))[1])::uuid)
);
