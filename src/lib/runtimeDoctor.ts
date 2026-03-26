import { recordAppDiagnostic } from "@/lib/appDiagnostics";
import {
	fetchWithTimeout,
	parseResponseErrorMessage,
} from "@/lib/fetchWithTimeout";
import { supabase } from "@/supabase/client";

export type RuntimeCheckStatus = "ok" | "warning" | "error";
export type SuiteDoctorState =
	| "ready"
	| "background"
	| "needs-attention"
	| "unavailable";

export interface RuntimeCheckResult {
	key: string;
	label: string;
	status: RuntimeCheckStatus;
	detail: string;
	actionable?: boolean;
	subsystem?: string;
	severity?: SuiteDoctorState;
	evidence?: Record<string, unknown>;
}

export interface SuiteRuntimeServiceStatus {
	id: string;
	label: string;
	state: SuiteDoctorState;
	source?: string;
	observedAt?: string;
	version?: string;
	summary?: string;
	actionableIssueCount?: number;
	checks?: RuntimeCheckResult[];
}

export interface SuiteSupportSummary {
	generatedAt?: string;
	lines?: string[];
	text?: string;
	workstation?: SuiteSupportWorkstationIdentity;
	config?: SuiteSupportConfigSnapshot;
	paths?: SuiteSupportPathSnapshot;
}

export interface SuiteSupportWorkstationIdentity {
	workstationId?: string;
	workstationLabel?: string;
	workstationRole?: string;
	computerName?: string;
	userName?: string;
	codexConfigPath?: string;
}

export interface SuiteSupportConfigSnapshot {
	repoRoot?: string;
	codexConfigPath?: string;
	codexConfigPresent?: boolean;
	supabaseConfigPath?: string;
	supabaseConfigPresent?: boolean;
	gatewayStartupCheckScript?: string;
	runtimeBootstrapScript?: string;
	watchdogCollectorConfigPath?: string;
	watchdogCollectorStartupCheckScript?: string;
	watchdogAutoCadCollectorConfigPath?: string;
	watchdogAutoCadStatePath?: string;
	watchdogAutoCadPluginBundleRoot?: string;
	watchdogAutoCadStartupCheckScript?: string;
	watchdogBackendStartupCheckScript?: string;
	gatewayMode?: "suite_native";
}

export interface SuiteSupportPathSnapshot {
	statusDir?: string;
	statusPath?: string;
	currentBootstrapPath?: string;
	bootstrapLogPath?: string;
	frontendLogPath?: string;
	supportRoot?: string;
}

export interface SuiteRuntimeStatus {
	schemaVersion?: string;
	checkedAt: string;
	overallState?: SuiteDoctorState;
	actionableIssueCount?: number;
	recommendations?: string[];
	services?: SuiteRuntimeServiceStatus[];
	support?: SuiteSupportSummary;
}

export interface SuiteDoctorGroup {
	id: string;
	label: string;
	checks: RuntimeCheckResult[];
}

export interface SuiteDoctorReport {
	schemaVersion?: string;
	checkedAt: string;
	overallState?: SuiteDoctorState;
	groupedChecks?: SuiteDoctorGroup[];
	severityCounts?: Record<SuiteDoctorState, number>;
	actionableIssueCount: number;
	recommendations?: string[];
}

export interface SuiteRuntimeDoctorReport extends SuiteDoctorReport {
	ok: boolean;
	actionableIssueCount: number;
	checks: RuntimeCheckResult[];
	runtimeStatus?: SuiteRuntimeStatus;
}

export type SuiteRuntimeDoctorMode = "background" | "manual";

interface RunSuiteRuntimeDoctorOptions {
	force?: boolean;
	mode?: SuiteRuntimeDoctorMode;
}

interface RuntimeStatusCheckPayload {
	key?: string;
	label?: string;
	subsystem?: string;
	severity?: string;
	detail?: string;
	actionable?: boolean;
	evidence?: Record<string, unknown>;
	meta?: Record<string, unknown>;
}

