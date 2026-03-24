alter table if exists public.drawing_revision_register_entries
	add column if not exists revision_description text not null default '',
	add column if not exists revision_by text not null default '',
	add column if not exists revision_checked_by text not null default '',
	add column if not exists revision_date date null,
	add column if not exists revision_sort_order integer not null default 0;

create table if not exists public.project_title_block_profiles (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.projects (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	block_name text not null default 'R3P-24x36BORDER&TITLE',
	project_root_path text null,
	acade_line1 text not null default '',
	acade_line2 text not null default '',
	acade_line4 text not null default '',
	signer_drawn_by text not null default '',
	signer_checked_by text not null default '',
	signer_engineer text not null default '',
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	constraint project_title_block_profiles_project_id_key unique (project_id)
);

create index if not exists idx_project_title_block_profiles_project_id
	on public.project_title_block_profiles (project_id);
create index if not exists idx_project_title_block_profiles_user_id
	on public.project_title_block_profiles (user_id, updated_at desc);

drop trigger if exists set_project_title_block_profiles_updated_at on public.project_title_block_profiles;
create trigger set_project_title_block_profiles_updated_at
before update on public.project_title_block_profiles
for each row execute function public.set_updated_at();
