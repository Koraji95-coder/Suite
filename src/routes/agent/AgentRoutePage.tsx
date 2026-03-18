import { RefreshCw, Settings2 } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { buildAgentPairingSearchFromLocation } from "@/auth/agentPairingParams";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { AgentPanelBoundary } from "@/components/agent/AgentPanelBoundary";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
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
	const {
		healthy,
		paired,
		error: connectionError,
		refreshNow: refreshConnectionState,
	} =
		useAgentConnectionStatus({
			userId: user?.id ?? null,
		});
	const showGatewayRestartHint = shouldShowGatewayRestartHint(connectionError);
	const statusLabel = healthy === null ? "Checking bridge" : healthy ? "Online" : "Offline";
	const statusSummary =
		healthy === null
			? "Verifying gateway reachability and broker link."
			: healthy
				? "Gateway and broker transport are reachable."
				: "Gateway or broker transport is unreachable.";
	const pairingSummary = paired
		? "Paired session ready for orchestration and direct chat."
		: "Pairing required before agent actions can run.";

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
			logger.error("Failed to reset local agent panel cache.", "AgentRoutePage", error);
		}
	};

	return (
		<PageFrame
			title="Agent"
			description="Profile-based AI orchestration and automation"
			maxWidth="full"
			padded={false}
		>
			<section className={styles.statusPanel}>
				<div className={styles.surfaceHeader}>
					<div>
						<p className={styles.eyebrow}>Command surface</p>
						<h2 className={styles.surfaceTitle}>Agent operations center</h2>
						<p className={styles.surfaceCopy}>
							Manage route health, pairing state, and live orchestration in one
							control lane.
						</p>
					</div>
					<div className={styles.surfaceChips}>
						<span className={styles.surfaceChip}>{statusLabel}</span>
						<span className={styles.surfaceChip}>
							{paired ? "Paired session" : "Pairing required"}
						</span>
					</div>
				</div>
				<div className={styles.metricsGrid}>
					<article className={styles.metricCard}>
						<p className={styles.metricLabel}>Gateway state</p>
						<p className={styles.metricValue}>{statusLabel}</p>
						<p className={styles.metricCopy}>{statusSummary}</p>
					</article>
					<article className={styles.metricCard}>
						<p className={styles.metricLabel}>Pairing state</p>
						<p className={styles.metricValue}>
							{paired ? "Session paired" : "Pending pairing"}
						</p>
						<p className={styles.metricCopy}>{pairingSummary}</p>
					</article>
					<article className={styles.metricCard}>
						<p className={styles.metricLabel}>Active endpoint</p>
						<p className={styles.metricValue}>Bridge target</p>
						<p className={styles.metricCopy}>{agentService.getEndpoint()}</p>
					</article>
				</div>
				<div className={styles.statusRow}>
					<div className={styles.statusInfo}>
						<span className={styles.statusItem}>
							<span
								className={cn(
									styles.statusDot,
									healthy === null && styles.statusUnknown,
									healthy === true && styles.statusOnline,
									healthy === false && styles.statusOffline,
								)}
							/>
							{healthy === null ? "Checking" : healthy ? "Online" : "Offline"}
						</span>
						<span className={styles.separator} />
						<span className={styles.statusItem}>
							<span
								className={cn(
									styles.statusDot,
									paired
										? styles.statusPairingReady
										: styles.statusPairingPending,
								)}
							/>
							{paired ? "Paired" : "Not paired"}
						</span>
						<span className={styles.endpoint}>
							{agentService.getEndpoint()}
						</span>
					</div>

					<div className={styles.actions}>
						<button
							type="button"
							onClick={() => void refreshConnectionState()}
							className={styles.button}
						>
							<RefreshCw className={styles.buttonIcon} />
							Refresh state
						</button>

						<button
							type="button"
							onClick={() => navigate("/app/settings")}
							className={cn(styles.button, styles.buttonPrimary)}
						>
							<Settings2 className={styles.buttonIcon} />
							Manage Pairing
						</button>
					</div>
				</div>
				{connectionError ? (
					<p className={styles.errorText}>{connectionError}</p>
				) : null}
				{showGatewayRestartHint ? (
					<p className={styles.hintText}>
						Start or restart the local gateway with{" "}
						<code className={styles.inlineCode}>npm run gateway:dev</code>, then
						click Refresh state.
					</p>
				) : null}
			</section>

			<div className={styles.chatWrap}>
				<AgentPanelBoundary onResetPanelCache={handleResetPanelCache}>
					<AgentChatPanel healthy={healthy === true} paired={paired} />
				</AgentPanelBoundary>
			</div>
		</PageFrame>
	);
}
