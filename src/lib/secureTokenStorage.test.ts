import { afterEach, describe, expect, it } from "vitest";
import { secureTokenStorage } from "@/lib/secureTokenStorage";

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

describe("secureTokenStorage", () => {
	it("fails closed when session storage is unavailable", () => {
		blockSessionStorage();

		expect(() => secureTokenStorage.setToken("token-value")).not.toThrow();
		expect(secureTokenStorage.getToken()).toBeNull();
		expect(secureTokenStorage.getTimeUntilExpiry()).toBe(0);
		expect(secureTokenStorage.exportOpaqueToken()).toBeNull();
		expect(() => secureTokenStorage.clearToken()).not.toThrow();
		expect(secureTokenStorage.importOpaqueToken("opaque-token")).toBe(false);
	});
});
