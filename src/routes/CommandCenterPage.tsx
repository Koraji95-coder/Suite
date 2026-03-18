import {
	Check,
	Clock3,
	Copy,
	Network,
	ShieldAlert,
	Terminal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { ArchitectureMapPanel } from "@/components/architecture/ArchitectureMapPanel";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Heading, Text } from "@/components/primitives/Text";
import {
	getDevAdminEmails,
	isCommandCenterAuthorized,
	normalizeEmail,
} from "@/lib/devAccess";
import { parseCommandCenterTab } from "@/lib/watchdogNavigation";
import { cn } from "@/lib/utils";
import {
	deleteSetting,
	loadSetting,
	saveSetting,
} from "@/settings/userSettings";
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

type ActiveCommandCenterTab = "commands" | "architecture";
type HistoryCategory = "Commands" | "System";
type HistoryFilter = "All" | HistoryCategory;

type CommandCenterHistoryEntry = {
	id: string;
	timestamp: number;
	category: HistoryCategory;
	action: string;
	title: string;
	detailsText: string;
};

const COMMAND_CENTER_HISTORY_KEY = "command_center_action_history_v1";
const MAX_COMMAND_HISTORY = 500;

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
	id: ActiveCommandCenterTab;
	label: string;
	hint: string;
	icon: typeof Terminal;
}> = [
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

function coerceActiveTab(
	value: ReturnType<typeof parseCommandCenterTab>,
): ActiveCommandCenterTab {
	return value === "architecture" ? "architecture" : "commands";
}

function parseHistoryCategory(value: unknown): HistoryCategory | null {
	if (value === "Commands" || value === "System") {
		return value;
	}
	if (value === "Watchdog") {
		return "System";
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

function formatHistoryDetails(payload: unknown): string {
	if (typeof payload === "string") return payload;
	try {
		return JSON.stringify(payload, null, 2);
	} catch {
		return String(payload);
	}
}

export default function CommandCenterPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();
	const requestedTab = parseCommandCenterTab(searchParams.get("tab"));
	const [activeTab, setActiveTab] = useState<ActiveCommandCenterTab>(() =>
		coerceActiveTab(requestedTab),
	);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
	const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("All");
	const [commandHistory, setCommandHistory] = useState<
		CommandCenterHistoryEntry[]
	>([]);
	const [historyLoaded, setHistoryLoaded] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const userEmail = normalizeEmail(user?.email);
	const isAllowed = isCommandCenterAuthorized(user);
	const allowlist = useMemo(() => getDevAdminEmails(), []);

	useEffect(() => {
		setActiveTab(coerceActiveTab(requestedTab));
	}, [requestedTab]);

	useEffect(() => {
		if (!isAllowed) return;
		let active = true;

		const loadHistory = async () => {
			try {
				const persistedHistory = await loadSetting<unknown>(
					COMMAND_CENTER_HISTORY_KEY,
					null,
					[],
				);
				if (!active) return;
				setCommandHistory(parseCommandCenterHistory(persistedHistory));
			} catch (error) {
				if (!active) return;
				setMessage(
					error instanceof Error
						? error.message
						: "Failed to load Command Center history.",
				);
			} finally {
				if (active) {
					setHistoryLoaded(true);
				}
			}
		};

		void loadHistory();
		return () => {
			active = false;
		};
	}, [isAllowed]);

	useEffect(() => {
		if (!isAllowed || !historyLoaded) return;
		void saveSetting(COMMAND_CENTER_HISTORY_KEY, commandHistory, null);
	}, [commandHistory, historyLoaded, isAllowed]);

	const handleTabSelect = useCallback(
		(tab: ActiveCommandCenterTab) => {
			setActiveTab(tab);
			const nextParams = new URLSearchParams(searchParams);
			if (tab === "commands") {
				nextParams.delete("tab");
			} else {
				nextParams.set("tab", tab);
			}
			setSearchParams(nextParams, { replace: true });
		},
		[searchParams, setSearchParams],
	);

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

			setCommandHistory((prev) =>
				[entry, ...prev].slice(0, MAX_COMMAND_HISTORY),
			);
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
			setMessage(`Copied "${preset.name}" to the clipboard.`);
		} catch (error) {
			setMessage(
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
				setCopiedHistoryId((current) =>
					current === entry.id ? null : current,
				);
			}, 1400);
			setMessage(`Copied history details for "${entry.title}".`);
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: "Failed to copy history details.",
			);
		}
	};

	const visibleHistoryEntries = useMemo(() => {
		if (historyFilter === "All") return commandHistory;
		return commandHistory.filter((entry) => entry.category === historyFilter);
	}, [commandHistory, historyFilter]);

	const clearCommandHistory = async () => {
		setCommandHistory([]);
		await deleteSetting(COMMAND_CENTER_HISTORY_KEY, null);
		setMessage("Command Center history cleared.");
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
									onClick={() => handleTabSelect(tab.id)}
								>
									<span className={styles.tabIconWrap}>
										<Icon size={14} />
									</span>
									<span className={styles.tabText}>
										<span className={styles.tabLabel}>{tab.label}</span>
										<span className={styles.tabHint}>{tab.hint}</span>
									</span>
								</button>
							);
						})}
					</div>
				</Panel>

				{activeTab === "commands" && (
					<Stack gap={4} className={styles.commandsStack}>
						{message && (
							<Panel variant="inset" padding="sm">
								<Text size="xs" color="muted">
									{message}
								</Text>
							</Panel>
						)}

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

						<Panel
							variant="default"
							padding="md"
							className={styles.historyPanel}
						>
							<Stack gap={3}>
								<HStack gap={2} align="center">
									<Clock3 size={16} />
									<Text size="sm" weight="semibold">
										Command History
									</Text>
								</HStack>

								<div className={styles.historyToolbar}>
									<div className={styles.historyFilterTabs}>
										{(["All", "Commands", "System"] as const).map(
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
					Operations commands and architecture visibility. Dashboard owns the
					live telemetry surface.
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
