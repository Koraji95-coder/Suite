import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./LoginPage";

type AuthState = {
	user: { id: string; email?: string } | null;
	loading: boolean;
	signIn: (email: string, options: { captchaToken: string; honeypot: string }) => Promise<void>;
};

const mockSignIn = vi.hoisted(() =>
	vi.fn(
		async (
			_email: string,
			_options: { captchaToken: string; honeypot: string },
		) => undefined,
	),
);
const authState = vi.hoisted<AuthState>(() => ({
	user: null,
	loading: false,
	signIn: mockSignIn as unknown as AuthState["signIn"],
}));
const mockLoadDashboardOverviewFromBackend = vi.hoisted(() =>
	vi.fn<(onProgress: (progress: { progress: number; message?: string }) => void) => Promise<void>>(),
);
const mockNotificationSuccess = vi.hoisted(() => vi.fn());
const mockNotificationError = vi.hoisted(() => vi.fn());
const mockFetchPasskeyCapability = vi.hoisted(() => vi.fn());
const mockIsBrowserPasskeySupported = vi.hoisted(() => vi.fn(() => false));
const mockIsFrontendPasskeyEnabled = vi.hoisted(() => vi.fn(() => false));
const mockCompletePasskeyCallback = vi.hoisted(() => vi.fn());
const mockCompletePasskeySignInVerification = vi.hoisted(() => vi.fn());
const mockStartPasskeySignIn = vi.hoisted(() => vi.fn());
const mockMarkPasskeySignInPending = vi.hoisted(() => vi.fn());
const mockStartAuthentication = vi.hoisted(() => vi.fn());

vi.mock("../auth/useAuth", () => ({
	useAuth: () => authState,
}));

vi.mock("../auth/NotificationContext", () => ({
	useNotification: () => ({
		success: mockNotificationSuccess,
		error: mockNotificationError,
	}),
}));

vi.mock("../auth/passkeyCapabilityApi", () => ({
	fetchPasskeyCapability: mockFetchPasskeyCapability,
	isBrowserPasskeySupported: mockIsBrowserPasskeySupported,
	isFrontendPasskeyEnabled: mockIsFrontendPasskeyEnabled,
}));

vi.mock("../auth/passkeyAuthApi", () => ({
	completePasskeyCallback: mockCompletePasskeyCallback,
	completePasskeySignInVerification: mockCompletePasskeySignInVerification,
	startPasskeySignIn: mockStartPasskeySignIn,
}));

vi.mock("../auth/passkeySessionState", () => ({
	markPasskeySignInPending: mockMarkPasskeySignInPending,
}));

vi.mock("../auth/agentPairingParams", () => ({
	buildAgentPairingSearchFromLocation: vi.fn(() => ""),
}));

vi.mock("../auth/authRedirect", () => ({
	resolveAuthRedirect: vi.fn(() => "/login"),
}));

vi.mock("../services/securityEventService", () => ({
	logAuthMethodTelemetry: vi.fn(async () => undefined),
}));

vi.mock("../components/apps/dashboard/dashboardOverviewService", () => ({
	loadDashboardOverviewFromBackend: mockLoadDashboardOverviewFromBackend,
}));

vi.mock("../auth/AuthShell", () => ({
	default: ({ children }: { children: ReactNode }) => (
		<div data-testid="auth-shell">{children}</div>
	),
}));

vi.mock("../auth/AuthEnvDebugCard", () => ({
	default: () => <div data-testid="auth-env-debug-card" />,
}));

vi.mock("../auth/CaptchaChallenge", () => ({
	default: ({ token }: { token: string }) => (
		<div data-testid="captcha-challenge">{token}</div>
	),
}));

vi.mock("../components/agent/AgentOrbitLoader", () => ({
	AgentOrbitLoader: () => <div data-testid="agent-orbit-loader" />,
}));

vi.mock("../components/agent/AgentPixelMark", () => ({
	AgentPixelMark: () => <div data-testid="agent-pixel-mark" />,
}));

vi.mock("@simplewebauthn/browser", () => ({
	startAuthentication: mockStartAuthentication,
}));

