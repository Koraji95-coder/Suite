import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Location, NavigateFunction } from "react-router-dom";
import { extractAgentPairingParamsFromLocation } from "@/auth/agentPairingParams";
import { completePasskeyCallback } from "@/auth/passkeyAuthApi";
import {
	fetchPasskeyCapability,
	isBrowserPasskeySupported,
	isFrontendPasskeyEnabled,
	type PasskeyCapability,
} from "@/auth/passkeyCapabilityApi";
import type { AgentPairingAction } from "@/services/agent/types";
import {
	AgentPairingRequestError,
	agentService,
} from "@/services/agentService";
import {
	logAuthMethodTelemetry,
	logSecurityEvent,
} from "@/services/securityEventService";
import { useAgentConnectionStatus } from "@/services/useAgentConnectionStatus";
import { supabase } from "@/supabase/client";

const AGENT_VERIFICATION_COOLDOWN_SECONDS = 20;
const PASSKEY_CAPABILITY_CACHE_KEY = "suite:passkey:capability";
const PASSKEY_CAPABILITY_CACHE_TTL_MS = 5 * 60_000;

function readCachedPasskeyCapability(): PasskeyCapability | null {
	try {
		const raw = localStorage.getItem(PASSKEY_CAPABILITY_CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as {
			value?: PasskeyCapability;
			updatedAt?: number;
		};
		if (!parsed?.value || typeof parsed.updatedAt !== "number") {
			return null;
		}
		if (Date.now() - parsed.updatedAt > PASSKEY_CAPABILITY_CACHE_TTL_MS) {
			return null;
		}
		return parsed.value;
	} catch {
		return null;
	}
}

function writeCachedPasskeyCapability(value: PasskeyCapability) {
	try {
		localStorage.setItem(
			PASSKEY_CAPABILITY_CACHE_KEY,
			JSON.stringify({
				value,
				updatedAt: Date.now(),
			}),
		);
	} catch {
		/* noop */
	}
}

interface AccountUserLike {
	id?: string | null;
	email?: string | null;
	last_sign_in_at?: string | null;
	user_metadata?: {
		display_name?: unknown;
		full_name?: unknown;
	} | null;
}

interface AccountProfileLike {
	display_name?: string | null;
	email?: string | null;
}

interface UseAccountProfileStateArgs {
	user: AccountUserLike | null | undefined;
	profile: AccountProfileLike | null | undefined;
	updateProfile: (values: {
		display_name?: string;
		email?: string;
	}) => Promise<unknown>;
}

function resolveAccountDisplayName(
	profile: AccountProfileLike | null | undefined,
	user: AccountUserLike | null | undefined,
) {
	if (profile?.display_name?.trim()) {
		return profile.display_name.trim();
	}

	if (typeof user?.user_metadata?.display_name === "string") {
		return user.user_metadata.display_name.trim();
	}

	if (typeof user?.user_metadata?.full_name === "string") {
		return user.user_metadata.full_name.trim();
	}

	return "";
}

function resolveAccountEmail(
	profile: AccountProfileLike | null | undefined,
	user: AccountUserLike | null | undefined,
) {
	return profile?.email ?? user?.email ?? "";
}

export function useAccountProfileState({
	user,
	profile,
	updateProfile,
}: UseAccountProfileStateArgs) {
	const resolvedDisplayName = resolveAccountDisplayName(profile, user);
	const resolvedAccountEmail = resolveAccountEmail(profile, user);
	const [displayName, setDisplayName] = useState(() => resolvedDisplayName);
	const [accountEmail, setAccountEmail] = useState(() => resolvedAccountEmail);
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [profileSaved, setProfileSaved] = useState(false);
	const [profileError, setProfileError] = useState("");

	useEffect(() => {
		setDisplayName(resolvedDisplayName);
		setAccountEmail(resolvedAccountEmail);
	}, [resolvedAccountEmail, resolvedDisplayName]);

	const canSaveProfile = useMemo(() => {
		if (!user || isSavingProfile) return false;
		return displayName.trim().length > 0 && accountEmail.trim().length > 0;
	}, [accountEmail, displayName, isSavingProfile, user]);

	const saveAccountProfile = useCallback(async () => {
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
	}, [accountEmail, canSaveProfile, displayName, updateProfile]);

	return {
		displayName,
		setDisplayName,
		accountEmail,
		setAccountEmail,
		isSavingProfile,
		profileSaved,
		profileError,
		canSaveProfile,
		saveAccountProfile,
	};
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

interface UseAccountPasskeyStateArgs {
	location: Location;
	navigate: NavigateFunction;
}

export function useAccountPasskeyState({
	location,
	navigate,
}: UseAccountPasskeyStateArgs) {
	const passkeyCallbackHandledRef = useRef("");
	const [isStartingPasskeyEnroll, setIsStartingPasskeyEnroll] = useState(false);
	const [passkeyCapability, setPasskeyCapability] =
		useState<PasskeyCapability | null>(() => readCachedPasskeyCapability());
	const [passkeyLoading, setPasskeyLoading] = useState(
		() => readCachedPasskeyCapability() === null,
	);
	const [passkeyError, setPasskeyError] = useState("");
	const [passkeyNotice, setPasskeyNotice] = useState("");

	const frontendPasskeyEnabled = useMemo(() => isFrontendPasskeyEnabled(), []);
	const browserPasskeySupported = useMemo(
		() => isBrowserPasskeySupported(),
		[],
	);

	const loadPasskeyCapability = useCallback(async () => {
		const cachedCapability = readCachedPasskeyCapability();
		setPasskeyLoading(cachedCapability === null);
		if (cachedCapability) {
			setPasskeyCapability(cachedCapability);
		}
		setPasskeyError("");
		try {
			const result = await fetchPasskeyCapability();
			setPasskeyCapability(result.passkey);
			writeCachedPasskeyCapability(result.passkey);
		} catch (err: unknown) {
			setPasskeyError(
				err instanceof Error
					? err.message
					: "Unable to load passkey capability.",
			);
		} finally {
			setPasskeyLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadPasskeyCapability();
	}, [loadPasskeyCapability]);

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
		) {
			return;
		}

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
			].forEach((key) => next.delete(key));
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
				const message =
					err instanceof Error
						? err.message
						: "Unable to complete passkey callback.";
				setPasskeyNotice(message);
				await logAuthMethodTelemetry(
					"passkey",
					"enroll_failed",
					`Passkey enrollment callback completion failed: ${message}`,
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

	return {
		passkeyCapability,
		passkeyLoading,
		passkeyError,
		passkeyNotice,
		frontendPasskeyEnabled,
		browserPasskeySupported,
		isStartingPasskeyEnroll,
	};
}

interface UseAccountAgentPairingStateArgs {
	userId: string | null;
	usesBroker: boolean;
	location: Location;
	navigate: NavigateFunction;
}

export function useAccountAgentPairingState({
	userId,
	usesBroker,
	location,
	navigate,
}: UseAccountAgentPairingStateArgs) {
	const agentChallengeHandledRef = useRef("");
	const {
		healthy: agentHealthy,
		paired: agentPaired,
		loading: agentLoading,
		error: agentStatusError,
		refreshNow: refreshAgentStatus,
	} = useAgentConnectionStatus({
		userId,
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
		) {
			return;
		}
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

	useEffect(() => {
		if (!usesBroker) return;
		const params = new URLSearchParams(location.search);
		if (
			!params.has("agent_pairing_code") &&
			!params.has("agent_pairing_notice")
		) {
			return;
		}
		setAgentNotice(
			"Pairing code links are deprecated. Use 'Pair this device' to request a verification link.",
		);
		setAgentError("");
		clearAgentPairingCodeParams();
	}, [clearAgentPairingCodeParams, location.search, usesBroker]);

	useEffect(() => {
		if (!usesBroker || !userId) return;
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
		userId,
	]);

	const requestAgentPairingVerification = useCallback(
		async (action: AgentPairingAction) => {
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
				const message = err instanceof Error ? err.message : fallbackMessage;
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
		},
		[startAgentVerificationCooldown, usesBroker],
	);

	const pairAgent = useCallback(async () => {
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
			if (!pairedNow) {
				throw new Error("Unable to pair with the gateway using this code.");
			}
			setAgentNotice("Agent paired for this browser session.");
			await refreshAgentStatus();
			setAgentPairingCode("");
		} catch (err: unknown) {
			setAgentError(
				err instanceof Error ? err.message : "Unable to pair with the gateway.",
			);
		} finally {
			setIsAgentActionBusy(false);
		}
	}, [
		agentPairingCode,
		refreshAgentStatus,
		requestAgentPairingVerification,
		usesBroker,
	]);

	const unpairAgent = useCallback(async () => {
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
	}, [refreshAgentStatus, requestAgentPairingVerification, usesBroker]);

	const resendAgentVerification = useCallback(async () => {
		if (!lastAgentVerificationAction) return;
		await requestAgentPairingVerification(lastAgentVerificationAction);
	}, [lastAgentVerificationAction, requestAgentPairingVerification]);

	return {
		agentHealthy,
		agentPaired,
		agentLoading,
		refreshAgentStatus,
		agentPairingCode,
		setAgentPairingCode,
		isAgentActionBusy,
		effectiveAgentError: agentError || agentStatusError,
		agentNotice,
		agentVerificationCooldownSeconds,
		lastAgentVerificationAction,
		pairAgent,
		unpairAgent,
		resendAgentVerification,
	};
}

export function useAccountSessionActions() {
	const [isSigningOutAll, setIsSigningOutAll] = useState(false);
	const [accountActionMessage, setAccountActionMessage] = useState("");

	const signOutAllSessions = useCallback(async () => {
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
	}, [isSigningOutAll]);

	return {
		isSigningOutAll,
		accountActionMessage,
		signOutAllSessions,
	};
}
