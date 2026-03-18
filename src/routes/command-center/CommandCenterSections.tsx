import {
	Check,
	Clock3,
	Copy,
	ShieldAlert,
	Terminal,
} from "lucide-react";
import { ArchitectureMapPanel } from "@/components/architecture/ArchitectureMapPanel";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Heading, Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import styles from "../CommandCenterPage.module.css";
import {
	COMMAND_CENTER_HISTORY_FILTERS,
	COMMAND_CENTER_TABS,
	type ActiveCommandCenterTab,
	type CommandCenterHistoryEntry,
	type CommandGroup,
	type CommandPreset,
	type HistoryFilter,
} from "./commandCenterModel";

export function CommandCenterPageHeader() {
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

interface CommandCenterAccessPanelProps {
	userEmail: string;
	allowlist: string[];
}

export function CommandCenterAccessPanel({
	userEmail,
	allowlist,
}: CommandCenterAccessPanelProps) {
	return (
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
									Set <code className={styles.monoCode}>VITE_DEV_ADMIN_EMAIL</code>{" "}
									or <code className={styles.monoCode}>VITE_DEV_ADMIN_EMAILS</code>{" "}
									in your <code className={styles.monoCode}>.env</code>, or assign
									an admin claim.
								</>
							) : (
								<>
									Command Center is currently set to run in development only and
									is disabled in production builds.
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
	);
}

interface CommandCenterTabBarProps {
	activeTab: ActiveCommandCenterTab;
	onSelect: (tab: ActiveCommandCenterTab) => void;
}

export function CommandCenterTabBar({
	activeTab,
	onSelect,
}: CommandCenterTabBarProps) {
	return (
		<Panel variant="default" padding="md" className={styles.topMargin}>
			<div
				className={styles.tabRow}
				role="tablist"
				aria-label="Command center tabs"
			>
				{COMMAND_CENTER_TABS.map((tab) => {
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
							onClick={() => onSelect(tab.id)}
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
	);
}

interface CommandCenterCommandsSectionProps {
	message: string | null;
	commandGroups: CommandGroup[];
	copiedPresetId: string | null;
	onCopyCommand: (preset: CommandPreset) => void;
	historyFilter: HistoryFilter;
	onHistoryFilterChange: (filter: HistoryFilter) => void;
	commandHistoryLength: number;
	visibleHistoryEntries: CommandCenterHistoryEntry[];
	copiedHistoryId: string | null;
	onCopyHistoryDetails: (entry: CommandCenterHistoryEntry) => void;
	onClearHistory: () => void;
}

export function CommandCenterCommandsSection({
	message,
	commandGroups,
	copiedPresetId,
	onCopyCommand,
	historyFilter,
	onHistoryFilterChange,
	commandHistoryLength,
	visibleHistoryEntries,
	copiedHistoryId,
	onCopyHistoryDetails,
	onClearHistory,
}: CommandCenterCommandsSectionProps) {
	return (
		<Stack gap={4} className={styles.commandsStack}>
			{message && (
				<Panel variant="inset" padding="sm">
					<Text size="xs" color="muted">
						{message}
					</Text>
				</Panel>
			)}

			<div className={styles.groupsGrid}>
				{commandGroups.map((group) => (
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
										copied={copiedPresetId === preset.id}
										onCopy={() => onCopyCommand(preset)}
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
							{COMMAND_CENTER_HISTORY_FILTERS.map((category) => (
								<button
									key={category}
									type="button"
									className={cn(
										styles.historyFilterTab,
										historyFilter === category &&
											styles.historyFilterTabActive,
									)}
									onClick={() => onHistoryFilterChange(category)}
								>
									{category}
								</button>
							))}
						</div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onClearHistory}
							disabled={commandHistoryLength === 0}
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
											<span className={styles.historyTitle}>{entry.title}</span>
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
												onClick={() => onCopyHistoryDetails(entry)}
											>
												{copiedHistoryId === entry.id
													? "Copied"
													: "Copy Output Chunk"}
											</Button>
										</div>
									</div>
									<div className={styles.historyMeta}>action: {entry.action}</div>
									{entry.detailsText && (
										<pre className={styles.historyDetails}>{entry.detailsText}</pre>
									)}
								</div>
							))
						)}
					</div>
				</Stack>
			</Panel>
		</Stack>
	);
}

export function CommandCenterArchitectureSection() {
	return (
		<Panel variant="default" padding="md" className={styles.architecturePanel}>
			<ArchitectureMapPanel />
		</Panel>
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
