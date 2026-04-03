import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectDetailViewTabs } from "./ProjectDetailViewTabs";

describe("ProjectDetailViewTabs", () => {
	it("keeps the visible project workspace locked to the delivery flow", () => {
		render(
			<ProjectDetailViewTabs
				viewMode="setup"
				onViewModeChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("Setup")).toBeTruthy();
		expect(screen.getByText("Readiness")).toBeTruthy();
		expect(screen.getByText("Review")).toBeTruthy();
		expect(screen.getByText("Issue Sets")).toBeTruthy();
		expect(screen.getByText("Revisions")).toBeTruthy();
		expect(screen.getByText("Files & activity")).toBeTruthy();

		expect(screen.queryByText("Tasks")).toBeNull();
		expect(screen.queryByText("Calendar")).toBeNull();
		expect(screen.queryByText("Ground Grids")).toBeNull();
		expect(screen.queryByText("Utilities")).toBeNull();
	});
});