describe("LoginPage", () => {
	beforeEach(() => {
		vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
		authState.user = null;
		authState.loading = false;
		authState.signIn = mockSignIn as unknown as AuthState["signIn"];
		mockSignIn.mockReset();
		mockNotificationSuccess.mockReset();
		mockNotificationError.mockReset();
		mockLoadDashboardOverviewFromBackend.mockReset();
		mockLoadDashboardOverviewFromBackend.mockImplementation(
			async (_onProgress) => undefined,
		);
		mockFetchPasskeyCapability.mockReset();
		mockFetchPasskeyCapability.mockResolvedValue({
			passkey: {
				enabled: false,
				config_ready: false,
				handlers_ready: false,
			},
		});
		mockIsBrowserPasskeySupported.mockReset();
		mockIsBrowserPasskeySupported.mockReturnValue(false);
		mockIsFrontendPasskeyEnabled.mockReset();
		mockIsFrontendPasskeyEnabled.mockReturnValue(false);
		mockCompletePasskeyCallback.mockReset();
		mockCompletePasskeyCallback.mockResolvedValue({
			completed: false,
			status: "failed",
			message: "",
			intent: "sign-in",
		});
		mockCompletePasskeySignInVerification.mockReset();
		mockCompletePasskeySignInVerification.mockResolvedValue({
			completed: false,
			status: "failed",
			message: "not implemented in this test",
		});
		mockStartPasskeySignIn.mockReset();
		mockStartPasskeySignIn.mockResolvedValue({
			mode: "redirect",
			redirect_url: "",
		});
		mockMarkPasskeySignInPending.mockReset();
		mockStartAuthentication.mockReset();
		mockStartAuthentication.mockResolvedValue({ id: "credential-id" });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("renders email-link form by default and transitions to sent state after submit", async () => {
		mockSignIn.mockResolvedValue(undefined);

		render(
			<MemoryRouter>
				<LoginPage />
			</MemoryRouter>,
		);

		fireEvent.change(screen.getByPlaceholderText("you@company.com"), {
			target: { value: " user@example.com " },
		});
		fireEvent.click(screen.getByRole("button", { name: "Send sign-in link" }));

		await waitFor(() => {
			expect(mockSignIn).toHaveBeenCalledWith("user@example.com", {
				captchaToken: "",
				honeypot: "",
			});
		});
		expect(await screen.findByText("Check your email")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Send another link" })).toBeTruthy();
	});

	it("renders the preparing-session state while auth is loading", () => {
		authState.loading = true;

		render(
			<MemoryRouter>
				<LoginPage />
			</MemoryRouter>,
		);

		expect(screen.getByText("Checking your account")).toBeTruthy();
		expect(screen.getByText("Preparing your session")).toBeTruthy();
	});

	it("renders the redirect session state when an authenticated user is present", () => {
		authState.user = { id: "user-1", email: "user@example.com" };
		mockLoadDashboardOverviewFromBackend.mockImplementation(
			() => new Promise<void>(() => undefined),
		);

		render(
			<MemoryRouter>
				<LoginPage />
			</MemoryRouter>,
		);

		expect(screen.getByText("Opening your dashboard")).toBeTruthy();
		expect(screen.getByText("Preparing dashboard...")).toBeTruthy();
	});

	it("shows only the inline login error when passkey verification fails", async () => {
		mockIsBrowserPasskeySupported.mockReturnValue(true);
		mockIsFrontendPasskeyEnabled.mockReturnValue(true);
		mockFetchPasskeyCapability.mockResolvedValue({
			passkey: {
				enabled: true,
				config_ready: true,
				handlers_ready: true,
			},
		});
		mockStartPasskeySignIn.mockResolvedValue({
			mode: "webauthn",
			state: "state-1",
			public_key: {
				challenge: "challenge",
				rpId: "localhost",
				timeout: 60000,
				userVerification: "preferred",
				allowCredentials: [],
			},
		});
		mockStartAuthentication.mockResolvedValue({ id: "credential-id" });
		mockCompletePasskeySignInVerification.mockResolvedValue({
			completed: false,
			status: "failed",
			message: "Passkey sign-in could not be completed.",
		});

		render(
			<MemoryRouter>
				<LoginPage />
			</MemoryRouter>,
		);

		fireEvent.click(await screen.findByRole("button", { name: "Use passkey" }));

		expect(
			await screen.findByText("Passkey sign-in could not be completed."),
		).toBeTruthy();
		expect(mockNotificationError).not.toHaveBeenCalled();
	});

	it("shows only the inline login error when a passkey credential request fails", async () => {
		mockIsBrowserPasskeySupported.mockReturnValue(true);
		mockIsFrontendPasskeyEnabled.mockReturnValue(true);
		mockFetchPasskeyCapability.mockResolvedValue({
			passkey: {
				enabled: true,
				config_ready: true,
				handlers_ready: true,
			},
		});
		mockStartPasskeySignIn.mockResolvedValue({
			mode: "webauthn",
			state: "state-1",
			public_key: {
				challenge: "challenge",
				rpId: "localhost",
				timeout: 60000,
				userVerification: "preferred",
				allowCredentials: [],
			},
		});
		mockStartAuthentication.mockRejectedValue(
			new Error("Credential request was cancelled."),
		);

		render(
			<MemoryRouter>
				<LoginPage />
			</MemoryRouter>,
		);

		fireEvent.click(await screen.findByRole("button", { name: "Use passkey" }));

		expect(
			await screen.findByText("Credential request was cancelled."),
		).toBeTruthy();
		expect(mockNotificationError).not.toHaveBeenCalled();
	});
});
