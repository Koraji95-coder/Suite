-- Supabase Storage hardening for project-files bucket
-- Apply in Supabase SQL Editor (dev first, then production)
-- Assumes bucket name: project-files

begin;

-- Optional: ensure bucket exists (safe no-op if already present)
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

-- Recommended object key format for new uploads:
--   <user_id>/<project_id>/<timestamp>_<filename>

-- Remove old policies if present

drop policy if exists "project_files_select_own" on storage.objects;
drop policy if exists "project_files_insert_own" on storage.objects;
drop policy if exists "project_files_update_own" on storage.objects;
drop policy if exists "project_files_delete_own" on storage.objects;

-- SELECT policy: allow access to
-- 1) New format keys prefixed with auth.uid()
-- 2) Legacy keys if there is a files row owned by user with matching file_path
create policy "project_files_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'project-files'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or exists (
      select 1
      from public.files f
      where f.file_path = name
        and f.user_id = auth.uid()
    )
  )
);

-- INSERT policy: require new user-prefixed key
create policy "project_files_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-files'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- UPDATE policy: restrict to own objects only
create policy "project_files_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-files'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or exists (
      select 1
      from public.files f
      where f.file_path = name
        and f.user_id = auth.uid()
    )
  )
)
with check (
  bucket_id = 'project-files'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- DELETE policy: restrict to own objects only
create policy "project_files_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-files'
  and (
    split_part(name, '/', 1) = auth.uid()::text
    or exists (
      select 1
      from public.files f
      where f.file_path = name
        and f.user_id = auth.uid()
    )
  )
);

commit;
