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

function LocationProbe() {
	const location = useLocation();
	return <div>{`${location.pathname}${location.search}`}</div>;
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
	});
});
