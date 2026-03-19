import { fireEvent, render, screen } from "@testing-library/react";
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

function LocationProbe() {
	const location = useLocation();
	return <div>{`${location.pathname}${location.search}`}</div>;
}

function CommandCenterWithLocation() {
	const location = useLocation();
	return (
		<>
			<div data-testid="location">{`${location.pathname}${location.search}`}</div>
			<CommandCenterPage />
		</>
	);
}

describe("CommandCenterPage", () => {
	it("drops unsupported tab query parameters and stays on the command center route", async () => {
		render(
			<MemoryRouter initialEntries={["/app/command-center?tab=watchdog"]}>
				<Routes>
					<Route path="/app/command-center" element={<CommandCenterPage />} />
					<Route path="/app/dashboard" element={<LocationProbe />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(
			screen.queryByText("/app/dashboard?focus=watchdog"),
		).toBeNull();
		expect(screen.getByText("Command Center")).toBeTruthy();
		expect(
			screen
				.getByRole("tab", { name: /Ops Commands/i })
				.getAttribute("aria-selected"),
		).toBe("true");
	});

	it("keeps tab query param behavior when switching between architecture and commands", async () => {
		render(
			<MemoryRouter initialEntries={["/app/command-center"]}>
				<Routes>
					<Route
						path="/app/command-center"
						element={<CommandCenterWithLocation />}
					/>
				</Routes>
			</MemoryRouter>,
		);

		const architectureTab = screen.getByRole("tab", {
			name: /Architecture/i,
		});
		const commandsTab = screen.getByRole("tab", {
			name: /Ops Commands/i,
		});

		fireEvent.click(architectureTab);
		expect(screen.getByTestId("location").textContent).toContain(
			"/app/command-center?tab=architecture",
		);
		expect(architectureTab.getAttribute("aria-selected")).toBe("true");

		fireEvent.click(commandsTab);
		expect(screen.getByTestId("location").textContent).toContain(
			"/app/command-center",
		);
		expect(commandsTab.getAttribute("aria-selected")).toBe("true");
	});

	it("shows Worktale command presets on the ops commands tab", () => {
		render(
			<MemoryRouter initialEntries={["/app/command-center"]}>
				<Routes>
					<Route path="/app/command-center" element={<CommandCenterPage />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Worktale")).toBeTruthy();
		expect(screen.getByText("Bootstrap Worktale")).toBeTruthy();
		expect(screen.getByText("npm run worktale:bootstrap")).toBeTruthy();
		expect(screen.getByText("Check Worktale Readiness")).toBeTruthy();
		expect(screen.getByText("npm run worktale:doctor")).toBeTruthy();
		expect(screen.getByText("Worktale Status")).toBeTruthy();
		expect(screen.getByText("worktale status")).toBeTruthy();
		expect(screen.getByText("Worktale Today")).toBeTruthy();
		expect(screen.getByText("worktale today")).toBeTruthy();
		expect(screen.getByText("Open Worktale Dashboard")).toBeTruthy();
		expect(screen.getByText("worktale dash")).toBeTruthy();
		expect(screen.getByText("Generate Worktale Digest")).toBeTruthy();
		expect(screen.getByText("worktale digest")).toBeTruthy();
		expect(screen.getByText("Append Worktale Note")).toBeTruthy();
		expect(screen.getByText('worktale note "what you worked on"')).toBeTruthy();
	});

	it("shows Watchdog command presets on the ops commands tab", () => {
		render(
			<MemoryRouter initialEntries={["/app/command-center"]}>
				<Routes>
					<Route path="/app/command-center" element={<CommandCenterPage />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Watchdog")).toBeTruthy();
		expect(screen.getByText("Install Filesystem Collector Startup")).toBeTruthy();
		expect(screen.getByText("npm run watchdog:startup:install")).toBeTruthy();
		expect(screen.getByText("Check Filesystem Collector Startup")).toBeTruthy();
		expect(screen.getByText("npm run watchdog:startup:check")).toBeTruthy();
		expect(screen.getByText("Install AutoCAD Collector Startup")).toBeTruthy();
		expect(
			screen.getByText("npm run watchdog:startup:autocad:install"),
		).toBeTruthy();
		expect(screen.getByText("Check Backend Startup")).toBeTruthy();
		expect(screen.getByText("npm run watchdog:backend:startup:check")).toBeTruthy();
		expect(screen.getByText("Run AutoCAD Watchdog Doctor")).toBeTruthy();
		expect(screen.getByText("npm run watchdog:autocad:doctor")).toBeTruthy();
	});

	it("shows Supabase command presets on the ops commands tab", () => {
		render(
			<MemoryRouter initialEntries={["/app/command-center"]}>
				<Routes>
					<Route path="/app/command-center" element={<CommandCenterPage />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Supabase")).toBeTruthy();
		expect(screen.getByText("Start Local Supabase")).toBeTruthy();
		expect(screen.getByText("npm run supabase:start")).toBeTruthy();
		expect(screen.getByText("Show Supabase Status")).toBeTruthy();
		expect(screen.getByText("npm run supabase:status")).toBeTruthy();
		expect(screen.getByText("Write Local Supabase Env")).toBeTruthy();
		expect(screen.getByText("npm run supabase:env:local")).toBeTruthy();
		expect(screen.getByText("Reset Local Supabase DB")).toBeTruthy();
		expect(screen.getByText("npm run supabase:db:reset")).toBeTruthy();
		expect(screen.getByText("Generate Supabase Types")).toBeTruthy();
		expect(screen.getByText("npm run supabase:types")).toBeTruthy();
		expect(screen.getByText("Stop Local Supabase")).toBeTruthy();
		expect(screen.getByText("npm run supabase:stop")).toBeTruthy();
		expect(screen.getByText("Clear Local Supabase Env")).toBeTruthy();
		expect(screen.getByText("npm run supabase:env:clear")).toBeTruthy();
	});
});
