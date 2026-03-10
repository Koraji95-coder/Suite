// src/components/apps/dashboard/StatsCards.tsx
import {
	FolderOpen,
	HardDrive,
	ListTodo,
	Minus,
	Sparkles,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/primitives/Badge";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
// Primitives
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";

import { formatBytes } from "./dashboardUtils";

interface StatsCardsProps {
	projectsCount: number;
	storageUsed: number;
	openTasks: number;
	overdueProjects: number;
	isLoading: boolean;
	projectsCountPrev?: number;
	storageUsedPrev?: number;
	openTasksPrev?: number;
	projectsHistory?: number[];
	openTasksHistory?: number[];
	storageHistory?: number[];
}

function safePercentChange(current: number, prev?: number) {
	if (prev == null || !Number.isFinite(prev) || prev === 0) return null;
	return ((current - prev) / prev) * 100;
}

function formatTrend(pct: number | null) {
	if (pct == null) return null;
	const rounded = Math.round(pct);
	const sign = rounded > 0 ? "+" : "";
	return `${sign}${rounded}%`;
}

function normalizeSparkline(points?: number[]) {
	if (!points || points.length < 2) return [3, 4, 3, 5, 4, 6, 5];
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
	const renderSparkline = (points: readonly number[], color: string) => {
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
					stroke={color}
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					opacity={0.8}
				/>
			</svg>
		);
	};

	const cards = [
		{
			key: "projects",
			label: "Active Projects",
			icon: FolderOpen,
			color: "primary" as const,
			value: isLoading ? null : String(projectsCount),
			trend: formatTrend(safePercentChange(projectsCount, projectsCountPrev)),
			trendUp: projectsCount > (projectsCountPrev ?? 0),
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
			color: "secondary" as const,
			value: isLoading ? null : String(openTasks),
			trend: formatTrend(safePercentChange(openTasks, openTasksPrev)),
			trendUp: openTasks > (openTasksPrev ?? 0),
			helper: isLoading ? "" : "Active this week",
			sparkline: normalizeSparkline(openTasksHistory),
		},
		{
			key: "storage",
			label: "Storage Used",
			icon: HardDrive,
			color: "accent" as const,
			value: isLoading ? null : formatBytes(storageUsed),
			trend: formatTrend(safePercentChange(storageUsed, storageUsedPrev)),
			trendUp: storageUsed > (storageUsedPrev ?? 0),
			helper: isLoading ? "" : "Across projects",
			sparkline: normalizeSparkline(storageHistory),
		},
	] as const;

	const colorMap = {
		primary: "var(--primary)",
		secondary: "var(--secondary)",
		accent: "var(--accent)",
	};
	const toneClassMap = {
		primary: "suite-dashboard-stats-icon-primary",
		secondary: "suite-dashboard-stats-icon-secondary",
		accent: "suite-dashboard-stats-icon-accent",
	} as const;

	return (
		<div className="suite-dashboard-stats-grid">
			{cards.map(
				({
					key,
					label,
					icon: Icon,
					color,
					value,
					helper,
					sparkline,
					trend,
					trendUp,
				}) => (
					<Panel
						key={key}
						variant="default"
						padding="lg"
						className="suite-dashboard-stats-card"
					>
						<HStack justify="between" align="start">
							<HStack gap={4} align="start">
								{/* Icon */}
								<div
									className={cn(
										"suite-dashboard-stats-icon-wrap",
										toneClassMap[color],
									)}
									style={{ boxShadow: `0 0 20px ${colorMap[color]}20` }}
								>
									<Icon
										size={24}
										className="suite-dashboard-stats-icon"
										style={{ color: colorMap[color] }}
									/>
								</div>

								{/* Content */}
								<Stack gap={2}>
									<Text
										size="xs"
										color="muted"
										className="suite-dashboard-stats-label"
									>
										{label}
									</Text>

									{isLoading ? (
										<div className="suite-dashboard-stats-value-skeleton" />
									) : (
										<Text size="3xl" weight="semibold">
											{value}
										</Text>
									)}

									{/* Trend badge */}
									{trend && (
										<Badge
											color={trendUp ? "success" : "danger"}
											variant="soft"
											size="sm"
										>
											{trendUp ? (
												<TrendingUp size={10} />
											) : (
												<TrendingDown size={10} />
											)}
											{trend}
										</Badge>
									)}
									{!trend && (
										<Badge variant="soft" size="sm">
											<Minus size={10} />—
										</Badge>
									)}

									{helper && (
										<HStack gap={1} align="center">
											<Sparkles size={12} style={{ color: colorMap[color] }} />
											<Text size="xs" color="muted">
												{helper}
											</Text>
										</HStack>
									)}
								</Stack>
							</HStack>

							{/* Sparkline */}
							<div className="suite-dashboard-stats-sparkline">
								{renderSparkline(sparkline, colorMap[color])}
							</div>
						</HStack>

						{/* Bottom accent */}
						<div
							className="suite-dashboard-stats-bottom-accent"
							style={{
								background: `linear-gradient(90deg, transparent, ${colorMap[color]}, transparent)`,
							}}
						/>
					</Panel>
				),
			)}
		</div>
	);
}
