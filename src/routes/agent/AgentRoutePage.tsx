import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/auth/useAuth";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { hexToRgba, useTheme } from "@/lib/palette";
import { agentService } from "@/services/agentService";

export default function AgentRoutePage() {
	const { user } = useAuth();
	const { palette } = useTheme();
	const [healthy, setHealthy] = useState<boolean | null>(null);
	const [paired, setPaired] = useState(false);
	const [pairingCode, setPairingCode] = useState("");
	const [isPairing, setIsPairing] = useState(false);
	const [pairingError, setPairingError] = useState<string | null>(null);
	const [showPairing, setShowPairing] = useState(false);
	const userId = user?.id ?? null;

	const refreshConnectionState = useCallback(async () => {
		const isHealthy = await agentService.healthCheck();
		setHealthy(isHealthy);

		if (isHealthy && userId) {
			await agentService.restorePairingForActiveUser();
		}

		const pairedState = await agentService.refreshPairingStatus();
		setPaired(pairedState);

		if (!isHealthy || !pairedState) {
			setShowPairing(true);
		}
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

	const pairAgent = async () => {
		const code = pairingCode.trim();
		if (!code) {
			setPairingError("Enter your pairing code.");
			return;
		}
		setPairingError(null);
		setIsPairing(true);
		const ok = await agentService.pair(code);
		if (!ok) {
			setPairingError("Pairing failed. Check code and gateway.");
		}
		await refreshConnectionState();
		setIsPairing(false);
	};

	const unpairAgent = async () => {
		await agentService.unpair();
		setPaired(false);
	};

	const isReady = healthy === true && paired;

	return (
		<PageFrame title="Agent" subtitle="AI-powered task orchestration">
			{/* Connection strip */}
			<div
				className="rounded-xl border"
				style={{
					borderColor: hexToRgba(palette.text, 0.06),
					background: hexToRgba(palette.surface, 0.5),
				}}
			>
				<button
					type="button"
					onClick={() => setShowPairing((p) => !p)}
					className="flex w-full items-center justify-between px-4 py-2.5 text-xs"
					style={{ color: hexToRgba(palette.text, 0.6) }}
				>
					<div className="flex items-center gap-3">
						<span className="flex items-center gap-1.5">
							<span
								className="h-1.5 w-1.5 rounded-full"
								style={{
									background: healthy ? "var(--success)" : "var(--danger)",
								}}
							/>
							{healthy === null
								? "Checking..."
								: healthy
									? "Online"
									: "Offline"}
						</span>
						<span
							className="h-3"
							style={{
								borderLeft: `1px solid ${hexToRgba(palette.text, 0.1)}`,
							}}
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
						<span style={{ color: hexToRgba(palette.text, 0.3) }}>
							{agentService.getEndpoint()}
						</span>
					</div>
					{showPairing ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
				</button>

				{showPairing && (
					<div
						className="border-t px-4 py-3"
						style={{ borderColor: hexToRgba(palette.text, 0.06) }}
					>
						<div className="flex flex-wrap items-center gap-2">
							<input
								type="text"
								value={pairingCode}
								onChange={(e) => setPairingCode(e.target.value)}
								placeholder="Pairing code"
								className="w-36 rounded-lg border px-3 py-1.5 text-xs outline-none transition"
								style={{
									borderColor: hexToRgba(palette.text, 0.1),
									background: palette.surface,
									color: palette.text,
								}}
								onFocus={(e) => {
									e.currentTarget.style.borderColor = palette.primary;
								}}
								onBlur={(e) => {
									e.currentTarget.style.borderColor = hexToRgba(
										palette.text,
										0.1,
									);
								}}
							/>
							<button
								type="button"
								onClick={() => void pairAgent()}
								disabled={isPairing || !healthy}
								className="rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-40"
								style={{
									borderColor: hexToRgba(palette.primary, 0.3),
									color: palette.primary,
								}}
							>
								{isPairing ? "Pairing..." : "Pair"}
							</button>
							<button
								type="button"
								onClick={() => void unpairAgent()}
								disabled={!paired}
								className="rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-40"
								style={{
									borderColor: hexToRgba(palette.text, 0.1),
									color: hexToRgba(palette.text, 0.6),
								}}
							>
								Unpair
							</button>
							<button
								type="button"
								onClick={() => void refreshConnectionState()}
								className="rounded-lg p-1.5 transition"
								style={{ color: hexToRgba(palette.text, 0.4) }}
							>
								<RefreshCw size={14} />
							</button>
							{pairingError && (
								<span className="text-xs" style={{ color: "var(--danger)" }}>
									{pairingError}
								</span>
							)}
						</div>
						{!healthy && healthy !== null && (
							<p
								className="mt-2 text-xs"
								style={{ color: hexToRgba(palette.text, 0.4) }}
							>
								Start ZeroClaw gateway locally on port 3000, then click the
								refresh button.
							</p>
						)}
					</div>
				)}
			</div>

			{/* Chat panel */}
			<div style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
				<AgentChatPanel healthy={isReady} paired={paired} />
			</div>
		</PageFrame>
	);
}
