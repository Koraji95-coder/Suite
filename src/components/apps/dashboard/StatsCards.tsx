// src/routes/app/dashboard/StatsCards.tsx
import { FolderOpen, HardDrive, ListTodo, Sparkles } from "lucide-react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { GlassPanel } from "../ui/GlassPanel";
import { formatBytes } from "./dashboardUtils";

interface StatsCardsProps {
	projectsCount: number;
	storageUsed: number;
	openTasks: number;
	overdueProjects: number;
	isLoading: boolean;

	/**
	 * Optional “previous period” values to compute trends.
	 * If not provided, trend will show "—" instead of a fake percent.
	 */
	projectsCountPrev?: number;
	storageUsedPrev?: number;
	openTasksPrev?: number;

	/**
	 * Optional history arrays for sparklines (newest last is best).
	 * If not provided, we’ll render a tiny placeholder sparkline (non-misleading).
	 */
	projectsHistory?: number[];
	openTasksHistory?: number[];
	storageHistory?: number[];
}

function safePercentChange(current: number, prev?: number) {
	if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
	return ((current - prev) / prev) * 100;
}

function formatTrend(pct: number | null) {
	if (pct == null) return "—";
	const rounded = Math.round(pct);
	const sign = rounded > 0 ? "+" : "";
	return `${sign}${rounded}%`;
}

function normalizeSparkline(points?: number[]) {
	if (!points || points.length < 2) return [3, 4, 3, 5, 4, 6, 5]; // neutral placeholder
	return points;
}

export function StatsCards({
	projectsCount,
	storageUsed,
	openTasks,
	overdueProjects,
	isLoading,
	projectsCountPrev,
	storageUsedPrev,
	openTasksPrev,
	projectsHistory,
	openTasksHistory,
	storageHistory,
}: StatsCardsProps) {
	const { palette } = useTheme();

	const renderSparkline = (points: readonly number[], tint: string) => {
		const width = 96;
		const height = 32;
		const step = width / (points.length - 1);
		const max = Math.max(...points);
		const min = Math.min(...points);
		const scale = max === min ? 1 : max - min;

		const coords = points
			.map((value, idx) => {
				const x = idx * step;
				const y = height - ((value - min) / scale) * (height - 6) - 3;
				return `${x},${y}`;
			})
			.join(" ");

		return (
			<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
				<polyline
					fill="none"
					points={coords}
					stroke={hexToRgba(tint, 0.9)}
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		);
	};

	const cards = [
		{
			key: "projects",
			label: "Active Projects",
			icon: FolderOpen,
			tint: palette.primary,
			value: isLoading ? null : String(projectsCount),
			trend: formatTrend(safePercentChange(projectsCount, projectsCountPrev)),
			helper: isLoading
				? ""
				: overdueProjects > 0
					? `${overdueProjects} overdue`
					: "On track",
			sparkline: normalizeSparkline(projectsHistory),
		},
		{
			key: "tasks",
			label: "Open Tasks",
			icon: ListTodo,
			tint: palette.secondary,
			value: isLoading ? null : String(openTasks),
			trend: formatTrend(safePercentChange(openTasks, openTasksPrev)),
			helper: isLoading ? "" : "Active this week",
			sparkline: normalizeSparkline(openTasksHistory),
		},
		{
			key: "storage",
			label: "Storage Used",
			icon: HardDrive,
			tint: palette.tertiary,
			value: isLoading ? null : formatBytes(storageUsed),
			trend: formatTrend(safePercentChange(storageUsed, storageUsedPrev)),
			helper: isLoading ? "" : "Across projects",
			sparkline: normalizeSparkline(storageHistory),
		},
	] as const;

	return (
		<div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:gap-7 2xl:grid-cols-3">
			{cards.map(({ key, label, icon: Icon, tint, value, helper, sparkline, trend }) => (
				<GlassPanel
					key={key}
					tint={tint}
					specular={false}
					bevel={false}
					className="group px-7 py-6 transition-transform duration-300 hover:-translate-y-1 hover:scale-[1.015] md:px-8 md:py-7"
					style={{ cursor: "default" }}
				>
					<div className="relative z-10 flex items-start justify-between gap-5">
						<div className="flex items-start gap-4">
							<div
								className="rounded-2xl p-3.5"
								style={{
									background: `linear-gradient(135deg, ${hexToRgba(tint, 0.25)} 0%, ${hexToRgba(
										tint,
										0.08,
									)} 100%)`,
									boxShadow: `0 0 20px ${hexToRgba(tint, 0.15)}`,
								}}
							>
								<Icon
									className="h-6 w-6 md:h-7 md:w-7"
									style={{ color: tint }}
								/>
							</div>

							<div className="space-y-1.5">
								<p
									className="text-xs uppercase tracking-[0.2em]"
									style={{ color: hexToRgba(palette.text, 0.5) }}
								>
									{label}
								</p>

								{isLoading ? (
									/* ✅ theme-safe shimmer (no bg-white/10) */
									<div
										className="h-9 w-24 animate-pulse rounded-full"
										style={{ background: hexToRgba(palette.text, 0.1) }}
									/>
								) : (
									<p
										className="text-3xl font-semibold tracking-tight md:text-[2rem]"
										style={{ color: hexToRgba(palette.text, 0.95) }}
									>
										{value}
									</p>
								)}

								<div
									className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]"
									style={{
										color: hexToRgba(tint, 0.9),
										border: `1px solid ${hexToRgba(tint, 0.35)}`,
										background: hexToRgba(tint, 0.1),
									}}
								>
									{trend}
								</div>

								{helper ? (
									<div
										className="flex items-center gap-1 text-xs"
										style={{ color: hexToRgba(palette.text, 0.55) }}
									>
										<Sparkles className="h-3 w-3" style={{ color: tint }} />
										<span>{helper}</span>
									</div>
								) : null}
							</div>
						</div>

						<div className="hidden opacity-75 transition-opacity group-hover:opacity-100 sm:block">
							{renderSparkline(sparkline, tint)}
						</div>
					</div>

					{/* Bottom accent bar */}
					<div
						className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full opacity-40 transition-opacity group-hover:opacity-70"
						style={{
							background: `linear-gradient(90deg, transparent, ${tint}, transparent)`,
						}}
					/>
				</GlassPanel>
			))}
		</div>
	);
}