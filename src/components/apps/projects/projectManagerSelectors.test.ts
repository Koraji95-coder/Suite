import { describe, expect, it } from "vitest";
import {
	deriveProjectManagerSummary,
	selectVisibleProjects,
} from "./projectManagerSelectors";
import type { Project, Task } from "./projectmanagertypes";

function makeProject(
	id: string,
	name: string,
	status: Project["status"],
	description = "",
): Project {
	return {
		id,
		name,
		status,
		description,
	} as unknown as Project;
}

function makeTask(id: string, name: string): Task {
	return { id, name } as unknown as Task;
}

describe("projectManagerSelectors", () => {
	it("filters visible projects by status and search query", () => {
		const projects = [
			makeProject("p-active", "Alpha Build", "active", "Main build lane"),
			makeProject("p-hold", "Beta Hold", "on-hold", "Paused work"),
			makeProject("p-archived", "Archive Set", "completed", "Closed project"),
		];

		expect(
			selectVisibleProjects({
				projects,
				statusFilter: "active",
				projectSearch: "",
			}).map((project) => project.id),
		).toEqual(["p-active"]);

		expect(
			selectVisibleProjects({
				projects,
				statusFilter: "archived",
				projectSearch: "",
			}).map((project) => project.id),
		).toEqual(["p-archived"]);

		expect(
			selectVisibleProjects({
				projects,
				statusFilter: "all",
				projectSearch: "paused",
			}).map((project) => project.id),
		).toEqual(["p-hold"]);
	});

	it("derives summary counts, breadcrumb, and pending labels", () => {
		const projects = [
			makeProject("p1", "Active One", "active"),
			makeProject("p2", "Archived One", "completed"),
		];
		const tasks = [makeTask("t1", "Wire panel")];

		expect(
			deriveProjectManagerSummary({
				projects,
				selectedProject: projects[0],
				tasks,
				projectIdPendingDelete: "p2",
				taskIdPendingDelete: "t1",
			}),
		).toEqual({
			totalProjects: 2,
			archivedProjects: 1,
			activeProjects: 1,
			currentCrumb: "Active One",
			pendingProjectName: "Archived One",
			pendingTaskName: "Wire panel",
		});
	});

	it("falls back to default labels when pending ids are missing", () => {
		const summary = deriveProjectManagerSummary({
			projects: [],
			selectedProject: null,
			tasks: [],
			projectIdPendingDelete: "missing-project",
			taskIdPendingDelete: "missing-task",
		});

		expect(summary.currentCrumb).toBe("Overview");
		expect(summary.pendingProjectName).toBe("this project");
		expect(summary.pendingTaskName).toBe("this task");
	});
});
