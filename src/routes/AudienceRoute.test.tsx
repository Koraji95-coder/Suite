import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AudienceRoute from "./AudienceRoute";

const authState = vi.hoisted(() => ({
	user: {
		id: "user-1",
		email: "user@example.com",
		app_metadata: {} as Record<string, unknown>,
	},
	allowCommandCenter: false,
}));

vi.mock("@/auth/useAuth", () => ({
	useAuth: () => ({
		user: authState.user,
	}),
}));

vi.mock("@/lib/devAccess", () => ({
	isCommandCenterAuthorized: () => authState.allowCommandCenter,
}));

describe("AudienceRoute", () => {
	it("redirects customer users away from dev routes", () => {
		authState.user = {
			id: "user-1",
			email: "user@example.com",
			app_metadata: {},
		};
		authState.allowCommandCenter = false;

		render(
			<MemoryRouter initialEntries={["/app/developer/control/changelog"]}>
				<Routes>
					<Route
						path="/app/developer/control/changelog"
						element={
							<AudienceRoute audience="dev">
								<div>Hidden surface</div>
							</AudienceRoute>
						}
					/>
					<Route
						path="/app/home"
						element={<div>Home fallback</div>}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Home fallback")).toBeTruthy();
	});

	it("allows dev users through to dev-only routes", () => {
		authState.user = {
			id: "admin-1",
			email: "admin@example.com",
			app_metadata: {
				role: "admin",
			},
		};
		authState.allowCommandCenter = true;

		render(
			<MemoryRouter initialEntries={["/app/developer/control/command-center"]}>
				<Routes>
					<Route
						path="/app/developer/control/command-center"
						element={
							<AudienceRoute audience="dev">
								<div>Dev only</div>
							</AudienceRoute>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Dev only")).toBeTruthy();
	});
});
