import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	settingsStore,
	loadSettingMock,
	loadSettingsForProjectsMock,
	saveSettingMock,
	deleteSettingMock,
} = vi.hoisted(() => {
	const nextSettingsStore = new Map<string, unknown>();
	return {
		settingsStore: nextSettingsStore,
		loadSettingMock: vi.fn(async (key: string, scope: string) =>
			nextSettingsStore.get(`${key}:${scope}`) ?? null,
		),
		loadSettingsForProjectsMock: vi.fn(
			async (key: string, scopes: string[]) =>
				new Map(
					scopes
						.map((scope) => [
							scope,
							nextSettingsStore.get(`${key}:${scope}`),
						] as const)
						.filter((entry) => entry[1] !== undefined),
				),
		),
		saveSettingMock: vi.fn(
			async (key: string, value: unknown, scope: string) => {
				nextSettingsStore.set(`${key}:${scope}`, value);
				return { success: true, error: null };
			},
		),
		deleteSettingMock: vi.fn(async (key: string, scope: string) => {
			nextSettingsStore.delete(`${key}:${scope}`);
			return { success: true, error: null };
		}),
	};
});

vi.mock("@/settings/userSettings", () => ({
	loadSetting: loadSettingMock,
	loadSettingsForProjects: loadSettingsForProjectsMock,
	saveSetting: saveSettingMock,
	deleteSetting: deleteSettingMock,
}));

import { projectDeliverableRegisterService } from "@/features/project-delivery";
import { projectAutomationReceiptService } from "@/services/projectAutomationReceiptService";
import { projectIssueSetService } from "@/features/project-workflow/issueSetService";
import { projectReviewDecisionService } from "@/services/projectReviewDecisionService";
import { projectTransmittalReceiptService } from "@/services/projectTransmittalReceiptService";

function createIssueSetRecord() {
	return {
		id: "issue-set-1",
		projectId: "project-1",
		name: "IFC package",
		issueTag: "IFC-01",
		status: "review",
		targetDate: "2026-04-10",
		transmittalNumber: "XMTL-001",
		transmittalDocumentName: "IFC package",
		registerSnapshotId: null,
		terminalScheduleSnapshotId: null,
		workPackageId: null,
		recipeSnapshotId: null,
		summary: "Ready for issue review.",
		notes: null,
		selectedDrawingPaths: ["Issued/DWG-001.dwg"],
		selectedRegisterRowIds: [],
		selectedDrawingNumbers: ["DWG-001"],
		selectedPdfFileIds: ["pdf-1"],
		snapshot: {
			drawingCount: 5,
			selectedDrawingCount: 1,
			reviewItemCount: 0,
			titleBlockReviewCount: 0,
			standardsReviewCount: 0,
			unresolvedRevisionCount: 0,
			setupBlockerCount: 0,
			trackedDrawingCount: 1,
			acceptedTitleBlockCount: 0,
			waivedStandardsCount: 0,
		},
		createdAt: "2026-04-02T00:00:00.000Z",
		updatedAt: "2026-04-02T00:00:00.000Z",
		issuedAt: null,
	};
}

function createReviewDecisionRecord() {
	return {
		id: "decision-1",
		projectId: "project-1",
		issueSetId: "issue-set-1",
		itemId: "title-block:row-1",
		itemType: "title-block",
		fingerprint: "row-1:fingerprint",
		status: "accepted",
		note: null,
		createdAt: "2026-04-02T00:00:00.000Z",
		updatedAt: "2026-04-02T00:00:00.000Z",
	};
}

function createTransmittalReceiptRecord() {
	return {
		id: "receipt-1",
		projectId: "project-1",
		projectName: "MyProject",
		projectNumber: "25074",
		transmittalType: "standard",
		transmittalNumber: "XMTL-001",
		description: "Issue package",
		date: "2026-04-02",
		outputFormat: "pdf",
		standardDocumentSource: "project_metadata",
		projectMetadataLoadedAt: "2026-04-02T00:00:00.000Z",
		outputs: [
			{
				label: "PDF",
				filename: "myproject-ifc.pdf",
				size: 2048,
				createdAt: "2026-04-02T00:00:00.000Z",
			},
		],
		documentCount: 3,
		reviewedDocumentCount: 3,
		pendingReviewCount: 0,
		cidDocumentCount: 0,
		contactCount: 1,
		fileSummary: {
			template: "template.docx",
			index: "index.xlsx",
			documents: "3 PDFs",
			report: "report.xlsx",
		},
		optionSummary: [{ label: "Delivery", value: "Email" }],
		generatedMessage: "Generated successfully.",
		generatedAt: "2026-04-02T00:00:00.000Z",
	};
}

