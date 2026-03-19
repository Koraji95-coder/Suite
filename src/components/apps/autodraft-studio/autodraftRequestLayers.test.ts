import { describe, expect, it, vi } from "vitest";
import type { AutoDraftApiClient } from "./autodraftApiClient";
import {
	requestAutoDraftExportCompareFeedback,
	requestAutoDraftImportCompareFeedback,
	requestAutoDraftPrepareCompare,
	requestAutoDraftRunCompare,
	requestAutoDraftSubmitCompareFeedback,
} from "./autodraftCompareRequests";
import {
	requestAutoDraftBackcheck,
	requestAutoDraftExecute,
	requestAutoDraftPlan,
} from "./autodraftCoreRequests";
import {
	requestAutoDraftLearningEvaluations,
	requestAutoDraftLearningModels,
	requestAutoDraftTrainLearning,
} from "./autodraftLearningRequests";

function createClientSpy(): {
	client: AutoDraftApiClient;
	requestJson: ReturnType<typeof vi.fn>;
} {
	const requestJson = vi.fn().mockResolvedValue({});
	const client: AutoDraftApiClient = {
		requestJson,
	};
	return { client, requestJson };
}

describe("autodraft request layer builders", () => {
	it("builds core plan/execute/backcheck payloads", async () => {
		const { client, requestJson } = createClientSpy();

		await requestAutoDraftPlan(client, [{ type: "text", color: "blue" }]);
		await requestAutoDraftExecute(client, [
			{
				id: "a1",
				rule_id: null,
				category: "NOTE",
				action: "review",
				confidence: 0.5,
				status: "review",
				markup: {},
			},
		], {
			dryRun: false,
			backcheckRequestId: "req-backcheck-1",
			workflowContext: {
				projectId: "project-1",
				lane: "autodraft-studio",
			},
			revisionContext: {
				projectId: "project-1",
				drawingNumber: "E-101",
				revision: "B",
			},
		});
		await requestAutoDraftBackcheck(client, [], {
			cadContext: { drawing: "A1.dwg" },
			requireCadContext: true,
		});

		expect(requestJson).toHaveBeenCalledWith(
			"/api/autodraft/plan",
			expect.objectContaining({
				method: "POST",
			}),
		);
		expect(requestJson).toHaveBeenCalledWith(
			"/api/autodraft/execute",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					actions: [
						{
							id: "a1",
							rule_id: null,
							category: "NOTE",
							action: "review",
							confidence: 0.5,
							status: "review",
							markup: {},
						},
					],
					dry_run: false,
					backcheck_request_id: "req-backcheck-1",
					backcheck_fail_count: 0,
					workflow_context: {
						project_id: "project-1",
						lane: "autodraft-studio",
					},
					revision_context: {
						project_id: "project-1",
						drawing_number: "E-101",
						revision: "B",
					},
				}),
			}),
		);
		expect(requestJson).toHaveBeenCalledWith(
			"/api/autodraft/backcheck",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("builds compare request payloads and multipart prepare request", async () => {
		const { client, requestJson } = createClientSpy();
		const file = new File(["%PDF"], "sheet.pdf", { type: "application/pdf" });

		await requestAutoDraftPrepareCompare(client, {
			file,
			pageIndex: 2,
			timeoutMs: 19_000,
		});
		await requestAutoDraftRunCompare(client, {
			engine: "auto",
			toleranceProfile: "medium",
			markups: [],
			timeoutMs: 123_000,
		});
		await requestAutoDraftSubmitCompareFeedback(client, {
			requestId: "req-1",
			items: [],
		});
		await requestAutoDraftExportCompareFeedback(client);
		await requestAutoDraftImportCompareFeedback(client, {
			mode: "replace",
			events: [{ id: "e1" }],
		});

		expect(requestJson).toHaveBeenCalledWith(
			"/api/autodraft/compare/prepare",
			expect.objectContaining({
				method: "POST",
				body: expect.any(FormData),
			}),
			19_000,
			{ jsonContentType: false },
		);
		expect(requestJson).toHaveBeenCalledWith(
			"/api/autodraft/compare",
			expect.objectContaining({
				method: "POST",
			}),
			123_000,
		);
		expect(requestJson).toHaveBeenCalledWith(
			"/api/autodraft/compare/feedback",
			expect.objectContaining({
				method: "POST",
			}),
		);
		expect(requestJson).toHaveBeenCalledWith(
			"/api/autodraft/compare/feedback/export",
			expect.objectContaining({
				method: "GET",
			}),
		);
		expect(requestJson).toHaveBeenCalledWith(
			"/api/autodraft/compare/feedback/import",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("builds learning endpoints with domain and limit filters", async () => {
		const { client, requestJson } = createClientSpy();

		await requestAutoDraftTrainLearning(client, {
			domain: "autodraft_replacement",
			timeoutMs: 65_000,
		});
		await requestAutoDraftLearningModels(client, "autodraft_replacement");
		await requestAutoDraftLearningEvaluations(client, {
			domain: "autodraft_replacement",
			limit: 25,
		});

		expect(requestJson).toHaveBeenCalledWith(
			"/api/autodraft/learning/train",
			expect.objectContaining({
				method: "POST",
			}),
			65_000,
		);
		expect(requestJson).toHaveBeenCalledWith(
			"/api/autodraft/learning/models?domain=autodraft_replacement",
			expect.objectContaining({
				method: "GET",
			}),
		);
		expect(requestJson).toHaveBeenCalledWith(
			"/api/autodraft/learning/evaluations?domain=autodraft_replacement&limit=25",
			expect.objectContaining({
				method: "GET",
			}),
		);
	});
});
