-- Consolidated Supabase schema bootstrap for Suite.
-- Run this first in Supabase SQL Editor, then run:
--   1) backend/supabase/rls_hardening.sql
--   2) backend/supabase/storage_policies.sql

create extension if not exists pgcrypto;

-- ============================================================================
-- Enums
-- ============================================================================
do $$
begin
	if not exists (
		select 1 from pg_type where typname = 'project_status'
	) then
		create type public.project_status as enum (
			'active',
			'completed',
			'archived',
			'on-hold'
		);
	end if;
end $$;

do $$
begin
	if not exists (
		select 1 from pg_type where typname = 'project_priority'
	) then
		create type public.project_priority as enum (
			'low',
			'medium',
			'high',
			'urgent'
		);
	end if;
end $$;

do $$
begin
	if not exists (
		select 1 from pg_type where typname = 'task_priority'
	) then
		create type public.task_priority as enum (
			'low',
			'medium',
			'high',
			'urgent'
		);
	end if;
end $$;

do $$
begin
	if not exists (
		select 1 from pg_type where typname = 'event_type'
	) then
		create type public.event_type as enum (
			'deadline',
			'milestone',
			'reminder'
		);
	end if;
end $$;

do $$
begin
	if not exists (
		select 1 from pg_type where typname = 'memory_type'
	) then
		create type public.memory_type as enum (
			'preference',
			'knowledge',
			'pattern',
			'relationship'
		);
	end if;
end $$;

do $$
begin
	if not exists (
		select 1 from pg_type where typname = 'workflow_type'
	) then
		create type public.workflow_type as enum (
			'calculation',
			'integration',
			'report',
			'custom'
		);
	end if;
end $$;

do $$
begin
	if not exists (
		select 1 from pg_type where typname = 'annotation_status'
	) then
		create type public.annotation_status as enum (
			'pending',
			'reviewed',
			'approved',
			'rejected'
		);
	end if;
end $$;

-- ============================================================================
-- Tables
-- ============================================================================
create table if not exists public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	email text null,
	display_name text null,
	avatar_url text null,
	theme_preference text null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.projects (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	description text not null default '',
	deadline date null,
	priority public.project_priority not null default 'medium',
	color text not null default '#3B82F6',
	status public.project_status not null default 'active',
	category text not null default 'Uncategorized',
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	user_id uuid not null references auth.users (id) on delete cascade
);

create table if not exists public.tasks (
	id uuid primary key default gen_random_uuid(),
	project_id uuid null references public.projects (id) on delete cascade,
	name text not null,
	description text not null default '',
	completed boolean not null default false,
	"order" integer not null default 0,
	due_date date null,
	parent_task_id uuid null references public.tasks (id) on delete cascade,
	priority public.task_priority not null default 'medium',
	created_at timestamptz not null default timezone('utc', now()),
	user_id uuid not null references auth.users (id) on delete cascade
);

create table if not exists public.files (
	id uuid primary key default gen_random_uuid(),
	project_id uuid null references public.projects (id) on delete cascade,
	name text not null,
	file_path text not null,
	size bigint not null default 0,
	mime_type text not null default '',
	uploaded_at timestamptz not null default timezone('utc', now()),
	user_id uuid not null references auth.users (id) on delete cascade
);

create table if not exists public.activity_log (
	id uuid primary key default gen_random_uuid(),
	action text not null,
	description text not null,
	project_id uuid null references public.projects (id) on delete set null,
	task_id uuid null references public.tasks (id) on delete set null,
	timestamp timestamptz not null default timezone('utc', now()),
	user_id uuid not null references auth.users (id) on delete cascade
);

