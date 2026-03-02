import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
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
	const [pairingCode, setPairingCode] = useState("");
	const [isPairing, setIsPairing] = useState(false);
	const [pairingError, setPairingError] = useState<string | null>(null);
	const [pairingNotice, setPairingNotice] = useState<string | null>(null);
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

	const clearPairingChallengeParams = useCallback(() => {
		const params = new URLSearchParams(location.search);
		if (!params.has("agent_challenge") && !params.has("agent_action")) return;
		params.delete("agent_challenge");
		params.delete("agent_action");
		const search = params.toString();
		navigate(
			{
				pathname: location.pathname,
				search: search ? `?${search}` : "",
			},
			{ replace: true },
		);
	}, [location.pathname, location.search, navigate]);

	useEffect(() => {
		if (!userId) return;
		const params = new URLSearchParams(location.search);
		const challengeId = (params.get("agent_challenge") || "").trim();
		const action = (params.get("agent_action") || "").trim().toLowerCase();
		if (!challengeId || (action !== "pair" && action !== "unpair")) return;

		let active = true;
		const confirm = async () => {
			setPairingError(null);
			setPairingNotice(
				action === "pair"
					? "Verifying pair request..."
					: "Verifying unpair request...",
			);
			setIsPairing(true);
			try {
				await agentService.confirmPairingVerification(
					action,
					challengeId,
				);
				if (!active) return;
				setPairingNotice(
					action === "pair"
						? "Pairing verified. Agent access is active."
						: "Unpair verified. Agent access has been removed.",
				);
			} catch (error) {
				if (!active) return;
				const message =
					error instanceof Error
						? error.message
						: "Unable to verify pairing action.";
				setPairingError(message);
				setPairingNotice(null);
			} finally {
				await refreshConnectionState();
				if (active) {
					setIsPairing(false);
					clearPairingChallengeParams();
				}
			}
		};

		void confirm();
		return () => {
			active = false;
		};
	}, [
		clearPairingChallengeParams,
		location.search,
		refreshConnectionState,
		userId,
	]);

	const pairAgent = async () => {
		const code = pairingCode.trim();
		if (!code) {
			setPairingError("Enter your pairing code.");
			return;
		}
		setPairingError(null);
		setPairingNotice(null);
		setIsPairing(true);
		try {
			await agentService.requestPairingVerificationLink("pair", code);
			setPairingNotice(
				"Verification link sent. Open it from your email to finish pairing.",
			);
			setPairingCode("");
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to send pairing verification link.";
			setPairingError(message);
		}
		setIsPairing(false);
	};

	const unpairAgent = async () => {
		setPairingError(null);
		setPairingNotice(null);
		setIsPairing(true);
		try {
			await agentService.requestPairingVerificationLink("unpair");
			setPairingNotice(
				"Verification link sent. Open it from your email to finish unpairing.",
			);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to send unpair verification link.";
			setPairingError(message);
		}
		setIsPairing(false);
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
								onChange={(e) => {
									const digitsOnly = e.target.value.replace(/\D+/g, "");
									setPairingCode(digitsOnly.slice(0, 6));
								}}
								placeholder="Pairing code"
								autoComplete="off"
								inputMode="numeric"
								pattern="[0-9]{6}"
								maxLength={6}
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
								disabled={isPairing || !paired}
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
							{pairingNotice && (
								<span className="text-xs" style={{ color: "var(--success)" }}>
									{pairingNotice}
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
			<div style={{ minHeight: 480, height: "clamp(480px, 68dvh, 960px)" }}>
				<AgentChatPanel healthy={isReady} paired={paired} />
			</div>
		</PageFrame>
	);
}
