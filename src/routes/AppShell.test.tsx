import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageFrame } from "@/components/system/PageFrame";
import { useRegisterPageHeader } from "@/components/system/PageHeaderContext";
import AppShell from "./AppShell";

const mockState = vi.hoisted(() => ({
	diagnostics: [] as unknown[],
	auth: {
		user: {
			id: "user-1",
			email: "user@example.com",
			user_metadata: {
				display_name: "Dev",
			},
			app_metadata: {} as Record<string, unknown>,
		} as {
			id: string;
			email: string;
			user_metadata: { display_name?: string };
			app_metadata: Record<string, unknown>;
		},
		profile: {
			display_name: "Dev",
		} as { display_name: string | null } | null,
		loading: false,
		profileHydrating: false,
	},
	allowCommandCenter: false,
	runtimeReport: {
		checkedAt: "2026-03-21T18:00:00.000Z",
		ok: true,
		actionableIssueCount: 0,
		checks: [] as Array<{
			key: string;
			label: string;
			status: "ok" | "warning" | "error";
			detail: string;
			actionable?: boolean;
		}>,
	},
}));

vi.mock("@/auth/useAuth", () => ({
	useAuth: () => ({
		user: mockState.auth.user,
		profile: mockState.auth.profile,
		loading: mockState.auth.loading,
		profileHydrating: mockState.auth.profileHydrating,
		sessionAuthMethod: "session",
		signOut: vi.fn(),
		updateProfile: vi.fn(),
	}),
}));

vi.mock("@/hooks/useWatchdogProjectSync", () => ({
	useWatchdogProjectSync: () => undefined,
}));

vi.mock("@/lib/appDiagnostics", () => ({
	clearAppDiagnostics: vi.fn(),
	subscribeAppDiagnostics: (handler: (value: unknown[]) => void) => {
		handler(mockState.diagnostics);
		return () => undefined;
	},
}));

vi.mock("@/lib/runtimeDoctor", () => ({
	runSuiteRuntimeDoctor: vi.fn(() => Promise.resolve(mockState.runtimeReport)),
}));

vi.mock("@/lib/devAccess", () => ({
	isCommandCenterAuthorized: () => mockState.allowCommandCenter,
}));

vi.mock("@/lib/roles", () => ({
	hasAdminClaim: (
		user: { app_metadata?: Record<string, unknown> | null } | null,
	) => user?.app_metadata?.role === "admin",
	getAppRole: () =>
		mockState.auth.user.app_metadata?.role === "admin" ? "Admin" : "User",
}));

function AutoWireRouteFixture() {
	useRegisterPageHeader({
		title: "AutoWire",
		subtitle: "Unified routing workspace for conduit and cable runs.",
	});

	return (
		<PageFrame maxWidth="full">
			<div>AutoWire body</div>
		</PageFrame>
	);
}

function ShellFallbackFixture({ label }: { label: string }) {
	return (
		<PageFrame maxWidth="full">
			<div>{label}</div>
		</PageFrame>
	);
}

