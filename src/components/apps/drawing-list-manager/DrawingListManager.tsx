import {
	Download,
	RefreshCw,
	Save,
	Sparkles,
	Upload,
	Wand2,
} from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { useToast } from "@/components/notification-system/ToastProvider";
import { logger } from "@/lib/logger";
import {
	type AcadeDocumentReportRow,
	buildDrawingIndexExportRows,
	normalizeTitleBlockSyncRows,
	type ProjectDocumentMetadataRow,
	parseAcadeDocumentReportFile,
} from "@/services/projectDocumentMetadataService";
import {
	type DrawingRevisionRegisterRow,
	projectRevisionRegisterService,
} from "@/services/projectRevisionRegisterService";
import { projectTitleBlockProfileService } from "@/services/projectTitleBlockProfileService";
import {
	type TitleBlockEditableFields,
	type TitleBlockSyncArtifacts,
	type TitleBlockSyncProfile,
	type TitleBlockSyncRow,
	type TitleBlockSyncSummary,
	titleBlockSyncService,
} from "@/services/titleBlockSyncService";
import { supabase } from "@/supabase/client";
import styles from "./DrawingListManager.module.css";
import { buildWorkbook, type DrawingEntry } from "./drawingListManagerModels";

interface ProjectOption {
	id: string;
	name: string;
	watchdog_root_path: string | null;
}

const EMPTY_SUMMARY: TitleBlockSyncSummary = {
	totalFiles: 0,
	drawingFiles: 0,
	flaggedFiles: 0,
	suiteWriteCount: 0,
	acadeWriteCount: 0,
	wdTbConflictCount: 0,
};

const EMPTY_ARTIFACTS: TitleBlockSyncArtifacts = {
	wdtPath: "",
	wdlPath: "",
	wdtText: "",
	wdlText: "",
};

function toProfileInput(profile: TitleBlockSyncProfile) {
	return {
		blockName: profile.blockName,
		projectRootPath: profile.projectRootPath,
		acadeLine1: profile.acadeLine1,
		acadeLine2: profile.acadeLine2,
		acadeLine4: profile.acadeLine4,
		signerDrawnBy: profile.signerDrawnBy,
		signerCheckedBy: profile.signerCheckedBy,
		signerEngineer: profile.signerEngineer,
	};
}

function mapProfileRowToState(
	row: Awaited<
		ReturnType<typeof projectTitleBlockProfileService.fetchProfile>
	>["data"],
): TitleBlockSyncProfile {
	return {
		blockName: row.block_name,
		projectRootPath: row.project_root_path,
		acadeLine1: row.acade_line1,
		acadeLine2: row.acade_line2,
		acadeLine4: row.acade_line4,
		signerDrawnBy: row.signer_drawn_by,
		signerCheckedBy: row.signer_checked_by,
		signerEngineer: row.signer_engineer,
	};
}

