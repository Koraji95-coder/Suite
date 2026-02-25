import { Search } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { ProjectCard } from "./ProjectCard";
import {
	PROJECT_CATEGORIES,
	Project,
	type StatusFilter,
	TaskCount,
} from "./projectmanagertypes";
import { categoryBadgeStyle } from "./projectmanagerutils";

interface ProjectListProps {
	projects: Project[];
	selectedProject: Project | null;
	projectTaskCounts: Map<string, TaskCount>;
	onSelectProject: (project: Project) => void;
	onEditProject: (project: Project) => void;
	onDeleteProject: (projectId: string) => void;
	filter?: StatusFilter;
	onFilterChange?: (filter: StatusFilter) => void;
	searchQuery?: string;
	onSearchChange?: (query: string) => void;
}

export function ProjectList({
	projects,
	selectedProject,
	projectTaskCounts,
	onSelectProject,
	onEditProject,
	onDeleteProject,
	filter = "active",
	onFilterChange,
	searchQuery: externalSearch,
	onSearchChange,
}: ProjectListProps) {
	const { palette } = useTheme();
	const [internalSearch, setInternalSearch] = useState("");

	const searchQuery =
		externalSearch !== undefined ? externalSearch : internalSearch;
	const handleSearchChange = (value: string) => {
		if (onSearchChange) onSearchChange(value);
		else setInternalSearch(value);
	};

	const filteredProjects = projects.filter((p) => {
		// Filter by status
		if (filter !== "all") {
			if (filter === "archived") {
				if (p.status !== "completed") return false;
			} else {
				if (p.status === "completed") return false;
				if (filter !== p.status) return false;
			}
		}
		// Filter by search
		if (searchQuery) {
			const q = searchQuery.toLowerCase();
			return (
				p.name.toLowerCase().includes(q) ||
				p.description?.toLowerCase().includes(q)
			);
		}
		return true;
	});

	const categorizedProjects = PROJECT_CATEGORIES.map((cat) => ({
		cat,
		items: filteredProjects.filter((p) => p.category === cat.key),
	})).filter((group) => group.items.length > 0);

	const uncategorizedProjects = filteredProjects.filter((p) => !p.category);

	return (
		<div className="space-y-3">
			<h3
				className="text-lg font-semibold mb-3"
				style={{ color: hexToRgba(palette.text, 0.9) }}
			>
				Projects
			</h3>
			{onFilterChange && (
				<div className="flex space-x-2 mb-3">
					{(["active", "all", "on-hold", "archived"] as StatusFilter[]).map(
						(s) => {
							const isActive = filter === s;
							return (
								<button
									key={s}
									onClick={() => onFilterChange(s)}
									className="px-3 py-1 text-xs rounded-full transition-all"
									style={{
										background: isActive
											? hexToRgba(palette.primary, 0.2)
											: hexToRgba(palette.surface, 0.35),
										border: `1px solid ${hexToRgba(
											isActive ? palette.primary : palette.text,
											isActive ? 0.45 : 0.08,
										)}`,
										color: hexToRgba(palette.text, isActive ? 0.9 : 0.6),
									}}
								>
									{s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ")}
								</button>
							);
						},
					)}
				</div>
			)}
			<div className="relative mb-4">
				<Search
					className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
					style={{ color: hexToRgba(palette.primary, 0.8) }}
				/>
				<input
					type="text"
					value={searchQuery}
					onChange={(e) => handleSearchChange(e.target.value)}
					placeholder="Search projects..."
					className="w-full pl-10 pr-4 py-2 rounded-lg text-sm placeholder-white/30 focus:outline-none focus:ring-2"
					style={
						{
							background: hexToRgba(palette.surface, 0.35),
							border: `1px solid ${hexToRgba(palette.primary, 0.22)}`,
							color: hexToRgba(palette.text, 0.9),
							"--tw-ring-color": hexToRgba(palette.primary, 0.45),
						} as CSSProperties
					}
				/>
			</div>

			<div
				className="space-y-4 overflow-y-auto"
				style={{ maxHeight: "calc(100vh - 320px)" }}
			>
				{categorizedProjects.map((group) => (
					<div key={group.cat.key}>
						<div className="flex items-center space-x-2 mb-2 px-2 py-2">
							<span
								className="text-sm px-3 py-1 rounded border font-semibold"
								style={categoryBadgeStyle(group.cat.key)}
							>
								{group.cat.key}
							</span>
							<span
								className="text-xs"
								style={{ color: hexToRgba(palette.text, 0.5) }}
							>
								({group.items.length}{" "}
								{group.items.length === 1 ? "project" : "projects"})
							</span>
						</div>
						<div className="space-y-2">
							{group.items.map((project) => (
								<ProjectCard
									key={project.id}
									project={project}
									isSelected={selectedProject?.id === project.id}
									taskInfo={projectTaskCounts.get(project.id)}
									onSelect={onSelectProject}
									onEdit={onEditProject}
									onDelete={onDeleteProject}
								/>
							))}
						</div>
					</div>
				))}

				{uncategorizedProjects.length > 0 && (
					<div>
						<div className="flex items-center space-x-2 mb-2 px-2 py-2">
							<span
								className="text-sm px-3 py-1 rounded border font-semibold"
								style={{
									borderColor: palette.accent,
									color: palette.accent,
									backgroundColor: hexToRgba(palette.accent, 0.12),
								}}
							>
								Uncategorized
							</span>
							<span
								className="text-xs"
								style={{ color: hexToRgba(palette.text, 0.5) }}
							>
								({uncategorizedProjects.length}{" "}
								{uncategorizedProjects.length === 1 ? "project" : "projects"})
							</span>
						</div>
						<div className="space-y-2">
							{uncategorizedProjects.map((project) => (
								<ProjectCard
									key={project.id}
									project={project}
									isSelected={selectedProject?.id === project.id}
									taskInfo={projectTaskCounts.get(project.id)}
									onSelect={onSelectProject}
									onEdit={onEditProject}
									onDelete={onDeleteProject}
								/>
							))}
						</div>
					</div>
				)}

				{filteredProjects.length === 0 && (
					<div
						className="text-center py-12"
						style={{ color: hexToRgba(palette.primary, 0.6) }}
					>
						<Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
						<p className="text-lg font-medium">
							{searchQuery
								? "No projects match your search"
								: "No projects match your filters"}
						</p>
						<p
							className="text-sm mt-1"
							style={{ color: hexToRgba(palette.text, 0.5) }}
						>
							{searchQuery
								? `No results for "${searchQuery}"`
								: `Try changing the status filter or create a new project`}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
