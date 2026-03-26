import type { Project } from "@/components/apps/projects/projectmanagertypes";
import type { ProjectWatchdogTelemetry } from "@/components/apps/projects/useProjectWatchdogTelemetry";
import type { DrawingAnnotation } from "@/components/apps/standards-checker/standardsDrawingModels";
import type { StandardDocumentSourceMode } from "@/components/apps/transmittal-builder/transmittalBuilderModels";
import { logger } from "@/lib/logger";
import type { ProjectDocumentMetadataRow } from "@/services/projectDocumentMetadataService";
import type { ProjectIssueSetRecord } from "@/services/projectIssueSetService";
import type { ProjectReviewDecisionRecord } from "@/services/projectReviewDecisionService";
import type { DrawingRevisionRegisterRow } from "@/services/projectRevisionRegisterService";
import type { ProjectTransmittalReceiptRecord } from "@/services/projectTransmittalReceiptService";
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
	watchdog: {
		matchedTrackedCount: number;
		drawings: Array<{
			drawingName: string;
			lifetimeTrackedMs: number;
			lastWorkedAt: string | null;
		}>;
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
	scanRows: ProjectDocumentMetadataRow[];
	revisions: DrawingRevisionRegisterRow[];
	telemetry: ProjectWatchdogTelemetry;
	standardsChecks: DrawingAnnotation[];
	decisions: ProjectReviewDecisionRecord[];
	transmittalReceipts: ProjectTransmittalReceiptRecord[];
}): ProjectIssueSetEvidencePacket {
	const selectedRows = args.scanRows.filter((row) =>
		args.issueSet.selectedDrawingPaths.includes(row.relativePath),
	);
	const selectedDrawingNumbers = new Set(
		selectedRows.map((row) => normalizeText(row.drawingNumber).toUpperCase()),
	);
	const selectedDrawingKeys = new Set(
		args.issueSet.selectedDrawingPaths.map((path) => normalizeDrawingKey(path)),
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
	const scopedDecisions = args.decisions.filter(
		(decision) => (decision.issueSetId || null) === args.issueSet.id,
	);
	const acceptedTitleBlockIds = new Set(
		scopedDecisions
			.filter(
				(decision) =>
					decision.itemType === "title-block" &&
					decision.status === "accepted",
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
