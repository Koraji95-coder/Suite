import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { secureTokenStorage } from "@/lib/secureTokenStorage";
import {
	deleteSetting,
	loadSetting,
	saveSetting,
} from "@/settings/userSettings";
import { logSecurityEvent } from "../securityEventService";
import type { AgentPairingRefreshResult, AgentPairingState } from "./types";

const AGENT_PAIRING_SETTING_KEY = "agent_pairing_state_v1";
const DEFAULT_RESTORE_WINDOW_HOURS = 24;
const MAX_RESTORE_WINDOW_HOURS = 24 * 30;
const NO_EXPIRY_ENV_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function isTrueEnvValue(rawValue: string | undefined): boolean {
	return NO_EXPIRY_ENV_TRUE_VALUES.has(
		String(rawValue || "")
			.trim()
			.toLowerCase(),
	);
}

function resolvePairingRestoreWindowMs(): number {
	const rawValue = Number(
		String(
			import.meta.env.VITE_AGENT_PAIRING_RESTORE_WINDOW_HOURS || "",
		).trim(),
	);
	const normalizedHours =
		Number.isFinite(rawValue) && rawValue > 0
			? Math.min(MAX_RESTORE_WINDOW_HOURS, Math.max(1, Math.trunc(rawValue)))
			: DEFAULT_RESTORE_WINDOW_HOURS;
	return normalizedHours * 60 * 60 * 1000;
}

const MAX_RESTORE_AGE_MS = resolvePairingRestoreWindowMs();
const PAIRING_RESTORE_NO_EXPIRY = isTrueEnvValue(
	import.meta.env.VITE_AGENT_PAIRING_RESTORE_NO_EXPIRY,
);

export interface AgentDirectPairingContext {
	useBroker: boolean;
	baseUrl: string;
	activeUserId: string | null;
	checkPairing: () => boolean;
}

export interface AgentBrokerPairingSessionErrorDetails {
	code: string;
	message: string;
	retryAfterSeconds: number;
	retryable: boolean;
}

export interface AgentBrokerPairingContext {
	useBroker: boolean;
	brokerUrl: string;
	getSupabaseAccessToken: () => Promise<string | null>;
	getBrokerPaired: () => boolean;
	setBrokerPaired: (paired: boolean) => void;
	getPairingRefreshInFlight: () => Promise<AgentPairingRefreshResult> | null;
	setPairingRefreshInFlight: (
		promise: Promise<AgentPairingRefreshResult> | null,
	) => void;
	readSessionBrokerError: (
		response: Response,
	) => Promise<AgentBrokerPairingSessionErrorDetails>;
}

export async function persistDirectPairingForUser(
	context: Pick<
		AgentDirectPairingContext,
		"useBroker" | "activeUserId" | "baseUrl"
	>,
): Promise<void> {
	if (context.useBroker) return;
	if (!context.activeUserId) return;

	const token = secureTokenStorage.exportOpaqueToken();
	if (!token) return;

	const timestamp = new Date().toISOString();
	const payload: AgentPairingState = {
		version: 1,
		endpoint: context.baseUrl,
		device: secureTokenStorage.getDeviceFingerprint(),
		token,
		pairedAt: timestamp,
		updatedAt: timestamp,
	};

	const result = await saveSetting(AGENT_PAIRING_SETTING_KEY, payload, null);
	if (!result.success) {
		logger.warn("Failed to persist agent pairing state", "AgentService", {
			error: result.error,
		});
	}
}

export async function clearPersistedDirectPairingForUser(
	context: Pick<AgentDirectPairingContext, "useBroker" | "activeUserId">,
): Promise<void> {
	if (context.useBroker) return;
	if (!context.activeUserId) return;
	await deleteSetting(AGENT_PAIRING_SETTING_KEY, null);
}

export async function restoreDirectPairingForUser(
	context: AgentDirectPairingContext,
): Promise<{
	restored: boolean;
	reason: string;
}> {
	if (!context.activeUserId) {
		await logSecurityEvent(
			"agent_restore_failed",
			"Agent restore skipped: no active user.",
		);
		return { restored: false, reason: "no-active-user" };
	}

	if (context.checkPairing()) {
		return { restored: true, reason: "already-paired" };
	}

	const saved = await loadSetting<AgentPairingState | null>(
		AGENT_PAIRING_SETTING_KEY,
		null,
		null,
	);

	if (!saved) {
		await logSecurityEvent(
			"agent_restore_failed",
			"Agent restore skipped: no saved pairing.",
		);
		return { restored: false, reason: "no-saved-pairing" };
	}

	const clearPersistedPairing = async () =>
		clearPersistedDirectPairingForUser(context);

	if (
		saved.version !== 1 ||
		saved.endpoint !== context.baseUrl ||
		saved.device !== secureTokenStorage.getDeviceFingerprint() ||
		typeof saved.token !== "string"
	) {
		await clearPersistedPairing();
		await logSecurityEvent(
			"agent_restore_failed",
			"Agent restore failed: saved pairing did not match device or endpoint.",
		);
		return { restored: false, reason: "invalid-saved-pairing" };
	}

	if (!PAIRING_RESTORE_NO_EXPIRY) {
		const updatedAt = Date.parse(saved.updatedAt);
		if (
			!Number.isFinite(updatedAt) ||
			Date.now() - updatedAt > MAX_RESTORE_AGE_MS
		) {
			await clearPersistedPairing();
			await logSecurityEvent(
				"agent_restore_failed",
				"Agent restore failed: trusted pairing window expired.",
			);
			return { restored: false, reason: "restore-window-expired" };
		}
	}

	const imported = secureTokenStorage.importOpaqueToken(saved.token);
	if (!imported) {
		await clearPersistedPairing();
		await logSecurityEvent(
			"agent_restore_failed",
			"Agent restore failed: saved token expired or invalid.",
		);
		return { restored: false, reason: "expired-or-invalid-token" };
	}

	await logSecurityEvent(
		"agent_restore_success",
		"Agent pairing restored for trusted device.",
	);

	return { restored: true, reason: "restored" };
}

