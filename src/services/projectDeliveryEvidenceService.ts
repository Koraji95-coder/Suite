import type { Project } from "@/components/apps/projects/projectmanagertypes";
import type { ProjectWatchdogTelemetry } from "@/components/apps/projects/useProjectWatchdogTelemetry";
import type { DrawingAnnotation } from "@/components/apps/standards-checker/standardsDrawingModels";
import type { StandardDocumentSourceMode } from "@/components/apps/transmittal-builder/transmittalBuilderModels";
import { logger } from "@/lib/logger";
import type { ProjectDeliverableRegisterSnapshot } from "@/services/projectDeliverableRegisterService";
import type { ProjectAutomationReceiptRecord } from "@/services/projectAutomationReceiptService";
import type { ProjectDocumentMetadataRow } from "@/services/projectDocumentMetadataService";
import type { ProjectIssueSetRecord } from "@/services/projectIssueSetService";
import type { ProjectReviewDecisionRecord } from "@/services/projectReviewDecisionService";
import type { DrawingRevisionRegisterRow } from "@/services/projectRevisionRegisterService";
import type { ProjectTransmittalReceiptRecord } from "@/services/projectTransmittalReceiptService";
import type {
	TitleBlockSyncArtifacts,
	TitleBlockSyncProfile,
} from "@/services/titleBlockSyncService";
import { supabase } from "@/supabase/client";

export interface ProjectIssueSetEvidencePacket {
	projectId: string;
	projectName: string;
	issueSetId: string;
	issueSetName: string;
	issueTag: string;
	status: string;
	targetDate: string | null;
	generatedAt: string;
	summary: string;
	selectedDrawings: Array<{
		fileName: string;
		relativePath: string;
		drawingNumber: string;
		title: string;
		revision: string;
		reviewState: string;
		issues: string[];
		warnings: string[];
	}>;
	titleBlock: {
		readyCount: number;
		needsReviewCount: number;
		fallbackCount: number;
		drawings: Array<{
			fileName: string;
			drawingNumber: string;
			reviewState: string;
			acceptedForPackage: boolean;
			issues: string[];
			warnings: string[];
		}>;
	};
	deliverableRegister: {
		snapshotId: string | null;
		includedRowCount: number;
		pairedPdfCount: number;
		rows: Array<{
			sheetName: string;
			setName: string | null;
			drawingNumber: string;
			drawingDescription: string;
			currentRevision: string;
			readinessState: string;
			pdfPairingStatus: string;
			titleBlockVerificationState: string;
			acadeVerificationState: string;
		}>;
	};
	acadeSetup: {
		blockName: string;
		clientOrUtility: string;
		facilityOrSite: string;
		projectNumber: string;
		acadeProjectFilePath: string | null;
		wdpPath: string | null;
		wdtPath: string | null;
		wdlPath: string | null;
		wdpState: "existing" | "starter" | null;
	};
	reviewDecisions: {
		acceptedTitleBlockCount: number;
		waivedStandardsCount: number;
		items: Array<{
			itemType: "title-block" | "standards";
			status: "accepted" | "waived";
			label: string;
		}>;
	};
	revisions: {
		openCount: number;
		entries: Array<{
			title: string;
			drawingNumber: string;
			revision: string;
			issueStatus: string;
			issueSeverity: string;
			issueSummary: string;
		}>;
	};
	standards: {
		matchedDrawingCount: number;
		passCount: number;
		warningCount: number;
		failCount: number;
		pendingCount: number;
		checks: Array<{
			drawingName: string;
			qaStatus: string;
			reviewedAt: string | null;
			issuesFound: number;
			rulesApplied: string[];
			issues: Array<{
				severity: string;
				message: string;
				location?: string;
			}>;
		}>;
	};
	transmittal: {
		linkedReceipt: ProjectTransmittalReceiptRecord | null;
		number: string | null;
		documentName: string | null;
		source: StandardDocumentSourceMode | null;
	};
	automation: {
		linkedReceiptCount: number;
		latestReceipt: {
			id: string;
			mode: ProjectAutomationReceiptRecord["mode"];
			summary: string;
			preparedMarkupCount: number;
			reviewItemCount: number;
			routeCount: number;
			affectedDrawingCount: number;
			terminalStripUpdateCount: number;
			managedRouteUpsertCount: number;
			terminalScheduleSnapshotId: string | null;
			reportId: string | null;
			cadUtilityChangedDrawingCount: number;
			cadUtilityChangedItemCount: number;
			requestId: string | null;
			drawingName: string | null;
			createdAt: string;
		} | null;
		receipts: Array<{
			id: string;
			mode: ProjectAutomationReceiptRecord["mode"];
			summary: string;
			preparedMarkupCount: number;
			reviewItemCount: number;
			routeCount: number;
			affectedDrawingCount: number;
			terminalStripUpdateCount: number;
			managedRouteUpsertCount: number;
			terminalScheduleSnapshotId: string | null;
			reportId: string | null;
			cadUtilityChangedDrawingCount: number;
			cadUtilityChangedItemCount: number;
			requestId: string | null;
			drawingName: string | null;
			createdAt: string;
		}>;
	};
	watchdog: {
		matchedTrackedCount: number;
		drawings: Array<{
			drawingName: string;
			lifetimeTrackedMs: number;
			lastWorkedAt: string | null;
		}>;
	};
}

