import { render, screen } from "@testing-library/react";
import { Activity, ClipboardCheck } from "lucide-react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import {
	DashboardDeliveryBoardSection,
	DashboardOverviewStatsGrid,
} from "./DashboardOverviewSections";

describe("dashboardOverviewSections", () => {
	it("renders the stats grid summary cards", () => {
		render(
			<DashboardOverviewStatsGrid
				stats={[
					{
						key: "projects",
						icon: Activity,
						value: 4,
						label: "Active projects",
					},
					{
						key: "ready",
						icon: ClipboardCheck,
						value: 2,
						label: "Packages ready",
					},
				]}
			/>,
		);

		expect(screen.getByText("Active projects")).toBeTruthy();
		expect(screen.getByText("4")).toBeTruthy();
		expect(screen.getByText("Packages ready")).toBeTruthy();
	});

	it("renders the delivery board summary for customer-ready projects", () => {
		render(
			<DashboardDeliveryBoardSection
				panelRef={createRef<HTMLDivElement>()}
				className="delivery-panel"
				isLoading={false}
				deliveryLoading={false}
				deliveryError={null}
				deliveryProjects={[
					{
						projectId: "project-1",
						name: "Project Alpha",
						deadline: "2026-03-25",
						nextDue: null,
						openTaskCount: 2,
						watchdogRootConfigured: true,
						needsSetup: false,
						issueSetId: "issue-1",
						issueSetName: "Alpha issue set",
						issueTag: "ISSUE-01",
						issueSetStatus: "ready",
						reviewItemCount: 0,
						selectedDrawingCount: 12,
						trackedDrawingCount: 8,
						unresolvedRevisionCount: 0,
						transmittalReceiptCount: 1,
						transmittalPendingReviewCount: 0,
						transmittalNumber: "TR-100",
						lastReceiptAt: "2026-03-18T03:00:00.000Z",
						state: "ready",
						stateLabel: "Ready for issue",
						summary: "ISSUE-01 is ready to move into issue.",
						detail:
							"Transmittal TR-100 is linked to the current package draft.",
						dueSoon: true,
						overdue: false,
					},
				]}
				deliveryMetrics={{
					totalProjects: 1,
					reviewPressureCount: 0,
					reviewProjectCount: 0,
					readyCount: 1,
					issuedCount: 0,
					packagesInProgressCount: 0,
					transmittalQueueCount: 1,
					setupAttentionCount: 0,
					dueSoonCount: 1,
					overdueCount: 0,
					openTaskCount: 2,
				}}
				watchdogEventCountByProject={new Map([["project-1", 3]])}
				filteredActivities={[]}
				handleNavigateToProject={() => undefined}
			/>,
		);

		expect(screen.getByText("Delivery board")).toBeTruthy();
		expect(screen.getByText("Project package readiness")).toBeTruthy();
		expect(screen.getByText("ISSUE-01")).toBeTruthy();
		expect(screen.getByText("TR-100")).toBeTruthy();
	});
});