function createAutomationReceiptRecord() {
	return {
		id: "automation-1",
		projectId: "project-1",
		issueSetId: "issue-set-1",
		registerSnapshotId: "register-1",
		mode: "combined",
		summary: "Automation run recorded.",
		preparedMarkupCount: 1,
		reviewItemCount: 0,
		routeCount: 0,
		affectedDrawingCount: 1,
		noteInsertCount: 0,
		revisionCloudUpsertCount: 0,
		deltaNoteUpsertCount: 0,
		issueTagUpsertCount: 0,
		titleBlockUpdateCount: 1,
		textReplacementCount: 0,
		textDeleteCount: 0,
		textSwapCount: 0,
		dimensionOverrideCount: 0,
		cadUtilityChangedDrawingCount: 0,
		cadUtilityChangedItemCount: 0,
		terminalStripUpdateCount: 0,
		managedRouteUpsertCount: 0,
		markupSnapshotIds: ["markup-1"],
		terminalScheduleSnapshotId: null,
		reportId: null,
		requestId: "request-1",
		drawingName: "DWG-001",
		createdAt: "2026-04-02T00:00:00.000Z",
	};
}

function createDeliverableRegisterSnapshot() {
	return {
		id: "snapshot-1",
		projectId: "project-1",
		workbookFileName: "deliverables.xlsx",
		importedAt: "2026-04-02T00:00:00.000Z",
		dwgRootPath: "C:/Projects/MyProject",
		pdfSourceSummary: "Issued PDFs",
		sheetNames: ["Overall"],
		rowCount: 1,
		rows: [
			{
				id: "row-1",
				snapshotId: "snapshot-1",
				sheetName: "Overall",
				setName: "BESS",
				drawingNumber: "DWG-001",
				drawingKey: "DWG001",
				drawingDescription: "One Line Diagram",
				currentRevision: "A",
				revisionHistory: [],
				notes: null,
				status: null,
				readinessState: "package-ready",
				pdfPairingStatus: "paired",
				pdfMatches: [],
				manualPdfMatchId: null,
				dwgPairingStatus: "paired",
				dwgMatches: [],
				manualDwgMatchId: null,
				titleBlockVerificationState: "matched",
				titleBlockVerificationDetail: null,
				acadeVerificationState: "matched",
				acadeVerificationDetail: null,
				issueSetEligible: true,
			},
		],
	};
}

