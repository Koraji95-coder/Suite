import { Play } from "lucide-react";

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
		<div className="flex flex-wrap items-center gap-3">
			<button
				type="button"
				onClick={onRunChecks}
				disabled={selectedCount === 0 || running}
				className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 [background:linear-gradient(135deg,var(--primary),color-mix(in_srgb,var(--primary)_78%,var(--accent)))] [color:var(--primary-contrast)]"
			>
				<Play className="h-4 w-4" />
				{running ? "Running Checks..." : "Run Selected Checks"}
			</button>

			<span className="text-sm [color:var(--text-muted)]">
				{selectedCount} standard
				{selectedCount !== 1 ? "s" : ""} selected
			</span>
		</div>
	);
}
