import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeWorkspace } from "./HomeWorkspace";

const homeState = vi.hoisted(() => ({
	isDev: false,
}));

vi.mock("@/auth/useAuth", () => ({
	useAuth: () => ({
		user: homeState.isDev
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
	isDevAudience: () => homeState.isDev,
}));

vi.mock("@/features/project-overview/useDashboardOverviewData", () => ({
	useDashboardOverviewData: () => ({
		activities: [
			{
				id: "activity-1",
				description: "Issued package ready for customer review",
				project_id: "project-1",
				timestamp: "2026-04-03T10:15:00.000Z",
			},
		],
		isLoading: false,
		projectTaskCounts: {},
		projects: [],
		storageUsed: 104857600,
	}),
}));

vi.mock("@/features/project-overview/useDashboardDeliverySummary", () => ({
	useDashboardDeliverySummary: () => ({
		metrics: {
			totalProjects: 3,
			reviewPressureCount: 2,
			readyCount: 1,
		},
		projects: [
			{
				projectId: "project-1",
				name: "Substation Upgrade",
				summary: "Issued set is moving through review.",
				detail: "Review package is assembled and ready for the next pass.",
				state: "ready",
				stateLabel: "Ready",
				reviewItemCount: 2,
				deadline: "2026-04-10",
				nextDue: null,
			},
		],
	}),
}));

vi.mock("@/hooks/useSuiteRuntimeDoctor", () => ({
	useSuiteRuntimeDoctor: () => ({
		report: {
			actionableIssueCount: 0,
		},
		loading: false,
	}),
}));

describe("HomeWorkspace", () => {
	beforeEach(() => {
		homeState.isDev = false;
	});

	it("shows the customer-facing families without a generic apps launcher", () => {
		render(
			<MemoryRouter>
				<HomeWorkspace />
			</MemoryRouter>,
		);

		expect(screen.getByText("Current work")).toBeTruthy();
		expect(screen.getByText("Product families")).toBeTruthy();
		expect(screen.getAllByText("Projects").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Review").length).toBeGreaterThan(0);
		expect(screen.getByText("Runtime ownership")).toBeTruthy();
		expect(screen.getByText("Shared runtime-core lane")).toBeTruthy();
		expect(screen.queryByText("Open Developer")).toBeNull();
	});

	it("shows the developer family card for dev users", () => {
		homeState.isDev = true;

		render(
			<MemoryRouter>
				<HomeWorkspace />
			</MemoryRouter>,
		);

		expect(screen.getByText("Open Developer")).toBeTruthy();
		expect(
			screen.getByText(
				"Control, architecture, and labs stay outside the released customer shell.",
			),
		).toBeTruthy();
	});
});
