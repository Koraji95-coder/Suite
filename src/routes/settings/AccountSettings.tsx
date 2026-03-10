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
	RefreshCw,
	Save,
	Settings2,
	Shield,
	ShieldCheck,
	User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { extractAgentPairingParamsFromLocation } from "@/auth/agentPairingParams";
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
import {
	type AgentPairingAction,
	AgentPairingRequestError,
	agentService,
} from "@/services/agentService";
import {
	logAuthMethodTelemetry,
	logSecurityEvent,
} from "@/services/securityEventService";
import { useAgentConnectionStatus } from "@/services/useAgentConnectionStatus";
import { supabase } from "@/supabase/client";
import styles from "./AccountSettings.module.css";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════
type StatusTone = "success" | "danger" | "warning" | "muted";
const AGENT_VERIFICATION_COOLDOWN_SECONDS = 20;

function parseRetryCooldownSeconds(message: string): number {
	const source = String(message || "").trim();
	if (!source) {
		return 0;
	}
	const match = source.match(/after\s+(\d+)\s+seconds?/i);
	if (match?.[1]) {
		const parsed = Number.parseInt(match[1], 10);
		return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
	}
	const genericMatch = source.match(/retry(?:\s+in)?\s+(\d+)\s*s/i);
	if (genericMatch?.[1]) {
		const parsed = Number.parseInt(genericMatch[1], 10);
		return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
	}
	return 0;
}

