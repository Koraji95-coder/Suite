#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const SERVER_INFO = {
	name: "suite-repo-mcp",
	version: "0.1.0",
};
const AUTODESK_PROJECT_FLOW_RESOURCE_URI =
	"repo://docs/development/autocad-electrical-2026-project-flow";
const AUTODESK_PROJECT_FLOW_RESOURCE_PATH = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"autocad-electrical-2026-project-flow-reference.md",
);
const AUTODESK_AUTOLISP_API_RESOURCE_URI =
	"repo://docs/development/autocad-electrical-2026-autolisp-api-reference";
const AUTODESK_AUTOLISP_API_RESOURCE_PATH = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"AutoCAD Electrical 2026 AutoLISP Reference API Documentation.md",
);
const AUTODESK_REFERENCE_PACK_RESOURCE_URI =
	"repo://docs/development/autocad-electrical-2026-reference-pack";
const AUTODESK_REFERENCE_PACK_RESOURCE_PATH = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"autocad-electrical-2026-reference-pack.md",
);
const AUTODESK_INSTALL_CONTEXT_RESOURCE_URI =
	"repo://docs/development/autocad-electrical-2026-installation-context";
const AUTODESK_INSTALL_CONTEXT_RESOURCE_PATH = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"autocad-electrical-2026-installation-context-reference.md",
);
const AUTODESK_INSTALL_CONTEXT_YAML_RESOURCE_URI =
	"repo://docs/development/autocad-electrical-2026-installation-context-yaml";
const AUTODESK_INSTALL_CONTEXT_YAML_RESOURCE_PATH = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"autocad-electrical-2026-installation-context.generated.yaml",
);
const AUTODESK_LOOKUP_INDEX_RESOURCE_URI =
	"repo://docs/development/autocad-electrical-2026-lookup-index";
const AUTODESK_LOOKUP_INDEX_RESOURCE_PATH = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"autocad-electrical-2026-lookup-index.generated.json",
);
const AUTODESK_REGRESSION_FIXTURES_RESOURCE_URI =
	"repo://docs/development/autocad-electrical-2026-regression-fixtures";
const AUTODESK_REGRESSION_FIXTURES_RESOURCE_PATH = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"autocad-electrical-2026-regression-fixtures.md",
);
const AUTODESK_INTEGRATION_PLAYBOOK_RESOURCE_URI =
	"repo://docs/development/autocad-electrical-2026-suite-integration-playbook";
const AUTODESK_INTEGRATION_PLAYBOOK_RESOURCE_PATH = path.join(
	REPO_ROOT,
	"docs",
	"development",
	"autocad-electrical-2026-suite-integration-playbook.md",
);
const STATIC_RESOURCES = [
	{
		uri: AUTODESK_PROJECT_FLOW_RESOURCE_URI,
		name: "AutoCAD Electrical 2026 Project Flow Reference",
		description:
			"Curated AutoCAD Electrical project-flow reference generated from Autodesk offline help.",
		mimeType: "text/markdown",
		filePath: AUTODESK_PROJECT_FLOW_RESOURCE_PATH,
	},
	{
		uri: AUTODESK_AUTOLISP_API_RESOURCE_URI,
		name: "AutoCAD Electrical 2026 AutoLISP Reference API Documentation",
		description:
			"Generated AutoCAD Electrical AutoLISP/API reference derived from the local Autodesk CHM and ACADE install assets.",
		mimeType: "text/markdown",
		filePath: AUTODESK_AUTOLISP_API_RESOURCE_PATH,
	},
	{
		uri: AUTODESK_REFERENCE_PACK_RESOURCE_URI,
		name: "AutoCAD Electrical 2026 Local Reference Pack",
		description:
			"Combined local ACADE reference pack that consolidates project-flow and AutoLISP/API docs for local coding and reference use.",
		mimeType: "text/markdown",
		filePath: AUTODESK_REFERENCE_PACK_RESOURCE_PATH,
	},
	{
		uri: AUTODESK_INSTALL_CONTEXT_RESOURCE_URI,
		name: "AutoCAD Electrical 2026 Installation Context Reference",
		description:
			"Generated local install-context reference for ACADE UserSupport menus, support scripts, lookup databases, and sample/demo payloads.",
		mimeType: "text/markdown",
		filePath: AUTODESK_INSTALL_CONTEXT_RESOURCE_PATH,
	},
	{
		uri: AUTODESK_INSTALL_CONTEXT_YAML_RESOURCE_URI,
		name: "AutoCAD Electrical 2026 Installation Context Inventory (YAML)",
		description:
			"Structured YAML companion for the local ACADE install-context inventory, including menu catalogs, support scripts, lookup databases, and sample/demo payloads.",
		mimeType: "application/yaml",
		filePath: AUTODESK_INSTALL_CONTEXT_YAML_RESOURCE_PATH,
	},
	{
		uri: AUTODESK_LOOKUP_INDEX_RESOURCE_URI,
		name: "AutoCAD Electrical 2026 Lookup Index",
		description:
			"Generated structured lookup-database index for the local ACADE install, covering catalog, PLC, via-component, and optional footprint MDB payloads.",
		mimeType: "application/json",
		filePath: AUTODESK_LOOKUP_INDEX_RESOURCE_PATH,
	},
	{
		uri: AUTODESK_REGRESSION_FIXTURES_RESOURCE_URI,
		name: "AutoCAD Electrical 2026 Regression Fixtures",
		description:
			"Generated local fixture plan for copied Autodesk demo projects and sample drawings that Suite should use for regression validation.",
		mimeType: "text/markdown",
		filePath: AUTODESK_REGRESSION_FIXTURES_RESOURCE_PATH,
	},
	{
		uri: AUTODESK_INTEGRATION_PLAYBOOK_RESOURCE_URI,
		name: "AutoCAD Electrical 2026 Suite Integration Playbook",
		description:
			"Generated Suite-facing playbook that turns the local ACADE menus, scripts, lookup databases, and sample projects into integration guidance.",
		mimeType: "text/markdown",
		filePath: AUTODESK_INTEGRATION_PLAYBOOK_RESOURCE_PATH,
	},
	{
		uri: "repo://docs/development/long-term-overhaul-todo-plan",
		name: "Long-Term Overhaul Todo Plan",
		description: "Master backlog and overhaul plan for the Suite codebase.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "development", "long-term-overhaul-todo-plan.md"),
	},
	{
		uri: "repo://docs/development/post-bridge-tranche-handoff",
		name: "Latest Tranche Handoff Note",
		description: "Cold-start handoff note from the most recent development tranche.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "development", "post-bridge-tranche-handoff-2026-04-03.md"),
	},
	{
		uri: "repo://docs/app-feature-roadmap-opinions",
		name: "App Feature Roadmap & Opinions",
		description: "Opinionated filter layer over raw feature ideas with build priority recommendations.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "app-feature-roadmap-opinions.md"),
	},
	{
		uri: "repo://docs/runtime-control/mcp-workstation-matrix",
		name: "MCP Workstation Matrix",
		description: "Canonical workstation profile data, naming rules, and MCP env overrides.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "runtime-control", "mcp-workstation-matrix.md"),
	},
	{
		uri: "repo://docs/runtime-control/workstation-bringup",
		name: "Windows Workstation Bring-Up",
		description: "First-time bring-up and cross-PC workstation setup guide.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "runtime-control", "workstation-bringup.md"),
	},
	{
		uri: "repo://docs/security/auth-architecture-canonical",
		name: "Auth Architecture (Canonical)",
		description: "Canonical auth architecture reference for Suite.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "security", "auth-architecture-canonical.md"),
	},
	{
		uri: "repo://docs/development/documentation-structure",
		name: "Documentation Structure",
		description: "Documentation structure and organization guide for Suite.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "development", "documentation-structure.md"),
	},
	{
		uri: "repo://docs/deep-repo-hardening-backlog",
		name: "Deep Repo Hardening Backlog",
		description: "Tracked hardening and cleanup backlog for the Suite codebase.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "deep-repo-hardening-backlog.md"),
	},
	{
		uri: "repo://docs/backend/local-learning-opportunities",
		name: "Local Learning Opportunities (ML Pilots)",
		description:
			"Concrete ML opportunities for Suite: scikit-learn confidence scoring, PyTorch markup classification, anomaly detection, and recommended stack order.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "backend", "local-learning-opportunities.md"),
	},
	{
		uri: "repo://docs/development/post-overhaul-feature-backlog",
		name: "Post-Overhaul Feature Backlog",
		description:
			"Immediate feature backlog after overhaul including ML pilot candidates and Autodesk API exploration items.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "development", "post-overhaul-feature-backlog.md"),
	},
	{
		uri: "repo://docs/cad/autodesk-local-install-reference",
		name: "Autodesk Local Install Reference",
		description:
			"Canonical inventory of local Autodesk install material useful for Suite CAD/runtime integration, including sample projects, catalogs, Design Automation manifests, and COM/ActiveX references.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "cad", "autodesk-local-install-reference.md"),
	},
	{
		uri: "repo://docs/cad/coordinates-grabber-api",
		name: "Coordinates Grabber API (CAD Bridge)",
		description:
			"Flask backend CAD bridge reference: COM connection management, AutoCAD status endpoints, selection, layers, transmittal rendering, and WebSocket events.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "cad", "coordinates-grabber-api.md"),
	},
	{
		uri: "repo://docs/cad/autodesk-standards-checker-comparison",
		name: "Autodesk Standards Checker Comparison",
		description:
			"Comparison of Autodesk built-in standards checker vs Suite standards checking approach for CAD drawing validation.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "cad", "autodesk-standards-checker-comparison.md"),
	},
	{
		uri: "repo://docs/security/code-scanning-guide",
		name: "Code Scanning & Security Quality Guide",
		description:
			"Guide for running CodeQL and njsscan locally, understanding alerts, preventing common security-quality issues, and keeping the scanning backlog clean.",
		mimeType: "text/markdown",
		filePath: path.join(REPO_ROOT, "docs", "security", "code-scanning-guide.md"),
	},
];
const LATEST_PROTOCOL_VERSION = "2026-01-26";
const SUPPORTED_PROTOCOL_VERSIONS = new Set([
	LATEST_PROTOCOL_VERSION,
	"2025-06-18",
	"2024-11-05",
]);

const MAX_OUTPUT_CHARS = 200_000;
const DEFAULT_TIMEOUT_MS = 120_000;
let cachedHasRipgrep = null;
const SOURCE_EXTENSIONS = [
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".json",
	".py",
	".sql",
];

function toPosix(value) {
	return value.split(path.sep).join("/");
}

function repoRelative(absPath) {
	return toPosix(path.relative(REPO_ROOT, absPath));
}

function createTextResult(text, isError = false) {
	return {
		content: [{ type: "text", text }],
		isError,
	};
}

function getWorkstationContext() {
	const computerName = String(process.env.COMPUTERNAME || os.hostname() || "").trim();
	const offlineHelpRoot = String(
		process.env.SUITE_AUTODESK_OFFLINE_HELP_ROOT || "",
	).trim();
	const workstationId =
		String(process.env.SUITE_WORKSTATION_ID || "").trim() ||
		computerName ||
		"unknown";
	const workstationLabel =
		String(process.env.SUITE_WORKSTATION_LABEL || "").trim() || null;
	const workstationRole =
		String(process.env.SUITE_WORKSTATION_ROLE || "").trim() || null;
	const source =
		String(process.env.SUITE_WORKSTATION_ID || "").trim().length > 0
			? "mcp_env"
			: computerName
				? "hostname"
				: "unknown";
	return {
		workstationId,
		workstationLabel,
		workstationRole,
		computerName: computerName || null,
		platform: process.platform,
		repoRoot: REPO_ROOT,
		source,
		autodeskOfflineHelpRoot: offlineHelpRoot || null,
		envStampedBy:
			String(process.env.SUITE_MCP_ENV_STAMPED_BY || "").trim() || null,
	};
}

function formatWorkstationContext() {
	const context = getWorkstationContext();
	const filesystemStartup = getWatchdogStartupContext(context);
	const autocadStartup = getWatchdogAutocadStartupContext(context);
	const autocadPlugin = getWatchdogAutocadPluginContext();
	const lines = ["## Workstation Context", ""];
	lines.push(`- Workstation ID: ${context.workstationId}`);
	if (context.workstationLabel) {
		lines.push(`- Label: ${context.workstationLabel}`);
	}
	if (context.workstationRole) {
		lines.push(`- Role: ${context.workstationRole}`);
	}
	if (context.computerName) {
		lines.push(`- Computer Name: ${context.computerName}`);
	}
	lines.push(`- Platform: ${context.platform}`);
	lines.push(`- Repo Root: ${toPosix(context.repoRoot)}`);
	lines.push(`- Source: ${context.source}`);
	if (context.autodeskOfflineHelpRoot) {
		lines.push(
			`- Autodesk Offline Help Root: ${toPosix(
				path.normalize(context.autodeskOfflineHelpRoot),
			)}`,
		);
	}
	if (context.envStampedBy) {
		lines.push(`- MCP Env Stamp: ${context.envStampedBy}`);
	}
	lines.push("");
	lines.push("## Watchdog Collector Startup");
	lines.push(`- Collector ID: ${filesystemStartup.collectorId}`);
	lines.push(`- Config Path: ${filesystemStartup.configPath}`);
	lines.push(`- Startup Task: ${filesystemStartup.taskName}`);
	lines.push(`- Startup Check Task: ${filesystemStartup.checkTaskName}`);
	lines.push(`- Run Key Name: ${filesystemStartup.runKeyName}`);
	lines.push(`- Mutex Name: ${filesystemStartup.mutexName}`);
	lines.push(`- Startup Check Script: ${filesystemStartup.checkScript}`);
	lines.push(
		"- MCP Tool: `repo.check_watchdog_collector_startup`",
	);
	lines.push("");
	lines.push("### AutoCAD State Collector Startup");
	lines.push(`- Collector ID: ${autocadStartup.collectorId}`);
	lines.push(`- Config Path: ${autocadStartup.configPath}`);
	lines.push(`- State JSON Path: ${autocadStartup.stateJsonPath}`);
	lines.push(`- Buffer Dir: ${autocadStartup.bufferDir}`);
	lines.push(`- Startup Task: ${autocadStartup.taskName}`);
	lines.push(`- Startup Check Task: ${autocadStartup.checkTaskName}`);
	lines.push(`- Run Key Name: ${autocadStartup.runKeyName}`);
	lines.push(`- Mutex Name: ${autocadStartup.mutexName}`);
	lines.push(`- Startup Check Script: ${autocadStartup.checkScript}`);
	lines.push(
		"- MCP Tool: `repo.check_watchdog_autocad_collector_startup`",
	);
	lines.push("");
	lines.push("### AutoCAD Plugin");
	lines.push(`- Bundle Root: ${autocadPlugin.bundleRoot}`);
	lines.push(`- Plugin Check Script: ${autocadPlugin.checkScript}`);
	lines.push("- MCP Tool: `repo.check_watchdog_autocad_plugin`");
	lines.push("");
	lines.push("### AutoCAD Readiness");
	lines.push(`- Readiness Check Script: ${autocadPlugin.readinessScript}`);
	lines.push("- MCP Tool: `repo.check_watchdog_autocad_readiness`");
	lines.push("");
	lines.push("Supported MCP env overrides:");
	lines.push("- `SUITE_WORKSTATION_ID`");
	lines.push("- `SUITE_WORKSTATION_LABEL`");
	lines.push("- `SUITE_WORKSTATION_ROLE`");
	lines.push("- `SUITE_WATCHDOG_COLLECTOR_ID`");
	lines.push("- `SUITE_WATCHDOG_COLLECTOR_CONFIG`");
	lines.push("- `SUITE_WATCHDOG_STARTUP_TASK_NAME`");
	lines.push("- `SUITE_WATCHDOG_STARTUP_CHECK_TASK_NAME`");
	lines.push("- `SUITE_WATCHDOG_STARTUP_RUN_KEY_NAME`");
	lines.push("- `SUITE_WATCHDOG_STARTUP_MUTEX_NAME`");
	lines.push("- `SUITE_WATCHDOG_STARTUP_CHECK_SCRIPT`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_COLLECTOR_ID`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_COLLECTOR_CONFIG`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_STATE_PATH`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_BUFFER_DIR`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_STARTUP_TASK_NAME`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_STARTUP_CHECK_TASK_NAME`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_STARTUP_RUN_KEY_NAME`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_STARTUP_MUTEX_NAME`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_STARTUP_CHECK_SCRIPT`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_PLUGIN_BUNDLE_ROOT`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_PLUGIN_CHECK_SCRIPT`");
	lines.push("- `SUITE_WATCHDOG_AUTOCAD_READINESS_CHECK_SCRIPT`");
	lines.push("- `SUITE_WATCHDOG_BACKEND_STARTUP_CHECK_SCRIPT`");
	lines.push("- `SUITE_AUTODESK_OFFLINE_HELP_ROOT`");
	lines.push("- `SUITE_MCP_ENV_STAMPED_BY`");
	return lines.join("\n");
}

