import { useState } from "react";
import { Link } from "react-router-dom";
import {
	ChevronDown,
	ChevronRight,
	ArrowLeft,
	CheckCircle2,
	Circle,
	Clock,
	Compass,
} from "lucide-react";

import { APP_NAME } from "../app";
import {
	CATEGORY_META,
	ROADMAP_QUARTERS,
	STATUS_META,
	type MilestoneCategory,
	type MilestoneStatus,
	type Quarter,
} from "../data/roadmapData";

const STATUS_ICONS: Record<MilestoneStatus, React.ReactNode> = {
	completed: <CheckCircle2 className="h-4 w-4" />,
	"in-progress": <Clock className="h-4 w-4" />,
	planned: <Circle className="h-4 w-4" />,
	future: <Compass className="h-4 w-4" />,
};

function StatusBadge({ status }: { status: MilestoneStatus }) {
	const meta = STATUS_META[status];
	return (
		<span
			className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
			style={{ color: meta.color, background: meta.bg }}
		>
			{STATUS_ICONS[status]}
			{meta.label}
		</span>
	);
}

function CategoryTag({ category }: { category: MilestoneCategory }) {
	return (
		<span className="rounded-md px-2 py-0.5 text-[11px] font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
			{CATEGORY_META[category].label}
		</span>
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
		<div className="flex items-center gap-3">
			<div className="h-1.5 flex-1 overflow-hidden rounded-full [background:var(--surface-2)]">
				<div
					className="h-full rounded-full transition-all duration-500"
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
			<span className="text-xs tabular-nums [color:var(--text-muted)]">
				{completed}/{total}
			</span>
		</div>
	);
}

function QuarterSection({ quarter }: { quarter: Quarter }) {
	const allCompleted = quarter.milestones.every(
		(m) => m.status === "completed",
	);
	const hasActive = quarter.milestones.some(
		(m) => m.status === "in-progress",
	);
	const [open, setOpen] = useState(hasActive || !allCompleted);

	return (
		<div className="relative">
			<div
				className="absolute top-0 left-5 h-full w-px md:left-6"
				style={{
					background: allCompleted
						? "var(--success)"
						: hasActive
							? "var(--primary)"
							: "var(--border)",
				}}
			/>

			<div className="relative pl-12 md:pl-14">
				<div
					className="absolute top-3 left-3 z-10 flex h-4 w-4 items-center justify-center rounded-full md:left-4 md:h-4 md:w-4"
					style={{
						background: allCompleted
							? "var(--success)"
							: hasActive
								? "var(--primary)"
								: "var(--surface-2)",
						boxShadow: `0 0 0 3px var(--bg-base)`,
					}}
				/>

				<button
					type="button"
					onClick={() => setOpen((p) => !p)}
					className="flex w-full items-start gap-3 rounded-xl border p-4 text-left transition hover:[border-color:var(--primary)] [border-color:var(--border)] [background:var(--bg-mid)] md:p-5"
				>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-lg font-semibold tracking-tight md:text-xl">
								{quarter.label}
							</span>
							<span className="rounded-full px-2.5 py-0.5 text-xs font-medium [background:var(--surface-2)] [color:var(--primary)]">
								{quarter.theme}
							</span>
						</div>
						<p className="mt-1 text-xs [color:var(--text-muted)]">
							{quarter.period}
						</p>
						<p className="mt-2 text-sm leading-relaxed [color:var(--text-muted)]">
							{quarter.summary}
						</p>
						<div className="mt-3">
							<QuarterProgress quarter={quarter} />
						</div>
					</div>
					<div className="mt-1 shrink-0 [color:var(--text-muted)]">
						{open ? (
							<ChevronDown className="h-5 w-5" />
						) : (
							<ChevronRight className="h-5 w-5" />
						)}
					</div>
				</button>

				{open && (
					<div className="mt-2 grid gap-2 pb-8">
						{quarter.milestones.map((milestone) => (
							<div
								key={milestone.title}
								className="rounded-xl border p-4 transition [border-color:var(--border)] [background:var(--surface)]"
							>
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<h4 className="text-sm font-semibold">
												{milestone.title}
											</h4>
											<CategoryTag category={milestone.category} />
										</div>
										<p className="mt-1.5 text-xs leading-relaxed [color:var(--text-muted)]">
											{milestone.description}
										</p>
									</div>
									<StatusBadge status={milestone.status} />
								</div>
							</div>
						))}
					</div>
				)}

				{!open && <div className="h-6" />}
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
		<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
			{(Object.keys(counts) as MilestoneStatus[]).map((status) => {
				const meta = STATUS_META[status];
				return (
					<div
						key={status}
						className="rounded-xl border p-3 [border-color:var(--border)] [background:var(--surface)]"
					>
						<div
							className="text-2xl font-bold tabular-nums"
							style={{ color: meta.color }}
						>
							{counts[status]}
						</div>
						<div className="mt-0.5 text-xs [color:var(--text-muted)]">
							{meta.label}
						</div>
					</div>
				);
			})}
			<div className="col-span-2 flex items-center justify-between rounded-xl border p-3 md:col-span-4 [border-color:var(--border)] [background:var(--surface)]">
				<span className="text-sm font-medium [color:var(--text-muted)]">
					Overall progress
				</span>
				<div className="flex items-center gap-3">
					<div className="h-2 w-32 overflow-hidden rounded-full [background:var(--surface-2)]">
						<div
							className="h-full rounded-full [background:var(--success)]"
							style={{
								width: `${Math.round((counts.completed / total) * 100)}%`,
							}}
						/>
					</div>
					<span className="text-sm font-semibold tabular-nums">
						{Math.round((counts.completed / total) * 100)}%
					</span>
				</div>
			</div>
		</div>
	);
}

