import { describe, expect, it } from "vitest";
import {
	sanitizeActivityItems,
	sanitizeTaskItems,
} from "./agentPanelSanitizers";

describe("agentPanelSanitizers", () => {
	it("normalizes malformed task payloads without throwing", () => {
		const tasks = sanitizeTaskItems([
			null,
			"bad-row",
			{
				taskId: "task-1",
				runId: "run-1",
				title: "  ",
				status: "unexpected",
				priority: "weird",
				assigneeProfile: "",
				stage: "",
				createdAt: "invalid-date",
			},
		]);

		expect(tasks).toHaveLength(1);
		expect(tasks[0]).toMatchObject({
			taskId: "task-1",
			runId: "run-1",
			title: "Task task-1",
			status: "queued",
			priority: "medium",
			assigneeProfile: "unknown",
			stage: "unassigned",
		});
		expect(tasks[0]?.createdAt).toBeUndefined();
	});

	it("normalizes malformed activity payloads without throwing", () => {
		const activity = sanitizeActivityItems([
			undefined,
			{
				source: "invalid",
				eventType: "",
				runId: "",
				message: "",
				createdAt: "not-a-date",
			},
		]);

		expect(activity).toHaveLength(1);
		expect(activity[0]?.source).toBe("run");
		expect(activity[0]?.eventType).toBe("event");
		expect(activity[0]?.message).toBe("event event");
		expect(String(activity[0]?.createdAt || "")).toContain("T");
	});
});