describe("project workflow settings caches", () => {
	beforeEach(() => {
		settingsStore.clear();
		loadSettingMock.mockClear();
		loadSettingsForProjectsMock.mockClear();
		saveSettingMock.mockClear();
		if (
			typeof window !== "undefined" &&
			window.localStorage &&
			typeof window.localStorage.clear === "function"
		) {
			window.localStorage.clear();
		}
	});

	it("dedupes concurrent issue set fetches and reuses the short-lived cache", async () => {
		const projectId = "project-issue-set-fetch";
		settingsStore.set(
			`project_issue_sets_v1:${projectId}`,
			[{ ...createIssueSetRecord(), projectId }],
		);

		const [first, second] = await Promise.all([
			projectIssueSetService.fetchIssueSets(projectId),
			projectIssueSetService.fetchIssueSets(projectId),
		]);

		expect(first.error).toBeNull();
		expect(second.data).toHaveLength(1);
		expect(loadSettingMock).toHaveBeenCalledTimes(1);

		const third = await projectIssueSetService.fetchIssueSets(projectId);
		expect(third.data[0]?.issueTag).toBe("IFC-01");
		expect(loadSettingMock).toHaveBeenCalledTimes(1);
	});

	it("bulk-loads issue sets for multiple projects in a single settings query", async () => {
		const projectA = "project-issue-set-bulk-a";
		const projectB = "project-issue-set-bulk-b";
		settingsStore.set(
			`project_issue_sets_v1:${projectA}`,
			[{ ...createIssueSetRecord(), projectId: projectA, issueTag: "IFC-01" }],
		);
		settingsStore.set(
			`project_issue_sets_v1:${projectB}`,
			[{ ...createIssueSetRecord(), projectId: projectB, issueTag: "IFC-02" }],
		);

		const results = await projectIssueSetService.fetchIssueSetsForProjects([
			projectA,
			projectB,
		]);

		expect(loadSettingsForProjectsMock).toHaveBeenCalledTimes(1);
		expect(loadSettingMock).not.toHaveBeenCalled();
		expect(results.get(projectA)?.data[0]?.issueTag).toBe("IFC-01");
		expect(results.get(projectB)?.data[0]?.issueTag).toBe("IFC-02");

		loadSettingsForProjectsMock.mockClear();
		const cached = await projectIssueSetService.fetchIssueSetsForProjects([
			projectA,
			projectB,
		]);
		expect(loadSettingsForProjectsMock).not.toHaveBeenCalled();
		expect(cached.get(projectA)?.data).toHaveLength(1);
		expect(cached.get(projectB)?.data).toHaveLength(1);
	});

	it("updates the issue set cache after save so an immediate reload stays in sync", async () => {
		const projectId = "project-issue-set-save";
		settingsStore.set(`project_issue_sets_v1:${projectId}`, []);

		const saved = await projectIssueSetService.saveIssueSet({
			projectId,
			name: "IFC package",
			issueTag: "IFC-01",
			status: "review",
			selectedDrawingPaths: ["Issued/DWG-001.dwg"],
			selectedRegisterRowIds: [],
			selectedDrawingNumbers: ["DWG-001"],
			selectedPdfFileIds: [],
			snapshot: {
				drawingCount: 1,
				selectedDrawingCount: 1,
				reviewItemCount: 0,
				titleBlockReviewCount: 0,
				standardsReviewCount: 0,
				unresolvedRevisionCount: 0,
				setupBlockerCount: 0,
				trackedDrawingCount: 0,
				acceptedTitleBlockCount: 0,
				waivedStandardsCount: 0,
			},
		});

		expect(saved.error).toBeNull();
		loadSettingMock.mockClear();

		const fetched = await projectIssueSetService.fetchIssueSets(projectId);
		expect(fetched.data).toHaveLength(1);
		expect(fetched.data[0]?.name).toBe("IFC package");
		expect(loadSettingMock).not.toHaveBeenCalled();
	});

	it("dedupes review-decision fetches and reuses the cached result", async () => {
		const projectId = "project-review-decisions";
		settingsStore.set(
			`project_review_decisions_v1:${projectId}`,
			[{ ...createReviewDecisionRecord(), projectId }],
		);

		await Promise.all([
			projectReviewDecisionService.fetchDecisions(projectId),
			projectReviewDecisionService.fetchDecisions(projectId),
		]);

		expect(loadSettingMock).toHaveBeenCalledTimes(1);

		const cached = await projectReviewDecisionService.fetchDecisions(projectId);
		expect(cached.data[0]?.itemId).toBe("title-block:row-1");
		expect(loadSettingMock).toHaveBeenCalledTimes(1);
	});

	it("dedupes transmittal receipt fetches and keeps saved receipts hot in cache", async () => {
		const projectId = "project-transmittal-receipts";
		settingsStore.set(
			`project_transmittal_receipts_v1:${projectId}`,
			[{ ...createTransmittalReceiptRecord(), projectId }],
		);

		await Promise.all([
			projectTransmittalReceiptService.fetchReceipts(projectId),
			projectTransmittalReceiptService.fetchReceipts(projectId),
		]);

		expect(loadSettingMock).toHaveBeenCalledTimes(1);

		const saved = await projectTransmittalReceiptService.saveReceipt({
			projectId,
			projectName: "MyProject",
			projectNumber: "25074",
			transmittalType: "standard",
			transmittalNumber: "XMTL-002",
			description: "Second issue package",
			date: "2026-04-03",
			outputFormat: "pdf",
			standardDocumentSource: "project_metadata",
			projectMetadataLoadedAt: "2026-04-03T00:00:00.000Z",
			outputs: [],
			documentCount: 2,
			reviewedDocumentCount: 2,
			pendingReviewCount: 0,
			cidDocumentCount: 0,
			contactCount: 1,
			fileSummary: {
				template: "template.docx",
				index: "index.xlsx",
				documents: "2 PDFs",
				report: "report.xlsx",
			},
			optionSummary: [],
			generatedMessage: "Generated successfully.",
		});

		expect(saved.error).toBeNull();
		loadSettingMock.mockClear();

		const cached = await projectTransmittalReceiptService.fetchReceipts(projectId);
		expect(cached.data[0]?.transmittalNumber).toBe("XMTL-002");
		expect(loadSettingMock).not.toHaveBeenCalled();
	});

	it("bulk-loads transmittal receipts for multiple projects in a single settings query", async () => {
		const projectA = "project-transmittal-bulk-a";
		const projectB = "project-transmittal-bulk-b";
		settingsStore.set(
			`project_transmittal_receipts_v1:${projectA}`,
			[
				{
					...createTransmittalReceiptRecord(),
					projectId: projectA,
					transmittalNumber: "XMTL-001",
				},
			],
		);
		settingsStore.set(
			`project_transmittal_receipts_v1:${projectB}`,
			[
				{
					...createTransmittalReceiptRecord(),
					projectId: projectB,
					transmittalNumber: "XMTL-002",
				},
			],
		);

		const results = await projectTransmittalReceiptService.fetchReceiptsForProjects(
			[projectA, projectB],
		);

		expect(loadSettingsForProjectsMock).toHaveBeenCalledTimes(1);
		expect(loadSettingMock).not.toHaveBeenCalled();
		expect(results.get(projectA)?.data[0]?.transmittalNumber).toBe("XMTL-001");
		expect(results.get(projectB)?.data[0]?.transmittalNumber).toBe("XMTL-002");

		loadSettingsForProjectsMock.mockClear();
		await projectTransmittalReceiptService.fetchReceiptsForProjects([
			projectA,
			projectB,
		]);
		expect(loadSettingsForProjectsMock).not.toHaveBeenCalled();
	});

	it("dedupes automation receipt fetches and keeps saved receipts hot in cache", async () => {
		const projectId = "project-automation-receipts";
		settingsStore.set(
			`project_automation_receipts_v1:${projectId}`,
			[{ ...createAutomationReceiptRecord(), projectId }],
		);

		await Promise.all([
			projectAutomationReceiptService.fetchReceipts(projectId),
			projectAutomationReceiptService.fetchReceipts(projectId),
		]);

		expect(loadSettingMock).toHaveBeenCalledTimes(1);

		const saved = await projectAutomationReceiptService.saveReceipt({
			projectId,
			issueSetId: "issue-set-1",
			registerSnapshotId: "register-2",
			mode: "combined",
			summary: "Second automation run recorded.",
			affectedDrawingCount: 2,
			titleBlockUpdateCount: 2,
			requestId: "request-2",
			markupSnapshotIds: ["markup-2"],
		});

		expect(saved.error).toBeNull();
		loadSettingMock.mockClear();

		const cached = await projectAutomationReceiptService.fetchReceipts(projectId);
		expect(cached.data[0]?.requestId).toBe("request-2");
		expect(loadSettingMock).not.toHaveBeenCalled();
	});

	it("dedupes deliverable register fetches and keeps refreshed snapshots hot in cache", async () => {
		const projectId = "project-deliverable-register";
		settingsStore.set(
			`project_deliverable_register_v1:${projectId}`,
			{ ...createDeliverableRegisterSnapshot(), projectId },
		);

		await Promise.all([
			projectDeliverableRegisterService.fetchSnapshot(projectId),
			projectDeliverableRegisterService.fetchSnapshot(projectId),
		]);

		expect(loadSettingMock).toHaveBeenCalledTimes(1);

		const refreshed = await projectDeliverableRegisterService.refreshSnapshot({
			projectId,
			projectFiles: [],
			metadataRows: [],
		});

		expect(refreshed.error).toBeNull();
		loadSettingMock.mockClear();

		const cached = await projectDeliverableRegisterService.fetchSnapshot(projectId);
		expect(cached.data?.projectId).toBe(projectId);
		expect(cached.data?.rowCount).toBe(1);
		expect(loadSettingMock).not.toHaveBeenCalled();
	});
});