create table if not exists public.work_ledger_entries (
	id uuid primary key default gen_random_uuid(),
	title text not null,
	summary text not null default '',
	source_kind text not null default 'manual',
	commit_refs text[] not null default '{}',
	project_id uuid null references public.projects (id) on delete set null,
	app_area text null,
	architecture_paths text[] not null default '{}',
	hotspot_ids text[] not null default '{}',
	lifecycle_state text not null default 'completed',
	publish_state text not null default 'draft',
	published_at timestamptz null,
	external_reference text null,
	external_url text null,
	user_id uuid not null references auth.users (id) on delete cascade,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.work_ledger_entries
	add column if not exists published_at timestamptz null;

alter table if exists public.work_ledger_entries
	add column if not exists lifecycle_state text not null default 'completed';

create table if not exists public.work_ledger_publish_jobs (
	id uuid primary key default gen_random_uuid(),
	entry_id uuid not null references public.work_ledger_entries (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	publisher text not null,
	mode text not null,
	status text not null,
	workstation_id text null,
	repo_path text null,
	artifact_dir text null,
	stdout_excerpt text null,
	stderr_excerpt text null,
	error_text text null,
	external_reference text null,
	external_url text null,
	published_at timestamptz null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.calendar_events (
	id uuid primary key default gen_random_uuid(),
	project_id uuid null references public.projects (id) on delete cascade,
	task_id uuid null references public.tasks (id) on delete set null,
	due_date date not null,
	title text not null,
	type public.event_type not null default 'reminder',
	description text null,
	location text null,
	color text null,
	all_day boolean not null default true,
	start_at timestamptz null,
	end_at timestamptz null,
	user_id uuid not null references auth.users (id) on delete cascade
);

create table if not exists public.recent_files (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	file_name text not null,
	file_path text not null,
	file_type text not null default 'unknown',
	context text not null default '',
	accessed_at timestamptz not null default timezone('utc', now()),
	created_at timestamptz not null default timezone('utc', now()),
	constraint recent_files_user_id_file_path_key unique (user_id, file_path)
);

create table if not exists public.user_settings (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	setting_key text not null,
	setting_value jsonb not null default '{}'::jsonb,
	project_id uuid null references public.projects (id) on delete cascade,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_preferences (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null unique references auth.users (id) on delete cascade,
	theme text not null default 'system',
	layout text not null default 'default',
	notifications_enabled boolean not null default true,
	auto_save boolean not null default true,
	language text not null default 'en',
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_passkeys (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	user_email text not null,
	credential_id text not null,
	public_key text not null,
	sign_count bigint not null default 0,
	aaguid text null,
	device_type text null,
	backed_up boolean not null default false,
	transports text[] not null default '{}',
	friendly_name text null,
	last_used_at timestamptz null,
	revoked_at timestamptz null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.formulas (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	category text not null,
	formula text not null,
	description text not null default '',
	variables jsonb not null default '{}'::jsonb,
	user_id uuid not null references auth.users (id) on delete cascade,
	created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.saved_calculations (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	calculation_type text not null,
	inputs jsonb not null default '{}'::jsonb,
	results jsonb not null default '{}'::jsonb,
	notes text not null default '',
	created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.saved_circuits (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	name text not null,
	circuit_data jsonb not null default '{}'::jsonb,
	image_url text null,
	created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.whiteboards (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	title text not null,
	panel_context text not null,
	canvas_data jsonb not null default '{}'::jsonb,
	thumbnail_url text null,
	tags text[] not null default '{}',
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_conversations (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	panel_context text null,
	title text null,
	messages jsonb not null default '[]'::jsonb,
	context_data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_memory (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	memory_type public.memory_type not null,
	content jsonb not null,
	connections jsonb not null default '{}'::jsonb,
	strength integer not null default 1,
	created_at timestamptz not null default timezone('utc', now()),
	last_accessed timestamptz not null default timezone('utc', now())
);

create table if not exists public.block_library (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	name text not null,
	file_path text not null,
	thumbnail_url text null,
	category text not null default '',
	tags text[] not null default '{}',
	is_dynamic boolean not null default false,
	dynamic_variations jsonb not null default '{}'::jsonb,
	attributes jsonb not null default '{}'::jsonb,
	views jsonb not null default '{}'::jsonb,
	file_size bigint not null default 0,
	usage_count integer not null default 0,
	is_favorite boolean not null default false,
	created_at timestamptz not null default timezone('utc', now()),
	last_used timestamptz null
);

create table if not exists public.automation_workflows (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	name text not null,
	description text null,
	workflow_type public.workflow_type not null,
	script_data jsonb not null default '{}'::jsonb,
	schedule text null,
	is_active boolean not null default true,
	last_run timestamptz null,
	run_count integer not null default 0,
	created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.drawing_annotations (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	project_id uuid null references public.projects (id) on delete cascade,
	drawing_name text not null,
	file_path text not null,
	annotation_data jsonb not null default '{}'::jsonb,
	qa_checks jsonb not null default '{}'::jsonb,
	comparison_data jsonb not null default '{}'::jsonb,
	issues_found jsonb not null default '{}'::jsonb,
	status public.annotation_status not null default 'pending',
	created_at timestamptz not null default timezone('utc', now()),
	reviewed_at timestamptz null
);

create table if not exists public.ground_grid_designs (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	project_id uuid null references public.projects (id) on delete set null,
	config jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ground_grid_rods (
	id uuid primary key default gen_random_uuid(),
	design_id uuid not null references public.ground_grid_designs (id) on delete cascade,
	label text not null,
	grid_x double precision not null,
	grid_y double precision not null,
	depth double precision not null,
	diameter double precision not null,
	sort_order integer not null default 0
);

create table if not exists public.ground_grid_conductors (
	id uuid primary key default gen_random_uuid(),
	design_id uuid not null references public.ground_grid_designs (id) on delete cascade,
	label text not null,
	length double precision null,
	x1 double precision not null,
	y1 double precision not null,
	x2 double precision not null,
	y2 double precision not null,
	diameter double precision not null,
	sort_order integer not null default 0
);

create table if not exists public.ground_grid_results (
	id uuid primary key default gen_random_uuid(),
	design_id uuid not null references public.ground_grid_designs (id) on delete cascade,
	placements jsonb not null default '[]'::jsonb,
	segment_count integer not null default 0,
	tee_count integer not null default 0,
	cross_count integer not null default 0,
	rod_count integer not null default 0,
	total_conductor_length double precision not null default 0
);

-- ============================================================================
-- Indexes
-- ============================================================================
create index if not exists idx_projects_user_id on public.projects (user_id);
create index if not exists idx_projects_created_at on public.projects (created_at desc);

create index if not exists idx_tasks_user_id on public.tasks (user_id);
create index if not exists idx_tasks_project_id on public.tasks (project_id);
create index if not exists idx_tasks_parent_task_id on public.tasks (parent_task_id);

create index if not exists idx_files_user_id on public.files (user_id);
create index if not exists idx_files_project_id on public.files (project_id);

create index if not exists idx_activity_log_user_id on public.activity_log (user_id);
create index if not exists idx_activity_log_timestamp on public.activity_log (timestamp desc);
create index if not exists idx_work_ledger_entries_user_id on public.work_ledger_entries (user_id);
create index if not exists idx_work_ledger_entries_project_id on public.work_ledger_entries (project_id);
create index if not exists idx_work_ledger_entries_publish_state on public.work_ledger_entries (publish_state);
create index if not exists idx_work_ledger_entries_updated_at on public.work_ledger_entries (updated_at desc);
create index if not exists idx_work_ledger_publish_jobs_entry_id on public.work_ledger_publish_jobs (entry_id, created_at desc);
create index if not exists idx_work_ledger_publish_jobs_user_id on public.work_ledger_publish_jobs (user_id, created_at desc);
create index if not exists idx_work_ledger_publish_jobs_status on public.work_ledger_publish_jobs (status, created_at desc);

create index if not exists idx_calendar_events_user_id on public.calendar_events (user_id);
create index if not exists idx_calendar_events_project_id on public.calendar_events (project_id);
create index if not exists idx_calendar_events_task_id on public.calendar_events (task_id);
create index if not exists idx_calendar_events_due_date on public.calendar_events (due_date asc);

create index if not exists idx_recent_files_user_id on public.recent_files (user_id);
create index if not exists idx_recent_files_accessed_at on public.recent_files (accessed_at desc);

create index if not exists idx_user_settings_user_id on public.user_settings (user_id);
create index if not exists idx_user_settings_project_id on public.user_settings (project_id);
create unique index if not exists user_settings_unique_scope_idx
	on public.user_settings (
		user_id,
		setting_key,
		coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
	);

create index if not exists idx_user_passkeys_user_id
	on public.user_passkeys (user_id);
create index if not exists idx_user_passkeys_user_email
	on public.user_passkeys (user_email);
create unique index if not exists idx_user_passkeys_credential_active
	on public.user_passkeys (credential_id)
	where revoked_at is null;

create index if not exists idx_formulas_user_id on public.formulas (user_id);
create index if not exists idx_saved_calculations_user_id on public.saved_calculations (user_id);
create index if not exists idx_saved_circuits_user_id on public.saved_circuits (user_id);
create index if not exists idx_whiteboards_user_id on public.whiteboards (user_id);
create index if not exists idx_ai_conversations_user_id on public.ai_conversations (user_id);
create index if not exists idx_ai_memory_user_id on public.ai_memory (user_id);
create index if not exists idx_block_library_user_id on public.block_library (user_id);
create index if not exists idx_automation_workflows_user_id on public.automation_workflows (user_id);
create index if not exists idx_drawing_annotations_user_id on public.drawing_annotations (user_id);
create index if not exists idx_drawing_annotations_project_id on public.drawing_annotations (project_id);

create index if not exists idx_ground_grid_designs_project_id on public.ground_grid_designs (project_id);
create index if not exists idx_ground_grid_rods_design_id on public.ground_grid_rods (design_id);
create index if not exists idx_ground_grid_conductors_design_id on public.ground_grid_conductors (design_id);
create unique index if not exists idx_ground_grid_results_design_id
	on public.ground_grid_results (design_id);

-- ============================================================================
-- Functions and triggers
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at := timezone('utc', now());
	return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists set_whiteboards_updated_at on public.whiteboards;
create trigger set_whiteboards_updated_at
before update on public.whiteboards
for each row execute function public.set_updated_at();

drop trigger if exists set_ai_conversations_updated_at on public.ai_conversations;
create trigger set_ai_conversations_updated_at
before update on public.ai_conversations
for each row execute function public.set_updated_at();

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

drop trigger if exists set_user_passkeys_updated_at on public.user_passkeys;
create trigger set_user_passkeys_updated_at
before update on public.user_passkeys
for each row execute function public.set_updated_at();

drop trigger if exists set_ground_grid_designs_updated_at on public.ground_grid_designs;
create trigger set_ground_grid_designs_updated_at
before update on public.ground_grid_designs
for each row execute function public.set_updated_at();

drop trigger if exists set_work_ledger_entries_updated_at on public.work_ledger_entries;
create trigger set_work_ledger_entries_updated_at
before update on public.work_ledger_entries
for each row execute function public.set_updated_at();

drop trigger if exists set_work_ledger_publish_jobs_updated_at on public.work_ledger_publish_jobs;
create trigger set_work_ledger_publish_jobs_updated_at
before update on public.work_ledger_publish_jobs
for each row execute function public.set_updated_at();

create or replace function public.upsert_user_setting(
	p_user_id uuid,
	p_setting_key text,
	p_setting_value jsonb,
	p_project_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
	update public.user_settings
	set
		setting_value = p_setting_value,
		updated_at = timezone('utc', now())
	where
		user_id = p_user_id
		and setting_key = p_setting_key
		and (
			(project_id is null and p_project_id is null)
			or project_id = p_project_id
		);

	if not found then
		insert into public.user_settings (
			user_id,
			setting_key,
			setting_value,
			project_id
		) values (
			p_user_id,
			p_setting_key,
			p_setting_value,
			p_project_id
		);
	end if;
end;
$$;

grant execute on function public.upsert_user_setting(uuid, text, jsonb, uuid) to authenticated;
