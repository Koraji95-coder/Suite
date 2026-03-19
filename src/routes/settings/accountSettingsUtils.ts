import type { PasskeyCapability } from "@/auth/passkeyCapabilityApi";
import type { StatusTone } from "./accountSettingsShared";

export interface StatusDescriptor {
	value: string;
	tone: StatusTone;
}

export function buildSessionAuthStatus(
	sessionAuthMethod: string | null | undefined,
): StatusDescriptor {
	return {
		value:
			sessionAuthMethod === "passkey"
				? "Passkey-authenticated"
				: "Authenticated",
		tone: sessionAuthMethod === "passkey" ? "success" : "primary",
	};
}

export function buildPasskeyAuthStatus(
	sessionAuthMethod: string | null | undefined,
): StatusDescriptor {
	return {
		value: sessionAuthMethod === "passkey" ? "Verified" : "Ready",
		tone: sessionAuthMethod === "passkey" ? "success" : "accent",
	};
}

export function buildPasskeyBrowserStatus(
	browserPasskeySupported: boolean,
): StatusDescriptor {
	return {
		value: browserPasskeySupported ? "Supported" : "Unsupported",
		tone: browserPasskeySupported ? "success" : "danger",
	};
}

export function buildPasskeyFrontendStatus(
	frontendPasskeyEnabled: boolean,
): StatusDescriptor {
	return {
		value: frontendPasskeyEnabled ? "Enabled" : "Disabled",
		tone: frontendPasskeyEnabled ? "success" : "warning",
	};
}

export function buildPasskeyBackendStatus(
	passkeyCapability: PasskeyCapability | null,
	passkeyLoading: boolean,
): StatusDescriptor {
	if (passkeyLoading) return { value: "Checking", tone: "primary" };
	if (!passkeyCapability?.enabled)
		return { value: "Rollout off", tone: "warning" };
	if (!passkeyCapability.config_ready) {
		return { value: "Needs config", tone: "warning" };
	}
	if (!passkeyCapability.handlers_ready) {
		return { value: "Handlers missing", tone: "warning" };
	}
	return { value: "Ready", tone: "success" };
}

export function buildAgentGatewayStatus(
	agentHealthy: boolean | null,
): StatusDescriptor {
	if (agentHealthy === null) {
		return { value: "Checking", tone: "primary" };
	}
	return agentHealthy
		? { value: "Online", tone: "success" }
		: { value: "Offline", tone: "danger" };
}

export function buildAgentPairingStatus(
	agentPaired: boolean,
): StatusDescriptor {
	return agentPaired
		? { value: "Paired", tone: "success" }
		: { value: "Not paired", tone: "warning" };
}

export function buildAgentModeStatus(usesBroker: boolean): StatusDescriptor {
	return {
		value: usesBroker ? "Brokered verification" : "Direct gateway",
		tone: usesBroker ? "accent" : "primary",
	};
}
