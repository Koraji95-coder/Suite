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

		expect(screen.getByText("Overview")).toBeTruthy();
		expect(screen.getByText("Calendar")).toBeTruthy();
		expect(screen.getByText("Files")).toBeTruthy();
		expect(screen.getByText("Release")).toBeTruthy();
		expect(screen.getByText("Review")).toBeTruthy();

		expect(screen.queryByText("Tasks")).toBeNull();
		expect(screen.queryByText("Ground Grids")).toBeNull();
		expect(screen.queryByText("Readiness")).toBeNull();
		expect(screen.queryByText("Issue Sets")).toBeNull();
		expect(screen.queryByText("Revisions")).toBeNull();
		expect(screen.queryByText("Files & activity")).toBeNull();
		expect(screen.queryByText("Utilities")).toBeNull();
	});
});
