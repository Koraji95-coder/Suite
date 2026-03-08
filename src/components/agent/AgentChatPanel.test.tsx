import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentService } from "@/services/agentService";
import { agentTaskManager } from "@/services/agentTaskManager";
import { AgentChatPanel } from "./AgentChatPanel";

vi.mock("./AgentOrchestrationPanel", () => ({
	AgentOrchestrationPanel: () => <div data-testid="orchestration-panel" />,
}));

describe("AgentChatPanel defensive rendering", () => {
	beforeEach(() => {
		localStorage.clear();
		agentTaskManager.setScope("test-user");
		agentTaskManager.setConversationScope("team");
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders safely with malformed task/activity payload rows", async () => {
		vi.spyOn(agentService, "usesBroker").mockReturnValue(true);
		vi.spyOn(agentService, "listAgentTasks").mockResolvedValue({
			success: true,
			tasks: [
				null as any,
				{
					taskId: "task-1",
					runId: "run-1",
					status: "queued",
					priority: "high",
					title: "Task 1",
					description: "desc",
					assigneeProfile: "devstral",
					stage: "draft",
					userId: "u1",
				} as any,
			],
		});
		vi.spyOn(agentService, "getAgentActivity").mockResolvedValue({
			success: true,
			activity: [
				undefined as any,
				{
					activityId: "activity-1",
					source: "run",
					eventType: "run_started",
					runId: "run-1",
					requestId: "req-1",
					message: "Started",
				} as any,
			],
		});

		render(
			<MemoryRouter>
				<AgentChatPanel healthy paired />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByText(/Task queue/i)).toBeTruthy();
			expect(screen.getByTestId("orchestration-panel")).toBeTruthy();
		});
	});
});
