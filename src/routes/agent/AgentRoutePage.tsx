import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentProfile } from "@/agent/AgentProfileContext";
import { useAuth } from "@/auth/useAuth";
import { useAppLoadingScope } from "@/components/apps/ui/AppLoadingContext";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import type { PanelInfoDefinition } from "@/data/panelInfoRegistry";
import { useStableLoading } from "@/hooks/useStableLoading";
import { logger } from "@/lib/logger";
import { AgentTaskPanel } from "@/services/AgentTaskPanel";
import { agentService } from "@/services/agentService";
import {
	agentTaskManager,
	type ExecutedTask,
} from "@/services/agentTaskManager";

const PAIRING_REFRESH_EVENT_KEY = "suite_agent_pairing_refresh";

const serializeResult = (payload: unknown): string => {
	if (!payload) {
		return "Task completed without response payload.";
	}
	if (typeof payload === "string") {
		return payload;
	}
	try {
		return JSON.stringify(payload, null, 2);
	} catch {
		return String(payload);
	}
};

export default function AgentRoutePage() {
	const { user } = useAuth();
	const { activeProfile } = useAgentProfile();
	const userId = user?.id ?? null;
	const [healthy, setHealthy] = useState<boolean | null>(null);
	const [paired, setPaired] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [isExecuting, setIsExecuting] = useState(false);
	const [history, setHistory] = useState<ExecutedTask[]>([]);
	const [activeTaskName, setActiveTaskName] = useState<string | null>(null);
	const [latestError, setLatestError] = useState<string | null>(null);
	const [healthError, setHealthError] = useState<string | null>(null);
	const [statusReady, setStatusReady] = useState(false);
	const [pairingStatusMessage, setPairingStatusMessage] = useState<
		string | null
	>(null);
	const refreshInFlightRef = useRef(false);
	const hasAttemptedRestoreRef = useRef(false);

	const refreshHistory = useCallback(() => {
		const recent = agentTaskManager.getRecentTasks(12);
		setHistory(recent);
	}, []);

	useEffect(() => {
		agentTaskManager.setProfileScope(activeProfile.id);
		refreshHistory();
	}, [activeProfile.id, refreshHistory]);

	const refreshConnectionState = useCallback(async () => {
		if (refreshInFlightRef.current) {
			logger.debug(
				"refreshConnectionState skipped; previous refresh still running",
				"AgentDiag",
			);
			return;
		}
		refreshInFlightRef.current = true;
		logger.debug("refreshConnectionState started", "AgentDiag", {
			user_id_present: Boolean(userId),
			mode: agentService.usesBroker() ? "broker" : "direct",
			endpoint: agentService.getEndpoint(),
		});
		try {
			const isHealthy = await agentService.healthCheck();
			setHealthy(isHealthy);
			setHealthError(agentService.getLastHealthError());

			let pairedState = false;
			if (isHealthy && userId) {
				if (!hasAttemptedRestoreRef.current) {
					hasAttemptedRestoreRef.current = true;
					setIsRestoring(true);
					try {
						const restored = await agentService.restorePairingForActiveUser();
						pairedState = restored.restored;
					} finally {
						setIsRestoring(false);
					}
				} else {
					pairedState = await agentService.refreshPairingStatus();
				}
			} else {
				setIsRestoring(false);
				pairedState = await agentService.refreshPairingStatus();
			}

			setPaired(pairedState);
			setPairingStatusMessage(
				agentService.usesBroker() ? agentService.getLastPairingMessage() : null,
			);
			refreshHistory();
			logger.debug("refreshConnectionState completed", "AgentDiag", {
				healthy: isHealthy,
				paired: pairedState,
				health_error: agentService.getLastHealthError(),
				history_count: agentTaskManager.getRecentTasks(12).length,
			});
		} finally {
			refreshInFlightRef.current = false;
			setStatusReady(true);
		}
	}, [refreshHistory, userId]);

	useEffect(() => {
		void refreshConnectionState();
	}, [refreshConnectionState]);

	useEffect(() => {
		if (agentService.usesBroker() && !userId) return;

		const timer = window.setInterval(() => {
			if (document.visibilityState !== "visible") return;
			void refreshConnectionState();
		}, 10000);

		const handleVisibility = () => {
			if (document.visibilityState === "visible") {
				void refreshConnectionState();
			}
		};
		document.addEventListener("visibilitychange", handleVisibility);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", handleVisibility);
		};
	}, [refreshConnectionState, userId]);

	useEffect(() => {
		const handleStorage = (event: StorageEvent) => {
			if (event.key !== PAIRING_REFRESH_EVENT_KEY) return;
			setPairingStatusMessage("Pairing completed from secure link.");
			void refreshConnectionState();
		};
		window.addEventListener("storage", handleStorage);
		return () => {
			window.removeEventListener("storage", handleStorage);
		};
	}, [refreshConnectionState]);

	const clearHistory = () => {
		agentTaskManager.clearHistory();
		setHistory([]);
	};

	const handleExecuteTask = async (
		prompt: string,
		taskName: string,
	): Promise<{ success: boolean; text: string }> => {
		const trimmedPrompt = prompt.trim();
		if (!trimmedPrompt) return { success: false, text: "Prompt is required." };
		if (!healthy || !paired || isRestoring) {
			const statusReasons: string[] = [];
			if (!healthy) statusReasons.push("gateway is offline");
			if (!paired) {
				statusReasons.push(
					pairingStatusMessage || "agent is not paired for this session",
				);
			}
			if (isRestoring) statusReasons.push("trusted pairing is still restoring");
			const message = `Gateway not ready: ${statusReasons.join("; ")}.`;
			setLatestError(message);
			return { success: false, text: message };
		}

		const taskId = "chat-task";
		setIsExecuting(true);
		setActiveTaskName(taskName);
		setLatestError(null);

		const taskRecord = agentTaskManager.createTaskRecord(taskId, trimmedPrompt);
		taskRecord.status = "running";
		taskRecord.name = taskName;
		agentTaskManager.saveTaskToHistory(taskRecord);
		refreshHistory();

		try {
			const response = await agentService.sendMessage(trimmedPrompt, {
				profileId: activeProfile.id,
				memoryNamespace: activeProfile.memoryNamespace,
				docsUrl: activeProfile.docsUrl,
			});
			if (response.success) {
				const resultText = serializeResult(response.data);
				agentTaskManager.updateTaskResult(
					taskRecord.id,
					resultText,
					"complete",
				);
				return { success: true, text: resultText };
			}
			const rawError = response.error || "Agent request failed";
			const errorMessage = /timed out|gateway unavailable/i.test(rawError)
				? `${rawError} Verify the local gateway is online and that the selected model is available.`
				: rawError;
			agentTaskManager.updateTaskResult(
				taskRecord.id,
				errorMessage,
				"failed",
				errorMessage,
			);
			setLatestError(errorMessage);
			return { success: false, text: errorMessage };
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: "Unknown agent execution error";
			agentTaskManager.updateTaskResult(
				taskRecord.id,
				errorMessage,
				"failed",
				errorMessage,
			);
			setLatestError(errorMessage);
			return { success: false, text: errorMessage };
		} finally {
			refreshHistory();
			setIsExecuting(false);
		}
	};

	const healthLabel =
		healthy == null
			? "Checking gateway..."
			: healthy
				? "Gateway online"
				: "Gateway offline";
	const canRunAgent = Boolean(statusReady && healthy && paired && !isRestoring);
	const isStatusLoading = useStableLoading(!statusReady, { minVisibleMs: 240 });
	useAppLoadingScope("agent-route-core", isStatusLoading);
	const successBadgeClass =
		"[border-color:color-mix(in_srgb,var(--success)_60%,var(--border))] [background:color-mix(in_srgb,var(--success)_14%,transparent)] [color:var(--success)]";
	const gatewayBadgeClass =
		healthy == null
			? "[border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)]"
			: healthy
				? successBadgeClass
				: "[border-color:color-mix(in_srgb,var(--danger)_60%,var(--border))] [background:color-mix(in_srgb,var(--danger)_14%,transparent)] [color:var(--danger)]";
	const pairedBadgeClass = paired
		? successBadgeClass
		: "[border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)]";
	const agentPanelInfo = useMemo<PanelInfoDefinition>(
		() => ({
			title: `${activeProfile.name} Info`,
			sections: [
				{
					title: "Active Agent Profile",
					content: [
						`Name: ${activeProfile.name}`,
						`Model: ${activeProfile.modelId}`,
						`Memory Namespace: ${activeProfile.memoryNamespace}`,
						activeProfile.docsUrl
							? `Docs: ${activeProfile.docsUrl}`
							: "Docs: Not linked",
					],
				},
				{
					title: "Prompt Recipe (Best Results)",
					content: [
						"1) Goal: state exact output you want",
						"2) Context: include project, file paths, standards, constraints",
						"3) Format: define response shape (steps/table/checklist/code)",
						"4) Acceptance: say how to validate success",
						"5) Boundaries: what it must not change/assume",
					],
					tips: [
						"Ask for a plan first, then execution.",
						"Provide example input/output when possible.",
						"Request explicit assumptions before it proceeds.",
					],
				},
				{
					title: "Memory Behavior",
					content: [
						"Each agent profile uses isolated memory context.",
						"Conversation/task history is also split per profile.",
						"Switch profiles to avoid cross-domain contamination.",
					],
				},
				{
					title: "Pairing Controls",
					content:
						"Pairing and new code generation are managed in Settings > Account.",
				},
			],
		}),
		[activeProfile],
	);

	return (
		<PageFrame
			title={`${activeProfile.name}`}
			subtitle="Chat workspace only. If you need pairing or a new code, open Settings > Account."
			panelInfo={agentPanelInfo}
		>
			<div className="space-y-3">
				<div className="min-h-[118px] rounded-2xl border p-3.5 [border-color:color-mix(in_srgb,var(--primary)_28%,var(--border))] [background:linear-gradient(150deg,color-mix(in_srgb,var(--surface)_90%,transparent),color-mix(in_srgb,var(--surface-2)_90%,transparent))] shadow-[var(--shadow-command)]">
					{isStatusLoading ? (
						<div className="grid gap-2">
							<div className="flex flex-wrap items-center gap-2">
								<div className="h-6 w-36 animate-pulse rounded-full border [border-color:var(--border)] [background:var(--surface)]" />
								<div className="h-6 w-28 animate-pulse rounded-full border [border-color:var(--border)] [background:var(--surface)]" />
							</div>
							<div className="h-11 animate-pulse rounded-xl border [border-color:var(--border)] [background:color-mix(in_srgb,var(--surface-2)_84%,transparent)]" />
						</div>
					) : (
						<div className="grid gap-2">
							<div className="flex flex-wrap items-center gap-2 text-xs">
								<span
									className={`rounded-full border px-3 py-1 ${gatewayBadgeClass}`}
								>
									{healthLabel}
								</span>
								<span
									className={`rounded-full border px-3 py-1 ${pairedBadgeClass}`}
								>
									{paired ? "Paired" : "Not paired"}
								</span>
								<span className="text-xs [color:var(--text-muted)]">
									Need pairing or a fresh code? Go to Settings {" > "} Account.
								</span>
							</div>
							{statusReady && !canRunAgent ? (
								<div className="rounded-xl border p-3 text-xs [border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)]">
									<div className="font-medium [color:var(--text)]">
										Chat is blocked until gateway and pairing are ready.
									</div>
									{pairingStatusMessage ? (
										<div className="mt-1">{pairingStatusMessage}</div>
									) : null}
									{healthError ? (
										<div className="mt-1 [color:var(--danger)]">
											{healthError}
										</div>
									) : null}
								</div>
							) : (
								<div className="rounded-xl border p-3 text-xs [border-color:color-mix(in_srgb,var(--success)_28%,var(--border))] [background:color-mix(in_srgb,var(--success)_8%,transparent)] [color:var(--text-muted)]">
									Gateway and pairing are ready. {activeProfile.shortName} can
									execute tasks.
								</div>
							)}
						</div>
					)}
				</div>

				{latestError ? (
					<div className="rounded-xl border p-3 text-xs [border-color:var(--danger)] [background:color-mix(in_srgb,var(--danger)_18%,transparent)] [color:var(--danger)]">
						{latestError}
					</div>
				) : null}

				<AgentTaskPanel
					onExecuteTask={handleExecuteTask}
					isExecuting={isExecuting}
					activeTaskName={activeTaskName}
					history={history}
					onClearHistory={clearHistory}
					agentName={activeProfile.name}
					agentShortName={activeProfile.shortName}
					agentTagline={activeProfile.tagline}
					agentProfileId={activeProfile.id}
				/>
			</div>
		</PageFrame>
	);
}
