import { RefreshCw, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { hexToRgba, useTheme } from "@/lib/palette";
import { agentService } from "@/services/agentService";

export default function AgentRoutePage() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const { palette } = useTheme();
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
		<PageFrame title="Agent" subtitle="AI-powered task orchestration">
			<div
				className="rounded-xl border"
				style={{
					borderColor: hexToRgba(palette.text, 0.06),
					background: hexToRgba(palette.surface, 0.5),
				}}
			>
				<div
					className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
					style={{ color: hexToRgba(palette.text, 0.6) }}
				>
					<div className="flex flex-wrap items-center gap-3">
						<span className="flex items-center gap-1.5">
							<span
								className="h-1.5 w-1.5 rounded-full"
								style={{
									background:
										healthy === null
											? "var(--text-muted)"
											: healthy
												? "var(--success)"
												: "var(--danger)",
								}}
							/>
							{healthy === null ? "Checking" : healthy ? "Online" : "Offline"}
						</span>
						<span
							className="h-3"
							style={{ borderLeft: `1px solid ${hexToRgba(palette.text, 0.1)}` }}
						/>
						<span className="flex items-center gap-1.5">
							<span
								className="h-1.5 w-1.5 rounded-full"
								style={{
									background: paired ? "var(--success)" : "var(--warning)",
								}}
							/>
							{paired ? "Paired" : "Not paired"}
						</span>
						<span style={{ color: hexToRgba(palette.text, 0.35) }}>
							{agentService.getEndpoint()}
						</span>
					</div>

					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void refreshConnectionState()}
							className="inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:[background:var(--surface)]"
							style={{
								borderColor: hexToRgba(palette.text, 0.16),
								color: hexToRgba(palette.text, 0.7),
							}}
						>
							<RefreshCw size={12} />
							Refresh
						</button>

						<button
							type="button"
							onClick={() => navigate("/app/settings")}
							className="inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:[background:var(--surface)]"
							style={{
								borderColor: hexToRgba(palette.primary, 0.35),
								color: palette.primary,
							}}
						>
							<Settings2 size={12} />
							Manage Pairing
						</button>
					</div>
				</div>
			</div>

			<div style={{ minHeight: 480, height: "clamp(480px, 68dvh, 960px)" }}>
				<AgentChatPanel healthy={isReady} paired={paired} />
			</div>
		</PageFrame>
	);
}
