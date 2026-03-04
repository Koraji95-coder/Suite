import {
	AlertTriangle,
	CheckCircle2,
	Download,
	ListChecks,
	Wand2,
} from "lucide-react";
import styles from "./DrawingListManagerOverview.module.css";

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
		<div className={styles.root}>
			{/* Actions */}
			<div className={styles.actions}>
				<button
					type="button"
					onClick={onGenerateList}
					className={styles.primaryAction}
				>
					<Wand2 size={16} />
					Generate List
				</button>
				<button
					type="button"
					onClick={onExport}
					className={styles.secondaryAction}
				>
					<Download size={16} />
					Export Excel
				</button>
			</div>

			{/* Stat cards */}
			<div className={styles.statsGrid}>
				{stats(summary).map((card) => {
					const Icon = card.icon;
					return (
						<div key={card.label} className={styles.statCard}>
							<div>
								<div className={styles.statLabel}>{card.label}</div>
								<div className={styles.statValue}>{card.value}</div>
							</div>
							<div className={styles.iconWrap}>
								<Icon size={20} className={styles.icon} />
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
