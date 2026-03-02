import { Dialog, DialogContent } from "@/components/apps/ui/dialog";
import type { QARule } from "./qaqcModels";
import { getSeverityColor } from "./qaqcUi";

interface QAQCRulesDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	rules: QARule[];
	onToggleRule: (ruleId: string) => void;
	onClose: () => void;
}

export function QAQCRulesDialog({
	open,
	onOpenChange,
	rules,
	onToggleRule,
	onClose,
}: QAQCRulesDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[80vh] max-w-3xl overflow-auto border-[color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface)]">
				<div className="flex items-center justify-between mb-6">
					<h3 className="text-2xl font-bold [color:var(--text)]">
						QA/QC Rules Configuration
					</h3>
					<button
						onClick={onClose}
						className="p-2 hover:[background:color-mix(in_srgb,var(--danger)_20%,var(--surface))] rounded-lg transition-all"
					>
						<span className="[color:var(--danger)] text-2xl">×</span>
					</button>
				</div>

				<div className="space-y-3">
					{rules.map((rule) => (
						<div
							key={rule.id}
							className={`rounded-lg border bg-[var(--surface-2)] p-4 transition-all ${
								rule.enabled
									? "[border-color:color-mix(in_srgb,var(--success)_30%,transparent)]"
									: "[border-color:color-mix(in_srgb,var(--text-muted)_30%,transparent)] opacity-60"
							}`}
						>
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<div className="flex items-center space-x-3 mb-2">
										<input
											type="checkbox"
											checked={rule.enabled}
											onChange={() => onToggleRule(rule.id)}
											className="h-5 w-5 rounded [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface)]"
										/>
										<h4 className="text-lg font-semibold [color:var(--text)]">
											{rule.name}
										</h4>
										<span
											className={`text-xs px-2 py-1 rounded-full border ${getSeverityColor(rule.severity)}`}
										>
											{rule.severity}
										</span>
									</div>
									<p className="[color:var(--text-muted)] text-sm ml-8">
										{rule.description}
									</p>
									<div className="flex items-center space-x-2 ml-8 mt-2">
										<span className="text-xs px-2 py-1 [background:color-mix(in_srgb,var(--success)_10%,var(--surface))] [color:var(--success)] rounded-full border [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] capitalize">
											{rule.category.replace("_", " ")}
										</span>
									</div>
								</div>
							</div>
						</div>
					))}
				</div>

				<div className="mt-6 flex justify-end">
					<button
						onClick={onClose}
						className="[background:var(--success)] hover:opacity-90 [color:var(--text)] font-semibold px-6 py-2 rounded-lg transition-all"
					>
						Done
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
