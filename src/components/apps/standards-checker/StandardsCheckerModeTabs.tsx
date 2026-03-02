import type { StandardsCheckerMode } from "./standardsCheckerModels";

interface StandardsCheckerModeTabsProps {
	mode: StandardsCheckerMode;
	onModeChange: (mode: StandardsCheckerMode) => void;
}

export function StandardsCheckerModeTabs({
	mode,
	onModeChange,
}: StandardsCheckerModeTabsProps) {
	const baseTabClass =
		"rounded-lg border px-3 py-1.5 text-xs font-semibold transition";

	return (
		<div className="flex gap-2">
			<button
				type="button"
				onClick={() => onModeChange("standards")}
				className={`${baseTabClass} ${
					mode === "standards"
						? "[border-color:color-mix(in_srgb,var(--primary)_40%,transparent)] [background:color-mix(in_srgb,var(--primary)_16%,transparent)] [color:var(--text)]"
						: "[border-color:color-mix(in_srgb,var(--primary)_24%,transparent)] [background:color-mix(in_srgb,var(--surface-2)_70%,transparent)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_10%,transparent)]"
				}`}
			>
				Standards
			</button>
			<button
				type="button"
				onClick={() => onModeChange("qaqc")}
				className={`${baseTabClass} ${
					mode === "qaqc"
						? "[border-color:color-mix(in_srgb,var(--primary)_40%,transparent)] [background:color-mix(in_srgb,var(--primary)_16%,transparent)] [color:var(--text)]"
						: "[border-color:color-mix(in_srgb,var(--primary)_24%,transparent)] [background:color-mix(in_srgb,var(--surface-2)_70%,transparent)] [color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_10%,transparent)]"
				}`}
			>
				QA/QC
			</button>
		</div>
	);
}
