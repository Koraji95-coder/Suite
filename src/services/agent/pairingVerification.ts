import { secureTokenStorage } from "@/lib/secureTokenStorage";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { logSecurityEvent } from "../securityEventService";
import {
	AgentPairingRequestError,
	type AgentBrokerErrorDetails,
	type AgentPairingAction,
	type AgentPairingVerificationOptions,
} from "./types";

export interface AgentPairingVerificationContext {
	useBroker: boolean;
	brokerUrl: string;
	pairingConfirmInFlight: Map<string, Promise<boolean>>;
	getSupabaseAccessToken: () => Promise<string | null>;
	readPairingBrokerError: (
		response: Response,
		fallback: string,
	) => Promise<AgentBrokerErrorDetails>;
	getBrokerPaired: () => boolean;
	setBrokerPaired: (paired: boolean) => void;
	emitPairingStateChanged: () => void;
	clearPersistedPairingForActiveUser: () => Promise<void>;
}

export async function requestPairingVerificationLinkViaBroker(
	context: AgentPairingVerificationContext,
	action: AgentPairingAction,
	pairingCode?: string,
	options?: AgentPairingVerificationOptions,
): Promise<void> {
	if (!context.useBroker) {
		throw new Error(
			"Pairing verification email flow is only available in broker transport mode.",
		);
	}

	const accessToken = await context.getSupabaseAccessToken();
	if (!accessToken) {
		throw new Error("Supabase session required for brokered pairing.");
	}

	const payload: Record<string, string> = { action };
	if (action === "pair") {
		const code = (pairingCode || "").trim();
		if (code) {
			payload.pairing_code = code;
		}
	}
	const redirectTo = (options?.redirectTo || "").trim();
	if (redirectTo) {
		payload.redirect_to = redirectTo;
	}
	const redirectPath = (options?.redirectPath || "").trim();
	if (redirectPath) {
		payload.redirect_path = redirectPath;
	}

	const response = await fetchWithTimeout(`${context.brokerUrl}/pairing-challenge`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		},
		credentials: "include",
		body: JSON.stringify(payload),
		timeoutMs: 20_000,
		requestName: "Agent pairing challenge request",
	});

	if (!response.ok) {
		const details = await context.readPairingBrokerError(
			response,
			"Unable to send verification email for pairing action.",
		);
		throw new AgentPairingRequestError(details);
	}
}

export async function requestPairingCodeByEmailViaBroker(
	context: AgentPairingVerificationContext,
	options?: AgentPairingVerificationOptions,
): Promise<void> {
	if (!context.useBroker) {
		throw new Error(
			"Email pairing-code request is only available in broker transport mode.",
		);
	}

	const accessToken = await context.getSupabaseAccessToken();
	if (!accessToken) {
		throw new Error("Supabase session required for brokered pairing.");
	}

	const payload: Record<string, string> = {};
	const redirectTo = (options?.redirectTo || "").trim();
	if (redirectTo) {
		payload.redirect_to = redirectTo;
	}
	const redirectPath = (options?.redirectPath || "").trim();
	if (redirectPath) {
		payload.redirect_path = redirectPath;
	}

	const response = await fetchWithTimeout(
		`${context.brokerUrl}/pairing-code/request`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			credentials: "include",
			body: JSON.stringify(payload),
			timeoutMs: 20_000,
			requestName: "Agent pairing code email request",
		},
	);

	if (!response.ok) {
		const details = await context.readPairingBrokerError(
			response,
			"Unable to request pairing code email.",
		);
		throw new AgentPairingRequestError(details);
	}
}

export async function confirmPairingVerificationViaBroker(
	context: AgentPairingVerificationContext,
	action: AgentPairingAction,
	challengeId: string,
): Promise<boolean> {
	if (!context.useBroker) {
		throw new Error(
			"Pairing verification email flow is only available in broker transport mode.",
		);
	}

	const accessToken = await context.getSupabaseAccessToken();
	if (!accessToken) {
		throw new Error("Supabase session required for brokered pairing.");
	}

	const normalizedChallengeId = challengeId.trim();
	if (!normalizedChallengeId) {
		throw new Error("challenge_id is required");
	}
	const requestKey = `${action}:${normalizedChallengeId}`;
	const activeRequest = context.pairingConfirmInFlight.get(requestKey);
	if (activeRequest) {
		return activeRequest;
	}

	const inFlight = (async (): Promise<boolean> => {
		const response = await fetchWithTimeout(`${context.brokerUrl}/pairing-confirm`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			credentials: "include",
			body: JSON.stringify({ challenge_id: normalizedChallengeId }),
			timeoutMs: 20_000,
			requestName: "Agent pairing confirm request",
		});

		if (!response.ok) {
			const details = await context.readPairingBrokerError(
				response,
				"Unable to verify pairing action.",
			);
			throw new AgentPairingRequestError(details);
		}

		const data = (await response.json()) as
			| { paired?: boolean; action?: AgentPairingAction }
			| undefined;
		if (data?.action && data.action !== action) {
			throw new Error(
				`Verification action mismatch. Expected ${action}, received ${data.action}.`,
			);
		}
		context.setBrokerPaired(Boolean(data?.paired));

		if (action === "pair") {
			await logSecurityEvent(
				"agent_pair_success",
				"Agent pair action verified and completed via email challenge.",
			);
			context.emitPairingStateChanged();
		}

		if (action === "unpair") {
			secureTokenStorage.clearToken();
			await context.clearPersistedPairingForActiveUser();
			await logSecurityEvent(
				"agent_unpair",
				"Agent unpair action verified and completed via email challenge.",
			);
			context.emitPairingStateChanged();
		}

		return context.getBrokerPaired();
	})();

	context.pairingConfirmInFlight.set(requestKey, inFlight);
	try {
		return await inFlight;
	} finally {
		if (context.pairingConfirmInFlight.get(requestKey) === inFlight) {
			context.pairingConfirmInFlight.delete(requestKey);
		}
	}
}
