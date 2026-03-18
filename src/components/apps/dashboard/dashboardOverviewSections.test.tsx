import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	DashboardMemorySection,
	DashboardOverviewStatsGrid,
} from "./DashboardOverviewSections";

describe("dashboardOverviewSections", () => {
	it("renders the stats grid summary cards", () => {
		render(
			<DashboardOverviewStatsGrid
				projectsCount={4}
				openTasks={9}
				collectorsOnline={2}
				eventsInWindow={18}
				memoryCount={7}
				storageUsed={2048}
			/>,
		);

		expect(screen.getByText("Active projects")).toBeTruthy();
		expect(screen.getByText("4")).toBeTruthy();
		expect(screen.getByText("2.0 KB")).toBeTruthy();
	});

	it("renders memory cards and empty state messaging", () => {
		render(
			<DashboardMemorySection
				panelRef={createRef<HTMLDivElement>()}
				className="memory-panel"
				memoryError="Memory unavailable"
				sharedMemoryCount={0}
				privateMemoryCount={0}
				filteredMemories={[]}
			/>,
		);

		expect(screen.getByText("Agent Memory")).toBeTruthy();
		expect(screen.getByText("Offline")).toBeTruthy();
		expect(
			screen.getByText("No memory notes matched the current filters."),
		).toBeTruthy();
	});
});
