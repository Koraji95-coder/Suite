import { RefreshCw, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { cn } from "@/lib/utils";
import { agentService } from "@/services/agentService";
import styles from "./AgentRoutePage.module.css";

export default function AgentRoutePage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const [healthy, setHealthy] = useState<boolean | null>(null);
	const [paired, setPaired] = useState(false);
	const userId = user?.id ?? null;

	const refreshConnectionState = useCallback(async () => {
		const isHealthy = await agentService.healthCheck();
		setHealthy(isHealthy);

		if (isHealthy && userId) {
			await agentService.restorePairingForActiveUser();
		}

		const pairedState = await agentService.refreshPairingStatus();
		setPaired(pairedState);
	}, [userId]);

	useEffect(() => {
		void refreshConnectionState();
	}, [refreshConnectionState]);

	useEffect(() => {
		if (healthy === true && paired) return;
		const timer = window.setInterval(() => {
			void refreshConnectionState();
		}, 5000);
		return () => window.clearInterval(timer);
	}, [healthy, paired, refreshConnectionState]);

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (!params.has("agent_challenge") && !params.has("agent_action")) {
			return;
		}
		navigate(
			{
				pathname: "/app/settings",
				search: location.search,
			},
			{ replace: true },
		);
	}, [location.search, navigate]);

	const isReady = healthy === true && paired;

	return (
		<PageFrame title="Agent" description="AI-powered task orchestration">
			<div className={styles.statusPanel}>
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
							Refresh
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
			</div>

			<div className={styles.chatWrap}>
				<AgentChatPanel healthy={isReady} paired={paired} />
			</div>
		</PageFrame>
	);
}
