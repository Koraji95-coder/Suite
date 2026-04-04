import { afterEach, describe, expect, it } from "vitest";
import {
	clearSessionAuthMarkers,
	consumePasskeySignInPending,
	markPasskeySignInPending,
	readSessionAuthMethod,
	storeSessionAuthMethod,
} from "@/auth/passkeySessionState";

const originalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
	window,
	"sessionStorage",
);

function restoreSessionStorage() {
	if (originalSessionStorageDescriptor) {
		Object.defineProperty(
			window,
			"sessionStorage",
			originalSessionStorageDescriptor,
		);
	}
}

function blockSessionStorage() {
	Object.defineProperty(window, "sessionStorage", {
		configurable: true,
		get() {
			throw new DOMException(
				"Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document.",
				"SecurityError",
			);
		},
	});
}

afterEach(() => {
	restoreSessionStorage();
});

describe("passkeySessionState", () => {
	it("treats blocked session storage as unavailable", () => {
		blockSessionStorage();

		expect(() => markPasskeySignInPending()).not.toThrow();
		expect(() =>
			storeSessionAuthMethod("session-key", "passkey"),
		).not.toThrow();
		expect(() => clearSessionAuthMarkers()).not.toThrow();
		expect(consumePasskeySignInPending()).toBe(false);
		expect(readSessionAuthMethod("session-key")).toBeNull();
	});
});