function getLocalAppDataRoot() {
	const localAppData = String(process.env.LOCALAPPDATA || "").trim();
	if (localAppData) return localAppData;
	return path.join(os.homedir(), "AppData", "Local");
}

function defaultWatchdogCollectorId(workstationId) {
	const slug = slugify(workstationId || "workstation");
	return `watchdog-fs-${slug || "workstation"}`;
}

function getWatchdogStartupContext(workstationContext = getWorkstationContext()) {
	const workstationId = workstationContext.workstationId || "unknown";
	const collectorId =
		String(process.env.SUITE_WATCHDOG_COLLECTOR_ID || "").trim() ||
		defaultWatchdogCollectorId(workstationId);
	const configPath =
		String(process.env.SUITE_WATCHDOG_COLLECTOR_CONFIG || "").trim() ||
		path.join(
			getLocalAppDataRoot(),
			"Suite",
			"watchdog-collector",
			"config",
			`${workstationId}.json`,
		);
	const taskName =
		String(process.env.SUITE_WATCHDOG_STARTUP_TASK_NAME || "").trim() ||
		`SuiteWatchdogFilesystemCollector-${workstationId}`;
	const checkTaskName =
		String(process.env.SUITE_WATCHDOG_STARTUP_CHECK_TASK_NAME || "").trim() ||
		`SuiteWatchdogFilesystemCollectorCheck-${workstationId}`;
	const runKeyName =
		String(process.env.SUITE_WATCHDOG_STARTUP_RUN_KEY_NAME || "").trim() ||
		taskName;
	const mutexName =
		String(process.env.SUITE_WATCHDOG_STARTUP_MUTEX_NAME || "").trim() ||
		`Local\\SuiteWatchdogFilesystemCollectorDaemon-${
			slugify(workstationId) || "workstation"
		}`;
	const checkScript =
		String(process.env.SUITE_WATCHDOG_STARTUP_CHECK_SCRIPT || "").trim() ||
		path.join(
			REPO_ROOT,
			"scripts",
			"check-watchdog-filesystem-collector-startup.ps1",
		);
	return {
		collectorId,
		configPath: toPosix(configPath),
		taskName,
		checkTaskName,
		runKeyName,
		mutexName,
		checkScript: toPosix(checkScript),
	};
}

function getWatchdogBackendStartupContext(workstationContext = getWorkstationContext()) {
	const workstationId = workstationContext.workstationId || "unknown";
	const checkScript =
		String(process.env.SUITE_WATCHDOG_BACKEND_STARTUP_CHECK_SCRIPT || "").trim() ||
		path.join(
			REPO_ROOT,
			"scripts",
			"check-watchdog-backend-startup.ps1",
		);
	return {
		workstationId,
		checkScript: toPosix(checkScript),
	};
}

function getAutocadAppDataRoamingRoot() {
	const autocadAppData = String(process.env.APPDATA || "").trim();
	if (autocadAppData) return autocadAppData;
	return path.join(os.homedir(), "AppData", "Roaming");
}

function defaultWatchdogAutocadCollectorId(workstationId) {
	const slug = slugify(workstationId || "workstation");
	return `autocad-${slug || "workstation"}`;
}

function defaultAutocadConfigPath(workstationId) {
	return path.join(
		getLocalAppDataRoot(),
		"Suite",
		"watchdog-autocad-collector",
		"config",
		`${workstationId}-autocad.json`,
	);
}

function defaultAutocadStatePath() {
	return path.join(
		getAutocadAppDataRoamingRoot(),
		"CadCommandCenter",
		"tracker-state.json",
	);
}

function defaultAutocadBufferDir(collectorId) {
	return path.join(
		getLocalAppDataRoot(),
		"Suite",
		"watchdog-autocad-collector",
		collectorId,
	);
}

function defaultAutocadPluginBundleRoot() {
	return path.join(
		getAutocadAppDataRoamingRoot(),
		"Autodesk",
		"ApplicationPlugins",
		"SuiteWatchdogCadTracker.bundle",
	);
}

function getWatchdogAutocadStartupContext(workstationContext = getWorkstationContext()) {
	const workstationId = workstationContext.workstationId || "unknown";
	const slug = slugify(workstationId) || "workstation";
	const collectorId =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_COLLECTOR_ID || "").trim() ||
		String(process.env.WATCHDOG_AUTOCAD_COLLECTOR_ID || "").trim() ||
		defaultWatchdogAutocadCollectorId(workstationId);
	const configPath =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_COLLECTOR_CONFIG || "").trim() ||
		defaultAutocadConfigPath(workstationId);
	const taskName =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_STARTUP_TASK_NAME || "").trim() ||
		`SuiteWatchdogAutoCADCollector-${workstationId}`;
	const checkTaskName =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_STARTUP_CHECK_TASK_NAME || "").trim() ||
		`SuiteWatchdogAutoCADCollectorCheck-${workstationId}`;
	const runKeyName =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_STARTUP_RUN_KEY_NAME || "").trim() ||
		taskName;
	const mutexName =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_STARTUP_MUTEX_NAME || "").trim() ||
		`Local\\SuiteWatchdogAutoCADCollectorDaemon-${slug}`;
	const checkScript =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_STARTUP_CHECK_SCRIPT || "").trim() ||
		path.join(
			REPO_ROOT,
			"scripts",
			"check-watchdog-autocad-collector-startup.ps1",
		);
	const stateJsonPath =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_STATE_PATH || "").trim() ||
		String(process.env.WATCHDOG_AUTOCAD_STATE_PATH || "").trim() ||
		defaultAutocadStatePath();
	const bufferDir =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_BUFFER_DIR || "").trim() ||
		String(process.env.WATCHDOG_AUTOCAD_BUFFER_DIR || "").trim() ||
		defaultAutocadBufferDir(collectorId);
	return {
		collectorId,
		configPath: toPosix(configPath),
		stateJsonPath: toPosix(stateJsonPath),
		bufferDir: toPosix(bufferDir),
		taskName,
		checkTaskName,
		runKeyName,
		mutexName,
		checkScript: toPosix(checkScript),
	};
}

function getWatchdogAutocadPluginContext() {
	const bundleRoot =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_PLUGIN_BUNDLE_ROOT || "").trim() ||
		defaultAutocadPluginBundleRoot();
	const checkScript =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_PLUGIN_CHECK_SCRIPT || "").trim() ||
		path.join(REPO_ROOT, "scripts", "check-watchdog-autocad-plugin.ps1");
	const readinessScript =
		String(process.env.SUITE_WATCHDOG_AUTOCAD_READINESS_CHECK_SCRIPT || "").trim() ||
		path.join(REPO_ROOT, "scripts", "check-watchdog-autocad-readiness.ps1");
	return {
		bundleRoot: toPosix(bundleRoot),
		checkScript: toPosix(checkScript),
		readinessScript: toPosix(readinessScript),
	};
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function pascalCase(value) {
	const cleaned = value.replace(/[^a-zA-Z0-9]+/g, " ").trim();
	if (!cleaned) return "Generated";
	return cleaned
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

function timestampForMigration(date = new Date()) {
	const y = String(date.getUTCFullYear());
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const d = String(date.getUTCDate()).padStart(2, "0");
	const hh = String(date.getUTCHours()).padStart(2, "0");
	const mm = String(date.getUTCMinutes()).padStart(2, "0");
	const ss = String(date.getUTCSeconds()).padStart(2, "0");
	return `${y}${m}${d}_${hh}${mm}${ss}`;
}

function resolveRepoPath(inputPath) {
	if (typeof inputPath !== "string" || !inputPath.trim()) {
		throw new Error("A non-empty repo path is required.");
	}
	const absPath = path.resolve(REPO_ROOT, inputPath);
	if (absPath !== REPO_ROOT && !absPath.startsWith(`${REPO_ROOT}${path.sep}`)) {
		throw new Error(`Path escapes repository root: ${inputPath}`);
	}
	return absPath;
}

async function exists(absPath) {
	try {
		await fs.access(absPath);
		return true;
	} catch {
		return false;
	}
}

async function statSafe(absPath) {
	try {
		return await fs.stat(absPath);
	} catch {
		return null;
	}
}

async function readJson(absPath) {
	const text = await fs.readFile(absPath, "utf8");
	return JSON.parse(text);
}

function trimOutput(text) {
	if (!text) return "";
	if (text.length <= MAX_OUTPUT_CHARS) return text;
	return text.slice(-MAX_OUTPUT_CHARS);
}

function formatCommand(command, args) {
	return [command, ...(args || [])].join(" ");
}

function runProcess(command, args = [], options = {}) {
	const {
		cwd = REPO_ROOT,
		env = process.env,
		timeoutMs = DEFAULT_TIMEOUT_MS,
	} = options;

	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;
		let settled = false;

		const timer = setTimeout(() => {
			timedOut = true;
			try {
				child.kill("SIGTERM");
			} catch {
				// ignore
			}
			setTimeout(() => {
				if (!settled) {
					try {
						child.kill("SIGKILL");
					} catch {
						// ignore
					}
				}
			}, 1200);
		}, timeoutMs);

		child.stdout.on("data", (chunk) => {
			stdout = trimOutput(stdout + chunk.toString("utf8"));
		});
		child.stderr.on("data", (chunk) => {
			stderr = trimOutput(stderr + chunk.toString("utf8"));
		});

		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({
				ok: false,
				code: null,
				timedOut,
				stdout,
				stderr: trimOutput(`${stderr}\n${String(error.message || error)}`),
				command: formatCommand(command, args),
			});
		});

		child.on("close", (code, signal) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({
				ok: code === 0 && !timedOut,
				code,
				signal,
				timedOut,
				stdout,
				stderr,
				command: formatCommand(command, args),
			});
		});
	});
}

async function commandExists(command) {
	// Cross-platform existence check: if spawn resolves to a process at all,
	// runProcess returns a numeric exit code instead of null.
	const result = await runProcess(command, ["--version"], { timeoutMs: 4000 });
	return result.code !== null;
}

