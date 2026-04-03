import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	fetchIssueSetsMock,
	fetchDecisionsMock,
	fetchSnapshotMock,
	fetchReceiptsMock,
	fetchAutomationReceiptsMock,
} = vi.hoisted(() => ({
	fetchIssueSetsMock: vi.fn(async () => ({
		data: [{ id: "issue-set-1", name: "IFC package" }],
		error: null,
	})),
	fetchDecisionsMock: vi.fn(async () => ({
		data: [{ id: "decision-1", itemType: "title-block", status: "accepted" }],
		error: null,
	})),
	fetchSnapshotMock: vi.fn(async () => ({
		data: { id: "snapshot-1", rows: [], sheetNames: ["Overall"] },
		error: null,
	})),
	fetchReceiptsMock: vi.fn(async () => ({
		data: [{ id: "receipt-1", transmittalNumber: "XMTL-001" }],
		error: null,
	})),
	fetchAutomationReceiptsMock: vi.fn(async () => ({
		data: [{ id: "automation-1", mode: "combined" }],
		error: null,
	})),
}));

vi.mock("./issueSetService", () => ({
	projectIssueSetService: {
		fetchIssueSets: fetchIssueSetsMock,
	},
}));

vi.mock("@/services/projectReviewDecisionService", () => ({
	projectReviewDecisionService: {
		fetchDecisions: fetchDecisionsMock,
	},
}));

vi.mock("@/features/project-delivery", () => ({
	projectDeliverableRegisterService: {
		fetchSnapshot: fetchSnapshotMock,
	},
}));

vi.mock("@/services/projectTransmittalReceiptService", () => ({
	projectTransmittalReceiptService: {
		fetchReceipts: fetchReceiptsMock,
	},
}));

vi.mock("@/services/projectAutomationReceiptService", () => ({
	projectAutomationReceiptService: {
		fetchReceipts: fetchAutomationReceiptsMock,
	},
}));

import { projectWorkflowSharedStateService } from "./sharedStateService";

describe("projectWorkflowSharedStateService", () => {
	beforeEach(() => {
		projectWorkflowSharedStateService.clearAll();
		fetchIssueSetsMock.mockClear();
		fetchDecisionsMock.mockClear();
		fetchSnapshotMock.mockClear();
		fetchReceiptsMock.mockClear();
		fetchAutomationReceiptsMock.mockClear();
	});

	it("dedupes concurrent project workflow fetches and reuses the shared cache", async () => {
		const projectId = "project-workflow-cache";

		const [first, second] = await Promise.all([
			projectWorkflowSharedStateService.fetch(projectId),
			projectWorkflowSharedStateService.fetch(projectId),
		]);

		expect(first.data.issueSets[0]?.id).toBe("issue-set-1");
		expect(second.data.decisions[0]?.id).toBe("decision-1");
		expect(fetchIssueSetsMock).toHaveBeenCalledTimes(1);
		expect(fetchDecisionsMock).toHaveBeenCalledTimes(1);
		expect(fetchSnapshotMock).toHaveBeenCalledTimes(1);
		expect(fetchReceiptsMock).toHaveBeenCalledTimes(1);
		expect(fetchAutomationReceiptsMock).toHaveBeenCalledTimes(1);

		await projectWorkflowSharedStateService.fetch(projectId);

		expect(fetchIssueSetsMock).toHaveBeenCalledTimes(1);
		expect(fetchDecisionsMock).toHaveBeenCalledTimes(1);
		expect(fetchSnapshotMock).toHaveBeenCalledTimes(1);
		expect(fetchReceiptsMock).toHaveBeenCalledTimes(1);
		expect(fetchAutomationReceiptsMock).toHaveBeenCalledTimes(1);
	});

	it("drops the shared cache for a project when cleared", async () => {
		const projectId = "project-workflow-clear";

		await projectWorkflowSharedStateService.fetch(projectId);
		projectWorkflowSharedStateService.clear(projectId);
		await projectWorkflowSharedStateService.fetch(projectId);

		expect(fetchIssueSetsMock).toHaveBeenCalledTimes(2);
		expect(fetchDecisionsMock).toHaveBeenCalledTimes(2);
		expect(fetchSnapshotMock).toHaveBeenCalledTimes(2);
		expect(fetchReceiptsMock).toHaveBeenCalledTimes(2);
		expect(fetchAutomationReceiptsMock).toHaveBeenCalledTimes(2);
	});
});
