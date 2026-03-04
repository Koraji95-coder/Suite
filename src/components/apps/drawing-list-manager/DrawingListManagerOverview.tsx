import {
	AlertTriangle,
	CheckCircle2,
	Download,
	ListChecks,
	Wand2,
} from "lucide-react";

interface DrawingListManagerOverviewProps {
	summary: {
		total: number;
		flagged: number;
		missing: number;
	};
	onGenerateList: () => void;
	onExport: () => void;
}

const stats = (summary: DrawingListManagerOverviewProps["summary"]) => [
	{ label: "Total", value: summary.total, icon: ListChecks },
	{ label: "Flagged", value: summary.flagged, icon: AlertTriangle },
	{ label: "Missing", value: summary.missing, icon: AlertTriangle },
	{
		label: "Ready",
		value: Math.max(summary.total - summary.flagged, 0),
		icon: CheckCircle2,
	},
];

export function DrawingListManagerOverview({
	summary,
	onGenerateList,
	onExport,
}: DrawingListManagerOverviewProps) {
	return (
		<div className="space-y-4">
			{/* Actions */}
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					onClick={onGenerateList}
					className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition
						[background:var(--primary)] [color:var(--primary-contrast)] hover:opacity-90"
				>
					<Wand2 size={16} />
					Generate List
				</button>
				<button
					type="button"
					onClick={onExport}
					className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition
						[border-color:var(--border)] [background:var(--surface)] [color:var(--text)]
						hover:[background:var(--surface-2)]"
				>
					<Download size={16} />
					Export Excel
				</button>
			</div>

			{/* Stat cards */}
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{stats(summary).map((card) => {
					const Icon = card.icon;
					return (
						<div
							key={card.label}
							className="flex items-center justify-between rounded-xl border p-4
								[border-color:var(--border)] [background:var(--surface)]"
						>
							<div>
								<div className="text-xs uppercase tracking-[0.08em] [color:var(--text-muted)]">
									{card.label}
								</div>
								<div className="text-2xl font-bold [color:var(--text)]">
									{card.value}
								</div>
							</div>
							<div className="flex h-10 w-10 items-center justify-center rounded-xl [background:color-mix(in_srgb,var(--primary)_12%,transparent)]">
								<Icon size={20} className="[color:var(--primary)]" />
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