async function walkFiles(rootAbsPath, maxDepth = 20) {
	const out = [];
	const stack = [{ abs: rootAbsPath, depth: 0 }];
	const skipDirNames = new Set([
		".git",
		"node_modules",
		"dist",
		"build",
		"coverage",
		"target",
		".next",
		".turbo",
		".venv",
		"venv",
		"__pycache__",
	]);

	while (stack.length) {
		const current = stack.pop();
		if (!current) continue;
		let entries = [];
		try {
			entries = await fs.readdir(current.abs, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const child = path.join(current.abs, entry.name);
			if (entry.isDirectory()) {
				if (skipDirNames.has(entry.name)) continue;
				if (current.depth < maxDepth) {
					stack.push({ abs: child, depth: current.depth + 1 });
				}
				continue;
			}
			if (entry.isFile()) out.push(child);
		}
	}

	return out;
}

async function findSlnFiles() {
	const files = await walkFiles(REPO_ROOT, 4);
	return files.filter((file) => file.endsWith(".sln"));
}

async function loadPackageJsonSafe() {
	const packagePath = path.join(REPO_ROOT, "package.json");
	if (!(await exists(packagePath))) return null;
	try {
		return await readJson(packagePath);
	} catch {
		return null;
	}
}

function normalizePathList(value) {
	if (!value) return ["src", "backend", "docs"];
	if (Array.isArray(value)) {
		return value
			.filter((item) => typeof item === "string")
			.map((item) => item.trim())
			.filter(Boolean);
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? [trimmed] : ["src", "backend", "docs"];
	}
	return ["src", "backend", "docs"];
}

function parseSchemaArg(schemaArg) {
	if (!schemaArg) return null;
	if (typeof schemaArg === "string") {
		try {
			return JSON.parse(schemaArg);
		} catch {
			return { raw: schemaArg };
		}
	}
	if (typeof schemaArg === "object") return schemaArg;
	return null;
}

function summarizeResult(result) {
	const lines = [];
	lines.push(`Command: ${result.command}`);
	lines.push(
		`Exit: ${String(result.code)}${result.timedOut ? " (timed out)" : ""}`,
	);
	if (result.stdout?.trim()) {
		lines.push("\nstdout:\n" + result.stdout.trim());
	}
	if (result.stderr?.trim()) {
		lines.push("\nstderr:\n" + result.stderr.trim());
	}
	return lines.join("\n");
}

async function toolRunTests(args = {}) {
	const runner = String(args.runner || "auto").toLowerCase();
	const target = typeof args.target === "string" ? args.target.trim() : "";
	const pkg = await loadPackageJsonSafe();

	let selectedRunner = runner;
	if (selectedRunner === "auto") {
		if (pkg?.scripts?.test) {
			selectedRunner = "npm";
		} else if (
			(await exists(path.join(REPO_ROOT, "pytest.ini"))) ||
			(await exists(path.join(REPO_ROOT, "tests"))) ||
			(await exists(path.join(REPO_ROOT, "backend/tests")))
		) {
			selectedRunner = "pytest";
		} else {
			const slnFiles = await findSlnFiles();
			if (slnFiles.length > 0) {
				selectedRunner = "dotnet";
			} else {
				throw new Error(
					"No test runner detected. Add a test script to package.json, pytest config, or a .sln file.",
				);
			}
		}
	}

	if (!["npm", "pytest", "dotnet"].includes(selectedRunner)) {
		throw new Error(`Unsupported runner: ${selectedRunner}`);
	}

	let result;
	if (selectedRunner === "npm") {
		const commandArgs = ["run", "test"];
		if (target) commandArgs.push("--", target);
		result = await runProcess("npm", commandArgs, { timeoutMs: 180_000 });
	} else if (selectedRunner === "pytest") {
		const commandArgs = ["-m", "pytest"];
		if (target) commandArgs.push(target);
		result = await runProcess("python", commandArgs, { timeoutMs: 180_000 });
	} else {
		const commandArgs = ["test"];
		if (target) commandArgs.push(target);
		result = await runProcess("dotnet", commandArgs, { timeoutMs: 240_000 });
	}

	return createTextResult(
		`Runner: ${selectedRunner}\n${summarizeResult(result)}`,
		!result.ok,
	);
}

async function toolRunTypecheck(args = {}) {
	const scope = String(args.scope || "frontend").toLowerCase();
	const allowed = new Set(["frontend", "backend", "all"]);
	if (!allowed.has(scope)) {
		throw new Error("scope must be one of: frontend, backend, all");
	}

	const results = [];
	if (scope === "frontend" || scope === "all") {
		results.push(
			await runProcess("npm", ["run", "typecheck"], { timeoutMs: 180_000 }),
		);
	}
	if (scope === "backend" || scope === "all") {
		results.push(
			await runProcess("python", ["-m", "compileall", "-q", "backend"], {
				timeoutMs: 120_000,
			}),
		);
	}

	const ok = results.every((result) => result.ok);
	const body = results
		.map((result, index) => `# Task ${index + 1}\n${summarizeResult(result)}`)
		.join("\n\n");
	return createTextResult(body, !ok);
}

async function toolRunLintFix(args = {}) {
	const scopeArg = args.scope;
	const scopes = normalizePathList(scopeArg);
	const result = await runProcess(
		"npx",
		["biome", "check", "--write", ...scopes],
		{ timeoutMs: 240_000 },
	);
	return createTextResult(summarizeResult(result), !result.ok);
}

async function runSearch({
	pattern,
	paths: searchPaths,
	caseSensitive,
	maxResults,
}) {
	const paths = normalizePathList(searchPaths);
	const max = Math.max(1, Math.min(Number(maxResults) || 200, 2000));

	for (const pathValue of paths) {
		resolveRepoPath(pathValue);
	}

	if (cachedHasRipgrep === null) {
		cachedHasRipgrep = await commandExists("rg");
	}
	const hasRipgrep = cachedHasRipgrep;
	if (hasRipgrep) {
		const args = ["-n", "--no-heading", "--color", "never"];
		if (!caseSensitive) args.push("-i");
		args.push("--", pattern, ...paths);
		const result = await runProcess("rg", args, { timeoutMs: 90_000 });

		const noMatch =
			result.code === 1 && !result.stdout.trim() && !result.stderr.trim();
		if (noMatch) {
			return createTextResult(`No matches found for pattern: ${pattern}`);
		}

		const lines = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, max);
		const truncated = lines.length >= max;
		const text = [
			`Pattern: ${pattern}`,
			`Paths: ${paths.join(", ")}`,
			`Matches: ${lines.length}${truncated ? "+" : ""}`,
			"",
			...lines,
		].join("\n");

		const isError = !(result.ok || noMatch || result.code === 1);
		return createTextResult(text, isError);
	}

	let regex;
	try {
		regex = new RegExp(pattern, caseSensitive ? "" : "i");
	} catch (error) {
		throw new Error(
			`Invalid regex pattern: ${String(error?.message || error)}`,
		);
	}

	const matchingLines = [];
	const seenFiles = new Set();
	for (const pathValue of paths) {
		const rootAbsPath = resolveRepoPath(pathValue);
		const rootStat = await statSafe(rootAbsPath);
		if (!rootStat) continue;

		const filesToSearch = rootStat.isDirectory()
			? await walkFiles(rootAbsPath, 20)
			: [rootAbsPath];

		for (const fileAbsPath of filesToSearch) {
			if (matchingLines.length >= max) break;
			if (seenFiles.has(fileAbsPath)) continue;
			seenFiles.add(fileAbsPath);

			const fileStat = await statSafe(fileAbsPath);
			if (!fileStat?.isFile()) continue;

			let sourceText = "";
			try {
				sourceText = await fs.readFile(fileAbsPath, "utf8");
			} catch {
				continue;
			}

			const sourceLines = sourceText.split(/\r?\n/);
			for (let index = 0; index < sourceLines.length; index += 1) {
				regex.lastIndex = 0;
				if (!regex.test(sourceLines[index])) continue;
				matchingLines.push(
					`${repoRelative(fileAbsPath)}:${index + 1}:${sourceLines[index]}`,
				);
				if (matchingLines.length >= max) break;
			}
		}

		if (matchingLines.length >= max) break;
	}

	if (matchingLines.length === 0) {
		return createTextResult(`No matches found for pattern: ${pattern}`);
	}

	const truncated = matchingLines.length >= max;
	const text = [
		`Pattern: ${pattern}`,
		`Paths: ${paths.join(", ")}`,
		`Matches: ${matchingLines.length}${truncated ? "+" : ""}`,
		"",
		...matchingLines,
	].join("\n");
	return createTextResult(text);
}

async function toolSearch(args = {}) {
	const pattern = typeof args.pattern === "string" ? args.pattern : "";
	if (!pattern.trim()) throw new Error("pattern is required");

	return runSearch({
		pattern,
		paths: args.paths,
		caseSensitive: Boolean(args.case_sensitive),
		maxResults: args.max_results,
	});
}

async function toolFindSymbolUsages(args = {}) {
	const symbol = typeof args.symbol === "string" ? args.symbol.trim() : "";
	if (!symbol) throw new Error("symbol is required");
	const pattern = `\\b${escapeRegExp(symbol)}\\b`;
	return runSearch({
		pattern,
		paths: args.paths,
		caseSensitive: Boolean(args.case_sensitive),
		maxResults: args.max_results,
	});
}

function extractImports(sourceText) {
	const imports = new Set();
	const patterns = [
		/\bimport\s+(?:type\s+)?(?:[^"']*?\sfrom\s*)?["']([^"']+)["']/g,
		/\bexport\s+[^"']*?\sfrom\s*["']([^"']+)["']/g,
		/\bimport\(\s*["']([^"']+)["']\s*\)/g,
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(sourceText)) !== null) {
			imports.add(match[1]);
		}
	}
	return [...imports];
}

async function resolveImportSpecifier(fromAbsPath, specifier) {
	if (!specifier) return null;

	let baseAbs;
	if (specifier.startsWith("@/")) {
		baseAbs = path.resolve(REPO_ROOT, "src", specifier.slice(2));
	} else if (specifier.startsWith(".")) {
		baseAbs = path.resolve(path.dirname(fromAbsPath), specifier);
	} else {
		return { type: "external", value: specifier };
	}

	const stat = await statSafe(baseAbs);
	if (stat?.isFile()) return { type: "local", value: baseAbs };

	if (stat?.isDirectory()) {
		for (const ext of SOURCE_EXTENSIONS) {
			const indexCandidate = path.join(baseAbs, `index${ext}`);
			if (await exists(indexCandidate)) {
				return { type: "local", value: indexCandidate };
			}
		}
	}

	for (const ext of SOURCE_EXTENSIONS) {
		const candidate = `${baseAbs}${ext}`;
		if (await exists(candidate)) {
			return { type: "local", value: candidate };
		}
	}

	return { type: "unresolved", value: specifier };
}

async function toolDependencyGraph(args = {}) {
	const entry = typeof args.entry === "string" ? args.entry.trim() : "";
	if (!entry) throw new Error("entry is required (repo-relative path)");

	const maxDepth = Math.max(1, Math.min(Number(args.max_depth) || 4, 12));
	const entryAbs = resolveRepoPath(entry);
	if (!(await exists(entryAbs))) {
		throw new Error(`entry file does not exist: ${entry}`);
	}

	const visited = new Set();
	const edges = [];
	const externalDeps = new Map();
	const unresolvedDeps = new Map();
	const queue = [{ absPath: entryAbs, depth: 0 }];

	while (queue.length) {
		const current = queue.shift();
		if (!current) continue;
		const key = current.absPath;
		if (visited.has(key)) continue;
		visited.add(key);

		if (current.depth >= maxDepth) continue;
		let source = "";
		try {
			source = await fs.readFile(current.absPath, "utf8");
		} catch {
			continue;
		}

		const imports = extractImports(source);
		for (const specifier of imports) {
			const resolved = await resolveImportSpecifier(current.absPath, specifier);
			if (!resolved) continue;
			if (resolved.type === "local") {
				edges.push({
					from: repoRelative(current.absPath),
					to: repoRelative(resolved.value),
				});
				if (!visited.has(resolved.value)) {
					queue.push({ absPath: resolved.value, depth: current.depth + 1 });
				}
			} else if (resolved.type === "external") {
				externalDeps.set(specifier, (externalDeps.get(specifier) || 0) + 1);
			} else {
				unresolvedDeps.set(specifier, (unresolvedDeps.get(specifier) || 0) + 1);
			}
		}
	}

	const uniqueEdges = [];
	const seenEdge = new Set();
	for (const edge of edges) {
		const key = `${edge.from}->${edge.to}`;
		if (seenEdge.has(key)) continue;
		seenEdge.add(key);
		uniqueEdges.push(edge);
	}

	const nodeIdMap = new Map();
	let nextId = 1;
	const toNodeId = (name) => {
		if (!nodeIdMap.has(name)) {
			nodeIdMap.set(name, `N${nextId++}`);
		}
		return nodeIdMap.get(name);
	};

	const mermaidLines = ["graph TD"];
	for (const edge of uniqueEdges) {
		const fromId = toNodeId(edge.from);
		const toId = toNodeId(edge.to);
		mermaidLines.push(`  ${fromId}["${edge.from}"] --> ${toId}["${edge.to}"]`);
	}

	const external = [...externalDeps.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 40)
		.map(([name, count]) => `- ${name} (${count})`);
	const unresolved = [...unresolvedDeps.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 40)
		.map(([name, count]) => `- ${name} (${count})`);

	const text = [
		`Entry: ${entry}`,
		`Visited nodes: ${visited.size}`,
		`Internal edges: ${uniqueEdges.length}`,
		`External imports: ${externalDeps.size}`,
		`Unresolved imports: ${unresolvedDeps.size}`,
		"",
		"Mermaid graph:",
		"```mermaid",
		...mermaidLines,
		"```",
		"",
		"Top external imports:",
		external.length ? external.join("\n") : "- none",
		"",
		"Top unresolved imports:",
		unresolved.length ? unresolved.join("\n") : "- none",
	].join("\n");

	return createTextResult(text);
}

function componentTemplate(componentName, variant) {
	const bodyByVariant = {
		panel: `<FrameSection title={title} subtitle="Generated panel component">
			<div className="rounded-lg border px-3 py-2 text-sm" style={{
				borderColor: hexToRgba(palette.primary, 0.18),
				background: hexToRgba(palette.surfaceLight, 0.18),
				color: palette.textMuted,
			}}>
				Panel body
			</div>
		</FrameSection>`,
		card: `<div className="rounded-2xl border p-4" style={{
			borderColor: hexToRgba(palette.primary, 0.2),
			background: hexToRgba(palette.surface, 0.55),
		}}>
			<div className="text-sm font-semibold" style={{ color: palette.text }}>{title}</div>
			<div className="mt-1 text-xs" style={{ color: palette.textMuted }}>Generated card content.</div>
		</div>`,
		form: `<FrameSection title={title} subtitle="Generated form scaffold">
			<form className="grid gap-2">
				<input className="rounded-lg border px-3 py-2 text-sm" placeholder="Field" />
				<button type="button" className="rounded-lg border px-3 py-2 text-sm">Submit</button>
			</form>
		</FrameSection>`,
		list: `<FrameSection title={title} subtitle="Generated list scaffold">
			<ul className="list-disc pl-5 text-sm" style={{ color: palette.textMuted }}>
				<li>Item one</li>
				<li>Item two</li>
			</ul>
		</FrameSection>`,
	};

	const selectedBody = bodyByVariant[variant] || bodyByVariant.panel;

	return `import { FrameSection } from "@/components/apps/ui/PageFrame";
import { hexToRgba, useTheme } from "@/lib/palette";

export interface ${componentName}Props {
	title?: string;
}

export function ${componentName}({ title = "${componentName}" }: ${componentName}Props) {
	const { palette } = useTheme();

	return (
		${selectedBody}
	);
}

export default ${componentName};
`;
}

async function toolGenerateComponent(args = {}) {
	const rawName = typeof args.name === "string" ? args.name.trim() : "";
	if (!rawName) throw new Error("name is required");

	const componentName = pascalCase(rawName);
	const variant = String(args.variant || "panel").toLowerCase();
	const baseDir =
		typeof args.directory === "string" && args.directory.trim()
			? args.directory.trim()
			: "src/components/apps/generated";
	const force = Boolean(args.force);

	const targetDirAbs = resolveRepoPath(baseDir);
	await fs.mkdir(targetDirAbs, { recursive: true });

	const fileAbs = path.join(targetDirAbs, `${componentName}.tsx`);
	if ((await exists(fileAbs)) && !force) {
		throw new Error(
			`Component already exists: ${repoRelative(fileAbs)} (pass force=true to overwrite).`,
		);
	}

	const content = componentTemplate(componentName, variant);
	await fs.writeFile(fileAbs, content, "utf8");

	return createTextResult(
		`Generated component: ${repoRelative(fileAbs)}\nVariant: ${variant}`,
	);
}

function routeAppTemplate(name, slug, schema) {
	const schemaBlock = schema
		? `const DEFAULT_SCHEMA = ${JSON.stringify(schema, null, 2)} as const;\n`
		: "";
	const schemaView = schema
		? `<pre className="mt-2 overflow-x-auto rounded-md border p-2 text-xs" style={{
			borderColor: hexToRgba(palette.primary, 0.14),
			background: hexToRgba(palette.background, 0.5),
			color: palette.textMuted,
		}}>{JSON.stringify(DEFAULT_SCHEMA, null, 2)}</pre>`
		: `<p className="text-sm" style={{ color: palette.textMuted }}>Route scaffold for <code>${slug}</code>.</p>`;

	return `import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";
import { hexToRgba, useTheme } from "@/lib/palette";

${schemaBlock}export function ${name}App() {
	const { palette } = useTheme();

	return (
		<PageFrame title="${name}" subtitle="Generated protected app route scaffold.">
			<FrameSection title="Overview">
				${schemaView}
			</FrameSection>
		</PageFrame>
	);
}

export default ${name}App;
`;
}

function protectedRouteTemplate(name, slug) {
	return `import { ${name}App } from "@/components/apps/${slug}/${name}App";

export default function ${name}RoutePage() {
	return <${name}App />;
}
`;
}

function publicRouteTemplate(name, schema) {
	const schemaBlock = schema
		? `const DEFAULT_SCHEMA = ${JSON.stringify(schema, null, 2)} as const;\n`
		: "";
	const schemaView = schema
		? `<pre className="mt-2 overflow-x-auto rounded-md border p-2 text-xs" style={{ color: "var(--text-muted)" }}>{JSON.stringify(DEFAULT_SCHEMA, null, 2)}</pre>`
		: `<p className="text-sm" style={{ color: "var(--text-muted)" }}>Public route scaffold.</p>`;

	return `import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";

${schemaBlock}export default function ${name}Page() {
	return (
		<PageFrame title="${name}" subtitle="Generated public route scaffold.">
			<FrameSection title="Overview">
				${schemaView}
			</FrameSection>
		</PageFrame>
	);
}
`;
}

