import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ReviewWorkspace } from "./ReviewWorkspace";

vi.mock("@/features/project-overview/useDashboardOverviewData", () => ({
	useDashboardOverviewData: () => ({
		isLoading: false,
		projectTaskCounts: {},
		projects: [],
	}),
}));

vi.mock("@/features/project-overview/useDashboardDeliverySummary", () => ({
	useDashboardDeliverySummary: () => ({
		metrics: {
			reviewPressureCount: 4,
			reviewProjectCount: 2,
			readyCount: 1,
			dueSoonCount: 3,
		},
		projects: [
			{
				projectId: "project-1",
				name: "Plant Retrofit",
				summary: "Readiness review is active.",
				detail: "Two blockers remain before release.",
				state: "needs-attention",
				stateLabel: "Needs attention",
				reviewItemCount: 2,
				issueSetStatus: "review",
				deadline: "2026-04-12",
				nextDue: null,
			},
		],
	}),
}));

vi.mock("@/hooks/useSuiteRuntimeDoctor", () => ({
	useSuiteRuntimeDoctor: () => ({
		report: {
			actionableIssueCount: 1,
		},
		loading: false,
	}),
}));

describe("ReviewWorkspace", () => {
	it("keeps review focused on released QA surfaces and clear escalation", () => {
		render(
			<MemoryRouter>
				<ReviewWorkspace />
			</MemoryRouter>,
		);

		expect(screen.getByText("Review priorities")).toBeTruthy();
		expect(screen.getAllByText("Standards Checker").length).toBeGreaterThan(0);
		expect(screen.getByText("Project review notebook")).toBeTruthy();
		expect(screen.getByText("Readiness summary")).toBeTruthy();
		expect(screen.getByText("Open Developer branch")).toBeTruthy();
	});
});
