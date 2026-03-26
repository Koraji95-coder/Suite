import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Location, NavigateFunction } from "react-router-dom";
import { completePasskeyCallback } from "@/auth/passkeyAuthApi";
import {
	fetchPasskeyCapability,
	isBrowserPasskeySupported,
	isFrontendPasskeyEnabled,
	type PasskeyCapability,
} from "@/auth/passkeyCapabilityApi";
import { agentService } from "@/services/agentService";
import {
	logAuthMethodTelemetry,
	logSecurityEvent,
} from "@/services/securityEventService";
import { supabase } from "@/supabase/client";
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
