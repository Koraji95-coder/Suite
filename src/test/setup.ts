import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

function createMemoryStorage(): Storage {
	const values = new Map<string, string>();
	const storage = {
		get length() {
			return values.size;
		},
		clear() {
			for (const key of values.keys()) {
				Reflect.deleteProperty(storage, key);
			}
			values.clear();
		},
		getItem(key: string) {
			return values.has(key) ? values.get(key) ?? null : null;
		},
		key(index: number) {
			return Array.from(values.keys())[index] ?? null;
		},
		removeItem(key: string) {
			values.delete(key);
			Reflect.deleteProperty(storage, key);
		},
		setItem(key: string, value: string) {
			const normalizedValue = String(value);
			values.set(key, normalizedValue);
			Object.defineProperty(storage, key, {
				configurable: true,
				enumerable: true,
				get() {
					return values.get(key);
				},
				set(nextValue: string) {
					values.set(key, String(nextValue));
				},
			});
		},
	};

	return storage as Storage;
}

const localStorageMock = createMemoryStorage();
const sessionStorageMock = createMemoryStorage();
const originalWindowLocalStorage = Object.getOwnPropertyDescriptor(
	window,
	"localStorage",
);
const originalWindowSessionStorage = Object.getOwnPropertyDescriptor(
	window,
	"sessionStorage",
);
const originalGlobalLocalStorage = Object.getOwnPropertyDescriptor(
	globalThis,
	"localStorage",
);
const originalGlobalSessionStorage = Object.getOwnPropertyDescriptor(
	globalThis,
	"sessionStorage",
);

function installBrowserStorage() {
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: localStorageMock,
	});
	Object.defineProperty(window, "sessionStorage", {
		configurable: true,
		value: sessionStorageMock,
	});
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: localStorageMock,
	});
	Object.defineProperty(globalThis, "sessionStorage", {
		configurable: true,
		value: sessionStorageMock,
	});
}

function restoreProperty(
	target: object,
	key: "localStorage" | "sessionStorage",
	descriptor?: PropertyDescriptor,
) {
	if (descriptor) {
		Object.defineProperty(target, key, descriptor);
		return;
	}
	Reflect.deleteProperty(target, key);
}

function resetBrowserStorage() {
	localStorageMock.clear();
	sessionStorageMock.clear();
	installBrowserStorage();
}

beforeAll(() => {
	installBrowserStorage();
});

beforeEach(() => {
	resetBrowserStorage();
});

afterEach(() => {
	cleanup();
	resetBrowserStorage();
});

afterAll(() => {
	restoreProperty(window, "localStorage", originalWindowLocalStorage);
	restoreProperty(window, "sessionStorage", originalWindowSessionStorage);
	restoreProperty(globalThis, "localStorage", originalGlobalLocalStorage);
	restoreProperty(globalThis, "sessionStorage", originalGlobalSessionStorage);
});