export default function RoadmapPage() {
	return (
		<div className="min-h-screen [background:var(--bg-base)] [color:var(--text)]">
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
				<header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 [border-color:var(--border)] [background:var(--bg-mid)] md:p-4">
					<div className="inline-flex items-center gap-2">
						<Link
							to="/"
							className="inline-flex items-center gap-2 text-sm font-semibold no-underline [color:var(--text)]"
						>
							<div className="grid h-6 w-6 grid-cols-2 gap-0.5 rounded-md p-0.5 [background:var(--surface-2)]">
								<span className="rounded-sm [background:var(--primary)]" />
								<span className="rounded-sm [background:var(--accent)]" />
								<span className="rounded-sm [background:var(--text)]" />
								<span className="rounded-sm [background:var(--primary)]" />
							</div>
							{APP_NAME} Workspace
						</Link>
					</div>

					<Link
						to="/"
						className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium no-underline transition hover:[background:var(--surface-2)] [border-color:var(--border)] [background:var(--surface)] [color:var(--text)]"
					>
						<ArrowLeft className="h-3.5 w-3.5" />
						Home
					</Link>
				</header>

				<section className="rounded-2xl border p-6 [border-color:var(--border)] [background:var(--bg-mid)] md:p-8">
					<div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium [background:var(--surface-2)] [color:var(--text-muted)]">
						<span className="h-1.5 w-1.5 rounded-full [background:var(--primary)]" />
						Product Roadmap
					</div>
					<h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
						Where Suite is headed
					</h1>
					<p className="mt-3 max-w-2xl text-sm leading-relaxed md:text-base [color:var(--text-muted)]">
						A quarter-by-quarter view of what we have shipped, what we are
						building now, and what is coming next. This roadmap covers Q1 2026
						through Q4 2027.
					</p>
				</section>

				<StatsBar />

				<section className="rounded-2xl border p-4 [border-color:var(--border)] [background:var(--bg-mid)] md:p-6">
					<div className="flex flex-wrap items-center gap-3 pb-4">
						<span className="text-xs font-medium [color:var(--text-muted)]">
							Legend:
						</span>
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

				<footer className="rounded-2xl border p-4 text-center text-xs [border-color:var(--border)] [background:var(--bg-mid)] [color:var(--text-muted)]">
					Last updated: March 2026. Roadmap items and timelines are subject to
					change based on feedback and priorities.
				</footer>
			</div>
		</div>
	);
}
