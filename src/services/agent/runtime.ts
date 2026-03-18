import { isDevAdminEmail } from "@/lib/devAccess";
import { logger } from "@/lib/logger";
import { secureTokenStorage } from "@/lib/secureTokenStorage";
import type { AgentDirectPairingContext } from "./pairingSession";
import type { AgentPairingRefreshResult } from "./types";

export const AGENT_SESSION_RETRY_AFTER_MAX_SECONDS = 120;
export const SUPABASE_SESSION_LOOKUP_TIMEOUT_MS = 8_000;
export const DEFAULT_AGENT_CONNECT_TIMEOUT_MS = 30_000;
export const MAX_DIRECT_CONNECT_TIMEOUT_MS = 30_000;
export const DEFAULT_AGENT_HEALTH_TIMEOUT_MS = 8_000;
export const MIN_AGENT_HEALTH_TIMEOUT_MS = 3_000;
export const MAX_AGENT_HEALTH_TIMEOUT_MS = 30_000;
export const DEFAULT_AGENT_STREAM_MAX_MS = 20 * 60 * 1000;
export const MIN_AGENT_STREAM_MAX_MS = 30_000;
export const MAX_AGENT_STREAM_MAX_MS = 60 * 60 * 1000;

export interface AgentServiceRuntimeState {
	baseUrl: string;
	gatewayUrl: string;
	brokerUrl: string;
	useBroker: boolean;
	brokerPaired: boolean;
	pairingConfirmInFlight: Map<string, Promise<boolean>>;
	lastHealthError: string | null;
	activeUserId: string | null;
	activeUserEmail: string | null;
	activeUserIsAdmin: boolean;
	pairingRefreshInFlight: Promise<AgentPairingRefreshResult> | null;
	activeDirectChatAbortController: AbortController | null;
	activeDirectChatCancelledByUser: boolean;
}

export function createAgentServiceRuntimeState(): AgentServiceRuntimeState {
	const transport = String(import.meta.env.VITE_AGENT_TRANSPORT || "")
		.trim()
		.toLowerCase();
	const useBroker = transport === "backend" || transport === "broker";
	const brokerUrl = String(
		import.meta.env.VITE_AGENT_BROKER_URL || "/api/agent",
	).replace(/\/+$/, "");
	const gatewayUrl =
		import.meta.env.VITE_AGENT_GATEWAY_URL ||
		import.meta.env.VITE_AGENT_URL ||
		"http://127.0.0.1:3000";
	const baseUrl = gatewayUrl.replace(/\/+$/, "");

	if (!useBroker && typeof window !== "undefined") {
		const hostname = String(window.location.hostname || "")
			.trim()
			.toLowerCase();
		const isLocalHost =
			hostname === "localhost" ||
			hostname === "127.0.0.1" ||
			hostname === "::1" ||
			hostname.endsWith(".local");
		if (!import.meta.env.DEV && hostname && !isLocalHost) {
			logger.warn(
				"Direct agent transport enabled outside local/dev; broker mode is recommended.",
				"AgentService",
				{
					transport: transport || "direct",
					host: hostname,
				},
			);
		}
	}

	return {
		baseUrl,
		gatewayUrl,
		brokerUrl,
		useBroker,
		brokerPaired: false,
		pairingConfirmInFlight: new Map<string, Promise<boolean>>(),
		lastHealthError: null,
		activeUserId: null,
		activeUserEmail: null,
		activeUserIsAdmin: false,
		pairingRefreshInFlight: null,
		activeDirectChatAbortController: null,
		activeDirectChatCancelledByUser: false,
	};
}

export function getEndpoint(runtime: AgentServiceRuntimeState): string {
	return runtime.useBroker ? runtime.brokerUrl : runtime.baseUrl;
}

export function usesBroker(runtime: AgentServiceRuntimeState): boolean {
	return runtime.useBroker;
}

export function getLastHealthError(
	runtime: AgentServiceRuntimeState,
): string | null {
	return runtime.lastHealthError;
}