function stripAgentChallengeFromHash(hash: string): string {
	const trimmed = String(hash || "").replace(/^#/, "");
	if (!trimmed) {
		return "";
	}

	if (trimmed.startsWith("/")) {
		const queryIndex = trimmed.indexOf("?");
		if (queryIndex < 0) {
			return hash;
		}

		const routePath = trimmed.slice(0, queryIndex);
		const params = new URLSearchParams(trimmed.slice(queryIndex + 1));
		if (!params.has("agent_challenge") && !params.has("agent_action")) {
			return hash;
		}
		params.delete("agent_challenge");
		params.delete("agent_action");
		const next = params.toString();
		return next ? `#${routePath}?${next}` : `#${routePath}`;
	}

	const params = new URLSearchParams(trimmed);
	if (!params.has("agent_challenge") && !params.has("agent_action")) {
		return hash;
	}
	params.delete("agent_challenge");
	params.delete("agent_action");
	const next = params.toString();
	return next ? `#${next}` : "";
}

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
	const {
		healthy: agentHealthy,
		paired: agentPaired,
		loading: agentLoading,
		error: agentStatusError,
		refreshNow: refreshAgentStatus,
	} = useAgentConnectionStatus({
		userId: user?.id ?? null,
	});
	const [agentPairingCode, setAgentPairingCode] = useState("");
	const [isAgentActionBusy, setIsAgentActionBusy] = useState(false);
	const [agentError, setAgentError] = useState("");
	const [agentNotice, setAgentNotice] = useState("");
	const [
		agentVerificationCooldownSeconds,
		setAgentVerificationCooldownSeconds,
	] = useState(0);
	const [agentVerificationCooldownUntil, setAgentVerificationCooldownUntil] =
		useState<number | null>(null);
	const [lastAgentVerificationAction, setLastAgentVerificationAction] =
		useState<AgentPairingAction | null>(null);

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
		const hadSearchParams =
			params.has("agent_challenge") || params.has("agent_action");
		const nextHash = stripAgentChallengeFromHash(location.hash);
		if (!hadSearchParams && nextHash === location.hash) return;
		params.delete("agent_challenge");
		params.delete("agent_action");
		const search = params.toString();
		navigate(
			{
				pathname: location.pathname,
				search: search ? `?${search}` : "",
				hash: nextHash,
			},
			{ replace: true },
		);
	}, [location.hash, location.pathname, location.search, navigate]);

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

	const startAgentVerificationCooldown = useCallback((seconds: number) => {
		const normalizedSeconds = Math.max(0, Math.floor(seconds));
		if (normalizedSeconds <= 0) {
			setAgentVerificationCooldownUntil(null);
			setAgentVerificationCooldownSeconds(0);
			return;
		}
		const untilMs = Date.now() + normalizedSeconds * 1000;
		setAgentVerificationCooldownUntil(untilMs);
		setAgentVerificationCooldownSeconds(normalizedSeconds);
	}, []);

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

	// ═══════════════════════════════════════════════════════════════════════════
	// EFFECTS
	// ═══════════════════════════════════════════════════════════════════════════

	// Initial load - now properly includes loadPasskeyCapability
	useEffect(() => {
		void loadPasskeyCapability();
	}, [loadPasskeyCapability]);

	// Sync profile fields
	useEffect(() => {
		setDisplayName(profile?.display_name ?? "");
		setAccountEmail(profile?.email ?? user?.email ?? "");
	}, [profile?.display_name, profile?.email, user?.email]);

	// Pair/unpair verification cooldown timer
	useEffect(() => {
		if (!agentVerificationCooldownUntil) {
			setAgentVerificationCooldownSeconds(0);
			return;
		}

		const tick = () => {
			const remainingMs = Math.max(
				0,
				agentVerificationCooldownUntil - Date.now(),
			);
			const nextSeconds = Math.ceil(remainingMs / 1000);
			setAgentVerificationCooldownSeconds(nextSeconds);
			if (nextSeconds <= 0) {
				setAgentVerificationCooldownUntil(null);
			}
		};

		tick();
		const timer = window.setInterval(tick, 250);
		return () => window.clearInterval(timer);
	}, [agentVerificationCooldownUntil]);

	// Legacy pairing-code links (deprecated in broker mode)
	useEffect(() => {
		if (!usesBroker) return;
		const params = new URLSearchParams(location.search);
		if (
			!params.has("agent_pairing_code") &&
			!params.has("agent_pairing_notice")
		)
			return;
		setAgentNotice(
			"Pairing code links are deprecated. Use 'Pair this device' to request a verification link.",
		);
		setAgentError("");
		clearAgentPairingCodeParams();
	}, [clearAgentPairingCodeParams, location.search, usesBroker]);

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
		const pairingParams = extractAgentPairingParamsFromLocation(
			location.search,
			location.hash,
		);
		const challengeId = (pairingParams?.challengeId || "").trim();
		const action = pairingParams?.action;
		if (!challengeId || !action) return;

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
				await agentService.confirmPairingVerification(action, challengeId);
				if (!active) return;
				startAgentVerificationCooldown(0);
				setAgentNotice(
					action === "pair"
						? "Pairing verified. Agent access is active."
						: "Unpair verified. Agent access has been removed.",
				);
			} catch (err: unknown) {
				if (!active) return;
				if (action === "pair") {
					try {
						const recovered = await agentService.refreshPairingStatusDetailed();
						if (active && recovered.paired) {
							setAgentError("");
							setAgentNotice("Pairing verified. Agent access is active.");
							startAgentVerificationCooldown(0);
							return;
						}
					} catch {
						// Keep original error handling below.
					}
				}
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
		location.hash,
		location.search,
		refreshAgentStatus,
		startAgentVerificationCooldown,
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

	const requestAgentPairingVerification = async (
		action: AgentPairingAction,
	) => {
		if (!usesBroker) {
			setAgentError(
				"Email verification flow is only available in broker mode.",
			);
			return;
		}
		setAgentError("");
		setAgentNotice("");
		setIsAgentActionBusy(true);
		try {
			const redirectTo =
				typeof window !== "undefined"
					? `${window.location.origin}/agent/pairing-callback`
					: undefined;
			await agentService.requestPairingVerificationLink(action, undefined, {
				redirectTo,
				redirectPath: "/agent/pairing-callback",
			});
			setLastAgentVerificationAction(action);
			startAgentVerificationCooldown(AGENT_VERIFICATION_COOLDOWN_SECONDS);
			setAgentNotice(
				action === "pair"
					? "Verification link sent. Open it from your email to finish pairing this device."
					: "Verification link sent. Open it from your email to finish unpairing.",
			);
		} catch (err: unknown) {
			const fallbackMessage = `Unable to request ${action} verification link.`;
			const message =
				err instanceof Error ? err.message : fallbackMessage;
			let retrySeconds = 0;
			if (err instanceof AgentPairingRequestError) {
				retrySeconds = Math.max(0, err.retryAfterSeconds);
			}
			if (retrySeconds <= 0) {
				retrySeconds = parseRetryCooldownSeconds(message);
			}
			if (retrySeconds > 0) {
				startAgentVerificationCooldown(retrySeconds);
			}

			if (err instanceof AgentPairingRequestError) {
				if (err.throttleSource === "supabase") {
					setAgentNotice(
						"Verification email delivery is temporarily rate-limited by the email provider.",
					);
				} else if (err.throttleSource === "local-abuse") {
					setAgentNotice(
						"Verification actions are cooling down to protect the pairing flow.",
					);
				}
			}
			setAgentError(message);
		} finally {
			setIsAgentActionBusy(false);
		}
	};

	const pairAgent = async () => {
		if (usesBroker) {
			await requestAgentPairingVerification("pair");
			return;
		}

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
		if (usesBroker) {
			await requestAgentPairingVerification("unpair");
			return;
		}

		setIsAgentActionBusy(true);
		try {
			await agentService.unpair();
			setAgentNotice("Agent pairing removed for this browser session.");
			await refreshAgentStatus();
		} catch (err: unknown) {
			setAgentError(
				err instanceof Error
					? err.message
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
	const effectiveAgentError = agentError || agentStatusError;

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
							name="display_name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							placeholder="Your name"
						/>
						<Input
							label="Email"
							name="account_email"
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
			<Panel
				variant="default"
				padding="lg"
				className={styles.agentPairingPanel}
			>
				<Stack gap={4}>
					<SectionHeader
						icon={Bot}
						title="Agent pairing"
						description="Trust this browser session with ZeroClaw agent access."
						tone="primary"
					/>

					<div className={styles.agentPairingSummary}>
						<HStack gap={2} wrap>
							<Badge
								size="sm"
								variant="soft"
								color={
									agentHealthy === true
										? "success"
										: agentHealthy === false
											? "danger"
											: "default"
								}
							>
								Agent gateway:{" "}
								{agentHealthy === null
									? "Checking"
									: agentHealthy
										? "Online"
										: "Offline"}
							</Badge>
							<Badge
								size="sm"
								variant="soft"
								color={agentPaired ? "success" : "warning"}
							>
								Pairing status: {agentPaired ? "Paired" : "Not paired"}
							</Badge>
							<Badge size="sm" variant="outline" color="default">
								Mode: {usesBroker ? "Brokered verification" : "Direct gateway"}
							</Badge>
						</HStack>
						<Text size="xs" color="muted">
							{usesBroker
								? "Pairing and unpairing are completed through email verification links for this signed-in account."
								: "Direct mode is for local troubleshooting and stores pairing only in this browser session."}
						</Text>
					</div>

					<div className={styles.agentActionRow}>
						{!usesBroker && (
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
						)}

						<Button
							variant="primary"
							size="sm"
							disabled={
								isAgentActionBusy ||
								(usesBroker && agentVerificationCooldownSeconds > 0) ||
								(!usesBroker &&
									(agentPairingCode.trim().length !== 6 ||
										agentHealthy !== true))
							}
							loading={isAgentActionBusy}
							onClick={() => void pairAgent()}
							className={styles.agentActionButton}
						>
							{usesBroker && agentVerificationCooldownSeconds > 0
								? `Pair this device (${agentVerificationCooldownSeconds}s)`
								: usesBroker
									? "Pair this device"
									: "Pair"}
						</Button>

						<Button
							variant="secondary"
							size="sm"
							disabled={
								isAgentActionBusy ||
								(usesBroker && agentVerificationCooldownSeconds > 0) ||
								!agentPaired
							}
							onClick={() => void unpairAgent()}
							className={styles.agentActionButton}
						>
							{usesBroker ? "Unpair this device" : "Unpair"}
						</Button>

						{usesBroker && (
							<Button
								variant="secondary"
								size="sm"
								disabled={
									isAgentActionBusy ||
									agentVerificationCooldownSeconds > 0 ||
									!lastAgentVerificationAction
								}
								onClick={() => {
									if (!lastAgentVerificationAction) return;
									void requestAgentPairingVerification(
										lastAgentVerificationAction,
									);
								}}
								className={styles.agentActionButton}
							>
								{agentVerificationCooldownSeconds > 0
									? `Resend verification (${agentVerificationCooldownSeconds}s)`
									: "Resend verification"}
							</Button>
						)}

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
					</div>

					{effectiveAgentError && (
						<Text size="xs" color="danger" className={styles.agentNoticeError}>
							{effectiveAgentError}
						</Text>
					)}
					{agentNotice && (
						<Text size="xs" color="muted" className={styles.agentNotice}>
							{agentNotice}
						</Text>
					)}
					{usesBroker && agentVerificationCooldownSeconds > 0 && (
						<Text size="xs" color="muted" className={styles.agentCooldown}>
							Verification requests are temporarily cooling down. Try again in{" "}
							{agentVerificationCooldownSeconds}s.
						</Text>
					)}
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