async function toolGenerateRoute(args = {}) {
	const rawName = typeof args.name === "string" ? args.name.trim() : "";
	if (!rawName) throw new Error("name is required");

	const name = pascalCase(rawName);
	const routeSlug = slugify(rawName) || slugify(name);
	const authPolicy = String(args.auth_policy || "protected").toLowerCase();
	if (!["protected", "public"].includes(authPolicy)) {
		throw new Error("auth_policy must be either 'protected' or 'public'");
	}

	const schema = parseSchemaArg(args.schema);
	const force = Boolean(args.force);
	const created = [];

	if (authPolicy === "protected") {
		const componentDirAbs = resolveRepoPath(`src/components/apps/${routeSlug}`);
		const routeDirAbs = resolveRepoPath(`src/routes/apps/${routeSlug}`);
		await fs.mkdir(componentDirAbs, { recursive: true });
		await fs.mkdir(routeDirAbs, { recursive: true });

		const appFileAbs = path.join(componentDirAbs, `${name}App.tsx`);
		const routeFileAbs = path.join(routeDirAbs, `${name}RoutePage.tsx`);

		if (
			!force &&
			((await exists(appFileAbs)) || (await exists(routeFileAbs)))
		) {
			throw new Error(
				`Route files already exist for ${name}. Pass force=true to overwrite.`,
			);
		}

		await fs.writeFile(
			appFileAbs,
			routeAppTemplate(name, routeSlug, schema),
			"utf8",
		);
		await fs.writeFile(
			routeFileAbs,
			protectedRouteTemplate(name, routeSlug),
			"utf8",
		);
		created.push(repoRelative(appFileAbs), repoRelative(routeFileAbs));
	} else {
		const routeFileAbs = resolveRepoPath(`src/routes/${name}Page.tsx`);
		if (!force && (await exists(routeFileAbs))) {
			throw new Error(
				`Route file already exists: ${repoRelative(routeFileAbs)} (pass force=true).`,
			);
		}
		await fs.writeFile(routeFileAbs, publicRouteTemplate(name, schema), "utf8");
		created.push(repoRelative(routeFileAbs));
	}

	const registrationHint =
		authPolicy === "protected"
			? `Add route registration in src/App.tsx under /app, for example: path="apps/${routeSlug}" -> <${name}RoutePage />`
			: `Add public route registration in src/App.tsx, for example: path="/${routeSlug}" -> <${name}Page />`;

	return createTextResult(
		`Generated route scaffold (${authPolicy}):\n- ${created.join("\n- ")}\n\nNext step: ${registrationHint}`,
	);
}

async function toolGenerateDbMigration(args = {}) {
	const rawName = typeof args.name === "string" ? args.name.trim() : "";
	if (!rawName) throw new Error("name is required");

	const slug = slugify(rawName);
	if (!slug)
		throw new Error("name must contain at least one alphanumeric character");

	const migrationsDirAbs = resolveRepoPath("supabase/migrations");
	await fs.mkdir(migrationsDirAbs, { recursive: true });
	const timestamp = timestampForMigration();
	const fileAbs = path.join(migrationsDirAbs, `${timestamp}_${slug}.sql`);
	if (await exists(fileAbs)) {
		throw new Error(`Migration already exists: ${repoRelative(fileAbs)}`);
	}

	const sql = `-- Migration: ${rawName}\n-- Generated: ${new Date().toISOString()}\n\nBEGIN;\n\n-- TODO: add schema changes\n-- Example:\n-- ALTER TABLE public.projects ADD COLUMN example text;\n\nCOMMIT;\n`;
	await fs.writeFile(fileAbs, sql, "utf8");

	return createTextResult(`Generated migration: ${repoRelative(fileAbs)}`);
}

function buildTsLoggerCall(eventName, level, fields, context) {
	const normalizedLevel = ["debug", "info", "warn", "error"].includes(level)
		? level
		: "info";
	const payload = JSON.stringify(fields || {}, null, 2);
	return `logger.${normalizedLevel}("${eventName}", "${context}", ${payload});`;
}

function injectTsLoggerImport(sourceText) {
	if (
		sourceText.includes('from "@/lib/logger"') ||
		sourceText.includes("from '@/lib/logger'")
	) {
		return sourceText;
	}

	const importMatches = [...sourceText.matchAll(/^import .*;$/gm)];
	if (importMatches.length === 0) {
		return `import { logger } from "@/lib/logger";\n${sourceText}`;
	}

	const last = importMatches.at(-1);
	if (!last || typeof last.index !== "number") return sourceText;
	const insertionPoint = last.index + last[0].length;
	return `${sourceText.slice(0, insertionPoint)}\nimport { logger } from "@/lib/logger";${sourceText.slice(insertionPoint)}`;
}

function insertAfterMarker(sourceText, marker, insertionText) {
	const markerIndex = sourceText.indexOf(marker);
	if (markerIndex === -1) return null;
	const lineEnd = sourceText.indexOf("\n", markerIndex);
	if (lineEnd === -1) {
		return `${sourceText}\n${insertionText}`;
	}
	return `${sourceText.slice(0, lineEnd + 1)}${insertionText}\n${sourceText.slice(lineEnd + 1)}`;
}

async function toolAddStructuredLog(args = {}) {
	const filePath = typeof args.file === "string" ? args.file.trim() : "";
	const eventName =
		typeof args.event_name === "string" ? args.event_name.trim() : "";
	if (!filePath) throw new Error("file is required");
	if (!eventName) throw new Error("event_name is required");

	const level =
		typeof args.level === "string" ? args.level.trim().toLowerCase() : "info";
	const context =
		typeof args.context === "string" ? args.context.trim() : "MCP";
	const fields =
		typeof args.fields === "object" && args.fields ? args.fields : {};
	const marker = typeof args.insert_after === "string" ? args.insert_after : "";

	const fileAbs = resolveRepoPath(filePath);
	if (!(await exists(fileAbs))) {
		throw new Error(`file not found: ${filePath}`);
	}

	const ext = path.extname(fileAbs).toLowerCase();
	const sourceText = await fs.readFile(fileAbs, "utf8");

	if (!marker) {
		if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
			const snippet = buildTsLoggerCall(eventName, level, fields, context);
			return createTextResult(
				`No insert_after marker provided. Suggested snippet:\n\n${snippet}\n\nFile unchanged.`,
			);
		}
		const pySnippet = `logger.${level}("event=${eventName} fields=%s", ${JSON.stringify(fields)})`;
		return createTextResult(
			`No insert_after marker provided. Suggested snippet:\n\n${pySnippet}\n\nFile unchanged.`,
		);
	}

	if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
		let nextSource = injectTsLoggerImport(sourceText);
		const call = buildTsLoggerCall(eventName, level, fields, context);
		const inserted = insertAfterMarker(nextSource, marker, call);
		if (!inserted) {
			throw new Error(`insert_after marker not found: ${marker}`);
		}
		nextSource = inserted;
		await fs.writeFile(fileAbs, nextSource, "utf8");
		return createTextResult(`Added structured log to ${filePath}`);
	}

	if (ext === ".py") {
		const call = `logger.${level}("event=${eventName} fields=%s", ${JSON.stringify(fields)})`;
		const inserted = insertAfterMarker(sourceText, marker, call);
		if (!inserted) {
			throw new Error(`insert_after marker not found: ${marker}`);
		}
		await fs.writeFile(fileAbs, inserted, "utf8");
		return createTextResult(`Added structured log to ${filePath}`);
	}

	throw new Error(`Unsupported file type for structured logging: ${ext}`);
}

async function toolAddErrorBoundary(args = {}) {
	const pagePath = typeof args.page === "string" ? args.page.trim() : "";
	if (!pagePath) throw new Error("page is required");

	const pageAbs = resolveRepoPath(pagePath);
	if (!(await exists(pageAbs))) {
		throw new Error(`page file not found: ${pagePath}`);
	}
	if (!pageAbs.endsWith(".tsx")) {
		throw new Error("page must be a .tsx file");
	}

	const force = Boolean(args.force);
	const baseName = path.basename(pageAbs, ".tsx");
	const wrapperName = `${baseName}WithErrorBoundary`;
	const wrapperFileAbs = path.join(path.dirname(pageAbs), `${wrapperName}.tsx`);
	if ((await exists(wrapperFileAbs)) && !force) {
		throw new Error(
			`Wrapper already exists: ${repoRelative(wrapperFileAbs)} (pass force=true to overwrite).`,
		);
	}

	const wrapperContent = `import { ErrorBoundary } from "@/components/notification-system/ErrorBoundary";
import Page from "./${baseName}";

export default function ${wrapperName}() {
	return (
		<ErrorBoundary>
			<Page />
		</ErrorBoundary>
	);
}
`;

	await fs.writeFile(wrapperFileAbs, wrapperContent, "utf8");
	return createTextResult(
		`Generated error-boundary wrapper: ${repoRelative(wrapperFileAbs)}\nUse this wrapper in route registration to protect ${pagePath}.`,
	);
}

async function ensureApiErrorHelperFile() {
	const helperAbs = resolveRepoPath("backend/api_error_helpers.py");
	if (await exists(helperAbs)) return helperAbs;

	const content = `from functools import wraps
import logging
from flask import jsonify

logger = logging.getLogger(__name__)


def api_error_wrapper(route_name: str):
	def decorator(func):
		@wraps(func)
		def wrapped(*args, **kwargs):
			try:
				return func(*args, **kwargs)
			except ValueError as exc:
				return jsonify({"success": False, "error": str(exc), "route": route_name}), 400
			except Exception as exc:
				logger.exception("Unhandled API error in %s", route_name)
				return jsonify({"success": False, "error": str(exc), "route": route_name}), 500
		return wrapped
	return decorator
`;
	await fs.writeFile(helperAbs, content, "utf8");
	return helperAbs;
}

function insertImportIfMissing(sourceText, importLine) {
	if (sourceText.includes(importLine)) return sourceText;
	const importPattern = /^(?:from\s+.+\s+import\s+.+|import\s+.+)$/gm;
	const matches = [...sourceText.matchAll(importPattern)];
	if (matches.length === 0) {
		return `${importLine}\n${sourceText}`;
	}
	const last = matches.at(-1);
	if (!last || typeof last.index !== "number") return sourceText;
	const insertPos = last.index + last[0].length;
	return `${sourceText.slice(0, insertPos)}\n${importLine}${sourceText.slice(insertPos)}`;
}

function addDecoratorToFunction(sourceText, functionName, decoratorLine) {
	const defRegex = new RegExp(
		`^def\\s+${escapeRegExp(functionName)}\\s*\\(`,
		"m",
	);
	const defMatch = defRegex.exec(sourceText);
	if (!defMatch || typeof defMatch.index !== "number") {
		throw new Error(`Could not locate function: ${functionName}`);
	}

	const startOfDef = defMatch.index;
	const beforeDef = sourceText.slice(0, startOfDef);
	const lines = beforeDef.split("\n");

	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();
		if (!line) continue;
		if (!line.startsWith("@")) break;
		if (line === decoratorLine.trim()) {
			return sourceText;
		}
	}

	return `${beforeDef}${decoratorLine}\n${sourceText.slice(startOfDef)}`;
}

async function toolAddApiErrorWrapper(args = {}) {
	const route = typeof args.route === "string" ? args.route.trim() : "";
	if (!route) throw new Error("route is required (function name)");

	const file =
		typeof args.file === "string" && args.file.trim()
			? args.file.trim()
			: "backend/api_server.py";
	const fileAbs = resolveRepoPath(file);
	if (!(await exists(fileAbs))) {
		throw new Error(`target file not found: ${file}`);
	}

	await ensureApiErrorHelperFile();
	let sourceText = await fs.readFile(fileAbs, "utf8");
	sourceText = insertImportIfMissing(
		sourceText,
		"from api_error_helpers import api_error_wrapper",
	);
	sourceText = addDecoratorToFunction(
		sourceText,
		route,
		`@api_error_wrapper("${route}")`,
	);
	await fs.writeFile(fileAbs, sourceText, "utf8");

	return createTextResult(
		`Added @api_error_wrapper("${route}") to ${file}.\nHelper file ensured at backend/api_error_helpers.py.`,
	);
}

async function toolCheckWatchdogBackendStartup(args = {}) {
	if (process.platform !== "win32") {
		return createTextResult(
			"Watchdog backend startup checks are only available on Windows workstations.",
		);
	}

	const startup = getWatchdogBackendStartupContext();
	const codexConfigPath = path.join(os.homedir(), ".codex", "config.toml");
	const checkScriptCandidate = path.normalize(startup.checkScript);
	const checkScriptAbs = path.isAbsolute(checkScriptCandidate)
		? checkScriptCandidate
		: resolveRepoPath(checkScriptCandidate);

	if (!(await exists(checkScriptAbs))) {
		return createTextResult(
			`Startup check script was not found: ${toPosix(checkScriptAbs)}`,
			true,
		);
	}

	const psArgs = [
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		checkScriptAbs,
		"-CodexConfigPath",
		codexConfigPath,
		"-WorkstationId",
		startup.workstationId,
		"-Json",
	];
	if (args && args.start_if_missing === true) {
		psArgs.push("-StartIfMissing");
	}

	const result = await runProcess("PowerShell.exe", psArgs, {
		timeoutMs: 30_000,
	});
	const output = (result.stdout || result.stderr || "").trim();
	if (!result.ok) {
		return createTextResult(
			[
				`Command: ${result.command}`,
				`Exit: ${result.code ?? "unknown"}`,
				output || "Backend startup check failed with no output.",
			].join("\n"),
			true,
		);
	}

	return createTextResult(
		output ||
			JSON.stringify(
				{
					ok: true,
					workstationId: startup.workstationId,
				},
				null,
				2,
			),
	);
}

async function toolGetWorkstationContext() {
	return createTextResult(formatWorkstationContext());
}

async function toolCheckWatchdogCollectorStartup(args = {}) {
	if (process.platform !== "win32") {
		return createTextResult(
			"Watchdog collector startup checks are only available on Windows workstations.",
		);
	}

	const startup = getWatchdogStartupContext();
	const codexConfigPath = path.join(os.homedir(), ".codex", "config.toml");
	const checkScriptCandidate = path.normalize(startup.checkScript);
	const configPath = path.normalize(startup.configPath);
	const checkScriptAbs = path.isAbsolute(checkScriptCandidate)
		? checkScriptCandidate
		: resolveRepoPath(checkScriptCandidate);

	if (!(await exists(checkScriptAbs))) {
		return createTextResult(
			`Startup check script was not found: ${toPosix(checkScriptAbs)}`,
			true,
		);
	}

	const psArgs = [
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		checkScriptAbs,
		"-ConfigPath",
		configPath,
		"-CodexConfigPath",
		codexConfigPath,
		"-TaskName",
		startup.taskName,
		"-CheckTaskName",
		startup.checkTaskName,
		"-RunKeyName",
		startup.runKeyName,
		"-MutexName",
		startup.mutexName,
		"-Json",
	];
	if (args && args.start_if_missing === true) {
		psArgs.push("-StartIfMissing");
	}

	const result = await runProcess("PowerShell.exe", psArgs, {
		timeoutMs: 30_000,
	});
	const output = (result.stdout || result.stderr || "").trim();
	if (!result.ok) {
		return createTextResult(
			[
				`Command: ${result.command}`,
				`Exit: ${result.code ?? "unknown"}`,
				output || "Startup check failed with no output.",
			].join("\n"),
			true,
		);
	}

	return createTextResult(
		output ||
			JSON.stringify(
				{
					ok: true,
					workstationId: getWorkstationContext().workstationId,
				},
				null,
				2,
			),
	);
}

