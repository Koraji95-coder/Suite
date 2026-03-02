import { CheckCircle, Settings as SettingsIcon, Upload } from "lucide-react";

interface QAQCHeaderProps {
	onOpenRules: () => void;
	onOpenUpload: () => void;
}

export function QAQCHeader({ onOpenRules, onOpenUpload }: QAQCHeaderProps) {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center space-x-3">
				<div className="p-3 [background:linear-gradient(to_bottom_right,color-mix(in_srgb,var(--success)_20%,var(--surface)),color-mix(in_srgb,var(--success)_20%,var(--surface)))] rounded-lg">
					<CheckCircle
						className="w-8 h-8 [color:var(--success)] animate-pulse"
						style={{ animationDuration: "2s" }}
					/>
				</div>
				<div>
					<h2 className="text-3xl font-bold [color:var(--text)]">
						QA/QC Standards Checker
					</h2>
					<p className="[color:var(--text-muted)]">
						Automated drawing compliance verification
					</p>
				</div>
			</div>
			<div className="flex items-center space-x-3">
				<button
					onClick={onOpenRules}
					className="flex items-center space-x-2 rounded-lg border [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface)] px-6 py-3 [color:var(--text-muted)] transition-all hover:[border-color:color-mix(in_srgb,var(--success)_50%,transparent)]"
				>
					<SettingsIcon className="w-5 h-5" />
					<span>Configure Rules</span>
				</button>
				<button
					onClick={onOpenUpload}
					className="flex items-center space-x-2 [background:var(--success)] hover:opacity-90 [color:var(--text)] font-semibold px-6 py-3 rounded-lg shadow-lg [box-shadow:0_10px_15px_-3px_color-mix(in_srgb,var(--success)_30%,transparent)] transition-all"
				>
					<Upload className="w-5 h-5" />
					<span>Check Drawing</span>
				</button>
			</div>
		</div>
	);
}
