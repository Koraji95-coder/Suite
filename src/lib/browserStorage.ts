export type BrowserStorageApi = Pick<
	Storage,
	"getItem" | "setItem" | "removeItem"
>;

type BrowserStorageKind = "localStorage" | "sessionStorage";

function isBrowserStorageApi(value: unknown): value is BrowserStorageApi {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as BrowserStorageApi).getItem === "function" &&
		typeof (value as BrowserStorageApi).setItem === "function" &&
		typeof (value as BrowserStorageApi).removeItem === "function"
	);
}

function getBrowserStorageApi(
	kind: BrowserStorageKind,
): BrowserStorageApi | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const candidate = window[kind];
		return isBrowserStorageApi(candidate) ? candidate : null;
	} catch {
		return null;
	}
}

export function getLocalStorageApi(): BrowserStorageApi | null {
	return getBrowserStorageApi("localStorage");
}

export function getSessionStorageApi(): BrowserStorageApi | null {
	return getBrowserStorageApi("sessionStorage");
}
