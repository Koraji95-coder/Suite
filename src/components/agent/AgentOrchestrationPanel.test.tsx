import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentService } from "@/services/agentService";
import { AgentOrchestrationPanel } from "./AgentOrchestrationPanel";

describe("AgentOrchestrationPanel", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.spyOn(agentService, "usesBroker").mockReturnValue(true);
		vi.spyOn(agentService, "subscribeOrchestrationRunEvents").mockReturnValue({
			close: vi.fn(),
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("restores a completed run with pending review tasks and opens the review inbox", async () => {
		const handleOpenReviewInbox = vi.fn();
		vi.spyOn(agentService, "getOrchestrationRun").mockResolvedValue({
			success: true,
			requestId: "req-run-1",
			run: {
				runId: "run-1",
				status: "completed",
				requestId: "req-run-1",
				steps: [],
				messages: [],
				stages: {},
				taskSummary: {
					total: 2,
					queued: 0,
					running: 0,
					awaitingReview: 2,
					approved: 0,
					reworkRequested: 0,
					deferred: 0,
				},
				tasks: [
					{
						taskId: "task-1",
						runId: "run-1",
						userId: "user-1",
						assigneeProfile: "devstral",
						stage: "stage_b",
						title: "Dev review",
						description: "Review implementation notes",
						priority: "high",
						status: "awaiting_review",
					},
					{
						taskId: "task-2",
						runId: "run-1",
						userId: "user-1",
						assigneeProfile: "sentinel",
						stage: "stage_b",
						title: "Risk review",
						description: "Review risk notes",
						priority: "medium",
						status: "awaiting_review",
					},
				],
				finalOutput: "Synthesis ready",
			},
		});

		render(
			<AgentOrchestrationPanel
				healthy
				paired
				resumeRunId="run-1"
				onOpenReviewInbox={handleOpenReviewInbox}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Review handoff ready")).toBeTruthy();
		});
		expect(
			screen.getByText(/2 tasks still need reviewer action/i),
		).toBeTruthy();
		expect(screen.getByText(/waiting on devstral, sentinel/i)).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /open review inbox/i }));

		expect(handleOpenReviewInbox).toHaveBeenCalledWith({ runId: "run-1" });
	});

	it("restores a persisted run id when no explicit resume prop is provided", async () => {
		localStorage.setItem("agent-last-orchestration-run", "run-persisted");
		vi.spyOn(agentService, "getOrchestrationRun").mockResolvedValue({
			success: true,
			requestId: "req-run-2",
			run: {
				runId: "run-persisted",
				status: "running",
				requestId: "req-run-2",
				steps: [],
				messages: [],
				stages: {},
				taskSummary: {
					total: 3,
					queued: 1,
					running: 2,
					awaitingReview: 0,
					approved: 0,
					reworkRequested: 0,
					deferred: 0,
				},
				tasks: [],
			},
		});

		render(<AgentOrchestrationPanel healthy paired />);

		await waitFor(() => {
			expect(screen.getByText("Run in progress")).toBeTruthy();
		});
		expect(screen.getByText(/3 tracked tasks/i)).toBeTruthy();
		expect(screen.getByText(/3 active/i)).toBeTruthy();
	});
});
