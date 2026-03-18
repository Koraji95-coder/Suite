import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { logger } from "@/lib/logger";
import { secureTokenStorage } from "@/lib/secureTokenStorage";
import { logSecurityEvent } from "../securityEventService";
import {
	clearPersistedDirectPairingForUser,
	persistDirectPairingForUser,
	refreshBrokerPairingStatusDetailed,
	restoreDirectPairingForUser,
	type AgentBrokerPairingContext,
	type AgentBrokerPairingSessionErrorDetails,
} from "./pairingSession";
import type { AgentPairingVerificationContext } from "./pairingVerification";
import {
	createDirectPairingContext,
	emitPairingStateChanged,
	type AgentServiceRuntimeState,
} from "./runtime";
import type {
	AgentBrokerErrorDetails,
	AgentPairingRefreshResult,
} from "./types";

export interface AgentPairingLifecycleContext {
	runtime: AgentServiceRuntimeState;
	getSupabaseAccessToken: () => Promise<string | null>;
	readBrokerError: (response: Response, fallback: string) => Promise<string>;
	readPairingBrokerError: (
		response: Response,
		fallback: string,
	) => Promise<AgentBrokerErrorDetails>;
	readSessionBrokerError: (
		response: Response,
	) => Promise<AgentBrokerPairingSessionErrorDetails>;
}

export function createPairingVerificationContext(
	context: AgentPairingLifecycleContext,
): AgentPairingVerificationContext {
	return {
		useBroker: context.runtime.useBroker,
		brokerUrl: context.runtime.brokerUrl,
		pairingConfirmInFlight: context.runtime.pairingConfirmInFlight,
		getSupabaseAccessToken: context.getSupabaseAccessToken,
		readPairingBrokerError: context.readPairingBrokerError,
		getBrokerPaired: () => context.runtime.brokerPaired,
		setBrokerPaired: (paired) => {
			context.runtime.brokerPaired = paired;
		},
		emitPairingStateChanged,
		clearPersistedPairingForActiveUser: () =>
			clearPersistedPairingForActiveUser(context),
	};
}

function createBrokerPairingRefreshContext(
	context: AgentPairingLifecycleContext,
): AgentBrokerPairingContext {
	return {
		useBroker: context.runtime.useBroker,
		brokerUrl: context.runtime.brokerUrl,
		getSupabaseAccessToken: context.getSupabaseAccessToken,
		getBrokerPaired: () => context.runtime.brokerPaired,
		setBrokerPaired: (paired: boolean) => {
			context.runtime.brokerPaired = paired;
		},
		getPairingRefreshInFlight: () => context.runtime.pairingRefreshInFlight,
		setPairingRefreshInFlight: (
			promise: Promise<AgentPairingRefreshResult> | null,
		) => {
			context.runtime.pairingRefreshInFlight = promise;
		},
		readSessionBrokerError: context.readSessionBrokerError,
	};
}

export function checkPairing(runtime: AgentServiceRuntimeState): boolean {
	if (runtime.useBroker) {
		return runtime.brokerPaired;
	}
	return secureTokenStorage.hasToken();
}

export async function restorePairingForActiveUser(
	context: AgentPairingLifecycleContext,
): Promise<{
	restored: boolean;
	reason: string;
}> {
	if (context.runtime.useBroker) {
		const wasPaired = context.runtime.brokerPaired;
		const result = await refreshPairingStatusDetailed(context);
		if (result.paired) {
			if (!wasPaired) {
				await logSecurityEvent(
					"agent_restore_success",
					"Agent pairing restored via broker session.",
				);
			}
			return { restored: true, reason: "restored" };
		}
		if (result.transient) {
			return {
				restored: false,
				reason: result.code || "session-transient",
			};
		}
		return { restored: false, reason: "no-server-session" };
	}

	return restoreDirectPairingForUser(createDirectPairingContext(context.runtime));
}

export async function persistPairingForActiveUser(
	context: AgentPairingLifecycleContext,
): Promise<void> {
	await persistDirectPairingForUser(createDirectPairingContext(context.runtime));
}

