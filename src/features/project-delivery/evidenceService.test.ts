import { describe, expect, it } from "vitest";
import type { Project } from "@/features/project-core";
import type { ProjectWatchdogTelemetry } from "@/features/project-watchdog";
import type { DrawingAnnotation } from "@/features/standards-checker/standardsDrawingModels";
import type { ProjectStandardsLatestReview } from "@/features/standards-checker/standardsCheckerModels";
import type { ProjectAutomationReceiptRecord } from "@/services/projectAutomationReceiptService";
import type { ProjectDocumentMetadataRow } from "@/features/project-documents";
import type { ProjectIssueSetRecord } from "@/features/project-workflow/issueSetService";
import type { ProjectReviewDecisionRecord } from "@/services/projectReviewDecisionService";
import type { DrawingRevisionRegisterRow } from "@/services/projectRevisionRegisterService";
import type { ProjectTransmittalReceiptRecord } from "@/services/projectTransmittalReceiptService";
import type {
	TitleBlockSyncArtifacts,
	TitleBlockSyncProfile,
} from "@/features/project-setup/types";
import type { ProjectDeliverableRegisterSnapshot } from "./deliverableRegisterService";
import {
	buildProjectIssueSetEvidencePacket,
	renderProjectIssueSetEvidencePacketMarkdown,
} from "./evidenceService";

function createProject(): Project {
	return {
		id: "project-1",
		user_id: "user-1",
		name: "MyProject",
		description: "Issue package setup",
		status: "active",
		priority: "high",
		deadline: "2026-03-31",
		category: "Substation",
		created_at: "2026-03-20T00:00:00.000Z",
		updated_at: "2026-03-20T00:00:00.000Z",
		watchdog_root_path: "C:/Projects/MyProject",
	} as Project;
}

function createIssueSet(): ProjectIssueSetRecord {
	return {
		id: "issue-set-1",
		projectId: "project-1",
		name: "MyProject IFC package",
		issueTag: "IFC-01",
		status: "review",
		targetDate: "2026-03-31",
		transmittalNumber: "XMTL-001",
		transmittalDocumentName: "IFC package",
		registerSnapshotId: "register-1",
		terminalScheduleSnapshotId: null,
		summary: "Ready for final review.",
		notes: null,
		selectedDrawingPaths: ["Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg"],
		selectedRegisterRowIds: ["register-row-1"],
		selectedDrawingNumbers: ["PROJ-00001-E0-0001"],
		selectedPdfFileIds: ["file-1"],
		snapshot: {
			drawingCount: 2,
			selectedDrawingCount: 1,
			reviewItemCount: 2,
			titleBlockReviewCount: 1,
			standardsReviewCount: 1,
			unresolvedRevisionCount: 1,
			setupBlockerCount: 0,
			trackedDrawingCount: 1,
			acceptedTitleBlockCount: 0,
			waivedStandardsCount: 0,
		},
		createdAt: "2026-03-20T00:00:00.000Z",
		updatedAt: "2026-03-21T00:00:00.000Z",
		issuedAt: null,
	};
}

