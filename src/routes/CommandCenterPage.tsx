import {
	Check,
	Clock3,
	Copy,
	Download,
	Eye,
	FolderOpen,
	FolderPlus,
	Network,
	RefreshCw,
	Save,
	ShieldAlert,
	Terminal,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { ArchitectureMapPanel } from "@/components/architecture/ArchitectureMapPanel";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Heading, Text } from "@/components/primitives/Text";
import {
	getDevAdminEmails,
	isCommandCenterAuthorized,
	normalizeEmail,
} from "@/lib/devAccess";
import { cn } from "@/lib/utils";
import {
	deleteSetting,
	loadSetting,
	saveSetting,
} from "@/settings/userSettings";
import {
	type HeartbeatResponse,
	type WatchdogConfig,
	type WatchdogEvent,
	type WatchdogEventType,
	watchdogService,
} from "@/services/watchdogService";
import styles from "./CommandCenterPage.module.css";

type CommandPreset = {
	id: string;
	name: string;
	description: string;
	command: string;
};

type CommandGroup = {
	title: string;
	presets: CommandPreset[];
};

type CommandCenterTab = "commands" | "watchdog" | "architecture";
type WatchdogFilter = "all" | WatchdogEventType;
type HistoryCategory = "Commands" | "Watchdog" | "System";
type HistoryFilter = "All" | HistoryCategory;

type WatchdogUiEvent = WatchdogEvent & {
	read: boolean;
	occurrenceCount: number;
	firstSeenAt: number;
	lastSeenAt: number;
};

type WatchdogUiSettings = {
	dedupeEnabled: boolean;
	dedupeWindowMs: number;
};

type CommandCenterHistoryEntry = {
	id: string;
	timestamp: number;
	category: HistoryCategory;
	action: string;
	title: string;
	detailsText: string;
};

type WatchdogScanSummary = Omit<HeartbeatResponse, "ok" | "events">;
type WatchdogPreset = {
	id: string;
	name: string;
	config: WatchdogConfig;
	createdAt: number;
	updatedAt: number;
};

const WATCHDOG_SETTING_KEY = "command_center_watchdog_config_v1";
const WATCHDOG_PRESETS_SETTING_KEY = "command_center_watchdog_presets_v1";
const WATCHDOG_UI_SETTING_KEY = "command_center_watchdog_ui_v1";
const COMMAND_CENTER_HISTORY_KEY = "command_center_action_history_v1";
const MAX_WATCHDOG_EVENTS = 600;
const MAX_WATCHDOG_PRESETS = 24;
const MAX_COMMAND_HISTORY = 500;
const MIN_DEDUPE_WINDOW_MS = 1000;
const MAX_DEDUPE_WINDOW_MS = 60000;

const DEFAULT_WATCHDOG_UI_SETTINGS: WatchdogUiSettings = {
	dedupeEnabled: true,
	dedupeWindowMs: 5000,
};

const DEFAULT_WATCHDOG_CONFIG: WatchdogConfig = {
	roots: [],
	includeGlobs: [],
	excludeGlobs: [],
	heartbeatMs: 5000,
	enabled: true,
};

const COMMAND_GROUPS: CommandGroup[] = [
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

const TABS: Array<{
	id: CommandCenterTab;
	label: string;
	hint: string;
	icon: typeof Terminal;
}> = [
	{
		id: "watchdog",
		label: "Watchdog",
		hint: "Heartbeat scan feed",
		icon: Eye,
	},
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

function parseGlobInput(text: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of text.split(/\r?\n|,/)) {
		const value = raw.trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(value);
	}
	return out;
}

function normalizeRoots(roots: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const root of roots) {
		const value = root.trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(value);
	}
	return out;
}

function normalizeDedupeWindowMs(rawValue: unknown): number {
	const numeric = Number(rawValue);
	if (!Number.isFinite(numeric)) {
		return DEFAULT_WATCHDOG_UI_SETTINGS.dedupeWindowMs;
	}
	return Math.max(
		MIN_DEDUPE_WINDOW_MS,
		Math.min(MAX_DEDUPE_WINDOW_MS, Math.trunc(numeric)),
	);
}

function toWatchdogUiEvent(event: WatchdogEvent): WatchdogUiEvent {
	const eventTimestamp = Number(event.timestamp) || Date.now();
	return {
		...event,
		read: false,
		occurrenceCount: 1,
		firstSeenAt: eventTimestamp,
		lastSeenAt: eventTimestamp,
	};
}

function buildEventDedupeKey(event: WatchdogUiEvent): string {
	return `${String(event.root || "").toLowerCase()}::${String(event.path || "").toLowerCase()}::${event.type}`;
}

function reduceWatchdogEvents(
	eventsNewestFirst: WatchdogUiEvent[],
	settings: WatchdogUiSettings,
): WatchdogUiEvent[] {
	if (!settings.dedupeEnabled) {
		return eventsNewestFirst.slice(0, MAX_WATCHDOG_EVENTS);
	}

	const mergedChronological: WatchdogUiEvent[] = [];
	const latestByKey = new Map<string, WatchdogUiEvent>();
	const chronological = [...eventsNewestFirst].reverse();
	const dedupeWindow = normalizeDedupeWindowMs(settings.dedupeWindowMs);

	for (const sourceEvent of chronological) {
		const event: WatchdogUiEvent = {
			...sourceEvent,
			occurrenceCount: Math.max(1, Number(sourceEvent.occurrenceCount) || 1),
			firstSeenAt: Number(sourceEvent.firstSeenAt) || Number(sourceEvent.timestamp) || Date.now(),
			lastSeenAt: Number(sourceEvent.lastSeenAt) || Number(sourceEvent.timestamp) || Date.now(),
		};
		const key = buildEventDedupeKey(event);
		const existing = latestByKey.get(key);
		if (
			existing &&
			event.lastSeenAt >= existing.lastSeenAt &&
			event.lastSeenAt - existing.lastSeenAt <= dedupeWindow
		) {
			existing.occurrenceCount += event.occurrenceCount;
			existing.firstSeenAt = Math.min(existing.firstSeenAt, event.firstSeenAt);
			existing.lastSeenAt = Math.max(existing.lastSeenAt, event.lastSeenAt);
			existing.read = existing.read && event.read;
			existing.timestamp = existing.lastSeenAt;
			existing.eventId = Math.max(Number(existing.eventId) || 0, Number(event.eventId) || 0);
			if (typeof event.sizeBytes === "number") {
				existing.sizeBytes = event.sizeBytes;
			}
			if (typeof event.mtimeMs === "number") {
				existing.mtimeMs = event.mtimeMs;
			}
			continue;
		}

		const nextEvent: WatchdogUiEvent = {
			...event,
			timestamp: event.lastSeenAt,
		};
		mergedChronological.push(nextEvent);
		latestByKey.set(key, nextEvent);
	}

	return mergedChronological.reverse().slice(0, MAX_WATCHDOG_EVENTS);
}

