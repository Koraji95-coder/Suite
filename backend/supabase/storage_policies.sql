-- Storage bucket and object policies for Suite project files.
-- Run after supabase/consolidated_migration.sql and backend/supabase/rls_hardening.sql

-- Create the project files bucket if missing.
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

-- Remove old policies so this script is rerunnable.
drop policy if exists project_files_select_own on storage.objects;
drop policy if exists project_files_insert_own on storage.objects;
drop policy if exists project_files_update_own on storage.objects;
drop policy if exists project_files_delete_own on storage.objects;

-- Enforce user-prefix path strategy:
-- object name must start with <auth.uid()>/...
create policy project_files_select_own
on storage.objects
for select
to authenticated
using (
	bucket_id = 'project-files'
	and (storage.foldername(name))[1] = auth.uid()::text
);

create policy project_files_insert_own
on storage.objects
for insert
to authenticated
with check (
	bucket_id = 'project-files'
	and (storage.foldername(name))[1] = auth.uid()::text
);

create policy project_files_update_own
on storage.objects
for update
to authenticated
using (
	bucket_id = 'project-files'
	and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
	bucket_id = 'project-files'
	and (storage.foldername(name))[1] = auth.uid()::text
);

create policy project_files_delete_own
on storage.objects
for delete
to authenticated
using (
	bucket_id = 'project-files'
	and (storage.foldername(name))[1] = auth.uid()::text
);
