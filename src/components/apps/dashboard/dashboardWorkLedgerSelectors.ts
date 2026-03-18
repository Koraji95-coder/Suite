import type {
	WorkLedgerPublishJobRow,
	WorkLedgerRow,
	WorktaleReadinessResponse,
} from "@/services/workLedgerService";

export interface DashboardWorkLedgerReceipt {
	entry: WorkLedgerRow;
	job: WorkLedgerPublishJobRow;
}

export interface DashboardWorkLedgerViewModel {
	plannedCount: number;
	activeCount: number;
	completedCount: number;
	archivedCount: number;
	readyCount: number;
	publishedCount: number;
	blockerCount: number;
	hotspotLinkedCount: number;
	readinessLabel: string;
	readinessTone: "success" | "warning" | "danger" | "primary";
	readinessDetail: string;
	latestReadyEntry: WorkLedgerRow | null;
	latestActiveEntry: WorkLedgerRow | null;
	latestCompletedEntry: WorkLedgerRow | null;
	latestPublishedEntry: WorkLedgerRow | null;
	latestFailedReceipt: DashboardWorkLedgerReceipt | null;
	latestSuccessfulReceipt: DashboardWorkLedgerReceipt | null;
	hotspotLinkedEntries: WorkLedgerRow[];
}

interface BuildDashboardWorkLedgerViewModelArgs {
	entries: WorkLedgerRow[];
	jobsByEntry: Record<string, WorkLedgerPublishJobRow[]>;
	readiness: WorktaleReadinessResponse | null;
	readinessError: string | null;
}

function parseTimestamp(value: string | null | undefined): number {
	if (!value) return 0;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareEntries(left: WorkLedgerRow, right: WorkLedgerRow): number {
	return parseTimestamp(right.published_at || right.updated_at) -
		parseTimestamp(left.published_at || left.updated_at);
}

function compareJobs(
	left: WorkLedgerPublishJobRow,
	right: WorkLedgerPublishJobRow,
): number {
	return parseTimestamp(right.published_at || right.updated_at || right.created_at) -
		parseTimestamp(left.published_at || left.updated_at || left.created_at);
}

export function buildDashboardWorkLedgerViewModel({
	entries,
	jobsByEntry,
	readiness,
	readinessError,
}: BuildDashboardWorkLedgerViewModelArgs): DashboardWorkLedgerViewModel {
	const readyEntries = entries
		.filter((entry) => entry.publish_state === "ready")
		.sort(compareEntries);
	const activeEntries = entries
		.filter((entry) => entry.lifecycle_state === "active")
		.sort(compareEntries);
	const completedEntries = entries
		.filter((entry) => entry.lifecycle_state === "completed")
		.sort(compareEntries);
	const publishedEntries = entries
		.filter((entry) => entry.publish_state === "published")
		.sort(compareEntries);
	const hotspotLinkedEntries = entries
		.filter(
			(entry) =>
				entry.hotspot_ids.length > 0 || entry.architecture_paths.length > 0,
		)
		.sort(compareEntries)
		.slice(0, 4);

	const receipts = Object.entries(jobsByEntry)
		.flatMap(([entryId, jobs]) => {
			const entry = entries.find((candidate) => candidate.id === entryId);
			if (!entry) return [];
			return jobs.map((job) => ({ entry, job }));
		})
		.sort((left, right) => compareJobs(left.job, right.job));

	const latestFailedReceipt =
		receipts.find((receipt) => receipt.job.status === "failed") ?? null;
	const latestSuccessfulReceipt =
		receipts.find((receipt) => receipt.job.status === "succeeded") ?? null;

	let readinessLabel = "Worktale unavailable";
	let readinessTone: DashboardWorkLedgerViewModel["readinessTone"] = "warning";
	let readinessDetail =
		readinessError || "Sign in and bootstrap Worktale to publish ledger stories.";
	const readinessErrorMessage = String(readinessError || "").toLowerCase();

	if (readiness?.ready) {
		readinessLabel = "Worktale ready";
		readinessTone = "success";
		readinessDetail = "Outbound note publishing is available on this workstation.";
	} else if (readiness) {
		readinessLabel = "Worktale needs setup";
		readinessTone = "warning";
		readinessDetail =
			readiness.issues[0] ||
			"Worktale needs bootstrap or local CLI setup before publishing.";
	} else if (readinessErrorMessage.includes("routes are unavailable")) {
		readinessLabel = "Backend route unavailable";
		readinessTone = "danger";
		readinessDetail =
			"Backend is running an older route set. Restart API from the current repo checkout.";
	} else if (readinessErrorMessage.includes("backend is unreachable")) {
		readinessLabel = "Backend offline";
		readinessTone = "danger";
		readinessDetail =
			"Work Ledger backend is unreachable. Check API startup and /api proxy target.";
	} else if (readinessErrorMessage.includes("sign in")) {
		readinessLabel = "Auth required";
		readinessTone = "warning";
		readinessDetail = "Sign in to load Work Ledger publisher readiness.";
	}

	if (latestFailedReceipt) {
		readinessTone = "danger";
		readinessLabel = "Publish blockers";
		readinessDetail =
			latestFailedReceipt.job.error_text ||
			latestFailedReceipt.job.stderr_excerpt ||
			latestFailedReceipt.entry.title;
	}

	return {
		plannedCount: entries.filter((entry) => entry.lifecycle_state === "planned")
			.length,
		activeCount: activeEntries.length,
		completedCount: completedEntries.length,
		archivedCount: entries.filter((entry) => entry.lifecycle_state === "archived")
			.length,
		readyCount: readyEntries.length,
		publishedCount: publishedEntries.length,
		blockerCount: latestFailedReceipt ? 1 : 0,
		hotspotLinkedCount: hotspotLinkedEntries.length,
		readinessLabel,
		readinessTone,
		readinessDetail,
		latestReadyEntry: readyEntries[0] ?? null,
		latestActiveEntry: activeEntries[0] ?? null,
		latestCompletedEntry: completedEntries[0] ?? null,
		latestPublishedEntry: publishedEntries[0] ?? null,
		latestFailedReceipt,
		latestSuccessfulReceipt,
		hotspotLinkedEntries,
	};
}