interface RuntimeStatusServicePayload {
	id?: string;
	name?: string;
	state?: string;
	source?: string;
	observedAt?: string;
	version?: string;
	summary?: string;
	actionableIssueCount?: number;
	checks?: RuntimeStatusCheckPayload[];
}

interface RuntimeStatusDoctorPayload {
	overallState?: string;
	actionableIssueCount?: number;
	severityCounts?: Record<string, number>;
	recommendations?: string[];
}

interface RuntimeStatusSupportPayload {
	generatedAt?: string;
	lines?: unknown;
	text?: unknown;
	workstation?: Record<string, unknown>;
	config?: Record<string, unknown>;
	paths?: Record<string, unknown>;
}

interface RuntimeStatusSnapshotPayload {
	schemaVersion?: string;
	checkedAt?: string;
	ok?: boolean;
	overall?: {
		state?: string;
		text?: string;
	};
	doctor?: RuntimeStatusDoctorPayload;
	services?: RuntimeStatusServicePayload[];
	support?: RuntimeStatusSupportPayload;
}

const RUNTIME_DOCTOR_CACHE_KEY = "suite:runtime-doctor-report:v1";
const RUNTIME_DOCTOR_CACHE_TTL_MS = 90_000;

let cachedRuntimeDoctorReport: SuiteRuntimeDoctorReport | null = null;
let cachedRuntimeDoctorReportAt = 0;
let backgroundRuntimeDoctorInFlight: Promise<SuiteRuntimeDoctorReport> | null =
	null;

