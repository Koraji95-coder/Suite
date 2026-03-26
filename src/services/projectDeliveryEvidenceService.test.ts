import { describe, expect, it } from "vitest";
import type { Project } from "@/components/apps/projects/projectmanagertypes";
import type { ProjectWatchdogTelemetry } from "@/components/apps/projects/useProjectWatchdogTelemetry";
import type { DrawingAnnotation } from "@/components/apps/standards-checker/standardsDrawingModels";
import type { ProjectDocumentMetadataRow } from "@/services/projectDocumentMetadataService";
import type { ProjectIssueSetRecord } from "@/services/projectIssueSetService";
import type { ProjectReviewDecisionRecord } from "@/services/projectReviewDecisionService";
import type { DrawingRevisionRegisterRow } from "@/services/projectRevisionRegisterService";
import type { ProjectTransmittalReceiptRecord } from "@/services/projectTransmittalReceiptService";
import {
	buildProjectIssueSetEvidencePacket,
	renderProjectIssueSetEvidencePacketMarkdown,
} from "./projectDeliveryEvidenceService";

function createProject(): Project {
	return {
		id: "project-1",
		user_id: "user-1",
		name: "Nanulak",
		description: "Issue package setup",
		status: "active",
		priority: "high",
		deadline: "2026-03-31",
		category: "Substation",
		created_at: "2026-03-20T00:00:00.000Z",
		updated_at: "2026-03-20T00:00:00.000Z",
		watchdog_root_path: "C:/Projects/Nanulak",
	} as Project;
}

function createIssueSet(): ProjectIssueSetRecord {
	return {
		id: "issue-set-1",
		projectId: "project-1",
		name: "Nanulak IFC package",
		issueTag: "IFC-01",
		status: "review",
		targetDate: "2026-03-31",
		transmittalNumber: "XMTL-001",
		transmittalDocumentName: "IFC package",
		summary: "Ready for final review.",
		notes: null,
		selectedDrawingPaths: ["Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg"],
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

function createScanRows(): ProjectDocumentMetadataRow[] {
	return [
		{
			id: "row-1",
			projectId: "project-1",
			fileName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
			relativePath: "Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
			absolutePath:
				"C:/Projects/Nanulak/Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
			fileType: "dwg",
			drawingNumber: "R3P-25074-E0-0001",
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
			fileName: "R3P-25074-E0-0002 - ONE LINE.dwg",
			relativePath: "Issued/R3P-25074-E0-0002 - ONE LINE.dwg",
			absolutePath:
				"C:/Projects/Nanulak/Issued/R3P-25074-E0-0002 - ONE LINE.dwg",
			fileType: "dwg",
			drawingNumber: "R3P-25074-E0-0002",
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
			drawing_number: "R3P-25074-E0-0001",
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
			drawing_number: "R3P-25074-E0-0002",
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
			drawing_name: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
			file_path: "/Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
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
			drawing_name: "R3P-25074-E0-0002 - ONE LINE.dwg",
			file_path: "/Issued/R3P-25074-E0-0002 - ONE LINE.dwg",
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

function createReceipts(): ProjectTransmittalReceiptRecord[] {
	return [
		{
			id: "receipt-1",
			projectId: "project-1",
			projectName: "Nanulak",
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
					filename: "nanulak-ifc.pdf",
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
					"C:/Projects/Nanulak/Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg",
				drawingName: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
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
					"C:/Projects/Nanulak/Issued/R3P-25074-E0-0002 - ONE LINE.dwg",
				drawingName: "R3P-25074-E0-0002 - ONE LINE.dwg",
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
			scanRows: createScanRows(),
			revisions: createRevisions(),
			telemetry: createTelemetry(),
			standardsChecks: createStandardsChecks(),
			decisions: createDecisions(),
			transmittalReceipts: createReceipts(),
		});

		expect(packet.selectedDrawings).toHaveLength(1);
		expect(packet.selectedDrawings[0]?.drawingNumber).toBe("R3P-25074-E0-0001");
		expect(packet.revisions.openCount).toBe(1);
		expect(packet.revisions.entries[0]?.drawingNumber).toBe(
			"R3P-25074-E0-0001",
		);
		expect(packet.standards.matchedDrawingCount).toBe(1);
		expect(packet.standards.warningCount).toBe(1);
		expect(packet.transmittal.linkedReceipt?.id).toBe("receipt-1");
		expect(packet.watchdog.matchedTrackedCount).toBe(1);
		expect(packet.reviewDecisions.acceptedTitleBlockCount).toBe(1);
		expect(packet.titleBlock.drawings[0]?.acceptedForPackage).toBe(true);
		expect(packet.reviewDecisions.waivedStandardsCount).toBe(1);
		expect(packet.reviewDecisions.items).toEqual([
			{
				itemType: "title-block",
				status: "accepted",
				label: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
			},
			{
				itemType: "standards",
				status: "waived",
				label: "R3P-25074-E0-0001 - DRAWING INDEX.dwg",
			},
		]);
	});

	it("renders a readable markdown evidence packet", () => {
		const packet = buildProjectIssueSetEvidencePacket({
			project: createProject(),
			issueSet: createIssueSet(),
			scanRows: createScanRows(),
			revisions: createRevisions(),
			telemetry: createTelemetry(),
			standardsChecks: createStandardsChecks(),
			decisions: createDecisions(),
			transmittalReceipts: createReceipts(),
		});

		const markdown = renderProjectIssueSetEvidencePacketMarkdown(packet);

		expect(markdown).toContain("# Nanulak IFC package");
		expect(markdown).toContain("accepted for package");
		expect(markdown).toContain("## Review Decisions");
		expect(markdown).toContain("Title block review | accepted");
		expect(markdown).toContain("## Standards Evidence");
		expect(markdown).toContain("## Transmittal Evidence");
		expect(markdown).toContain("R3P-25074-E0-0001 - DRAWING INDEX.dwg");
		expect(markdown).not.toContain("Other drawing revision");
	});
});
