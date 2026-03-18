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
});