async function toolCheckWatchdogAutocadCollectorStartup(args = {}) {
	if (process.platform !== "win32") {
		return createTextResult(
			"Watchdog AutoCAD collector startup checks are only available on Windows workstations.",
		);
	}

	const startup = getWatchdogAutocadStartupContext();
	const codexConfigPath = path.join(os.homedir(), ".codex", "config.toml");
	const checkScriptCandidate = path.normalize(startup.checkScript);
	const configPath = path.normalize(startup.configPath);
	const checkScriptAbs = path.isAbsolute(checkScriptCandidate)
		? checkScriptCandidate
		: resolveRepoPath(checkScriptCandidate);

	if (!(await exists(checkScriptAbs))) {
		return createTextResult(
			`Startup check script was not found: ${toPosix(checkScriptAbs)}`,
			true,
		);
	}

	const psArgs = [
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		checkScriptAbs,
		"-ConfigPath",
		configPath,
		"-CodexConfigPath",
		codexConfigPath,
		"-TaskName",
		startup.taskName,
		"-CheckTaskName",
		startup.checkTaskName,
		"-RunKeyName",
		startup.runKeyName,
		"-MutexName",
		startup.mutexName,
		"-Json",
	];
	if (args && args.start_if_missing === true) {
		psArgs.push("-StartIfMissing");
	}

	const result = await runProcess("PowerShell.exe", psArgs, {
		timeoutMs: 30_000,
	});
	const output = (result.stdout || result.stderr || "").trim();
	if (!result.ok) {
		return createTextResult(
			[
				`Command: ${result.command}`,
				`Exit: ${result.code ?? "unknown"}`,
				output || "Startup check failed with no output.",
			].join("\n"),
			true,
		);
	}

	return createTextResult(
		output ||
			JSON.stringify(
				{
					ok: true,
					workstationId: getWorkstationContext().workstationId,
					stateJsonPath: startup.stateJsonPath,
				},
				null,
				2,
			),
	);
}

async function toolCheckWatchdogAutocadPlugin() {
	if (process.platform !== "win32") {
		return createTextResult(
			"Watchdog AutoCAD plugin checks are only available on Windows workstations.",
		);
	}

	const plugin = getWatchdogAutocadPluginContext();
	const checkScriptCandidate = path.normalize(plugin.checkScript);
	const bundleRoot = path.normalize(plugin.bundleRoot);
	const checkScriptAbs = path.isAbsolute(checkScriptCandidate)
		? checkScriptCandidate
		: resolveRepoPath(checkScriptCandidate);

	if (!(await exists(checkScriptAbs))) {
		return createTextResult(
			`AutoCAD plugin check script was not found: ${toPosix(checkScriptAbs)}`,
			true,
		);
	}

	const result = await runProcess(
		"PowerShell.exe",
		[
			"-NoProfile",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			checkScriptAbs,
			"-BundleRoot",
			bundleRoot,
			"-Json",
		],
		{ timeoutMs: 30_000 },
	);
	const output = (result.stdout || result.stderr || "").trim();
	if (!result.ok) {
		return createTextResult(
			[
				`Command: ${result.command}`,
				`Exit: ${result.code ?? "unknown"}`,
				output || "AutoCAD plugin check failed with no output.",
			].join("\n"),
			true,
		);
	}

	return createTextResult(
		output ||
			JSON.stringify(
				{
					ok: true,
					bundleRoot: plugin.bundleRoot,
				},
				null,
				2,
			),
	);
}

async function toolCheckWatchdogAutocadReadiness(args = {}) {
	if (process.platform !== "win32") {
		return createTextResult(
			"Watchdog AutoCAD readiness checks are only available on Windows workstations.",
		);
	}

	const startup = getWatchdogAutocadStartupContext();
	const plugin = getWatchdogAutocadPluginContext();
	const codexConfigPath = path.join(os.homedir(), ".codex", "config.toml");
	const checkScriptCandidate = path.normalize(plugin.readinessScript);
	const configPath = path.normalize(startup.configPath);
	const bundleRoot = path.normalize(plugin.bundleRoot);
	const checkScriptAbs = path.isAbsolute(checkScriptCandidate)
		? checkScriptCandidate
		: resolveRepoPath(checkScriptCandidate);

	if (!(await exists(checkScriptAbs))) {
		return createTextResult(
			`AutoCAD readiness check script was not found: ${toPosix(checkScriptAbs)}`,
			true,
		);
	}

	const psArgs = [
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		checkScriptAbs,
		"-ConfigPath",
		configPath,
		"-BundleRoot",
		bundleRoot,
		"-CodexConfigPath",
		codexConfigPath,
		"-Json",
	];
	if (args && args.start_if_missing === true) {
		psArgs.push("-StartIfMissing");
	}

	const result = await runProcess("PowerShell.exe", psArgs, {
		timeoutMs: 30_000,
	});
	const output = (result.stdout || result.stderr || "").trim();
	if (!result.ok) {
		return createTextResult(
			[
				`Command: ${result.command}`,
				`Exit: ${result.code ?? "unknown"}`,
				output || "AutoCAD readiness check failed with no output.",
			].join("\n"),
			true,
		);
	}

	return createTextResult(
		output ||
			JSON.stringify(
				{
					ok: true,
					workstationId: getWorkstationContext().workstationId,
				},
				null,
				2,
			),
	);
}

async function runPowerShellJsonCheck({ scriptPath, args = [], timeoutMs = 30_000 }) {
	const checkScriptCandidate = path.normalize(scriptPath);
	const checkScriptAbs = path.isAbsolute(checkScriptCandidate)
		? checkScriptCandidate
		: resolveRepoPath(checkScriptCandidate);

	if (!(await exists(checkScriptAbs))) {
		return {
			ok: false,
			error: `Check script was not found: ${toPosix(checkScriptAbs)}`,
			output: "",
			data: null,
			command: null,
		};
	}

	const psArgs = [
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		checkScriptAbs,
		...args,
		"-Json",
	];
	const result = await runProcess("PowerShell.exe", psArgs, { timeoutMs });
	const output = (result.stdout || result.stderr || "").trim();
	if (!result.ok) {
		return {
			ok: false,
			error: [
				`Command: ${result.command}`,
				`Exit: ${result.code ?? "unknown"}`,
				output || "Check failed with no output.",
			].join("\n"),
			output,
			data: null,
			command: result.command,
		};
	}

	let data = null;
	try {
		data = JSON.parse(output);
	} catch (error) {
		return {
			ok: false,
			error: `Check output was not valid JSON: ${String(error?.message || error)}`,
			output,
			data: null,
			command: result.command,
		};
	}

	return {
		ok: true,
		error: null,
		output,
		data,
		command: result.command,
	};
}

function appendIssue(issues, recommendedActions, component, severity, message, action = null) {
	issues.push({ component, severity, message });
	if (action && !recommendedActions.includes(action)) {
		recommendedActions.push(action);
	}
}

async function toolCheckSuiteWorkstation(args = {}) {
	const workstation = getWorkstationContext();
	const codexConfigPath = path.join(os.homedir(), ".codex", "config.toml");
	const issues = [];
	const recommendedActions = [];

	const payload = {
		ok: false,
		workstation: {
			id: workstation.workstationId,
			label: workstation.workstationLabel,
			role: workstation.workstationRole,
			computerName: workstation.computerName,
			platform: workstation.platform,
			source: workstation.source,
			autodeskOfflineHelpRoot: workstation.autodeskOfflineHelpRoot,
			envStampedBy: workstation.envStampedBy,
		},
		backend: {
			ok: false,
			healthy: false,
			available: false,
			error: "Not checked.",
		},
		filesystemCollector: {
			ok: false,
			healthy: false,
			available: false,
			error: "Not checked.",
		},
		autocadCollector: {
			ok: false,
			healthy: false,
			available: false,
			error: "Not checked.",
		},
		autocadPlugin: {
			ok: false,
			healthy: false,
			available: false,
			error: "Not checked.",
		},
		autocadReadiness: {
			ok: false,
			healthy: false,
			available: false,
			error: "Not checked.",
		},
		issues,
		recommendedActions,
	};

	if (
		!workstation.envStampedBy ||
		!String(workstation.envStampedBy).includes("sync-suite-workstation-profile.ps1")
	) {
		appendIssue(
			issues,
			recommendedActions,
			"workstation",
			"warning",
			"MCP environment does not appear to be stamped by scripts/sync-suite-workstation-profile.ps1.",
			"Run `npm run workstation:sync` (or `scripts/sync-suite-workstation-profile.ps1`) and restart Codex.",
		);
	}

	if (process.platform !== "win32") {
		appendIssue(
			issues,
			recommendedActions,
			"workstation",
			"warning",
			"Watchdog startup and AutoCAD checks are only available on Windows workstations.",
			"Run this tool from the target Windows workstation for startup/readiness validation.",
		);
		payload.backend.error = "Unavailable on non-Windows workstation.";
		payload.filesystemCollector.error = "Unavailable on non-Windows workstation.";
		payload.autocadCollector.error = "Unavailable on non-Windows workstation.";
		payload.autocadPlugin.error = "Unavailable on non-Windows workstation.";
		payload.autocadReadiness.error = "Unavailable on non-Windows workstation.";
		payload.ok = false;
		return createTextResult(JSON.stringify(payload, null, 2));
	}

	const backendContext = getWatchdogBackendStartupContext(workstation);
	const filesystemContext = getWatchdogStartupContext(workstation);
	const autocadContext = getWatchdogAutocadStartupContext(workstation);
	const autocadPluginContext = getWatchdogAutocadPluginContext();
	const startIfMissing = args && args.start_if_missing === true;

	const backendResult = await runPowerShellJsonCheck({
		scriptPath: backendContext.checkScript,
		args: [
			"-CodexConfigPath",
			codexConfigPath,
			"-WorkstationId",
			backendContext.workstationId,
			...(startIfMissing ? ["-StartIfMissing"] : []),
		],
	});
	if (!backendResult.ok || !backendResult.data) {
		payload.backend = {
			ok: false,
			healthy: false,
			available: true,
			error: backendResult.error || "Backend startup check failed.",
		};
		appendIssue(
			issues,
			recommendedActions,
			"backend",
			"error",
			payload.backend.error,
			"Run `npm run watchdog:backend:startup:check` and fix backend startup issues.",
		);
	} else {
		const running = Boolean(backendResult.data.Running);
		payload.backend = {
			ok: running,
			healthy: running,
			available: true,
			workstationId: backendResult.data.Workstation || backendContext.workstationId,
			running,
			processId: backendResult.data.ProcessId ?? null,
			commandLine: backendResult.data.CommandLine ?? null,
			startAttempted: Boolean(backendResult.data.StartAttempted),
			error: backendResult.data.Error || null,
		};
		if (!payload.backend.healthy) {
			appendIssue(
				issues,
				recommendedActions,
				"backend",
				"error",
				payload.backend.error || "Backend process is not running.",
				"Run `npm run watchdog:backend:startup:check -- -StartIfMissing`.",
			);
		}
	}

	const filesystemResult = await runPowerShellJsonCheck({
		scriptPath: filesystemContext.checkScript,
		args: [
			"-ConfigPath",
			path.normalize(filesystemContext.configPath),
			"-CodexConfigPath",
			codexConfigPath,
			"-TaskName",
			filesystemContext.taskName,
			"-CheckTaskName",
			filesystemContext.checkTaskName,
			"-RunKeyName",
			filesystemContext.runKeyName,
			"-MutexName",
			filesystemContext.mutexName,
			...(startIfMissing ? ["-StartIfMissing"] : []),
		],
	});
	if (!filesystemResult.ok || !filesystemResult.data) {
		payload.filesystemCollector = {
			ok: false,
			healthy: false,
			available: true,
			error: filesystemResult.error || "Filesystem collector startup check failed.",
		};
		appendIssue(
			issues,
			recommendedActions,
			"filesystemCollector",
			"error",
			payload.filesystemCollector.error,
			"Run `npm run watchdog:startup:check` and resolve filesystem collector startup/configuration.",
		);
	} else {
		const data = filesystemResult.data;
		payload.filesystemCollector = {
			ok: Boolean(data.healthy),
			healthy: Boolean(data.healthy),
			available: true,
			workstationId: data.workstationId || workstation.workstationId,
			collectorId: data.collectorId || filesystemContext.collectorId,
			configPath: data.configPath || filesystemContext.configPath,
			startupMode: data.startupMode || "none",
			daemonRunning: Boolean(data.daemonRunning),
			configExists: Boolean(data.configExists),
			configMatchesWorkstation: Boolean(data.configMatchesWorkstation),
			startedNow: Boolean(data.startedNow),
			warnings: Array.isArray(data.warnings) ? data.warnings : [],
			errors: Array.isArray(data.errors) ? data.errors : [],
		};
		if (!payload.filesystemCollector.healthy) {
			appendIssue(
				issues,
				recommendedActions,
				"filesystemCollector",
				"error",
				"Filesystem collector startup is not healthy.",
				"Run `npm run watchdog:startup:check -- -StartIfMissing` and verify collector config/workstation mapping.",
			);
		}
		for (const warning of payload.filesystemCollector.warnings) {
			appendIssue(
				issues,
				recommendedActions,
				"filesystemCollector",
				"warning",
				String(warning),
			);
		}
		for (const error of payload.filesystemCollector.errors) {
			appendIssue(
				issues,
				recommendedActions,
				"filesystemCollector",
				"error",
				String(error),
			);
		}
	}

	const autocadCollectorResult = await runPowerShellJsonCheck({
		scriptPath: autocadContext.checkScript,
		args: [
			"-ConfigPath",
			path.normalize(autocadContext.configPath),
			"-CodexConfigPath",
			codexConfigPath,
			"-TaskName",
			autocadContext.taskName,
			"-CheckTaskName",
			autocadContext.checkTaskName,
			"-RunKeyName",
			autocadContext.runKeyName,
			"-MutexName",
			autocadContext.mutexName,
			...(startIfMissing ? ["-StartIfMissing"] : []),
		],
	});
	if (!autocadCollectorResult.ok || !autocadCollectorResult.data) {
		payload.autocadCollector = {
			ok: false,
			healthy: false,
			available: true,
			error: autocadCollectorResult.error || "AutoCAD collector startup check failed.",
		};
		appendIssue(
			issues,
			recommendedActions,
			"autocadCollector",
			"error",
			payload.autocadCollector.error,
			"Run `npm run watchdog:startup:autocad:check` and resolve AutoCAD collector startup/configuration.",
		);
	} else {
		const data = autocadCollectorResult.data;
		payload.autocadCollector = {
			ok: Boolean(data.healthy),
			healthy: Boolean(data.healthy),
			available: true,
			workstationId: data.workstationId || workstation.workstationId,
			collectorId: data.collectorId || autocadContext.collectorId,
			configPath: data.configPath || autocadContext.configPath,
			startupMode: data.startupMode || "none",
			daemonRunning: Boolean(data.daemonRunning),
			configExists: Boolean(data.configExists),
			configMatchesWorkstation: Boolean(data.configMatchesWorkstation),
			startedNow: Boolean(data.startedNow),
			warnings: Array.isArray(data.warnings) ? data.warnings : [],
			errors: Array.isArray(data.errors) ? data.errors : [],
		};
		if (!payload.autocadCollector.healthy) {
			appendIssue(
				issues,
				recommendedActions,
				"autocadCollector",
				"error",
				"AutoCAD collector startup is not healthy.",
				"Run `npm run watchdog:startup:autocad:check -- -StartIfMissing` and verify AutoCAD collector config/workstation mapping.",
			);
		}
		for (const warning of payload.autocadCollector.warnings) {
			appendIssue(issues, recommendedActions, "autocadCollector", "warning", String(warning));
		}
		for (const error of payload.autocadCollector.errors) {
			appendIssue(issues, recommendedActions, "autocadCollector", "error", String(error));
		}
	}

	const autocadPluginResult = await runPowerShellJsonCheck({
		scriptPath: autocadPluginContext.checkScript,
		args: ["-BundleRoot", path.normalize(autocadPluginContext.bundleRoot)],
	});
	if (!autocadPluginResult.ok || !autocadPluginResult.data) {
		payload.autocadPlugin = {
			ok: false,
			healthy: false,
			available: true,
			error: autocadPluginResult.error || "AutoCAD plugin check failed.",
		};
		appendIssue(
			issues,
			recommendedActions,
			"autocadPlugin",
			"error",
			payload.autocadPlugin.error,
			"Run `npm run watchdog:autocad:plugin:check` and reinstall/fix the plugin bundle.",
		);
	} else {
		const data = autocadPluginResult.data;
		const pluginOk = Boolean(data.ok);
		payload.autocadPlugin = {
			ok: pluginOk,
			healthy: pluginOk,
			available: true,
			bundleRoot: data.bundleRoot || autocadPluginContext.bundleRoot,
			packageContentsExists: Boolean(data.packageContentsExists),
			dllExists: Boolean(data.dllExists),
			loadOnAutoCadStartup: Boolean(data.loadOnAutoCadStartup),
			commands: Array.isArray(data.commands) ? data.commands : [],
			errors: Array.isArray(data.errors) ? data.errors : [],
		};
		if (!payload.autocadPlugin.healthy) {
			appendIssue(
				issues,
				recommendedActions,
				"autocadPlugin",
				"error",
				"AutoCAD plugin installation or autoload configuration is not healthy.",
				"Run `npm run watchdog:autocad:plugin:check` and ensure the plugin bundle is installed under `%APPDATA%\\Autodesk\\ApplicationPlugins`.",
			);
		}
		for (const error of payload.autocadPlugin.errors) {
			appendIssue(issues, recommendedActions, "autocadPlugin", "error", String(error));
		}
	}

	const readinessResult = await runPowerShellJsonCheck({
		scriptPath: autocadPluginContext.readinessScript,
		args: [
			"-ConfigPath",
			path.normalize(autocadContext.configPath),
			"-BundleRoot",
			path.normalize(autocadPluginContext.bundleRoot),
			"-CodexConfigPath",
			codexConfigPath,
			...(startIfMissing ? ["-StartIfMissing"] : []),
		],
	});
	if (!readinessResult.ok || !readinessResult.data) {
		payload.autocadReadiness = {
			ok: false,
			healthy: false,
			available: true,
			error: readinessResult.error || "AutoCAD readiness doctor failed.",
		};
		appendIssue(
			issues,
			recommendedActions,
			"autocadReadiness",
			"error",
			payload.autocadReadiness.error,
			"Run `npm run watchdog:autocad:doctor` and resolve tracker-state/plugin/collector freshness issues.",
		);
	} else {
		const data = readinessResult.data;
		const status = String(data.status || "").trim() || "unknown";
		const readyForTelemetry = Boolean(data?.summary?.readyForTelemetry);
		payload.autocadReadiness = {
			ok: readyForTelemetry,
			healthy: readyForTelemetry,
			available: true,
			status,
			workstationId: data.workstationId || workstation.workstationId,
			summary: data.summary || {},
			backend: data.backend || {},
			backendStartup: data.backendStartup || {},
			trackerState: data.trackerState || {},
			collectorState: data.collectorState || {},
		};
		if (!payload.autocadReadiness.healthy) {
			appendIssue(
				issues,
				recommendedActions,
				"autocadReadiness",
				status === "awaiting_autocad" ? "warning" : "error",
				`AutoCAD readiness status is '${status}'.`,
				"Run `npm run watchdog:autocad:doctor` and follow readiness output until status is `ready`.",
			);
		}
	}

	const fatalIssueCount = issues.filter((entry) => entry.severity === "error").length;
	payload.ok =
		fatalIssueCount === 0 &&
		payload.backend.healthy &&
		payload.filesystemCollector.healthy &&
		payload.autocadCollector.healthy &&
		payload.autocadPlugin.healthy &&
		payload.autocadReadiness.healthy;

	return createTextResult(JSON.stringify(payload, null, 2), !payload.ok);
}