export function DrawingListManager() {
	const { showToast } = useToast();
	const [projects, setProjects] = useState<ProjectOption[]>([]);
	const [selectedProjectId, setSelectedProjectId] = useState("");
	const [profile, setProfile] = useState<TitleBlockSyncProfile>({
		blockName: "R3P-24x36BORDER&TITLE",
		projectRootPath: "",
		acadeLine1: "",
		acadeLine2: "",
		acadeLine4: "",
		signerDrawnBy: "",
		signerCheckedBy: "",
		signerEngineer: "",
	});
	const [revisionEntries, setRevisionEntries] = useState<
		DrawingRevisionRegisterRow[]
	>([]);
	const [rows, setRows] = useState<TitleBlockSyncRow[]>([]);
	const [acadeReportFile, setAcadeReportFile] = useState<File | null>(null);
	const [acadeReportRows, setAcadeReportRows] = useState<
		AcadeDocumentReportRow[]
	>([]);
	const [acadeReportError, setAcadeReportError] = useState<string | null>(null);
	const [summary, setSummary] = useState<TitleBlockSyncSummary>(EMPTY_SUMMARY);
	const [artifacts, setArtifacts] =
		useState<TitleBlockSyncArtifacts>(EMPTY_ARTIFACTS);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [message, setMessage] = useState<string | null>(null);
	const [selectedRelativePaths, setSelectedRelativePaths] = useState<string[]>(
		[],
	);
	const [loadingProjects, setLoadingProjects] = useState(false);
	const [loadingProjectData, setLoadingProjectData] = useState(false);
	const [savingProfile, setSavingProfile] = useState(false);
	const [scanning, setScanning] = useState(false);
	const [previewing, setPreviewing] = useState(false);
	const [applying, setApplying] = useState(false);
	const acadeReportInputRef = useRef<HTMLInputElement | null>(null);

	const selectedProject = useMemo(
		() => projects.find((project) => project.id === selectedProjectId) ?? null,
		[projects, selectedProjectId],
	);
	const metadataRows = useMemo(
		() => normalizeTitleBlockSyncRows(rows, acadeReportRows),
		[acadeReportRows, rows],
	);
	const metadataRowsById = useMemo(
		() =>
			new Map<string, ProjectDocumentMetadataRow>(
				metadataRows.map((row) => [row.id, row]),
			),
		[metadataRows],
	);
	const metadataFlaggedCount = useMemo(
		() =>
			metadataRows.filter(
				(row) => row.issues.length > 0 || row.warnings.length > 0,
			).length,
		[metadataRows],
	);

	useEffect(() => {
		let cancelled = false;
		const loadProjects = async () => {
			setLoadingProjects(true);
			try {
				const {
					data: { user },
					error: authError,
				} = await supabase.auth.getUser();
				if (authError || !user) {
					if (!cancelled) {
						setProjects([]);
						setSelectedProjectId("");
					}
					return;
				}

				const { data, error } = await supabase
					.from("projects")
					.select("id, name, watchdog_root_path")
					.eq("user_id", user.id)
					.order("created_at", { ascending: false });

				if (error) throw error;

				if (!cancelled) {
					const nextProjects = (data ?? []) as ProjectOption[];
					setProjects(nextProjects);
					if (nextProjects.length > 0 && !selectedProjectId) {
						setSelectedProjectId(nextProjects[0].id);
					}
				}
			} catch (error) {
				logger.error(
					"Failed to load projects for title block sync",
					"DrawingListManager",
					error,
				);
				if (!cancelled) {
					showToast("error", "Failed to load projects.");
				}
			} finally {
				if (!cancelled) {
					setLoadingProjects(false);
				}
			}
		};

		void loadProjects();
		return () => {
			cancelled = true;
		};
	}, [selectedProjectId, showToast]);

	useEffect(() => {
		if (!selectedProjectId) return;
		let cancelled = false;

		const loadProjectData = async () => {
			setLoadingProjectData(true);
			setMessage(null);
			try {
				const defaults = {
					projectRootPath: selectedProject?.watchdog_root_path || null,
				};
				const [profileResult, revisionsResult] = await Promise.all([
					projectTitleBlockProfileService.fetchProfile(
						selectedProjectId,
						defaults,
					),
					projectRevisionRegisterService.fetchEntries(selectedProjectId),
				]);

				if (cancelled) return;

				setProfile(mapProfileRowToState(profileResult.data));
				setRevisionEntries(revisionsResult.data);
				setWarnings(
					[
						profileResult.error?.message || "",
						revisionsResult.error?.message || "",
					].filter(Boolean),
				);
				setAcadeReportFile(null);
				setAcadeReportRows([]);
				setAcadeReportError(null);
				setRows([]);
				setSummary(EMPTY_SUMMARY);
				setArtifacts(EMPTY_ARTIFACTS);
				setSelectedRelativePaths([]);
			} catch (error) {
				logger.error(
					"Failed to load title block project data",
					"DrawingListManager",
					error,
				);
				if (!cancelled) {
					showToast("error", "Failed to load title block project data.");
				}
			} finally {
				if (!cancelled) {
					setLoadingProjectData(false);
				}
			}
		};

		void loadProjectData();
		return () => {
			cancelled = true;
		};
	}, [selectedProjectId, selectedProject?.watchdog_root_path, showToast]);

	const buildPayload = (nextRows?: TitleBlockSyncRow[]) => {
		if (!selectedProjectId) {
			throw new Error("Select a project first.");
		}
		if (!profile.projectRootPath?.trim()) {
			throw new Error("Project root path is required.");
		}

		return {
			projectId: selectedProjectId,
			projectRootPath: profile.projectRootPath.trim(),
			profile,
			revisionEntries,
			rows: nextRows ?? rows,
			selectedRelativePaths,
			triggerAcadeUpdate: true,
		};
	};

	const saveProfile = async () => {
		if (!selectedProjectId) {
			showToast("warning", "Select a project first.");
			return;
		}

		setSavingProfile(true);
		try {
			const saved = await projectTitleBlockProfileService.upsertProfile({
				projectId: selectedProjectId,
				...toProfileInput(profile),
			});
			if (saved) {
				setProfile(mapProfileRowToState(saved));
				setMessage("Title block profile saved.");
			}
		} catch (error) {
			logger.error(
				"Failed to save title block profile",
				"DrawingListManager",
				error,
			);
			showToast("error", "Failed to save title block profile.");
		} finally {
			setSavingProfile(false);
		}
	};

	const handleScan = async () => {
		setScanning(true);
		setMessage(null);
		try {
			await saveProfile();
			const response = await titleBlockSyncService.scan(buildPayload([]));
			if (!response.success || !response.data) {
				throw new Error(response.message || "Title block scan failed.");
			}

			setRows(response.data.drawings);
			setSummary(response.data.summary);
			setArtifacts(response.data.artifacts);
			setWarnings(response.warnings || []);
			setSelectedRelativePaths(
				response.data.drawings
					.filter((row) => row.fileType === "dwg")
					.map((row) => row.relativePath),
			);
			setMessage(response.message);
		} catch (error) {
			const nextMessage =
				error instanceof Error ? error.message : "Title block scan failed.";
			setMessage(nextMessage);
			showToast("error", nextMessage);
		} finally {
			setScanning(false);
		}
	};

	const handlePreview = async () => {
		setPreviewing(true);
		setMessage(null);
		try {
			const response = await titleBlockSyncService.preview(buildPayload());
			if (!response.success || !response.data) {
				throw new Error(response.message || "Title block preview failed.");
			}
			setRows(response.data.drawings);
			setSummary(response.data.summary);
			setArtifacts(response.data.artifacts);
			setWarnings(response.warnings || []);
			setMessage(response.message);
		} catch (error) {
			const nextMessage =
				error instanceof Error ? error.message : "Title block preview failed.";
			setMessage(nextMessage);
			showToast("error", nextMessage);
		} finally {
			setPreviewing(false);
		}
	};

	const handleApply = async () => {
		setApplying(true);
		setMessage(null);
		try {
			const response = await titleBlockSyncService.apply(buildPayload());
			if (!response.success || !response.data) {
				throw new Error(response.message || "Title block apply failed.");
			}
			setRows(response.data.drawings);
			setSummary(response.data.summary);
			setArtifacts(response.data.artifacts);
			setWarnings(response.warnings || []);
			setMessage(response.message);
		} catch (error) {
			const nextMessage =
				error instanceof Error ? error.message : "Title block apply failed.";
			setMessage(nextMessage);
			showToast("error", nextMessage);
		} finally {
			setApplying(false);
		}
	};

	const updateProfile = (field: keyof TitleBlockSyncProfile, value: string) => {
		setProfile((current) => ({
			...current,
			[field]: value,
		}));
	};

	const handleAcadeReportSelection = async (
		event: ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0] ?? null;
		setAcadeReportFile(file);
		setAcadeReportError(null);
		if (!file) {
			setAcadeReportRows([]);
			return;
		}

		try {
			const parsedRows = await parseAcadeDocumentReportFile(file);
			setAcadeReportRows(parsedRows);
		} catch (error) {
			const nextMessage =
				error instanceof Error
					? error.message
					: "Failed to parse the selected ACADE report.";
			setAcadeReportRows([]);
			setAcadeReportError(nextMessage);
			showToast("error", nextMessage);
		}
	};

	const updateEditableField = (
		relativePath: string,
		field: keyof TitleBlockEditableFields,
		value: string,
	) => {
		setRows((current) =>
			current.map((row) =>
				row.relativePath === relativePath
					? {
							...row,
							editableFields: {
								...row.editableFields,
								[field]: value,
							},
						}
					: row,
			),
		);
	};

	const toggleSelectedPath = (relativePath: string) => {
		setSelectedRelativePaths((current) =>
			current.includes(relativePath)
				? current.filter((value) => value !== relativePath)
				: [...current, relativePath],
		);
	};

	const exportRows = async () => {
		try {
			const workbookRows: DrawingEntry[] = buildDrawingIndexExportRows(
				metadataRows,
			).map((row) => ({
				...row,
				source: row.source === "folder" ? "folder" : "generated",
			}));

			const workbook = await buildWorkbook(workbookRows);
			const buffer = await workbook.xlsx.writeBuffer();
			const blob = new Blob([buffer], {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = "drawing-list-manager-export.xlsx";
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			URL.revokeObjectURL(url);
		} catch (error) {
			logger.error(
				"Failed to export drawing list manager workbook",
				"DrawingListManager",
				error,
			);
			showToast("error", "Failed to export the drawing index workbook.");
		}
	};

	const selectedCount = selectedRelativePaths.length;
	const canRun = !!selectedProjectId && !!profile.projectRootPath?.trim();

	return (
		<PageFrame maxWidth="full">
			<PageContextBand
				eyebrow="Title block sync"
				summary={
					<p className={styles.contextSummary}>
						Project-wide title block scan, ACADE mapping preview, and Suite
						second-pass sync from one workspace.
					</p>
				}
				actions={
					<div className={styles.toolbar}>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => void saveProfile()}
							disabled={!selectedProjectId || savingProfile}
						>
							<Save size={14} />
							{savingProfile ? "Saving…" : "Save Profile"}
						</button>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => void handleScan()}
							disabled={!canRun || scanning}
						>
							<RefreshCw size={14} />
							{scanning ? "Scanning…" : "Scan Project"}
						</button>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => void handlePreview()}
							disabled={!canRun || rows.length === 0 || previewing}
						>
							<Sparkles size={14} />
							{previewing ? "Previewing…" : "Preview Sync"}
						</button>
						<button
							type="button"
							className={styles.primaryButton}
							onClick={() => void handleApply()}
							disabled={!canRun || rows.length === 0 || applying}
						>
							<Wand2 size={14} />
							{applying ? "Applying…" : "Apply Sync"}
						</button>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => void exportRows()}
							disabled={rows.length === 0}
						>
							<Download size={14} />
							Export
						</button>
					</div>
				}
			/>
			<div className={styles.stack}>
				<div className={styles.summaryGrid}>
					<div className={styles.summaryCard}>
						<span className={styles.summaryLabel}>Files</span>
						<strong>{summary.totalFiles}</strong>
					</div>
					<div className={styles.summaryCard}>
						<span className={styles.summaryLabel}>Flagged</span>
						<strong>
							{Math.max(summary.flaggedFiles, metadataFlaggedCount)}
						</strong>
					</div>
					<div className={styles.summaryCard}>
						<span className={styles.summaryLabel}>Suite Writes</span>
						<strong>{summary.suiteWriteCount}</strong>
					</div>
					<div className={styles.summaryCard}>
						<span className={styles.summaryLabel}>ACADE Writes</span>
						<strong>{summary.acadeWriteCount}</strong>
					</div>
					<div className={styles.summaryCard}>
						<span className={styles.summaryLabel}>WD_TB Conflicts</span>
						<strong>{summary.wdTbConflictCount}</strong>
					</div>
					<div className={styles.summaryCard}>
						<span className={styles.summaryLabel}>Selected DWGs</span>
						<strong>{selectedCount}</strong>
					</div>
				</div>

				{message ? <div className={styles.message}>{message}</div> : null}
				{warnings.length > 0 ? (
					<div className={styles.warningPanel}>
						{warnings.map((warning) => (
							<div key={warning}>{warning}</div>
						))}
					</div>
				) : null}

				<div className={styles.configGrid}>
					<section className={styles.card}>
						<h3 className={styles.cardTitle}>Project</h3>
						<label className={styles.field}>
							<span className={styles.fieldLabel}>Project</span>
							<select
								className={styles.input}
								value={selectedProjectId}
								onChange={(event) => setSelectedProjectId(event.target.value)}
								disabled={loadingProjects}
							>
								<option value="">Select a project</option>
								{projects.map((project) => (
									<option key={project.id} value={project.id}>
										{project.name}
									</option>
								))}
							</select>
						</label>
						<label className={styles.field}>
							<span className={styles.fieldLabel}>Project Root Path</span>
							<input
								className={styles.input}
								value={profile.projectRootPath || ""}
								onChange={(event) =>
									updateProfile("projectRootPath", event.target.value)
								}
								placeholder="C:\\Projects\\R3P-25074"
							/>
						</label>
						<div className={styles.smallMeta}>
							{loadingProjectData
								? "Loading profile and revision register…"
								: `${revisionEntries.length} revision register entr${
										revisionEntries.length === 1 ? "y" : "ies"
									} loaded.`}
						</div>
					</section>

					<section className={styles.card}>
						<h3 className={styles.cardTitle}>ACADE Profile</h3>
						<div className={styles.formGrid}>
							<label className={styles.field}>
								<span className={styles.fieldLabel}>Block Name</span>
								<input
									className={styles.input}
									value={profile.blockName}
									onChange={(event) =>
										updateProfile("blockName", event.target.value)
									}
								/>
							</label>
							<label className={styles.field}>
								<span className={styles.fieldLabel}>LINE1</span>
								<input
									className={styles.input}
									value={profile.acadeLine1}
									onChange={(event) =>
										updateProfile("acadeLine1", event.target.value)
									}
									placeholder="Client / Utility"
								/>
							</label>
							<label className={styles.field}>
								<span className={styles.fieldLabel}>LINE2</span>
								<input
									className={styles.input}
									value={profile.acadeLine2}
									onChange={(event) =>
										updateProfile("acadeLine2", event.target.value)
									}
									placeholder="Facility / Site"
								/>
							</label>
							<label className={styles.field}>
								<span className={styles.fieldLabel}>LINE4</span>
								<input
									className={styles.input}
									value={profile.acadeLine4}
									onChange={(event) =>
										updateProfile("acadeLine4", event.target.value)
									}
									placeholder="Project Number"
								/>
							</label>
							<label className={styles.field}>
								<span className={styles.fieldLabel}>Drawn By Default</span>
								<input
									className={styles.input}
									value={profile.signerDrawnBy}
									onChange={(event) =>
										updateProfile("signerDrawnBy", event.target.value)
									}
								/>
							</label>
							<label className={styles.field}>
								<span className={styles.fieldLabel}>Checked By Default</span>
								<input
									className={styles.input}
									value={profile.signerCheckedBy}
									onChange={(event) =>
										updateProfile("signerCheckedBy", event.target.value)
									}
								/>
							</label>
							<label className={styles.field}>
								<span className={styles.fieldLabel}>Engineer Default</span>
								<input
									className={styles.input}
									value={profile.signerEngineer}
									onChange={(event) =>
										updateProfile("signerEngineer", event.target.value)
									}
								/>
							</label>
						</div>
					</section>

					<section className={styles.card}>
						<h3 className={styles.cardTitle}>Generated Mapping</h3>
						<div className={styles.artifactMeta}>
							<div>
								<strong>WDT</strong>
								<span>{artifacts.wdtPath || "Not generated yet"}</span>
							</div>
							<div>
								<strong>WDL</strong>
								<span>{artifacts.wdlPath || "Not generated yet"}</span>
							</div>
						</div>
						<div className={styles.artifactPanel}>
							<div>
								<h4 className={styles.subTitle}>.WDT Preview</h4>
								<pre className={styles.codeBlock}>
									{artifacts.wdtText || "BLOCK = R3P-24x36BORDER&TITLE"}
								</pre>
							</div>
							<div>
								<h4 className={styles.subTitle}>.WDL Preview</h4>
								<pre className={styles.codeBlock}>
									{artifacts.wdlText || "LINE1 = Client / Utility"}
								</pre>
							</div>
						</div>
					</section>

					<section className={styles.card}>
						<h3 className={styles.cardTitle}>ACADE Report Import</h3>
						<label className={styles.field}>
							<span className={styles.fieldLabel}>
								Drawing List / Automatic Report
							</span>
							<div className={styles.filePickerRow}>
								<button
									type="button"
									className={styles.secondaryButton}
									onClick={() => {
										if (acadeReportInputRef.current) {
											acadeReportInputRef.current.value = "";
											acadeReportInputRef.current.click();
										}
									}}
								>
									<Upload size={14} />
									Browse
								</button>
								<div className={styles.filePickerValue}>
									{acadeReportFile?.name || "No report selected"}
								</div>
								<input
									ref={acadeReportInputRef}
									type="file"
									accept=".xlsx,.csv,.tsv"
									className={styles.hiddenFileInput}
									onChange={(event) => void handleAcadeReportSelection(event)}
								/>
							</div>
						</label>
						<div className={styles.smallMeta}>
							Optional. Imported report rows are merged with title-block scan
							rows for mismatch detection and export shaping.
						</div>
						<div className={styles.artifactMeta}>
							<div>
								<strong>Selected File</strong>
								<span>{acadeReportFile?.name || "No report selected"}</span>
							</div>
							<div>
								<strong>Imported Rows</strong>
								<span>{acadeReportRows.length}</span>
							</div>
						</div>
						{acadeReportError ? (
							<div className={styles.warningPanel}>{acadeReportError}</div>
						) : null}
					</section>
				</div>

				<section className={styles.card}>
					<div className={styles.tableHeader}>
						<div>
							<h3 className={styles.cardTitle}>Drawing Rows</h3>
							<div className={styles.smallMeta}>
								Per-row edits here only affect Suite-owned second-pass
								attributes.
							</div>
						</div>
						<div className={styles.selectionActions}>
							<button
								type="button"
								className={styles.secondaryButton}
								onClick={() =>
									setSelectedRelativePaths(
										rows
											.filter((row) => row.fileType === "dwg")
											.map((row) => row.relativePath),
									)
								}
								disabled={rows.length === 0}
							>
								Select All DWGs
							</button>
							<button
								type="button"
								className={styles.secondaryButton}
								onClick={() => setSelectedRelativePaths([])}
								disabled={selectedRelativePaths.length === 0}
							>
								Clear Selection
							</button>
						</div>
					</div>

					<div className={styles.tableWrapper}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th>Sync</th>
									<th>File</th>
									<th>DWGNO</th>
									<th>TITLE3</th>
									<th>Layout</th>
									<th>Issues</th>
									<th>Suite Edits</th>
									<th>Revision Rows</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => {
									const selected = selectedRelativePaths.includes(
										row.relativePath,
									);
									const metadataRow = metadataRowsById.get(row.id);
									const displayIssues = metadataRow?.issues ?? row.issues;
									const displayWarnings = metadataRow?.warnings ?? row.warnings;
									const drawingNumber =
										metadataRow?.drawingNumber ||
										row.drawingNumber ||
										row.currentAttributes.DWGNO ||
										row.filenameDrawingNumber ||
										"—";
									const drawingTitle =
										metadataRow?.title ||
										row.drawingTitle ||
										row.currentAttributes.TITLE3 ||
										row.filenameTitle ||
										"—";
									return (
										<tr key={row.id}>
											<td>
												<input
													type="checkbox"
													checked={selected}
													onChange={() => toggleSelectedPath(row.relativePath)}
													disabled={row.fileType !== "dwg"}
												/>
											</td>
											<td>
												<div className={styles.fileCell}>
													<strong>{row.fileName}</strong>
													<span>{row.relativePath}</span>
												</div>
											</td>
											<td>{drawingNumber}</td>
											<td>{drawingTitle}</td>
											<td>{row.layoutName || "—"}</td>
											<td>
												<div className={styles.issueList}>
													{displayIssues.length > 0 ? (
														displayIssues.map((issue) => (
															<span key={issue} className={styles.issueBadge}>
																{issue}
															</span>
														))
													) : (
														<span className={styles.okBadge}>Clean</span>
													)}
													{displayWarnings.map((warning) => (
														<span
															key={`${row.id}-${warning}`}
															className={styles.issueBadge}
														>
															{warning}
														</span>
													))}
												</div>
											</td>
											<td>
												<div className={styles.editGrid}>
													<label className={styles.inlineField}>
														<span>Scale</span>
														<input
															className={styles.inlineInput}
															value={row.editableFields.scale}
															onChange={(event) =>
																updateEditableField(
																	row.relativePath,
																	"scale",
																	event.target.value,
																)
															}
														/>
													</label>
													<label className={styles.inlineField}>
														<span>Drawn</span>
														<input
															className={styles.inlineInput}
															value={row.editableFields.drawnBy}
															onChange={(event) =>
																updateEditableField(
																	row.relativePath,
																	"drawnBy",
																	event.target.value,
																)
															}
														/>
													</label>
													<label className={styles.inlineField}>
														<span>Drawn Date</span>
														<input
															className={styles.inlineInput}
															value={row.editableFields.drawnDate}
															onChange={(event) =>
																updateEditableField(
																	row.relativePath,
																	"drawnDate",
																	event.target.value,
																)
															}
														/>
													</label>
													<label className={styles.inlineField}>
														<span>Checked</span>
														<input
															className={styles.inlineInput}
															value={row.editableFields.checkedBy}
															onChange={(event) =>
																updateEditableField(
																	row.relativePath,
																	"checkedBy",
																	event.target.value,
																)
															}
														/>
													</label>
													<label className={styles.inlineField}>
														<span>Checked Date</span>
														<input
															className={styles.inlineInput}
															value={row.editableFields.checkedDate}
															onChange={(event) =>
																updateEditableField(
																	row.relativePath,
																	"checkedDate",
																	event.target.value,
																)
															}
														/>
													</label>
													<label className={styles.inlineField}>
														<span>Engineer</span>
														<input
															className={styles.inlineInput}
															value={row.editableFields.engineer}
															onChange={(event) =>
																updateEditableField(
																	row.relativePath,
																	"engineer",
																	event.target.value,
																)
															}
														/>
													</label>
													<label className={styles.inlineField}>
														<span>Engineer Date</span>
														<input
															className={styles.inlineInput}
															value={row.editableFields.engineerDate}
															onChange={(event) =>
																updateEditableField(
																	row.relativePath,
																	"engineerDate",
																	event.target.value,
																)
															}
														/>
													</label>
													<div className={styles.writeMeta}>
														{row.pendingSuiteWrites.length} Suite write
														{row.pendingSuiteWrites.length === 1 ? "" : "s"}
														{" • "}
														{row.pendingAcadeWrites.length} ACADE write
														{row.pendingAcadeWrites.length === 1 ? "" : "s"}
													</div>
													{row.pendingSuiteWrites.length > 0 ? (
														<div className={styles.writeList}>
															{row.pendingSuiteWrites.map((write) => (
																<div
																	key={`${row.id}-${write.attributeTag}-suite`}
																	className={styles.writeItem}
																>
																	<strong>{write.attributeTag}</strong>
																	<span>{write.nextValue || "blank"}</span>
																</div>
															))}
														</div>
													) : null}
													{row.pendingAcadeWrites.length > 0 ? (
														<div className={styles.writeList}>
															{row.pendingAcadeWrites.map((write) => (
																<div
																	key={`${row.id}-${write.attributeTag}-acade`}
																	className={styles.writeItem}
																>
																	<strong>{write.attributeTag}</strong>
																	<span>{write.nextValue || "blank"}</span>
																</div>
															))}
														</div>
													) : null}
												</div>
											</td>
											<td>
												<div className={styles.revisionList}>
													{row.revisionRows.length > 0 ? (
														row.revisionRows.map((revisionRow, index) => (
															<div
																key={`${row.id}-revision-${index}`}
																className={styles.revisionItem}
															>
																<strong>{revisionRow.revision || "—"}</strong>
																<span>
																	{revisionRow.description || "No description"}
																</span>
																<small>
																	{revisionRow.by || "—"} /{" "}
																	{revisionRow.checkedBy || "—"} /{" "}
																	{revisionRow.date || "—"}
																</small>
															</div>
														))
													) : (
														<span className={styles.smallMeta}>
															No revision register rows matched.
														</span>
													)}
												</div>
											</td>
										</tr>
									);
								})}
								{rows.length === 0 ? (
									<tr>
										<td colSpan={8} className={styles.emptyCell}>
											Scan a project root to build the title block sync plan.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</section>
			</div>
		</PageFrame>
	);
}
