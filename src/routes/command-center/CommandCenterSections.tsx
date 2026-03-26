import {
	Check,
	Clock3,
	CloudUpload,
	Copy,
	RefreshCw,
	ShieldAlert,
	Terminal,
} from "lucide-react";
import { SurfaceSkeleton } from "@/components/apps/ui/SurfaceSkeleton";
import {
	resolveTrustStateMeta,
	TrustStateBadge,
} from "@/components/apps/ui/TrustStateBadge";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
import { Text } from "@/components/primitives/Text";
import type { SuiteRuntimeDoctorReport } from "@/lib/runtimeDoctor";
import { buildSuiteDoctorSummaryModel } from "@/lib/suiteDoctorPresentation";
import { cn } from "@/lib/utils";
import styles from "../CommandCenterPage.module.css";
import {
	COMMAND_CENTER_HISTORY_FILTERS,
	type CommandCenterHistoryEntry,
	type CommandGroup,
	type CommandPreset,
	type HistoryFilter,
} from "./commandCenterModel";
import type {
	SupabaseSyncRun,
	SupabaseSyncStatusPayload,
} from "./useSupabaseSyncStatus";

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
								: "Command Center (limited access)"}
						</Text>
						<Text size="sm" color="muted">
							{import.meta.env.DEV ? (
								<>
									Set{" "}
									<code className={styles.monoCode}>VITE_DEV_ADMIN_EMAIL</code>{" "}
									or{" "}
									<code className={styles.monoCode}>VITE_DEV_ADMIN_EMAILS</code>{" "}
									in your <code className={styles.monoCode}>.env</code>, or
									assign an admin claim.
								</>
							) : (
								<>
									Command Center access is scoped to allowlisted developer
									profiles for now. Share your email with the admin team to get
									invited.
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

interface CommandCenterCommandsSectionProps {
	message: string | null;
	suiteDoctorReport: SuiteRuntimeDoctorReport | null;
	suiteDoctorLoading: boolean;
	suiteDoctorRefreshing: boolean;
	onRefreshSuiteDoctor: () => void;
	commandGroups: CommandGroup[];
	supabaseSyncStatus: SupabaseSyncStatusPayload | null;
	supabaseSyncStatusLoading: boolean;
	supabaseSyncStatusRefreshing: boolean;
	supabaseSyncStatusError: string | null;
	onRefreshSupabaseSyncStatus: () => void;
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
	suiteDoctorReport,
	suiteDoctorLoading,
	suiteDoctorRefreshing,
	onRefreshSuiteDoctor,
	commandGroups,
	supabaseSyncStatus,
	supabaseSyncStatusLoading,
	supabaseSyncStatusRefreshing,
	supabaseSyncStatusError,
	onRefreshSupabaseSyncStatus,
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

			<CommandCenterSuiteDoctorPanel
				report={suiteDoctorReport}
				loading={suiteDoctorLoading}
				refreshing={suiteDoctorRefreshing}
				onRefresh={onRefreshSuiteDoctor}
			/>

			<CommandCenterSupabaseSyncPanel
				status={supabaseSyncStatus}
				loading={supabaseSyncStatusLoading}
				refreshing={supabaseSyncStatusRefreshing}
				error={supabaseSyncStatusError}
				onRefresh={onRefreshSupabaseSyncStatus}
			/>

			<Panel variant="inset" padding="sm">
				<Text size="xs" color="muted">
					Runtime Control owns local start, stop, restart, Watchdog plugin ops,
					and support bundle export. Use Command Center for copied incident
					commands, hosted push checks, and deeper diagnostics.
				</Text>
			</Panel>

			<div className={styles.groupsGrid}>
				{commandGroups.map((group) => (
					<Panel key={group.title} variant="support" padding="md">
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

			<Panel variant="support" padding="md" className={styles.historyPanel}>
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
										historyFilter === category && styles.historyFilterTabActive,
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
													copiedHistoryId === entry.id ? "primary" : "secondary"
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
	);
}

function CommandCenterSuiteDoctorPanel({
	report,
	loading,
	refreshing,
	onRefresh,
}: {
	report: SuiteRuntimeDoctorReport | null;
	loading: boolean;
	refreshing: boolean;
	onRefresh: () => void;
}) {
	const summary = buildSuiteDoctorSummaryModel(report, loading);
	const stateMeta = resolveTrustStateMeta(summary.state);

	return (
		<Panel
			variant="feature"
			padding="md"
			className={styles.supabaseStatusPanel}
		>
			<Stack gap={4}>
				<HStack justify="between" align="center" gap={3}>
					<HStack gap={2} align="center">
						<div className={styles.groupIcon}>
							<ShieldAlert size={14} />
						</div>
						<Stack gap={1}>
							<Text size="sm" weight="semibold">
								Suite Doctor
							</Text>
							<Text size="xs" color="muted">
								Shared runtime truth for Runtime Control, scripts, and developer
								routes.
							</Text>
						</Stack>
					</HStack>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						iconLeft={<RefreshCw size={12} />}
						onClick={onRefresh}
						disabled={loading || refreshing}
						aria-busy={loading || refreshing}
					>
						{refreshing ? "Refreshing..." : "Refresh doctor"}
					</Button>
				</HStack>

				{loading && !report ? (
					<div className={styles.supabaseStatusGrid} aria-hidden="true">
						<SurfaceSkeleton tone="support" height="compact" lines={3} />
						<SurfaceSkeleton tone="support" height="compact" lines={3} />
						<SurfaceSkeleton tone="support" height="compact" lines={3} />
					</div>
				) : (
					<div className={styles.supabaseStatusGrid}>
						<Panel
							variant="inset"
							padding="sm"
							className={styles.supabaseStatusCard}
						>
							<Stack gap={2}>
								<HStack justify="between" align="center" gap={2}>
									<Text size="xs" weight="semibold">
										Overall
									</Text>
									<TrustStateBadge
										state={summary.state}
										label={stateMeta.label}
									/>
								</HStack>
								<Text size="xs" color="muted">
									{summary.summary}
								</Text>
								{summary.updatedAtLabel && (
									<Text size="xs" color="muted">
										Updated: {summary.updatedAtLabel}
									</Text>
								)}
							</Stack>
						</Panel>
						<Panel
							variant="inset"
							padding="sm"
							className={styles.supabaseStatusCard}
						>
							<Stack gap={2}>
								<HStack justify="between" align="center" gap={2}>
									<Text size="xs" weight="semibold">
										Actionable issues
									</Text>
									<Badge
										color={
											summary.actionableIssueCount === 0 ? "success" : "warning"
										}
										variant="soft"
										size="sm"
									>
										{summary.actionableIssueCount === 0
											? "Clear"
											: "Needs attention"}
									</Badge>
								</HStack>
								<Text size="xs" color="muted">
									{loading && !report
										? "Suite Doctor is collecting the current workstation snapshot."
										: summary.actionableIssueCount === 0
											? "No actionable drift is active across the local stack."
											: `${summary.actionableIssueCount} shared check${summary.actionableIssueCount === 1 ? "" : "s"} still need attention.`}
								</Text>
								{summary.updatedAtLabel && (
									<Text size="xs" color="muted">
										Updated: {summary.updatedAtLabel}
									</Text>
								)}
							</Stack>
						</Panel>
						<Panel
							variant="inset"
							padding="sm"
							className={styles.supabaseStatusCard}
						>
							<Stack gap={2}>
								<HStack justify="between" align="center" gap={2}>
									<Text size="xs" weight="semibold">
										Lead recommendation
									</Text>
									<Badge color="default" variant="soft" size="sm">
										Shared doctor
									</Badge>
								</HStack>
								<Text size="xs" color="muted">
									{summary.leadDetail}
								</Text>
							</Stack>
						</Panel>
					</div>
				)}
			</Stack>
		</Panel>
	);
}

function CommandCenterSupabaseSyncPanel({
	status,
	loading,
	refreshing,
	error,
	onRefresh,
}: {
	status: SupabaseSyncStatusPayload | null;
	loading: boolean;
	refreshing: boolean;
	error: string | null;
	onRefresh: () => void;
}) {
	const lastPreflight = status?.lastPreflight ?? null;
	const lastPush = status?.lastPush ?? null;
	const isInitialStatusLoading = loading && !status && !error;
	const pushReadinessSummary =
		status?.pushReadinessSummary ||
		((loading && !status
			? "Hosted push readiness is being collected."
			: null) ??
			"Hosted push stays gated until the latest preflight says it is safe.");
	return (
		<Panel
			variant="feature"
			padding="md"
			className={styles.supabaseStatusPanel}
		>
			<Stack gap={4}>
				<HStack justify="between" align="center" gap={3}>
					<HStack gap={2} align="center">
						<div className={styles.groupIcon}>
							<CloudUpload size={14} />
						</div>
						<Stack gap={1}>
							<Text size="sm" weight="semibold">
								Hosted push readiness
							</Text>
							<Text size="xs" color="muted">
								Use this panel for Supabase preflight snapshots only. Suite
								Doctor above remains the source of truth for overall workstation
								health.
							</Text>
						</Stack>
					</HStack>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						iconLeft={<RefreshCw size={12} />}
						onClick={onRefresh}
						disabled={loading || refreshing}
						aria-busy={loading || refreshing}
					>
						{refreshing ? "Refreshing..." : "Refresh status"}
					</Button>
				</HStack>

				{error && (
					<Panel variant="inset" padding="sm">
						<Text size="xs" color="muted">
							{error}
						</Text>
					</Panel>
				)}

				{isInitialStatusLoading ? (
					<div className={styles.supabaseStatusGrid} aria-hidden="true">
						<SurfaceSkeleton tone="support" height="compact" lines={3} />
						<SurfaceSkeleton tone="support" height="compact" lines={3} />
						<SurfaceSkeleton tone="support" height="compact" lines={3} />
					</div>
				) : (
					<div className={styles.supabaseStatusGrid}>
						<StatusSummaryCard
							title="Preflight"
							record={lastPreflight}
							loading={loading}
							pendingLabel="Snapshot pending"
							readyLabel="Ready"
							errorLabel="Needs attention"
							summary={
								lastPreflight?.summary ||
								(loading && !status
									? "The latest workstation snapshot is being collected."
									: null) ||
								"Run the hosted preflight to seed the latest workstation state."
							}
						/>
						<StatusSummaryCard
							title="Push Readiness"
							record={
								lastPreflight
									? {
											ok: lastPreflight.pushReady,
											summary:
												lastPreflight.pushReadinessSummary ||
												"Hosted push readiness has not been recorded yet.",
										}
									: null
							}
							loading={loading}
							pendingLabel="Awaiting check"
							readyLabel="Ready"
							errorLabel="Needs attention"
							summary={pushReadinessSummary}
						/>
						<StatusSummaryCard
							title="Last Push"
							record={lastPush}
							loading={loading}
							pendingLabel="No push yet"
							readyLabel={lastPush?.dryRun ? "Dry run only" : "Applied"}
							errorLabel="Needs attention"
							summary={
								lastPush?.summary ||
								(loading && !status
									? "The latest hosted push snapshot is being collected."
									: null) ||
								"No hosted push has been recorded yet."
							}
						/>
					</div>
				)}

				<details className={styles.supabaseDetails}>
					<summary className={styles.supabaseDetailsSummary}>
						View technical details
					</summary>
					<div className={styles.supabaseStatusMeta}>
						<Text size="xs" color="muted">
							{lastPreflight?.checks?.mode?.message ||
								(loading && !status
									? "Supabase target details are being collected for this workstation."
									: "Active Supabase target not recorded yet.")}
						</Text>
						<Text size="xs" color="muted">
							{lastPreflight?.checks?.localEmailMode?.message ||
								(loading && !status
									? "Local auth email mode will populate after the current snapshot."
									: "Local auth email mode not recorded yet.")}
						</Text>
						{status?.paths?.root && (
							<Text size="xs" color="muted">
								Status folder:{" "}
								<span className={styles.monoCode}>{status.paths.root}</span>
							</Text>
						)}
						{status?.logTail?.length ? (
							<pre className={styles.supabaseLogPre}>
								{status.logTail.slice(-8).join("\n")}
							</pre>
						) : (
							<Text size="xs" color="muted">
								{loading && !status
									? "The sync log will appear after the current snapshot completes."
									: "No Supabase sync log entries have been written yet."}
							</Text>
						)}
					</div>
				</details>
			</Stack>
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

function StatusSummaryCard({
	title,
	record,
	pendingLabel,
	readyLabel,
	errorLabel,
	summary,
	loading = false,
}: {
	title: string;
	record: Pick<
		SupabaseSyncRun,
		"ok" | "summary" | "timestamp" | "dryRun"
	> | null;
	pendingLabel: string;
	readyLabel: string;
	errorLabel: string;
	summary: string;
	loading?: boolean;
}) {
	const hasRecord = Boolean(record);
	const isPending = loading && !hasRecord;
	const isOk = Boolean(record?.ok);
	const badgeColor = isPending
		? "default"
		: !hasRecord
			? "default"
			: isOk
				? "success"
				: "danger";
	const badgeLabel = !hasRecord
		? isPending
			? "Background"
			: "Unavailable"
		: isOk
			? readyLabel
			: errorLabel;

	return (
		<Panel variant="inset" padding="sm" className={styles.supabaseStatusCard}>
			<Stack gap={2}>
				<HStack justify="between" align="center" gap={2}>
					<Text size="xs" weight="semibold">
						{title}
					</Text>
					<Badge color={badgeColor} variant="soft" size="sm">
						{badgeLabel}
					</Badge>
				</HStack>
				<Text size="xs" color="muted">
					{hasRecord ? summary : isPending ? summary : pendingLabel}
				</Text>
				{record?.timestamp && (
					<Text size="xs" color="muted">
						Updated: {new Date(record.timestamp).toLocaleString()}
					</Text>
				)}
			</Stack>
		</Panel>
	);
}