function buildWatchdogConfigDraft(
	config: WatchdogConfig,
	includeDraft: string,
	excludeDraft: string,
): WatchdogConfig {
	return {
		...config,
		roots: normalizeRoots(config.roots || []),
		includeGlobs: parseGlobInput(includeDraft),
		excludeGlobs: parseGlobInput(excludeDraft),
		heartbeatMs: Math.max(
			1000,
			Math.min(60000, Number(config.heartbeatMs) || 5000),
		),
		enabled: Boolean(config.enabled),
	};
}

function parseWatchdogPresets(raw: unknown): WatchdogPreset[] {
	if (!Array.isArray(raw)) return [];
	const out: WatchdogPreset[] = [];
	const seenIds = new Set<string>();
	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const item = entry as Partial<WatchdogPreset>;
		const id = String(item.id || "").trim();
		const name = String(item.name || "").trim();
		const config = item.config;
		if (!id || !name || !config || typeof config !== "object") continue;
		if (seenIds.has(id)) continue;
		seenIds.add(id);

		const typedConfig = config as WatchdogConfig;
		out.push({
			id,
			name,
			config: {
				roots: normalizeRoots(
					Array.isArray(typedConfig.roots) ? typedConfig.roots : [],
				),
				includeGlobs: parseGlobInput(
					Array.isArray(typedConfig.includeGlobs)
						? typedConfig.includeGlobs.join("\n")
						: "",
				),
				excludeGlobs: parseGlobInput(
					Array.isArray(typedConfig.excludeGlobs)
						? typedConfig.excludeGlobs.join("\n")
						: "",
				),
				heartbeatMs: Math.max(
					1000,
					Math.min(60000, Number(typedConfig.heartbeatMs) || 5000),
				),
				enabled: Boolean(typedConfig.enabled),
			},
			createdAt: Number(item.createdAt) || Date.now(),
			updatedAt: Number(item.updatedAt) || Date.now(),
		});
	}
	return out
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, MAX_WATCHDOG_PRESETS);
}

function parseWatchdogUiSettings(raw: unknown): WatchdogUiSettings {
	if (!raw || typeof raw !== "object") {
		return DEFAULT_WATCHDOG_UI_SETTINGS;
	}
	const source = raw as Partial<WatchdogUiSettings>;
	return {
		dedupeEnabled:
			typeof source.dedupeEnabled === "boolean"
				? source.dedupeEnabled
				: DEFAULT_WATCHDOG_UI_SETTINGS.dedupeEnabled,
		dedupeWindowMs: normalizeDedupeWindowMs(source.dedupeWindowMs),
	};
}

function parseHistoryCategory(value: unknown): HistoryCategory | null {
	if (value === "Commands" || value === "Watchdog" || value === "System") {
		return value;
	}
	return null;
}