export async function clearPersistedPairingForActiveUser(
	context: AgentPairingLifecycleContext,
): Promise<void> {
	await clearPersistedDirectPairingForUser(
		createDirectPairingContext(context.runtime),
	);
}

export async function refreshPairingStatus(
	context: AgentPairingLifecycleContext,
): Promise<boolean> {
	const result = await refreshPairingStatusDetailed(context);
	return result.paired;
}

export async function refreshPairingStatusDetailed(
	context: AgentPairingLifecycleContext,
): Promise<AgentPairingRefreshResult> {
	if (!context.runtime.useBroker) {
		const paired = checkPairing(context.runtime);
		return {
			paired,
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

	return refreshBrokerPairingStatusDetailed(
		createBrokerPairingRefreshContext(context),
	);
}

export async function pairAgent(
	context: AgentPairingLifecycleContext,
	pairingCode: string,
): Promise<boolean> {
	try {
		logger.info("Attempting to pair with agent", "AgentService");

		if (context.runtime.useBroker) {
			const accessToken = await context.getSupabaseAccessToken();
			if (!accessToken) {
				throw new Error("Supabase session required for brokered pairing.");
			}

			const response = await fetchWithTimeout(
				`${context.runtime.brokerUrl}/pair`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${accessToken}`,
					},
					credentials: "include",
					body: JSON.stringify({ pairing_code: pairingCode.trim() }),
					timeoutMs: 20_000,
					requestName: "Agent broker pair request",
				},
			);

			if (!response.ok) {
				const message = await context.readBrokerError(
					response,
					"Unable to pair with the provided code.",
				);
				throw new Error(message);
			}

			const data = (await response.json()) as
				| { paired?: boolean }
				| undefined;
			context.runtime.brokerPaired = Boolean(data?.paired);
			emitPairingStateChanged();
			await logSecurityEvent(
				"agent_pair_success",
				"Agent paired successfully via backend broker.",
			);
			return context.runtime.brokerPaired;
		}

		const response = await fetchWithTimeout(`${context.runtime.baseUrl}/pair`, {
			method: "POST",
			headers: {
				"X-Pairing-Code": pairingCode.trim(),
			},
			timeoutMs: 20_000,
			requestName: "Agent gateway pair request",
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			logger.error(
				`Pairing failed: ${response.status} ${body}`,
				"AgentService",
				new Error(response.statusText),
			);
			throw new Error(`Pairing failed: ${response.statusText}`);
		}

		const data = (await response.json()) as { token?: string };
		if (typeof data.token !== "string" || !data.token.trim()) {
			throw new Error("Pairing response did not include a valid token.");
		}

		secureTokenStorage.setToken(data.token);
		await persistPairingForActiveUser(context);
		await logSecurityEvent(
			"agent_pair_success",
			"Agent paired successfully with provided pairing code.",
		);
		logger.info("Successfully paired with agent", "AgentService");
		return true;
	} catch (error) {
		logger.error("Agent pairing error", "AgentService", error);
		await logSecurityEvent(
			"agent_pair_failed",
			"Agent pairing failed for provided pairing code.",
		);
		return false;
	}
}

export async function unpairAgent(
	context: AgentPairingLifecycleContext,
): Promise<void> {
	if (context.runtime.useBroker) {
		const accessToken = await context.getSupabaseAccessToken();
		if (accessToken) {
			await fetchWithTimeout(`${context.runtime.brokerUrl}/session/clear`, {
				method: "POST",
				headers: { Authorization: `Bearer ${accessToken}` },
				credentials: "include",
				timeoutMs: 15_000,
				requestName: "Agent broker unpair request",
			}).catch(() => null);
		}
		context.runtime.brokerPaired = false;
		emitPairingStateChanged();
	}

	secureTokenStorage.clearToken();
	await clearPersistedPairingForActiveUser(context);
	await logSecurityEvent(
		"agent_unpair",
		"Agent pairing was removed for current device/session.",
	);
	logger.info("Unpaired from agent", "AgentService");
}
