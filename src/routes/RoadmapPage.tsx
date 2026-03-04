import {
	ArrowLeft,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Circle,
	Clock,
	Compass,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { APP_NAME } from "../appMeta";
import {
	CATEGORY_META,
	type MilestoneCategory,
	type MilestoneStatus,
	type Quarter,
	ROADMAP_QUARTERS,
	STATUS_META,
} from "../data/roadmapData";
import styles from "./RoadmapPage.module.css";

const STATUS_ICONS: Record<MilestoneStatus, ReactNode> = {
	completed: <CheckCircle2 className={styles.statusIcon} />,
	"in-progress": <Clock className={styles.statusIcon} />,
	planned: <Circle className={styles.statusIcon} />,
	future: <Compass className={styles.statusIcon} />,
};

function StatusBadge({ status }: { status: MilestoneStatus }) {
	const meta = STATUS_META[status];
	return (
		<span
			className={styles.statusBadge}
			style={{ color: meta.color, background: meta.bg }}
		>
			{STATUS_ICONS[status]}
			{meta.label}
		</span>
	);
}

function CategoryTag({ category }: { category: MilestoneCategory }) {
	return (
		<span className={styles.categoryTag}>{CATEGORY_META[category].label}</span>
	);
}

function QuarterProgress({ quarter }: { quarter: Quarter }) {
	const total = quarter.milestones.length;
	const completed = quarter.milestones.filter(
		(m) => m.status === "completed",
	).length;
	const inProgress = quarter.milestones.filter(
		(m) => m.status === "in-progress",
	).length;
	const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
	const activePct =
		total > 0 ? Math.round(((completed + inProgress * 0.5) / total) * 100) : 0;

	return (
		<div className={styles.progressRow}>
			<div className={styles.progressTrack}>
				<div
					className={styles.progressFill}
					style={{
						width: `${activePct}%`,
						background:
							pct === 100
								? "var(--success)"
								: inProgress > 0
									? "var(--primary)"
									: "var(--accent)",
					}}
				/>
			</div>
			<span className={styles.progressCount}>
				{completed}/{total}
			</span>
		</div>
	);
}

function QuarterSection({ quarter }: { quarter: Quarter }) {
	const allCompleted = quarter.milestones.every(
		(m) => m.status === "completed",
	);
	const hasActive = quarter.milestones.some((m) => m.status === "in-progress");
	const [open, setOpen] = useState(hasActive || !allCompleted);

	return (
		<div className={styles.quarterRoot}>
			<div
				className={styles.timelineLine}
				style={{
					background: allCompleted
						? "var(--success)"
						: hasActive
							? "var(--primary)"
							: "var(--border)",
				}}
			/>

			<div className={styles.quarterInner}>
				<div
					className={styles.quarterMarker}
					style={{
						background: allCompleted
							? "var(--success)"
							: hasActive
								? "var(--primary)"
								: "var(--surface-2)",
						boxShadow: "0 0 0 3px var(--bg-base)",
					}}
				/>

				<button
					type="button"
					onClick={() => setOpen((p) => !p)}
					className={styles.quarterCard}
				>
					<div className={styles.quarterContent}>
						<div className={styles.quarterHead}>
							<span className={styles.quarterTitle}>{quarter.label}</span>
							<span className={styles.quarterTheme}>{quarter.theme}</span>
						</div>
						<p className={styles.quarterPeriod}>{quarter.period}</p>
						<p className={styles.quarterSummary}>{quarter.summary}</p>
						<div className={styles.quarterProgress}>
							<QuarterProgress quarter={quarter} />
						</div>
					</div>
					<div className={styles.chevronWrap}>
						{open ? (
							<ChevronDown className={styles.chevronIcon} />
						) : (
							<ChevronRight className={styles.chevronIcon} />
						)}
					</div>
				</button>

				{open && (
					<div className={styles.milestonesList}>
						{quarter.milestones.map((milestone) => (
							<div key={milestone.title} className={styles.milestoneCard}>
								<div className={styles.milestoneHead}>
									<div className={styles.milestoneContent}>
										<div className={styles.milestoneTitleRow}>
											<h4 className={styles.milestoneTitle}>
												{milestone.title}
											</h4>
											<CategoryTag category={milestone.category} />
										</div>
										<p className={styles.milestoneDescription}>
											{milestone.description}
										</p>
									</div>
									<StatusBadge status={milestone.status} />
								</div>
							</div>
						))}
					</div>
				)}

				{!open && <div className={styles.collapsedSpacer} />}
			</div>
		</div>
	);
}

function StatsBar() {
	const allMilestones = ROADMAP_QUARTERS.flatMap((q) => q.milestones);
	const total = allMilestones.length;
	const counts: Record<MilestoneStatus, number> = {
		completed: 0,
		"in-progress": 0,
		planned: 0,
		future: 0,
	};
	for (const m of allMilestones) {
		counts[m.status]++;
	}

	return (
		<div className={styles.statsGrid}>
			{(Object.keys(counts) as MilestoneStatus[]).map((status) => {
				const meta = STATUS_META[status];
				return (
					<div key={status} className={styles.statCard}>
						<div className={styles.statValue} style={{ color: meta.color }}>
							{counts[status]}
						</div>
						<div className={styles.statLabel}>{meta.label}</div>
					</div>
				);
			})}
			<div className={styles.overallCard}>
				<span className={styles.overallLabel}>Overall progress</span>
				<div className={styles.overallMetric}>
					<div className={styles.overallTrack}>
						<div
							className={styles.overallFill}
							style={{
								width: `${Math.round((counts.completed / total) * 100)}%`,
							}}
						/>
					</div>
					<span className={styles.overallValue}>
						{Math.round((counts.completed / total) * 100)}%
					</span>
				</div>
			</div>
		</div>
	);
}

export default function RoadmapPage() {
	return (
		<div className={styles.pageRoot}>
			<div className={styles.pageContainer}>
				<header className={styles.topHeader}>
					<div className={styles.brandWrap}>
						<Link to="/" className={styles.brandLink}>
							<div className={styles.brandMark}>
								<span
									className={cn(styles.brandCell, styles.brandCellPrimary)}
								/>
								<span
									className={cn(styles.brandCell, styles.brandCellAccent)}
								/>
								<span className={cn(styles.brandCell, styles.brandCellText)} />
								<span
									className={cn(styles.brandCell, styles.brandCellPrimary)}
								/>
							</div>
							{APP_NAME} Workspace
						</Link>
					</div>

					<Link to="/" className={styles.homeLink}>
						<ArrowLeft className={styles.homeIcon} />
						Home
					</Link>
				</header>

				<section className={styles.heroSection}>
					<div className={styles.heroBadge}>
						<span className={styles.heroBadgeDot} />
						Product Roadmap
					</div>
					<h1 className={styles.heroTitle}>Where Suite is headed</h1>
					<p className={styles.heroCopy}>
						A quarter-by-quarter view of what we have shipped, what we are
						building now, and what is coming next. This roadmap covers Q1 2026
						through Q4 2027.
					</p>
				</section>

				<StatsBar />

				<section className={styles.timelinePanel}>
					<div className={styles.legendRow}>
						<span className={styles.legendLabel}>Legend:</span>
						{(Object.keys(STATUS_META) as MilestoneStatus[]).map((s) => (
							<StatusBadge key={s} status={s} />
						))}
					</div>

					<div>
						{ROADMAP_QUARTERS.map((quarter) => (
							<QuarterSection key={quarter.id} quarter={quarter} />
						))}
					</div>
				</section>

				<footer className={styles.footer}>
					Last updated: March 2026. Roadmap items and timelines are subject to
					change based on feedback and priorities.
				</footer>
			</div>
		</div>
	);
}
