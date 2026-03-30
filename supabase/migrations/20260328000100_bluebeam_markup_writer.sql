create table if not exists public.project_markup_snapshots (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.projects (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	issue_set_id text null,
	drawing_path text not null,
	drawing_name text null,
	source_pdf_name text not null default '',
	page_index integer not null default 0 check (page_index >= 0),
	contract_version text not null default 'bluebeam-default.v1',
	prepare_payload jsonb not null default '{}'::jsonb,
	compare_payload jsonb not null default '{}'::jsonb,
	selected_action_ids text[] not null default '{}'::text[],
	selected_operation_ids text[] not null default '{}'::text[],
	reviewed_bundle_json jsonb not null default '{}'::jsonb,
	revision_context jsonb null,
	warnings text[] not null default '{}'::text[],
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.project_automation_runs (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.projects (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	issue_set_id text null,
	work_package_id text null,
	recipe_id text null,
	status text not null default 'draft',
	request_id text null,
	simulate_on_copy boolean not null default true,
	changed_drawing_count integer not null default 0 check (changed_drawing_count >= 0),
	changed_item_count integer not null default 0 check (changed_item_count >= 0),
	report_id text null,
	report_filename text null,
	download_url text null,
	operations jsonb not null default '[]'::jsonb,
	warnings text[] not null default '{}'::text[],
	artifacts jsonb not null default '[]'::jsonb,
	verification_artifacts jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.project_cad_write_passes (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.projects (id) on delete cascade,
	user_id uuid not null references auth.users (id) on delete cascade,
	run_id text null,
	snapshot_id text null,
	drawing_path text not null,
	writer_kind text not null default 'autodraft',
	operation_type text not null,
	managed_key text null,
	handle_refs text[] not null default '{}'::text[],
	before_json jsonb null,
	after_json jsonb null,
	status text not null default 'applied',
	warnings text[] not null default '{}'::text[],
	artifact_refs jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_project_markup_snapshots_project_id
	on public.project_markup_snapshots (project_id, updated_at desc);
create index if not exists idx_project_markup_snapshots_user_id
	on public.project_markup_snapshots (user_id, updated_at desc);
create index if not exists idx_project_markup_snapshots_issue_set_id
	on public.project_markup_snapshots (issue_set_id);

create index if not exists idx_project_automation_runs_project_id
	on public.project_automation_runs (project_id, updated_at desc);
create index if not exists idx_project_automation_runs_user_id
	on public.project_automation_runs (user_id, updated_at desc);
create index if not exists idx_project_automation_runs_issue_set_id
	on public.project_automation_runs (issue_set_id);

create index if not exists idx_project_cad_write_passes_project_id
	on public.project_cad_write_passes (project_id, updated_at desc);
create index if not exists idx_project_cad_write_passes_run_id
	on public.project_cad_write_passes (run_id);
create index if not exists idx_project_cad_write_passes_snapshot_id
	on public.project_cad_write_passes (snapshot_id);

drop trigger if exists set_project_markup_snapshots_updated_at on public.project_markup_snapshots;
create trigger set_project_markup_snapshots_updated_at
before update on public.project_markup_snapshots
for each row execute function public.set_updated_at();

drop trigger if exists set_project_automation_runs_updated_at on public.project_automation_runs;
create trigger set_project_automation_runs_updated_at
before update on public.project_automation_runs
for each row execute function public.set_updated_at();

drop trigger if exists set_project_cad_write_passes_updated_at on public.project_cad_write_passes;
create trigger set_project_cad_write_passes_updated_at
before update on public.project_cad_write_passes
for each row execute function public.set_updated_at();

alter table if exists public.project_markup_snapshots enable row level security;
alter table if exists public.project_automation_runs enable row level security;
alter table if exists public.project_cad_write_passes enable row level security;

drop trigger if exists set_user_id_project_markup_snapshots on public.project_markup_snapshots;
create trigger set_user_id_project_markup_snapshots
before insert on public.project_markup_snapshots
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_project_automation_runs on public.project_automation_runs;
create trigger set_user_id_project_automation_runs
before insert on public.project_automation_runs
for each row execute function public.set_user_id_from_auth();

drop trigger if exists set_user_id_project_cad_write_passes on public.project_cad_write_passes;
create trigger set_user_id_project_cad_write_passes
before insert on public.project_cad_write_passes
for each row execute function public.set_user_id_from_auth();

drop policy if exists project_markup_snapshots_select_own on public.project_markup_snapshots;
create policy project_markup_snapshots_select_own on public.project_markup_snapshots
for select to authenticated
using (user_id = auth.uid());

drop policy if exists project_markup_snapshots_insert_own on public.project_markup_snapshots;
create policy project_markup_snapshots_insert_own on public.project_markup_snapshots
for insert to authenticated
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists project_markup_snapshots_update_own on public.project_markup_snapshots;
create policy project_markup_snapshots_update_own on public.project_markup_snapshots
for update to authenticated
using (user_id = auth.uid())
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists project_markup_snapshots_delete_own on public.project_markup_snapshots;
create policy project_markup_snapshots_delete_own on public.project_markup_snapshots
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists project_automation_runs_select_own on public.project_automation_runs;
create policy project_automation_runs_select_own on public.project_automation_runs
for select to authenticated
using (user_id = auth.uid());

drop policy if exists project_automation_runs_insert_own on public.project_automation_runs;
create policy project_automation_runs_insert_own on public.project_automation_runs
for insert to authenticated
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists project_automation_runs_update_own on public.project_automation_runs;
create policy project_automation_runs_update_own on public.project_automation_runs
for update to authenticated
using (user_id = auth.uid())
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists project_automation_runs_delete_own on public.project_automation_runs;
create policy project_automation_runs_delete_own on public.project_automation_runs
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists project_cad_write_passes_select_own on public.project_cad_write_passes;
create policy project_cad_write_passes_select_own on public.project_cad_write_passes
for select to authenticated
using (user_id = auth.uid());

drop policy if exists project_cad_write_passes_insert_own on public.project_cad_write_passes;
create policy project_cad_write_passes_insert_own on public.project_cad_write_passes
for insert to authenticated
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists project_cad_write_passes_update_own on public.project_cad_write_passes;
create policy project_cad_write_passes_update_own on public.project_cad_write_passes
for update to authenticated
using (user_id = auth.uid())
with check (
	user_id = auth.uid()
	and public.project_belongs_to_auth_user(project_id)
);

drop policy if exists project_cad_write_passes_delete_own on public.project_cad_write_passes;
create policy project_cad_write_passes_delete_own on public.project_cad_write_passes
for delete to authenticated
using (user_id = auth.uid());
