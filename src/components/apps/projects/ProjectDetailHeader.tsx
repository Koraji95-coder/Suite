import { Archive, Calendar, FileDown } from "lucide-react";
import type { CSSProperties } from "react";
import {
	type ColorScheme,
	glassCardInnerStyle,
	hexToRgba,
} from "@/lib/palette";
import { GlassPanel } from "../ui/GlassPanel";
import type { Project, Task } from "./projectmanagertypes";
import { categoryColor, formatDateOnly } from "./projectmanagerutils";

interface ProjectDetailHeaderProps {
	project: Project;
	tasks: Task[];
	palette: ColorScheme;
	onToggleArchive: (project: Project) => void;
	onExportMarkdown: () => void;
}

export function ProjectDetailHeader({
	project,
	tasks,
	palette,
	onToggleArchive,
	onExportMarkdown,
}: ProjectDetailHeaderProps) {
	const completionPercentage =
		tasks.length > 0
			? Math.round(
					(tasks.filter((task) => task.completed).length / tasks.length) * 100,
				)
			: 0;

	const completedTaskCount = tasks.filter((task) => task.completed).length;
	const overdueTaskCount = tasks.filter((task) => {
		if (task.completed || !task.due_date) return false;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const [year, month, day] = task.due_date
			.split("T")[0]
			.split("-")
			.map(Number);
		return new Date(year, month - 1, day) < today;
	}).length;

	const actionButtonStyle = (tint: string): CSSProperties => ({
		...glassCardInnerStyle(palette, tint),
		color: hexToRgba(palette.text, 0.85),
	});

	return (
		<GlassPanel
			tint={palette.primary}
			hoverEffect={false}
			className="p-7 xl:p-8"
		>
			<div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between mb-6">
				<div className="flex-1">
					<h3
						className="text-2xl md:text-3xl font-bold tracking-tight"
						style={{ color: hexToRgba(palette.text, 0.92) }}
					>
						{project.name}
					</h3>
					<p
						className="mt-2 leading-relaxed"
						style={{ color: hexToRgba(palette.text, 0.55) }}
					>
						{project.description}
					</p>
					<div className="flex flex-wrap items-center gap-3 mt-4">
						<span
							className="text-[11px] px-3 py-1 rounded-full border uppercase tracking-[0.2em]"
							style={{
								borderColor: hexToRgba(palette.primary, 0.32),
								color: hexToRgba(palette.primary, 0.92),
								background: hexToRgba(palette.primary, 0.16),
							}}
						>
							{(project.status === "completed" ? "archived" : project.status)
								.replace("-", " ")
								.replace(/\b\w/g, (letter) => letter.toUpperCase())}
						</span>
						{project.deadline && (
							<div
								className="flex items-center space-x-2"
								style={{ color: hexToRgba(palette.text, 0.6) }}
							>
								<Calendar className="w-4 h-4" />
								<span className="text-sm">
									{project.status === "completed"
										? `Archived ${formatDateOnly(project.deadline)}`
										: `Due ${formatDateOnly(project.deadline)}`}
								</span>
							</div>
						)}
						{project.category && (
							<span
								className="text-xs px-2.5 py-1 rounded border"
								style={{
									borderColor: categoryColor(project.category),
									color: categoryColor(project.category),
									background: hexToRgba(categoryColor(project.category), 0.12),
								}}
							>
								{project.category}
							</span>
						)}
					</div>
					<div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
						{[
							{ label: "Tasks", value: String(tasks.length) },
							{ label: "Completed", value: String(completedTaskCount) },
							{ label: "Overdue", value: String(overdueTaskCount) },
							{ label: "Progress", value: `${completionPercentage}%` },
						].map((metric) => (
							<div
								key={metric.label}
								className="rounded-xl px-3 py-2.5"
								style={{
									background: hexToRgba(palette.surface, 0.42),
									border: `1px solid ${hexToRgba(palette.text, 0.09)}`,
								}}
							>
								<p
									className="text-[11px] uppercase tracking-[0.16em]"
									style={{ color: hexToRgba(palette.text, 0.5) }}
								>
									{metric.label}
								</p>
								<p
									className="mt-1 text-lg font-semibold"
									style={{ color: hexToRgba(palette.text, 0.92) }}
								>
									{metric.value}
								</p>
							</div>
						))}
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<button
						onClick={() => onToggleArchive(project)}
						className="px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5"
						style={actionButtonStyle(
							project.status === "completed"
								? palette.secondary
								: palette.tertiary,
						)}
						title={
							project.status === "completed"
								? "Unarchive project"
								: "Archive project"
						}
					>
						<Archive className="w-3.5 h-3.5" />
						<span>
							{project.status === "completed" ? "Unarchive" : "Archive"}
						</span>
					</button>
					<button
						onClick={onExportMarkdown}
						className="px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5"
						style={actionButtonStyle(palette.primary)}
						title="Copy project as Markdown"
					>
						<FileDown className="w-3.5 h-3.5" />
						<span>Export</span>
					</button>
				</div>
			</div>

			<div className="space-y-2.5">
				<div className="flex justify-between text-sm">
					<span style={{ color: hexToRgba(palette.text, 0.6) }}>Progress</span>
					<span
						className="font-semibold"
						style={{ color: hexToRgba(palette.text, 0.9) }}
					>
						{completionPercentage}%
					</span>
				</div>
				<div
					key={project.id}
					className="w-full rounded-full h-3.5 overflow-hidden"
					style={{ background: hexToRgba(palette.surface, 0.55) }}
				>
					<div
						className="h-full transition-all duration-700 ease-out"
						style={{
							width: `${completionPercentage}%`,
							willChange: "width",
							background: `linear-gradient(90deg, ${palette.primary} 0%, ${palette.tertiary} 100%)`,
						}}
					></div>
				</div>
			</div>
		</GlassPanel>
	);
}
