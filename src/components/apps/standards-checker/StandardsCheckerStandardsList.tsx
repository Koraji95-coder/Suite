import { GlassPanel } from "../ui/GlassPanel";
import { StandardsCheckerStatusIcon } from "./StandardsCheckerStatusIcon";
import type { CheckResult, Standard } from "./standardsCheckerModels";
import { statusToneClasses } from "./standardsCheckerModels";

interface StandardsCheckerStandardsListProps {
	activeCategory: string;
	filteredStandards: Standard[];
	selectedStandards: Set<string>;
	onToggleStandard: (id: string) => void;
	getResultForStandard: (id: string) => CheckResult | undefined;
}

export function StandardsCheckerStandardsList({
	activeCategory,
	filteredStandards,
	selectedStandards,
	onToggleStandard,
	getResultForStandard,
}: StandardsCheckerStandardsListProps) {
	return (
		<GlassPanel padded className="space-y-4">
			<div className="text-xs font-semibold uppercase tracking-[0.16em] [color:var(--text-muted)]">
				{activeCategory} Standards
			</div>

			<div className="space-y-2">
				{filteredStandards.map((standard) => {
					const result = getResultForStandard(standard.id);
					const isSelected = selectedStandards.has(standard.id);

					return (
						<button
							key={standard.id}
							type="button"
							onClick={() => onToggleStandard(standard.id)}
							className={`w-full rounded-xl border px-4 py-3 text-left transition ${
								isSelected
									? "[border-color:color-mix(in_srgb,var(--primary)_45%,transparent)] [background:color-mix(in_srgb,var(--primary)_14%,transparent)]"
									: "[border-color:color-mix(in_srgb,var(--border)_75%,transparent)] hover:[border-color:color-mix(in_srgb,var(--primary)_28%,transparent)] hover:[background:color-mix(in_srgb,var(--primary)_8%,transparent)]"
							}`}
						>
							<div className="flex items-start gap-3">
								<div
									className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition ${
										isSelected
											? "[border-color:var(--primary)] [background:color-mix(in_srgb,var(--primary)_20%,transparent)]"
											: "[border-color:var(--text-muted)]"
									}`}
								>
									{isSelected ? (
										<div className="h-2.5 w-2.5 rounded-sm [background:var(--primary)]" />
									) : null}
								</div>

								<div className="min-w-0 flex-1 space-y-1">
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="text-sm font-semibold [color:var(--text)]">
												{standard.name}
											</p>
											<p className="text-xs [color:var(--text-muted)]">
												{standard.code}
											</p>
										</div>

										{result ? (
											<span
												className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusToneClasses[result.status].badge} ${statusToneClasses[result.status].text}`}
											>
												<StandardsCheckerStatusIcon status={result.status} />
												{result.status}
											</span>
										) : null}
									</div>

									<p className="text-xs leading-relaxed [color:var(--text-muted)]">
										{standard.description}
									</p>

									{result ? (
										<p
											className={`text-xs italic ${statusToneClasses[result.status].text}`}
										>
											{result.message}
										</p>
									) : null}
								</div>
							</div>
						</button>
					);
				})}
			</div>
		</GlassPanel>
	);
}
