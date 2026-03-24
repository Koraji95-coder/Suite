import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountSettings from "./AccountSettings";

type MockAgentConnectionStatusState = {
	healthy: boolean | null;
	paired: boolean;
	loading: boolean;
	error: string;
	refreshNow: () => Promise<void>;
};

const mockUsesBroker = vi.hoisted(() => vi.fn<() => boolean>());
const mockAgentRefreshNow = vi.hoisted(() => vi.fn<() => Promise<void>>());
const mockUseAgentConnectionStatus = vi.hoisted(() =>
	vi.fn<() => MockAgentConnectionStatusState>(),
);
const mockPair = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
const mockUnpair = vi.hoisted(() => vi.fn<() => Promise<void>>());
const mockRequestVerification = vi.hoisted(() => vi.fn<() => Promise<void>>());
const MockAgentPairingRequestError = vi.hoisted(
	() =>
		class extends Error {
			readonly status: number;
			readonly retryAfterSeconds: number;
			readonly reason: string;
			readonly throttleSource: string;
			constructor(details: {
				message: string;
				status: number;
				retryAfterSeconds: number;
				reason: string;
				throttleSource: string;
			}) {
				super(details.message);
				this.status = details.status;
				this.retryAfterSeconds = details.retryAfterSeconds;
				this.reason = details.reason;
				this.throttleSource = details.throttleSource;
			}
		},
);

function createAgentConnectionStatusState(): MockAgentConnectionStatusState {
	return {
		healthy: true,
		paired: false,
		loading: false,
		error: "",
		refreshNow: mockAgentRefreshNow,
	};
}

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

vi.mock("@/services/agentService", () => ({
	AgentPairingRequestError: MockAgentPairingRequestError,
	agentService: {
		usesBroker: mockUsesBroker,
		requestPairingVerificationLink: mockRequestVerification,
		pair: mockPair,
		unpair: mockUnpair,
	},
}));

vi.mock("@/services/useAgentConnectionStatus", () => ({
	useAgentConnectionStatus: mockUseAgentConnectionStatus,
}));

describe("AccountSettings agent pairing", () => {
	beforeEach(() => {
		mockUseAgentConnectionStatus.mockReturnValue(
			createAgentConnectionStatusState(),
		);
		mockAgentRefreshNow.mockResolvedValue();
		mockPair.mockResolvedValue(false);
		mockUnpair.mockResolvedValue();
		mockRequestVerification.mockResolvedValue();
	});

	it("renders broker email-verification pairing controls", () => {
		mockUsesBroker.mockReturnValue(true);
		render(
			<MemoryRouter>
				<AccountSettings />
			</MemoryRouter>,
		);

		expect(
			screen.getByRole("button", { name: "Pair this device" }),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Resend link" })).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Unpair this device" }),
		).toBeNull();
		expect(screen.queryByPlaceholderText("000000")).toBeNull();
	});

	it("keeps code-entry pairing controls in direct mode", () => {
		mockUsesBroker.mockReturnValue(false);
		render(
			<MemoryRouter>
				<AccountSettings />
			</MemoryRouter>,
		);

		expect(screen.getByPlaceholderText("000000")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Pair this device" }),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Unpair" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Resend link" })).toBeNull();
	});

	it("shows actionable cooldown messaging for broker 429 failures", async () => {
		mockUsesBroker.mockReturnValue(true);
		mockRequestVerification.mockRejectedValue(
			new MockAgentPairingRequestError({
				message: "Email provider rate limit is active. Retry in 16 seconds.",
				status: 429,
				retryAfterSeconds: 16,
				reason: "",
				throttleSource: "supabase",
			}),
		);

		render(
			<MemoryRouter>
				<AccountSettings />
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Pair this device" }));

		await waitFor(() => {
			expect(
				screen.getByText(/Email provider rate limit is active/i),
			).toBeTruthy();
		});
		expect(
			screen.getByText(/temporarily rate-limited by the email provider/i),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /Pair this device \(16s\)/i }),
		).toBeTruthy();
	});
});
