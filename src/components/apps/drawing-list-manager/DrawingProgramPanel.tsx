import { RefreshCw, Upload, Wand2 } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { logger } from "@/lib/logger";
import {
	type ProjectDrawingProgramPlan,
	type ProjectDrawingProgramRecord,
	type ProjectDrawingProvisionReceipt,
	type ProjectDrawingStandardSnapshot,
	detectWorkbookDrift,
	projectDrawingProgramService,
} from "@/services/projectDrawingProgramService";
import { projectDrawingProgramRuntimeService } from "@/services/projectDrawingProgramRuntimeService";
import type { TitleBlockSyncProfile } from "@/services/titleBlockSyncService";
import { watchdogService, type WatchdogCollectorEvent } from "@/services/watchdogService";
import styles from "./DrawingListManager.module.css";

interface DrawingProgramPanelProps {
	projectId: string;
	projectName: string | null;
	profile: TitleBlockSyncProfile;
	pendingTitleBlockSyncOverride?: {
		paths: string[];
		at: string | null;
	} | null;
	onPendingTitleBlockSyncChange?: (pending: {
		paths: string[];
		at: string | null;
	} | null) => void;
	onStageTitleBlockReview?: (relativePaths: string[]) => Promise<void> | void;
}

function createClientId(prefix = "drawing-program-receipt") {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function DrawingProgramPanel({
	projectId,
	projectName,
	profile,
	pendingTitleBlockSyncOverride,
	onPendingTitleBlockSyncChange,
	onStageTitleBlockReview,
}: DrawingProgramPanelProps) {
	const { showToast } = useToast();
	const standardInputRef = useRef<HTMLInputElement | null>(null);
	const workbookInputRef = useRef<HTMLInputElement | null>(null);
	const [loading, setLoading] = useState(false);
	const [importingStandard, setImportingStandard] = useState(false);
	const [syncingAcade, setSyncingAcade] = useState(false);
	const [applyingPlan, setApplyingPlan] = useState(false);
	const [standardSnapshot, setStandardSnapshot] =
		useState<ProjectDrawingStandardSnapshot | null>(null);
	const [program, setProgram] = useState<ProjectDrawingProgramRecord | null>(null);
	const [receipts, setReceipts] = useState<ProjectDrawingProvisionReceipt[]>([]);
	const [stagedPlan, setStagedPlan] = useState<ProjectDrawingProgramPlan | null>(
		null,
	);
	const [watchdogEvents, setWatchdogEvents] = useState<WatchdogCollectorEvent[]>(
		[],
	);
	const [insertStandardRowId, setInsertStandardRowId] = useState("");
	const [insertBeforeRowId, setInsertBeforeRowId] = useState("");
	const [insertCount, setInsertCount] = useState("1");
	const [message, setMessage] = useState<string | null>(null);

	const projectRootPath = profile.projectRootPath?.trim() || "";
	const selectedProgram = stagedPlan?.updatedProgram ?? program;
	const standardRows = standardSnapshot?.catalogEntries ?? [];
	const latestReceipt = receipts[0] ?? null;
	const driftEvent = useMemo(
		() => detectWorkbookDrift(selectedProgram, watchdogEvents),
		[selectedProgram, watchdogEvents],
	);
	const hasBlockedActions = Boolean(
		stagedPlan?.fileActions.some((action) => action.blocked),
	);

	useEffect(() => {
		if (!projectId) {
			setStandardSnapshot(null);
			setProgram(null);
			setReceipts([]);
			setStagedPlan(null);
			setWatchdogEvents([]);
			return;
		}
		let cancelled = false;
		const load = async () => {
			setLoading(true);
			setMessage(null);
			const [standardResult, programResult, receiptResult, eventsResult] =
				await Promise.all([
					projectDrawingProgramService.fetchStandardSnapshot(projectId),
					projectDrawingProgramService.fetchProgram(projectId),
					projectDrawingProgramService.fetchReceipts(projectId),
					watchdogService
						.getProjectEvents(projectId, {
							limit: 80,
							sinceMs: Date.now() - 14 * 24 * 60 * 60 * 1000,
						})
						.catch(() => ({
							ok: false,
							events: [],
							count: 0,
							afterEventId: 0,
							lastEventId: 0,
							nextEventId: 0,
						})),
				]);
			if (cancelled) {
				return;
			}
			setStandardSnapshot(standardResult.data);
			setProgram(programResult.data);
			setReceipts(receiptResult.data);
			setWatchdogEvents(eventsResult.events || []);
			setStagedPlan(null);
		};
		void load().finally(() => {
			if (!cancelled) {
				setLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	useEffect(() => {
		if (!insertStandardRowId && standardSnapshot?.catalogEntries.length) {
			setInsertStandardRowId(standardSnapshot.catalogEntries[0]?.id ?? "");
		}
	}, [insertStandardRowId, standardSnapshot]);

	useEffect(() => {
		onPendingTitleBlockSyncChange?.(
			program?.pendingTitleBlockSyncPaths.length
				? {
						paths: program.pendingTitleBlockSyncPaths,
						at: program.pendingTitleBlockSyncAt,
				  }
				: null,
		);
	}, [
		onPendingTitleBlockSyncChange,
		program?.pendingTitleBlockSyncAt,
		program?.pendingTitleBlockSyncPaths,
	]);

	useEffect(() => {
		if (!program || !pendingTitleBlockSyncOverride) {
			return;
		}
		const normalizedOverridePaths = pendingTitleBlockSyncOverride.paths
			.map((entry) => entry.replace(/\\/g, "/"))
			.filter(Boolean);
		const currentPaths = program.pendingTitleBlockSyncPaths
			.map((entry) => entry.replace(/\\/g, "/"))
			.filter(Boolean);
		const samePaths =
			normalizedOverridePaths.length === currentPaths.length &&
			normalizedOverridePaths.every((entry, index) => entry === currentPaths[index]);
		if (
			samePaths &&
			(pendingTitleBlockSyncOverride.at || null) ===
				(program.pendingTitleBlockSyncAt || null)
		) {
			return;
		}
		setProgram({
			...program,
			pendingTitleBlockSyncPaths: normalizedOverridePaths,
			pendingTitleBlockSyncAt: pendingTitleBlockSyncOverride.at || null,
		});
	}, [pendingTitleBlockSyncOverride, program]);

	const collectAffectedTitleBlockPaths = (
		beforeProgram: ProjectDrawingProgramRecord,
		afterProgram: ProjectDrawingProgramRecord,
		plan: ProjectDrawingProgramPlan,
	) => {
		const changedRowIds = new Set<string>();
		for (const change of plan.changes) {
			if (!change.rowId) {
				continue;
			}
			if (change.type === "reorder" || change.type === "warning") {
				continue;
			}
			changedRowIds.add(change.rowId);
		}
		for (const action of plan.fileActions) {
			changedRowIds.add(action.rowId);
		}
		const beforeById = new Map(beforeProgram.rows.map((row) => [row.id, row]));
		const nextPaths = new Set<string>();
		for (const row of afterProgram.rows) {
			if (!changedRowIds.has(row.id) || row.status === "inactive") {
				continue;
			}
			if (row.dwgRelativePath) {
				nextPaths.add(row.dwgRelativePath.replace(/\\/g, "/"));
				continue;
			}
			const previous = beforeById.get(row.id);
			if (previous?.dwgRelativePath) {
				nextPaths.add(previous.dwgRelativePath.replace(/\\/g, "/"));
			}
		}
		return Array.from(nextPaths);
	};

	const handleImportStandard = async (
		event: ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || !projectId) {
			return;
		}
		setImportingStandard(true);
		setMessage(null);
		try {
			const result = await projectDrawingProgramService.importStandardWorkbook({
				projectId,
				fileName: file.name,
				arrayBuffer: await file.arrayBuffer(),
			});
			if (!result.data) {
				throw result.error || new Error("Unable to import drawing standard.");
			}
			setStandardSnapshot(result.data);
			setInsertStandardRowId(result.data.catalogEntries[0]?.id ?? "");
			setMessage(`Imported drawing standard '${file.name}'.`);
		} catch (error) {
			const nextMessage =
				error instanceof Error
					? error.message
					: "Unable to import drawing standard.";
			showToast("error", nextMessage);
			setMessage(nextMessage);
		} finally {
			setImportingStandard(false);
		}
	};

	const handlePreviewBootstrap = () => {
		if (!program || !standardSnapshot) {
			return;
		}
		try {
			const plan = projectDrawingProgramService.buildBootstrapPlan({
				projectId,
				program,
				standardSnapshot,
				projectNumber: profile.acadeLine4,
			});
			setStagedPlan(plan);
			setMessage("Starter drawing program is staged for review.");
		} catch (error) {
			const nextMessage =
				error instanceof Error ? error.message : "Unable to stage bootstrap.";
			showToast("error", nextMessage);
			setMessage(nextMessage);
		}
	};

	const handlePreviewInsert = () => {
		if (!program || !standardSnapshot || !insertStandardRowId) {
			return;
		}
		try {
			const plan = projectDrawingProgramService.buildInsertPlan({
				projectId,
				program,
				standardSnapshot,
				standardRowId: insertStandardRowId,
				projectNumber: profile.acadeLine4,
				insertBeforeRowId: insertBeforeRowId || null,
				count: Number(insertCount || 1),
			});
			setStagedPlan(plan);
			setMessage("Drawing insertion is staged for review.");
		} catch (error) {
			const nextMessage =
				error instanceof Error ? error.message : "Unable to stage drawing insertion.";
			showToast("error", nextMessage);
			setMessage(nextMessage);
		}
	};

	const handlePreviewDeactivate = (rowId: string) => {
		if (!program) {
			return;
		}
		try {
			const plan = projectDrawingProgramService.buildDeactivatePlan({
				projectId,
				program,
				rowId,
			});
			setStagedPlan(plan);
			setMessage("Drawing deactivation is staged for review.");
		} catch (error) {
			const nextMessage =
				error instanceof Error ? error.message : "Unable to stage deactivation.";
			showToast("error", nextMessage);
			setMessage(nextMessage);
		}
	};

	const handleWorkbookReconcile = async (
		event: ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || !program) {
			return;
		}
		try {
			const preview =
				await projectDrawingProgramService.buildWorkbookReconcilePreview({
					projectId,
					program,
					standardSnapshot,
					file,
				});
			setStagedPlan(preview.plan);
			setMessage(`Workbook reconcile preview loaded from '${file.name}'.`);
		} catch (error) {
			const nextMessage =
				error instanceof Error
					? error.message
					: "Unable to preview workbook reconcile.";
			showToast("error", nextMessage);
			setMessage(nextMessage);
		}
	};

	const persistProgramAndReceipt = async (
		nextProgram: ProjectDrawingProgramRecord,
		plan: ProjectDrawingProgramPlan,
		workbookPath: string | undefined,
		wdpPath: string | undefined,
		createdFiles: string[],
		renamedFiles: Array<{ fromRelativePath: string; toRelativePath: string }>,
		warnings: string[],
	) => {
		const saveError = await projectDrawingProgramService.saveProgram(nextProgram);
		if (saveError) {
			throw saveError;
		}
		const receipt: ProjectDrawingProvisionReceipt = {
			id: createClientId(),
			projectId,
			programId: nextProgram.id,
			planId: plan.id,
			mode: plan.mode,
			appliedAt: new Date().toISOString(),
			createdFiles,
			renamedFiles,
			workbookPath: workbookPath ?? null,
			wdpPath: wdpPath ?? null,
			warnings,
		};
		const receiptError = await projectDrawingProgramService.appendReceipt(receipt);
		if (receiptError) {
			logger.warn(
				"Unable to persist drawing program receipt.",
				"DrawingProgramPanel",
				receiptError,
			);
		}
		setProgram(nextProgram);
		setReceipts((current) => [receipt, ...current]);
		setStagedPlan(null);
	};

	const handleApplyPlan = async () => {
		if (!projectId || !projectRootPath || !program || !stagedPlan) {
			return;
		}
		setApplyingPlan(true);
		setMessage(null);
		try {
			const response = await projectDrawingProgramRuntimeService.applyPlan({
				projectId,
				projectRootPath,
				profile,
				program,
				plan: stagedPlan,
			});
			if (!response.success || !response.data?.program) {
				throw new Error(response.message || "Unable to apply the drawing program.");
			}
			const pendingTitleBlockSyncPaths = collectAffectedTitleBlockPaths(
				program,
				response.data.program,
				stagedPlan,
			);
			const persistedProgram: ProjectDrawingProgramRecord = {
				...response.data.program,
				pendingTitleBlockSyncPaths,
				pendingTitleBlockSyncAt:
					pendingTitleBlockSyncPaths.length > 0
						? new Date().toISOString()
						: null,
			};
			await persistProgramAndReceipt(
				persistedProgram,
				stagedPlan,
				response.data.workbookPath,
				response.data.wdpPath,
				response.data.createdFiles || [],
				response.data.renamedFiles || [],
				response.warnings || [],
			);
			onPendingTitleBlockSyncChange?.(
				pendingTitleBlockSyncPaths.length > 0
					? {
							paths: pendingTitleBlockSyncPaths,
							at: persistedProgram.pendingTitleBlockSyncAt,
					  }
					: null,
			);
			if (pendingTitleBlockSyncPaths.length > 0) {
				try {
					await onStageTitleBlockReview?.(pendingTitleBlockSyncPaths);
				} catch (stageError) {
					logger.warn(
						"Drawing program apply succeeded, but automatic title block staging failed.",
						"DrawingProgramPanel",
						stageError,
					);
				}
			}
			setMessage(response.message);
		} catch (error) {
			const nextMessage =
				error instanceof Error
					? error.message
					: "Unable to apply the drawing program.";
			showToast("error", nextMessage);
			setMessage(nextMessage);
		} finally {
			setApplyingPlan(false);
		}
	};

	const handleSyncAcade = async () => {
		if (!projectId || !projectRootPath || !program) {
			return;
		}
		setSyncingAcade(true);
		setMessage(null);
		try {
			const response = await projectDrawingProgramRuntimeService.syncAcade({
				projectId,
				projectRootPath,
				profile,
				program,
			});
			if (!response.success || !response.data?.program) {
				throw new Error(response.message || "Unable to sync the ACADE stack.");
			}
			const saveError = await projectDrawingProgramService.saveProgram(
				response.data.program,
			);
			if (saveError) {
				throw saveError;
			}
			setProgram(response.data.program);
			setStagedPlan(null);
			setMessage(response.message);
		} catch (error) {
			const nextMessage =
				error instanceof Error
					? error.message
					: "Unable to sync the ACADE stack.";
			showToast("error", nextMessage);
			setMessage(nextMessage);
		} finally {
			setSyncingAcade(false);
		}
	};

	if (!projectId) {
		return null;
	}

	return (
		<section className={styles.card}>
			<div className={styles.tableHeader}>
				<div>
					<h3 className={styles.cardTitle}>Drawing program and ACADE sync</h3>
					<div className={styles.smallMeta}>
						Suite owns the starter program, workbook mirror, and .wdp stack for{" "}
						{projectName ?? "this project"}.
					</div>
				</div>
				<div className={styles.selectionActions}>
					<button
						type="button"
						className={styles.secondaryButton}
						onClick={() => standardInputRef.current?.click()}
						disabled={importingStandard}
					>
						<Upload size={14} />
						{importingStandard ? "Importing…" : "Import override"}
					</button>
					<button
						type="button"
						className={styles.secondaryButton}
						onClick={() => workbookInputRef.current?.click()}
						disabled={!program}
					>
						<Upload size={14} />
						Preview workbook reconcile
					</button>
					<button
						type="button"
						className={styles.secondaryButton}
						onClick={() => void handleSyncAcade()}
						disabled={!program || !projectRootPath || syncingAcade || Boolean(stagedPlan)}
					>
						<RefreshCw size={14} />
						{syncingAcade ? "Syncing…" : "Sync workbook + ACADE"}
					</button>
				</div>
			</div>
			<input
				ref={standardInputRef}
				type="file"
				accept=".xlsx"
				className={styles.hiddenFileInput}
				onChange={(event) => void handleImportStandard(event)}
			/>
			<input
				ref={workbookInputRef}
				type="file"
				accept=".xlsx"
				className={styles.hiddenFileInput}
				onChange={(event) => void handleWorkbookReconcile(event)}
			/>

			{message ? <div className={styles.message}>{message}</div> : null}
			{driftEvent ? (
				<div className={styles.warningPanel}>
					Workbook drift detected by Watchdog at{" "}
					{new Date(driftEvent.timestamp).toLocaleString()}. Preview a workbook
					reconcile before the next apply.
				</div>
			) : null}

			<div className={styles.configGrid}>
				<section className={styles.card}>
					<h4 className={styles.cardTitle}>Active electrical standard</h4>
					{standardSnapshot ? (
						<div className={styles.issueList}>
							<span className={styles.packageBadge}>
								{standardSnapshot.source === "builtin"
									? "Built-in"
									: "Project override"}
							</span>
							<span className={styles.okBadge}>
								{standardSnapshot.workbookFileName}
							</span>
							<span className={styles.okBadge}>
								{standardSnapshot.catalogEntries.length} electrical family
								{standardSnapshot.catalogEntries.length === 1 ? "" : "ies"}
							</span>
							{standardSnapshot.warnings.length > 0 ? (
								<span className={styles.issueBadge}>
									{standardSnapshot.warnings.length} warning
									{standardSnapshot.warnings.length === 1 ? "" : "s"}
								</span>
							) : null}
						</div>
					) : (
						<div className={styles.cardPlaceholder}>
							Suite defaults to the built-in R3P electrical catalog. Import a
							project override only when this job needs a different numbering or
							template map.
						</div>
					)}
					<button
						type="button"
						className={styles.primaryButton}
						onClick={handlePreviewBootstrap}
						disabled={!standardSnapshot || !program || program.rows.length > 0}
					>
						<Wand2 size={14} />
						Bootstrap electrical starter pack
					</button>
				</section>

				<section className={styles.card}>
					<h4 className={styles.cardTitle}>Add electrical families</h4>
					{standardRows.length > 0 ? (
						<div className={styles.formGrid}>
							<label className={styles.field}>
								<span className={styles.fieldLabel}>Electrical family</span>
								<select
									className={styles.input}
									value={insertStandardRowId}
									onChange={(event) => setInsertStandardRowId(event.target.value)}
								>
									<option value="">Select a drawing family</option>
									{standardRows.map((row) => (
										<option key={row.id} value={row.id}>
											{row.sheetFamily} • {row.typeCode} •{" "}
											{String(row.sequenceBandStart).padStart(
												row.sequenceDigits,
												"0",
											)}
											-
											{String(row.sequenceBandEnd).padStart(
												row.sequenceDigits,
												"0",
											)}
										</option>
									))}
								</select>
							</label>
							<label className={styles.field}>
								<span className={styles.fieldLabel}>Count</span>
								<input
									className={styles.input}
									value={insertCount}
									onChange={(event) => setInsertCount(event.target.value)}
								/>
							</label>
							<label className={styles.field}>
								<span className={styles.fieldLabel}>Insert before</span>
								<select
									className={styles.input}
									value={insertBeforeRowId}
									onChange={(event) => setInsertBeforeRowId(event.target.value)}
								>
									<option value="">Append to end</option>
									{(program?.rows ?? [])
										.filter((row) => row.status !== "inactive")
										.map((row) => (
											<option key={row.id} value={row.id}>
												{row.drawingNumber} • {row.title}
											</option>
										))}
								</select>
							</label>
							<button
								type="button"
								className={styles.primaryButton}
								onClick={handlePreviewInsert}
								disabled={!program || !insertStandardRowId}
							>
								<Wand2 size={14} />
								Preview insertion
							</button>
						</div>
					) : (
						<div className={styles.cardPlaceholder}>
							No electrical catalog entries are available yet for this project.
						</div>
					)}
				</section>
			</div>

			<section className={styles.card}>
				<div className={styles.tableHeader}>
					<div>
						<h4 className={styles.cardTitle}>Suite drawing program</h4>
						<div className={styles.smallMeta}>
							One row per planned or provisioned drawing. Deactivation is
							reviewed before it is removed from the workbook mirror and .wdp
							stack.
						</div>
					</div>
					{loading ? (
						<span className={styles.smallMeta}>Loading…</span>
					) : latestReceipt ? (
						<span className={styles.smallMeta}>
							Last apply {new Date(latestReceipt.appliedAt).toLocaleString()}
						</span>
					) : null}
				</div>
				<div className={styles.tableWrapper}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th>Order</th>
								<th>Drawing</th>
								<th>Family</th>
								<th>Template</th>
								<th>Status</th>
								<th>Provision</th>
								<th>DWG Path</th>
								<th>ACADE</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{selectedProgram?.rows.length ? (
								selectedProgram.rows.map((row) => (
									<tr key={row.id}>
										<td>{row.sortOrder}</td>
										<td>
											<div className={styles.fileCell}>
												<strong>{row.drawingNumber}</strong>
												<span>{row.title}</span>
											</div>
										</td>
										<td>
											<div className={styles.fileCell}>
												<strong>{row.sheetFamily || "—"}</strong>
												<span>
													{row.typeCode} •{" "}
													{String(row.sequenceBandStart).padStart(
														row.sequenceDigits,
														"0",
													)}
													-
													{String(row.sequenceBandEnd).padStart(
														row.sequenceDigits,
														"0",
													)}
												</span>
											</div>
										</td>
										<td>{row.templateKey || "—"}</td>
										<td>{row.status}</td>
										<td>{row.provisionState}</td>
										<td>{row.dwgRelativePath || "—"}</td>
										<td>
											<div className={styles.fileCell}>
												<strong>{row.acadeSection || "SCHEMATIC"}</strong>
												<span>{row.acadeGroup || "—"}</span>
											</div>
										</td>
										<td>
											<button
												type="button"
												className={styles.secondaryButton}
												onClick={() => handlePreviewDeactivate(row.id)}
												disabled={row.status === "inactive" || !program}
											>
												Preview deactivate
											</button>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={9} className={styles.emptyCell}>
										Bootstrap the R3P electrical starter pack, then add the
										sheet families you need for this job.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>

			{stagedPlan ? (
				<section className={styles.card}>
					<div className={styles.tableHeader}>
						<div>
							<h4 className={styles.cardTitle}>Staged review plan</h4>
							<div className={styles.smallMeta}>
								Preview the ripple renumber, filesystem changes, workbook mirror,
								and ACADE stack update before Suite writes anything.
							</div>
						</div>
						<div className={styles.selectionActions}>
							<button
								type="button"
								className={styles.secondaryButton}
								onClick={() => setStagedPlan(null)}
							>
								Clear staged plan
							</button>
							<button
								type="button"
								className={styles.primaryButton}
								onClick={() => void handleApplyPlan()}
								disabled={
									!projectRootPath || applyingPlan || hasBlockedActions
								}
							>
								<Wand2 size={14} />
								{applyingPlan ? "Applying…" : "Apply staged plan"}
							</button>
						</div>
					</div>
					{stagedPlan.warnings.length > 0 ? (
						<div className={styles.warningPanel}>
							{stagedPlan.warnings.map((warning) => (
								<div key={warning}>{warning}</div>
							))}
						</div>
					) : null}
					<div className={styles.configGrid}>
						<div className={styles.card}>
							<h5 className={styles.cardTitle}>Change summary</h5>
							<div className={styles.issueList}>
								<span className={styles.okBadge}>
									{stagedPlan.changes.length} reviewed change
									{stagedPlan.changes.length === 1 ? "" : "s"}
								</span>
								<span className={styles.packageBadge}>
									{stagedPlan.fileActions.length} file action
									{stagedPlan.fileActions.length === 1 ? "" : "s"}
								</span>
								{stagedPlan.renumberPlan ? (
									<span className={styles.issueBadge}>
										{stagedPlan.renumberPlan.changes.length} ripple renumber
										change
										{stagedPlan.renumberPlan.changes.length === 1 ? "" : "s"}
									</span>
								) : null}
							</div>
							<div className={styles.issueList}>
								{stagedPlan.changes.slice(0, 8).map((change) => (
									<span
										key={change.id}
										className={
											change.blocked ? styles.issueBadge : styles.packageBadge
										}
									>
										{change.description}
									</span>
								))}
							</div>
						</div>
						<div className={styles.card}>
							<h5 className={styles.cardTitle}>File actions</h5>
							<div className={styles.issueList}>
								{stagedPlan.fileActions.length > 0 ? (
									stagedPlan.fileActions.map((action) => (
										<span
											key={action.id}
											className={
												action.blocked ? styles.issueBadge : styles.okBadge
											}
										>
											{action.kind}: {action.toRelativePath || action.fromRelativePath}
										</span>
									))
								) : (
									<span className={styles.packageBadge}>
										No DWG file mutations in this plan.
									</span>
								)}
							</div>
						</div>
					</div>
				</section>
			) : null}
		</section>
	);
}
