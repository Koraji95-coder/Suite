import type { ColorScheme } from "@/lib/palette";
import { cn } from "@/lib/utils";
import type { CoordinatesGrabberState } from "./CoordinatesGrabberModels";
import styles from "./CoordinatesGrabberTabs.module.css";

interface CoordinatesGrabberTabsProps {
	palette: ColorScheme;
	activeTab: CoordinatesGrabberState["activeTab"];
	historyCount: number;
	onTabChange: (tab: CoordinatesGrabberState["activeTab"]) => void;
}

export function CoordinatesGrabberTabs({
	palette: _palette,
	activeTab,
	historyCount,
	onTabChange,
}: CoordinatesGrabberTabsProps) {
	return (
		<div className={styles.root}>
			{(["config", "export", "history", "yaml"] as const).map((tab) => (
				<button
					key={tab}
					onClick={() => onTabChange(tab)}
					className={cn(styles.tab, activeTab === tab && styles.tabActive)}
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