export function setActiveUser(
	runtime: AgentServiceRuntimeState,
	userId: string | null,
	email?: string | null,
	isAdmin = false,
): void {
	const nextUserId = userId?.trim() || null;
	if (runtime.activeUserId && runtime.activeUserId !== nextUserId) {
		secureTokenStorage.setScope(runtime.activeUserId);
		secureTokenStorage.clearToken();
		runtime.brokerPaired = false;
	}

	runtime.activeUserId = nextUserId;
	runtime.activeUserEmail = email?.trim().toLowerCase() || null;
	runtime.activeUserIsAdmin = Boolean(isAdmin);
	secureTokenStorage.setScope(runtime.activeUserId);
}

export function isAdminUser(runtime: AgentServiceRuntimeState): boolean {
	if (runtime.activeUserIsAdmin) return true;
	return isDevAdminEmail(runtime.activeUserEmail);
}

export function isTaskAllowedForCurrentUser(
	runtime: AgentServiceRuntimeState,
	taskName: string,
): boolean {
	if (isAdminUser(runtime)) return true;
	return new Set(["chat"]).has(taskName);
}

export function getToken(): string | null {
	return secureTokenStorage.getToken();
}

export function shouldRequireWebhookSecret(
	runtime: AgentServiceRuntimeState,
): boolean {
	if (runtime.useBroker) return false;
	const value = import.meta.env.VITE_AGENT_REQUIRE_WEBHOOK_SECRET;
	if (typeof value !== "string") return true;
	return value.trim().toLowerCase() !== "false";
}

export function resolveDirectConnectTimeoutMs(taskTimeout?: number): number {
	const configuredConnectTimeout = Number(
		import.meta.env.VITE_AGENT_CONNECT_TIMEOUT_MS,
	);
	const configuredTimeout = Number(import.meta.env.VITE_AGENT_TIMEOUT);
	const candidate =
		taskTimeout ??
		(Number.isFinite(configuredConnectTimeout) && configuredConnectTimeout > 0
			? configuredConnectTimeout
			: Number.isFinite(configuredTimeout) && configuredTimeout > 0
				? configuredTimeout
				: DEFAULT_AGENT_CONNECT_TIMEOUT_MS);
	return Math.min(
		MAX_DIRECT_CONNECT_TIMEOUT_MS,
		Math.max(1_000, Math.trunc(candidate)),
	);
}

export function resolveDirectStreamMaxMs(): number {
	const configured = Number(import.meta.env.VITE_AGENT_STREAM_MAX_MS);
	if (!Number.isFinite(configured) || configured <= 0) {
		return DEFAULT_AGENT_STREAM_MAX_MS;
	}
	return Math.min(
		MAX_AGENT_STREAM_MAX_MS,
		Math.max(MIN_AGENT_STREAM_MAX_MS, Math.trunc(configured)),
	);
}

export function resolveHealthCheckTimeoutMs(): number {
	const configuredTimeout = Number(
		String(import.meta.env.VITE_AGENT_HEALTH_TIMEOUT_MS || "").trim(),
	);
	const candidate =
		Number.isFinite(configuredTimeout) && configuredTimeout > 0
			? configuredTimeout
			: DEFAULT_AGENT_HEALTH_TIMEOUT_MS;
	return Math.min(
		MAX_AGENT_HEALTH_TIMEOUT_MS,
		Math.max(MIN_AGENT_HEALTH_TIMEOUT_MS, Math.trunc(candidate)),
	);
}

export function emitPairingStateChanged(): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent("suite:agent-pairing-state-changed"));
}

export function createDirectPairingContext(
	runtime: AgentServiceRuntimeState,
): AgentDirectPairingContext {
	return {
		useBroker: runtime.useBroker,
		baseUrl: runtime.baseUrl,
		activeUserId: runtime.activeUserId,
		checkPairing: () =>
			runtime.useBroker ? runtime.brokerPaired : secureTokenStorage.hasToken(),
	};
}
