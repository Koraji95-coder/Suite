import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useRegisterPageHeader } from "@/components/apps/ui/PageHeaderContext";
import AppShell from "./AppShell";

const mockState = vi.hoisted(() => ({
	diagnostics: [] as unknown[],
	auth: {
		user: {
			id: "user-1",
			email: "user@example.com",
			user_metadata: {
				display_name: "Dustin",
			},
			app_metadata: {} as Record<string, unknown>,
		},
		profile: {
			display_name: "Dustin",
		},
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

function CalendarFallbackFixture() {
	return (
		<PageFrame maxWidth="full">
			<div>Calendar body</div>
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
				display_name: "Dustin",
			},
			app_metadata: {},
		};
		mockState.auth.profile = {
			display_name: "Dustin",
		};
		mockState.allowCommandCenter = false;
		mockState.runtimeReport = {
			checkedAt: "2026-03-21T18:00:00.000Z",
			ok: true,
			actionableIssueCount: 0,
			checks: [],
		};
	});

	it("uses registered route headers as the shell title and avoids a duplicate PageFrame hero", async () => {
		render(
			<MemoryRouter initialEntries={["/app/apps/autowire"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route path="apps/autowire" element={<AutoWireRouteFixture />} />
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
		expect(screen.getAllByText("AutoWire")).toHaveLength(1);
		expect(screen.getByText("Suite workspace")).toBeTruthy();
		const areaRail = screen.getByText("Area").closest("div");
		expect(areaRail).toBeTruthy();
		expect(
			within(areaRail as HTMLDivElement).getByText("Automation Lab"),
		).toBeTruthy();
		const diagnosticsButton = screen.getByRole("button", {
			name: /Diagnostics all checks clear, 0 items/i,
		});
		expect(within(diagnosticsButton).getByText("Diagnostics")).toBeTruthy();
		expect(within(diagnosticsButton).getByText("0")).toBeTruthy();
	});

	it("falls back to section metadata when a route does not register a custom header", async () => {
		render(
			<MemoryRouter initialEntries={["/app/calendar"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route path="calendar" element={<CalendarFallbackFixture />} />
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { level: 1, name: "Calendar" }),
			).toBeTruthy();
		});
		expect(
			screen.getByText(
				"Scheduling, commitments, and upcoming delivery timing.",
			),
		).toBeTruthy();
	});

	it("keeps diagnostics state inside the fixed rail without rendering a separate runtime drift chip", async () => {
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
			<MemoryRouter initialEntries={["/app/apps/autowire"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route path="apps/autowire" element={<AutoWireRouteFixture />} />
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
		expect(screen.getByText("Suite workspace")).toBeTruthy();
		const areaRail = screen.getByText("Area").closest("div");
		expect(areaRail).toBeTruthy();
		expect(
			within(areaRail as HTMLDivElement).getByText("Automation Lab"),
		).toBeTruthy();
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
			<MemoryRouter initialEntries={["/app/apps/autowire"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route path="apps/autowire" element={<AutoWireRouteFixture />} />
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		const diagnosticsButton = await screen.findByRole("button", {
			name: /Diagnostics all checks clear, 0 items/i,
		});
		expect(within(diagnosticsButton).getByText("0")).toBeTruthy();
	});

	it("shows only customer-facing navigation for non-dev users", async () => {
		render(
			<MemoryRouter initialEntries={["/app/dashboard"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route path="dashboard" element={<CalendarFallbackFixture />} />
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText("Workspace")).toBeTruthy();
		});
		expect(screen.queryByText("Developer")).toBeNull();
		expect(screen.queryByText("Changelog")).toBeNull();
		expect(screen.queryByText("Agents")).toBeNull();
		expect(screen.queryByText("Architecture")).toBeNull();
		expect(screen.queryByText("Command Center")).toBeNull();
	});

	it("shows a compact developer group when the user can access dev surfaces", async () => {
		mockState.auth.user = {
			id: "admin-1",
			email: "admin@example.com",
			user_metadata: {
				display_name: "Dustin",
			},
			app_metadata: {
				role: "admin",
			},
		};
		mockState.allowCommandCenter = true;

		render(
			<MemoryRouter initialEntries={["/app/dashboard"]}>
				<Routes>
					<Route path="/app" element={<AppShell />}>
						<Route path="dashboard" element={<CalendarFallbackFixture />} />
					</Route>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getAllByText("Developer").length).toBeGreaterThan(0);
		});
		expect(screen.getAllByText("Developer").length).toBeGreaterThan(0);
		expect(screen.queryByText("Internal")).toBeNull();
		expect(screen.queryByText("Changelog")).toBeNull();
		expect(screen.queryByText("Agents")).toBeNull();
		expect(screen.queryByText("Architecture")).toBeNull();
		expect(screen.queryByText("Command Center")).toBeNull();
	});
});