function buildAcadeSetupSnapshot(
	profile: TitleBlockSyncProfile | null | undefined,
	artifacts: TitleBlockSyncArtifacts | null | undefined,
) {
	return {
		blockName: normalizeText(profile?.blockName) || "Not set",
		clientOrUtility: normalizeText(profile?.acadeLine1) || "Not set",
		facilityOrSite: normalizeText(profile?.acadeLine2) || "Not set",
		projectNumber: normalizeText(profile?.acadeLine4) || "Not set",
		acadeProjectFilePath: normalizeText(profile?.acadeProjectFilePath) || null,
		wdpPath: normalizeText(artifacts?.wdpPath) || null,
		wdtPath: normalizeText(artifacts?.wdtPath) || null,
		wdlPath: normalizeText(artifacts?.wdlPath) || null,
		wdpState: artifacts?.wdpState ?? null,
	};
}

function normalizeText(value: unknown) {
	return String(value ?? "").trim();
}

function normalizeDrawingKey(value: unknown) {
	return normalizeText(value)
		.replace(/^.*[\\/]/, "")
		.replace(/\.[^/.]+$/, "")
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "");
}

function formatDuration(ms: number) {
	const totalMinutes = Math.max(0, Math.round(ms / 60_000));
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

function formatTimestamp(value: string | null) {
	if (!value) {
		return "—";
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return parsed.toLocaleString([], {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function findMatchedTransmittalReceipt(
	issueSet: ProjectIssueSetRecord,
	receipts: ProjectTransmittalReceiptRecord[],
) {
	const normalizedTransmittalNumber = normalizeText(
		issueSet.transmittalNumber,
	).toUpperCase();
	const normalizedDocumentName = normalizeText(
		issueSet.transmittalDocumentName,
	).toUpperCase();

	return (
		receipts.find((receipt) => {
			if (
				normalizedTransmittalNumber &&
				normalizeText(receipt.transmittalNumber).toUpperCase() ===
					normalizedTransmittalNumber
			) {
				return true;
			}
			if (
				normalizedDocumentName &&
				normalizeText(receipt.description).toUpperCase() ===
					normalizedDocumentName
			) {
				return true;
			}
			return false;
		}) ?? null
	);
}

function findLinkedAutomationReceipts(
	issueSet: ProjectIssueSetRecord,
	receipts: ProjectAutomationReceiptRecord[],
) {
	const normalizedIssueSetId = normalizeText(issueSet.id);
	const normalizedSnapshotId = normalizeText(issueSet.registerSnapshotId);

	return receipts.filter((receipt) => {
		if (
			normalizedIssueSetId &&
			normalizeText(receipt.issueSetId) === normalizedIssueSetId
		) {
			return true;
		}
		if (
			!normalizeText(receipt.issueSetId) &&
			normalizedSnapshotId &&
			normalizeText(receipt.registerSnapshotId) === normalizedSnapshotId
		) {
			return true;
		}
		return false;
	});
}

export async function fetchProjectStandardsEvidence(
	projectId: string,
	selectedDrawingPaths: string[],
): Promise<{ data: DrawingAnnotation[]; error: Error | null }> {
	const normalizedProjectId = normalizeText(projectId);
	if (!normalizedProjectId || selectedDrawingPaths.length === 0) {
		return { data: [], error: null };
	}

	const drawingKeys = new Set(
		selectedDrawingPaths.map((path) => normalizeDrawingKey(path)),
	);

	try {
		const { data, error } = await supabase
			.from("drawing_annotations")
			.select("*")
			.or(`project_id.eq.${normalizedProjectId},project_id.is.null`)
			.order("reviewed_at", { ascending: false });

		if (error) {
			throw error;
		}

		const matched = (
			(data ?? []) as Array<{
				id: string;
				drawing_name: string;
				file_path: string;
				annotation_data: unknown;
				status: "approved" | "rejected" | "reviewed" | "pending";
				reviewed_at: string | null;
				qa_checks: unknown;
				issues_found: unknown;
				created_at: string;
			}>
		)
			.map((row) => {
				const annotations = Array.isArray(row.annotation_data)
					? (row.annotation_data as DrawingAnnotation["annotations"])
					: [];
				const rulesApplied = Array.isArray(row.qa_checks)
					? (row.qa_checks as string[])
					: [];
				const issuesFound =
					typeof row.issues_found === "number"
						? row.issues_found
						: annotations.length;
				const qaStatus: DrawingAnnotation["qa_status"] =
					row.status === "approved"
						? "pass"
						: row.status === "rejected"
							? "fail"
							: row.status === "reviewed"
								? "warning"
								: "pending";

				return {
					id: row.id,
					drawing_name: row.drawing_name,
					file_path: row.file_path,
					annotations,
					qa_status: qaStatus,
					checked_at: row.reviewed_at,
					checked_by: null,
					rules_applied: rulesApplied,
					issues_found: issuesFound,
					created_at: row.created_at,
				} satisfies DrawingAnnotation;
			})
			.filter((row) => {
				const drawingNameKey = normalizeDrawingKey(row.drawing_name);
				const filePathKey = normalizeDrawingKey(row.file_path);
				return drawingKeys.has(drawingNameKey) || drawingKeys.has(filePathKey);
			});

		const latestByKey = new Map<string, DrawingAnnotation>();
		for (const row of matched) {
			const keys = [
				normalizeDrawingKey(row.drawing_name),
				normalizeDrawingKey(row.file_path),
			].filter(Boolean);
			for (const key of keys) {
				if (!drawingKeys.has(key) || latestByKey.has(key)) {
					continue;
				}
				latestByKey.set(key, row);
			}
		}

		return {
			data: selectedDrawingPaths
				.map((path) => latestByKey.get(normalizeDrawingKey(path)) ?? null)
				.filter((entry): entry is DrawingAnnotation => entry !== null),
			error: null,
		};
	} catch (error) {
		logger.warn(
			"Unable to load project standards evidence.",
			"ProjectDeliveryEvidenceService",
			error,
		);
		return {
			data: [],
			error:
				error instanceof Error
					? error
					: new Error("Unable to load standards evidence."),
		};
	}
}

export function buildProjectIssueSetEvidencePacket(args: {
	project: Project;
	issueSet: ProjectIssueSetRecord;
	registerSnapshot: ProjectDeliverableRegisterSnapshot | null;
	scanRows: ProjectDocumentMetadataRow[];
	scanProfile?: TitleBlockSyncProfile | null;
	scanArtifacts?: TitleBlockSyncArtifacts | null;
	revisions: DrawingRevisionRegisterRow[];
	telemetry: ProjectWatchdogTelemetry;
	standardsChecks: DrawingAnnotation[];
	decisions: ProjectReviewDecisionRecord[];
	transmittalReceipts: ProjectTransmittalReceiptRecord[];
	automationReceipts: ProjectAutomationReceiptRecord[];
}): ProjectIssueSetEvidencePacket {
	const selectedRegisterRowIds = args.issueSet.selectedRegisterRowIds ?? [];
	const selectedRegisterRows =
		args.registerSnapshot?.rows.filter((row) =>
			selectedRegisterRowIds.includes(row.id),
		) ?? [];
	const selectedRows = args.scanRows.filter((row) =>
		args.issueSet.selectedDrawingPaths.includes(row.relativePath),
	);
	const selectedDrawingNumbers = new Set(
		[
			...selectedRows.map((row) =>
				normalizeText(row.drawingNumber).toUpperCase(),
			),
			...selectedRegisterRows.map((row) =>
				normalizeText(row.drawingNumber).toUpperCase(),
			),
		].filter(Boolean),
	);
	const selectedDrawingKeys = new Set(
		[
			...args.issueSet.selectedDrawingPaths.map((path) =>
				normalizeDrawingKey(path),
			),
			...selectedRegisterRows.map((row) => row.drawingKey),
		].filter(Boolean),
	);
	const revisionEntries = args.revisions
		.filter((entry) => {
			const drawingNumber = normalizeText(entry.drawing_number).toUpperCase();
			return (
				selectedDrawingNumbers.size === 0 ||
				selectedDrawingNumbers.has(drawingNumber)
			);
		})
		.filter((entry) => entry.issue_status !== "resolved");

	const standardsChecks = args.standardsChecks.filter((row) => {
		const drawingNameKey = normalizeDrawingKey(row.drawing_name);
		const filePathKey = normalizeDrawingKey(row.file_path);
		return (
			selectedDrawingKeys.has(drawingNameKey) ||
			selectedDrawingKeys.has(filePathKey)
		);
	});

	const watchdogDrawings = args.telemetry.trackedDrawings.filter((drawing) => {
		const pathKey = normalizeDrawingKey(drawing.drawingPath);
		const nameKey = normalizeDrawingKey(drawing.drawingName);
		return selectedDrawingKeys.has(pathKey) || selectedDrawingKeys.has(nameKey);
	});

	const linkedReceipt = findMatchedTransmittalReceipt(
		args.issueSet,
		args.transmittalReceipts,
	);
	const linkedAutomationReceipts = findLinkedAutomationReceipts(
		args.issueSet,
		args.automationReceipts,
	);
	const latestAutomationReceipt = linkedAutomationReceipts[0] ?? null;
	const scopedDecisions = args.decisions.filter(
		(decision) => (decision.issueSetId || null) === args.issueSet.id,
	);
	const acceptedTitleBlockIds = new Set(
		scopedDecisions
			.filter(
				(decision) =>
					decision.itemType === "title-block" && decision.status === "accepted",
			)
			.map((decision) => decision.itemId),
	);
	const waivedStandardsIds = new Set(
		scopedDecisions
			.filter(
				(decision) =>
					decision.itemType === "standards" && decision.status === "waived",
			)
			.map((decision) => decision.itemId),
	);
	const titleBlockRows = selectedRows.map((row) => ({
		fileName: row.fileName,
		drawingNumber: row.drawingNumber,
		reviewState: row.reviewState,
		acceptedForPackage: acceptedTitleBlockIds.has(`title-block:${row.id}`),
		issues: [...row.issues],
		warnings: [...row.warnings],
	}));
	const reviewDecisionItems = [
		...titleBlockRows
			.filter((row) => row.acceptedForPackage)
			.map((row) => ({
				itemType: "title-block" as const,
				status: "accepted" as const,
				label:
					row.drawingNumber && row.fileName.includes(row.drawingNumber)
						? row.fileName
						: `${row.drawingNumber || row.fileName} accepted for package`,
			})),
		...standardsChecks
			.filter((row) => waivedStandardsIds.has(`standards:${row.id}`))
			.map((row) => ({
				itemType: "standards" as const,
				status: "waived" as const,
				label: row.drawing_name,
			})),
	];
	const acceptedTitleBlockCount = titleBlockRows.filter(
		(row) => row.acceptedForPackage,
	).length;
	const waivedStandardsCount = standardsChecks.filter((row) =>
		waivedStandardsIds.has(`standards:${row.id}`),
	).length;

	return {
		projectId: args.project.id,
		projectName: args.project.name,
		issueSetId: args.issueSet.id,
		issueSetName: args.issueSet.name,
		issueTag: args.issueSet.issueTag,
		status: args.issueSet.status,
		targetDate: args.issueSet.targetDate,
		generatedAt: new Date().toISOString(),
		summary: args.issueSet.summary,
		selectedDrawings: selectedRows.map((row) => ({
			fileName: row.fileName,
			relativePath: row.relativePath,
			drawingNumber: row.drawingNumber,
			title: row.title,
			revision: row.revision,
			reviewState: row.reviewState,
			issues: [...row.issues],
			warnings: [...row.warnings],
		})),
		titleBlock: {
			readyCount: selectedRows.filter((row) => row.reviewState === "ready")
				.length,
			needsReviewCount: selectedRows.filter(
				(row) => row.reviewState === "needs-review",
			).length,
			fallbackCount: selectedRows.filter(
				(row) => row.reviewState === "fallback",
			).length,
			drawings: titleBlockRows,
		},
		deliverableRegister: {
			snapshotId: args.registerSnapshot?.id ?? null,
			includedRowCount: selectedRegisterRows.length,
			pairedPdfCount: selectedRegisterRows.filter(
				(row) =>
					row.pdfPairingStatus === "paired" ||
					row.pdfPairingStatus === "manual",
			).length,
			rows: selectedRegisterRows.map((row) => ({
				sheetName: row.sheetName,
				setName: row.setName,
				drawingNumber: row.drawingNumber,
				drawingDescription: row.drawingDescription,
				currentRevision: row.currentRevision,
				readinessState: row.readinessState,
				pdfPairingStatus: row.pdfPairingStatus,
				titleBlockVerificationState: row.titleBlockVerificationState,
				acadeVerificationState: row.acadeVerificationState,
			})),
		},
		acadeSetup: buildAcadeSetupSnapshot(
			args.scanProfile ?? null,
			args.scanArtifacts ?? null,
		),
		reviewDecisions: {
			acceptedTitleBlockCount,
			waivedStandardsCount,
			items: reviewDecisionItems,
		},
		revisions: {
			openCount: revisionEntries.length,
			entries: revisionEntries.map((entry) => ({
				title: entry.title,
				drawingNumber: entry.drawing_number,
				revision: entry.revision,
				issueStatus: entry.issue_status,
				issueSeverity: entry.issue_severity,
				issueSummary: entry.issue_summary,
			})),
		},
		standards: {
			matchedDrawingCount: standardsChecks.length,
			passCount: standardsChecks.filter((row) => row.qa_status === "pass")
				.length,
			warningCount: standardsChecks.filter((row) => row.qa_status === "warning")
				.length,
			failCount: standardsChecks.filter((row) => row.qa_status === "fail")
				.length,
			pendingCount: standardsChecks.filter((row) => row.qa_status === "pending")
				.length,
			checks: standardsChecks.map((row) => ({
				drawingName: row.drawing_name,
				qaStatus: row.qa_status,
				reviewedAt: row.checked_at,
				issuesFound:
					typeof row.issues_found === "number" ? row.issues_found : 0,
				rulesApplied: [...row.rules_applied],
				issues: row.annotations.map((issue) => ({
					severity: issue.severity,
					message: issue.message,
					location: issue.location,
				})),
			})),
		},
		transmittal: {
			linkedReceipt,
			number: args.issueSet.transmittalNumber,
			documentName: args.issueSet.transmittalDocumentName,
			source: linkedReceipt?.standardDocumentSource ?? null,
		},
		automation: {
			linkedReceiptCount: linkedAutomationReceipts.length,
			latestReceipt: latestAutomationReceipt
				? {
						id: latestAutomationReceipt.id,
						mode: latestAutomationReceipt.mode,
						summary: latestAutomationReceipt.summary,
						preparedMarkupCount: latestAutomationReceipt.preparedMarkupCount,
						reviewItemCount: latestAutomationReceipt.reviewItemCount,
						routeCount: latestAutomationReceipt.routeCount,
						affectedDrawingCount: latestAutomationReceipt.affectedDrawingCount,
						terminalStripUpdateCount:
							latestAutomationReceipt.terminalStripUpdateCount,
						managedRouteUpsertCount:
							latestAutomationReceipt.managedRouteUpsertCount,
						terminalScheduleSnapshotId:
							latestAutomationReceipt.terminalScheduleSnapshotId,
						reportId: latestAutomationReceipt.reportId,
						cadUtilityChangedDrawingCount:
							latestAutomationReceipt.cadUtilityChangedDrawingCount,
						cadUtilityChangedItemCount:
							latestAutomationReceipt.cadUtilityChangedItemCount,
						requestId: latestAutomationReceipt.requestId,
						drawingName: latestAutomationReceipt.drawingName,
						createdAt: latestAutomationReceipt.createdAt,
					}
				: null,
			receipts: linkedAutomationReceipts.map((receipt) => ({
				id: receipt.id,
				mode: receipt.mode,
				summary: receipt.summary,
				preparedMarkupCount: receipt.preparedMarkupCount,
				reviewItemCount: receipt.reviewItemCount,
				routeCount: receipt.routeCount,
				affectedDrawingCount: receipt.affectedDrawingCount,
				terminalStripUpdateCount: receipt.terminalStripUpdateCount,
				managedRouteUpsertCount: receipt.managedRouteUpsertCount,
				terminalScheduleSnapshotId: receipt.terminalScheduleSnapshotId,
				reportId: receipt.reportId,
				cadUtilityChangedDrawingCount: receipt.cadUtilityChangedDrawingCount,
				cadUtilityChangedItemCount: receipt.cadUtilityChangedItemCount,
				requestId: receipt.requestId,
				drawingName: receipt.drawingName,
				createdAt: receipt.createdAt,
			})),
		},
		watchdog: {
			matchedTrackedCount: watchdogDrawings.length,
			drawings: watchdogDrawings.map((drawing) => ({
				drawingName: drawing.drawingName,
				lifetimeTrackedMs: drawing.lifetimeTrackedMs,
				lastWorkedAt: drawing.lastWorkedAt,
			})),
		},
	};
}

export function renderProjectIssueSetEvidencePacketMarkdown(
	packet: ProjectIssueSetEvidencePacket,
) {
	const lines: string[] = [];

	lines.push(`# ${packet.issueSetName}`);
	lines.push("");
	lines.push(`Project: ${packet.projectName}`);
	lines.push(`Issue tag: ${packet.issueTag}`);
	lines.push(`Status: ${packet.status}`);
	lines.push(`Target date: ${packet.targetDate || "Not set"}`);
	lines.push(`Generated: ${formatTimestamp(packet.generatedAt)}`);
	lines.push("");

	if (packet.summary) {
		lines.push("## Summary");
		lines.push(packet.summary);
		lines.push("");
	}

	lines.push("## Selected Drawings");
	if (packet.selectedDrawings.length === 0) {
		lines.push("- No drawings selected.");
	} else {
		for (const drawing of packet.selectedDrawings) {
			lines.push(
				`- ${drawing.fileName} | ${drawing.drawingNumber || "No drawing number"} | ${drawing.revision || "No revision"} | ${drawing.reviewState}`,
			);
			for (const issue of drawing.issues) {
				lines.push(`  - Issue: ${issue}`);
			}
			for (const warning of drawing.warnings) {
				lines.push(`  - Warning: ${warning}`);
			}
		}
	}
	lines.push("");

	lines.push("## Title Block Review");
	lines.push(`- Ready: ${packet.titleBlock.readyCount}`);
	lines.push(`- Needs review: ${packet.titleBlock.needsReviewCount}`);
	lines.push(`- Fallback metadata: ${packet.titleBlock.fallbackCount}`);
	for (const drawing of packet.titleBlock.drawings) {
		const detailParts = [`${drawing.reviewState}`];
		if (drawing.acceptedForPackage) {
			detailParts.push("accepted for package");
		}
		lines.push(
			`- ${drawing.fileName} | ${drawing.drawingNumber || "No drawing number"} | ${detailParts.join(" • ")}`,
		);
		for (const issue of drawing.issues) {
			lines.push(`  - Issue: ${issue}`);
		}
		for (const warning of drawing.warnings) {
			lines.push(`  - Warning: ${warning}`);
		}
	}
	lines.push("");

	lines.push("## Deliverable Register");
	lines.push(
		`- Snapshot: ${packet.deliverableRegister.snapshotId || "Not linked"}`,
	);
	lines.push(`- Included rows: ${packet.deliverableRegister.includedRowCount}`);
	lines.push(`- Paired PDFs: ${packet.deliverableRegister.pairedPdfCount}`);
	if (packet.deliverableRegister.rows.length === 0) {
		lines.push("- No register rows linked.");
	} else {
		for (const row of packet.deliverableRegister.rows) {
			lines.push(
				`- ${row.sheetName}${row.setName ? ` / ${row.setName}` : ""} | ${row.drawingNumber} | ${row.currentRevision || "No revision"} | ${row.readinessState} | PDF ${row.pdfPairingStatus} | Title block ${row.titleBlockVerificationState} | ACADE ${row.acadeVerificationState}`,
			);
			if (row.drawingDescription) {
				lines.push(`  - ${row.drawingDescription}`);
			}
		}
	}
	lines.push("");

	lines.push("## ACADE Setup");
	lines.push(`- Block name: ${packet.acadeSetup.blockName}`);
	lines.push(`- Client / Utility: ${packet.acadeSetup.clientOrUtility}`);
	lines.push(`- Facility / Site: ${packet.acadeSetup.facilityOrSite}`);
	lines.push(`- Project number: ${packet.acadeSetup.projectNumber}`);
	lines.push(
		`- ACADE project file: ${packet.acadeSetup.wdpPath || packet.acadeSetup.acadeProjectFilePath || "Starter .wdp path will be derived from the project root."}`,
	);
	if (packet.acadeSetup.wdpState) {
		lines.push(
			`- Project file state: ${
				packet.acadeSetup.wdpState === "existing"
					? "Existing ACADE project definition detected"
					: "Starter ACADE project scaffold"
			}`,
		);
	}
	lines.push(
		`- Support artifacts: ${packet.acadeSetup.wdtPath || "No .wdt path yet"} | ${packet.acadeSetup.wdlPath || "No .wdl path yet"}`,
	);
	lines.push(
		"- Drawing titles remain drawing-specific and are verified from workbook rows and title block scan results.",
	);
	lines.push("");

	lines.push("## Review Decisions");
	lines.push(
		`- Accepted title blocks: ${packet.reviewDecisions.acceptedTitleBlockCount}`,
	);
	lines.push(
		`- Waived standards items: ${packet.reviewDecisions.waivedStandardsCount}`,
	);
	if (packet.reviewDecisions.items.length === 0) {
		lines.push("- No package decisions recorded yet.");
	} else {
		for (const decision of packet.reviewDecisions.items) {
			lines.push(
				`- ${decision.itemType === "title-block" ? "Title block review" : "Standards"} | ${decision.status} | ${decision.label}`,
			);
		}
	}
	lines.push("");

	lines.push("## Standards Evidence");
	lines.push(`- Checked drawings: ${packet.standards.matchedDrawingCount}`);
	lines.push(`- Pass: ${packet.standards.passCount}`);
	lines.push(`- Warning: ${packet.standards.warningCount}`);
	lines.push(`- Fail: ${packet.standards.failCount}`);
	lines.push(`- Pending: ${packet.standards.pendingCount}`);
	for (const check of packet.standards.checks) {
		lines.push(
			`- ${check.drawingName} | ${check.qaStatus} | ${formatTimestamp(check.reviewedAt)} | ${check.issuesFound} issue(s)`,
		);
		for (const issue of check.issues) {
			lines.push(
				`  - ${issue.severity.toUpperCase()}: ${issue.message}${issue.location ? ` (${issue.location})` : ""}`,
			);
		}
	}
	lines.push("");

	lines.push("## Revision Evidence");
	lines.push(`- Open revision items: ${packet.revisions.openCount}`);
	for (const entry of packet.revisions.entries) {
		lines.push(
			`- ${entry.title || entry.drawingNumber || "Revision item"} | ${entry.issueSeverity} | ${entry.issueStatus} | ${entry.issueSummary}`,
		);
	}
	lines.push("");

	lines.push("## Transmittal Evidence");
	if (packet.transmittal.linkedReceipt) {
		lines.push(
			`- Linked receipt: ${packet.transmittal.linkedReceipt.transmittalNumber || "Unnumbered"} (${formatTimestamp(packet.transmittal.linkedReceipt.generatedAt)})`,
		);
		lines.push(
			`- Output files: ${packet.transmittal.linkedReceipt.outputs.map((output) => output.filename).join(", ") || "None"}`,
		);
		lines.push(
			`- Document count: ${packet.transmittal.linkedReceipt.documentCount} | Pending review: ${packet.transmittal.linkedReceipt.pendingReviewCount}`,
		);
	} else {
		lines.push(
			`- Transmittal number: ${packet.transmittal.number || "Not set"}`,
		);
		lines.push(
			`- Document name: ${packet.transmittal.documentName || "Not set"}`,
		);
	}
	lines.push("");

	lines.push("## Automation Evidence");
	lines.push(`- Linked receipts: ${packet.automation.linkedReceiptCount}`);
	if (packet.automation.receipts.length === 0) {
		lines.push("- No automation receipts linked to this package yet.");
	} else {
		for (const receipt of packet.automation.receipts) {
			lines.push(
				`- ${formatTimestamp(receipt.createdAt)} | ${receipt.mode} | ${receipt.summary}`,
			);
			lines.push(
				`  - Markups ${receipt.preparedMarkupCount} | Review items ${receipt.reviewItemCount} | Routes ${receipt.routeCount} | Strip writes ${receipt.terminalStripUpdateCount} | Managed route upserts ${receipt.managedRouteUpsertCount} | CAD drawings ${receipt.cadUtilityChangedDrawingCount} | CAD items ${receipt.cadUtilityChangedItemCount} | Affected drawings ${receipt.affectedDrawingCount}`,
			);
			if (receipt.drawingName) {
				lines.push(`  - Drawing: ${receipt.drawingName}`);
			}
			if (receipt.requestId) {
				lines.push(`  - Request: ${receipt.requestId}`);
			}
		}
	}
	lines.push("");

	lines.push("## Watchdog Evidence");
	lines.push(
		`- Matched tracked drawings: ${packet.watchdog.matchedTrackedCount}`,
	);
	for (const drawing of packet.watchdog.drawings) {
		lines.push(
			`- ${drawing.drawingName} | ${formatDuration(drawing.lifetimeTrackedMs)} | Last worked ${formatTimestamp(drawing.lastWorkedAt)}`,
		);
	}

	return `${lines.join("\n")}\n`;
}