async function toolRunCheck(args = {}) {
	const result = await runProcess("npm", ["run", "check"], {
		timeoutMs: 300_000,
	});
	return createTextResult(summarizeResult(result), !result.ok);
}

async function toolGitStatus() {
	const [statusResult, branchResult] = await Promise.all([
		runProcess("git", ["status", "--porcelain=v1"], { timeoutMs: 10_000 }),
		runProcess("git", ["rev-parse", "--abbrev-ref", "HEAD"], { timeoutMs: 5_000 }),
	]);
	const branch = (branchResult.stdout || "").trim();
	const statusLines = (statusResult.stdout || "").trim();
	const fileCount = statusLines ? statusLines.split(/\r?\n/).length : 0;
	const lines = [
		`Branch: ${branch}`,
		`Changed files: ${fileCount}`,
	];
	if (statusLines) {
		lines.push("", statusLines);
	} else {
		lines.push("", "Working tree clean.");
	}
	return createTextResult(lines.join("\n"));
}

async function toolGitLog(args = {}) {
	const count = Math.max(1, Math.min(Number(args.count) || 15, 100));
	const result = await runProcess(
		"git",
		["log", `--oneline`, `-${count}`, "--no-color"],
		{ timeoutMs: 10_000 },
	);
	return createTextResult(
		result.stdout?.trim() || "No commits found.",
		!result.ok,
	);
}

async function toolReadFile(args = {}) {
	const filePath = typeof args.path === "string" ? args.path.trim() : "";
	if (!filePath) throw new Error("path is required");
	const fileAbs = resolveRepoPath(filePath);
	const stat = await statSafe(fileAbs);
	if (!stat?.isFile()) throw new Error(`Not a file or does not exist: ${filePath}`);
	if (stat.size > 512_000) {
		throw new Error(`File too large (${(stat.size / 1024).toFixed(0)} KB). Use repo.search to find content.`);
	}
	const content = await fs.readFile(fileAbs, "utf8");
	return createTextResult(content);
}

async function toolListDirectory(args = {}) {
	const dirPath = typeof args.path === "string" ? args.path.trim() : ".";
	const maxDepth = Math.max(1, Math.min(Number(args.depth) || 2, 5));
	const dirAbs = resolveRepoPath(dirPath);
	const stat = await statSafe(dirAbs);
	if (!stat?.isDirectory()) throw new Error(`Not a directory or does not exist: ${dirPath}`);

	const skipDirNames = new Set([
		".git", "node_modules", "dist", "build", "coverage",
		"target", ".next", ".turbo", ".venv", "venv", "__pycache__",
	]);

	const lines = [];
	const stack = [{ abs: dirAbs, depth: 0, prefix: "" }];
	while (stack.length) {
		const current = stack.pop();
		if (!current) continue;
		let entries = [];
		try {
			entries = await fs.readdir(current.abs, { withFileTypes: true });
		} catch {
			continue;
		}
		entries.sort((a, b) => {
			if (a.isDirectory() && !b.isDirectory()) return -1;
			if (!a.isDirectory() && b.isDirectory()) return 1;
			return a.name.localeCompare(b.name);
		});
		for (const entry of entries) {
			if (entry.name.startsWith(".") && current.depth === 0 && entry.name !== ".env.example") continue;
			if (entry.isDirectory() && skipDirNames.has(entry.name)) continue;
			const icon = entry.isDirectory() ? "📁" : "📄";
			lines.push(`${current.prefix}${icon} ${entry.name}`);
			if (entry.isDirectory() && current.depth < maxDepth) {
				stack.push({
					abs: path.join(current.abs, entry.name),
					depth: current.depth + 1,
					prefix: current.prefix + "  ",
				});
			}
		}
		if (lines.length > 500) {
			lines.push("... (truncated)");
			break;
		}
	}
	return createTextResult(lines.join("\n") || "(empty directory)");
}

async function toolEnvCheck() {
	const result = await runProcess("npm", ["run", "env:check"], { timeoutMs: 30_000 });
	return createTextResult(summarizeResult(result), !result.ok);
}

async function toolDocsManifestVerify() {
	const result = await runProcess("npm", ["run", "docs:manifest:verify"], { timeoutMs: 30_000 });
	return createTextResult(summarizeResult(result), !result.ok);
}

async function toolArchitectureVerify() {
	const result = await runProcess("npm", ["run", "arch:verify"], { timeoutMs: 30_000 });
	return createTextResult(summarizeResult(result), !result.ok);
}

async function toolRunPythonTests(args = {}) {
	const target = typeof args.target === "string" ? args.target.trim() : "";
	const commandArgs = ["-m", "pytest", "-v"];
	if (target) commandArgs.push(target);
	else commandArgs.push("backend/tests");
	const result = await runProcess("python", commandArgs, { timeoutMs: 180_000 });
	return createTextResult(summarizeResult(result), !result.ok);
}

async function toolCheckPythonEnv() {
	const checks = [];

	const pythonVersion = await runProcess("python", ["--version"], { timeoutMs: 5_000 });
	checks.push(`Python: ${(pythonVersion.stdout || pythonVersion.stderr || "not found").trim()}`);

	const pipList = await runProcess("python", ["-m", "pip", "list", "--format=columns"], { timeoutMs: 15_000 });
	const installed = (pipList.stdout || "").trim();

	const mlPackages = ["scikit-learn", "torch", "torchvision", "tensorflow", "pandas", "numpy", "joblib", "Pillow", "pytesseract"];
	const found = [];
	const missing = [];
	for (const pkg of mlPackages) {
		if (installed.toLowerCase().includes(pkg.toLowerCase())) {
			const match = installed.split(/\r?\n/).find((line) => line.toLowerCase().startsWith(pkg.toLowerCase()));
			found.push(match?.trim() || pkg);
		} else {
			missing.push(pkg);
		}
	}

	checks.push("");
	checks.push("## ML/Data Packages");
	if (found.length) {
		checks.push("Installed:");
		for (const pkg of found) checks.push(`  ✅ ${pkg}`);
	}
	if (missing.length) {
		checks.push("Not installed:");
		for (const pkg of missing) checks.push(`  ⬜ ${pkg}`);
	}

	const condaCheck = await runProcess("conda", ["--version"], { timeoutMs: 5_000 });
	if (condaCheck.code === 0) {
		checks.push("");
		checks.push(`Conda: ${(condaCheck.stdout || "").trim()}`);
		const condaEnvs = await runProcess("conda", ["env", "list"], { timeoutMs: 10_000 });
		if (condaEnvs.ok) {
			checks.push("Conda environments:");
			checks.push((condaEnvs.stdout || "").trim());
		}
	} else {
		checks.push("");
		checks.push("Conda: not installed");
	}

	const jupyterCheck = await runProcess("jupyter", ["--version"], { timeoutMs: 5_000 });
	if (jupyterCheck.code === 0) {
		checks.push("");
		checks.push(`Jupyter: ${(jupyterCheck.stdout || "").trim()}`);
	} else {
		checks.push("");
		checks.push("Jupyter: not installed");
	}

	return createTextResult(checks.join("\n"));
}

async function toolRunBackendTests(args = {}) {
	const module = typeof args.module === "string" ? args.module.trim() : "";
	const commandArgs = ["-m", "unittest"];
	if (module) commandArgs.push(module);
	else commandArgs.push("discover", "-s", "backend/tests", "-p", "test_*.py");
	const result = await runProcess("python", commandArgs, { timeoutMs: 120_000 });
	return createTextResult(summarizeResult(result), !result.ok);
}

