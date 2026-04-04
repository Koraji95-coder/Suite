import { Plus, Search, Upload, Wand2 } from "lucide-react";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Checkbox } from "@/components/system/checkbox";
import { PageContextBand } from "@/components/system/PageContextBand";
import { PageFrame } from "@/components/system/PageFrame";
import { fetchWithTimeout, mapFetchErrorMessage } from "@/lib/fetchWithTimeout";
import {
	type CadPreviewMatch as PreviewMatch,
	type CadReplaceRule as ReplaceRule,
	type DrawingCleanupEntryMode,
	type DrawingCleanupFixItem,
	type DrawingCleanupPreset,
	type DrawingCleanupResponse,
	buildCadPreviewKey,
	cadBatchFindReplaceService,
} from "@/services/cadBatchFindReplaceService";
import styles from "./BatchFindReplaceApp.module.css";

type Mode = "cleanup" | "cad" | "text";

const cleanupPresetOptions: ReadonlyArray<{
	value: DrawingCleanupPreset;
	label: string;
	description: string;
}> = [
	{
		value: "full",
		label: "Full",
		description: "Layers, blocks, text cleanup, plus review-first overlap fixes.",
	},
	{
		value: "text",
		label: "Text",
		description: "Normalize drawing text and queue overlap/text-layer review items.",
	},
	{
		value: "blocks",
		label: "Blocks",
		description: "Repair block scale, rotation, and attribute visibility only.",
	},
	{
		value: "layers",
		label: "Layers",
		description: "Normalize layer structure and queue text layer moves for review.",
	},
	{
		value: "overlap",
		label: "Overlap",
		description: "Only inspect text overlap candidates that need explicit approval.",
	},
	{
		value: "import_full",
		label: "Import Full",
		description: "Import a DXF or DWG, clean it, and save the cleaned DWG.",
	},
];

const createRule = (): ReplaceRule => ({
	id: crypto.randomUUID(),
	find: "",
	replace: "",
	useRegex: false,
	matchCase: false,
});

function selectedFixIds(items: DrawingCleanupFixItem[]) {
	return items.filter((item) => item.selected).map((item) => item.id);
}

