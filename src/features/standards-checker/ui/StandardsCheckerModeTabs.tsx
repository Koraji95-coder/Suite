import { cn } from "@/lib/utils";
import styles from "./StandardsChecker.module.css";
import type { StandardsCheckerMode } from "@/features/standards-checker/standardsCheckerModels";

interface StandardsCheckerModeTabsProps {
	mode: StandardsCheckerMode;
	onModeChange: (mode: StandardsCheckerMode) => void;
}

export function StandardsCheckerModeTabs({
	mode,
	onModeChange,
}: StandardsCheckerModeTabsProps) {
	return (
		<div className={styles.modeTabs}>
			<button
				type="button"
				onClick={() => onModeChange("standards")}
				className={cn(
					styles.modeTab,
					mode === "standards" && styles.modeTabActive,
				)}
			>
				Standards
			</button>
			<button
				type="button"
				onClick={() => onModeChange("standards-drawing")}
				className={cn(
					styles.modeTab,
					mode === "standards-drawing" && styles.modeTabActive,
				)}
			>
				Drawing Standards
			</button>
		</div>
	);
}
