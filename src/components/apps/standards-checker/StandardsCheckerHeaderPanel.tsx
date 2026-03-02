import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { GlassPanel } from "../ui/GlassPanel";
import { categories, type StandardsCategory } from "./standardsCheckerModels";

interface StandardsCheckerHeaderPanelProps {
	activeCategory: StandardsCategory;
	onCategoryChange: (category: StandardsCategory) => void;
}

export function StandardsCheckerHeaderPanel({
	activeCategory,
	onCategoryChange,
}: StandardsCheckerHeaderPanelProps) {
	return (
		<GlassPanel variant="toolbar" padded className="space-y-5">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex items-center gap-4">
					<div className="flex h-12 w-12 items-center justify-center rounded-xl border [border-color:color-mix(in_srgb,var(--primary)_30%,transparent)] [background:linear-gradient(135deg,color-mix(in_srgb,var(--primary)_24%,transparent),color-mix(in_srgb,var(--primary)_10%,transparent))]">
						<ClipboardCheck className="h-6 w-6 [color:var(--primary)]" />
					</div>
					<div>
						<h1 className="text-2xl font-bold tracking-tight [color:var(--text)]">
							Standards Checker
						</h1>
						<p className="text-sm [color:var(--text-muted)]">
							Verify designs against NEC, IEEE, and IEC standards.
						</p>
					</div>
				</div>
				<Link
					to="/apps/qaqc"
					className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition [border-color:color-mix(in_srgb,var(--primary)_30%,transparent)] [background:color-mix(in_srgb,var(--primary)_14%,transparent)] [color:var(--primary)] hover:[background:color-mix(in_srgb,var(--primary)_20%,transparent)]"
				>
					Open QA/QC Checker
					<ArrowRight className="h-3.5 w-3.5" />
				</Link>
			</div>

			<div className="inline-flex flex-wrap items-center gap-2 rounded-xl border p-1 [border-color:color-mix(in_srgb,var(--primary)_18%,transparent)] [background:color-mix(in_srgb,var(--surface-2)_70%,transparent)]">
				{categories.map((category) => {
					const isActive = activeCategory === category;
					return (
						<button
							key={category}
							type="button"
							onClick={() => onCategoryChange(category)}
							className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
								isActive
									? "[background:color-mix(in_srgb,var(--primary)_22%,transparent)] [color:var(--primary)]"
									: "[color:var(--text-muted)] hover:[background:color-mix(in_srgb,var(--primary)_10%,transparent)] hover:[color:var(--text)]"
							}`}
						>
							{category}
						</button>
					);
				})}
			</div>
		</GlassPanel>
	);
}