export function BatchFindReplaceApp() {
	const [mode, setMode] = useState<Mode>("cleanup");
	const [rules, setRules] = useState<ReplaceRule[]>([createRule()]);
	const [files, setFiles] = useState<File[]>([]);
	const [preview, setPreview] = useState<PreviewMatch[]>([]);
	const [selectedPreviewKeys, setSelectedPreviewKeys] = useState<string[]>([]);
	const [cleanupResult, setCleanupResult] = useState<DrawingCleanupResponse | null>(
		null,
	);
	const [cleanupEntryMode, setCleanupEntryMode] =
		useState<DrawingCleanupEntryMode>("current_drawing");
	const [cleanupPreset, setCleanupPreset] =
		useState<DrawingCleanupPreset>("full");
	const [cleanupSourcePath, setCleanupSourcePath] = useState("");
	const [cleanupSaveDrawing, setCleanupSaveDrawing] = useState(false);
	const [cleanupTimeoutMs, setCleanupTimeoutMs] = useState(90_000);
	const [selectedCleanupFixIds, setSelectedCleanupFixIds] = useState<string[]>(
		[],
	);
	const [approvedCleanupReviewIds, setApprovedCleanupReviewIds] = useState<
		string[]
	>([]);
	const [runningPreview, setRunningPreview] = useState(false);
	const [applying, setApplying] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<string[]>([]);

	const canRunText = useMemo(
		() => files.length > 0 && rules.some((rule) => rule.find.trim().length > 0),
		[files.length, rules],
	);
	const canRunCad = useMemo(
		() => rules.some((rule) => rule.find.trim().length > 0),
		[rules],
	);
	const canRunCleanup = useMemo(
		() =>
			cleanupEntryMode === "current_drawing" ||
			cleanupSourcePath.trim().length > 0,
		[cleanupEntryMode, cleanupSourcePath],
	);
	const canApplyCleanup = useMemo(
		() =>
			cleanupResult !== null &&
			(selectedCleanupFixIds.length > 0 ||
				approvedCleanupReviewIds.length > 0 ||
				(cleanupEntryMode === "import_file" && cleanupSaveDrawing)),
		[
			approvedCleanupReviewIds.length,
			cleanupEntryMode,
			cleanupResult,
			cleanupSaveDrawing,
			selectedCleanupFixIds.length,
		],
	);

	const updateRule = (id: string, patch: Partial<ReplaceRule>) => {
		setRules((current) =>
			current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
		);
	};

	const removeRule = (id: string) => {
		setRules((current) =>
			current.length > 1 ? current.filter((rule) => rule.id !== id) : current,
		);
	};

	const runTextPreview = async () => {
		if (!canRunText) return;
		setRunningPreview(true);
		setMessage(null);
		setWarnings([]);
		try {
			await cadBatchFindReplaceService.ensureBatchSession();
			const body = new FormData();
			files.forEach((file) => body.append("files", file));
			body.append("rules", JSON.stringify(rules));

			const response = await fetchWithTimeout("/api/batch-find-replace/preview", {
				method: "POST",
				credentials: "include",
				body,
				timeoutMs: 120_000,
				requestName: "Batch preview request",
				throwOnHttpError: true,
			});
			const payload = await response.json();
			if (!payload?.success) {
				throw new Error(payload?.error || "Preview failed");
			}

			const matches = (
				Array.isArray(payload?.matches) ? payload.matches : []
			) as PreviewMatch[];
			setPreview(matches);
			setSelectedPreviewKeys(
				matches.map((match, index) => buildCadPreviewKey(match, index)),
			);
			setCleanupResult(null);
			setMessage(payload?.message || "Preview completed.");
		} catch (error) {
			setMessage(mapFetchErrorMessage(error, "Preview failed."));
		} finally {
			setRunningPreview(false);
		}
	};

	const runCadPreview = async () => {
		if (!canRunCad) return;
		setRunningPreview(true);
		setMessage(null);
		setWarnings([]);
		try {
			const result = await cadBatchFindReplaceService.previewActiveDrawing({
				rules,
				blockNameHint: "R3P-24x36BORDER&TITLE",
			});
			setPreview(result.matches);
			setSelectedPreviewKeys(
				result.matches.map((match, index) => buildCadPreviewKey(match, index)),
			);
			setCleanupResult(null);
			setWarnings(result.warnings);
			setMessage(result.message);
		} catch (error) {
			setMessage(mapFetchErrorMessage(error, "CAD preview failed."));
		} finally {
			setRunningPreview(false);
		}
	};

	const runCleanupPreview = async () => {
		if (!canRunCleanup) return;
		setRunningPreview(true);
		setMessage(null);
		setWarnings([]);
		try {
			const result = await cadBatchFindReplaceService.previewDrawingCleanup({
				entryMode: cleanupEntryMode,
				preset: cleanupPreset,
				sourcePath: cleanupEntryMode === "import_file" ? cleanupSourcePath : "",
				saveDrawing: cleanupSaveDrawing,
				timeoutMs: cleanupTimeoutMs,
			});
			setCleanupResult(result);
			setPreview([]);
			setSelectedPreviewKeys([]);
			setSelectedCleanupFixIds(selectedFixIds(result.deterministicFixes));
			setApprovedCleanupReviewIds(
				result.reviewQueue.filter((item) => item.selected).map((item) => item.id),
			);
			setWarnings(result.warnings);
			setMessage(result.message);
		} catch (error) {
			setMessage(mapFetchErrorMessage(error, "Drawing cleanup preview failed."));
		} finally {
			setRunningPreview(false);
		}
	};

	const applyTextChanges = async () => {
		if (!canRunText) return;
		setApplying(true);
		setMessage(null);
		try {
			await cadBatchFindReplaceService.ensureBatchSession();
			const body = new FormData();
			files.forEach((file) => body.append("files", file));
			body.append("rules", JSON.stringify(rules));

			const response = await fetchWithTimeout("/api/batch-find-replace/apply", {
				method: "POST",
				credentials: "include",
				body,
				timeoutMs: 120_000,
				requestName: "Batch apply request",
				throwOnHttpError: true,
			});

			const blob = await response.blob();
			const disposition = response.headers.get("content-disposition") || "";
			const match = disposition.match(/filename="?([^";]+)"?/i);
			const filename = match?.[1] || "batch_find_replace_changes.xlsx";

			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			URL.revokeObjectURL(url);

			setMessage("Apply completed. Excel change report downloaded.");
		} catch (error) {
			setMessage(mapFetchErrorMessage(error, "Apply failed."));
		} finally {
			setApplying(false);
		}
	};

	const applyCadChanges = async () => {
		if (!canRunCad) return;
		const selectedMatches = preview.filter((match, index) =>
			selectedPreviewKeys.includes(buildCadPreviewKey(match, index)),
		);
		if (selectedMatches.length === 0) {
			setMessage("Select at least one preview row to apply.");
			return;
		}

		setApplying(true);
		setMessage(null);
		try {
			const result = await cadBatchFindReplaceService.applyActiveDrawing({
				matches: selectedMatches,
				blockNameHint: "R3P-24x36BORDER&TITLE",
			});
			setMessage(result.message);
		} catch (error) {
			setMessage(mapFetchErrorMessage(error, "CAD apply failed."));
		} finally {
			setApplying(false);
		}
	};

	const applyCleanupChanges = async () => {
		if (!cleanupResult || !canApplyCleanup) return;
		setApplying(true);
		setMessage(null);
		try {
			const result = await cadBatchFindReplaceService.applyDrawingCleanup({
				entryMode: cleanupEntryMode,
				preset: cleanupPreset,
				sourcePath: cleanupEntryMode === "import_file" ? cleanupSourcePath : "",
				saveDrawing: cleanupSaveDrawing,
				timeoutMs: cleanupTimeoutMs,
				selectedFixIds: selectedCleanupFixIds,
				approvedReviewIds: approvedCleanupReviewIds,
			});
			setCleanupResult(result);
			setWarnings(result.warnings);
			setMessage(result.message);
		} catch (error) {
			setMessage(mapFetchErrorMessage(error, "Drawing cleanup apply failed."));
		} finally {
			setApplying(false);
		}
	};

	const toggleCleanupSelection = (
		id: string,
		setter: Dispatch<SetStateAction<string[]>>,
	) => {
		setter((existing) =>
			existing.includes(id)
				? existing.filter((value) => value !== id)
				: [...existing, id],
		);
	};

	return (
		<PageFrame maxWidth="lg">
			<PageContextBand
				eyebrow="Cleanup workflow"
				summary={
					<p className={styles.helperText}>
						Run review-first drawing cleanup, active-drawing text replacement,
						or file-based replacement from one shared surface.
					</p>
				}
				actions={
					<div className={styles.actions}>
						<button
							type="button"
							onClick={() => {
								if (mode === "cleanup") {
									void runCleanupPreview();
									return;
								}
								if (mode === "cad") {
									void runCadPreview();
									return;
								}
								void runTextPreview();
							}}
							disabled={
								runningPreview ||
								(mode === "cleanup"
									? !canRunCleanup
									: mode === "cad"
										? !canRunCad
										: !canRunText)
							}
							className={styles.secondaryButton}
						>
							<Search size={14} />
							{runningPreview ? "Previewing..." : "Preview"}
						</button>
						<button
							type="button"
							onClick={() => {
								if (mode === "cleanup") {
									void applyCleanupChanges();
									return;
								}
								if (mode === "cad") {
									void applyCadChanges();
									return;
								}
								void applyTextChanges();
							}}
							disabled={
								applying ||
								(mode === "cleanup"
									? !canApplyCleanup
									: mode === "cad"
										? !canRunCad
										: !canRunText)
							}
							className={styles.primaryButton}
						>
							<Wand2 size={14} />
							{applying ? "Applying..." : "Apply Changes"}
						</button>
					</div>
				}
			/>

			<div className={styles.modeSwitch}>
				<button
					type="button"
					className={
						mode === "cleanup" ? styles.modeButtonActive : styles.modeButton
					}
					onClick={() => {
						setMode("cleanup");
						setPreview([]);
					}}
				>
					Drawing Cleanup
				</button>
				<button
					type="button"
					className={mode === "cad" ? styles.modeButtonActive : styles.modeButton}
					onClick={() => {
						setMode("cad");
						setCleanupResult(null);
					}}
				>
					CAD Replace
				</button>
				<button
					type="button"
					className={
						mode === "text" ? styles.modeButtonActive : styles.modeButton
					}
					onClick={() => {
						setMode("text");
						setCleanupResult(null);
					}}
				>
					Text Files
				</button>
			</div>

			{message ? <div className={styles.message}>{message}</div> : null}
			{warnings.length > 0 ? (
				<div className={styles.warningPanel}>
					{warnings.map((warning) => (
						<div key={warning}>{warning}</div>
					))}
				</div>
			) : null}

			{mode === "cleanup" ? (
				<>
					<section className={styles.section}>
						<h3 className={styles.sectionTitle}>Cleanup Scope</h3>
						<div className={styles.cleanupGrid}>
							<label className={styles.field}>
								<span>Entry Mode</span>
								<select
									value={cleanupEntryMode}
									onChange={(event) => {
										const nextMode = event.target
											.value as DrawingCleanupEntryMode;
										setCleanupEntryMode(nextMode);
										if (nextMode === "current_drawing") {
											setCleanupPreset((current) =>
												current === "import_full" ? "full" : current,
											);
										}
									}}
									className={styles.textInput}
									name="batchfindreplace_cleanup_entry_mode"
								>
									<option value="current_drawing">Current Drawing</option>
									<option value="import_file">Import File</option>
								</select>
							</label>
							<label className={styles.field}>
								<span>Timeout (ms)</span>
								<input
									type="number"
									min={1000}
									max={600000}
									step={1000}
									value={cleanupTimeoutMs}
									onChange={(event) =>
										setCleanupTimeoutMs(
											Number(event.target.value) || 90_000,
										)
									}
									className={styles.textInput}
									name="batchfindreplace_cleanup_timeout"
								/>
							</label>
							<label className={styles.checkboxLabel}>
								<Checkbox
									id="batchfindreplace-cleanup-save"
									checked={cleanupSaveDrawing}
									onCheckedChange={(checked) =>
										setCleanupSaveDrawing(checked === true)
									}
									name="batchfindreplace_cleanup_save"
								/>
								<span>
									{cleanupEntryMode === "import_file"
										? "Save cleaned DWG"
										: "Save drawing after apply"}
								</span>
							</label>
						</div>
						{cleanupEntryMode === "import_file" ? (
							<label className={styles.field}>
								<span>Source Path</span>
								<input
									type="text"
									value={cleanupSourcePath}
									onChange={(event) =>
										setCleanupSourcePath(event.target.value)
									}
									placeholder="C:\\Projects\\incoming\\source-file.dxf"
									className={styles.textInput}
									name="batchfindreplace_cleanup_source_path"
								/>
							</label>
						) : (
							<p className={styles.helperText}>
								Current drawing mode uses the active AutoCAD document and keeps
								you on this same surface for follow-on replacement work.
							</p>
						)}
					</section>

					<section className={styles.section}>
						<h3 className={styles.sectionTitle}>Cleanup Preset</h3>
						<div className={styles.presetGrid}>
							{cleanupPresetOptions
								.filter(
									(option) =>
										cleanupEntryMode === "import_file" ||
										option.value !== "import_full",
								)
								.map((option) => (
									<button
										key={option.value}
										type="button"
										onClick={() => setCleanupPreset(option.value)}
										className={
											cleanupPreset === option.value
												? styles.presetButtonActive
												: styles.presetButton
										}
									>
										<strong>{option.label}</strong>
										<span>{option.description}</span>
									</button>
								))}
						</div>
					</section>

					{cleanupResult ? (
						<>
							<section className={styles.section}>
								<div className={styles.previewHeader}>
									<h3 className={styles.sectionTitle}>Cleanup Summary</h3>
									<button
										type="button"
										className={styles.secondaryButton}
										onClick={() => setMode("cad")}
									>
										Switch To CAD Replace
									</button>
								</div>
								<div className={styles.summaryGrid}>
									<div className={styles.summaryCard}>
										<strong>
											{cleanupResult.summary?.deterministicCandidateCount ?? 0}
										</strong>
										<span>Deterministic candidates</span>
									</div>
									<div className={styles.summaryCard}>
										<strong>
											{cleanupResult.summary?.reviewCandidateCount ?? 0}
										</strong>
										<span>Review items</span>
									</div>
									<div className={styles.summaryCard}>
										<strong>
											{cleanupResult.summary?.appliedDeterministicCount ?? 0}
										</strong>
										<span>Applied deterministic changes</span>
									</div>
									<div className={styles.summaryCard}>
										<strong>
											{cleanupResult.summary?.appliedReviewCount ?? 0}
										</strong>
										<span>Applied review changes</span>
									</div>
								</div>
								<div className={styles.detailStack}>
									<div>
										<strong>Drawing:</strong>{" "}
										{cleanupResult.drawing?.name || "Current drawing"}
									</div>
									{cleanupResult.drawing?.path ? (
										<div>
											<strong>Source:</strong> {cleanupResult.drawing.path}
										</div>
									) : null}
									{cleanupResult.drawing?.outputPath ? (
										<div>
											<strong>Output:</strong>{" "}
											{cleanupResult.drawing.outputPath}
										</div>
									) : null}
								</div>
							</section>

							<section className={styles.section}>
								<h3 className={styles.sectionTitle}>Deterministic Fixes</h3>
								<div className={styles.fixList}>
									{cleanupResult.deterministicFixes.map((item) => {
										const selected = selectedCleanupFixIds.includes(item.id);
										return (
											<label key={item.id} className={styles.fixRow}>
												<Checkbox
													id={`cleanup-fix-${item.id}`}
													checked={selected}
													onCheckedChange={() =>
														toggleCleanupSelection(
															item.id,
															setSelectedCleanupFixIds,
														)
													}
													name={`cleanup_fix_${item.id}`}
												/>
												<div className={styles.fixMeta}>
													<div className={styles.fixTitleRow}>
														<strong>{item.label}</strong>
														<span className={styles.pill}>
															{item.count}
														</span>
													</div>
													<span>{item.description}</span>
												</div>
											</label>
										);
									})}
								</div>
							</section>

							<section className={styles.section}>
								<h3 className={styles.sectionTitle}>Review Queue</h3>
								<div className={styles.fixList}>
									{cleanupResult.reviewQueue.map((item) => {
										const approved = approvedCleanupReviewIds.includes(item.id);
										return (
											<label key={item.id} className={styles.fixRow}>
												<Checkbox
													id={`cleanup-review-${item.id}`}
													checked={approved}
													onCheckedChange={() =>
														toggleCleanupSelection(
															item.id,
															setApprovedCleanupReviewIds,
														)
													}
													name={`cleanup_review_${item.id}`}
												/>
												<div className={styles.fixMeta}>
													<div className={styles.fixTitleRow}>
														<strong>{item.label}</strong>
														<span className={styles.pill}>
															{item.count}
														</span>
													</div>
													<span>{item.description}</span>
												</div>
											</label>
										);
									})}
								</div>
							</section>
						</>
					) : null}
				</>
			) : null}

			{mode === "text" ? (
				<section className={styles.section}>
					<h3 className={styles.sectionTitle}>Input Files</h3>
					<label className={styles.uploadLabel}>
						<Upload size={16} className={styles.uploadIcon} />
						Choose files
						<input
							type="file"
							multiple
							className={styles.hiddenInput}
							onChange={(event) => {
								setFiles(Array.from(event.target.files || []));
								setPreview([]);
							}}
							name="batchfindreplace_text_input_files"
						/>
					</label>
					{files.length > 0 ? (
						<p className={styles.fileCount}>
							{files.length} file{files.length !== 1 && "s"} selected
						</p>
					) : null}
				</section>
			) : null}

			{mode === "cad" ? (
				<section className={styles.section}>
					<h3 className={styles.sectionTitle}>Active Drawing Replace</h3>
					<p className={styles.helperText}>
						Preview text and attribute replacements in the active AutoCAD
						drawing. Use Drawing Cleanup first when the source drawing is noisy or
						imported.
					</p>
				</section>
			) : null}

			{mode !== "cleanup" ? (
				<>
					<section className={styles.section}>
						<h3 className={styles.sectionTitle}>Rules</h3>
						<div className={styles.rulesList}>
							{rules.map((rule) => (
								<div key={rule.id} className={styles.ruleCard}>
									<div className={styles.ruleGrid}>
										<input
											value={rule.find}
											onChange={(event) =>
												updateRule(rule.id, { find: event.target.value })
											}
											placeholder="Find"
											className={styles.textInput}
											name={`batchfindreplace_rule_find_${rule.id}`}
										/>
										<input
											value={rule.replace}
											onChange={(event) =>
												updateRule(rule.id, { replace: event.target.value })
											}
											placeholder="Replace"
											className={styles.textInput}
											name={`batchfindreplace_rule_replace_${rule.id}`}
										/>
										<button
											type="button"
											onClick={() => removeRule(rule.id)}
											className={styles.removeRuleButton}
										>
											Remove
										</button>
									</div>
									<div className={styles.ruleOptions}>
										<label
											className={styles.checkboxLabel}
											htmlFor={`rule-regex-${rule.id}`}
										>
											<Checkbox
												id={`rule-regex-${rule.id}`}
												checked={rule.useRegex}
												onCheckedChange={(checked) =>
													updateRule(rule.id, { useRegex: checked === true })
												}
												name={`batchfindreplace_rule_regex_${rule.id}`}
											/>
											<span>Regex</span>
										</label>
										<label
											className={styles.checkboxLabel}
											htmlFor={`rule-case-${rule.id}`}
										>
											<Checkbox
												id={`rule-case-${rule.id}`}
												checked={rule.matchCase}
												onCheckedChange={(checked) =>
													updateRule(rule.id, { matchCase: checked === true })
												}
												name={`batchfindreplace_rule_case_${rule.id}`}
											/>
											<span>Case sensitive</span>
										</label>
									</div>
								</div>
							))}
						</div>
						<button
							type="button"
							onClick={() => setRules((current) => [...current, createRule()])}
							className={styles.addRuleButton}
						>
							<Plus size={14} /> Add rule
						</button>
					</section>

					{preview.length > 0 ? (
						<section className={styles.section}>
							<div className={styles.previewHeader}>
								<h3 className={styles.sectionTitle}>
									Preview - {preview.length} match
									{preview.length !== 1 && "es"}
								</h3>
								{mode === "cad" ? (
									<div className={styles.selectionControls}>
										<button
											type="button"
											className={styles.secondaryButton}
											onClick={() =>
												setSelectedPreviewKeys(
													preview.map((match, index) =>
														buildCadPreviewKey(match, index),
													),
												)
											}
										>
											Select All
										</button>
										<button
											type="button"
											className={styles.secondaryButton}
											onClick={() => setSelectedPreviewKeys([])}
										>
											Clear
										</button>
									</div>
								) : null}
							</div>
							<div className={styles.previewPanel}>
								{preview.map((match, index) => {
									const previewKey = buildCadPreviewKey(match, index);
									const selected = selectedPreviewKeys.includes(previewKey);
									return (
										<div
											key={previewKey}
											className={
												selected
													? styles.previewItemSelected
													: styles.previewItem
											}
										>
											{mode === "cad" ? (
												<div className={styles.previewSelectRow}>
													<Checkbox
														id={`preview-select-${index}`}
														checked={selected}
														onCheckedChange={() =>
															setSelectedPreviewKeys((current) =>
																current.includes(previewKey)
																	? current.filter(
																			(value) => value !== previewKey,
																		)
																	: [...current, previewKey],
															)
														}
														className={styles.previewCheckbox}
													/>
													<label
														htmlFor={`preview-select-${index}`}
														className={styles.previewSelectLabel}
													>
														{match.entityType || "Text"} |{" "}
														{match.layoutName || "Active"} |{" "}
														{match.attributeTag || match.handle || "Target"}
													</label>
												</div>
											) : (
												<span className={styles.previewItemTitle}>
													{match.file}:{match.line}
												</span>
											)}
											<div className={styles.previewDiff}>
												<div>
													<span className={styles.previewDiffPrefixDanger}>
														-
													</span>
													{match.before}
												</div>
												<div>
													<span className={styles.previewDiffPrefixSuccess}>
														+
													</span>
													{match.after}
												</div>
											</div>
										</div>
									);
								})}
							</div>
						</section>
					) : null}
				</>
			) : null}
		</PageFrame>
	);
}
