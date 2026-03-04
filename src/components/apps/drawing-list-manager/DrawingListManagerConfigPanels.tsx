import { Shuffle } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
	buildProjectCode,
	type ProjectConfig,
	type SwapRule,
} from "./drawingListManagerModels";

interface DrawingListManagerConfigPanelsProps {
	projectConfig: ProjectConfig;
	setProjectConfig: Dispatch<SetStateAction<ProjectConfig>>;
	templateCounts: Record<string, number>;
	setTemplateCounts: Dispatch<SetStateAction<Record<string, number>>>;
	swapRules: SwapRule[];
	setSwapRules: Dispatch<SetStateAction<SwapRule[]>>;
	onApplySwap: () => void;
}

const panelClass =
	"rounded-xl border p-4 [border-color:var(--border)] [background:var(--surface)]";
const inputClass =
	"w-full rounded-lg border px-2.5 py-2 text-sm outline-none transition focus:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--surface-2)] [color:var(--text)]";
const labelClass = "grid gap-1.5 text-xs [color:var(--text-muted)]";

export function DrawingListManagerConfigPanels({
	projectConfig,
	setProjectConfig,
	templateCounts,
	setTemplateCounts,
	swapRules,
	setSwapRules,
	onApplySwap,
}: DrawingListManagerConfigPanelsProps) {
	return (
		<div className="grid gap-4 xl:grid-cols-3" style={{ alignItems: "start" }}>
			{/* Project Standard */}
			<div className={panelClass}>
				<h3 className="text-sm font-semibold [color:var(--text)]">
					Project Standard
				</h3>
				<div className="mt-3 grid gap-3">
					<label className={labelClass}>
						Project number (XXX)
						<input
							value={projectConfig.projectNumber}
							onChange={(e) => {
								const next = e.target.value.toUpperCase().replace(/^R3P-/, "");
								setProjectConfig((prev) => ({
									...prev,
									projectNumber: next,
								}));
							}}
							placeholder="25074"
							className={inputClass}
						/>
					</label>
					<label className={labelClass}>
						Default revision
						<input
							value={projectConfig.revisionDefault}
							onChange={(e) =>
								setProjectConfig((prev) => ({
									...prev,
									revisionDefault: e.target.value.toUpperCase(),
								}))
							}
							className={inputClass}
						/>
					</label>
					<label className="flex items-center gap-2.5 text-xs [color:var(--text-muted)]">
						<input
							type="checkbox"
							checked={projectConfig.enforceProjectCode}
							onChange={(e) =>
								setProjectConfig((prev) => ({
									...prev,
									enforceProjectCode: e.target.checked,
								}))
							}
						/>
						Enforce project code in naming convention
					</label>
					<div className="grid gap-1.5 text-xs [color:var(--text-muted)]">
						Naming pattern
						<div className="rounded-lg border border-dashed px-2.5 py-2 font-mono text-xs border-[color-mix(in_srgb,var(--primary)_30%,transparent)] [background:color-mix(in_srgb,var(--primary)_8%,transparent)] [color:var(--text)]">
							{buildProjectCode(projectConfig.projectNumber)}-DISC-TYPE-### REV
						</div>
					</div>
				</div>
			</div>

			{/* Drawing Types & Counts */}
			<div className={panelClass}>
				<h3 className="text-sm font-semibold [color:var(--text)]">
					Drawing Types & Counts
				</h3>
				<p className="mt-1 text-xs [color:var(--text-muted)]">
					Set how many drawings of each type to generate.
				</p>
				<div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-3">
					{projectConfig.allowedDisciplines.flatMap((discipline) =>
						projectConfig.allowedSheetTypes.map((sheetType) => {
							const typeKey = `${discipline}-${sheetType}`;
							const count = templateCounts[typeKey] || 0;
							return (
								<div
									key={typeKey}
									className="rounded-lg border p-2.5 [border-color:var(--border)] [background:var(--surface-2)]"
								>
									<label className="mb-1.5 block text-xs font-medium [color:var(--text)]">
										{typeKey}
									</label>
									<input
										type="number"
										min={0}
										max={99}
										value={count}
										onChange={(e) =>
											setTemplateCounts((prev) => ({
												...prev,
												[typeKey]: Math.max(0, Number(e.target.value)),
											}))
										}
										className={inputClass}
									/>
								</div>
							);
						}),
					)}
				</div>
			</div>

			{/* Hot Swap Names */}
			<div className={panelClass}>
				<h3 className="text-sm font-semibold [color:var(--text)]">
					Hot Swap Names
				</h3>
				<p className="mt-1 text-xs [color:var(--text-muted)]">
					Replace naming fragments across titles and regenerate naming
					consistency.
				</p>
				<div className="mt-3 grid max-h-60 gap-2 overflow-y-auto pr-2">
					{swapRules.map((rule) => (
						<div key={rule.id} className="grid grid-cols-2 gap-2">
							<input
								value={rule.from}
								onChange={(e) =>
									setSwapRules((prev) =>
										prev.map((item) =>
											item.id === rule.id
												? { ...item, from: e.target.value }
												: item,
										),
									)
								}
								placeholder="From"
								className={inputClass}
							/>
							<input
								value={rule.to}
								onChange={(e) =>
									setSwapRules((prev) =>
										prev.map((item) =>
											item.id === rule.id
												? { ...item, to: e.target.value }
												: item,
										),
									)
								}
								placeholder="To"
								className={inputClass}
							/>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={onApplySwap}
					className="mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition
						border-[color-mix(in_srgb,var(--primary)_20%,transparent)]
						[background:color-mix(in_srgb,var(--primary)_12%,transparent)]
						[color:var(--primary)] hover:opacity-80"
				>
					<Shuffle size={14} />
					Apply Swap Rules
				</button>
			</div>
		</div>
	);
}
