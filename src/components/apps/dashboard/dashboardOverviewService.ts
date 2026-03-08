import { supabase } from "@/supabase/client";
import type { DashboardProject } from "./useDashboardOverviewData";

export interface DashboardTaskCountPayload {
	total: number;
	completed: number;
	nextDue: { name: string; date: string } | null;
	hasOverdue: boolean;
}

export interface DashboardOverviewPayload {
	projects: DashboardProject[];
	activities: Array<{
		id: string;
		action: string;
		description: string;
		project_id: string | null;
		task_id: string | null;
		timestamp: string;
		user_id: string;
	}>;
	storageUsed: number;
	projectTaskCounts: Record<string, DashboardTaskCountPayload>;
	allProjects: DashboardProject[];
}

interface DashboardLoadStartResponse {
	ok: boolean;
	job_id: string;
	status: "pending" | "running";
}

export interface DashboardLoadProgress {
	status: "pending" | "running" | "complete" | "error";
	stage: string;
	message: string;
	progress: number;
}

interface DashboardLoadStatusResponse extends DashboardLoadProgress {
	ok: boolean;
	job_id: string;
	error?: string;
	data?: DashboardOverviewPayload;
}

const LOAD_TIMEOUT_MS = 35_000;
const CACHED_PAYLOAD_MAX_AGE_MS = 45_000;
const POLL_SCHEDULE: ReadonlyArray<{
	untilElapsedMs: number;
	intervalMs: number;
}> = [
	{ untilElapsedMs: 2_500, intervalMs: 280 },
	{ untilElapsedMs: 9_000, intervalMs: 650 },
	{ untilElapsedMs: 20_000, intervalMs: 1_200 },
	{ untilElapsedMs: Number.POSITIVE_INFINITY, intervalMs: 2_000 },
];

type ProgressCallback = (progress: DashboardLoadProgress) => void;

let cachedPayload: DashboardOverviewPayload | null = null;
let cachedPayloadAt = 0;
let inFlightLoad: {
	promise: Promise<DashboardOverviewPayload>;
	progressListeners: Set<ProgressCallback>;
} | null = null;

async function parseError(response: Response): Promise<string> {
	try {
		const payload = (await response.json()) as
			| { error?: string; message?: string }
			| undefined;
		return (
			payload?.error ||
			payload?.message ||
			`Request failed with status ${response.status}`
		);
	} catch {
		return `Request failed with status ${response.status}`;
	}
}

async function getAccessToken(): Promise<string | null> {
	const {
		data: { session },
		error,
	} = await supabase.auth.getSession();
	if (error || !session?.access_token) return null;
	return session.access_token;
}

async function startDashboardLoadJob(
	accessToken: string,
): Promise<DashboardLoadStartResponse> {
	const response = await fetch("/api/dashboard/load", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		throw new Error(await parseError(response));
	}

	return (await response.json()) as DashboardLoadStartResponse;
}

async function getDashboardLoadStatus(
	jobId: string,
	accessToken: string,
): Promise<DashboardLoadStatusResponse> {
	const response = await fetch(
		`/api/dashboard/load/${encodeURIComponent(jobId)}`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	);

	if (!response.ok) {
		throw new Error(await parseError(response));
	}

	return (await response.json()) as DashboardLoadStatusResponse;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function clampProgress(raw: number): number {
	if (!Number.isFinite(raw)) return 0;
	return Math.max(0, Math.min(100, Math.trunc(raw)));
}

function resolvePollIntervalMs(
	elapsedMs: number,
	status: DashboardLoadStatusResponse,
): number {
	const progress = clampProgress(status.progress);
	if (status.status === "running" && progress >= 96) {
		return 280;
	}
	if (status.status === "running" && progress >= 85) {
		return 450;
	}
	for (const step of POLL_SCHEDULE) {
		if (elapsedMs <= step.untilElapsedMs) {
			return step.intervalMs;
		}
	}
	return 2_000;
}

function cachePayload(payload: DashboardOverviewPayload) {
	cachedPayload = payload;
	cachedPayloadAt = Date.now();
}

export function getCachedDashboardOverviewPayload(): DashboardOverviewPayload | null {
	if (!cachedPayload) return null;
	if (Date.now() - cachedPayloadAt > CACHED_PAYLOAD_MAX_AGE_MS) {
		cachedPayload = null;
		cachedPayloadAt = 0;
		return null;
	}
	return cachedPayload;
}

async function runDashboardLoad(
	onProgress?: ProgressCallback,
): Promise<DashboardOverviewPayload> {
	const accessToken = await getAccessToken();
	if (!accessToken) {
		throw new Error("No active Supabase session.");
	}

	const start = await startDashboardLoadJob(accessToken);
	const startedAt = Date.now();

	for (;;) {
		const status = await getDashboardLoadStatus(start.job_id, accessToken);
		onProgress?.({
			status: status.status,
			stage: status.stage,
			message: status.message,
			progress: status.progress,
		});

		if (status.status === "complete") {
			if (!status.data) {
				throw new Error("Dashboard load completed without payload.");
			}
			cachePayload(status.data);
			return status.data;
		}

		if (status.status === "error") {
			throw new Error(
				status.error || status.message || "Dashboard load failed.",
			);
		}

		if (Date.now() - startedAt > LOAD_TIMEOUT_MS) {
			throw new Error("Dashboard load timed out.");
		}

		const elapsedMs = Date.now() - startedAt;
		await wait(resolvePollIntervalMs(elapsedMs, status));
	}
}

export async function loadDashboardOverviewFromBackend(
	onProgress?: ProgressCallback,
): Promise<DashboardOverviewPayload> {
	if (inFlightLoad) {
		if (onProgress) {
			inFlightLoad.progressListeners.add(onProgress);
		}
		return inFlightLoad.promise;
	}

	const progressListeners = new Set<ProgressCallback>();
	if (onProgress) {
		progressListeners.add(onProgress);
	}

	const promise = runDashboardLoad((progress) => {
		progressListeners.forEach((listener) => {
			try {
				listener(progress);
			} catch {
				// Ignore progress listener errors so load completion still resolves.
			}
		});
	}).finally(() => {
		inFlightLoad = null;
		progressListeners.clear();
	});

	inFlightLoad = { promise, progressListeners };

	return promise;
}