function resolveRuntimeStatusPath(): string {
	if (import.meta.env.DEV) {
		return "/api/runtime/status";
	}
	const configuredBackendUrl = String(
		import.meta.env.VITE_BACKEND_URL || "",
	).trim();
	return configuredBackendUrl
		? `${configuredBackendUrl.replace(/\/+$/, "")}/api/runtime/status`
		: "/api/runtime/status";
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

function isSuiteDoctorState(value: string | undefined): value is SuiteDoctorState {
	return (
		value === "ready" ||
		value === "background" ||
		value === "needs-attention" ||
		value === "unavailable"
	);
}

function mapSnapshotOverallState(
	value: string | undefined,
): SuiteDoctorState | undefined {
	switch (value) {
		case "healthy":
			return "ready";
		case "booting":
			return "background";
		case "degraded":
			return "needs-attention";
		case "down":
			return "unavailable";
		default:
			return undefined;
	}
}

function toRuntimeCheckStatus(
	severity: SuiteDoctorState,
	actionable: boolean,
): RuntimeCheckStatus {
	if (severity === "unavailable") {
		return "error";
	}
	if (severity === "needs-attention") {
		return "warning";
	}
	if (severity === "background") {
		return actionable ? "warning" : "ok";
	}
	return "ok";
}

function countActionableIssues(checks: RuntimeCheckResult[]): number {
	return checks.filter(
		(check) => check.actionable !== false && check.status !== "ok",
	).length;
}

function normalizeRuntimeCheck(
	check: RuntimeStatusCheckPayload,
	fallbacks: {
		key: string;
		label: string;
		subsystem: string;
	},
): RuntimeCheckResult {
	const severity = isSuiteDoctorState(check.severity)
		? check.severity
		: check.actionable
			? "needs-attention"
			: "background";
	const actionable =
		typeof check.actionable === "boolean"
			? check.actionable
			: severity === "needs-attention" || severity === "unavailable";

	return {
		key: String(check.key || fallbacks.key),
		label: String(check.label || fallbacks.label),
		status: toRuntimeCheckStatus(severity, actionable),
		detail: String(check.detail || "No detail provided."),
		actionable,
		subsystem: String(check.subsystem || fallbacks.subsystem),
		severity,
		evidence: check.evidence || check.meta,
	};
}

function groupChecksBySubsystem(checks: RuntimeCheckResult[]): SuiteDoctorGroup[] {
	const groups = new Map<string, SuiteDoctorGroup>();
	for (const check of checks) {
		const subsystem = check.subsystem || "runtime";
		const existing =
			groups.get(subsystem) ||
			({
				id: subsystem,
				label: subsystem
					.split(/[-_]/g)
					.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
					.join(" "),
				checks: [],
			} satisfies SuiteDoctorGroup);
		existing.checks.push(check);
		groups.set(subsystem, existing);
	}
	return Array.from(groups.values());
}

function countSeverities(
	checks: RuntimeCheckResult[],
): Record<SuiteDoctorState, number> {
	return {
		ready: checks.filter((check) => (check.severity || "ready") === "ready")
			.length,
		background: checks.filter(
			(check) => (check.severity || "ready") === "background",
		).length,
		"needs-attention": checks.filter(
			(check) => (check.severity || "ready") === "needs-attention",
		).length,
		unavailable: checks.filter(
			(check) => (check.severity || "ready") === "unavailable",
		).length,
	};
}

function buildUnavailableReport(detail: string): SuiteRuntimeDoctorReport {
	const checkedAt = new Date().toISOString();
	const checks = [
		{
			key: "suite-runtime-status",
			label: "Suite runtime status",
			status: "error",
			detail,
			actionable: true,
			subsystem: "runtime",
			severity: "unavailable",
		},
	] satisfies RuntimeCheckResult[];

	return {
		schemaVersion: "suite.doctor.v1",
		checkedAt,
		overallState: "unavailable",
		groupedChecks: groupChecksBySubsystem(checks),
		severityCounts: countSeverities(checks),
		ok: false,
		actionableIssueCount: 1,
		checks,
		recommendations: [
			"Restore the local backend and workstation runtime snapshot before relying on developer diagnostics.",
		],
		runtimeStatus: {
			schemaVersion: "suite.runtime.v1",
			checkedAt,
			overallState: "unavailable",
			actionableIssueCount: 1,
			recommendations: [
				"Restore the local backend and workstation runtime snapshot before relying on developer diagnostics.",
			],
			services: [],
		},
	};
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

async function fetchRuntimeStatusSnapshot(
	mode: SuiteRuntimeDoctorMode,
): Promise<RuntimeStatusSnapshotPayload> {
	const headers = new Headers();
	const accessToken = await getAccessToken();
	if (accessToken) {
		headers.set("Authorization", `Bearer ${accessToken}`);
	}

	const response = await fetchWithTimeout(resolveRuntimeStatusPath(), {
		method: "GET",
		headers,
		credentials: "include",
		timeoutMs: 15_000,
		requestName: "Suite runtime status",
		diagnosticsMode: mode === "background" ? "silent" : "default",
	});

	if (!response.ok) {
		throw new Error(
			await parseResponseErrorMessage(
				response,
				`Suite runtime status failed (${response.status}).`,
			),
		);
	}

	return (await response.json()) as RuntimeStatusSnapshotPayload;
}

function normalizeRuntimeStatusSnapshot(
	payload: RuntimeStatusSnapshotPayload,
): SuiteRuntimeDoctorReport {
	const checkedAt = payload.checkedAt || new Date().toISOString();
	const services = Array.isArray(payload.services) ? payload.services : [];
	const normalizedServices: SuiteRuntimeServiceStatus[] = services.map(
		(service) => {
			const normalizedChecks = Array.isArray(service.checks)
				? service.checks.map((check, index) =>
						normalizeRuntimeCheck(check, {
							key: `${service.id || "service"}-check-${index + 1}`,
							label: `${service.name || "Service"} check`,
							subsystem: String(service.id || "runtime"),
						}),
					)
				: [];
			const actionableIssueCount =
				typeof service.actionableIssueCount === "number"
					? service.actionableIssueCount
					: countActionableIssues(normalizedChecks);
			return {
				id: String(service.id || "runtime"),
				label: String(service.name || service.id || "Runtime service"),
				state: isSuiteDoctorState(service.state)
					? service.state
					: mapSnapshotOverallState(service.state) || "background",
				source: service.source,
				observedAt: service.observedAt || checkedAt,
				version: service.version,
				summary: service.summary,
				actionableIssueCount,
				checks: normalizedChecks,
			};
		},
	);

	const checks = normalizedServices.flatMap((service) => service.checks || []);
	const actionableIssueCount =
		typeof payload.doctor?.actionableIssueCount === "number"
			? payload.doctor.actionableIssueCount
			: countActionableIssues(checks);
	const overallState =
		(isSuiteDoctorState(payload.doctor?.overallState)
			? payload.doctor?.overallState
			: undefined) ||
		mapSnapshotOverallState(payload.overall?.state) ||
		(actionableIssueCount > 0 ? "needs-attention" : "ready");
	const severityCounts = payload.doctor?.severityCounts
		? {
				ready: Number(payload.doctor.severityCounts.ready || 0),
				background: Number(payload.doctor.severityCounts.background || 0),
				"needs-attention": Number(
					payload.doctor.severityCounts["needs-attention"] || 0,
				),
				unavailable: Number(payload.doctor.severityCounts.unavailable || 0),
			}
		: countSeverities(checks);
	const recommendations = Array.isArray(payload.doctor?.recommendations)
		? payload.doctor?.recommendations.filter(Boolean)
		: [];
	const supportSummary: SuiteSupportSummary | undefined = payload.support
		? {
				generatedAt:
					typeof payload.support.generatedAt === "string"
						? payload.support.generatedAt
						: undefined,
				lines: Array.isArray(payload.support.lines)
					? payload.support.lines
							.map((line) => String(line ?? "").trim())
							.filter(Boolean)
					: undefined,
				text:
					typeof payload.support.text === "string"
						? payload.support.text
						: undefined,
				workstation:
					payload.support.workstation &&
					typeof payload.support.workstation === "object"
						? {
								workstationId:
									typeof payload.support.workstation.workstationId === "string"
										? payload.support.workstation.workstationId
										: undefined,
								workstationLabel:
									typeof payload.support.workstation.workstationLabel ===
									"string"
										? payload.support.workstation.workstationLabel
										: undefined,
								workstationRole:
									typeof payload.support.workstation.workstationRole ===
									"string"
										? payload.support.workstation.workstationRole
										: undefined,
								computerName:
									typeof payload.support.workstation.computerName === "string"
										? payload.support.workstation.computerName
										: undefined,
								userName:
									typeof payload.support.workstation.userName === "string"
										? payload.support.workstation.userName
										: undefined,
								codexConfigPath:
									typeof payload.support.workstation.codexConfigPath === "string"
										? payload.support.workstation.codexConfigPath
										: undefined,
							}
						: undefined,
				config:
					payload.support.config && typeof payload.support.config === "object"
						? {
								repoRoot:
									typeof payload.support.config.repoRoot === "string"
										? payload.support.config.repoRoot
										: undefined,
								codexConfigPath:
									typeof payload.support.config.codexConfigPath === "string"
										? payload.support.config.codexConfigPath
										: undefined,
								codexConfigPresent:
									typeof payload.support.config.codexConfigPresent === "boolean"
										? payload.support.config.codexConfigPresent
										: undefined,
								supabaseConfigPath:
									typeof payload.support.config.supabaseConfigPath === "string"
										? payload.support.config.supabaseConfigPath
										: undefined,
								supabaseConfigPresent:
									typeof payload.support.config.supabaseConfigPresent ===
									"boolean"
										? payload.support.config.supabaseConfigPresent
										: undefined,
								gatewayStartupCheckScript:
									typeof payload.support.config.gatewayStartupCheckScript ===
									"string"
										? payload.support.config.gatewayStartupCheckScript
										: undefined,
								runtimeBootstrapScript:
									typeof payload.support.config.runtimeBootstrapScript ===
									"string"
										? payload.support.config.runtimeBootstrapScript
										: undefined,
								watchdogCollectorConfigPath:
									typeof payload.support.config.watchdogCollectorConfigPath ===
									"string"
										? payload.support.config.watchdogCollectorConfigPath
										: undefined,
								watchdogCollectorStartupCheckScript:
									typeof payload.support.config
										.watchdogCollectorStartupCheckScript === "string"
										? payload.support.config
												.watchdogCollectorStartupCheckScript
										: undefined,
								watchdogAutoCadCollectorConfigPath:
									typeof payload.support.config
										.watchdogAutoCadCollectorConfigPath === "string"
										? payload.support.config.watchdogAutoCadCollectorConfigPath
										: undefined,
								watchdogAutoCadStatePath:
									typeof payload.support.config.watchdogAutoCadStatePath ===
									"string"
										? payload.support.config.watchdogAutoCadStatePath
										: undefined,
								watchdogAutoCadPluginBundleRoot:
									typeof payload.support.config
										.watchdogAutoCadPluginBundleRoot === "string"
										? payload.support.config.watchdogAutoCadPluginBundleRoot
										: undefined,
								watchdogAutoCadStartupCheckScript:
									typeof payload.support.config
										.watchdogAutoCadStartupCheckScript === "string"
										? payload.support.config
												.watchdogAutoCadStartupCheckScript
										: undefined,
								watchdogBackendStartupCheckScript:
									typeof payload.support.config
										.watchdogBackendStartupCheckScript === "string"
										? payload.support.config.watchdogBackendStartupCheckScript
										: undefined,
								gatewayMode:
									payload.support.config.gatewayMode === "suite_native"
										? payload.support.config.gatewayMode
										: undefined,
							}
						: undefined,
				paths:
					payload.support.paths && typeof payload.support.paths === "object"
						? {
								statusDir:
									typeof payload.support.paths.statusDir === "string"
										? payload.support.paths.statusDir
										: undefined,
								statusPath:
									typeof payload.support.paths.statusPath === "string"
										? payload.support.paths.statusPath
										: undefined,
								currentBootstrapPath:
									typeof payload.support.paths.currentBootstrapPath === "string"
										? payload.support.paths.currentBootstrapPath
										: undefined,
								bootstrapLogPath:
									typeof payload.support.paths.bootstrapLogPath === "string"
										? payload.support.paths.bootstrapLogPath
										: undefined,
								frontendLogPath:
									typeof payload.support.paths.frontendLogPath === "string"
										? payload.support.paths.frontendLogPath
										: undefined,
								supportRoot:
									typeof payload.support.paths.supportRoot === "string"
										? payload.support.paths.supportRoot
										: undefined,
							}
						: undefined,
			}
		: undefined;

	return {
		schemaVersion: payload.schemaVersion || "suite.doctor.v1",
		checkedAt,
		overallState,
		groupedChecks: groupChecksBySubsystem(checks),
		severityCounts,
		ok:
			typeof payload.ok === "boolean"
				? payload.ok
				: actionableIssueCount === 0,
		actionableIssueCount,
		checks,
		recommendations,
		runtimeStatus: {
			schemaVersion: payload.schemaVersion || "suite.runtime.v1",
			checkedAt,
			overallState,
			actionableIssueCount,
			recommendations,
			services: normalizedServices,
			support: supportSummary,
		},
	};
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
		try {
			const snapshot = await fetchRuntimeStatusSnapshot(mode);
			const report = normalizeRuntimeStatusSnapshot(snapshot);
			if (report.actionableIssueCount > 0) {
				recordAppDiagnostic({
					source: "runtime",
					severity: report.overallState === "unavailable" ? "error" : "warning",
					title: "Runtime doctor detected environment drift",
					message: report.checks
						.filter((check) => check.actionable !== false && check.status !== "ok")
						.map((check) => `${check.label}: ${check.detail}`)
						.join(" | "),
					context: "SuiteRuntimeDoctor",
				});
			}
			if (mode === "background") {
				writeCachedRuntimeDoctorReport(report);
			}
			return report;
		} catch (error) {
			const report = buildUnavailableReport(
				error instanceof Error
					? error.message
					: "Suite runtime status could not be loaded.",
			);
			recordAppDiagnostic({
				source: "runtime",
				severity: "error",
				title: "Runtime doctor could not load the shared workstation snapshot",
				message: report.checks[0]?.detail || "Unknown runtime status failure.",
				context: "SuiteRuntimeDoctor",
			});
			if (mode === "background") {
				writeCachedRuntimeDoctorReport(report);
			}
			return report;
		}
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
