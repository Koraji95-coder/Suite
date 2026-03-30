import {
	FileSpreadsheet,
	Link2,
	RefreshCw,
	Trash2,
	Upload,
} from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { TrustStateBadge } from "@/components/apps/ui/TrustStateBadge";
import { useToast } from "@/components/notification-system/ToastProvider";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Panel } from "@/components/primitives/Panel";
import { buildProjectDetailHref } from "@/lib/projectWorkflowNavigation";
import {
	type ProjectDeliverablePairingMatch,
	type ProjectDeliverableRegisterRow,
	type ProjectDeliverableRegisterSnapshot,
	type ProjectDeliverableVerificationState,
	projectDeliverableRegisterService,
} from "@/services/projectDeliverableRegisterService";
import type { ProjectDocumentMetadataRow } from "@/services/projectDocumentMetadataService";
import styles from "./ProjectDeliverableRegisterPanel.module.css";

interface ProjectDeliverableRegisterPanelProps {
	projectId: string;
	projectName: string;
	projectRootPath?: string | null;
	metadataRows: ProjectDocumentMetadataRow[];
	onSnapshotChange?: () => void;
}

function formatRelativeDate(value: string | null) {
	if (!value) return "Not imported yet";
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

function summarizeVerification(
	label: string,
	state: ProjectDeliverableVerificationState,
	detail: string | null,
) {
	switch (state) {
		case "matched":
			return `${label}: matched`;
		case "mismatch":
			return `${label}: ${detail || "Mismatch needs review."}`;
		case "partial":
			return `${label}: ${detail || "Partial verification only."}`;
		default:
			return `${label}: ${detail || "Verification unavailable."}`;
	}
}

function getPreferredMatchId(
	status: "paired" | "missing" | "multiple" | "manual",
	matches: ProjectDeliverablePairingMatch[],
	manualMatchId: string | null,
) {
	if (status === "manual" && manualMatchId) {
		return manualMatchId;
	}
	if (status === "paired" && matches.length === 1) {
		return matches[0]?.id ?? "";
	}
	return "";
}

function getSnapshotState(snapshot: ProjectDeliverableRegisterSnapshot | null) {
	if (!snapshot) {
		return "background" as const;
	}
	const blockingRows = snapshot.rows.filter(
		(row) =>
			(row.pdfPairingStatus !== "paired" &&
				row.pdfPairingStatus !== "manual") ||
			row.titleBlockVerificationState === "mismatch" ||
			row.acadeVerificationState === "mismatch",
	);
	if (blockingRows.length > 0) {
		return "needs-attention" as const;
	}
	return "ready" as const;
}

export function ProjectDeliverableRegisterPanel({
	projectId,
	projectName,
	projectRootPath = null,
	metadataRows,
	onSnapshotChange,
}: ProjectDeliverableRegisterPanelProps) {
	const { showToast } = useToast();
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [snapshot, setSnapshot] =
		useState<ProjectDeliverableRegisterSnapshot | null>(null);
	const [loading, setLoading] = useState(true);
	const [importing, setImporting] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [clearing, setClearing] = useState(false);
	const [resolvingRowId, setResolvingRowId] = useState<string | null>(null);
	const [messages, setMessages] = useState<string[]>([]);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			setLoading(true);
			const result = await projectDeliverableRegisterService.fetchSnapshot(projectId);
			if (cancelled) {
				return;
			}
			setSnapshot(result.data);
			setMessages(result.error ? [result.error.message] : []);
			setLoading(false);
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	const stats = useMemo(() => {
		const rows = snapshot?.rows ?? [];
		return {
			sheetCount: snapshot?.sheetNames.length ?? 0,
			rowCount: rows.length,
			pairedPdfCount: rows.filter(
				(row) => row.pdfPairingStatus === "paired" || row.pdfPairingStatus === "manual",
			).length,
			missingPdfCount: rows.filter((row) => row.pdfPairingStatus === "missing")
				.length,
			multiplePdfCount: rows.filter((row) => row.pdfPairingStatus === "multiple")
				.length,
			packageReadyCount: rows.filter((row) => row.issueSetEligible).length,
		};
	}, [snapshot]);

	const rowsNeedingAttention = useMemo(() => {
		return (snapshot?.rows ?? [])
			.filter(
				(row) =>
					(row.pdfPairingStatus !== "paired" &&
						row.pdfPairingStatus !== "manual") ||
					row.titleBlockVerificationState === "mismatch" ||
					row.acadeVerificationState === "mismatch",
			)
			.slice(0, 10);
	}, [snapshot]);

	const filesHref = buildProjectDetailHref(projectId, "files");
	const reviewHref = buildProjectDetailHref(projectId, "review");
	const panelState = getSnapshotState(snapshot);

	const syncSnapshot = async (mode: "refresh" | "import", file?: File) => {
		const projectFilesResult =
			await projectDeliverableRegisterService.fetchProjectFiles(projectId);
		if (projectFilesResult.error) {
			showToast("warning", projectFilesResult.error.message);
		}

		if (mode === "import" && file) {
			setImporting(true);
			try {
				const arrayBuffer = await file.arrayBuffer();
				const result = await projectDeliverableRegisterService.importWorkbook({
					projectId,
					fileName: file.name,
					arrayBuffer,
					projectFiles: projectFilesResult.data,
					metadataRows,
					dwgRootPath: projectRootPath,
					previousSnapshot: snapshot,
				});
				setSnapshot(result.data);
				setMessages(result.error ? [result.error.message] : []);
				if (result.data) {
					showToast("success", `Imported deliverable register for ${projectName}.`);
					onSnapshotChange?.();
				}
				if (result.error) {
					showToast("warning", result.error.message);
				}
			} finally {
				setImporting(false);
			}
			return;
		}

		setRefreshing(true);
		try {
			const result = await projectDeliverableRegisterService.refreshSnapshot({
				projectId,
				projectFiles: projectFilesResult.data,
				metadataRows,
				dwgRootPath: projectRootPath,
			});
			setSnapshot(result.data);
			setMessages(result.error ? [result.error.message] : []);
			if (result.data) {
				showToast("success", "Deliverable register pairing refreshed.");
				onSnapshotChange?.();
			}
			if (result.error) {
				showToast("warning", result.error.message);
			}
		} finally {
			setRefreshing(false);
		}
	};

	const handleWorkbookImport = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		try {
			await syncSnapshot("import", file);
		} finally {
			event.target.value = "";
		}
	};

	const handleClear = async () => {
		setClearing(true);
		try {
			const result = await projectDeliverableRegisterService.clearSnapshot(projectId);
			if (!result.success) {
				showToast("error", result.error?.message || "Unable to clear register.");
				return;
			}
			setSnapshot(null);
			setMessages([]);
			showToast("success", "Deliverable register cleared.");
			onSnapshotChange?.();
		} finally {
			setClearing(false);
		}
	};

	const handlePairingOverride = async (
		row: ProjectDeliverableRegisterRow,
		kind: "pdf" | "dwg",
		nextId: string,
	) => {
		setResolvingRowId(row.id);
		try {
			const projectFilesResult =
				await projectDeliverableRegisterService.fetchProjectFiles(projectId);
			const result = await projectDeliverableRegisterService.savePairingOverride({
				projectId,
				rowId: row.id,
				pdfMatchId: kind === "pdf" ? nextId || null : undefined,
				dwgMatchId: kind === "dwg" ? nextId || null : undefined,
				projectFiles: projectFilesResult.data,
				metadataRows,
				dwgRootPath: projectRootPath,
			});
			if (result.data) {
				setSnapshot(result.data);
				onSnapshotChange?.();
			}
			if (result.error) {
				showToast("warning", result.error.message);
			}
		} finally {
			setResolvingRowId(null);
		}
	};

	return (
		<Panel variant="support" padding="lg" className={styles.root}>
			<div className={styles.header}>
				<div className={styles.headerCopy}>
					<p className={styles.eyebrow}>Package register</p>
					<h5 className={styles.title}>Deliverable register</h5>
					<p className={styles.description}>
						Import the master workbook here, then pair each row to issued project
						PDFs by drawing number and verify it against DWG/title block metadata.
					</p>
				</div>
				<TrustStateBadge state={loading ? "background" : panelState} />
			</div>

			<div className={styles.factStrip}>
				<span className={styles.fact}><strong>{stats.sheetCount}</strong> sheets</span>
				<span className={styles.fact}><strong>{stats.rowCount}</strong> rows</span>
				<span className={styles.fact}><strong>{stats.pairedPdfCount}</strong> paired PDFs</span>
				<span className={styles.fact}><strong>{stats.packageReadyCount}</strong> package-ready</span>
			</div>

			<div className={styles.actionRow}>
				<Button
					variant="primary"
					size="sm"
					iconLeft={<Upload size={14} />}
					onClick={() => fileInputRef.current?.click()}
					loading={importing}
				>
					Import workbook
				</Button>
				<Button
					variant="secondary"
					size="sm"
					iconLeft={<RefreshCw size={14} />}
					onClick={() => {
						void syncSnapshot("refresh");
					}}
					loading={refreshing}
					disabled={!snapshot}
				>
					Refresh pairing
				</Button>
				<Button
					variant="ghost"
					size="sm"
					iconLeft={<Trash2 size={14} />}
					onClick={() => {
						void handleClear();
					}}
					loading={clearing}
					disabled={!snapshot}
				>
					Clear
				</Button>
				<div className={styles.utilityLinks}>
					<Link to={filesHref} className={styles.utilityLink}>
						<Link2 size={14} />
						<span>Open Files & activity</span>
					</Link>
					<Link to={reviewHref} className={styles.utilityLink}>
						<Link2 size={14} />
						<span>Open review inbox</span>
					</Link>
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept=".xlsx,.xlsm,.xls"
					className={styles.hiddenInput}
					onChange={handleWorkbookImport}
				/>
			</div>

			<p className={styles.snapshotCopy}>
				{snapshot
					? `${snapshot.workbookFileName} imported ${formatRelativeDate(
							snapshot.importedAt,
					  )}. ${snapshot.pdfSourceSummary ?? ""}`.trim()
					: "Upload the master deliverable workbook after you have added the issued PDFs to the project file lane."}
			</p>

			{snapshot ? (
				<div className={styles.attentionSummary}>
					<span>{stats.missingPdfCount} missing PDFs</span>
					<span>{stats.multiplePdfCount} duplicate PDF matches</span>
				</div>
			) : null}

			{rowsNeedingAttention.length > 0 ? (
				<div className={styles.rowList}>
					{rowsNeedingAttention.map((row) => {
						const pdfValue = getPreferredMatchId(
							row.pdfPairingStatus,
							row.pdfMatches,
							row.manualPdfMatchId,
						);
						const dwgValue = getPreferredMatchId(
							row.dwgPairingStatus,
							row.dwgMatches,
							row.manualDwgMatchId,
						);
						return (
							<div key={row.id} className={styles.rowCard}>
								<div className={styles.rowHeader}>
									<div>
										<p className={styles.rowTitle}>{row.drawingNumber}</p>
										<p className={styles.rowSubtitle}>
											{row.sheetName}
											{row.setName ? ` • ${row.setName}` : ""} •{" "}
											{row.currentRevision ? `Rev ${row.currentRevision}` : "No revision"}
										</p>
									</div>
									<div className={styles.badgeRow}>
										<Badge color="accent" variant="soft">
											{row.readinessState}
										</Badge>
										<Badge
											color={
												row.pdfPairingStatus === "missing"
													? "danger"
													: row.pdfPairingStatus === "multiple"
														? "warning"
														: "success"
											}
											variant="soft"
										>
											PDF {row.pdfPairingStatus}
										</Badge>
									</div>
								</div>
								<p className={styles.rowDescription}>
									{row.drawingDescription || "No drawing description in workbook."}
								</p>
								<div className={styles.reviewNotes}>
									<p>{summarizeVerification("Title block", row.titleBlockVerificationState, row.titleBlockVerificationDetail)}</p>
									<p>{summarizeVerification("ACADE", row.acadeVerificationState, row.acadeVerificationDetail)}</p>
								</div>
								{row.pdfMatches.length > 1 ? (
									<label className={styles.selectField}>
										<span>Resolve PDF pairing</span>
										<select
											value={pdfValue}
											onChange={(event) => {
												void handlePairingOverride(row, "pdf", event.target.value);
											}}
											disabled={resolvingRowId === row.id}
										>
											<option value="">Choose the issued PDF…</option>
											{row.pdfMatches.map((match) => (
												<option key={match.id} value={match.id}>
													{match.fileName}
												</option>
											))}
										</select>
									</label>
								) : null}
								{row.dwgMatches.length > 1 ? (
									<label className={styles.selectField}>
										<span>Resolve DWG pairing</span>
										<select
											value={dwgValue}
											onChange={(event) => {
												void handlePairingOverride(row, "dwg", event.target.value);
											}}
											disabled={resolvingRowId === row.id}
										>
											<option value="">Choose the DWG row…</option>
											{row.dwgMatches.map((match) => (
												<option key={match.id} value={match.id}>
													{match.relativePath || match.fileName}
												</option>
											))}
										</select>
									</label>
								) : null}
							</div>
						);
					})}
				</div>
			) : snapshot ? (
				<div className={styles.emptyState}>
					<FileSpreadsheet className={styles.emptyIcon} />
					<p className={styles.emptyTitle}>Register looks clean.</p>
					<p className={styles.emptyCopy}>
						The imported workbook is paired to project PDFs and does not have any
						open workbook-versus-package mismatches right now.
					</p>
				</div>
			) : (
				<div className={styles.emptyState}>
					<FileSpreadsheet className={styles.emptyIcon} />
					<p className={styles.emptyTitle}>No deliverable register imported yet.</p>
					<p className={styles.emptyCopy}>
						Upload the master workbook here after you have uploaded the issued PDF
						package files into the project archive. Suite will pair rows to PDFs
						by drawing number and flag anything that does not line up.
					</p>
				</div>
			)}

			{messages.length > 0 ? (
				<div className={styles.noticeList}>
					{messages.map((message) => (
						<p key={message} className={styles.notice}>
							{message}
						</p>
					))}
				</div>
			) : null}
		</Panel>
	);
}