export async function refreshBrokerPairingStatusDetailed(
	context: AgentBrokerPairingContext,
): Promise<AgentPairingRefreshResult> {
	if (!context.useBroker) {
		return {
			paired: false,
			ok: true,
			transient: false,
			terminal: false,
			status: 200,
			code: "OK",
			message: "",
			retryAfterSeconds: 0,
			kind: "none",
		};
	}

	const currentInFlight = context.getPairingRefreshInFlight();
	if (currentInFlight) {
		return currentInFlight;
	}

	const inFlight = (async (): Promise<AgentPairingRefreshResult> => {
		const accessToken = await context.getSupabaseAccessToken();
		if (!accessToken) {
			context.setBrokerPaired(false);
			return {
				paired: false,
				ok: false,
				transient: false,
				terminal: true,
				status: 401,
				code: "AUTH_REQUIRED",
				message: "Supabase session required for brokered agent access.",
				retryAfterSeconds: 0,
				kind: "session-required",
			};
		}

		try {
			const response = await fetchWithTimeout(`${context.brokerUrl}/session`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				credentials: "include",
				timeoutMs: 15_000,
				requestName: "Agent broker pairing session request",
				diagnosticsMode: "silent",
			});

			if (response.ok) {
				const data = (await response.json()) as { paired?: boolean } | null;
				context.setBrokerPaired(Boolean(data?.paired));
				return {
					paired: context.getBrokerPaired(),
					ok: true,
					transient: false,
					terminal: false,
					status: response.status,
					code: "OK",
					message: "",
					retryAfterSeconds: 0,
					kind: "none",
				};
			}

			const errorPayload = await context.readSessionBrokerError(response);
			const isUnauthorized = response.status === 401 || response.status === 403;
			const isProviderTimeout =
				response.status === 503 &&
				(errorPayload.code === "AUTH_PROVIDER_TIMEOUT" ||
					errorPayload.retryable);
			const isRateLimited = response.status === 429;
			const isTransient =
				isRateLimited || isProviderTimeout || response.status >= 500;

			if (isUnauthorized) {
				context.setBrokerPaired(false);
				return {
					paired: false,
					ok: false,
					transient: false,
					terminal: true,
					status: response.status,
					code: errorPayload.code || "AUTH_INVALID",
					message: errorPayload.message || "Invalid or expired Supabase token.",
					retryAfterSeconds: 0,
					kind: "unauthorized",
				};
			}

			if (!isTransient) {
				context.setBrokerPaired(false);
			}

			const code = errorPayload.code
				? errorPayload.code
				: isRateLimited
					? "AGENT_SESSION_RATE_LIMITED"
					: isProviderTimeout
						? "AUTH_PROVIDER_TIMEOUT"
						: response.status >= 500
							? "AGENT_SESSION_SERVER_ERROR"
							: "AGENT_SESSION_INVALID";

			return {
				paired: isTransient ? context.getBrokerPaired() : false,
				ok: false,
				transient: isTransient,
				terminal: !isTransient,
				status: response.status,
				code,
				message: errorPayload.message,
				retryAfterSeconds: errorPayload.retryAfterSeconds,
				kind: isRateLimited
					? "rate-limited"
					: isProviderTimeout
						? "provider-timeout"
						: response.status >= 500
							? "server-error"
							: "bad-response",
			};
		} catch (error) {
			logger.warn(
				"Failed to refresh broker pairing status; keeping prior state.",
				"AgentService",
				{
					error,
				},
			);
			return {
				paired: context.getBrokerPaired(),
				ok: false,
				transient: true,
				terminal: false,
				status: 0,
				code: "AGENT_SESSION_NETWORK_ERROR",
				message: "Unable to refresh pairing status right now.",
				retryAfterSeconds: 0,
				kind: "network",
			};
		}
	})();

	context.setPairingRefreshInFlight(inFlight);
	try {
		return await inFlight;
	} finally {
		if (context.getPairingRefreshInFlight() === inFlight) {
			context.setPairingRefreshInFlight(null);
		}
	}
}
