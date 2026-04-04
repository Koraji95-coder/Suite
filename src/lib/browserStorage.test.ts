import { afterEach, describe, expect, it } from "vitest";
import { getLocalStorageApi, getSessionStorageApi } from "@/lib/browserStorage";

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
	window,
	"localStorage",
);
const originalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
	window,
	"sessionStorage",
);

function restoreBrowserStorage() {
	if (originalLocalStorageDescriptor) {
		Object.defineProperty(
			window,
			"localStorage",
			originalLocalStorageDescriptor,
		);
	}
	if (originalSessionStorageDescriptor) {
		Object.defineProperty(
			window,
			"sessionStorage",
			originalSessionStorageDescriptor,
		);
	}
}

function createBlockedStorageGetter(kind: "localStorage" | "sessionStorage") {
	return () => {
		throw new DOMException(
			`Failed to read the '${kind}' property from 'Window': Access is denied for this document.`,
			"SecurityError",
		);
	};
}

afterEach(() => {
	restoreBrowserStorage();
});

describe("browserStorage", () => {
	it("returns the native local storage api when available", () => {
		expect(getLocalStorageApi()).toBe(window.localStorage);
	});

	it("returns null when local storage access throws", () => {
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			get: createBlockedStorageGetter("localStorage"),
		});

		expect(getLocalStorageApi()).toBeNull();
	});

	it("returns null when session storage access throws", () => {
		Object.defineProperty(window, "sessionStorage", {
			configurable: true,
			get: createBlockedStorageGetter("sessionStorage"),
		});

		expect(getSessionStorageApi()).toBeNull();
	});
});
