import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildAgentPairingSearchFromLocation } from "@/auth/agentPairingParams";
import { useAuth } from "@/auth/useAuth";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { AgentPanelBoundary } from "@/components/agent/AgentPanelBoundary";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import {
	type TrustState,
	TrustStateBadge,
} from "@/components/apps/ui/TrustStateBadge";
import { Button } from "@/components/primitives/Button";
import { Text } from "@/components/primitives/Text";
import { logger } from "@/lib/logger";
import { agentService } from "@/services/agentService";
import { agentTaskManager } from "@/services/agentTaskManager";
import { useAgentConnectionStatus } from "@/services/useAgentConnectionStatus";
import styles from "./AgentRoutePage.module.css";

const GATEWAY_UNREACHABLE_PATTERNS = [
	/timed out/i,
	/unavailable/i,
	/failed to fetch/i,
	/network/i,
	/unable to refresh pairing status/i,
];

function shouldShowGatewayRestartHint(message: string): boolean {
	const text = String(message || "").trim();
	if (!text) return false;
	return GATEWAY_UNREACHABLE_PATTERNS.some((pattern) => pattern.test(text));
}

export default function AgentRoutePage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	useRegisterPageHeader({
		title: "Agents",
		subtitle: "Profile-driven orchestration and collaborative execution.",
	});
	const {
		healthy,
		paired,
		error: connectionError,
		refreshNow: refreshConnectionState,
	} = useAgentConnectionStatus({
		userId: user?.id ?? null,
	});
	const showGatewayRestartHint = shouldShowGatewayRestartHint(connectionError);
	const statusState =
		healthy === null ? "standby" : healthy ? "online" : "offline";
	const waitingForPairing = healthy === true && !paired;
	const statusSummary =
		statusState === "standby"
			? "The collaboration surface stays mounted while trust state settles in the background."
			: statusState === "online"
				? "Ask one agent directly or switch to a tracked crew objective when you need coordination."
				: "Local agent access is unavailable until the gateway responds.";
	const pairingSummary = paired
		? "This device is trusted for direct chat and objective runs."
		: waitingForPairing
			? "Pair this device in Settings to unlock direct chat and run objectives."
			: "Pairing becomes available as soon as the gateway trust check finishes.";
	const routeTrustState: TrustState =
		statusState === "standby"
			? "background"
			: statusState === "offline"
				? "unavailable"
				: paired
					? "ready"
					: "needs-attention";

	useEffect(() => {
		const pairingSearch = buildAgentPairingSearchFromLocation(
			location.search,
			location.hash,
		);
		if (!pairingSearch) {
			return;
		}
		navigate(
			{
				pathname: "/agent/pairing-callback",
				search: pairingSearch,
			},
			{ replace: true },
		);
	}, [location.hash, location.search, navigate]);

	const handleResetPanelCache = () => {
		try {
			agentTaskManager.clearConversationCacheForCurrentScope();
			localStorage.removeItem("agent-channel-scope");
			localStorage.removeItem("agent-active-profile");
			void refreshConnectionState();
		} catch (error) {
			logger.error(
				"Failed to reset local agent panel cache.",
				"AgentRoutePage",
				error,
			);
		}
	};

	return (
		<PageFrame maxWidth="full" padded={false}>
			<PageContextBand
				mode="hero"
				className={styles.statusPanel}
				eyebrow="Command surface"
				summary={
					<div className={styles.surfaceSummaryStack}>
						<Text
							size="sm"
							color="muted"
							block
							className={styles.surfaceSummary}
						>
							{statusSummary}
						</Text>
						<Text size="xs" color="muted" block className={styles.surfaceHint}>
							{pairingSummary}
						</Text>
					</div>
				}
				meta={
					<TrustStateBadge
						state={routeTrustState}
						label={
							routeTrustState === "ready"
								? "Agent access ready"
								: routeTrustState === "needs-attention"
									? "Pairing required"
									: routeTrustState === "unavailable"
										? "Gateway unavailable"
										: "Trust state settling"
						}
					/>
				}
				actions={
					<>
						{waitingForPairing ? (
							<Button
								size="sm"
								variant="secondary"
								onClick={() => navigate("/app/settings")}
							>
								Open Settings
							</Button>
						) : null}
						{statusState !== "online" || Boolean(connectionError) ? (
							<Button
								size="sm"
								variant="outline"
								iconLeft={<RefreshCw size={14} />}
								onClick={() => void refreshConnectionState()}
							>
								Refresh trust state
							</Button>
						) : null}
					</>
				}
			>
				{connectionError ? (
					<p className={styles.errorText}>{connectionError}</p>
				) : null}
				{showGatewayRestartHint ? (
					<p className={styles.hintText}>
						Start or restart the local gateway with{" "}
						<code className={styles.inlineCode}>npm run gateway:dev</code>, then
						refresh trust state.
					</p>
				) : null}
			</PageContextBand>

			<div className={styles.chatWrap}>
				<AgentPanelBoundary onResetPanelCache={handleResetPanelCache}>
					<AgentChatPanel healthy={healthy} paired={paired} />
				</AgentPanelBoundary>
			</div>
		</PageFrame>
	);
}