const PROMPTS = {
	"repo.pr_description": {
		description: "Generate a structured PR description for this repo.",
		template: ({ title = "PR Title", summary = "", tests = "" }) => `# ${title}

## Summary
${summary || "- Describe the change and why it exists."}

## Scope
- Frontend:
- Backend:
- Data/Schema:
- Docs:

## Validation
${tests || "- npm run typecheck\n- npx biome check ."}

## Risks
- List behavior changes and potential regressions.

## Rollback Plan
- Describe how to revert safely if needed.
`,
	},
	"repo.commit_message": {
		description: "Generate a conventional, scoped commit message.",
		template: ({
			type = "feat",
			scope = "core",
			summary = "describe change",
		}) => `${type}(${scope}): ${summary}`,
	},
	"repo.test_plan": {
		description: "Generate a focused test plan for a code change.",
		template: ({ change = "", risk = "" }) => `## Test Plan

### Change Under Test
${change || "- Describe the behavior and entry points."}

### Risks
${risk || "- Identify likely regressions and edge cases."}

### Checks
1. Run lint and typecheck (Biome + TS).
2. Run feature-specific unit/integration tests.
3. Exercise changed UI/API path manually.
4. Validate error states and invalid inputs.
`,
	},
	"repo.ui_semantics_sweep": {
		description:
			"Return a UI semantics sweep checklist for form fields, labels, and dialog composition safety.",
		template: ({
			scope = "src/components src/routes",
			notes = "Use Biome-only workflow; do not introduce ESLint.",
		}) => `## UI Semantics Sweep Checklist

Scope: ${scope}
Notes: ${notes}

1. Form-field identity
- Every interactive \`input\`, \`textarea\`, and \`select\` has a stable \`id\`.
- Every interactive \`input\`, \`textarea\`, and \`select\` has a stable \`name\`.
- Shared input primitives provide fallback \`id\` + \`name\` to reduce repeated defects.

2. Label association
- Standalone \`<label>\` elements use \`htmlFor\` matching the target control \`id\`.
- Wrapped-label patterns (label contains control) remain valid and are not double-wired.
- Placeholder-only fields gain explicit labels or \`aria-label\` when visual labels are intentionally omitted.

3. Dialog composition safety
- Components using \`DialogPortal\`/dialog content primitives are always rendered under a dialog root context.
- Inline/non-modal variants avoid portal-only primitives that require dialog context.
- Remove duplicate close controls when the shared dialog content already renders a close affordance.

4. Agent UI consistency checks
- Only one objective/chat input surface is visible in the active command region.
- Mode switching (direct vs orchestration) is explicit and deterministic.
- Existing run-ledger, profile routing, and pairing contracts remain unchanged.

5. Validation commands (Biome-only)
1. \`npm run guard:eslint\`
2. \`npm run lint\`
3. \`npm run typecheck\`
4. \`npm run check\`
`,
	},
	"repo.suite_guardrails": {
		description:
			"Return the Suite guardrails that must be preserved across handoffs.",
		template: () => `## Suite Guardrails

1. Do not add or use Tailwind in Suite app paths; use global CSS + CSS Modules.
2. Do not make major auth-flow changes without explicit user approval.
3. Preserve AutoCAD reliability contract:
   - stable error envelope with success/code/message/requestId/meta
   - structured logger.exception with stage context
   - no silent broad exception swallow patterns
4. Preserve the product boundary:
   - Office owns local agent, chat, and orchestration work
   - Suite must stay free of agent UI, pairing flows, broker endpoints, and gateway scripts
5. Watchdog collector startup gate:
   - workstation identity comes from \`.codex/config.toml\` or MCP workstation env overrides
   - use \`repo.check_watchdog_collector_startup\`, \`repo.check_watchdog_autocad_collector_startup\`, \`repo.check_watchdog_autocad_plugin\`, and \`repo.check_watchdog_autocad_readiness\` before relying on local collector telemetry when startup state is relevant
   - if the reported workstation/config mismatch is non-empty, fix workstation-specific startup config before proceeding
   - if startup is unhealthy and recoverable, rerun with \`start_if_missing=true\`
6. Adjacent auth-noise guidance:
   - Supabase "issued in the future" warning spam is handled by docs/security/supabase-clock-skew-runbook.md
   - do not treat clock-skew warning noise as a reason to reopen retired agent or gateway work
7. Watchdog backend startup gate:
   - use \`repo.check_watchdog_backend_startup\` before relying on local AutoCAD telemetry, and rerun with \`start_if_missing=true\` when the server is missing
   - keep the backend service running via the standard \`python backend/api_server.py\` command and confirm it responds to \`/health\` before streaming telemetry
8. Code scanning hygiene (CodeQL / njsscan):
   - never use \`Math.random()\` for IDs, tokens, or security-adjacent values — use \`crypto.randomUUID()\` or \`crypto.getRandomValues()\`
   - never pass user-derived data as a console format string — use \`console.log("%s", msg)\`
   - never log environment variables or secrets to stdout — redact with a \`redactForLog()\` helper
   - use atomic file writes (write to \`.tmp\`, then \`fs.renameSync()\`) for important data
   - remove unused variables, dead assignments, and redundant guards — these trigger CodeQL quality alerts
   - exclude vendored/third-party code from scanning via \`.github/codeql-config.yml\`
   - see \`CODEX.md\` section 7 and \`docs/security/code-scanning-guide.md\` for full reference
`,
	},
	"repo.workstation_context": {
		description:
			"Return the current workstation identity exposed to suite_repo_mcp.",
		template: () => formatWorkstationContext(),
	},
	"repo.handoff_context": {
		description:
			"Generate a cold-start handoff summary combining workstation context, recent git log, current branch, and project state.",
		template: () => `## Handoff Context

Use this prompt at the start of a new session to orient without relying on thread memory.

### Quick Status
- Run \`repo.get_workstation_context\` for workstation identity
- Run \`repo.git_status\` for current branch and pending changes
- Run \`repo.git_log\` for recent commits
- Run \`repo.check_suite_workstation\` for full workstation health

### Key Docs
- \`docs/development/post-bridge-tranche-handoff-2026-04-03.md\` — latest handoff note
- \`docs/development/long-term-overhaul-todo-plan.md\` — overhaul plan
- \`docs/app-feature-roadmap-opinions.md\` — product roadmap
- \`docs/runtime-control/mcp-workstation-matrix.md\` — MCP matrix
- \`docs/security/auth-architecture-canonical.md\` — auth architecture

### Workflow
1. Read the latest handoff note first
2. Check \`repo.git_log\` for what landed since the last handoff
3. Run \`repo.run_check\` to confirm the repo is green
4. Begin the next tranche
`,
	},
	"repo.code_review": {
		description:
			"Structured code review prompt with Suite guardrails baked in.",
		template: ({ scope = "" }) => `## Code Review Checklist

Review scope: ${scope || "current staged changes"}

### Correctness
- Does the change do what it claims?
- Are edge cases handled?
- Are error paths covered?

### Suite Guardrails
- No Tailwind in Suite app paths (CSS Modules only)
- No auth-flow changes without explicit approval
- AutoCAD error envelope preserved (success/code/message/requestId/meta)
- No silent broad exception swallowing
- Office/Suite product boundary respected
- Watchdog startup gates used before relying on local telemetry

### Security & Quality (CodeQL Prevention)
- No \`Math.random()\` for IDs or tokens — use \`crypto.randomUUID()\`
- No user-derived format strings — use \`console.log("%s", msg)\`
- No clear-text logging of env vars — redact before logging
- No unused variables, dead assignments, or redundant guards
- Vendored code excluded via \`.github/codeql-config.yml\`

### Standards
- Biome lint clean (\`npm run lint\`)
- Type-safe (\`npm run typecheck\`)
- Env parity maintained (\`npm run env:check\`)
- Docs manifest current (\`npm run docs:manifest:verify\`)
- Architecture model current (\`npm run arch:verify\`)

### Validation Commands
\`\`\`
npm run check
npm run test:unit
\`\`\`
`,
	},
	"repo.tranche_planning": {
		description:
			"Prompt for planning the next tranche of work using backlog docs.",
		template: () => `## Tranche Planning

Use this prompt when starting a new tranche of work.

### Input Sources
1. Read \`docs/development/long-term-overhaul-todo-plan.md\` for the master backlog
2. Read \`docs/development/post-bridge-tranche-handoff-2026-04-03.md\` for the latest handoff
3. Read \`docs/app-feature-roadmap-opinions.md\` for product priorities
4. Read \`docs/deep-repo-hardening-backlog.md\` for hardening items

### Planning Rules
- Each tranche should be a coherent, shippable unit
- Do not mix cleanup tranches with feature tranches
- Always end with \`npm run check\` green
- Always write a handoff note for the next session
- Keep the overhaul todo plan updated after each tranche

### Output Format
- Tranche title
- Scope (which files/systems)
- Expected validation commands
- Exit criteria
- Handoff note location
`,
	},
	"repo.ml_pilot_planning": {
		description:
			"Prompt for planning ML pilot work using local learning docs, stack recommendations, and guardrails.",
		template: () => `## ML Pilot Planning

Use this prompt when starting ML-related work in Suite.

### Input Sources
1. Read \`docs/backend/local-learning-opportunities.md\` for concrete ML opportunities and stack order
2. Read \`docs/app-feature-roadmap-opinions.md\` (Scikit-learn And PyTorch section) for product-level opinions
3. Read \`docs/development/post-overhaul-feature-backlog.md\` for where ML fits in the backlog
4. Run \`repo.check_python_env\` to see what ML packages are already installed

### ML Stack Order
1. **scikit-learn first** — tabular features, small training sets, fast local training, explainable
2. **PyTorch second** — image crops, multi-modal signals, sequence modeling, larger reviewed datasets
3. **TensorFlow** — alternative to PyTorch when Keras/TFLite deployment matters or team preference
4. **Anaconda/conda** — environment isolation when ML dependencies conflict with Flask API dependencies

### Active Learning Domains
- \`transmittal_titleblock\` — confidence scoring on title-block extraction
- \`autodraft_markup\` — markup intent classification
- \`autodraft_replacement\` — replacement candidate ranking
- \`watchdog_anomaly\` — anomaly detection on telemetry

### Guardrails
- ML is advisory only; never replaces deterministic CAD geometry or business-rule enforcement
- Learning data and model artifacts stay local-only unless explicitly promoted
- ML must not silently override promoted local model output
- Keep deterministic extraction as the primary path
- Every ML feature needs a confidence threshold and a "needs review" fallback

### Recommended First Pilots
1. \`transmittal_titleblock\` confidence scoring with scikit-learn
2. \`autodraft_replacement\` candidate ranking refinement
3. Watchdog anomaly detection (Isolation Forest)

### Validation
- \`python -m pytest backend/tests\`
- \`npm run check\`
- Model artifact isolation confirmed
`,
	},
	"repo.autodesk_api_planning": {
		description:
			"Prompt for planning Autodesk API and AutoCAD integration work.",
		template: () => `## Autodesk API & AutoCAD Integration Planning

Use this prompt when working on AutoCAD/AutoCAD Electrical integration.

### Input Sources
1. Read \`docs/cad/autodesk-local-install-reference.md\` for local install inventory
2. Read \`docs/cad/coordinates-grabber-api.md\` for the current Flask-to-COM bridge
3. Read \`docs/cad/autodesk-standards-checker-comparison.md\` for standards checking approach
4. Read \`docs/development/autocad-electrical-2026-suite-integration-playbook.md\` for integration guidance
5. Read \`docs/cad/named-pipe-bridge.md\` for the .NET named-pipe bridge architecture

### Integration Architecture
- **COM/pywin32**: current local bridge for status, layers, selection, coordinates
- **.NET plugin (WatchdogCadTracker)**: in-process AutoCAD plugin for session/drawing events
- **Named pipe bridge**: optional .NET-to-Python IPC for advanced command dispatch
- **Design Automation API (APS)**: Autodesk cloud-hosted batch processing for headless jobs
- **AutoLISP**: in-process scripting for lightweight automation inside AutoCAD

### Key Autodesk APIs To Consider
- **APS (Autodesk Platform Services)**: cloud viewer, model derivative, design automation
- **AutoCAD .NET API**: in-process plugin via ObjectARX/.NET
- **AutoCAD Electrical API**: ACADE-specific commands (AEPROJECT, AEUPDATETITLEBLOCK, etc.)
- **AutoLISP/Visual LISP**: lightweight in-process scripting
- **COM/ActiveX**: out-of-process bridge (current Suite approach)
- **Database Connectivity (CAO/ADO)**: drawing-to-database workflows

### Guardrails
- Suite stays as the runtime owner; AutoCAD is a CAD execution target
- COM bridge is the stable local path; named-pipe bridge is opt-in
- Do not copy Autodesk install assets into the Suite repo
- AutoCAD plugin must preserve error envelope contract
- Design Automation API work should stay in the "Explore" bucket until a concrete batch use case exists
`,
	},
	"repo.security_quality_review": {
		description:
			"Prompt for reviewing code changes against CodeQL security-and-quality rules to prevent scanning alerts.",
		template: ({ scope = "" }) => `## Security & Quality Review Checklist

Review scope: ${scope || "current staged changes"}

### Why This Matters
GitHub runs CodeQL (security-and-quality) and njsscan on every push to main and every PR.
Unchecked alerts accumulate fast — we hit 152 at one point. Fixing proactively keeps real
vulnerabilities from hiding among quality noise.

### Security Checks
1. **No \`Math.random()\` for IDs or tokens** — use \`crypto.randomUUID()\` or \`crypto.getRandomValues()\`
2. **No format-string injection** — use \`console.log("%s", msg)\` instead of \`console.log(msg)\` when msg is user-derived
3. **No clear-text logging of secrets/env vars** — redact sensitive fields before logging payloads
4. **Atomic file writes** — write to \`.tmp\` then \`fs.renameSync()\` for important data files
5. **No unvalidated dynamic method calls** — validate method names from external input before invoking

### Quality Checks
1. **No unused variables or imports** — remove dead declarations (CodeQL catches more than Biome)
2. **No dead assignments** — don't assign initial values that are immediately overwritten
3. **No trivial conditionals** — remove guards that are always true/false after earlier returns
4. **No unused state** — if you store state you never read/render, remove it or wire it up
5. **No redundant guards** — after \`if (!x) return\`, don't re-check \`x &&\` downstream

### Vendored Code
- If adding third-party bundles, add their paths to \`.github/codeql-config.yml\` \`paths-ignore\`
- Don't fix alerts in vendored code — exclude it from scanning instead

### Validation
\`\`\`
npm run check          # lint + typecheck
npm run test:unit      # unit tests
\`\`\`

### Reference
- \`CODEX.md\` section 7 — full CodeQL/security-quality guidance
- \`docs/security/code-scanning-guide.md\` — detailed scanning guide
- \`.github/codeql-config.yml\` — scanner exclusion config
`,
	},
};

