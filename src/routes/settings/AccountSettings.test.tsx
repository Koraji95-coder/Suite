import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountSettings from "./AccountSettings";

vi.mock("@/auth/useAuth", () => ({
	useAuth: () => ({
		user: {
			id: "user-1",
			email: "user@example.com",
			last_sign_in_at: "2026-03-07T12:00:00Z",
		},
		profile: {
			display_name: "Test User",
			email: "user@example.com",
		},
		signOut: vi.fn(async () => undefined),
		sessionAuthMethod: "email_link",
		updateProfile: vi.fn(async () => undefined),
	}),
}));

vi.mock("@/auth/passkeyCapabilityApi", () => ({
	fetchPasskeyCapability: vi.fn(async () => ({
		passkey: {
			enabled: false,
			config_ready: false,
			handlers_ready: false,
		},
	})),
	isBrowserPasskeySupported: vi.fn(() => false),
	isFrontendPasskeyEnabled: vi.fn(() => false),
}));

vi.mock("@/auth/passkeyAuthApi", () => ({
	completePasskeyCallback: vi.fn(async () => ({
		completed: false,
		message: "ok",
		intent: "enroll",
	})),
}));

vi.mock("@/services/securityEventService", () => ({
	logAuthMethodTelemetry: vi.fn(async () => undefined),
	logSecurityEvent: vi.fn(async () => undefined),
}));

vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			signOut: vi.fn(async () => ({ error: null })),
		},
	},
}));

describe("AccountSettings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders customer-safe trust controls without agent pairing", () => {
		render(
			<MemoryRouter>
				<AccountSettings />
			</MemoryRouter>,
		);

		expect(screen.getByText("Identity")).toBeTruthy();
		expect(screen.getByText("Security")).toBeTruthy();
		expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0);
		expect(screen.queryByText("Pairing")).toBeNull();
		expect(
			screen.queryByRole("button", { name: /Pair this device/i }),
		).toBeNull();
		expect(screen.queryByText("Agent access")).toBeNull();
		expect(screen.queryByText("Verification path")).toBeNull();
	});

	it("shows session, passkey, and workspace trust states in the top band", () => {
		render(
			<MemoryRouter>
				<AccountSettings />
			</MemoryRouter>,
		);

		expect(screen.getByText("Session")).toBeTruthy();
		expect(screen.getAllByText("Passkeys").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0);
		expect(screen.getByText("Connected")).toBeTruthy();
	});
});
