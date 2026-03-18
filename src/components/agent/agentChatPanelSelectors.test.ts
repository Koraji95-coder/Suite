import { describe, expect, it } from "vitest";
import type { AgentActivityItem, AgentTaskItem } from "@/services/agent/types";
import type { AgentConversation } from "@/services/agentTaskManager";
import {
	buildProfileRoster,
	deriveActivityDetail,
	deriveAvailableRunIds,
	filterActivityItems,
	filterQueueTasks,
	mergeRuntimeProfiles,
	normalizeAssistantReply,
	resolveVisibleConversations,
	selectQueueTasks,
	selectReviewInboxTasks,
} from "./agentChatPanelSelectors";

function makeTask(overrides: Partial<AgentTaskItem>): AgentTaskItem {
	return {
		taskId: "task-default",
		runId: "run-default",
		userId: "u1",
		assigneeProfile: "devstral",
		stage: "draft",
		title: "Task",
		description: "",
		priority: "medium",
		status: "queued",
		...overrides,
	};
}

function makeActivity(overrides: Partial<AgentActivityItem>): AgentActivityItem {
	return {
		activityId: "activity-default",
		source: "run",
		eventType: "run_started",
		runId: "run-default",
		requestId: "req-default",
		message: "Started",
		...overrides,
	};
}

describe("agentChatPanelSelectors", () => {
	it("derives recent run ids across tasks and activity", () => {
		const runIds = deriveAvailableRunIds(
			[
				makeTask({
					taskId: "t1",
					runId: "run-1",
					createdAt: "2026-03-18T11:00:00.000Z",
				}),
				makeTask({
					taskId: "t2",
					runId: "run-2",
					createdAt: "2026-03-18T10:00:00.000Z",
				}),
			],
			[
				makeActivity({
					activityId: "a1",
					runId: "run-3",
					createdAt: "2026-03-18T12:00:00.000Z",
				}),
				makeActivity({
					activityId: "a2",
					runId: "run-2",
					createdAt: "2026-03-18T12:30:00.000Z",
				}),
			],
		);

		expect(runIds).toEqual(["run-2", "run-3", "run-1"]);
	});

	it("filters queue tasks by status/priority/profile/run and preserves priority order", () => {
		const queueTasks = selectQueueTasks([
			makeTask({
				taskId: "t-critical",
				priority: "critical",
				status: "running",
				runId: "run-1",
				assigneeProfile: "devstral",
			}),
			makeTask({
				taskId: "t-medium",
				priority: "medium",
				status: "running",
				runId: "run-1",
				assigneeProfile: "devstral",
			}),
			makeTask({
				taskId: "t-review",
				priority: "high",
				status: "awaiting_review",
				runId: "run-2",
				assigneeProfile: "sentinel",
			}),
			makeTask({
				taskId: "t-approved",
				priority: "low",
				status: "approved",
				runId: "run-2",
			}),
		]);

		const filtered = filterQueueTasks({
			queueTasks,
			statusFilter: "running",
			priorityFilter: "all",
			queueProfileFilter: "devstral",
			queueRunFilter: "run-1",
		});

		expect(filtered.map((task) => task.taskId)).toEqual([
			"t-critical",
			"t-medium",
		]);
	});

	it("derives review inbox and profile roster from queue tasks", () => {
		const queueTasks = selectQueueTasks([
			makeTask({
				taskId: "awaiting-1",
				status: "awaiting_review",
				assigneeProfile: "sentinel",
			}),
			makeTask({
				taskId: "running-1",
				status: "running",
				assigneeProfile: "sentinel",
			}),
			makeTask({
				taskId: "queued-1",
				status: "queued",
				assigneeProfile: "forge",
			}),
		]);

		const reviewInbox = selectReviewInboxTasks({
			queueTasks,
			queueProfileFilter: "all",
			queueRunFilter: "all",
		});
		expect(reviewInbox.map((task) => task.taskId)).toEqual(["awaiting-1"]);

		const roster = buildProfileRoster(queueTasks);
		const sentinel = roster.find((entry) => entry.profileId === "sentinel");
		expect(sentinel).toMatchObject({
			assignedCount: 2,
			active: true,
			warningCount: 1,
		});
	});

	it("filters activity and derives payload detail text", () => {
		const activity = filterActivityItems({
			activityItems: [
				makeActivity({
					activityId: "run-1",
					source: "run",
					profileId: "devstral",
					runId: "run-123",
				}),
				makeActivity({
					activityId: "task-1",
					source: "task",
					profileId: "sentinel",
					runId: "run-456",
				}),
			],
			activitySourceFilter: "run",
			activityProfileFilter: "devstral",
			activityRunFilter: "run-123",
		});
		expect(activity).toHaveLength(1);

		const detail = deriveActivityDetail(
			makeActivity({
				eventType: "agent_message",
				payload: {
					response: "  done  ",
					stage: "synthesis",
					model: "gpt-5",
					latencyMs: 123,
				},
			}),
		);
		expect(detail).toMatchObject({
			text: "done",
			isError: false,
		});
		expect(detail?.meta).toContain("stage synthesis");
	});

	it("preserves deterministic profile model shape and run conversation visibility", () => {
		const merged = mergeRuntimeProfiles([
			{
				id: "devstral",
				name: "Devstral",
				tagline: "Builder",
				focus: "Implementation",
				memory_namespace: "devstral",
				model_primary: "backend-devstral",
				model_fallbacks: ["unused-fallback"],
			},
		]);
		expect(merged.devstral.modelPrimary).toBe("backend-devstral");
		expect(merged.devstral.modelFallbacks).toEqual([]);

		const conversations: AgentConversation[] = [
			{
				id: "manual-1",
				title: "Manual",
				profileId: "devstral",
				createdAt: "2026-03-18T10:00:00.000Z",
				updatedAt: "2026-03-18T10:00:00.000Z",
				messages: [],
				kind: "manual",
			},
			{
				id: "run-1",
				title: "Run 1",
				profileId: "team",
				createdAt: "2026-03-18T10:00:00.000Z",
				updatedAt: "2026-03-18T10:00:00.000Z",
				messages: [],
				kind: "run",
				runId: "run-1",
			},
		];
		expect(resolveVisibleConversations("team", conversations).map((c) => c.id)).toEqual([
			"run-1",
		]);
		expect(resolveVisibleConversations("devstral", conversations).map((c) => c.id)).toEqual([
			"manual-1",
			"run-1",
		]);
	});

	it("normalizes assistant response text while preserving incomplete warning", () => {
		const normalized = normalizeAssistantReply({
			response: " ok ",
			incomplete: true,
			warning: "token limit",
		});
		expect(normalized).toEqual({
			text: "ok",
			incomplete: true,
			warning: "token limit",
		});
	});
});
