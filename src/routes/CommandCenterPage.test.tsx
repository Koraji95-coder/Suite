import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CommandCenterPage from "./CommandCenterPage";

vi.mock("@/auth/useAuth", () => ({
	useAuth: () => ({
		user: {
			id: "user-1",
			email: "user@example.com",
		},
	}),
}));

vi.mock("@/lib/devAccess", () => ({
	getDevAdminEmails: () => ["user@example.com"],
	isCommandCenterAuthorized: () => true,
	normalizeEmail: (email: string | null | undefined) =>
		(email ?? "").trim().toLowerCase(),
}));

vi.mock("./command-center/useSupabaseSyncStatus", () => ({
	useSupabaseSyncStatus: () => ({
		status: null,
		loading: false,
		refreshing: false,
		error: null,
		refresh: vi.fn(),
	}),
}));

vi.mock("@/hooks/useSuiteRuntimeDoctor", () => ({
	useSuiteRuntimeDoctor: () => ({
		report: {
			schemaVersion: "suite.doctor.v1",
			checkedAt: "2026-03-24T03:00:00.000Z",
			overallState: "ready",
			actionableIssueCount: 0,
			ok: true,
			checks: [],
			groupedChecks: [],
			severityCounts: {
				ready: 4,
				background: 0,
				"needs-attention": 0,
				unavailable: 0,
			},
			recommendations: [],
		},
		loading: false,
		refreshing: false,
		refreshNow: vi.fn(),
	}),
}));

function LocationProbe() {
	const location = useLocation();
	return <div>{`${location.pathname}${location.search}`}</div>;
}

describe("CommandCenterPage", () => {
	it("ignores unsupported tab query parameters and stays on the command center route", async () => {
		render(
			<MemoryRouter initialEntries={["/app/command-center?tab=watchdog"]}>
				<Routes>
					<Route path="/app/command-center" element={<CommandCenterPage />} />
					<Route path="/app/dashboard" element={<LocationProbe />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.queryByText("/app/dashboard?focus=watchdog")).toBeNull();
		expect(screen.getByText("Developer toolshed")).toBeTruthy();
		expect(screen.queryByRole("tab")).toBeNull();
	});

	it("keeps architecture routing out of the command center surface", async () => {
		render(
			<MemoryRouter initialEntries={["/app/command-center?tab=architecture"]}>
				<Routes>
					<Route path="/app/command-center" element={<CommandCenterPage />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Developer toolshed")).toBeTruthy();
		expect(screen.queryByText("System structure map")).toBeNull();
		expect(screen.queryByText("Architecture")).toBeNull();
	});

	it("shows evidence and logs command presets on the developer commands tab", () => {
		render(
			<MemoryRouter initialEntries={["/app/command-center"]}>
				<Routes>
					<Route path="/app/command-center" element={<CommandCenterPage />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Evidence & Logs")).toBeTruthy();
		expect(screen.getAllByText("Suite Doctor").length).toBeGreaterThan(0);
		expect(screen.getByText("Check Worktale Readiness")).toBeTruthy();
		expect(screen.getByText("npm run worktale:doctor")).toBeTruthy();
		expect(screen.getByText("Open Worktale Dashboard")).toBeTruthy();
		expect(screen.getByText("worktale dash")).toBeTruthy();
		expect(screen.getByText("Generate Worktale Digest")).toBeTruthy();
		expect(screen.getByText("worktale digest")).toBeTruthy();
	});

	it("keeps runtime workstation controls out of the copied command groups", () => {
		render(
			<MemoryRouter initialEntries={["/app/command-center"]}>
				<Routes>
					<Route path="/app/command-center" element={<CommandCenterPage />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(
			screen.getByText(
				/Runtime Control owns local start, stop, restart, Watchdog plugin ops, and support bundle export/i,
			),
		).toBeTruthy();
		expect(screen.queryByText("Open Runtime Control Shell")).toBeNull();
		expect(screen.queryByText("Run AutoCAD Watchdog Doctor")).toBeNull();
	});

	it("keeps diagnostics-focused gateway and backend probes on the developer commands tab", () => {
		render(
			<MemoryRouter initialEntries={["/app/command-center"]}>
				<Routes>
					<Route path="/app/command-center" element={<CommandCenterPage />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Diagnostics")).toBeTruthy();
		expect(screen.getByText("Gateway Health Probe")).toBeTruthy();
		expect(
			screen.getByText("curl -sS http://127.0.0.1:3000/health | cat"),
		).toBeTruthy();
		expect(screen.getByText("Backend Health Probe")).toBeTruthy();
		expect(screen.getByText("Backend Runtime Snapshot")).toBeTruthy();
	});

	it("shows hosted push command presets on the developer commands tab", () => {
		render(
			<MemoryRouter initialEntries={["/app/command-center"]}>
				<Routes>
					<Route path="/app/command-center" element={<CommandCenterPage />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Hosted Push")).toBeTruthy();
		expect(screen.getByText("Run Hosted Preflight")).toBeTruthy();
		expect(screen.getByText("npm run supabase:remote:preflight")).toBeTruthy();
		expect(screen.getByText("Login To Hosted Supabase CLI")).toBeTruthy();
		expect(screen.getByText("npm run supabase:remote:login")).toBeTruthy();
		expect(screen.getByText("Set Hosted Project Ref")).toBeTruthy();
		expect(
			screen.getByText("npm run supabase:remote:target:auto"),
		).toBeTruthy();
		expect(screen.getByText("Dry-Run Hosted Push")).toBeTruthy();
		expect(screen.getByText("npm run supabase:remote:push:dry")).toBeTruthy();
		expect(screen.getByText("Push Migrations To Hosted")).toBeTruthy();
		expect(screen.getByText("npm run supabase:remote:push")).toBeTruthy();
		expect(screen.getByText("Install Windows Sign-In Preflight")).toBeTruthy();
		expect(
			screen.getByText("npm run supabase:remote:task:install"),
		).toBeTruthy();
	});
});
