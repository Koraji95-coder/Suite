import {
	AlertCircle,
	Bot,
	CheckCircle2,
	Loader2,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import { AgentOrbitLoader } from "@/components/agent/AgentOrbitLoader";
import {
	buildAgentPairingSearchFromLocation,
	extractAgentPairingParamsFromLocation,
} from "@/auth/agentPairingParams";
import { cn } from "@/lib/utils";
import { type AgentPairingAction, agentService } from "@/services/agentService";
import styles from "./AgentPairingCallbackPage.module.css";

type PairingPhase =
	| "loading-auth"
	| "needs-auth"
	| "verifying"
	| "cooldown"
	| "complete"
	| "error";

const COOLDOWN_MS = 10_000;
const VERIFY_TIMEOUT_MS = 35_000;
const VERIFY_RECOVERY_WINDOW_MS = 12_000;
const VERIFY_RECOVERY_POLL_MS = 1_200;

function isValidAction(value: string): value is AgentPairingAction {
	return value === "pair" || value === "unpair";
}

export default function AgentPairingCallbackPage() {
	const { user, loading } = useAuth();
	const location = useLocation();
	const navigate = useNavigate();
	const [phase, setPhase] = useState<PairingPhase>("loading-auth");
	const [statusMessage, setStatusMessage] = useState(
		"Preparing verification...",
	);
	const [errorMessage, setErrorMessage] = useState("");
	const [cooldownProgress, setCooldownProgress] = useState(0);

	const pairingParams = useMemo(
		() =>
			extractAgentPairingParamsFromLocation(location.search, location.hash),
		[location.hash, location.search],
	);
	const challengeId = pairingParams?.challengeId || "";
	const action = pairingParams?.action || "";
	const actionIsValid = isValidAction(action);

	const callbackPathWithQuery = useMemo(() => {
		const search = buildAgentPairingSearchFromLocation(
			location.search,
			location.hash,
		);
		return `/agent/pairing-callback${search}`;
	}, [location.hash, location.search]);

	useEffect(() => {
		if (loading) {
			setPhase("loading-auth");
			setErrorMessage("");
			setStatusMessage("Preparing verification...");
			return;
		}

		if (!challengeId || !actionIsValid) {
			setPhase("error");
			setErrorMessage(
				"This verification link is missing required pairing details. Request a new link from Account Settings.",
			);
			setStatusMessage("");
			return;
		}

		if (!user?.id) {
			setPhase("needs-auth");
			setErrorMessage("");
			setStatusMessage("Please sign in to complete this pairing request.");
			return;
		}

		let active = true;
		const runVerification = async () => {
			setPhase("verifying");
			setCooldownProgress(0);
			setErrorMessage("");
			setStatusMessage(
				action === "pair"
					? "Verifying your pair request..."
					: "Verifying your unpair request...",
			);

			try {
				let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
				await Promise.race([
					(async () => {
						const paired = await agentService.confirmPairingVerification(
							action,
							challengeId,
						);
						if (action === "pair" && !paired) {
							await agentService.refreshPairingStatus();
						}
					})(),
					new Promise<never>((_resolve, reject) => {
						timeoutHandle = setTimeout(() => {
							reject(
								new Error(
									"Verification timed out. Please refresh this page and try the pairing link again.",
								),
							);
						}, VERIFY_TIMEOUT_MS);
					}),
				]).finally(() => {
					if (timeoutHandle) {
						clearTimeout(timeoutHandle);
					}
				});
				if (!active) {
					return;
				}
				setPhase("cooldown");
				setStatusMessage(
					action === "pair"
						? "Verification complete. Finalizing secure pairing..."
						: "Verification complete. Finalizing unpair action...",
				);
			} catch (error) {
				if (!active) {
					return;
				}
				if (action === "pair") {
					setStatusMessage(
						"Verification response delayed. Checking pairing session...",
					);
					setErrorMessage("");

					const recoveryDeadline = Date.now() + VERIFY_RECOVERY_WINDOW_MS;
					while (active && Date.now() < recoveryDeadline) {
						try {
							const recovered = await agentService.refreshPairingStatusDetailed();
							if (recovered.paired) {
								setPhase("complete");
								setStatusMessage("Pairing active, you may now close this screen.");
								setErrorMessage("");
								return;
							}
						} catch {
							// Continue polling until the recovery window expires.
						}
						await new Promise((resolve) =>
							window.setTimeout(resolve, VERIFY_RECOVERY_POLL_MS),
						);
					}
				}
				setPhase("error");
				setStatusMessage("");
				setErrorMessage(
					error instanceof Error
						? error.message
						: "Unable to complete pairing verification.",
				);
			}
		};

		void runVerification();
		return () => {
			active = false;
		};
	}, [action, actionIsValid, challengeId, loading, user?.id]);

	useEffect(() => {
		if (phase !== "cooldown") {
			return;
		}

		let active = true;
		const startedAt = Date.now();
		const timer = window.setInterval(() => {
			if (!active) {
				return;
			}
			const elapsed = Date.now() - startedAt;
			const progress = Math.min(100, Math.round((elapsed / COOLDOWN_MS) * 100));
			setCooldownProgress(progress);
			if (progress >= 100) {
				window.clearInterval(timer);
				setPhase("complete");
				setStatusMessage(
					action === "pair"
						? "Pairing active, you may now close this screen."
						: "Unpair complete, you may now close this screen.",
				);
			}
		}, 120);

		return () => {
			active = false;
			window.clearInterval(timer);
		};
	}, [action, phase]);

	const title =
		action === "unpair" ? "Finalize Unpairing" : "Finalize Device Pairing";

	const stepState = useMemo(() => {
		const authReady = Boolean(user?.id);
		const verifyReached =
			phase === "verifying" || phase === "cooldown" || phase === "complete";
		const verifyComplete = phase === "cooldown" || phase === "complete";
		const finalizeComplete = phase === "complete";
		const hasError = phase === "error";

		return [
			{
				label: "Authentication",
				value: authReady ? "Session verified" : "Sign-in pending",
				tone: hasError && !authReady ? "error" : authReady ? "success" : "muted",
				active: phase === "loading-auth" || phase === "needs-auth",
				complete: authReady,
			},
			{
				label: "Challenge",
				value: verifyComplete
					? "Challenge confirmed"
					: verifyReached
						? "Confirming challenge"
						: "Waiting to verify",
				tone:
					hasError && verifyReached && !verifyComplete
						? "error"
						: verifyComplete
							? "success"
							: verifyReached
								? "active"
								: "muted",
				active: phase === "verifying",
				complete: verifyComplete,
			},
			{
				label: "Finalize",
				value: finalizeComplete
					? "Agent session ready"
					: phase === "cooldown"
						? "Final sync in progress"
						: "Pending finalization",
				tone:
					hasError
						? "error"
						: finalizeComplete
							? "success"
							: phase === "cooldown"
								? "active"
								: "muted",
				active: phase === "cooldown",
				complete: finalizeComplete,
			},
		] as const;
	}, [phase, user?.id]);

	return (
		<div className={styles.page}>
			<div className={styles.card}>
				<div className={styles.ambientGlow} />
				<div className={styles.headerBlock}>
					<div className={styles.header}>
						<div className={styles.iconWrap}>
							<Bot size={20} />
						</div>
						<div>
							<p className={styles.kicker}>Agent pairing callback</p>
							<h1 className={styles.title}>{title}</h1>
							<p className={styles.subtitle}>
								Secure broker verification for your agent session
							</p>
						</div>
					</div>

					<div className={styles.stepGrid}>
						{stepState.map((step) => (
							<div
								key={step.label}
								className={cn(
									styles.stepCard,
									step.complete && styles.stepCardComplete,
									step.active && styles.stepCardActive,
									step.tone === "error" && styles.stepCardError,
								)}
							>
								<p className={styles.stepLabel}>{step.label}</p>
								<p className={styles.stepValue}>{step.value}</p>
							</div>
						))}
					</div>
				</div>

				<div className={styles.statusShell}>
					<AgentOrbitLoader />

					{statusMessage ? (
						<p className={styles.status}>{statusMessage}</p>
					) : null}

					<div className={styles.stateRow}>
						{(phase === "loading-auth" ||
							phase === "verifying" ||
							phase === "cooldown") && (
							<span className={styles.badgeNeutral}>
								<Loader2 size={14} className={styles.spin} />
								Processing
							</span>
						)}
						{phase === "complete" && (
							<span className={styles.badgeSuccess}>
								<CheckCircle2 size={14} />
								Complete
							</span>
						)}
						{phase === "needs-auth" && (
							<span className={styles.badgeNeutral}>
								<ShieldCheck size={14} />
								Sign-in required
							</span>
						)}
						{phase === "error" && (
							<span className={styles.badgeError}>
								<AlertCircle size={14} />
								Verification failed
							</span>
						)}
					</div>
				</div>

				{phase === "cooldown" ? (
					<div className={styles.progressBlock}>
						<div className={styles.progressTrack}>
							<div
								className={styles.progressBar}
								style={{ width: `${cooldownProgress}%` }}
							/>
						</div>
						<p className={styles.progressText}>Final sync in progress...</p>
					</div>
				) : null}

				{errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

				<div className={styles.actions}>
					{phase === "needs-auth" ? (
						<button
							type="button"
							className={styles.buttonPrimary}
							onClick={() =>
								navigate("/login", {
									state: { from: callbackPathWithQuery },
								})
							}
						>
							Sign in to continue
						</button>
					) : null}

					{phase === "complete" ? (
						<>
							<button
								type="button"
								className={styles.buttonPrimary}
								onClick={() => navigate("/app/settings")}
							>
								Open account settings
							</button>
							<button
								type="button"
								className={styles.buttonSecondary}
								onClick={() => navigate("/app/agent")}
							>
								Open agent studio
							</button>
						</>
					) : null}

					{phase === "error" ? (
						<button
							type="button"
							className={styles.buttonPrimary}
							onClick={() => navigate("/app/settings")}
						>
							Back to pairing settings
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
}