const TOOLS = [
	{
		name: "repo.run_tests",
		description:
			"Run repo tests with auto-detected or explicit runner (npm, pytest, dotnet).",
		inputSchema: {
			type: "object",
			properties: {
				runner: {
					type: "string",
					enum: ["auto", "npm", "pytest", "dotnet"],
					default: "auto",
				},
				target: {
					type: "string",
					description: "Optional test target, pattern, or path.",
				},
			},
		},
		handler: toolRunTests,
	},
	{
		name: "repo.run_typecheck",
		description: "Run frontend, backend, or all type/syntax checks.",
		inputSchema: {
			type: "object",
			properties: {
				scope: {
					type: "string",
					enum: ["frontend", "backend", "all"],
					default: "frontend",
				},
			},
		},
		handler: toolRunTypecheck,
	},
	{
		name: "repo.run_lint_fix",
		description: "Run Biome lint+format autofix on selected scope.",
		inputSchema: {
			type: "object",
			properties: {
				scope: {
					anyOf: [
						{ type: "string" },
						{ type: "array", items: { type: "string" } },
					],
					description:
						"Path or list of paths to fix. Defaults to src/backend/docs.",
				},
			},
		},
		handler: toolRunLintFix,
	},
	{
		name: "repo.search",
		description:
			"Search the repo by regex pattern using ripgrep when available.",
		inputSchema: {
			type: "object",
			required: ["pattern"],
			properties: {
				pattern: { type: "string" },
				paths: {
					anyOf: [
						{ type: "string" },
						{ type: "array", items: { type: "string" } },
					],
				},
				case_sensitive: { type: "boolean", default: false },
				max_results: { type: "number", default: 200 },
			},
		},
		handler: toolSearch,
	},
	{
		name: "repo.find_symbol_usages",
		description:
			"Find likely symbol usages (word-boundary regex) across repo paths.",
		inputSchema: {
			type: "object",
			required: ["symbol"],
			properties: {
				symbol: { type: "string" },
				paths: {
					anyOf: [
						{ type: "string" },
						{ type: "array", items: { type: "string" } },
					],
				},
				case_sensitive: { type: "boolean", default: false },
				max_results: { type: "number", default: 200 },
			},
		},
		handler: toolFindSymbolUsages,
	},
	{
		name: "repo.dependency_graph",
		description:
			"Build a simple dependency graph from a local entry file (TS/JS import graph).",
		inputSchema: {
			type: "object",
			required: ["entry"],
			properties: {
				entry: {
					type: "string",
					description: "Repo-relative entry file path.",
				},
				max_depth: { type: "number", default: 4 },
			},
		},
		handler: toolDependencyGraph,
	},
	{
		name: "repo.generate_component",
		description: "Generate a repo-styled React component scaffold.",
		inputSchema: {
			type: "object",
			required: ["name"],
			properties: {
				name: { type: "string" },
				variant: {
					type: "string",
					enum: ["panel", "card", "form", "list"],
					default: "panel",
				},
				directory: { type: "string" },
				force: { type: "boolean", default: false },
			},
		},
		handler: toolGenerateComponent,
	},
	{
		name: "repo.generate_route",
		description:
			"Generate protected/public route scaffolds using repo conventions.",
		inputSchema: {
			type: "object",
			required: ["name"],
			properties: {
				name: { type: "string" },
				auth_policy: {
					type: "string",
					enum: ["protected", "public"],
					default: "protected",
				},
				schema: {
					anyOf: [{ type: "object" }, { type: "string" }],
					description: "Optional JSON schema metadata embedded in scaffold.",
				},
				force: { type: "boolean", default: false },
			},
		},
		handler: toolGenerateRoute,
	},
	{
		name: "repo.generate_db_migration",
		description: "Create a timestamped Supabase SQL migration scaffold.",
		inputSchema: {
			type: "object",
			required: ["name"],
			properties: {
				name: { type: "string" },
			},
		},
		handler: toolGenerateDbMigration,
	},
	{
		name: "repo.add_structured_log",
		description:
			"Add or suggest a structured log statement in TS/JS/Python files (requires insert_after to apply edits).",
		inputSchema: {
			type: "object",
			required: ["file", "event_name"],
			properties: {
				file: { type: "string" },
				event_name: { type: "string" },
				fields: { type: "object", additionalProperties: true },
				level: {
					type: "string",
					enum: ["debug", "info", "warn", "error"],
					default: "info",
				},
				context: { type: "string", default: "MCP" },
				insert_after: {
					type: "string",
					description: "Marker string; log is inserted on the following line.",
				},
			},
		},
		handler: toolAddStructuredLog,
	},
	{
		name: "repo.add_error_boundary",
		description:
			"Create an error-boundary wrapper component for a route/page component.",
		inputSchema: {
			type: "object",
			required: ["page"],
			properties: {
				page: { type: "string", description: "Repo-relative .tsx page path." },
				force: { type: "boolean", default: false },
			},
		},
		handler: toolAddErrorBoundary,
	},
	{
		name: "repo.add_api_error_wrapper",
		description:
			"Ensure a shared Flask API error wrapper and attach it to a route function.",
		inputSchema: {
			type: "object",
			required: ["route"],
			properties: {
				route: {
					type: "string",
					description: "Python function name (e.g., api_status).",
				},
				file: {
					type: "string",
					default: "backend/api_server.py",
					description: "Target Python file containing the route function.",
				},
			},
		},
		handler: toolAddApiErrorWrapper,
	},
	{
		name: "repo.get_workstation_context",
		description:
			"Return the current workstation identifier, label, role, and computer name for this MCP session.",
		inputSchema: {
			type: "object",
			properties: {},
		},
		handler: toolGetWorkstationContext,
	},
	{
		name: "repo.check_watchdog_collector_startup",
		description:
			"Check workstation-specific Watchdog filesystem collector startup state and optionally start it if missing.",
		inputSchema: {
			type: "object",
			properties: {
				start_if_missing: {
					type: "boolean",
					description:
						"When true, attempt to start the collector if the check finds it is not running.",
				},
			},
		},
		handler: toolCheckWatchdogCollectorStartup,
	},
	{
		name: "repo.check_watchdog_autocad_collector_startup",
		description:
			"Check workstation-specific Watchdog AutoCAD state collector startup state and optionally start it if missing.",
		inputSchema: {
			type: "object",
			properties: {
				start_if_missing: {
					type: "boolean",
					description:
						"When true, attempt to start the collector if the check finds it is not running.",
				},
			},
		},
		handler: toolCheckWatchdogAutocadCollectorStartup,
	},
	{
		name: "repo.check_watchdog_autocad_plugin",
		description:
			"Check whether the workstation-local Watchdog AutoCAD plugin bundle is installed and configured to autoload.",
		inputSchema: {
			type: "object",
			properties: {},
		},
		handler: toolCheckWatchdogAutocadPlugin,
	},
	{
		name: "repo.check_watchdog_autocad_readiness",
		description:
			"Run the workstation-local Watchdog AutoCAD readiness doctor, combining startup, plugin, tracker-state, and collector-state checks.",
		inputSchema: {
			type: "object",
			properties: {
				start_if_missing: {
					type: "boolean",
					description:
						"When true, attempt to start the AutoCAD collector daemon if the readiness check finds it is not running.",
				},
			},
		},
		handler: toolCheckWatchdogAutocadReadiness,
	},
	{
		name: "repo.check_watchdog_backend_startup",
		description:
			"Check the workstation-local backend API server startup state and optionally start it if missing.",
		inputSchema: {
			type: "object",
			properties: {
				start_if_missing: {
					type: "boolean",
					description:
						"When true, attempt to start the Flask backend if it is not already running.",
				},
			},
		},
		handler: toolCheckWatchdogBackendStartup,
	},
	{
		name: "repo.check_suite_workstation",
		description:
			"Run a combined workstation doctor for backend, filesystem collector, AutoCAD collector, plugin, and readiness checks.",
		inputSchema: {
			type: "object",
			properties: {
				start_if_missing: {
					type: "boolean",
					description:
						"When true, attempt to start backend/collector processes when startup checks detect they are not running.",
				},
			},
		},
		handler: toolCheckSuiteWorkstation,
	},
	{
		name: "repo.run_check",
		description:
			"Run the full npm run check pipeline (docs manifest, arch verify, env check, guards, biome lint, typecheck).",
		inputSchema: {
			type: "object",
			properties: {},
		},
		handler: toolRunCheck,
	},
	{
		name: "repo.git_status",
		description:
			"Return current branch, changed file count, and porcelain status.",
		inputSchema: {
			type: "object",
			properties: {},
		},
		handler: toolGitStatus,
	},
	{
		name: "repo.git_log",
		description:
			"Return recent commit log (oneline format).",
		inputSchema: {
			type: "object",
			properties: {
				count: {
					type: "number",
					description: "Number of commits to show (1-100, default 15).",
					default: 15,
				},
			},
		},
		handler: toolGitLog,
	},
	{
		name: "repo.read_file",
		description:
			"Read a repo-relative file and return its content (max 512 KB).",
		inputSchema: {
			type: "object",
			required: ["path"],
			properties: {
				path: {
					type: "string",
					description: "Repo-relative file path.",
				},
			},
		},
		handler: toolReadFile,
	},
	{
		name: "repo.list_directory",
		description:
			"List a repo-relative directory tree with configurable depth.",
		inputSchema: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "Repo-relative directory path (default: repo root).",
					default: ".",
				},
				depth: {
					type: "number",
					description: "Max directory depth to list (1-5, default 2).",
					default: 2,
				},
			},
		},
		handler: toolListDirectory,
	},
	{
		name: "repo.env_check",
		description:
			"Run env parity check (npm run env:check) and return structured result.",
		inputSchema: {
			type: "object",
			properties: {},
		},
		handler: toolEnvCheck,
	},
	{
		name: "repo.docs_manifest_verify",
		description:
			"Run docs manifest verification (npm run docs:manifest:verify) and return pass/fail.",
		inputSchema: {
			type: "object",
			properties: {},
		},
		handler: toolDocsManifestVerify,
	},
	{
		name: "repo.architecture_verify",
		description:
			"Run architecture model verification (npm run arch:verify) and return pass/fail.",
		inputSchema: {
			type: "object",
			properties: {},
		},
		handler: toolArchitectureVerify,
	},
	{
		name: "repo.run_python_tests",
		description:
			"Run Python tests with pytest on a specific target or all backend tests.",
		inputSchema: {
			type: "object",
			properties: {
				target: {
					type: "string",
					description: "Optional pytest target path or module (default: backend/tests).",
				},
			},
		},
		handler: toolRunPythonTests,
	},
	{
		name: "repo.check_python_env",
		description:
			"Check Python environment: version, ML packages (scikit-learn, torch, tensorflow, pandas, numpy), conda, and Jupyter availability.",
		inputSchema: {
			type: "object",
			properties: {},
		},
		handler: toolCheckPythonEnv,
	},
	{
		name: "repo.run_backend_tests",
		description:
			"Run Python unittest discovery on backend tests or a specific module.",
		inputSchema: {
			type: "object",
			properties: {
				module: {
					type: "string",
					description: "Optional unittest module path (e.g., backend.tests.test_api_server). Default: discover all.",
				},
			},
		},
		handler: toolRunBackendTests,
	},
];

const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.name, tool]));
const RESOURCE_MAP = new Map(
	STATIC_RESOURCES.map((resource) => [resource.uri, resource]),
);

function promptList() {
	return Object.entries(PROMPTS).map(([name, value]) => ({
		name,
		description: value.description,
		arguments: [],
	}));
}

function promptGet(name, args = {}) {
	const prompt = PROMPTS[name];
	if (!prompt) {
		throw new Error(`Unknown prompt: ${name}`);
	}
	const text = prompt.template(args);
	return {
		description: prompt.description,
		messages: [
			{
				role: "user",
				content: {
					type: "text",
					text,
				},
			},
		],
	};
}

function resourceList() {
	return STATIC_RESOURCES.map(({ filePath, ...resource }) => resource);
}

async function resourceRead(uri) {
	const resource = RESOURCE_MAP.get(uri);
	if (!resource) {
		throw new Error(`Unknown resource: ${uri}`);
	}

	const text = await fs.readFile(resource.filePath, "utf8");
	return {
		contents: [
			{
				uri: resource.uri,
				mimeType: resource.mimeType,
				text,
			},
		],
	};
}

let initialized = false;

function sendMessage(message) {
	const body = Buffer.from(JSON.stringify(message), "utf8");
	const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
	process.stdout.write(Buffer.concat([header, body]));
}

function sendResponse(id, result) {
	if (id === undefined) return;
	sendMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message, data) {
	if (id === undefined) return;
	sendMessage({
		jsonrpc: "2.0",
		id,
		error: {
			code,
			message,
			data,
		},
	});
}

async function handleRequest(message) {
	if (!message || typeof message !== "object") return;
	const { id, method, params } = message;
	if (!method || typeof method !== "string") return;

	try {
		if (method === "initialize") {
			initialized = true;
			const requestedProtocolVersion =
				typeof params?.protocolVersion === "string"
					? params.protocolVersion
					: "";
			const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(
				requestedProtocolVersion,
			)
				? requestedProtocolVersion
				: LATEST_PROTOCOL_VERSION;
			return sendResponse(id, {
				protocolVersion,
				capabilities: {
					tools: {},
					prompts: {},
					resources: {},
					logging: {},
				},
				serverInfo: SERVER_INFO,
			});
		}

		if (method === "notifications/initialized") {
			return;
		}

		if (!initialized) {
			if (id !== undefined) {
				sendError(id, -32002, "Server not initialized");
			}
			return;
		}

		if (method === "tools/list") {
			return sendResponse(id, {
				tools: TOOLS.map(({ handler, ...definition }) => definition),
			});
		}

		if (method === "resources/list") {
			return sendResponse(id, {
				resources: resourceList(),
			});
		}

		if (method === "resources/templates/list") {
			return sendResponse(id, {
				resourceTemplates: [],
			});
		}

		if (method === "resources/read") {
			const uri = params?.uri;
			if (typeof uri !== "string") {
				return sendError(id, -32602, "resources/read requires a string uri");
			}
			try {
				return sendResponse(id, await resourceRead(uri));
			} catch (error) {
				return sendError(
					id,
					-32602,
					String(error?.message || error),
				);
			}
		}

		if (method === "tools/call") {
			const name = params?.name;
			const rawArgs = params?.arguments;
			if (typeof name !== "string") {
				return sendError(id, -32602, "tools/call requires a string name");
			}
			if (
				rawArgs !== undefined &&
				(rawArgs === null ||
					typeof rawArgs !== "object" ||
					Array.isArray(rawArgs))
			) {
				return sendError(id, -32602, "tools/call arguments must be an object");
			}
			const tool = TOOL_MAP.get(name);
			if (!tool) {
				return sendError(id, -32601, `Unknown tool: ${name}`);
			}
			const args = rawArgs || {};

			try {
				const result = await tool.handler(args);
				return sendResponse(id, result);
			} catch (error) {
				return sendResponse(
					id,
					createTextResult(
						`Tool '${name}' failed: ${String(error?.message || error)}`,
						true,
					),
				);
			}
		}

		if (method === "prompts/list") {
			return sendResponse(id, {
				prompts: promptList(),
			});
		}

		if (method === "prompts/get") {
			const name = params?.name;
			const rawArgs = params?.arguments;
			if (typeof name !== "string") {
				return sendError(id, -32602, "prompts/get requires a string name");
			}
			if (
				rawArgs !== undefined &&
				(rawArgs === null ||
					typeof rawArgs !== "object" ||
					Array.isArray(rawArgs))
			) {
				return sendError(id, -32602, "prompts/get arguments must be an object");
			}
			const args = rawArgs || {};
			const result = promptGet(name, args);
			return sendResponse(id, result);
		}

		if (id !== undefined) {
			sendError(id, -32601, `Method not found: ${method}`);
		}
	} catch (error) {
		if (id !== undefined) {
			sendError(
				id,
				-32000,
				"Internal server error",
				String(error?.stack || error),
			);
		}
	}
}

let buffer = Buffer.alloc(0);

function findHeaderTerminator(buf) {
	const crlfIndex = buf.indexOf("\r\n\r\n");
	const lfIndex = buf.indexOf("\n\n");

	if (crlfIndex === -1 && lfIndex === -1) return null;
	if (crlfIndex === -1) return { index: lfIndex, length: 2 };
	if (lfIndex === -1) return { index: crlfIndex, length: 4 };
	return crlfIndex < lfIndex
		? { index: crlfIndex, length: 4 }
		: { index: lfIndex, length: 2 };
}

function processInputBuffer() {
	while (true) {
		const terminator = findHeaderTerminator(buffer);
		if (!terminator) return;

		const header = buffer.slice(0, terminator.index).toString("utf8");
		const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
		if (!lengthMatch) {
			buffer = buffer.slice(terminator.index + terminator.length);
			continue;
		}

		const contentLength = Number.parseInt(lengthMatch[1], 10);
		const messageStart = terminator.index + terminator.length;
		const messageEnd = messageStart + contentLength;
		if (buffer.length < messageEnd) return;

		const payload = buffer.slice(messageStart, messageEnd).toString("utf8");
		buffer = buffer.slice(messageEnd);

		let message;
		try {
			message = JSON.parse(payload);
		} catch {
			continue;
		}

		handleRequest(message);
	}
}

process.stdin.on("data", (chunk) => {
	buffer = Buffer.concat([buffer, chunk]);
	processInputBuffer();
});

process.stdin.on("error", () => {
	process.exit(1);
});

process.on("uncaughtException", (error) => {
	const text = `Uncaught exception: ${String(error?.stack || error)}`;
	sendMessage({
		jsonrpc: "2.0",
		method: "window/logMessage",
		params: {
			level: "error",
			message: text,
		},
	});
});
