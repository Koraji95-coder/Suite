alter table if exists public.project_title_block_profiles
	add column if not exists acade_project_file_path text null;
