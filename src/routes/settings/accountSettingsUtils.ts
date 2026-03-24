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
			sessionAuthMethod === "passkey" ? "Passkey session" : "Signed-in session",
		tone: sessionAuthMethod === "passkey" ? "success" : "primary",
	};
}

export function buildPasskeyAuthStatus(
	sessionAuthMethod: string | null | undefined,
): StatusDescriptor {
	return {
		value:
			sessionAuthMethod === "passkey" ? "Passkey active" : "Password sign-in",
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
	if (passkeyLoading) return { value: "Background", tone: "muted" };
	if (!passkeyCapability?.enabled)
		return { value: "Needs attention", tone: "warning" };
	if (!passkeyCapability.config_ready) {
		return { value: "Needs attention", tone: "warning" };
	}
	if (!passkeyCapability.handlers_ready) {
		return { value: "Needs attention", tone: "warning" };
	}
	return { value: "Ready", tone: "success" };
}

export function buildAgentGatewayStatus(
	agentHealthy: boolean | null,
): StatusDescriptor {
	if (agentHealthy === null) {
		return { value: "Background", tone: "muted" };
	}
	return agentHealthy
		? { value: "Ready", tone: "success" }
		: { value: "Unavailable", tone: "danger" };
}

export function buildAgentPairingStatus(
	agentPaired: boolean,
): StatusDescriptor {
	return agentPaired
		? { value: "Ready", tone: "success" }
		: { value: "Needs attention", tone: "warning" };
}

export function buildAgentModeStatus(usesBroker: boolean): StatusDescriptor {
	return {
		value: usesBroker ? "Email verification" : "Local verification",
		tone: usesBroker ? "accent" : "primary",
	};
}
