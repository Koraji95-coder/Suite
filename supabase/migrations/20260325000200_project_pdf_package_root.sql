alter table if exists public.projects
	add column if not exists pdf_package_root_path text null;

create index if not exists idx_projects_pdf_package_root_path
	on public.projects (pdf_package_root_path)
	where pdf_package_root_path is not null;