function parseCommandCenterHistory(raw: unknown): CommandCenterHistoryEntry[] {
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

function escapeCsvCell(value: unknown): string {
	const text = String(value ?? "");
	if (/[",\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

function triggerDownload(filename: string, content: string, contentType: string) {
	const blob = new Blob([content], { type: contentType });
	const url = window.URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	window.URL.revokeObjectURL(url);
}

function formatHistoryDetails(payload: unknown): string {
	if (typeof payload === "string") return payload;
	try {
		return JSON.stringify(payload, null, 2);
	} catch {
		return String(payload);
	}
}

export default function CommandCenterPage() {
	const { user } = useAuth();
	const [activeTab, setActiveTab] = useState<CommandCenterTab>("watchdog");
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
	const [watchdogConfig, setWatchdogConfig] = useState<WatchdogConfig>(
		DEFAULT_WATCHDOG_CONFIG,
	);
	const [watchdogEvents, setWatchdogEvents] = useState<WatchdogUiEvent[]>([]);
	const [watchdogFilter, setWatchdogFilter] = useState<WatchdogFilter>("all");
	const [watchdogDedupeEnabled, setWatchdogDedupeEnabled] = useState(
		DEFAULT_WATCHDOG_UI_SETTINGS.dedupeEnabled,
	);
	const [watchdogDedupeWindowMs, setWatchdogDedupeWindowMs] = useState(
		DEFAULT_WATCHDOG_UI_SETTINGS.dedupeWindowMs,
	);
	const [watchdogLastScan, setWatchdogLastScan] =
		useState<WatchdogScanSummary | null>(null);
	const [watchdogWarnings, setWatchdogWarnings] = useState<string[]>([]);
	const [watchdogMessage, setWatchdogMessage] = useState<string | null>(null);
	const [watchdogLoading, setWatchdogLoading] = useState(false);
	const [watchdogSaving, setWatchdogSaving] = useState(false);
	const [watchdogTicking, setWatchdogTicking] = useState(false);
	const [watchdogPickingRoot, setWatchdogPickingRoot] = useState(false);
	const [rootDraft, setRootDraft] = useState("");
	const [includeDraft, setIncludeDraft] = useState("");
	const [excludeDraft, setExcludeDraft] = useState("");
	const [watchdogPresets, setWatchdogPresets] = useState<WatchdogPreset[]>([]);
	const [selectedPresetId, setSelectedPresetId] = useState("");
	const [presetNameDraft, setPresetNameDraft] = useState("");
	const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("All");
	const [commandHistory, setCommandHistory] = useState<
		CommandCenterHistoryEntry[]
	>([]);
	const heartbeatLockRef = useRef(false);
	const bootstrappedRef = useRef(false);
	const watchdogUiLoadedRef = useRef(false);
	const commandHistoryLoadedRef = useRef(false);

	const userEmail = normalizeEmail(user?.email);
	const isAllowed = isCommandCenterAuthorized(user);
	const allowlist = useMemo(() => getDevAdminEmails(), []);

	const appendHistory = useCallback(
		(
			payload: Omit<CommandCenterHistoryEntry, "id" | "timestamp"> & {
				detailsText?: string;
			},
		) => {
			const timestamp = Date.now();
			const entry: CommandCenterHistoryEntry = {
				id: `cc-history-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
				timestamp,
				category: payload.category,
				action: payload.action,
				title: payload.title,
				detailsText: String(payload.detailsText || "").trim(),
			};

			setCommandHistory((prev) => [entry, ...prev].slice(0, MAX_COMMAND_HISTORY));
		},
		[],
	);

	const copyCommand = async (preset: CommandPreset) => {
		try {
			await navigator.clipboard.writeText(preset.command);
			setCopiedId(preset.id);
			setTimeout(() => {
				setCopiedId((current) => (current === preset.id ? null : current));
			}, 1500);
			appendHistory({
				category: "Commands",
				action: "command_copied",
				title: `Copied command: ${preset.name}`,
				detailsText: formatHistoryDetails({
					commandId: preset.id,
					command: preset.command,
				}),
			});
		} catch (error) {
			setWatchdogMessage(
				error instanceof Error
					? error.message
					: "Clipboard copy failed for command preset.",
			);
		}
	};

	const copyHistoryDetails = async (entry: CommandCenterHistoryEntry) => {
		try {
			await navigator.clipboard.writeText(entry.detailsText || "");
			setCopiedHistoryId(entry.id);
			setTimeout(() => {
				setCopiedHistoryId((current) => (current === entry.id ? null : current));
			}, 1400);
		} catch (error) {
			setWatchdogMessage(
				error instanceof Error
					? error.message
					: "Failed to copy history details.",
			);
		}
	};

	const summarizeScan = useCallback((payload: WatchdogScanSummary) => {
		setWatchdogLastScan(payload);
		setWatchdogWarnings(
			Array.isArray(payload.warnings) ? payload.warnings : [],
		);
	}, []);

	const runHeartbeat = useCallback(
		async (options?: { silent?: boolean }) => {
			if (heartbeatLockRef.current) return;
			heartbeatLockRef.current = true;
			setWatchdogTicking(true);
			try {
				const payload = await watchdogService.heartbeat();
				const incoming: WatchdogUiEvent[] = (payload.events || []).map((event) =>
					toWatchdogUiEvent(event),
				);
				if (incoming.length > 0) {
					setWatchdogEvents((prev) =>
						[...incoming, ...prev].slice(0, MAX_WATCHDOG_EVENTS),
					);
				}
				summarizeScan(payload);
				if (!options?.silent) {
					setWatchdogMessage(
						`Heartbeat complete: ${incoming.length} change event${incoming.length === 1 ? "" : "s"}.`,
					);
					appendHistory({
						category: "Watchdog",
						action: "watchdog_heartbeat",
						title: `Heartbeat scan (${incoming.length} events)`,
						detailsText: formatHistoryDetails({
							events: incoming.length,
							scanMs: payload.scanMs,
							filesScanned: payload.filesScanned,
							foldersScanned: payload.foldersScanned,
							truncated: payload.truncated,
							warnings: payload.warnings,
							lastHeartbeatAt: payload.lastHeartbeatAt,
						}),
					});
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Watchdog heartbeat failed.";
				if (!options?.silent) {
					setWatchdogMessage(message);
				}
			} finally {
				heartbeatLockRef.current = false;
				setWatchdogTicking(false);
			}
		},
		[appendHistory, summarizeScan],
	);

	const applyConfig = useCallback(
		async (
			nextConfig: WatchdogConfig,
			options?: { persist?: boolean; silent?: boolean; refreshNow?: boolean },
		): Promise<boolean> => {
			const normalized = buildWatchdogConfigDraft(
				nextConfig,
				(nextConfig.includeGlobs || []).join("\n"),
				(nextConfig.excludeGlobs || []).join("\n"),
			);

			setWatchdogSaving(true);
			try {
				const response = await watchdogService.configure(normalized);
				const savedConfig = response.config;
				setWatchdogConfig(savedConfig);
				setIncludeDraft(savedConfig.includeGlobs.join("\n"));
				setExcludeDraft(savedConfig.excludeGlobs.join("\n"));
				summarizeScan(response.initialScan);

				if (options?.persist !== false) {
					await saveSetting(WATCHDOG_SETTING_KEY, savedConfig, null);
				}
				if (!options?.silent) {
					setWatchdogMessage("Watchdog configuration saved.");
					appendHistory({
						category: "Watchdog",
						action: "watchdog_config_saved",
						title: "Saved Watchdog configuration",
						detailsText: formatHistoryDetails(savedConfig),
					});
				}
				if (options?.refreshNow) {
					await runHeartbeat({ silent: true });
				}
				return true;
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to configure Watchdog.";
				setWatchdogMessage(message);
				return false;
			} finally {
				setWatchdogSaving(false);
			}
		},
		[appendHistory, runHeartbeat, summarizeScan],
	);

	const loadStatus = useCallback(async () => {
		setWatchdogLoading(true);
		try {
			const status = await watchdogService.status();
			if (status.configured) {
				setWatchdogConfig(status.config);
				setIncludeDraft((status.config.includeGlobs || []).join("\n"));
				setExcludeDraft((status.config.excludeGlobs || []).join("\n"));
				if (status.lastScan) {
					summarizeScan(status.lastScan);
				}
			}
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to load Watchdog status.";
			setWatchdogMessage(message);
		} finally {
			setWatchdogLoading(false);
		}
	}, [summarizeScan]);

	useEffect(() => {
		if (!isAllowed || bootstrappedRef.current) return;
		bootstrappedRef.current = true;

		let active = true;
		const bootstrap = async () => {
			try {
				const persistedPresets = await loadSetting<unknown>(
					WATCHDOG_PRESETS_SETTING_KEY,
					null,
					[],
				);
				if (!active) return;
				const parsedPresets = parseWatchdogPresets(persistedPresets);
				setWatchdogPresets(parsedPresets);
				if (parsedPresets.length > 0) {
					setSelectedPresetId(parsedPresets[0].id);
					setPresetNameDraft(parsedPresets[0].name);
				}

				const persistedUiSettings = await loadSetting<unknown>(
					WATCHDOG_UI_SETTING_KEY,
					null,
					DEFAULT_WATCHDOG_UI_SETTINGS,
				);
				if (!active) return;
				const parsedUiSettings = parseWatchdogUiSettings(persistedUiSettings);
				setWatchdogDedupeEnabled(parsedUiSettings.dedupeEnabled);
				setWatchdogDedupeWindowMs(parsedUiSettings.dedupeWindowMs);
				watchdogUiLoadedRef.current = true;

				const persistedHistory = await loadSetting<unknown>(
					COMMAND_CENTER_HISTORY_KEY,
					null,
					[],
				);
				if (!active) return;
				setCommandHistory(parseCommandCenterHistory(persistedHistory));
				commandHistoryLoadedRef.current = true;

				const persisted = await loadSetting<WatchdogConfig | null>(
					WATCHDOG_SETTING_KEY,
					null,
					null,
				);
				if (!active) return;

				if (
					persisted &&
					Array.isArray(persisted.roots) &&
					persisted.roots.length > 0
				) {
					setWatchdogConfig(persisted);
					setIncludeDraft((persisted.includeGlobs || []).join("\n"));
					setExcludeDraft((persisted.excludeGlobs || []).join("\n"));
					await applyConfig(persisted, {
						persist: false,
						silent: true,
						refreshNow: true,
					});
					return;
				}

				await loadStatus();
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to initialize Watchdog settings.";
				setWatchdogMessage(message);
				watchdogUiLoadedRef.current = true;
				commandHistoryLoadedRef.current = true;
			}
		};

		void bootstrap();
		return () => {
			active = false;
		};
	}, [applyConfig, isAllowed, loadStatus]);

	useEffect(() => {
		if (!isAllowed || !watchdogUiLoadedRef.current) return;
		const payload: WatchdogUiSettings = {
			dedupeEnabled: watchdogDedupeEnabled,
			dedupeWindowMs: normalizeDedupeWindowMs(watchdogDedupeWindowMs),
		};
		void saveSetting(WATCHDOG_UI_SETTING_KEY, payload, null);
	}, [isAllowed, watchdogDedupeEnabled, watchdogDedupeWindowMs]);

	useEffect(() => {
		if (!isAllowed || !commandHistoryLoadedRef.current) return;
		void saveSetting(COMMAND_CENTER_HISTORY_KEY, commandHistory, null);
	}, [commandHistory, isAllowed]);

	useEffect(() => {
		if (!isAllowed) return;
		if (!watchdogConfig.enabled) return;
		if ((watchdogConfig.roots || []).length === 0) return;

		const timer = window.setInterval(
			() => {
				void runHeartbeat({ silent: true });
			},
			Math.max(1000, Number(watchdogConfig.heartbeatMs) || 5000),
		);
		return () => window.clearInterval(timer);
	}, [
		isAllowed,
		runHeartbeat,
		watchdogConfig.enabled,
		watchdogConfig.heartbeatMs,
		watchdogConfig.roots,
	]);

	const selectedPreset = useMemo(
		() =>
			watchdogPresets.find((preset) => preset.id === selectedPresetId) || null,
		[selectedPresetId, watchdogPresets],
	);

	useEffect(() => {
		if (!selectedPreset) return;
		setPresetNameDraft(selectedPreset.name);
	}, [selectedPreset]);

	const currentWatchdogDraft = useMemo(
		() => buildWatchdogConfigDraft(watchdogConfig, includeDraft, excludeDraft),
		[watchdogConfig, includeDraft, excludeDraft],
	);

	const chooseRootFromDialog = async () => {
		if (watchdogPickingRoot) return;
		setWatchdogPickingRoot(true);
		try {
			const suggestedPath =
				rootDraft.trim() ||
				watchdogConfig.roots[watchdogConfig.roots.length - 1] ||
				null;
			const result = await watchdogService.pickRoot(suggestedPath);
			if (result.cancelled || !result.path) {
				setWatchdogMessage("Folder selection cancelled.");
				return;
			}

			const selectedPath = result.path;
			const nextRoots = normalizeRoots([
				...(watchdogConfig.roots || []),
				selectedPath,
			]);
			if (nextRoots.length === watchdogConfig.roots.length) {
				setWatchdogMessage("Folder is already in your root list.");
				return;
			}
			setRootDraft(selectedPath);
			setWatchdogConfig((prev) => ({
				...prev,
				roots: nextRoots,
			}));
			setWatchdogMessage("Folder added from picker.");
			appendHistory({
				category: "Watchdog",
				action: "watchdog_root_picked",
				title: "Added root from picker",
				detailsText: formatHistoryDetails({ root: selectedPath }),
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to open folder picker.";
			setWatchdogMessage(message);
		} finally {
			setWatchdogPickingRoot(false);
		}
	};

	const persistPresets = async (nextPresets: WatchdogPreset[]) => {
		setWatchdogPresets(nextPresets);
		const result = await saveSetting(
			WATCHDOG_PRESETS_SETTING_KEY,
			nextPresets,
			null,
		);
		if (!result.success) {
			setWatchdogMessage(
				result.error || "Preset updated in memory but failed to persist.",
			);
			return false;
		}
		return true;
	};

	const savePresetFromDraft = async () => {
		const name = presetNameDraft.trim();
		if (!name) {
			setWatchdogMessage("Enter a preset name before saving.");
			return;
		}

		const now = Date.now();
		const existing =
			selectedPreset && selectedPreset.name.toLowerCase() === name.toLowerCase()
				? selectedPreset
				: null;
		const presetId = existing?.id || `watchdog-preset-${now}`;
		const nextPreset: WatchdogPreset = {
			id: presetId,
			name,
			config: currentWatchdogDraft,
			createdAt: existing?.createdAt || now,
			updatedAt: now,
		};

		const merged = [
			nextPreset,
			...watchdogPresets.filter((preset) => preset.id !== nextPreset.id),
		].slice(0, MAX_WATCHDOG_PRESETS);
		const persisted = await persistPresets(merged);
		setSelectedPresetId(nextPreset.id);
		if (persisted) {
			setWatchdogMessage(`Preset "${name}" saved.`);
			appendHistory({
				category: "Watchdog",
				action: "watchdog_preset_saved",
				title: `Saved preset: ${name}`,
				detailsText: formatHistoryDetails(nextPreset),
			});
		}
	};

	const loadSelectedPreset = async () => {
		if (!selectedPreset) {
			setWatchdogMessage("Select a preset to load.");
			return;
		}
		const presetConfig = selectedPreset.config;
		setWatchdogConfig(presetConfig);
		setIncludeDraft((presetConfig.includeGlobs || []).join("\n"));
		setExcludeDraft((presetConfig.excludeGlobs || []).join("\n"));
		setPresetNameDraft(selectedPreset.name);
		const ok = await applyConfig(presetConfig, {
			persist: true,
			silent: true,
			refreshNow: false,
		});
		if (ok) {
			setWatchdogMessage(`Preset "${selectedPreset.name}" loaded.`);
			appendHistory({
				category: "Watchdog",
				action: "watchdog_preset_loaded",
				title: `Loaded preset: ${selectedPreset.name}`,
				detailsText: formatHistoryDetails(selectedPreset.config),
			});
		}
	};

	const deleteSelectedPreset = async () => {
		if (!selectedPreset) {
			setWatchdogMessage("Select a preset to delete.");
			return;
		}
		const nextPresets = watchdogPresets.filter(
			(preset) => preset.id !== selectedPreset.id,
		);
		const persisted = await persistPresets(nextPresets);
		const nextSelected = nextPresets[0] || null;
		setSelectedPresetId(nextSelected?.id || "");
		setPresetNameDraft(nextSelected?.name || "");
		if (persisted) {
			setWatchdogMessage(`Preset "${selectedPreset.name}" deleted.`);
			appendHistory({
				category: "Watchdog",
				action: "watchdog_preset_deleted",
				title: `Deleted preset: ${selectedPreset.name}`,
				detailsText: formatHistoryDetails({ presetId: selectedPreset.id }),
			});
		}
	};

	const addRoot = () => {
		const value = rootDraft.trim();
		if (!value) return;
		const nextRoots = normalizeRoots([...(watchdogConfig.roots || []), value]);
		if (nextRoots.length === watchdogConfig.roots.length) {
			setRootDraft("");
			return;
		}
		setWatchdogConfig((prev) => {
			return {
				...prev,
				roots: nextRoots,
			};
		});
		setRootDraft("");
		appendHistory({
			category: "Watchdog",
			action: "watchdog_root_added",
			title: "Added root path",
			detailsText: formatHistoryDetails({ root: value }),
		});
	};

	const removeRoot = (root: string) => {
		if (!(watchdogConfig.roots || []).includes(root)) return;
		setWatchdogConfig((prev) => ({
			...prev,
			roots: (prev.roots || []).filter((item) => item !== root),
		}));
		appendHistory({
			category: "Watchdog",
			action: "watchdog_root_removed",
			title: "Removed root path",
			detailsText: formatHistoryDetails({ root }),
		});
	};

	const markAllRead = () => {
		setWatchdogEvents((prev) =>
			prev.map((event) => ({ ...event, read: true })),
		);
	};

	const clearEvents = () => {
		setWatchdogEvents([]);
	};

	const saveWatchdogConfig = async () => {
		const payload: WatchdogConfig = {
			...currentWatchdogDraft,
		};
		await applyConfig(payload, { persist: true, refreshNow: false });
	};

	const resetWatchdogConfig = async () => {
		const pausedConfig: WatchdogConfig = {
			roots: [],
			includeGlobs: [],
			excludeGlobs: [],
			heartbeatMs: Math.max(1000, Number(watchdogConfig.heartbeatMs) || 5000),
			enabled: false,
		};
		const applied = await applyConfig(pausedConfig, {
			persist: true,
			silent: true,
			refreshNow: false,
		});
		if (!applied) return;

		setWatchdogEvents([]);
		setWatchdogWarnings([]);
		setWatchdogLastScan(null);
		setWatchdogMessage("Watchdog configuration reset and paused.");
		appendHistory({
			category: "Watchdog",
			action: "watchdog_config_reset",
			title: "Reset Watchdog configuration",
			detailsText:
				"Watchdog config was reset to paused state on backend and local feed was cleared.",
		});
	};

	const watchdogUiSettings = useMemo<WatchdogUiSettings>(
		() => ({
			dedupeEnabled: watchdogDedupeEnabled,
			dedupeWindowMs: normalizeDedupeWindowMs(watchdogDedupeWindowMs),
		}),
		[watchdogDedupeEnabled, watchdogDedupeWindowMs],
	);

	const dedupedWatchdogEvents = useMemo(
		() => reduceWatchdogEvents(watchdogEvents, watchdogUiSettings),
		[watchdogEvents, watchdogUiSettings],
	);

	const watchdogStats = useMemo(() => {
		let added = 0;
		let removed = 0;
		let modified = 0;
		let unread = 0;
		for (const event of dedupedWatchdogEvents) {
			if (!event.read) unread += 1;
			if (event.type === "added") added += 1;
			if (event.type === "removed") removed += 1;
			if (event.type === "modified") modified += 1;
		}
		return { added, removed, modified, unread };
	}, [dedupedWatchdogEvents]);

	const visibleWatchdogEvents = useMemo(() => {
		if (watchdogFilter === "all") return dedupedWatchdogEvents;
		return dedupedWatchdogEvents.filter((event) => event.type === watchdogFilter);
	}, [dedupedWatchdogEvents, watchdogFilter]);

	const visibleHistoryEntries = useMemo(() => {
		if (historyFilter === "All") return commandHistory;
		return commandHistory.filter((entry) => entry.category === historyFilter);
	}, [commandHistory, historyFilter]);

	const clearCommandHistory = async () => {
		setCommandHistory([]);
		await deleteSetting(COMMAND_CENTER_HISTORY_KEY, null);
		setWatchdogMessage("Command Center history cleared.");
	};

	const exportWatchdogFeed = (format: "csv" | "json") => {
		if (visibleWatchdogEvents.length === 0) {
			setWatchdogMessage("No visible watchdog feed rows to export.");
			return;
		}

		const now = new Date();
		const stamp = [
			now.getFullYear(),
			String(now.getMonth() + 1).padStart(2, "0"),
			String(now.getDate()).padStart(2, "0"),
			"-",
			String(now.getHours()).padStart(2, "0"),
			String(now.getMinutes()).padStart(2, "0"),
			String(now.getSeconds()).padStart(2, "0"),
		].join("");

		if (format === "json") {
			const jsonPayload = JSON.stringify(visibleWatchdogEvents, null, 2);
			triggerDownload(
				`watchdog-feed-${stamp}.json`,
				jsonPayload,
				"application/json;charset=utf-8",
			);
		} else {
			const header = [
				"eventId",
				"type",
				"root",
				"path",
				"relativePath",
				"occurrenceCount",
				"firstSeenAt",
				"lastSeenAt",
				"sizeBytes",
				"mtimeMs",
				"read",
			].join(",");
			const rows = visibleWatchdogEvents.map((event) =>
				[
					event.eventId,
					event.type,
					event.root,
					event.path,
					event.relativePath || "",
					event.occurrenceCount,
					event.firstSeenAt,
					event.lastSeenAt,
					event.sizeBytes ?? "",
					event.mtimeMs ?? "",
					event.read,
				]
					.map((value) => escapeCsvCell(value))
					.join(","),
			);
			const csvPayload = [header, ...rows].join("\n");
			triggerDownload(
				`watchdog-feed-${stamp}.csv`,
				csvPayload,
				"text/csv;charset=utf-8",
			);
		}

		appendHistory({
			category: "Watchdog",
			action: "watchdog_feed_exported",
			title: `Exported watchdog feed (${format.toUpperCase()})`,
			detailsText: formatHistoryDetails({
				format,
				rowsExported: visibleWatchdogEvents.length,
				filter: watchdogFilter,
				dedupeEnabled: watchdogUiSettings.dedupeEnabled,
				dedupeWindowMs: watchdogUiSettings.dedupeWindowMs,
			}),
		});
		setWatchdogMessage(
			`Exported ${visibleWatchdogEvents.length} feed row${visibleWatchdogEvents.length === 1 ? "" : "s"} as ${format.toUpperCase()}.`,
		);
	};

	if (!isAllowed) {
		return (
			<PageFrame maxWidth="full">
				<div className={styles.rootNarrow}>
					<PageHeader />
					<Panel variant="default" padding="lg" className={styles.topMargin}>
						<Stack gap={4}>
							<HStack gap={3} align="start">
								<div className={cn(styles.stateIcon, styles.stateIconDanger)}>
									<ShieldAlert size={20} />
								</div>
								<Stack gap={1}>
									<Text size="sm" weight="semibold">
										{import.meta.env.DEV
											? "Admin Access Required"
											: "Command Center Disabled"}
									</Text>
									<Text size="sm" color="muted">
										{import.meta.env.DEV ? (
											<>
												Set{" "}
												<code className={styles.monoCode}>
													VITE_DEV_ADMIN_EMAIL
												</code>{" "}
												or{" "}
												<code className={styles.monoCode}>
													VITE_DEV_ADMIN_EMAILS
												</code>{" "}
												in your <code className={styles.monoCode}>.env</code>,
												or assign an admin claim.
											</>
										) : (
											<>
												Command Center is currently set to run in development
												only and is disabled in production builds.
											</>
										)}
									</Text>
								</Stack>
							</HStack>

							<Panel variant="inset" padding="md">
								<Stack gap={2}>
									<HStack gap={2} align="center">
										<Text size="xs" color="muted">
											Current account:
										</Text>
										<Badge variant="soft" size="sm">
											{userEmail || "(unknown)"}
										</Badge>
									</HStack>
									{allowlist.length > 0 && (
										<HStack gap={2} align="center">
											<Text size="xs" color="muted">
												Allowlist:
											</Text>
											<Text size="xs" color="muted">
												{allowlist.join(", ")}
											</Text>
										</HStack>
									)}
								</Stack>
							</Panel>
						</Stack>
					</Panel>
				</div>
			</PageFrame>
		);
	}

	return (
		<PageFrame maxWidth="full">
			<div className={styles.rootWide}>
				<PageHeader />

				<Panel variant="default" padding="md" className={styles.topMargin}>
					<div
						className={styles.tabRow}
						role="tablist"
						aria-label="Command center tabs"
					>
						{TABS.map((tab) => {
							const Icon = tab.icon;
							const showUnreadBadge =
								tab.id === "watchdog" && watchdogStats.unread > 0;
							return (
								<button
									key={tab.id}
									type="button"
									role="tab"
									aria-selected={activeTab === tab.id}
									className={cn(
										styles.tabButton,
										activeTab === tab.id && styles.tabButtonActive,
									)}
									onClick={() => setActiveTab(tab.id)}
								>
									<span className={styles.tabIconWrap}>
										<Icon size={14} />
									</span>
									<span className={styles.tabText}>
										<span className={styles.tabLabel}>{tab.label}</span>
										<span className={styles.tabHint}>{tab.hint}</span>
									</span>
									{showUnreadBadge && (
										<span className={styles.tabCounter}>
											{Math.min(watchdogStats.unread, 99)}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</Panel>

				{activeTab === "commands" && (
					<Stack gap={4} className={styles.commandsStack}>
						<div className={styles.groupsGrid}>
							{COMMAND_GROUPS.map((group) => (
								<Panel key={group.title} variant="default" padding="md">
									<Stack gap={4}>
										<HStack gap={2} align="center" className={styles.groupHead}>
											<div className={styles.groupIcon}>
												<Terminal size={14} />
											</div>
											<Text size="sm" weight="semibold">
												{group.title}
											</Text>
										</HStack>

										<Stack gap={3}>
											{group.presets.map((preset) => (
												<CommandCard
													key={preset.id}
													preset={preset}
													copied={copiedId === preset.id}
													onCopy={() => void copyCommand(preset)}
												/>
											))}
										</Stack>
									</Stack>
								</Panel>
							))}
						</div>

						<Panel variant="default" padding="md" className={styles.historyPanel}>
							<Stack gap={3}>
								<HStack gap={2} align="center">
									<Clock3 size={16} />
									<Text size="sm" weight="semibold">
										Command History
									</Text>
								</HStack>

								<div className={styles.historyToolbar}>
									<div className={styles.historyFilterTabs}>
										{(["All", "Commands", "Watchdog", "System"] as const).map(
											(category) => (
												<button
													key={category}
													type="button"
													className={cn(
														styles.historyFilterTab,
														historyFilter === category &&
															styles.historyFilterTabActive,
													)}
													onClick={() => setHistoryFilter(category)}
												>
													{category}
												</button>
											),
										)}
									</div>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => void clearCommandHistory()}
										disabled={commandHistory.length === 0}
									>
										Clear History
									</Button>
								</div>

								<div className={styles.historyList}>
									{visibleHistoryEntries.length === 0 ? (
										<div className={styles.historyEmpty}>
											No history entries for this filter.
										</div>
									) : (
										visibleHistoryEntries.map((entry) => (
											<div key={entry.id} className={styles.historyItem}>
												<div className={styles.historyItemHeader}>
													<div className={styles.historyHeaderMain}>
														<span className={styles.historyCategoryBadge}>
															{entry.category}
														</span>
														<span className={styles.historyTitle}>
															{entry.title}
														</span>
													</div>
													<div className={styles.historyActions}>
														<span className={styles.historyTime}>
															{new Date(entry.timestamp).toLocaleString()}
														</span>
														<Button
															type="button"
															variant={
																copiedHistoryId === entry.id
																	? "primary"
																	: "secondary"
															}
															size="sm"
															iconLeft={
																copiedHistoryId === entry.id ? (
																	<Check size={12} />
																) : (
																	<Copy size={12} />
																)
															}
															onClick={() => void copyHistoryDetails(entry)}
														>
															{copiedHistoryId === entry.id
																? "Copied"
																: "Copy Output Chunk"}
														</Button>
													</div>
												</div>
												<div className={styles.historyMeta}>
													action: {entry.action}
												</div>
												{entry.detailsText && (
													<pre className={styles.historyDetails}>
														{entry.detailsText}
													</pre>
												)}
											</div>
										))
									)}
								</div>
							</Stack>
						</Panel>
					</Stack>
				)}

				{activeTab === "watchdog" && (
					<div className={styles.watchdogGrid}>
						<Panel
							variant="default"
							padding="md"
							className={styles.watchdogConfigPanel}
						>
							<Stack gap={4}>
								<HStack gap={2} align="center">
									<Eye size={16} />
									<Text size="sm" weight="semibold">
										Watchdog Configuration
									</Text>
								</HStack>

								<div className={styles.watchdogPresetSection}>
									<label className={styles.fieldLabel}>Watchdog Presets</label>
									<div className={styles.watchdogPresetRow}>
										<select
											className={styles.watchdogPresetSelect}
											value={selectedPresetId}
											onChange={(event) =>
												setSelectedPresetId(event.target.value)
											}
										>
											<option value="">Select preset</option>
											{watchdogPresets.map((preset) => (
												<option key={preset.id} value={preset.id}>
													{preset.name}
												</option>
											))}
										</select>
										<Input
											placeholder="Preset name"
											value={presetNameDraft}
											onChange={(event) =>
												setPresetNameDraft(event.target.value)
											}
										/>
									</div>
									<div className={styles.watchdogPresetActions}>
										<Button
											type="button"
											variant="secondary"
											size="sm"
											iconLeft={<FolderOpen size={14} />}
											onClick={() => void loadSelectedPreset()}
											disabled={!selectedPreset}
										>
											Load Preset
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											iconLeft={<Save size={14} />}
											onClick={() => void savePresetFromDraft()}
										>
											Save Preset
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											iconLeft={<Trash2 size={14} />}
											onClick={() => void deleteSelectedPreset()}
											disabled={!selectedPreset}
										>
											Delete Preset
										</Button>
									</div>
								</div>

								<div className={styles.watchdogRootEditor}>
									<Input
										placeholder="Absolute folder path"
										value={rootDraft}
										onChange={(event) => setRootDraft(event.target.value)}
									/>
									<div className={styles.watchdogRootEditorActions}>
										<Button
											type="button"
											variant="secondary"
											size="sm"
											iconLeft={<FolderOpen size={14} />}
											onClick={() => void chooseRootFromDialog()}
											loading={watchdogPickingRoot}
										>
											Choose Folder
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											iconLeft={<FolderPlus size={14} />}
											onClick={addRoot}
										>
											Add Root
										</Button>
									</div>
								</div>

								<div className={styles.watchdogRootList}>
									{watchdogConfig.roots.length === 0 ? (
										<Text size="xs" color="muted">
											No roots configured yet.
										</Text>
									) : (
										watchdogConfig.roots.map((root) => (
											<div key={root} className={styles.watchdogRootItem}>
												<span className={styles.watchdogRootPath}>{root}</span>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => removeRoot(root)}
												>
													Remove
												</Button>
											</div>
										))
									)}
								</div>

								<label className={styles.toggleRow}>
									<input
										type="checkbox"
										checked={watchdogConfig.enabled}
										onChange={(event) =>
											setWatchdogConfig((prev) => ({
												...prev,
												enabled: event.target.checked,
											}))
										}
									/>
									<span>Enabled</span>
								</label>

								<Input
									type="number"
									label="Heartbeat (ms)"
									value={String(watchdogConfig.heartbeatMs || 5000)}
									min={1000}
									max={60000}
									onChange={(event) =>
										setWatchdogConfig((prev) => ({
											...prev,
											heartbeatMs: Number(event.target.value) || 5000,
										}))
									}
								/>

								<label className={styles.fieldLabel}>
									Include globs (newline or comma separated)
								</label>
								<textarea
									value={includeDraft}
									onChange={(event) => setIncludeDraft(event.target.value)}
									className={styles.watchdogTextarea}
									placeholder="*.dwg&#10;*.pdf&#10;subfolder/**/*.xlsx"
								/>

								<label className={styles.fieldLabel}>
									Exclude globs (newline or comma separated)
								</label>
								<textarea
									value={excludeDraft}
									onChange={(event) => setExcludeDraft(event.target.value)}
									className={styles.watchdogTextarea}
									placeholder="**/.git/**&#10;**/node_modules/**"
								/>

								<HStack
									gap={2}
									align="center"
									className={styles.watchdogActions}
								>
									<Button
										type="button"
										variant="primary"
										size="sm"
										onClick={() => void saveWatchdogConfig()}
										loading={watchdogSaving}
									>
										Save Config
									</Button>
									<Button
										type="button"
										variant="secondary"
										size="sm"
										iconLeft={<RefreshCw size={14} />}
										onClick={() => void runHeartbeat()}
										loading={watchdogTicking}
										disabled={
											!watchdogConfig.enabled ||
											watchdogConfig.roots.length === 0
										}
									>
										Heartbeat Now
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => void resetWatchdogConfig()}
									>
										Reset
									</Button>
								</HStack>

								{watchdogLoading && (
									<Text size="xs" color="muted">
										Loading backend status...
									</Text>
								)}
								{watchdogMessage && (
									<Text size="xs" color="muted">
										{watchdogMessage}
									</Text>
								)}
								{watchdogWarnings.length > 0 && (
									<div className={styles.warningList}>
										{watchdogWarnings.map((warning) => (
											<div key={warning}>{warning}</div>
										))}
									</div>
								)}
							</Stack>
						</Panel>

						<Panel
							variant="default"
							padding="md"
							className={styles.watchdogFeedPanel}
						>
							<Stack gap={3}>
								<HStack gap={2} align="center">
									<Eye size={16} />
									<Text size="sm" weight="semibold">
										Heartbeat Event Feed
									</Text>
								</HStack>

								<div className={styles.watchdogStatsRow}>
									<StatChip label="Added" value={watchdogStats.added} />
									<StatChip label="Removed" value={watchdogStats.removed} />
									<StatChip label="Modified" value={watchdogStats.modified} />
									<StatChip label="Unread" value={watchdogStats.unread} />
								</div>

								<div className={styles.watchdogToolbar}>
									<div className={styles.watchdogToolbarTop}>
										<div className={styles.watchdogFilterTabs}>
											{(["all", "added", "removed", "modified"] as const).map(
												(tab) => (
													<button
														key={tab}
														type="button"
														className={cn(
															styles.watchdogFilterTab,
															watchdogFilter === tab &&
																styles.watchdogFilterTabActive,
														)}
														onClick={() => setWatchdogFilter(tab)}
													>
														{tab}
													</button>
												),
											)}
										</div>
										<HStack gap={2} align="center">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={markAllRead}
											>
												Read all
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={clearEvents}
											>
												Clear
											</Button>
										</HStack>
									</div>

									<div className={styles.watchdogToolbarBottom}>
										<label className={styles.watchdogToggleChip}>
											<input
												type="checkbox"
												checked={watchdogDedupeEnabled}
												onChange={(event) =>
													setWatchdogDedupeEnabled(event.target.checked)
												}
											/>
											<span>Dedupe</span>
										</label>
										<Input
											type="number"
											label="Window (ms)"
											fluid={false}
											value={String(watchdogDedupeWindowMs)}
											min={MIN_DEDUPE_WINDOW_MS}
											max={MAX_DEDUPE_WINDOW_MS}
											onChange={(event) =>
												setWatchdogDedupeWindowMs(
													normalizeDedupeWindowMs(event.target.value),
												)
											}
											className={styles.watchdogWindowInput}
										/>
										<Button
											type="button"
											variant="outline"
											size="sm"
											iconLeft={<Download size={13} />}
											onClick={() => exportWatchdogFeed("csv")}
										>
											Export CSV
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											iconLeft={<Download size={13} />}
											onClick={() => exportWatchdogFeed("json")}
										>
											Export JSON
										</Button>
									</div>
								</div>

								<div className={styles.watchdogScanMeta}>
									<Text size="xs" color="muted">
										Last scan:{" "}
										{watchdogLastScan
											? `${watchdogLastScan.filesScanned} files / ${watchdogLastScan.foldersScanned} folders in ${watchdogLastScan.scanMs}ms`
											: "—"}
									</Text>
									<Text size="xs" color="muted">
										Last heartbeat:{" "}
										{watchdogLastScan?.lastHeartbeatAt
											? new Date(
													watchdogLastScan.lastHeartbeatAt,
												).toLocaleTimeString()
											: "—"}
									</Text>
								</div>

								<div className={styles.watchdogFeedList}>
									{visibleWatchdogEvents.length === 0 ? (
										<div className={styles.watchdogEmpty}>
											No events yet. Configure roots and run a heartbeat.
										</div>
									) : (
										visibleWatchdogEvents.map((event) => (
											<div
												key={event.eventId}
												className={cn(
													styles.watchdogFeedItem,
													!event.read && styles.watchdogFeedItemUnread,
												)}
											>
												<div className={styles.watchdogFeedHeader}>
													<div className={styles.watchdogEventTypeWrap}>
														<span className={styles.watchdogEventType}>
															{event.type}
														</span>
														{event.occurrenceCount > 1 && (
															<span className={styles.watchdogRepeatBadge}>
																x{event.occurrenceCount}
															</span>
														)}
													</div>
													<span className={styles.watchdogEventTime}>
														{new Date(event.lastSeenAt).toLocaleTimeString()}
													</span>
												</div>
												<div className={styles.watchdogEventPath}>
													{event.path}
												</div>
												<div className={styles.watchdogEventMeta}>
													root: {event.root}
													{typeof event.sizeBytes === "number" &&
														` · ${event.sizeBytes.toLocaleString()} bytes`}
													{` · first ${new Date(event.firstSeenAt).toLocaleTimeString()} · last ${new Date(event.lastSeenAt).toLocaleTimeString()}`}
												</div>
											</div>
										))
									)}
								</div>
							</Stack>
						</Panel>
					</div>
				)}

				{activeTab === "architecture" && (
					<Panel
						variant="default"
						padding="md"
						className={styles.architecturePanel}
					>
						<ArchitectureMapPanel />
					</Panel>
				)}
			</div>
		</PageFrame>
	);
}

function PageHeader() {
	return (
		<HStack gap={3} align="center" className={styles.pageHeader}>
			<div className={styles.headerIcon}>
				<Terminal size={20} />
			</div>
			<div>
				<Heading level={1}>Command Center</Heading>
				<Text size="sm" color="muted">
					Operations commands, heartbeat watchdog, and architecture visibility.
				</Text>
			</div>
		</HStack>
	);
}

function CommandCard({
	preset,
	copied,
	onCopy,
}: {
	preset: CommandPreset;
	copied: boolean;
	onCopy: () => void;
}) {
	return (
		<Panel variant="inset" padding="sm">
			<Stack gap={2}>
				<HStack justify="between" align="start" gap={3}>
					<Stack gap={1}>
						<Text size="sm" weight="medium">
							{preset.name}
						</Text>
						<Text size="xs" color="muted">
							{preset.description}
						</Text>
					</Stack>
					<Button
						variant={copied ? "primary" : "secondary"}
						size="sm"
						onClick={onCopy}
						iconLeft={copied ? <Check size={12} /> : <Copy size={12} />}
					>
						{copied ? "Copied" : "Copy"}
					</Button>
				</HStack>
				<pre className={styles.commandPre}>{preset.command}</pre>
			</Stack>
		</Panel>
	);
}

function StatChip({ label, value }: { label: string; value: number }) {
	return (
		<div className={styles.statChip}>
			<div className={styles.statChipValue}>{value}</div>
			<div className={styles.statChipLabel}>{label}</div>
		</div>
	);
}
