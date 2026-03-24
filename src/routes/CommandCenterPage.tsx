import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import { Text } from "@/components/primitives/Text";
import {
	getDevAdminEmails,
	isCommandCenterAuthorized,
	normalizeEmail,
} from "@/lib/devAccess";
import styles from "./CommandCenterPage.module.css";
import {
	CommandCenterAccessPanel,
	CommandCenterArchitectureSection,
	CommandCenterCommandsSection,
	CommandCenterTabBar,
} from "./command-center/CommandCenterSections";
import {
	COMMAND_GROUPS,
	type CommandCenterHistoryEntry,
	type CommandPreset,
	formatCommandCenterHistoryDetails,
} from "./command-center/commandCenterModel";
import { useCommandCenterHistory } from "./command-center/useCommandCenterHistory";
import { useCommandCenterTab } from "./command-center/useCommandCenterTab";
import { useSupabaseSyncStatus } from "./command-center/useSupabaseSyncStatus";

export default function CommandCenterPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();
	useRegisterPageHeader({
		title: "Command Center",
		subtitle: "Developer diagnostics and incident-oriented controls.",
	});
	const { activeTab, handleTabSelect } = useCommandCenterTab({
		searchParams,
		setSearchParams,
	});
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const userEmail = normalizeEmail(user?.email);
	const isAllowed = isCommandCenterAuthorized(user);
	const allowlist = useMemo(() => getDevAdminEmails(), []);
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
						eyebrow="Ops controls"
						summary={
							<Text size="sm" color="muted" block>
								Access to command presets and incident diagnostics is limited to
								authorized operations profiles.
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
					eyebrow="Ops controls"
					summary={
						<Text size="sm" color="muted" block>
							Copy incident commands, review the latest environment snapshot,
							and inspect architecture without leaving the operations shell.
						</Text>
					}
				/>
				<CommandCenterTabBar activeTab={activeTab} onSelect={handleTabSelect} />

				{activeTab === "commands" ? (
					<CommandCenterCommandsSection
						message={message}
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
				) : (
					<CommandCenterArchitectureSection />
				)}
			</div>
		</PageFrame>
	);
}
