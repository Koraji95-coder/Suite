import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { TrustStateBadge } from "@/components/apps/ui/TrustStateBadge";
import { Badge } from "@/components/primitives/Badge";
import { Text } from "@/components/primitives/Text";
import { useSuiteRuntimeDoctor } from "@/hooks/useSuiteRuntimeDoctor";
import {
	getDevAdminEmails,
	isCommandCenterAuthorized,
	normalizeEmail,
} from "@/lib/devAccess";
import { resolveSuiteDoctorDisplayState } from "@/lib/suiteDoctorPresentation";
import styles from "./CommandCenterPage.module.css";
import {
	CommandCenterAccessPanel,
	CommandCenterCommandsSection,
} from "./command-center/CommandCenterSections";
import {
	COMMAND_GROUPS,
	type CommandCenterHistoryEntry,
	type CommandPreset,
	formatCommandCenterHistoryDetails,
} from "./command-center/commandCenterModel";
import { useCommandCenterHistory } from "./command-center/useCommandCenterHistory";
import { useSupabaseSyncStatus } from "./command-center/useSupabaseSyncStatus";

export default function CommandCenterPage() {
	const { user } = useAuth();
	useRegisterPageHeader({
		title: "Command Center",
		subtitle: "Developer diagnostics and incident-oriented controls.",
	});
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const userEmail = normalizeEmail(user?.email);
	const isAllowed = isCommandCenterAuthorized(user);
	const allowlist = useMemo(() => getDevAdminEmails(), []);
	const {
		report: suiteDoctorReport,
		loading: suiteDoctorLoading,
		refreshing: suiteDoctorRefreshing,
		refreshNow: refreshSuiteDoctor,
	} = useSuiteRuntimeDoctor({ enabled: isAllowed });
	const {
		commandHistory,
		historyFilter,
		setHistoryFilter,
		appendHistory,
		clearHistory,
		visibleHistoryEntries,
	} = useCommandCenterHistory({
		enabled: isAllowed,
		onLoadError: setMessage,
	});
	const {
		status: supabaseSyncStatus,
		loading: supabaseSyncStatusLoading,
		refreshing: supabaseSyncStatusRefreshing,
		error: supabaseSyncStatusError,
		refresh: refreshSupabaseSyncStatus,
	} = useSupabaseSyncStatus(isAllowed);
	const suiteDoctorState = resolveSuiteDoctorDisplayState(
		suiteDoctorReport,
		suiteDoctorLoading,
	);

	const copyCommand = useCallback(
		async (preset: CommandPreset) => {
			try {
				await navigator.clipboard.writeText(preset.command);
				setCopiedId(preset.id);
				window.setTimeout(() => {
					setCopiedId((current) => (current === preset.id ? null : current));
				}, 1500);
				appendHistory({
					category: "Commands",
					action: "command_copied",
					title: `Copied command: ${preset.name}`,
					detailsText: formatCommandCenterHistoryDetails({
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
		},
		[appendHistory],
	);

	const copyHistoryDetails = useCallback(
		async (entry: CommandCenterHistoryEntry) => {
			try {
				await navigator.clipboard.writeText(entry.detailsText || "");
				setCopiedHistoryId(entry.id);
				window.setTimeout(() => {
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
		},
		[],
	);

	const handleClearHistory = useCallback(async () => {
		await clearHistory();
		setMessage("Command Center history cleared.");
	}, [clearHistory]);

	const handleRefreshSupabaseSyncStatus = useCallback(() => {
		refreshSupabaseSyncStatus();
		appendHistory({
			category: "System",
			action: "supabase_sync_status_refreshed",
			title: "Refreshed Supabase sync status",
			detailsText:
				"Loaded the latest Windows sign-in preflight and hosted push artifacts.",
		});
	}, [appendHistory, refreshSupabaseSyncStatus]);

	if (!isAllowed) {
		return (
			<PageFrame maxWidth="full">
				<div className={styles.rootNarrow}>
					<PageContextBand
						eyebrow="Developer controls"
						summary={
							<Text size="sm" color="muted" block>
								Access to command presets and incident diagnostics is limited to
								authorized developer profiles.
							</Text>
						}
					/>
					<CommandCenterAccessPanel
						userEmail={userEmail}
						allowlist={allowlist}
					/>
				</div>
			</PageFrame>
		);
	}

	return (
		<PageFrame maxWidth="full">
			<div className={styles.rootWide}>
				<PageContextBand
					mode="compact"
					eyebrow="Developer toolshed"
					summary={
						<Text size="sm" color="muted" block>
							Use Suite Doctor as the shared runtime truth, keep Runtime Control
							as the local workstation front door, and use this toolshed for
							hosted push readiness, copied incident commands, and
							route-specific diagnostics when deeper investigation is actually
							needed.
						</Text>
					}
					meta={
						<div className={styles.contextMeta}>
							<TrustStateBadge state={suiteDoctorState} label="Suite doctor" />
							<Badge color="default" variant="soft" size="sm">
								{suiteDoctorLoading
									? "Snapshot pending"
									: suiteDoctorReport
										? `${suiteDoctorReport.actionableIssueCount} issue${suiteDoctorReport.actionableIssueCount === 1 ? "" : "s"}`
										: "No snapshot"}
							</Badge>
						</div>
					}
				/>

				<CommandCenterCommandsSection
					message={message}
					suiteDoctorReport={suiteDoctorReport}
					suiteDoctorLoading={suiteDoctorLoading}
					suiteDoctorRefreshing={suiteDoctorRefreshing}
					onRefreshSuiteDoctor={() => void refreshSuiteDoctor("manual")}
					commandGroups={COMMAND_GROUPS}
					supabaseSyncStatus={supabaseSyncStatus}
					supabaseSyncStatusLoading={supabaseSyncStatusLoading}
					supabaseSyncStatusRefreshing={supabaseSyncStatusRefreshing}
					supabaseSyncStatusError={supabaseSyncStatusError}
					onRefreshSupabaseSyncStatus={handleRefreshSupabaseSyncStatus}
					copiedPresetId={copiedId}
					onCopyCommand={(preset) => void copyCommand(preset)}
					historyFilter={historyFilter}
					onHistoryFilterChange={setHistoryFilter}
					commandHistoryLength={commandHistory.length}
					visibleHistoryEntries={visibleHistoryEntries}
					copiedHistoryId={copiedHistoryId}
					onCopyHistoryDetails={(entry) => void copyHistoryDetails(entry)}
					onClearHistory={() => void handleClearHistory()}
				/>
			</div>
		</PageFrame>
	);
}
