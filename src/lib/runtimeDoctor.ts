import { recordAppDiagnostic } from "@/lib/appDiagnostics";
import {
	fetchWithTimeout,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { supabase } from "@/supabase/client";
import { isSupabaseConfigured } from "@/supabase/utils";

export type RuntimeCheckStatus = "ok" | "warning" | "error";

export interface RuntimeCheckResult {
	key: string;
	label: string;
	status: RuntimeCheckStatus;
	detail: string;
	actionable?: boolean;
}

export interface SuiteRuntimeDoctorReport {
	checkedAt: string;
	ok: boolean;
	actionableIssueCount: number;
	checks: RuntimeCheckResult[];
}

export type SuiteRuntimeDoctorMode = "background" | "manual";

interface RunSuiteRuntimeDoctorOptions {
	force?: boolean;
	mode?: SuiteRuntimeDoctorMode;
}

const RUNTIME_DOCTOR_CACHE_KEY = "suite:runtime-doctor-report:v1";
const RUNTIME_DOCTOR_CACHE_TTL_MS = 90_000;

let cachedRuntimeDoctorReport: SuiteRuntimeDoctorReport | null = null;
let cachedRuntimeDoctorReportAt = 0;
let backgroundRuntimeDoctorInFlight: Promise<SuiteRuntimeDoctorReport> | null =
	null;

function resolveBackendHealthPath(): string | null {
	if (import.meta.env.DEV) {
		return "/health";
	}
	const configuredBackendUrl = String(
		import.meta.env.VITE_BACKEND_URL || "",
	).trim();
	return configuredBackendUrl
		? `${configuredBackendUrl.replace(/\/+$/, "")}/health`
		: "/health";
}

function ok(label: string, detail: string, key: string): RuntimeCheckResult {
	return { key, label, status: "ok", detail, actionable: false };
}

function warning(
	label: string,
	detail: string,
	key: string,
	options: { actionable?: boolean } = {},
): RuntimeCheckResult {
	return {
		key,
		label,
		status: "warning",
		detail,
		actionable: options.actionable ?? true,
	};
}

function error(
	label: string,
	detail: string,
	key: string,
	options: { actionable?: boolean } = {},
): RuntimeCheckResult {
	return {
		key,
		label,
		status: "error",
		detail,
		actionable: options.actionable ?? true,
	};
}

function readCachedRuntimeDoctorReport(): SuiteRuntimeDoctorReport | null {
	if (cachedRuntimeDoctorReport) {
		if (
			Date.now() - cachedRuntimeDoctorReportAt <=
			RUNTIME_DOCTOR_CACHE_TTL_MS
		) {
			return cachedRuntimeDoctorReport;
		}
		cachedRuntimeDoctorReport = null;
		cachedRuntimeDoctorReportAt = 0;
	}

	try {
		const raw = sessionStorage.getItem(RUNTIME_DOCTOR_CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as {
			updatedAt?: number;
			report?: SuiteRuntimeDoctorReport;
		};
		if (
			typeof parsed?.updatedAt !== "number" ||
			!parsed.report ||
			Date.now() - parsed.updatedAt > RUNTIME_DOCTOR_CACHE_TTL_MS
		) {
			sessionStorage.removeItem(RUNTIME_DOCTOR_CACHE_KEY);
			return null;
		}
		cachedRuntimeDoctorReport = parsed.report;
		cachedRuntimeDoctorReportAt = parsed.updatedAt;
		return parsed.report;
	} catch {
		return null;
	}
}

function writeCachedRuntimeDoctorReport(report: SuiteRuntimeDoctorReport) {
	cachedRuntimeDoctorReport = report;
	cachedRuntimeDoctorReportAt = Date.now();
	try {
		sessionStorage.setItem(
			RUNTIME_DOCTOR_CACHE_KEY,
			JSON.stringify({
				updatedAt: cachedRuntimeDoctorReportAt,
				report,
			}),
		);
	} catch {
		/* noop */
	}
}

async function getAccessToken(): Promise<string | null> {
	try {
		const {
			data: { session },
			error: sessionError,
		} = await supabase.auth.getSession();
		if (sessionError || !session?.access_token) {
			return null;
		}
		return String(session.access_token);
	} catch {
		return null;
	}
}

async function checkRoute(args: {
	key: string;
	label: string;
	path: string;
	accessToken: string | null;
	mode: SuiteRuntimeDoctorMode;
}) {
	const background = args.mode === "background";
	const headers = new Headers();
	if (args.accessToken) {
		headers.set("Authorization", `Bearer ${args.accessToken}`);
	}
	try {
		const response = await fetchWithTimeout(args.path, {
			method: "GET",
			headers,
			credentials: "include",
			timeoutMs: 12_000,
			requestName: `${args.label} check`,
			diagnosticsMode: background ? "silent" : "default",
		});
		if (response.ok) {
			return ok(args.label, "Route is available.", args.key);
		}
		const actionable = !background;
		if (response.status === 401 || response.status === 403) {
			return warning(
				args.label,
				"Route exists but requires an authenticated session.",
				args.key,
				{ actionable },
			);
		}
		if (background && response.status === 429) {
			return warning(
				args.label,
				"Background route checks are being rate-limited while the local stack settles. Open diagnostics and run the doctor when you need a manual check.",
				args.key,
				{ actionable: false },
			);
		}
		if (response.status === 404) {
			return error(
				args.label,
				"Route is missing from the running backend. Restart the backend so it matches the repo.",
				args.key,
				{ actionable },
			);
		}
		return error(
			args.label,
			await parseResponseErrorMessage(
				response,
				`Route check failed (${response.status}).`,
			),
			args.key,
			{ actionable },
		);
	} catch (routeError) {
		if (background) {
			return warning(
				args.label,
				routeError instanceof Error
					? routeError.message
					: "Route check failed unexpectedly.",
				args.key,
				{ actionable: false },
			);
		}
		return error(
			args.label,
			routeError instanceof Error
				? routeError.message
				: "Route check failed unexpectedly.",
			args.key,
		);
	}
}

async function checkSupabaseTable(
	table: string,
	accessToken: string | null,
	mode: SuiteRuntimeDoctorMode,
): Promise<RuntimeCheckResult> {
	const background = mode === "background";
	const actionable = !background;
	if (!isSupabaseConfigured()) {
		return warning(
			`Supabase ${table}`,
			"Supabase is not configured on this frontend session.",
			`supabase-${table}`,
			{ actionable },
		);
	}

	const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
	const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
	if (!url || !anonKey) {
		return warning(
			`Supabase ${table}`,
			"Supabase credentials are unavailable on this frontend session.",
			`supabase-${table}`,
			{ actionable },
		);
	}

	const headers = new Headers({
		apikey: anonKey,
	});
	if (accessToken) {
		headers.set("Authorization", `Bearer ${accessToken}`);
	}

	try {
		const response = await fetchWithTimeout(
			`${url.replace(/\/+$/, "")}/rest/v1/${table}?select=id&limit=1`,
			{
				method: "GET",
				headers,
				timeoutMs: 12_000,
				requestName: `Supabase ${table} check`,
				diagnosticsMode: background ? "silent" : "default",
			},
		);
		if (response.ok) {
			return ok(
				`Supabase ${table}`,
				"Table is reachable from the current session.",
				`supabase-${table}`,
			);
		}
		if (response.status === 404) {
			return error(
				`Supabase ${table}`,
				"Table is missing from Supabase. Run `npm run supabase:db:reset` for local dev or apply the fallback Supabase SQL stack before relying on this surface.",
				`supabase-${table}`,
				{ actionable },
			);
		}
		if (response.status === 401 || response.status === 403) {
			return warning(
				`Supabase ${table}`,
				"Table exists but the current session cannot read it.",
				`supabase-${table}`,
				{ actionable },
			);
		}
		return error(
			`Supabase ${table}`,
			await parseResponseErrorMessage(
				response,
				`Table check failed (${response.status}).`,
			),
			`supabase-${table}`,
			{ actionable },
		);
	} catch (tableError) {
		if (background) {
			return warning(
				`Supabase ${table}`,
				tableError instanceof Error
					? tableError.message
					: "Supabase table check failed unexpectedly.",
				`supabase-${table}`,
				{ actionable: false },
			);
		}
		return error(
			`Supabase ${table}`,
			tableError instanceof Error
				? tableError.message
				: "Supabase table check failed unexpectedly.",
			`supabase-${table}`,
		);
	}
}

export async function runSuiteRuntimeDoctor(
	options: RunSuiteRuntimeDoctorOptions = {},
): Promise<SuiteRuntimeDoctorReport> {
	const { force = false, mode = "manual" } = options;
	if (mode === "background" && !force) {
		const cachedReport = readCachedRuntimeDoctorReport();
		if (cachedReport) {
			return cachedReport;
		}
		if (backgroundRuntimeDoctorInFlight) {
			return backgroundRuntimeDoctorInFlight;
		}
	}

	const run = async (): Promise<SuiteRuntimeDoctorReport> => {
		const accessToken = await getAccessToken();
		const checks: RuntimeCheckResult[] = [];
		const backendHealthPath = resolveBackendHealthPath();

		if (backendHealthPath) {
			checks.push(
				await checkRoute({
					key: "backend-health",
					label: import.meta.env.DEV
						? "Backend health (via Vite proxy)"
						: "Backend health",
					path: backendHealthPath,
					accessToken,
					mode,
				}),
			);
		}
		checks.push(
			await checkRoute({
				key: "work-ledger-readiness",
				label: "Work Ledger readiness route",
				path: "/api/work-ledger/publishers/worktale/readiness",
				accessToken,
				mode,
			}),
		);
		checks.push(
			await checkRoute({
				key: "watchdog-sessions",
				label: "Watchdog sessions route",
				path: "/api/watchdog/sessions?limit=1&timeWindowMs=3600000",
				accessToken,
				mode,
			}),
		);

		for (const table of [
			"work_ledger_entries",
			"files",
			"activity_log",
			"calendar_events",
		]) {
			checks.push(await checkSupabaseTable(table, accessToken, mode));
		}

		const actionableChecks = checks.filter(
			(check) => check.status !== "ok" && check.actionable !== false,
		);
		const actionableIssueCount = actionableChecks.length;
		const hasActionableError = actionableChecks.some(
			(check) => check.status === "error",
		);
		if (actionableIssueCount > 0) {
			recordAppDiagnostic({
				source: "runtime",
				severity: hasActionableError ? "error" : "warning",
				title: "Runtime doctor detected environment drift",
				message: actionableChecks
					.map((check) => `${check.label}: ${check.detail}`)
					.join(" | "),
				context: "SuiteRuntimeDoctor",
			});
		}

		const report: SuiteRuntimeDoctorReport = {
			checkedAt: new Date().toISOString(),
			ok: actionableIssueCount === 0,
			actionableIssueCount,
			checks,
		};
		if (mode === "background") {
			writeCachedRuntimeDoctorReport(report);
		}
		return report;
	};

	if (mode !== "background" || force) {
		return run();
	}

	backgroundRuntimeDoctorInFlight = run();
	try {
		return await backgroundRuntimeDoctorInFlight;
	} finally {
		backgroundRuntimeDoctorInFlight = null;
	}
}
