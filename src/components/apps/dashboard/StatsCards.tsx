import { BarChart3, Folder } from "lucide-react";
import { hexToRgba, useTheme } from "@/lib/palette";
import { AccentBandCard } from "../ui/TieredCard";
import { formatBytes } from "./dashboardUtils";

interface StatsCardsProps {
	projectsCount: number;
	storageUsed: number;
	isLoading: boolean;
}

export function StatsCards({
	projectsCount,
	storageUsed,
	isLoading,
}: StatsCardsProps) {
	const { palette } = useTheme();

	const cardConfigs = [
		{
			key: "projects",
			label: "Active Projects",
			icon: BarChart3,
			bandColor: palette.primary,
		},
		{
			key: "storage",
			label: "Storage Used",
			icon: Folder,
			bandColor: palette.secondary,
		},
	] as const;
	const values: Record<string, string> = {
		projects: isLoading ? "..." : String(projectsCount),
		storage: isLoading ? "..." : formatBytes(storageUsed),
	};

	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
			{cardConfigs.map(({ key, label, icon: Icon, bandColor }) => (
				<AccentBandCard
					key={key}
					bandColor={bandColor}
					className="px-7 py-6 group hover:translate-y-[-2px]"
					style={{ cursor: "default" }}
				>
					<div className="relative z-10 flex items-center space-x-4">
						<div
							className="p-3 rounded-xl"
							style={{
								background: `linear-gradient(135deg, ${hexToRgba(bandColor, 0.25)} 0%, ${hexToRgba(bandColor, 0.08)} 100%)`,
								boxShadow: `0 0 20px ${hexToRgba(bandColor, 0.15)}`,
							}}
						>
							<Icon className="w-6 h-6" style={{ color: bandColor }} />
						</div>
						<div>
							<p
								className="text-sm font-medium"
								style={{ color: hexToRgba(palette.text, 0.5) }}
							>
								{label}
							</p>
							<p
								className="text-3xl font-bold tracking-tight"
								style={{ color: hexToRgba(palette.text, 0.95) }}
							>
								{values[key]}
							</p>
						</div>
					</div>
				</AccentBandCard>
			))}
		</div>
	);
}
