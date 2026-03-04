import { type ColorScheme, hexToRgba } from "@/lib/palette";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";
import styles from "./CoordinatesGrabberTabs.module.css";

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
			className={styles.root}
			style={{ borderBottomColor: hexToRgba(palette.primary, 0.1) }}
		>
			{(["config", "export", "history", "yaml"] as const).map((tab) => (
				<button
					key={tab}
					onClick={() => onTabChange(tab)}
					className={styles.tab}
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