describe("AppShell", () => {
	beforeEach(() => {
		mockState.diagnostics = [];
		mockState.auth.user = {
			id: "user-1",
			email: "user@example.com",
			user_metadata: {
				display_name: "Dev",
			},
			app_metadata: {},
		};
		mockState.auth.profile = {
			display_name: "Dev",
		};
		mockState.auth.loading = false;
		mockState.auth.profileHydrating = false;
		mockState.allowCommandCenter = false;
		mockState.runtimeReport = {
			checkedAt: "2026-03-21T18:00:00.000Z",
			ok: true,
			actionableIssueCount: 0,
			checks: [],
		};
	});

	it("uses registered route headers while keeping the developer family and area rails visible", async () => {
		render(
			<MemoryRouter initialEntries={["/app/developer/labs/autowire"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route
							path="developer/labs/autowire"
							element={<AutoWireRouteFixture />}
						/>
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		expect(
			await screen.findByRole("heading", { level: 1, name: "AutoWire" }),
		).toBeTruthy();
		expect(
			screen.getByText("Unified routing workspace for conduit and cable runs."),
		).toBeTruthy();
		expect(screen.getByText("AutoWire body")).toBeTruthy();
		expect(screen.getByText("Suite board")).toBeTruthy();
		const familyRail = screen.getByText("Family").closest("div");
		expect(familyRail).toBeTruthy();
		expect(
			within(familyRail as HTMLDivElement).getByText("Developer"),
		).toBeTruthy();
		const areaRail = screen.getByText("Area").closest("div");
		expect(areaRail).toBeTruthy();
		expect(within(areaRail as HTMLDivElement).getByText("Labs")).toBeTruthy();
		const diagnosticsButton = screen.getByRole("button", {
			name: /Diagnostics all checks clear, 0 items/i,
		});
		expect(within(diagnosticsButton).getByText("Diagnostics")).toBeTruthy();
		expect(within(diagnosticsButton).getByText("0")).toBeTruthy();
		expect(screen.getAllByText("AutoWire")).toHaveLength(1);
	});

	it("falls back to family metadata when a route does not register a custom header", async () => {
		render(
			<MemoryRouter initialEntries={["/app/projects"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route
							path="projects"
							element={<ShellFallbackFixture label="Projects body" />}
						/>
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { level: 1, name: "Projects" }),
			).toBeTruthy();
		});
		expect(
			screen.getByText(
				"Project notebook for notes, meetings, files, stage status, review, and release context.",
			),
		).toBeTruthy();
	});

	it("keeps diagnostics state inside the fixed rail without rendering a separate runtime chip", async () => {
		mockState.runtimeReport = {
			checkedAt: "2026-03-21T18:05:00.000Z",
			ok: false,
			checks: [
				{
					key: "backend-health",
					label: "Backend health",
					status: "warning",
					detail: "Route is reachable, but latency is elevated.",
					actionable: true,
				},
			],
			actionableIssueCount: 1,
		};

		render(
			<MemoryRouter initialEntries={["/app/developer/labs/autowire"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route
							path="developer/labs/autowire"
							element={<AutoWireRouteFixture />}
						/>
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		const diagnosticsButton = await screen.findByRole("button", {
			name: /Diagnostics warnings present, 1 item/i,
		});
		expect(within(diagnosticsButton).getByText("Diagnostics")).toBeTruthy();
		expect(within(diagnosticsButton).getByText("1")).toBeTruthy();
		expect(screen.queryByText("Runtime drift")).toBeNull();
		expect(screen.getByText("Suite board")).toBeTruthy();
		const areaRail = screen.getByText("Area").closest("div");
		expect(areaRail).toBeTruthy();
		expect(within(areaRail as HTMLDivElement).getByText("Labs")).toBeTruthy();
	});

	it("keeps background runtime warnings out of the diagnostics chip count", async () => {
		mockState.runtimeReport = {
			checkedAt: "2026-03-21T18:06:00.000Z",
			ok: true,
			actionableIssueCount: 0,
			checks: [
				{
					key: "backend-health",
					label: "Backend health",
					status: "warning",
					detail:
						"Background route checks are being rate-limited while the local stack settles.",
					actionable: false,
				},
			],
		};

		render(
			<MemoryRouter initialEntries={["/app/developer/labs/autowire"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route
							path="developer/labs/autowire"
							element={<AutoWireRouteFixture />}
						/>
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		const diagnosticsButton = await screen.findByRole("button", {
			name: /Diagnostics all checks clear, 0 items/i,
		});
		expect(within(diagnosticsButton).getByText("0")).toBeTruthy();
	});

	it("shows only customer families for non-dev users", async () => {
		render(
			<MemoryRouter initialEntries={["/app/home"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route path="home" element={<ShellFallbackFixture label="Home body" />} />
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { level: 1, name: "Home" }),
			).toBeTruthy();
		});
		const navigation = document.querySelector("nav");
		expect(navigation).toBeTruthy();
		expect(within(navigation as HTMLElement).getByText("Home")).toBeTruthy();
		expect(
			within(navigation as HTMLElement).getByText("Projects"),
		).toBeTruthy();
		expect(within(navigation as HTMLElement).getByText("Draft")).toBeTruthy();
		expect(within(navigation as HTMLElement).getByText("Review")).toBeTruthy();
		expect(
			within(navigation as HTMLElement).queryByText("Developer"),
		).toBeNull();
	});

	it("shows the developer family when the user can access dev surfaces", async () => {
		mockState.auth.user = {
			id: "admin-1",
			email: "admin@example.com",
			user_metadata: {
				display_name: "Dev",
			},
			app_metadata: {
				role: "admin",
			},
		};
		mockState.allowCommandCenter = true;

		render(
			<MemoryRouter initialEntries={["/app/home"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route path="home" element={<ShellFallbackFixture label="Home body" />} />
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { level: 1, name: "Home" }),
			).toBeTruthy();
		});
		const navigation = document.querySelector("nav");
		expect(navigation).toBeTruthy();
		expect(
			within(navigation as HTMLElement).getAllByText("Developer").length,
		).toBeGreaterThan(0);
		expect(
			within(navigation as HTMLElement).queryByText("Internal"),
		).toBeNull();
		expect(
			within(navigation as HTMLElement).queryByText("Changelog"),
		).toBeNull();
		expect(
			within(navigation as HTMLElement).queryByText("Architecture"),
		).toBeNull();
		expect(
			within(navigation as HTMLElement).queryByText("Command Center"),
		).toBeNull();
	});

	it("does not flash the first-login prompt while the profile is still hydrating", async () => {
		mockState.auth.user = {
			id: "user-1",
			email: "user@example.com",
			user_metadata: {},
			app_metadata: {},
		};
		mockState.auth.profile = null;
		mockState.auth.profileHydrating = true;

		render(
			<MemoryRouter initialEntries={["/app/home"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route path="home" element={<ShellFallbackFixture label="Home body" />} />
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { level: 1, name: "Home" }),
			).toBeTruthy();
		});
		expect(screen.queryByText("Thanks for signing up!")).toBeNull();
		expect(screen.queryByText("What should we call you?")).toBeNull();
	});
});
