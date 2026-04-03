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

export const COMMAND_CENTER_HISTORY_KEY = "command_center_action_history_v1";
export const MAX_COMMAND_HISTORY = 500;
export const COMMAND_CENTER_HISTORY_FILTERS = [
	"All",
	"Commands",
	"System",
] as const satisfies readonly HistoryFilter[];

export const COMMAND_GROUPS: CommandGroup[] = [
	{
		title: "Diagnostics",
		presets: [
			{
				id: "gateway-health-probe",
				name: "Gateway Health Probe",
				description: "Check the local gateway health endpoint directly.",
				command: "curl -sS http://127.0.0.1:3001/health | cat",
			},
			{
				id: "backend-health-probe",
				name: "Backend Health Probe",
				description:
					"Check the local backend probe-safe health route without shaping workstation status.",
				command: "curl -sS http://127.0.0.1:5000/health | cat",
			},
			{
				id: "backend-runtime-status",
				name: "Backend Runtime Snapshot",
				description:
					"Read the backend-served shared runtime status payload for parity checks.",
				command: "curl -sS http://127.0.0.1:5000/api/runtime/status | cat",
			},
		],
	},
	{
		title: "Hosted Push",
		presets: [
			{
				id: "supabase-remote-login",
				name: "Login To Hosted Supabase CLI",
				description:
					"Open the repo-local Supabase CLI login flow without requiring a global supabase install.",
				command: "npm run supabase:remote:login",
			},
			{
				id: "supabase-remote-target-auto",
				name: "Set Hosted Project Ref",
				description:
					"Derive SUPABASE_REMOTE_PROJECT_REF from the hosted Supabase URL in .env and write it to .env.local.",
				command: "npm run supabase:remote:target:auto",
			},
			{
				id: "supabase-remote-preflight",
				name: "Run Hosted Preflight",
				description:
					"Check CLI auth, link state, drift, and Windows sign-in status artifacts without pushing.",
				command: "npm run supabase:remote:preflight",
			},
			{
				id: "supabase-remote-push-dry",
				name: "Dry-Run Hosted Push",
				description:
					"Show which tracked migrations would be pushed to hosted Supabase.",
				command: "npm run supabase:remote:push:dry",
			},
			{
				id: "supabase-remote-push",
				name: "Push Migrations To Hosted",
				description:
					"Run the guarded hosted migration push after a successful preflight.",
				command: "npm run supabase:remote:push",
			},
			{
				id: "supabase-remote-task-install",
				name: "Install Windows Sign-In Preflight",
				description:
					"Register the hosted Supabase preflight to run automatically after Windows logon.",
				command: "npm run supabase:remote:task:install",
			},
		],
	},
	{
		title: "Evidence & Logs",
		presets: [
			{
				id: "worktale-doctor",
				name: "Check Worktale Readiness",
				description:
					"Verify CLI, git email, bootstrap state, and both Worktale hooks.",
				command: "npm run worktale:doctor",
			},
			{
				id: "worktale-dash",
				name: "Open Worktale Dashboard",
				description: "Open the local Worktale dashboard for evidence review.",
				command: "npm run worktale:dash",
			},
			{
				id: "worktale-digest",
				name: "Generate Worktale Digest",
				description: "Build the daily digest before review or publishing.",
				command: "npm run worktale:digest",
			},
		],
	},
];

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
