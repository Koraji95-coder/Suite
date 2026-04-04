import { getSessionStorageApi } from "@/lib/browserStorage";

export type SessionAuthMethod = "email_link" | "passkey";

const PASSKEY_PENDING_KEY = "suite-passkey-signin-pending";
const SESSION_METHOD_KEY = "suite-session-auth-method-v1";
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;

type PasskeyPendingPayload = {
	verifiedAt: number;
};

type SessionMethodPayload = {
	sessionKey: string;
	method: SessionAuthMethod;
	updatedAt: number;
};

function safeParseJson<T>(raw: string | null): T | null {
	if (!raw) return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export function buildSessionAuthKey(
	userId: string | null | undefined,
	expiresAt: number | null | undefined,
): string {
	const normalizedUserId = String(userId || "").trim() || "anonymous";
	const normalizedExpiry =
		typeof expiresAt === "number" && Number.isFinite(expiresAt)
			? String(expiresAt)
			: "unknown";
	return `${normalizedUserId}:${normalizedExpiry}`;
}

export function markPasskeySignInPending(): void {
	const storage = getSessionStorageApi();
	if (!storage) return;
	const payload: PasskeyPendingPayload = {
		verifiedAt: Date.now(),
	};
	storage.setItem(PASSKEY_PENDING_KEY, JSON.stringify(payload));
}

export function consumePasskeySignInPending(): boolean {
	const storage = getSessionStorageApi();
	if (!storage) return false;

	const parsed = safeParseJson<PasskeyPendingPayload>(
		storage.getItem(PASSKEY_PENDING_KEY),
	);
	storage.removeItem(PASSKEY_PENDING_KEY);
	if (!parsed || typeof parsed.verifiedAt !== "number") return false;

	const ageMs = Date.now() - parsed.verifiedAt;
	return ageMs >= 0 && ageMs <= PENDING_MAX_AGE_MS;
}

export function storeSessionAuthMethod(
	sessionKey: string,
	method: SessionAuthMethod,
): void {
	const storage = getSessionStorageApi();
	if (!storage) return;
	const payload: SessionMethodPayload = {
		sessionKey,
		method,
		updatedAt: Date.now(),
	};
	storage.setItem(SESSION_METHOD_KEY, JSON.stringify(payload));
}

export function readSessionAuthMethod(
	sessionKey: string,
): SessionAuthMethod | null {
	const storage = getSessionStorageApi();
	if (!storage) return null;
	const parsed = safeParseJson<SessionMethodPayload>(
		storage.getItem(SESSION_METHOD_KEY),
	);
	if (!parsed || parsed.sessionKey !== sessionKey) return null;
	return parsed.method === "passkey" ? "passkey" : "email_link";
}

export function clearSessionAuthMarkers(): void {
	const storage = getSessionStorageApi();
	if (!storage) return;
	storage.removeItem(PASSKEY_PENDING_KEY);
	storage.removeItem(SESSION_METHOD_KEY);
}
