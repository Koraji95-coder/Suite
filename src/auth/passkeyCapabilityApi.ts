export type PasskeyCapability = {
	enabled: boolean;
	provider: string;
	provider_label: string;
	rollout_state: string;
	handlers_ready: boolean;
	signed_callback_required?: boolean;
	config_ready: boolean;
	config_missing: string[];
	warnings: string[];
	next_step: string;
};

export type PasskeyCapabilityProbeResponse = {
	ok: boolean;
	passkey: PasskeyCapability;
	server_time?: string;
};

function parseBooleanLike(value: string | undefined): boolean {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	return (
		normalized === "1" ||
		normalized === "true" ||
		normalized === "yes" ||
		normalized === "on"
	);
}

export function isFrontendPasskeyEnabled(): boolean {
	return parseBooleanLike(import.meta.env.VITE_AUTH_PASSKEY_ENABLED);
}

export function isBrowserPasskeySupported(): boolean {
	if (typeof window === "undefined") return false;
	return typeof window.PublicKeyCredential !== "undefined";
}

export async function fetchPasskeyCapability(): Promise<PasskeyCapabilityProbeResponse> {
	const response = await fetch("/api/auth/passkey-capability", {
		method: "GET",
		headers: {
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Passkey capability lookup failed (${response.status}).`);
	}

	const payload = (await response.json()) as PasskeyCapabilityProbeResponse;
	if (!payload || typeof payload !== "object" || !payload.passkey) {
		throw new Error("Passkey capability response was invalid.");
	}

	return payload;
}
