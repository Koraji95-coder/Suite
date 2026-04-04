import {
	Download,
	RefreshCw,
	Save,
	Sparkles,
	Upload,
	Wand2,
} from "lucide-react";
import {
	type ChangeEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { PageContextBand } from "@/components/system/PageContextBand";
import { PageFrame } from "@/components/system/PageFrame";
import { ProjectWorkflowLinks } from "@/components/system/ProjectWorkflowLinks";
import {
	type TrustState,
	TrustStateBadge,
} from "@/components/system/TrustStateBadge";
import { useToast } from "@/components/notification-system/ToastProvider";
import { Badge } from "@/components/system/base/Badge";
import { projectSetupActionService } from "@/features/project-setup/actionService";
import type {
	TitleBlockEditableFields,
	TitleBlockSyncArtifacts,
	TitleBlockSyncProfile,
	TitleBlockSyncRow,
	TitleBlockSyncSummary,
} from "@/features/project-setup/types";
import {
	buildProjectDetailHref,
	buildProjectScopedAppHref,
} from "@/lib/projectWorkflowNavigation";
import { logger } from "@/lib/logger";
import {
	type AcadeDocumentReportRow,
	buildDrawingIndexExportRows,
	normalizeTitleBlockSyncRows,
	type ProjectDocumentMetadataRow,
	parseAcadeDocumentReportFile,
} from "@/features/project-documents";
import { projectDrawingProgramService } from "@/services/projectDrawingProgramService";
import {
	type DrawingRevisionRegisterRow,
	projectRevisionRegisterService,
} from "@/services/projectRevisionRegisterService";
import {
	type ProjectIssueSetRecord,
	projectIssueSetService,
} from "@/features/project-workflow/issueSetService";
import { projectReviewDecisionService } from "@/services/projectReviewDecisionService";
import { projectTitleBlockProfileService } from "@/services/projectTitleBlockProfileService";
import { supabase } from "@/supabase/client";
import styles from "./DrawingListManager.module.css";
import { buildWorkbook, type DrawingEntry } from "./drawingListManagerModels";
import { DrawingProgramPanel } from "./DrawingProgramPanel";

interface ProjectOption {
	id: string;
	name: string;
	watchdog_root_path: string | null;
}

interface DrawingListManagerProps {
	preferredProjectId?: string;
	preferredIssueSetId?: string;
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
	wdpPath: "",
	wdtPath: "",
	wdlPath: "",
	wdpText: "",
	wdtText: "",
	wdlText: "",
	wdpState: "starter",
};

function toProfileInput(profile: TitleBlockSyncProfile) {
	return {
		blockName: profile.blockName,
		projectRootPath: profile.projectRootPath,
		acadeProjectFilePath: profile.acadeProjectFilePath,
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
		acadeProjectFilePath: row.acade_project_file_path,
		acadeLine1: row.acade_line1,
		acadeLine2: row.acade_line2,
		acadeLine4: row.acade_line4,
		signerDrawnBy: row.signer_drawn_by,
		signerCheckedBy: row.signer_checked_by,
		signerEngineer: row.signer_engineer,
	};
}

interface DrawingControlStage {
	state: TrustState;
	label: string;
	step: string;
	title: string;
	detail: string;
}

function resolveDrawingControlStage(args: {
	selectedProjectName: string | null;
	packageLabel: string | null;
	hasProject: boolean;
	hasRoot: boolean;
	loading: boolean;
	scanning: boolean;
	previewing: boolean;
	applying: boolean;
	drawingCount: number;
	flaggedCount: number;
	conflictCount: number;
	warningCount: number;
	selectedCount: number;
	acceptedCount: number;
}) {
	const {
		selectedProjectName,
		packageLabel,
		hasProject,
		hasRoot,
		loading,
		scanning,
		previewing,
		applying,
		drawingCount,
		flaggedCount,
		conflictCount,
		warningCount,
		selectedCount,
		acceptedCount,
	} = args;
	const projectLabel = selectedProjectName ?? "this project";
	const deliveryLabel = packageLabel
		? `${projectLabel} â€¢ ${packageLabel}`
		: projectLabel;

	if (loading) {
		return {
			state: "background",
			label: "Loading setup",
			step: "Loading",
			title: `Loading title block review defaults for ${deliveryLabel}.`,
			detail:
				"Project profile, revision register, and tracked root details are still loading.",
		} satisfies DrawingControlStage;
	}

	if (!hasProject) {
		return {
			state: "needs-attention",
			label: "Select project",
			step: "Setup",
			title: "Choose the project you want to prep for issue.",
			detail:
				"Pick the project first so the drawing scan, title block defaults, and export all stay tied to one package flow.",
		} satisfies DrawingControlStage;
	}

	if (!hasRoot) {
		return {
			state: "needs-attention",
			label: "Set tracked root",
			step: "Setup",
			title: `${projectLabel} still needs a tracked root path.`,
			detail:
				"Set the project root before the drawing scan can compare title blocks, revision rows, and ACADE mapping.",
		} satisfies DrawingControlStage;
	}

	if (scanning) {
		return {
			state: "background",
			label: "Scanning drawings",
			step: "Scan",
			title: `Scanning ${deliveryLabel} for drawing rows and title block signals.`,
			detail: "Suite is building the package rows before review and sync.",
		} satisfies DrawingControlStage;
	}

	if (previewing) {
		return {
			state: "background",
			label: "Previewing sync",
			step: "Title block review",
			title: `Previewing the next sync pass for ${deliveryLabel}.`,
			detail:
				"Review the mismatches and selected drawing rows before Suite writes anything back.",
		} satisfies DrawingControlStage;
	}

	if (applying) {
		return {
			state: "background",
			label: "Applying sync",
			step: "Apply",
			title: `Applying the approved title block sync for ${deliveryLabel}.`,
			detail:
				"Suite and ACADE writeback are running for the selected drawings.",
		} satisfies DrawingControlStage;
	}

	if (drawingCount === 0) {
		return {
			state: "background",
			label: "Run first scan",
			step: "Scan",
			title: `Run the first drawing scan for ${deliveryLabel}.`,
			detail:
				"That scan creates the package rows, pulls revision context, and shows which drawings still need review before sync.",
		} satisfies DrawingControlStage;
	}

	if (flaggedCount > 0 || conflictCount > 0 || warningCount > 0) {
		return {
			state: "needs-attention",
			label: "Review mismatches",
			step: "Title block review",
			title: `${flaggedCount} drawing${flaggedCount === 1 ? " still needs" : " still need"} title block review for ${deliveryLabel}.`,
			detail:
				conflictCount > 0
					? `${conflictCount} conflict${conflictCount === 1 ? " still needs" : " still need"} a decision before sync.`
					: acceptedCount > 0
						? `${acceptedCount} drawing${acceptedCount === 1 ? "" : "s"} already have package acceptance recorded.`
						: "Review the flagged rows before moving into the final sync pass.",
		} satisfies DrawingControlStage;
	}

	if (selectedCount === 0) {
		return {
			state: "background",
			label: "Select drawings",
			step: "Title block review",
			title: `${deliveryLabel} is scanned, but no drawings are selected for sync yet.`,
			detail:
				"Pick the DWG rows that belong in the current package before applying the next writeback.",
		} satisfies DrawingControlStage;
	}

	return {
		state: "ready",
		label: "Ready to sync",
		step: "Apply",
		title: `${deliveryLabel} is ready for the next title block sync pass.`,
		detail:
			acceptedCount > 0
				? `${acceptedCount} drawing${acceptedCount === 1 ? "" : "s"} already have package acceptance recorded, and ${selectedCount} drawing${selectedCount === 1 ? "" : "s"} are staged for Suite and ACADE updates.`
				: `${selectedCount} drawing${selectedCount === 1 ? "" : "s"} are staged for Suite and ACADE updates.`,
	} satisfies DrawingControlStage;
}

export function DrawingListManager({
	preferredProjectId,
	preferredIssueSetId,
}: DrawingListManagerProps) {
	const { showToast } = useToast();
	const [projects, setProjects] = useState<ProjectOption[]>([]);
	const [selectedProjectId, setSelectedProjectId] = useState("");
	const [profile, setProfile] = useState<TitleBlockSyncProfile>({
		blockName: "R3P-24x36BORDER&TITLE",
		projectRootPath: "",
		acadeProjectFilePath: "",
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
	const [preferredIssueSet, setPreferredIssueSet] =
		useState<ProjectIssueSetRecord | null>(null);
	const [reviewDecisions, setReviewDecisions] = useState<
		Awaited<ReturnType<typeof projectReviewDecisionService.fetchDecisions>>["data"]
	>([]);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [message, setMessage] = useState<string | null>(null);
	const [selectedRelativePaths, setSelectedRelativePaths] = useState<string[]>(
		[],
	);
	const [pendingTitleBlockReview, setPendingTitleBlockReview] = useState<{
		paths: string[];
		at: string | null;
	} | null>(null);
	const [loadingProjects, setLoadingProjects] = useState(false);
	const [loadingProjectData, setLoadingProjectData] = useState(false);
	const [savingProfile, setSavingProfile] = useState(false);
	const [scanning, setScanning] = useState(false);
	const [previewing, setPreviewing] = useState(false);
	const [applying, setApplying] = useState(false);
	const acadeReportInputRef = useRef<HTMLInputElement | null>(null);
	const appliedIssueSetRef = useRef<string | null>(null);
	const autoPendingScanRef = useRef<string | null>(null);

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
	const issueSetMetadataRows = useMemo(() => {
		if (!preferredIssueSet) {
			return metadataRows;
		}
		const scopedPaths = new Set(preferredIssueSet.selectedDrawingPaths);
		return metadataRows.filter((row) => scopedPaths.has(row.relativePath));
	}, [metadataRows, preferredIssueSet]);
	const acceptedTitleBlockIds = useMemo(() => {
		if (!preferredIssueSet?.id) {
			return new Set<string>();
		}
		return new Set(
			reviewDecisions
				.filter(
					(decision) =>
						decision.itemType === "title-block" &&
						decision.status === "accepted" &&
						(decision.issueSetId || null) === preferredIssueSet.id,
				)
				.map((decision) => decision.itemId),
		);
	}, [preferredIssueSet?.id, reviewDecisions]);
	const acceptedTitleBlockCount = useMemo(
		() =>
			issueSetMetadataRows.filter((row) =>
				acceptedTitleBlockIds.has(`title-block:${row.id}`),
			).length,
		[acceptedTitleBlockIds, issueSetMetadataRows],
	);
	const packageReviewCount = useMemo(
		() =>
			issueSetMetadataRows.filter(
				(row) =>
					(row.reviewState !== "ready" ||
						row.issues.length > 0 ||
						row.warnings.length > 0) &&
					!acceptedTitleBlockIds.has(`title-block:${row.id}`),
			).length,
		[acceptedTitleBlockIds, issueSetMetadataRows],
	);
	const packageConflictCount = useMemo(
		() =>
			issueSetMetadataRows.filter(
				(row) =>
					row.hasWdTbConflict &&
					!acceptedTitleBlockIds.has(`title-block:${row.id}`),
			).length,
		[acceptedTitleBlockIds, issueSetMetadataRows],
	);
	const drawingCount = useMemo(
		() =>
			summary.drawingFiles > 0
				? summary.drawingFiles
				: rows.filter((row) => row.fileType === "dwg").length,
		[rows, summary.drawingFiles],
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
					setSelectedProjectId((current) => {
						if (
							preferredProjectId &&
							nextProjects.some((project) => project.id === preferredProjectId)
						) {
							return preferredProjectId;
						}
						if (
							current &&
							nextProjects.some((project) => project.id === current)
						) {
							return current;
						}
						return nextProjects[0]?.id ?? "";
					});
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
	}, [preferredProjectId, showToast]);

	useEffect(() => {
		if (!selectedProjectId) {
			setRevisionEntries([]);
			setReviewDecisions([]);
			return;
		}
		let cancelled = false;

		const loadProjectData = async () => {
			setLoadingProjectData(true);
			setMessage(null);
			try {
				const defaults = {
					projectRootPath: selectedProject?.watchdog_root_path || null,
				};
				const [profileResult, revisionsResult, decisionsResult] =
					await Promise.all([
					projectTitleBlockProfileService.fetchProfile(
						selectedProjectId,
						defaults,
					),
					projectRevisionRegisterService.fetchEntries(selectedProjectId),
					projectReviewDecisionService.fetchDecisions(selectedProjectId),
				]);

				if (cancelled) return;

				setProfile(mapProfileRowToState(profileResult.data));
				setRevisionEntries(revisionsResult.data);
				setWarnings(
					[
						profileResult.error?.message || "",
						revisionsResult.error?.message || "",
						decisionsResult.error?.message || "",
					].filter(Boolean),
				);
				setReviewDecisions(decisionsResult.data);
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

	useEffect(() => {
		if (!selectedProjectId || !preferredIssueSetId) {
			setPreferredIssueSet(null);
			appliedIssueSetRef.current = null;
			return;
		}

		let cancelled = false;
		const loadIssueSet = async () => {
			const result = await projectIssueSetService.fetchIssueSet(
				selectedProjectId,
				preferredIssueSetId,
			);
			if (cancelled) {
				return;
			}
			setPreferredIssueSet(result.data);
		};

		void loadIssueSet();
		return () => {
			cancelled = true;
		};
	}, [preferredIssueSetId, selectedProjectId]);

	useEffect(() => {
		if (!preferredIssueSet || rows.length === 0) {
			return;
		}
		if (appliedIssueSetRef.current === preferredIssueSet.id) {
			return;
		}

		const available = new Set(rows.map((row) => row.relativePath));
		const nextSelected = preferredIssueSet.selectedDrawingPaths.filter((path) =>
			available.has(path),
		);
		if (nextSelected.length > 0) {
			setSelectedRelativePaths(nextSelected);
		}
		appliedIssueSetRef.current = preferredIssueSet.id;
	}, [preferredIssueSet, rows]);

	useEffect(() => {
		if (!selectedProjectId) {
			setPendingTitleBlockReview(null);
			autoPendingScanRef.current = null;
		}
	}, [selectedProjectId]);

	const buildPayload = useCallback((nextRows?: TitleBlockSyncRow[]) => {
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
	}, [profile, revisionEntries, rows, selectedProjectId, selectedRelativePaths]);

	const saveProfile = useCallback(async () => {
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
	}, [selectedProjectId, profile, showToast]);

	const clearPendingTitleBlockReview = async () => {
		if (!selectedProjectId) {
			setPendingTitleBlockReview(null);
			return;
		}
		const result = await projectDrawingProgramService.fetchProgram(selectedProjectId);
		const program = result.data;
		if (!program) {
			setPendingTitleBlockReview(null);
			return;
		}
		const saveError = await projectDrawingProgramService.saveProgram({
			...program,
			pendingTitleBlockSyncPaths: [],
			pendingTitleBlockSyncAt: null,
		});
		if (saveError) {
			throw saveError;
		}
		setPendingTitleBlockReview(null);
	};

	const handleScan = useCallback(async (options?: {
		preferredSelectedRelativePaths?: string[];
		stagedMessage?: string | null;
	}) => {
		setScanning(true);
		setMessage(null);
		try {
			await saveProfile();
			const response = await projectSetupActionService.scan(buildPayload([]));
			if (!response.success || !response.data) {
				throw new Error(response.message || "Title block scan failed.");
			}

			setRows(response.data.drawings);
			setSummary(response.data.summary);
			setArtifacts(response.data.artifacts);
			setWarnings(response.warnings || []);
			const availableRelativePaths = new Set(
				response.data.drawings
					.filter((row) => row.fileType === "dwg")
					.map((row) => row.relativePath),
			);
			const nextSelected =
				options?.preferredSelectedRelativePaths?.filter((path) =>
					availableRelativePaths.has(path),
				) ??
				response.data.drawings
					.filter((row) => row.fileType === "dwg")
					.map((row) => row.relativePath);
			setSelectedRelativePaths(nextSelected);
			setMessage(
				options?.stagedMessage && nextSelected.length > 0
					? options.stagedMessage
					: response.message,
			);
		} catch (error) {
			const nextMessage =
				error instanceof Error ? error.message : "Title block scan failed.";
			setMessage(nextMessage);
			showToast("error", nextMessage);
		} finally {
			setScanning(false);
		}
	}, [buildPayload, saveProfile, showToast]);

	const handlePreview = async () => {
		setPreviewing(true);
		setMessage(null);
		try {
			const response = await projectSetupActionService.preview(buildPayload());
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
			const response = await projectSetupActionService.apply(buildPayload());
			if (!response.success || !response.data) {
				throw new Error(response.message || "Title block apply failed.");
			}
			setRows(response.data.drawings);
			setSummary(response.data.summary);
			setArtifacts(response.data.artifacts);
			setWarnings(response.warnings || []);
			await clearPendingTitleBlockReview().catch((clearError) => {
				logger.warn(
					"Title block apply completed, but the pending drawing-program follow-up marker could not be cleared.",
					"DrawingListManager",
					clearError,
				);
			});
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

	useEffect(() => {
		if (!pendingTitleBlockReview?.paths.length || !selectedProjectId) {
			return;
		}
		const token = `${selectedProjectId}:${pendingTitleBlockReview.at || pendingTitleBlockReview.paths.join("|")}`;
		const normalizedPaths = pendingTitleBlockReview.paths
			.map((path) => path.replace(/\\/g, "/"))
			.filter(Boolean);
		if (rows.length > 0) {
			const available = new Set(rows.map((row) => row.relativePath));
			const nextSelected = normalizedPaths.filter((path) => available.has(path));
			if (nextSelected.length > 0) {
				setSelectedRelativePaths(nextSelected);
			}
			return;
		}
		if (!profile.projectRootPath?.trim()) {
			return;
		}
		if (loadingProjectData || scanning || previewing || applying) {
			return;
		}
		if (autoPendingScanRef.current === token) {
			return;
		}
		autoPendingScanRef.current = token;
		void handleScan({
			preferredSelectedRelativePaths: normalizedPaths,
			stagedMessage:
				normalizedPaths.length === 1
					? "Review pending title block sync for the drawing-program changes."
					: `Review pending title block sync for ${normalizedPaths.length} drawing-program changes.`,
		});
	}, [
		applying,
		handleScan,
		loadingProjectData,
		pendingTitleBlockReview,
		previewing,
		profile.projectRootPath,
		rows,
		scanning,
		selectedProjectId,
	]);

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
	const reviewCount = preferredIssueSet
		? packageReviewCount
		: Math.max(summary.flaggedFiles, metadataFlaggedCount);
	const hasScanRows = rows.length > 0;
	const showPreviewActions = hasScanRows || previewing || applying;
	const showContextStats =
		hasScanRows ||
		reviewCount > 0 ||
		summary.wdTbConflictCount > 0 ||
		selectedCount > 0 ||
		scanning ||
		previewing ||
		applying;
	const showGeneratedMapping =
		Boolean(selectedProjectId) &&
		(hasScanRows ||
			Boolean(artifacts.wdpPath) ||
			Boolean(artifacts.wdtPath) ||
			Boolean(artifacts.wdlPath) ||
			Boolean(artifacts.wdpText) ||
			Boolean(artifacts.wdtText) ||
			Boolean(artifacts.wdlText));
	const showImportPanel = Boolean(selectedProjectId);
	const stage = resolveDrawingControlStage({
		selectedProjectName: selectedProject?.name ?? null,
		packageLabel: preferredIssueSet?.issueTag ?? null,
		hasProject: Boolean(selectedProjectId),
		hasRoot: Boolean(profile.projectRootPath?.trim()),
		loading: loadingProjects || loadingProjectData,
		scanning,
		previewing,
		applying,
		drawingCount,
		flaggedCount: reviewCount,
		conflictCount: preferredIssueSet
			? packageConflictCount
			: summary.wdTbConflictCount,
		warningCount: warnings.length,
		selectedCount,
		acceptedCount: acceptedTitleBlockCount,
	});
	const scanSummaryFacts = [
		{ label: "Drawings", value: drawingCount },
		{
			label:
				reviewCount > 0
					? "Need title block review"
					: "Selected for sync",
			value: reviewCount > 0 ? reviewCount : selectedCount,
		},
		...(preferredIssueSet
			? [
					{
						label: "Package scope",
						value: `${preferredIssueSet.issueTag} â€¢ ${
							preferredIssueSet.selectedDrawingPaths.length
						} drawing${
							preferredIssueSet.selectedDrawingPaths.length === 1 ? "" : "s"
						}`,
					},
					...(acceptedTitleBlockCount > 0
						? [
								{
									label: "Accepted for package",
									value: acceptedTitleBlockCount,
								},
							]
						: []),
				]
			: []),
		...(summary.wdTbConflictCount > 0
			? [{ label: "Conflicts", value: summary.wdTbConflictCount }]
			: []),
	];
	const setupChecklist = [
		{
			label: "Project",
			ready: Boolean(selectedProjectId),
			value: selectedProject?.name ?? "Choose the project package first.",
		},
		{
			label: "Tracked root",
			ready: Boolean(profile.projectRootPath?.trim()),
			value:
				profile.projectRootPath?.trim() ||
				"Set the root path Suite should scan for this package.",
		},
		{
			label: "Revision register",
			ready: !loadingProjectData && revisionEntries.length > 0,
			value: loadingProjectData
				? "Loading project revision rowsâ€¦"
				: revisionEntries.length > 0
					? `${revisionEntries.length} revision register entr${
							revisionEntries.length === 1 ? "y" : "ies"
						} ready.`
			: "No revision rows loaded yet.",
		},
	];
	const workflowLinks = selectedProjectId
		? [
				{
					label: "Setup",
					to: buildProjectDetailHref(selectedProjectId, "setup"),
				},
				{
					label: "Review",
					to: buildProjectDetailHref(selectedProjectId, "review", {
						issueSet: preferredIssueSet?.id ?? null,
					}),
				},
				{
					label: "Issue Sets",
					to: buildProjectDetailHref(selectedProjectId, "issue-sets", {
						issueSet: preferredIssueSet?.id ?? null,
					}),
				},
				{
					label: "Watchdog",
					to: buildProjectScopedAppHref(
						"/app/developer/control/watchdog",
						selectedProjectId,
					),
				},
			]
		: [];

	return (
		<PageFrame maxWidth="full">
			<PageContextBand
				eyebrow="Project title block review"
				summary={
					<div className={styles.contextCopy}>
						<p className={styles.contextTitle}>{stage.title}</p>
						<p className={styles.contextSummary}>{stage.detail}</p>
					</div>
				}
				meta={
					<div className={styles.contextMeta}>
						<TrustStateBadge state={stage.state} label={stage.label} />
						<Badge variant="outline" color="default">
							{selectedProject?.name ?? "No project selected"}
						</Badge>
						{preferredIssueSet ? (
							<Badge variant="soft" color="warning">
								{preferredIssueSet.issueTag}
							</Badge>
						) : null}
						<Badge variant="soft" color="accent">
							{stage.step}
						</Badge>
					</div>
				}
				actions={
					<div className={styles.toolbar}>
						<button
							type="button"
							className={styles.secondaryButton}
							onClick={() => void handleScan()}
							disabled={!canRun || scanning}
						>
							<RefreshCw size={14} />
							{scanning ? "Scanningâ€¦" : "Scan Project"}
						</button>
						{showPreviewActions ? (
							<>
								<button
									type="button"
									className={styles.secondaryButton}
									onClick={() => void handlePreview()}
									disabled={!canRun || rows.length === 0 || previewing}
								>
									<Sparkles size={14} />
									{previewing ? "Previewingâ€¦" : "Preview Sync"}
								</button>
								<button
									type="button"
									className={styles.primaryButton}
									onClick={() => void handleApply()}
									disabled={!canRun || rows.length === 0 || applying}
								>
									<Wand2 size={14} />
									{applying ? "Applyingâ€¦" : "Apply Sync"}
								</button>
							</>
						) : null}
					</div>
				}
			>
				{showContextStats ? (
					<div className={styles.contextFacts}>
						{scanSummaryFacts.map((fact) => (
							<div key={fact.label} className={styles.contextFact}>
								<span className={styles.contextFactLabel}>{fact.label}</span>
								<strong className={styles.contextFactValue}>{fact.value}</strong>
							</div>
						))}
					</div>
				) : null}
				<ProjectWorkflowLinks links={workflowLinks} />
			</PageContextBand>
			<div className={styles.stack}>
				{message ? <div className={styles.message}>{message}</div> : null}
				{warnings.length > 0 ? (
					<div className={styles.warningPanel}>
						{warnings.map((warning) => (
							<div key={warning}>{warning}</div>
						))}
					</div>
				) : null}
				{pendingTitleBlockReview?.paths.length ? (
					<div className={styles.warningPanel}>
						<div>
							Review pending title block sync for{" "}
							{pendingTitleBlockReview.paths.length} drawing
							{pendingTitleBlockReview.paths.length === 1 ? "" : "s"} staged by
							the electrical drawing program.
						</div>
						<div className={styles.selectionActions}>
							<button
								type="button"
								className={styles.secondaryButton}
								onClick={() =>
									void handleScan({
										preferredSelectedRelativePaths:
											pendingTitleBlockReview.paths,
										stagedMessage:
											pendingTitleBlockReview.paths.length === 1
												? "Review pending title block sync for the drawing-program changes."
												: `Review pending title block sync for ${pendingTitleBlockReview.paths.length} drawing-program changes.`,
									})
								}
								disabled={!canRun || scanning}
							>
								<RefreshCw size={14} />
								Refresh pending review
							</button>
							<button
								type="button"
								className={styles.secondaryButton}
								onClick={() =>
									void clearPendingTitleBlockReview().catch((error) => {
										const nextMessage =
											error instanceof Error
												? error.message
												: "Unable to clear the pending title block review.";
										showToast("error", nextMessage);
									})
								}
							>
								Clear pending review
							</button>
						</div>
					</div>
				) : null}

				<div className={styles.configGrid}>
					<section className={styles.card}>
						<div className={styles.cardHeaderRow}>
							<h3 className={styles.cardTitle}>Scan setup</h3>
						</div>
						<label className={styles.field}>
							<span className={styles.fieldLabel}>Project</span>
							<select
								className={styles.input}
								name="drawing-list-project"
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
								name="drawing-list-project-root-path"
								value={profile.projectRootPath || ""}
								onChange={(event) =>
									updateProfile("projectRootPath", event.target.value)
								}
								placeholder="C:\\Projects\\MyProject"
							/>
						</label>
						<div className={styles.setupChecklist}>
							{setupChecklist.map((item) => (
								<div
									key={item.label}
									className={`${styles.setupChecklistItem} ${
										item.ready
											? styles.setupChecklistItemReady
											: styles.setupChecklistItemPending
									}`}
								>
									<div className={styles.setupChecklistLabel}>{item.label}</div>
									<div className={styles.setupChecklistValue}>{item.value}</div>
								</div>
							))}
						</div>
					</section>

					<section className={styles.card}>
						<div className={styles.cardHeaderRow}>
							<div>
								<h3 className={styles.cardTitle}>ACADE and title block defaults</h3>
								<div className={styles.smallMeta}>
									Project-scoped defaults that feed the starter .wdp/.wdt/.wdl
									support files and the title block review lane.
								</div>
							</div>
							{selectedProjectId ? (
								<button
									type="button"
									className={styles.secondaryButton}
									onClick={() => void saveProfile()}
									disabled={!selectedProjectId || savingProfile}
								>
									<Save size={14} />
									{savingProfile ? "Savingâ€¦" : "Save defaults"}
								</button>
							) : null}
						</div>
						{selectedProjectId ? (
							<div className={styles.formGrid}>
								<label className={styles.field}>
									<span className={styles.fieldLabel}>Block Name</span>
									<input
										className={styles.input}
										name="drawing-list-block-name"
										value={profile.blockName}
										onChange={(event) =>
											updateProfile("blockName", event.target.value)
										}
									/>
								</label>
								<label className={styles.field}>
									<span className={styles.fieldLabel}>Client / Utility</span>
									<input
										className={styles.input}
										name="drawing-list-acade-line1"
										value={profile.acadeLine1}
										onChange={(event) =>
											updateProfile("acadeLine1", event.target.value)
										}
										placeholder="Client / Utility"
									/>
								</label>
								<label className={styles.field}>
									<span className={styles.fieldLabel}>Facility / Site</span>
									<input
										className={styles.input}
										name="drawing-list-acade-line2"
										value={profile.acadeLine2}
										onChange={(event) =>
											updateProfile("acadeLine2", event.target.value)
										}
										placeholder="Facility / Site"
									/>
								</label>
								<label className={styles.field}>
									<span className={styles.fieldLabel}>Project number</span>
									<input
										className={styles.input}
										name="drawing-list-acade-line4"
										value={profile.acadeLine4}
										onChange={(event) =>
											updateProfile("acadeLine4", event.target.value)
										}
										placeholder="Project Number"
									/>
								</label>
								<label className={styles.field}>
									<span className={styles.fieldLabel}>
										ACADE project file (.wdp)
									</span>
									<input
										className={styles.input}
										name="drawing-list-acade-project-file-path"
										value={profile.acadeProjectFilePath || ""}
										onChange={(event) =>
											updateProfile(
												"acadeProjectFilePath",
												event.target.value,
											)
										}
										placeholder="C:\\Projects\\MyProject\\MyProject.wdp"
									/>
								</label>
								<label className={styles.field}>
									<span className={styles.fieldLabel}>Drawn By Default</span>
									<input
										className={styles.input}
										name="drawing-list-signer-drawn-by"
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
										name="drawing-list-signer-checked-by"
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
										name="drawing-list-signer-engineer"
										value={profile.signerEngineer}
										onChange={(event) =>
											updateProfile("signerEngineer", event.target.value)
										}
									/>
								</label>
							</div>
						) : (
							<div className={styles.cardPlaceholder}>
								Choose a project first to load the saved title block defaults
								for this package.
							</div>
						)}
						<div className={styles.artifactMeta}>
							<div>
								<strong>Client / Utility</strong>
								<span>ACADE TITLE1 / LINE1</span>
							</div>
							<div>
								<strong>Facility / Site</strong>
								<span>ACADE TITLE2 / LINE2</span>
							</div>
							<div>
								<strong>Project number</strong>
								<span>ACADE PROJ / LINE4</span>
							</div>
							<div>
								<strong>Drawing title</strong>
								<span>Comes from each drawing row and TITLE3 / DWGDESC.</span>
							</div>
						</div>
						<div className={styles.cardFootnote}>
							Saved defaults feed the ACADE support-file preview and title block
							review lane. They do not overwrite issued drawings until an
							approved sync is applied.
						</div>
					</section>

				</div>

				<DrawingProgramPanel
					projectId={selectedProjectId}
					projectName={selectedProject?.name ?? null}
					profile={profile}
					pendingTitleBlockSyncOverride={pendingTitleBlockReview}
					onPendingTitleBlockSyncChange={setPendingTitleBlockReview}
					onStageTitleBlockReview={async (relativePaths) => {
						if (!relativePaths.length) {
							return;
						}
						await handleScan({
							preferredSelectedRelativePaths: relativePaths,
							stagedMessage:
								relativePaths.length === 1
									? "Review pending title block sync for the drawing-program changes."
									: `Review pending title block sync for ${relativePaths.length} drawing-program changes.`,
						});
					}}
				/>

				<section className={styles.card}>
					<div className={styles.tableHeader}>
						<div>
							<h3 className={styles.cardTitle}>Title block review rows</h3>
							<div className={styles.smallMeta}>
								Per-row edits here only affect the title block review lane and
								Suite-owned second-pass attributes.
							</div>
						</div>
						<div className={styles.selectionActions}>
							<button
								type="button"
								className={styles.secondaryButton}
								onClick={() => void exportRows()}
								disabled={rows.length === 0}
							>
								<Download size={14} />
								Export workbook
							</button>
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
									const acceptedForPackage = acceptedTitleBlockIds.has(
										`title-block:${row.id}`,
									);
									const displayIssues = metadataRow?.issues ?? row.issues;
									const displayWarnings = metadataRow?.warnings ?? row.warnings;
									const drawingNumber =
										metadataRow?.drawingNumber ||
										row.drawingNumber ||
										row.currentAttributes.DWGNO ||
										row.filenameDrawingNumber ||
										"â€”";
									const drawingTitle =
										metadataRow?.title ||
										row.drawingTitle ||
										row.currentAttributes.TITLE3 ||
										row.filenameTitle ||
										"â€”";
									return (
										<tr key={row.id}>
											<td>
												<input
													type="checkbox"
													name={`drawing-list-selected-${row.id}`}
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
											<td>{row.layoutName || "â€”"}</td>
											<td>
												<div className={styles.issueList}>
													{acceptedForPackage ? (
														<span className={styles.packageBadge}>
															Accepted for package
														</span>
													) : null}
													{displayIssues.length > 0 ? (
														displayIssues.map((issue) => (
															<span key={issue} className={styles.issueBadge}>
																{issue}
															</span>
														))
													) : !acceptedForPackage ? (
														<span className={styles.okBadge}>Clean</span>
													) : null}
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
															name={`drawing-list-scale-${row.id}`}
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
															name={`drawing-list-drawn-by-${row.id}`}
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
															name={`drawing-list-drawn-date-${row.id}`}
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
															name={`drawing-list-checked-by-${row.id}`}
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
															name={`drawing-list-checked-date-${row.id}`}
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
															name={`drawing-list-engineer-${row.id}`}
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
															name={`drawing-list-engineer-date-${row.id}`}
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
														{" â€¢ "}
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
																<strong>{revisionRow.revision || "â€”"}</strong>
																<span>
																	{revisionRow.description || "No description"}
																</span>
																<small>
																	{revisionRow.by || "â€”"} /{" "}
																	{revisionRow.checkedBy || "â€”"} /{" "}
																	{revisionRow.date || "â€”"}
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

				{showGeneratedMapping || showImportPanel ? (
					<div className={styles.secondaryGrid}>
						{showGeneratedMapping ? (
							<section className={styles.card}>
								<div className={styles.cardHeaderRow}>
									<div>
										<h3 className={styles.cardTitle}>ACADE support artifacts</h3>
										<div className={styles.smallMeta}>
											Suite derives a project-scoped .wdp, .wdt, and .wdl from
											the current defaults. Existing .wdp files are detected and
											previewed instead of treated like blank setup.
										</div>
									</div>
								</div>
								<div className={styles.artifactMeta}>
									<div>
										<strong>.wdp</strong>
										<span>
											{artifacts.wdpPath ||
												profile.acadeProjectFilePath ||
												"Starter path will be derived from the project root"}
										</span>
										{artifacts.wdpState ? (
											<span>
												{artifacts.wdpState === "existing"
													? "Existing ACADE project definition detected."
													: "Starter ACADE project scaffold from current defaults."}
											</span>
										) : null}
									</div>
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
										<h4 className={styles.subTitle}>.WDP Preview</h4>
										<pre className={styles.codeBlock}>
											{artifacts.wdpText ||
												"*[1]Project Name"}
										</pre>
									</div>
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
								<div className={styles.cardFootnote}>
									Workflow: confirm the project defaults, review the starter or
									existing .wdp/.wdt/.wdl artifacts, run the live title block
									scan, and only then use an ACADE report as verification before
									applying updates.
								</div>
							</section>
						) : null}

						{showImportPanel ? (
							<section className={styles.card}>
								<div className={styles.cardHeaderRow}>
									<div>
										<h3 className={styles.cardTitle}>ACADE report import</h3>
										<div className={styles.smallMeta}>
											Optional verification from an exported ACADE report.
											Suite still treats the live DWG/title block scan as the
											primary drawing truth.
										</div>
									</div>
								</div>
								<label className={styles.field}>
									<span className={styles.fieldLabel}>ACADE report</span>
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
											name="drawing-list-acade-report"
											accept=".xlsx,.csv,.tsv"
											className={styles.hiddenFileInput}
											onChange={(event) => void handleAcadeReportSelection(event)}
										/>
									</div>
								</label>
								<div className={styles.artifactMeta}>
									<div>
										<strong>Selected file</strong>
										<span>{acadeReportFile?.name || "No report selected"}</span>
									</div>
									<div>
										<strong>Imported rows</strong>
										<span>{acadeReportRows.length}</span>
									</div>
								</div>
								{acadeReportError ? (
									<div className={styles.warningPanel}>{acadeReportError}</div>
								) : null}
							</section>
						) : null}
					</div>
				) : null}
			</div>
		</PageFrame>
	);
}
