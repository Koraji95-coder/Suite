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
}

export interface SuiteRuntimeDoctorReport {
	checkedAt: string;
	ok: boolean;
	checks: RuntimeCheckResult[];
}

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
	return { key, label, status: "ok", detail };
}

function warning(
	label: string,
	detail: string,
	key: string,
): RuntimeCheckResult {
	return { key, label, status: "warning", detail };
}

function error(label: string, detail: string, key: string): RuntimeCheckResult {
	return { key, label, status: "error", detail };
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
}) {
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
		});
		if (response.ok) {
			return ok(args.label, "Route is available.", args.key);
		}
		if (response.status === 401 || response.status === 403) {
			return warning(
				args.label,
				"Route exists but requires an authenticated session.",
				args.key,
			);
		}
		if (response.status === 404) {
			return error(
				args.label,
				"Route is missing from the running backend. Restart the backend so it matches the repo.",
				args.key,
			);
		}
		return error(
			args.label,
			await parseResponseErrorMessage(
				response,
				`Route check failed (${response.status}).`,
			),
			args.key,
		);
	} catch (routeError) {
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
): Promise<RuntimeCheckResult> {
	if (!isSupabaseConfigured()) {
		return warning(
			`Supabase ${table}`,
			"Supabase is not configured on this frontend session.",
			`supabase-${table}`,
		);
	}

	const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
	const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
	if (!url || !anonKey) {
		return warning(
			`Supabase ${table}`,
			"Supabase credentials are unavailable on this frontend session.",
			`supabase-${table}`,
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
				"Table is missing from Supabase. Run the latest migrations before relying on this surface.",
				`supabase-${table}`,
			);
		}
		if (response.status === 401 || response.status === 403) {
			return warning(
				`Supabase ${table}`,
				"Table exists but the current session cannot read it.",
				`supabase-${table}`,
			);
		}
		return error(
			`Supabase ${table}`,
			await parseResponseErrorMessage(
				response,
				`Table check failed (${response.status}).`,
			),
			`supabase-${table}`,
		);
	} catch (tableError) {
		return error(
			`Supabase ${table}`,
			tableError instanceof Error
				? tableError.message
				: "Supabase table check failed unexpectedly.",
			`supabase-${table}`,
		);
	}
}

export async function runSuiteRuntimeDoctor(): Promise<SuiteRuntimeDoctorReport> {
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
			}),
		);
	}
	checks.push(
		await checkRoute({
			key: "work-ledger-readiness",
			label: "Work Ledger readiness route",
			path: "/api/work-ledger/publishers/worktale/readiness",
			accessToken,
		}),
	);
	checks.push(
		await checkRoute({
			key: "watchdog-sessions",
			label: "Watchdog sessions route",
			path: "/api/watchdog/sessions?limit=1&timeWindowMs=3600000",
			accessToken,
		}),
	);

	for (const table of [
		"work_ledger_entries",
		"files",
		"activity_log",
		"calendar_events",
	]) {
		checks.push(await checkSupabaseTable(table, accessToken));
	}

	const hasError = checks.some((check) => check.status === "error");
	const hasWarning = checks.some((check) => check.status === "warning");
	if (hasError || hasWarning) {
		recordAppDiagnostic({
			source: "runtime",
			severity: hasError ? "error" : "warning",
			title: "Runtime doctor detected environment drift",
			message: checks
				.filter((check) => check.status !== "ok")
				.map((check) => `${check.label}: ${check.detail}`)
				.join(" | "),
			context: "SuiteRuntimeDoctor",
		});
	}

	return {
		checkedAt: new Date().toISOString(),
		ok: !hasError,
		checks,
	};
}
