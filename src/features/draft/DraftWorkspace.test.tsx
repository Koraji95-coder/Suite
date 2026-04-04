import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DraftWorkspace } from "./DraftWorkspace";

const draftState = vi.hoisted(() => ({
	isDev: false,
}));

vi.mock("@/auth/useAuth", () => ({
	useAuth: () => ({
		user: draftState.isDev
			? {
					id: "dev-1",
					app_metadata: { role: "admin" },
				}
			: {
					id: "user-1",
					app_metadata: {},
				},
	}),
}));

vi.mock("@/lib/audience", () => ({
	isDevAudience: () => draftState.isDev,
}));

describe("DraftWorkspace", () => {
	beforeEach(() => {
		draftState.isDev = false;
	});

	it("shows only released drafting surfaces for customer users", () => {
		render(
			<MemoryRouter>
				<DraftWorkspace />
			</MemoryRouter>,
		);

		expect(screen.getByText("Released drafting surfaces")).toBeTruthy();
		expect(screen.getAllByText("Drawing List Manager").length).toBeGreaterThan(
			0,
		);
		expect(screen.getAllByText("Block Library").length).toBeGreaterThan(0);
		expect(screen.getByText("Project handoff")).toBeTruthy();
		expect(screen.queryByText("Automation Studio")).toBeNull();
	});

	it("shows the gated lab preview list for dev users", () => {
		draftState.isDev = true;

		render(
			<MemoryRouter>
				<DraftWorkspace />
			</MemoryRouter>,
		);

		expect(screen.getByText("Automation Studio")).toBeTruthy();
		expect(screen.getByText("AutoDraft Studio")).toBeTruthy();
		expect(screen.getByText("AutoWire")).toBeTruthy();
	});
});
