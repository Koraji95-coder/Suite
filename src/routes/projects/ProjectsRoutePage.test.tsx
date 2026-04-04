import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ProjectsRoutePage from "./ProjectsRoutePage";

const projectManagerState = vi.hoisted(() => ({
	props: null as Record<string, unknown> | null,
}));

vi.mock("@/features/project-manager", () => ({
	ProjectManager: (props: Record<string, unknown>) => {
		projectManagerState.props = props;
		return <div>Project manager route body</div>;
	},
}));

function LocationProbe() {
	const location = useLocation();
	return (
		<div data-testid="location">{`${location.pathname}${location.search}`}</div>
	);
}

function ProjectsRouteHarness() {
	return (
		<>
			<ProjectsRoutePage />
			<LocationProbe />
		</>
	);
}

describe("ProjectsRoutePage", () => {
	it("reads the notebook section from nested project routes", () => {
		projectManagerState.props = null;

		render(
			<MemoryRouter
				initialEntries={[
					"/app/projects/project-42/calendar?issueSet=issue-7",
				]}
			>
				<Routes>
					<Route
						path="/app/projects/:projectId/:section"
						element={<ProjectsRoutePage />}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Project manager route body")).toBeTruthy();
		expect(projectManagerState.props).toMatchObject({
			initialProjectId: "project-42",
			initialIssueSetId: "issue-7",
			initialViewMode: "calendar",
		});
	});

	it("normalizes invalid notebook sections back to overview", async () => {
		projectManagerState.props = null;

		render(
			<MemoryRouter
				initialEntries={["/app/projects/project-42/not-a-section"]}
			>
				<Routes>
					<Route
						path="/app/projects/:projectId/:section"
						element={<ProjectsRouteHarness />}
					/>
					<Route
						path="/app/projects/:projectId/overview"
						element={<ProjectsRouteHarness />}
					/>
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe(
				"/app/projects/project-42/overview",
			);
		});
		expect(projectManagerState.props).toMatchObject({
			initialProjectId: "project-42",
			initialViewMode: "setup",
		});
	});
});
