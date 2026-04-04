import { Play } from "lucide-react";
import styles from "./StandardsChecker.module.css";

interface StandardsCheckerActionBarProps {
	selectedCount: number;
	running: boolean;
	onRunChecks: () => void;
}

export function StandardsCheckerActionBar({
	selectedCount,
	running,
	onRunChecks,
}: StandardsCheckerActionBarProps) {
	return (
		<div className={styles.actionBar}>
			<button
				type="button"
				onClick={onRunChecks}
				disabled={selectedCount === 0 || running}
				className={styles.runButton}
			>
				<Play className={styles.iconSm} />
				{running ? "Running Checks..." : "Run Selected Checks"}
			</button>

			<span className={styles.actionMeta}>
				{selectedCount} standard
				{selectedCount !== 1 ? "s" : ""} selected
			</span>
		</div>
	);
}
