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
	readyCount: number;
	publishedCount: number;
	blockerCount: number;
	hotspotLinkedCount: number;
	readinessLabel: string;
	readinessTone: "success" | "warning" | "danger" | "primary";
	readinessDetail: string;
	latestReadyEntry: WorkLedgerRow | null;
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
		readyCount: readyEntries.length,
		publishedCount: publishedEntries.length,
		blockerCount: latestFailedReceipt ? 1 : 0,
		hotspotLinkedCount: hotspotLinkedEntries.length,
		readinessLabel,
		readinessTone,
		readinessDetail,
		latestReadyEntry: readyEntries[0] ?? null,
		latestPublishedEntry: publishedEntries[0] ?? null,
		latestFailedReceipt,
		latestSuccessfulReceipt,
		hotspotLinkedEntries,
	};
}
