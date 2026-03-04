// src/routes/app/settings/AccountSettings.tsx
import {
	AlertCircle,
	Bot,
	CheckCircle2,
	Database,
	HardDrive,
	KeyRound,
	Loader2,
	LogOut,
	Mail,
	RefreshCw,
	Save,
	Settings2,
	Shield,
	ShieldCheck,
	User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { completePasskeyCallback } from "@/auth/passkeyAuthApi";
import {
	fetchPasskeyCapability,
	isBrowserPasskeySupported,
	isFrontendPasskeyEnabled,
	type PasskeyCapability,
} from "@/auth/passkeyCapabilityApi";
import { useAuth } from "@/auth/useAuth";
import { Badge } from "@/components/primitives/Badge";
import { Button, IconButton } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { Panel } from "@/components/primitives/Panel";
import { HStack, Stack } from "@/components/primitives/Stack";
// Primitives
import { Text } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import { type AgentPairingAction, agentService } from "@/services/agentService";
import {
	logAuthMethodTelemetry,
	logSecurityEvent,
} from "@/services/securityEventService";
import { supabase } from "@/supabase/client";
import styles from "./AccountSettings.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
type StatusTone = "success" | "danger" | "warning" | "muted";

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function SectionHeader({
	icon: Icon,
	title,
	description,
	tone = "primary",
}: {
	icon: React.ElementType;
	title: string;
	description: string;
	tone?: "primary" | "accent" | "neutral";
}) {
	const toneClasses = {
		primary: styles.sectionIconPrimary,
		accent: styles.sectionIconAccent,
		neutral: styles.sectionIconNeutral,
	};

	return (
		<HStack gap={3} align="start">
			<div className={cn(styles.sectionIconBase, toneClasses[tone])}>
				<Icon size={18} />
			</div>
			<Stack gap={0}>
				<Text size="sm" weight="semibold">
					{title}
				</Text>
				<Text size="xs" color="muted">
					{description}
				</Text>
			</Stack>
		</HStack>
	);
}

function StatusTile({
	title,
	value,
	tone,
	icon: Icon,
}: {
	title: string;
	value: string;
	tone: StatusTone;
	icon: React.ElementType;
}) {
	const toneConfig = {
		success: {
			tile: styles.statusToneSuccess,
			glow: styles.statusDotSuccess,
			icon: styles.statusIconSuccess,
			dot: styles.statusDotSuccess,
		},
		danger: {
			tile: styles.statusToneDanger,
			glow: styles.statusDotDanger,
			icon: styles.statusIconDanger,
			dot: styles.statusDotDanger,
		},
		warning: {
			tile: styles.statusToneWarning,
			glow: styles.statusDotWarning,
			icon: styles.statusIconWarning,
			dot: styles.statusDotWarning,
		},
		muted: {
			tile: styles.statusToneMuted,
			glow: styles.statusDotMuted,
			icon: styles.statusIconMuted,
			dot: styles.statusDotMuted,
		},
	};

	const config = toneConfig[tone];

	return (
		<div className={cn(styles.statusTile, config.tile)}>
			{/* Glow effect */}
			{tone !== "muted" && (
				<div className={cn(styles.statusGlow, config.glow)} />
			)}

			<HStack justify="between" align="start" className={styles.statusHeader}>
				<HStack gap={2} align="center">
					<div className={cn(styles.statusIconWrap, config.icon)}>
						<Icon size={12} className={styles.statusIconGlyph} />
					</div>
					<Text
						size="xs"
						color="muted"
						weight="medium"
						className={styles.statusLabel}
					>
						{title}
					</Text>
				</HStack>

				{/* Status dot with pulse */}
				<span className={styles.statusDotWrap}>
					{tone === "success" && (
						<span className={cn(styles.statusDotPulse, config.dot)} />
					)}
					<span className={cn(styles.statusDot, config.dot)} />
				</span>
			</HStack>

			<div className={styles.statusValue}>
				<Badge
					color={tone === "muted" ? "default" : tone}
					variant="soft"
					size="sm"
				>
					{value}
				</Badge>
			</div>
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AccountSettings() {
	const { user, profile, signOut, sessionAuthMethod, updateProfile } =
		useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	const usesBroker = useMemo(() => agentService.usesBroker(), []);
	const passkeyCallbackHandledRef = useRef("");
	const agentChallengeHandledRef = useRef("");

	// Profile state
	const [displayName, setDisplayName] = useState("");
	const [accountEmail, setAccountEmail] = useState("");
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [profileSaved, setProfileSaved] = useState(false);
	const [profileError, setProfileError] = useState("");

	// Session state
	const [isSigningOutAll, setIsSigningOutAll] = useState(false);
	const [accountActionMessage, setAccountActionMessage] = useState("");

	// Passkey state
	const [, setIsStartingPasskeyEnroll] = useState(false);
	const [passkeyCapability, setPasskeyCapability] =
		useState<PasskeyCapability | null>(null);
	const [passkeyLoading, setPasskeyLoading] = useState(true);
	const [, setPasskeyError] = useState("");
	const [, setPasskeyNotice] = useState("");

	// Agent state
	const [agentHealthy, setAgentHealthy] = useState<boolean | null>(null);
	const [agentPaired, setAgentPaired] = useState(false);
	const [agentLoading, setAgentLoading] = useState(true);
	const [agentPairingCode, setAgentPairingCode] = useState("");
	const [isAgentActionBusy, setIsAgentActionBusy] = useState(false);
	const [agentError, setAgentError] = useState("");
	const [agentNotice, setAgentNotice] = useState("");

	// Computed values
	const frontendPasskeyEnabled = useMemo(() => isFrontendPasskeyEnabled(), []);
	const browserPasskeySupported = useMemo(
		() => isBrowserPasskeySupported(),
		[],
	);

	const canSaveProfile = useMemo(() => {
		if (!user || isSavingProfile) return false;
		return displayName.trim().length > 0 && accountEmail.trim().length > 0;
	}, [accountEmail, displayName, isSavingProfile, user]);

	// ═══════════════════════════════════════════════════════════════════════════
	// HELPER FUNCTIONS
	// ═══════════════════════════════════════════════════════════════════════════

	const clearAgentChallengeParams = useCallback(() => {
		const params = new URLSearchParams(location.search);
		if (!params.has("agent_challenge") && !params.has("agent_action")) return;
		params.delete("agent_challenge");
		params.delete("agent_action");
		const search = params.toString();
		navigate(
			{ pathname: location.pathname, search: search ? `?${search}` : "" },
			{ replace: true },
		);
	}, [location.pathname, location.search, navigate]);

	const clearAgentPairingCodeParams = useCallback(() => {
		const params = new URLSearchParams(location.search);
		if (
			!params.has("agent_pairing_code") &&
			!params.has("agent_pairing_notice")
		)
			return;
		params.delete("agent_pairing_code");
		params.delete("agent_pairing_notice");
		const search = params.toString();
		navigate(
			{ pathname: location.pathname, search: search ? `?${search}` : "" },
			{ replace: true },
		);
	}, [location.pathname, location.search, navigate]);

	// Wrap in useCallback so it can be a stable dependency
	const loadPasskeyCapability = useCallback(async () => {
		setPasskeyLoading(true);
		setPasskeyError("");
		try {
			const result = await fetchPasskeyCapability();
			setPasskeyCapability(result.passkey);
		} catch (err: unknown) {
			setPasskeyCapability(null);
			setPasskeyError(
				err instanceof Error
					? err.message
					: "Unable to load passkey capability.",
			);
		} finally {
			setPasskeyLoading(false);
		}
	}, []);

	const refreshAgentStatus = useCallback(async () => {
		setAgentLoading(true);
		try {
			const isHealthy = await agentService.healthCheck();
			setAgentHealthy(isHealthy);
			if (isHealthy && user?.id) {
				await agentService.restorePairingForActiveUser();
			}
			const pairedState = await agentService.refreshPairingStatus();
			setAgentPaired(pairedState);
		} catch (err: unknown) {
			setAgentError(
				err instanceof Error ? err.message : "Unable to refresh agent status.",
			);
		} finally {
			setAgentLoading(false);
		}
	}, [user?.id]);

	// ═══════════════════════════════════════════════════════════════════════════
	// EFFECTS
	// ═══════════════════════════════════════════════════════════════════════════

	// Initial load - now properly includes loadPasskeyCapability
	useEffect(() => {
		void loadPasskeyCapability();
		void refreshAgentStatus();
	}, [loadPasskeyCapability, refreshAgentStatus]);

	// Polling for agent status
	useEffect(() => {
		if (agentHealthy === true && agentPaired) return;
		const timer = window.setInterval(() => void refreshAgentStatus(), 5000);
		return () => window.clearInterval(timer);
	}, [agentHealthy, agentPaired, refreshAgentStatus]);

	// Sync profile fields
	useEffect(() => {
		setDisplayName(profile?.display_name ?? "");
		setAccountEmail(profile?.email ?? user?.email ?? "");
	}, [profile?.display_name, profile?.email, user?.email]);

	// Handle agent pairing code from URL
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const candidateCode = (params.get("agent_pairing_code") || "")
			.trim()
			.replace(/\D+/g, "")
			.slice(0, 6);
		if (candidateCode.length !== 6) return;
		setAgentPairingCode(candidateCode);
		setAgentNotice("Pairing code loaded from your email link.");
		setAgentError("");
		clearAgentPairingCodeParams();
	}, [clearAgentPairingCodeParams, location.search]);

	// Passkey callback effect
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const passkeyState = (params.get("passkey_state") || "").trim();
		const passkeyStatus = (params.get("passkey_status") || "")
			.trim()
			.toLowerCase();
		const passkeyIntent = (params.get("passkey_intent") || "")
			.trim()
			.toLowerCase();
		const passkeyEmail = (params.get("passkey_email") || "").trim();
		const passkeyErrorValue = (params.get("passkey_error") || "").trim();
		const passkeySignature = (
			params.get("passkey_signature") ||
			params.get("passkey_sig") ||
			params.get("provider_signature") ||
			params.get("signature") ||
			""
		).trim();
		const passkeyTimestamp = (
			params.get("passkey_timestamp") ||
			params.get("passkey_ts") ||
			params.get("provider_timestamp") ||
			params.get("timestamp") ||
			""
		).trim();

		if (
			!passkeyState ||
			(passkeyStatus !== "success" && passkeyStatus !== "failed")
		)
			return;

		const callbackKey = [
			passkeyState,
			passkeyStatus,
			passkeyIntent,
			passkeyEmail,
			passkeyErrorValue,
			passkeySignature,
			passkeyTimestamp,
		].join("|");
		if (passkeyCallbackHandledRef.current === callbackKey) return;
		passkeyCallbackHandledRef.current = callbackKey;

		const clearCallbackParams = () => {
			const next = new URLSearchParams(location.search);
			[
				"passkey_state",
				"passkey_status",
				"passkey_intent",
				"passkey_email",
				"passkey_error",
				"passkey_signature",
				"passkey_sig",
				"provider_signature",
				"signature",
				"passkey_timestamp",
				"passkey_ts",
				"provider_timestamp",
				"timestamp",
			].forEach((k) => next.delete(k));
			const search = next.toString();
			navigate(
				{ pathname: location.pathname, search: search ? `?${search}` : "" },
				{ replace: true },
			);
		};

		let active = true;
		const completeCallback = async () => {
			setIsStartingPasskeyEnroll(true);
			try {
				const result = await completePasskeyCallback({
					state: passkeyState,
					status: passkeyStatus as "success" | "failed",
					intent: passkeyIntent || "enroll",
					email: passkeyEmail || undefined,
					error: passkeyErrorValue || undefined,
					signature: passkeySignature || undefined,
					timestamp: passkeyTimestamp || undefined,
				});

				if (result.intent === "enroll" && result.completed === false) {
					await logAuthMethodTelemetry(
						"passkey",
						"enroll_failed",
						`Passkey enrollment callback failed: ${result.message || "unknown error"}`,
					);
				}
				if (result.intent === "enroll" && result.completed === true) {
					await logAuthMethodTelemetry(
						"passkey",
						"enroll_completed",
						"Passkey enrollment callback completed successfully.",
					);
				}

				if (result.redirect_to) {
					window.location.assign(result.redirect_to);
					return;
				}
				if (result.resume_url) {
					window.location.assign(result.resume_url);
					return;
				}

				if (!active) return;
				setPasskeyNotice(result.message || "Passkey callback processed.");
				void loadPasskeyCapability();
			} catch (err: unknown) {
				if (!active) return;
				const msg =
					err instanceof Error
						? err.message
						: "Unable to complete passkey callback.";
				setPasskeyNotice(msg);
				await logAuthMethodTelemetry(
					"passkey",
					"enroll_failed",
					`Passkey enrollment callback completion failed: ${msg}`,
				);
			} finally {
				if (active) {
					setIsStartingPasskeyEnroll(false);
					clearCallbackParams();
				}
			}
		};

		void completeCallback();
		return () => {
			active = false;
		};
	}, [loadPasskeyCapability, location.pathname, location.search, navigate]);

	// Agent challenge effect
	useEffect(() => {
		if (!usesBroker || !user?.id) return;
		const params = new URLSearchParams(location.search);
		const challengeId = (params.get("agent_challenge") || "").trim();
		const action = (params.get("agent_action") || "").trim().toLowerCase();
		if (!challengeId || (action !== "pair" && action !== "unpair")) return;

		const handleKey = `${action}:${challengeId}`;
		if (agentChallengeHandledRef.current === handleKey) return;
		agentChallengeHandledRef.current = handleKey;

		let active = true;
		const confirm = async () => {
			setAgentError("");
			setAgentNotice(
				action === "pair"
					? "Verifying pair request..."
					: "Verifying unpair request...",
			);
			setIsAgentActionBusy(true);
			try {
				await agentService.confirmPairingVerification(
					action as AgentPairingAction,
					challengeId,
				);
				if (!active) return;
				setAgentNotice(
					action === "pair"
						? "Pairing verified. Agent access is active."
						: "Unpair verified. Agent access has been removed.",
				);
			} catch (err: unknown) {
				if (!active) return;
				setAgentError(
					err instanceof Error
						? err.message
						: "Unable to verify pairing action.",
				);
				setAgentNotice("");
			} finally {
				await refreshAgentStatus();
				if (active) {
					setIsAgentActionBusy(false);
					clearAgentChallengeParams();
				}
			}
		};

		void confirm();
		return () => {
			active = false;
		};
	}, [
		clearAgentChallengeParams,
		location.search,
		refreshAgentStatus,
		usesBroker,
		user?.id,
	]);

	// ═══════════════════════════════════════════════════════════════════════════
	// HANDLERS
	// ═══════════════════════════════════════════════════════════════════════════

	const saveAccountProfile = async () => {
		if (!canSaveProfile) return;
		setIsSavingProfile(true);
		setProfileSaved(false);
		setProfileError("");
		try {
			await updateProfile({ display_name: displayName, email: accountEmail });
			setProfileSaved(true);
			window.setTimeout(() => setProfileSaved(false), 1500);
		} catch (error) {
			setProfileError(
				error instanceof Error
					? error.message
					: "Failed to save account profile.",
			);
		} finally {
			setIsSavingProfile(false);
		}
	};

	const requestAgentPairingCodeByEmail = async () => {
		if (!usesBroker) {
			setAgentError(
				"Email pairing-code request is only available in broker mode.",
			);
			return;
		}
		setAgentError("");
		setAgentNotice("");
		setIsAgentActionBusy(true);
		try {
			const redirectTo =
				typeof window !== "undefined"
					? `${window.location.origin}/app/settings`
					: undefined;
			await agentService.requestPairingCodeByEmail({
				redirectTo,
				redirectPath: "/app/settings",
			});
			setAgentNotice(
				"Pairing code email sent. Open the link from your inbox to load the code here.",
			);
		} catch (err: unknown) {
			setAgentError(
				err instanceof Error
					? err.message
					: "Unable to request pairing code email.",
			);
		} finally {
			setIsAgentActionBusy(false);
		}
	};

	const pairAgent = async () => {
		const code = agentPairingCode.trim();
		if (!code) {
			setAgentError("Enter a 6-digit pairing code.");
			return;
		}
		setAgentError("");
		setAgentNotice("");
		setIsAgentActionBusy(true);
		try {
			const pairedNow = await agentService.pair(code);
			if (!pairedNow)
				throw new Error("Unable to pair with the gateway using this code.");
			setAgentNotice(
				usesBroker
					? "Agent paired for this session."
					: "Agent paired for this browser session.",
			);
			await refreshAgentStatus();
			setAgentPairingCode("");
		} catch (err: unknown) {
			setAgentError(
				err instanceof Error ? err.message : "Unable to pair with the gateway.",
			);
		} finally {
			setIsAgentActionBusy(false);
		}
	};

	const unpairAgent = async () => {
		setAgentError("");
		setAgentNotice("");
		setIsAgentActionBusy(true);
		try {
			if (usesBroker) {
				const redirectTo =
					typeof window !== "undefined"
						? `${window.location.origin}/app/settings`
						: undefined;
				await agentService.requestPairingVerificationLink("unpair", undefined, {
					redirectTo,
					redirectPath: "/app/settings",
				});
				setAgentNotice(
					"Verification link sent. Open it from your email to finish unpairing.",
				);
			} else {
				await agentService.unpair();
				setAgentNotice("Agent pairing removed for this browser session.");
				await refreshAgentStatus();
			}
		} catch (err: unknown) {
			setAgentError(
				err instanceof Error
					? err.message
					: usesBroker
						? "Unable to send unpair verification link."
						: "Unable to unpair from the gateway.",
			);
		} finally {
			setIsAgentActionBusy(false);
		}
	};

	const signOutAllSessions = async () => {
		if (isSigningOutAll) return;
		setIsSigningOutAll(true);
		setAccountActionMessage("");
		try {
			await agentService.unpair();
			const { error } = await supabase.auth.signOut({ scope: "global" });
			if (error) throw error;
			await logSecurityEvent(
				"auth_sign_out_global",
				"User signed out all active sessions.",
			);
			setAccountActionMessage("Signed out all active sessions.");
		} catch (err: unknown) {
			setAccountActionMessage(
				err instanceof Error ? err.message : "Failed to sign out all sessions.",
			);
		} finally {
			setIsSigningOutAll(false);
		}
	};

	// ═══════════════════════════════════════════════════════════════════════════
	// STATUS COMPUTATIONS
	// ═══════════════════════════════════════════════════════════════════════════

	const sessionAuthStatus = useMemo(
		() => ({
			value:
				sessionAuthMethod === "passkey"
					? "Passkey session"
					: "Email link session",
			tone: (sessionAuthMethod === "passkey"
				? "success"
				: "muted") as StatusTone,
		}),
		[sessionAuthMethod],
	);

	const passkeyAuthStatus = useMemo(
		() => ({
			value:
				sessionAuthMethod === "passkey"
					? "WebAuthn verified"
					: "WebAuthn ready",
			tone: (sessionAuthMethod === "passkey"
				? "success"
				: "muted") as StatusTone,
		}),
		[sessionAuthMethod],
	);

	const passkeyBrowserStatus = useMemo(
		() => ({
			value: browserPasskeySupported ? "Supported" : "Unsupported",
			tone: (browserPasskeySupported ? "success" : "danger") as StatusTone,
		}),
		[browserPasskeySupported],
	);

	const passkeyFrontendStatus = useMemo(
		() => ({
			value: frontendPasskeyEnabled ? "Enabled" : "Disabled",
			tone: (frontendPasskeyEnabled ? "success" : "warning") as StatusTone,
		}),
		[frontendPasskeyEnabled],
	);

	const passkeyBackendStatus = useMemo(() => {
		if (passkeyLoading) return { value: "Checking", tone: "muted" as const };
		if (!passkeyCapability?.enabled)
			return { value: "Rollout off", tone: "warning" as const };
		if (!passkeyCapability.config_ready)
			return { value: "Needs config", tone: "warning" as const };
		if (!passkeyCapability.handlers_ready)
			return { value: "Handlers missing", tone: "warning" as const };
		return { value: "Ready", tone: "success" as const };
	}, [passkeyCapability, passkeyLoading]);

	const agentGatewayStatus = useMemo(() => {
		if (agentHealthy === null)
			return { value: "Checking", tone: "muted" as const };
		return agentHealthy
			? { value: "Online", tone: "success" as const }
			: { value: "Offline", tone: "danger" as const };
	}, [agentHealthy]);

	const agentPairingStatus = useMemo(
		() =>
			agentPaired
				? { value: "Paired", tone: "success" as const }
				: { value: "Not paired", tone: "warning" as const },
		[agentPaired],
	);

	const agentModeStatus = useMemo(
		() => ({
			value: usesBroker ? "Brokered verification" : "Direct gateway",
			tone: "muted" as const,
		}),
		[usesBroker],
	);

	// ═══════════════════════════════════════════════════════════════════════════
	// RENDER
	// ═══════════════════════════════════════════════════════════════════════════

	return (
		<Stack gap={4}>
			{/* Page title */}
			<div>
				<Text size="lg" weight="semibold">
					Account
				</Text>
				<Text size="sm" color="muted">
					Authentication, identity, and trusted device controls.
				</Text>
			</div>

			{/* ─────────────────────────────────────────────────────────────────
          SECURITY OVERVIEW
      ───────────────────────────────────────────────────────────────── */}
			<Panel variant="default" padding="lg">
				<Stack gap={4}>
					<SectionHeader
						icon={ShieldCheck}
						title="Security overview"
						description="Current session and trust posture for this workspace."
						tone="primary"
					/>

					<div className={styles.securityGrid}>
						<StatusTile
							title="Passkey auth"
							value={passkeyAuthStatus.value}
							tone={passkeyAuthStatus.tone}
							icon={KeyRound}
						/>
						<StatusTile
							title="Session auth"
							value={sessionAuthStatus.value}
							tone={sessionAuthStatus.tone}
							icon={Shield}
						/>
						<StatusTile
							title="Browser support"
							value={passkeyBrowserStatus.value}
							tone={passkeyBrowserStatus.tone}
							icon={HardDrive}
						/>
						<StatusTile
							title="Frontend"
							value={passkeyFrontendStatus.value}
							tone={passkeyFrontendStatus.tone}
							icon={Settings2}
						/>
						<StatusTile
							title="Backend"
							value={passkeyBackendStatus.value}
							tone={passkeyBackendStatus.tone}
							icon={Database}
						/>
						<StatusTile
							title="Agent gateway"
							value={agentGatewayStatus.value}
							tone={agentGatewayStatus.tone}
							icon={Bot}
						/>
						<StatusTile
							title="Agent pairing"
							value={agentPairingStatus.value}
							tone={agentPairingStatus.tone}
							icon={KeyRound}
						/>
						<StatusTile
							title="Agent mode"
							value={agentModeStatus.value}
							tone={agentModeStatus.tone}
							icon={Settings2}
						/>
					</div>
				</Stack>
			</Panel>

			{/* ─────────────────────────────────────────────────────────────────
          PROFILE
      ───────────────────────────────────────────────────────────────── */}
			<Panel variant="default" padding="lg">
				<Stack gap={4}>
					<SectionHeader
						icon={User}
						title="Profile"
						description="Your display identity and contact email."
						tone="accent"
					/>

					<div className={styles.profileGrid}>
						<Input
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							placeholder="Your name"
						/>
						<Input
							label="Email"
							type="email"
							value={accountEmail}
							onChange={(e) => setAccountEmail(e.target.value)}
							placeholder="you@email.com"
						/>
						<Button
							variant="primary"
							disabled={!canSaveProfile}
							loading={isSavingProfile}
							onClick={() => void saveAccountProfile()}
							iconLeft={
								profileSaved ? <CheckCircle2 size={14} /> : <Save size={14} />
							}
						>
							{isSavingProfile
								? "Saving..."
								: profileSaved
									? "Saved"
									: "Save profile"}
						</Button>
					</div>

					{profileError && (
						<Panel
							variant="outline"
							padding="sm"
							className={styles.profileErrorPanel}
						>
							<HStack gap={2} align="center">
								<AlertCircle size={14} className={styles.dangerIcon} />
								<Text size="sm" color="danger">
									{profileError}
								</Text>
							</HStack>
						</Panel>
					)}
				</Stack>
			</Panel>

			{/* ─────────────────────────────────────────────────────────────────
          AGENT PAIRING
      ───────────────────────────────────────────────────────────────── */}
			<Panel variant="default" padding="lg">
				<Stack gap={4}>
					<SectionHeader
						icon={Bot}
						title="Agent pairing"
						description="Trust this browser session with ZeroClaw agent access."
						tone="primary"
					/>

					<HStack gap={2} wrap align="end">
						<div className={styles.agentCodeWrap}>
							<Input
								value={agentPairingCode}
								onChange={(e) => {
									const digitsOnly = e.target.value.replace(/\D+/g, "");
									setAgentPairingCode(digitsOnly.slice(0, 6));
								}}
								placeholder="000000"
								maxLength={6}
								className={styles.agentCodeInput}
							/>
						</div>

						{usesBroker && (
							<Button
								variant="secondary"
								size="sm"
								disabled={isAgentActionBusy}
								onClick={() => void requestAgentPairingCodeByEmail()}
								iconLeft={<Mail size={14} />}
							>
								Email code
							</Button>
						)}

						<Button
							variant="primary"
							size="sm"
							disabled={
								isAgentActionBusy ||
								agentPairingCode.trim().length !== 6 ||
								(!usesBroker && agentHealthy !== true)
							}
							loading={isAgentActionBusy}
							onClick={() => void pairAgent()}
						>
							Pair
						</Button>

						<Button
							variant="secondary"
							size="sm"
							disabled={isAgentActionBusy || !agentPaired}
							onClick={() => void unpairAgent()}
						>
							Unpair
						</Button>

						<IconButton
							icon={
								agentLoading ? (
									<Loader2 size={14} className={styles.spin} />
								) : (
									<RefreshCw size={14} />
								)
							}
							aria-label="Refresh status"
							variant="ghost"
							size="sm"
							disabled={agentLoading}
							onClick={() => void refreshAgentStatus()}
						/>
					</HStack>

					{agentError && (
						<Text size="xs" color="danger">
							{agentError}
						</Text>
					)}
					{agentNotice && (
						<Text size="xs" color="muted">
							{agentNotice}
						</Text>
					)}

					<Text size="xs" color="muted">
						{usesBroker
							? "Request a code by email, open the link, then pair with the 6-digit code."
							: "Direct mode stores pairing only in this browser session."}
					</Text>
				</Stack>
			</Panel>

			{/* ─────────────────────────────────────────────────────────────────
          SESSION ACTIONS
      ───────────────────────────────────────────────────────────────── */}
			<Panel variant="default" padding="lg">
				<Stack gap={4}>
					<SectionHeader
						icon={LogOut}
						title="Session actions"
						description="Sign out this device or revoke all active sessions."
						tone="neutral"
					/>

					<HStack gap={2} wrap>
						<Button variant="secondary" onClick={() => void signOut()}>
							Sign out
						</Button>

						<Button
							variant="outline"
							disabled={isSigningOutAll}
							loading={isSigningOutAll}
							onClick={() => void signOutAllSessions()}
						>
							{isSigningOutAll ? "Signing out all..." : "Sign out all devices"}
						</Button>
					</HStack>

					{accountActionMessage && (
						<Text size="xs" color="muted">
							{accountActionMessage}
						</Text>
					)}

					<Stack gap={1}>
						<Text size="xs" color="muted">
							Last sign-in: {user?.last_sign_in_at ?? "unknown"}
						</Text>
						<Text size="xs" color="muted">
							Signed in as:{" "}
							<Text weight="semibold">{user?.email ?? "unknown"}</Text>
						</Text>
					</Stack>
				</Stack>
			</Panel>
		</Stack>
	);
}
