import { Network, type LucideIcon, Terminal } from "lucide-react";
import { parseCommandCenterTab } from "@/lib/watchdogNavigation";

export type CommandPreset = {
	id: string;
	name: string;
	description: string;
	command: string;
};

export type CommandGroup = {
	title: string;
	presets: CommandPreset[];
};

export type ActiveCommandCenterTab = "commands" | "architecture";
export type HistoryCategory = "Commands" | "System";
export type HistoryFilter = "All" | HistoryCategory;

export type CommandCenterHistoryEntry = {
	id: string;
	timestamp: number;
	category: HistoryCategory;
	action: string;
	title: string;
	detailsText: string;
};

export type CommandCenterHistoryDraft = {
	category: HistoryCategory;
	action: string;
	title: string;
	detailsText?: string;
};

export type CommandCenterTabDefinition = {
	id: ActiveCommandCenterTab;
	label: string;
	hint: string;
	icon: LucideIcon;
};

export const COMMAND_CENTER_HISTORY_KEY = "command_center_action_history_v1";
export const MAX_COMMAND_HISTORY = 500;
export const COMMAND_CENTER_HISTORY_FILTERS = [
	"All",
	"Commands",
	"System",
] as const satisfies readonly HistoryFilter[];

export const COMMAND_GROUPS: CommandGroup[] = [
	{
		title: "Core Dev",
		presets: [
			{
				id: "dev",
				name: "Start Vite Dev Server",
				description: "Run frontend in development mode.",
				command: "npm run dev",
			},
			{
				id: "dev-full",
				name: "Start Full Stack Dev",
				description: "Run frontend + backend + local gateway.",
				command: "npm run dev:full",
			},
			{
				id: "kill-vite",
				name: "Kill Frontend (5173)",
				description: "Stop the Vite dev server by local port.",
				command:
					"Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }",
			},
			{
				id: "kill-backend",
				name: "Kill Backend (5000)",
				description: "Stop the Flask/Python backend by local port.",
				command:
					"Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }",
			},
			{
				id: "kill-gateway",
				name: "Kill Gateway (3000)",
				description: "Stop the local agent gateway by local port.",
				command:
					"Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }",
			},
			{
				id: "kill-pipe-bridge",
				name: "Kill AutoCAD Pipe Bridge",
				description: "Stop the named-pipe host used for AutoCAD automation.",
				command:
					"Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*NamedPipeServer.dll*' -and $_.CommandLine -like '*SUITE_AUTOCAD_PIPE*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
			},
			{
				id: "kill-watchdog-collectors",
				name: "Kill Watchdog Collectors",
				description: "Stop the filesystem and AutoCAD collector workers.",
				command:
					"Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*run-watchdog-filesystem-collector.py*' -or $_.CommandLine -like '*run-watchdog-autocad-state-collector.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
			},
			{
				id: "kill-suite-local",
				name: "Kill All Local Suite Services",
				description: "Stop frontend, backend, gateway, bridge, and collectors.",
				command:
					"@(5173,5000,3000) | ForEach-Object { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force } }; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*NamedPipeServer.dll*' -or $_.CommandLine -like '*run-watchdog-filesystem-collector.py*' -or $_.CommandLine -like '*run-watchdog-autocad-state-collector.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
			},
			{
				id: "build",
				name: "Production Build",
				description: "Create production bundle.",
				command: "npm run build",
			},
			{
				id: "preview",
				name: "Preview Build",
				description: "Serve build output locally.",
				command: "npm run preview",
			},
		],
	},
	{
		title: "Quality",
		presets: [
			{
				id: "check",
				name: "Biome + Type Check",
				description: "Run repository validation checks.",
				command: "npm run check",
			},
			{
				id: "check-fix",
				name: "Auto-fix + Type Check",
				description: "Apply safe Biome fixes and re-check.",
				command: "npm run check:fix",
			},
			{
				id: "audit",
				name: "Dependency Audit",
				description: "Check known package vulnerabilities.",
				command: "npm run ci:audit",
			},
			{
				id: "autodraft-dotnet-tests",
				name: "AutoDraft .NET Tests",
				description: "Run AutoDraft API contract test project.",
				command:
					"dotnet test dotnet/autodraft-api-contract.Tests/AutoDraft.ApiContract.Tests.csproj -v minimal",
			},
		],
	},
	{
		title: "Agent + Backend",
		presets: [
			{
				id: "zeroclaw",
				name: "ZeroClaw Gateway (Local)",
				description: "Start local ZeroClaw gateway service.",
				command: "npm run gateway:dev",
			},
			{
				id: "flask",
				name: "Ground Grid Flask API",
				description: "Run Flask backend for AutoCAD workflows.",
				command: "npm run backend:coords:dev",
			},
			{
				id: "pairing",
				name: "Show Agent Health",
				description: "Validate gateway is listening.",
				command: "curl -sS http://127.0.0.1:3000/health | cat",
			},
		],
	},
	{
		title: "Npx Utilities",
		presets: [
			{
				id: "biome-check",
				name: "Biome Check",
				description: "Run Biome directly over source files.",
				command: "npx @biomejs/biome check src",
			},
			{
				id: "biome-write",
				name: "Biome Format Write",
				description: "Apply formatting and import organization.",
				command: "npx @biomejs/biome check --write src",
			},
			{
				id: "tsc",
				name: "TypeScript Check",
				description: "Run TypeScript compiler checks only.",
				command: "npx tsc --noEmit",
			},
		],
	},
];

export const COMMAND_CENTER_TABS: CommandCenterTabDefinition[] = [
	{
		id: "commands",
		label: "Ops Commands",
		hint: "Preset control actions",
		icon: Terminal,
	},
	{
		id: "architecture",
		label: "Architecture",
		hint: "System structure map",
		icon: Network,
	},
];

export function coerceActiveCommandCenterTab(
	value: ReturnType<typeof parseCommandCenterTab>,
): ActiveCommandCenterTab {
	return value === "architecture" ? "architecture" : "commands";
}

export function parseHistoryCategory(value: unknown): HistoryCategory | null {
	if (value === "Commands" || value === "System") {
		return value;
	}
	if (value === "Watchdog") {
		return "System";
	}
	return null;
}

export function parseCommandCenterHistory(
	raw: unknown,
): CommandCenterHistoryEntry[] {
	if (!Array.isArray(raw)) return [];
	const out: CommandCenterHistoryEntry[] = [];
	const seen = new Set<string>();

	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const item = entry as Partial<CommandCenterHistoryEntry>;
		const id = String(item.id || "").trim();
		if (!id || seen.has(id)) continue;

		const category = parseHistoryCategory(item.category);
		if (!category) continue;

		seen.add(id);
		out.push({
			id,
			timestamp: Number(item.timestamp) || Date.now(),
			category,
			action: String(item.action || "").trim() || "action",
			title: String(item.title || "").trim() || "Command Center",
			detailsText: String(item.detailsText || "").trim(),
		});
	}

	return out
		.sort((a, b) => b.timestamp - a.timestamp)
		.slice(0, MAX_COMMAND_HISTORY);
}

export function formatCommandCenterHistoryDetails(payload: unknown): string {
	if (typeof payload === "string") return payload;
	try {
		return JSON.stringify(payload, null, 2);
	} catch {
		return String(payload);
	}
}

export function createCommandCenterHistoryEntry(
	payload: CommandCenterHistoryDraft,
): CommandCenterHistoryEntry {
	const timestamp = Date.now();
	return {
		id: `cc-history-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
		timestamp,
		category: payload.category,
		action: payload.action,
		title: payload.title,
		detailsText: String(payload.detailsText || "").trim(),
	};
}
