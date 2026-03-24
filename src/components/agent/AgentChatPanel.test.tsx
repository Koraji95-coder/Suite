import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentActivityItem, AgentTaskItem } from "@/services/agent/types";
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
		vi.spyOn(agentService, "fetchProfileCatalog").mockResolvedValue({
			success: true,
			profiles: [],
		});
		vi.spyOn(agentService, "listAgentTasks").mockResolvedValue({
			success: true,
			tasks: [
				null as unknown as AgentTaskItem,
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
				} as AgentTaskItem,
			],
		});
		vi.spyOn(agentService, "getAgentActivity").mockResolvedValue({
			success: true,
			activity: [
				undefined as unknown as AgentActivityItem,
				{
					activityId: "activity-1",
					source: "run",
					eventType: "run_started",
					runId: "run-1",
					requestId: "req-1",
					message: "Started",
				} as AgentActivityItem,
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

	it("hydrates broker profile model labels from backend metadata", async () => {
		localStorage.setItem("agent-channel-scope", "devstral");
		localStorage.setItem("agent-active-profile", "devstral");

		vi.spyOn(agentService, "usesBroker").mockReturnValue(true);
		vi.spyOn(agentService, "fetchProfileCatalog").mockResolvedValue({
			success: true,
			profiles: [
				{
					id: "devstral",
					name: "Devstral",
					tagline: "Code and automation specialist",
					focus: "Implementation",
					memory_namespace: "devstral",
					model_primary: "backend-devstral-model",
					model_fallbacks: [],
				},
			],
		});
		vi.spyOn(agentService, "listAgentTasks").mockResolvedValue({
			success: true,
			tasks: [],
		});
		vi.spyOn(agentService, "getAgentActivity").mockResolvedValue({
			success: true,
			activity: [],
		});

		render(
			<MemoryRouter>
				<AgentChatPanel healthy paired />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByText("Specialist lane • model backend-devstral-model"),
			).toBeTruthy();
		});
	});

	it("keeps the collaboration surface mounted while health is unresolved", async () => {
		vi.spyOn(agentService, "usesBroker").mockReturnValue(true);
		vi.spyOn(agentService, "fetchProfileCatalog").mockResolvedValue({
			success: true,
			profiles: [],
		});
		vi.spyOn(agentService, "listAgentTasks").mockResolvedValue({
			success: true,
			tasks: [],
		});
		vi.spyOn(agentService, "getAgentActivity").mockResolvedValue({
			success: true,
			activity: [],
		});

		render(
			<MemoryRouter>
				<AgentChatPanel healthy={null} paired={false} />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(
				screen.getByPlaceholderText("Connecting to agent..."),
			).toBeTruthy();
			expect(screen.getByTestId("orchestration-panel")).toBeTruthy();
		});
	});

	it("shows actionable quick-start controls and seeds the composer from a starter prompt", async () => {
		vi.spyOn(agentService, "usesBroker").mockReturnValue(true);
		vi.spyOn(agentService, "fetchProfileCatalog").mockResolvedValue({
			success: true,
			profiles: [],
		});
		vi.spyOn(agentService, "listAgentTasks").mockResolvedValue({
			success: true,
			tasks: [],
		});
		vi.spyOn(agentService, "getAgentActivity").mockResolvedValue({
			success: true,
			activity: [],
		});

		render(
			<MemoryRouter>
				<AgentChatPanel healthy paired />
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /ask koro/i })).toBeTruthy();
		});
		expect(
			screen.getByRole("button", { name: /run crew objective/i }),
		).toBeTruthy();
		expect(screen.getByDisplayValue("Koro")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /feature review/i }));

		expect(
			screen.getByDisplayValue(
				"Coordinate a reliability review for my active feature. Return concrete implementation steps, high-risk findings, and validation checks.",
			),
		).toBeTruthy();
	});
});
