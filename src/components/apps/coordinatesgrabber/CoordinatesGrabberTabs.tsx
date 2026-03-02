import { type ColorScheme, hexToRgba } from "@/lib/palette";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";

interface CoordinatesGrabberTabsProps {
	palette: ColorScheme;
	activeTab: CoordinatesGrabberState["activeTab"];
	historyCount: number;
	onTabChange: (tab: CoordinatesGrabberState["activeTab"]) => void;
}

export function CoordinatesGrabberTabs({
	palette,
	activeTab,
	historyCount,
	onTabChange,
}: CoordinatesGrabberTabsProps) {
	return (
		<div
			className="flex gap-2 overflow-x-auto border-b pb-1"
			style={{ borderBottomColor: hexToRgba(palette.primary, 0.1) }}
		>
			{(["config", "export", "history", "yaml"] as const).map((tab) => (
				<button
					key={tab}
					onClick={() => onTabChange(tab)}
					className="whitespace-nowrap border-b-2 px-3 py-2 text-sm transition"
					style={{
						borderBottomColor:
							activeTab === tab ? palette.primary : "transparent",
						color: activeTab === tab ? palette.primary : palette.textMuted,
						fontWeight: activeTab === tab ? 600 : 400,
					}}
				>
					{tab === "config" && "Config"}
					{tab === "export" && "Export"}
					{tab === "history" && `History (${historyCount})`}
					{tab === "yaml" && "YAML"}
				</button>
			))}
		</div>
	);
}
