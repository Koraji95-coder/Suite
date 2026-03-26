import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AppsRoutePage from "./AppsRoutePage";

const authState = vi.hoisted(() => ({
	user: {
		id: "user-1",
		email: "user@example.com",
		app_metadata: {} as Record<string, unknown>,
	},
}));

vi.mock("@/auth/useAuth", () => ({
	useAuth: () => ({
		user: authState.user,
	}),
}));

describe("AppsRoutePage", () => {
	it("shows only customer-facing tools for customer users", () => {
		authState.user = {
			id: "customer-1",
			email: "customer@example.com",
			app_metadata: {},
		};

		render(
			<MemoryRouter>
				<AppsRoutePage />
			</MemoryRouter>,
		);

		expect(screen.getByRole("heading", { name: "Projects" })).toBeTruthy();
		expect(
			screen.getByRole("heading", { name: "Standards Checker" }),
		).toBeTruthy();
		expect(screen.queryByText("AutoDraft Studio")).toBeNull();
		expect(screen.queryByText("Agents")).toBeNull();
		expect(screen.queryByText("Developer beta")).toBeNull();
		expect(screen.getByText("Open Watchdog")).toBeTruthy();
	});

	it("keeps the Apps Hub product-only even for dev users", () => {
		authState.user = {
			id: "dev-1",
			email: "dev@example.com",
			app_metadata: {
				role: "admin",
			},
		};

		render(
			<MemoryRouter>
				<AppsRoutePage />
			</MemoryRouter>,
		);

		expect(screen.getByRole("heading", { name: "Projects" })).toBeTruthy();
		expect(screen.queryByText("AutoDraft Studio")).toBeNull();
		expect(screen.queryByText("Agents")).toBeNull();
		expect(screen.queryByText("Developer beta")).toBeNull();
		expect(screen.queryByText("Open Developer Portal")).toBeNull();
		expect(screen.getByText("Open Watchdog")).toBeTruthy();
	});
});