function createRegisterSnapshot(): ProjectDeliverableRegisterSnapshot {
	return {
		id: "register-1",
		projectId: "project-1",
		workbookFileName: "Master Deliverable List.xlsx",
		importedAt: "2026-03-20T00:00:00.000Z",
		dwgRootPath: "C:/Projects/MyProject",
		pdfSourceSummary: "Issued package",
		sheetNames: ["Overall"],
		rowCount: 1,
		rows: [
			{
				id: "register-row-1",
				snapshotId: "register-1",
				sheetName: "Overall",
				setName: "BESS",
				drawingNumber: "PROJ-00001-E0-0001",
				drawingKey: "R3P25074E00001",
				drawingDescription: "Drawing Index",
				currentRevision: "A",
				revisionHistory: [{ revision: "A", date: "2026-03-20", order: 0 }],
				notes: "READY FOR SUBMITTAL",
				status: "READY FOR SUBMITTAL",
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

function createScanRows(): ProjectDocumentMetadataRow[] {
	return [
		{
			id: "row-1",
			projectId: "project-1",
			fileName: "PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
			relativePath: "Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
			absolutePath:
				"C:/Projects/MyProject/Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
			fileType: "dwg",
			drawingNumber: "PROJ-00001-E0-0001",
			title: "Drawing Index",
			revision: "A",
			source: "title_block_sync",
			reviewState: "ready",
			confidence: 1,
			titleBlockFound: true,
			hasWdTbConflict: false,
			currentAttributes: {},
			acadeValues: {},
			suiteUpdates: {},
			revisionRows: [],
			issues: [],
			warnings: [],
			rawRow: {} as ProjectDocumentMetadataRow["rawRow"],
		},
		{
			id: "row-2",
			projectId: "project-1",
			fileName: "PROJ-00001-E0-0002 - ONE LINE.dwg",
			relativePath: "Issued/PROJ-00001-E0-0002 - ONE LINE.dwg",
			absolutePath:
				"C:/Projects/MyProject/Issued/PROJ-00001-E0-0002 - ONE LINE.dwg",
			fileType: "dwg",
			drawingNumber: "PROJ-00001-E0-0002",
			title: "One Line",
			revision: "A",
			source: "filename_fallback",
			reviewState: "fallback",
			confidence: 0.55,
			titleBlockFound: false,
			hasWdTbConflict: false,
			currentAttributes: {},
			acadeValues: {},
			suiteUpdates: {},
			revisionRows: [],
			issues: ["Filename fallback used."],
			warnings: [],
			rawRow: {} as ProjectDocumentMetadataRow["rawRow"],
		},
	];
}

function createRevisions(): DrawingRevisionRegisterRow[] {
	return [
		{
			id: "rev-1",
			project_id: "project-1",
			title: "Drawing Index revision",
			drawing_number: "PROJ-00001-E0-0001",
			revision: "A",
			issue_status: "open",
			issue_severity: "warning",
			issue_summary: "Pending revision review",
			created_at: "2026-03-20T00:00:00.000Z",
			updated_at: "2026-03-20T00:00:00.000Z",
			user_id: "user-1",
			sheet_number: null,
			description: null,
			notes: null,
			source: "manual",
		} as unknown as DrawingRevisionRegisterRow,
		{
			id: "rev-2",
			project_id: "project-1",
			title: "Other drawing revision",
			drawing_number: "PROJ-00001-E0-0002",
			revision: "A",
			issue_status: "open",
			issue_severity: "error",
			issue_summary: "Should not be included",
			created_at: "2026-03-20T00:00:00.000Z",
			updated_at: "2026-03-20T00:00:00.000Z",
			user_id: "user-1",
			sheet_number: null,
			description: null,
			notes: null,
			source: "manual",
		} as unknown as DrawingRevisionRegisterRow,
	];
}

function createStandardsChecks(): DrawingAnnotation[] {
	return [
		{
			id: "ann-1",
			drawing_name: "PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
			file_path: "/Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
			annotations: [
				{
					type: "layer",
					severity: "warning",
					message: "Layer naming issue",
					location: "Sheet 1",
				},
			],
			qa_status: "warning",
			checked_at: "2026-03-21T00:00:00.000Z",
			checked_by: "QA",
			rules_applied: ["Title Block", "Layer Standards"],
			issues_found: 1,
			created_at: "2026-03-21T00:00:00.000Z",
		},
		{
			id: "ann-2",
			drawing_name: "PROJ-00001-E0-0002 - ONE LINE.dwg",
			file_path: "/Issued/PROJ-00001-E0-0002 - ONE LINE.dwg",
			annotations: [],
			qa_status: "pass",
			checked_at: "2026-03-21T00:00:00.000Z",
			checked_by: "QA",
			rules_applied: ["Title Block"],
			issues_found: 0,
			created_at: "2026-03-21T00:00:00.000Z",
		},
	];
}

function createNativeStandardsReview(): ProjectStandardsLatestReview {
	return {
		id: "review-1",
		projectId: "project-1",
		userId: "user-1",
		requestId: "req-native-1",
		recordedAt: "2026-03-21T00:00:00.000Z",
		cadFamilyId: "jic",
		standardsCategory: "NEC",
		selectedStandardIds: ["nec-210", "nec-250"],
		results: [
			{
				standardId: "nec-210",
				status: "warning",
				message: "Project-level standards review found follow-up items.",
			},
		],
		warnings: ["No .dws standards files were found under the project root."],
		summary: {
			inspectedDrawingCount: 1,
			providerPath: "dotnet+inproc",
		},
		meta: {
			source: "dotnet",
		},
		overallStatus: "warning",
	};
}

function createReceipts(): ProjectTransmittalReceiptRecord[] {
	return [
		{
			id: "receipt-1",
			projectId: "project-1",
			projectName: "MyProject",
			projectNumber: "25074",
			transmittalType: "standard",
			transmittalNumber: "XMTL-001",
			description: "IFC package",
			date: "2026-03-31",
			outputFormat: "both",
			standardDocumentSource: "project_metadata",
			projectMetadataLoadedAt: "2026-03-21T00:00:00.000Z",
			outputs: [
				{
					label: "PDF",
					filename: "myproject-ifc.pdf",
					size: 1024,
					createdAt: "2026-03-21T00:00:00.000Z",
				},
			],
			documentCount: 1,
			reviewedDocumentCount: 1,
			pendingReviewCount: 0,
			cidDocumentCount: 0,
			contactCount: 2,
			fileSummary: {
				template: "template.docx",
				index: "index.xlsx",
				documents: "1 PDF",
				report: "report.xlsx",
			},
			optionSummary: [{ label: "Sent via", value: "Email" }],
			generatedMessage: "Generated",
			generatedAt: "2026-03-21T00:05:00.000Z",
		},
	];
}

function createAutomationReceipts(): ProjectAutomationReceiptRecord[] {
	return [
		{
			id: "automation-1",
			projectId: "project-1",
			issueSetId: "issue-set-1",
			registerSnapshotId: "register-1",
			mode: "combined",
			summary: "Applied markup cleanup and terminal plan preview.",
			preparedMarkupCount: 3,
			reviewItemCount: 2,
			routeCount: 1,
			affectedDrawingCount: 1,
			noteInsertCount: 0,
			revisionCloudUpsertCount: 1,
			deltaNoteUpsertCount: 1,
			issueTagUpsertCount: 0,
			titleBlockUpdateCount: 0,
			textReplacementCount: 1,
			textDeleteCount: 0,
			textSwapCount: 0,
			dimensionOverrideCount: 0,
			terminalStripUpdateCount: 2,
			managedRouteUpsertCount: 1,
			markupSnapshotIds: ["markup-snapshot-1"],
			terminalScheduleSnapshotId: "schedule-1",
			reportId: "report-1",
			cadUtilityChangedDrawingCount: 0,
			cadUtilityChangedItemCount: 0,
			requestId: "req-123",
			drawingName: "PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
			createdAt: "2026-03-21T00:10:00.000Z",
		},
	];
}

function createTelemetry(): ProjectWatchdogTelemetry {
	return {
		loading: false,
		error: null,
		overview: null,
		recentEvents: [],
		recentAutoCadEvents: [],
		sessions: [],
		liveSessions: [],
		autoCadCollectors: [],
		liveAutoCadCollectors: [],
		activeCadSessionCount: 0,
		onlineCollectorCount: 0,
		latestAutoCadEvent: null,
		latestSession: null,
		totalCommandsInWindow: 0,
		latestTrackerUpdatedAt: null,
		rule: null,
		ruleConfigured: true,
		ruleUpdatedAt: null,
		trackedDrawings: [
			{
				drawingPath:
					"C:/Projects/MyProject/Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
				drawingName: "PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
				lifetimeTrackedMs: 180_000,
				todayTrackedMs: 180_000,
				lastWorkedAt: "2026-03-21T00:00:00.000Z",
				daysWorkedCount: 1,
				liveTrackedMs: 0,
				liveStatus: null,
				dateGroups: [],
			},
			{
				drawingPath:
					"C:/Projects/MyProject/Issued/PROJ-00001-E0-0002 - ONE LINE.dwg",
				drawingName: "PROJ-00001-E0-0002 - ONE LINE.dwg",
				lifetimeTrackedMs: 60_000,
				todayTrackedMs: 60_000,
				lastWorkedAt: "2026-03-21T00:00:00.000Z",
				daysWorkedCount: 1,
				liveTrackedMs: 0,
				liveStatus: null,
				dateGroups: [],
			},
		],
	};
}

function createScanProfile(): TitleBlockSyncProfile {
	return {
		blockName: "R3P-24x36BORDER&TITLE",
		projectRootPath: "C:/Projects/MyProject",
		acadeProjectFilePath: "C:/Projects/MyProject/MyProject.wdp",
		acadeLine1: "MyProject Substation",
		acadeLine2: "Issued for design review",
		acadeLine4: "PROJ-00001",
		signerDrawnBy: "KD",
		signerCheckedBy: "QA",
		signerEngineer: "APS",
	};
}

function createArtifacts(): TitleBlockSyncArtifacts {
	return {
		wdpPath: "C:/Projects/MyProject/MyProject.wdp",
		wdtPath: "C:/Projects/MyProject/MyProject.wdt",
		wdlPath: "C:/Projects/MyProject/MyProject.wdl",
		wdpText: "",
		wdtText: "",
		wdlText: "",
		wdpState: "existing",
	};
}

function createDecisions(): ProjectReviewDecisionRecord[] {
	return [
		{
			id: "decision-1",
			projectId: "project-1",
			issueSetId: "issue-set-1",
			itemId: "title-block:row-1",
			itemType: "title-block",
			fingerprint: "title-block:row-1",
			status: "accepted",
			note: null,
			createdAt: "2026-03-21T00:00:00.000Z",
			updatedAt: "2026-03-21T00:00:00.000Z",
		},
		{
			id: "decision-2",
			projectId: "project-1",
			issueSetId: "issue-set-1",
			itemId: "standards:ann-1",
			itemType: "standards",
			fingerprint: "standards:ann-1",
			status: "waived",
			note: null,
			createdAt: "2026-03-21T00:00:00.000Z",
			updatedAt: "2026-03-21T00:00:00.000Z",
		},
	];
}

describe("projectDeliveryEvidenceService", () => {
	it("builds an evidence packet scoped to the selected drawings", () => {
		const packet = buildProjectIssueSetEvidencePacket({
			project: createProject(),
			issueSet: createIssueSet(),
			registerSnapshot: createRegisterSnapshot(),
			scanRows: createScanRows(),
			scanProfile: createScanProfile(),
			scanArtifacts: createArtifacts(),
			revisions: createRevisions(),
			telemetry: createTelemetry(),
			standardsChecks: createStandardsChecks(),
			nativeStandardsReview: createNativeStandardsReview(),
			decisions: createDecisions(),
			transmittalReceipts: createReceipts(),
			automationReceipts: createAutomationReceipts(),
		});

		expect(packet.selectedDrawings).toHaveLength(1);
		expect(packet.selectedDrawings[0]?.drawingNumber).toBe("PROJ-00001-E0-0001");
		expect(packet.revisions.openCount).toBe(1);
		expect(packet.revisions.entries[0]?.drawingNumber).toBe(
			"PROJ-00001-E0-0001",
		);
		expect(packet.standards.matchedDrawingCount).toBe(1);
		expect(packet.standards.warningCount).toBe(1);
		expect(packet.standards.nativeReview.hasReview).toBe(true);
		expect(packet.standards.nativeReview.overallStatus).toBe("warning");
		expect(packet.standards.nativeReview.inspectedDrawingCount).toBe(1);
		expect(packet.transmittal.linkedReceipt?.id).toBe("receipt-1");
		expect(packet.watchdog.matchedTrackedCount).toBe(1);
		expect(packet.reviewDecisions.acceptedTitleBlockCount).toBe(1);
		expect(packet.titleBlock.drawings[0]?.acceptedForPackage).toBe(true);
		expect(packet.reviewDecisions.waivedStandardsCount).toBe(1);
		expect(packet.deliverableRegister.includedRowCount).toBe(1);
		expect(packet.deliverableRegister.pairedPdfCount).toBe(1);
		expect(packet.deliverableRegister.rows[0]?.sheetName).toBe("Overall");
		expect(packet.reviewDecisions.items).toEqual([
			{
				itemType: "title-block",
				status: "accepted",
				label: "PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
			},
			{
				itemType: "standards",
				status: "waived",
				label: "PROJ-00001-E0-0001 - DRAWING INDEX.dwg",
			},
		]);
		expect(packet.acadeSetup.projectNumber).toBe("PROJ-00001");
		expect(packet.acadeSetup.wdpPath).toBe("C:/Projects/MyProject/MyProject.wdp");
		expect(packet.acadeSetup.wdpState).toBe("existing");
		expect(packet.automation.linkedReceiptCount).toBe(1);
		expect(packet.automation.latestReceipt?.mode).toBe("combined");
		expect(packet.automation.latestReceipt?.requestId).toBe("req-123");
	});

	it("renders a readable markdown evidence packet", () => {
		const packet = buildProjectIssueSetEvidencePacket({
			project: createProject(),
			issueSet: createIssueSet(),
			registerSnapshot: createRegisterSnapshot(),
			scanRows: createScanRows(),
			scanProfile: createScanProfile(),
			scanArtifacts: createArtifacts(),
			revisions: createRevisions(),
			telemetry: createTelemetry(),
			standardsChecks: createStandardsChecks(),
			nativeStandardsReview: createNativeStandardsReview(),
			decisions: createDecisions(),
			transmittalReceipts: createReceipts(),
			automationReceipts: createAutomationReceipts(),
		});

		const markdown = renderProjectIssueSetEvidencePacketMarkdown(packet);

		expect(markdown).toContain("# MyProject IFC package");
		expect(markdown).toContain("accepted for package");
		expect(markdown).toContain("## ACADE Setup");
		expect(markdown).toContain("Project number: PROJ-00001");
		expect(markdown).toContain("ACADE project file: C:/Projects/MyProject/MyProject.wdp");
		expect(markdown).toContain("## Deliverable Register");
		expect(markdown).toContain("Overall / BESS | PROJ-00001-E0-0001");
		expect(markdown).toContain("## Review Decisions");
		expect(markdown).toContain("Title block review | accepted");
		expect(markdown).toContain("## Standards Evidence");
		expect(markdown).toContain("Native project review: warning");
		expect(markdown).toContain("Project-level standards review found follow-up items.");
		expect(markdown).toContain("## Transmittal Evidence");
		expect(markdown).toContain("## Automation Evidence");
		expect(markdown).toContain("Applied markup cleanup and terminal plan preview.");
		expect(markdown).toContain("PROJ-00001-E0-0001 - DRAWING INDEX.dwg");
		expect(markdown).not.toContain("Other drawing revision");
	});
});

