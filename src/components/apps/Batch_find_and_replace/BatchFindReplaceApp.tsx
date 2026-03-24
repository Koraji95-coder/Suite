import { Plus, Search, Upload, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Checkbox } from "@/components/apps/ui/checkbox";
import { PageContextBand } from "@/components/apps/ui/PageContextBand";
import { PageFrame } from "@/components/apps/ui/PageFrame";
import { fetchWithTimeout, mapFetchErrorMessage } from "@/lib/fetchWithTimeout";
import styles from "./BatchFindReplaceApp.module.css";

type ReplaceRule = {
	id: string;
	find: string;
	replace: string;
	useRegex: boolean;
	matchCase: boolean;
};

type PreviewMatch = {
	file: string;
	line: number;
	before: string;
	after: string;
	ruleId: string;
	handle?: string;
	entityType?: string;
	layoutName?: string;
	blockName?: string | null;
	attributeTag?: string | null;
	currentValue?: string;
	nextValue?: string;
};

type Mode = "text" | "cad";

const createRule = (): ReplaceRule => ({
	id: crypto.randomUUID(),
	find: "",
	replace: "",
	useRegex: false,
	matchCase: false,
});

export function BatchFindReplaceApp() {
	const [mode, setMode] = useState<Mode>("cad");
	const [rules, setRules] = useState<ReplaceRule[]>([createRule()]);
	const [files, setFiles] = useState<File[]>([]);
	const [preview, setPreview] = useState<PreviewMatch[]>([]);
	const [selectedPreviewKeys, setSelectedPreviewKeys] = useState<string[]>([]);
	const [runningPreview, setRunningPreview] = useState(false);
	const [applying, setApplying] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [warnings, setWarnings] = useState<string[]>([]);
	const [sessionReady, setSessionReady] = useState(false);

	const canRunText = useMemo(
		() => files.length > 0 && rules.some((r) => r.find.trim().length > 0),
		[files.length, rules],
	);
	const canRunCad = useMemo(
		() => rules.some((r) => r.find.trim().length > 0),
		[rules],
	);

	const updateRule = (id: string, patch: Partial<ReplaceRule>) => {
		setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
	};

	const removeRule = (id: string) => {
		setRules((prev) =>
			prev.length > 1 ? prev.filter((r) => r.id !== id) : prev,
		);
	};

	const ensureBatchSession = async () => {
		if (sessionReady) return;
		await fetchWithTimeout("/api/batch-find-replace/session", {
			method: "POST",
			credentials: "include",
			timeoutMs: 15_000,
			requestName: "Batch session request",
			throwOnHttpError: true,
		});
		setSessionReady(true);
	};

	const buildPreviewKey = (match: PreviewMatch, index: number) =>
		[
			match.file,
			match.handle || "",
			match.attributeTag || "",
			match.ruleId,
			match.before,
			index,
		].join("::");

	const runTextPreview = async () => {
		if (!canRunText) return;
		setRunningPreview(true);
		setMessage(null);
		setWarnings([]);
		try {
			await ensureBatchSession();
			const body = new FormData();
			files.forEach((f) => body.append("files", f));
			body.append("rules", JSON.stringify(rules));

			const res = await fetchWithTimeout("/api/batch-find-replace/preview", {
				method: "POST",
				credentials: "include",
				body,
				timeoutMs: 120_000,
				requestName: "Batch preview request",
				throwOnHttpError: true,
			});
			const payload = await res.json();
			if (!payload?.success) {
				throw new Error(payload?.error || "Preview failed");
			}

			const matches = Array.isArray(payload?.matches) ? payload.matches : [];
			setPreview(matches);
			setSelectedPreviewKeys(matches.map(buildPreviewKey));
			setMessage(payload?.message || "Preview completed.");
		} catch (err) {
			setMessage(mapFetchErrorMessage(err, "Preview failed."));
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
			await ensureBatchSession();
			const res = await fetchWithTimeout(
				"/api/batch-find-replace/cad/preview",
				{
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						rules,
						blockNameHint: "R3P-24x36BORDER&TITLE",
					}),
					timeoutMs: 120_000,
					requestName: "CAD batch preview request",
					throwOnHttpError: true,
				},
			);
			const payload = await res.json();
			if (!payload?.success) {
				throw new Error(
					payload?.error || payload?.message || "CAD preview failed",
				);
			}

			const matches = Array.isArray(payload?.matches) ? payload.matches : [];
			setPreview(matches);
			setSelectedPreviewKeys(matches.map(buildPreviewKey));
			setWarnings(Array.isArray(payload?.warnings) ? payload.warnings : []);
			setMessage(payload?.message || "CAD preview completed.");
		} catch (err) {
			setMessage(mapFetchErrorMessage(err, "CAD preview failed."));
		} finally {
			setRunningPreview(false);
		}
	};

	const applyTextChanges = async () => {
		if (!canRunText) return;
		setApplying(true);
		setMessage(null);
		try {
			await ensureBatchSession();
			const body = new FormData();
			files.forEach((f) => body.append("files", f));
			body.append("rules", JSON.stringify(rules));

			const res = await fetchWithTimeout("/api/batch-find-replace/apply", {
				method: "POST",
				credentials: "include",
				body,
				timeoutMs: 120_000,
				requestName: "Batch apply request",
				throwOnHttpError: true,
			});

			const blob = await res.blob();
			const cd = res.headers.get("content-disposition") || "";
			const match = cd.match(/filename="?([^";]+)"?/i);
			const filename = match?.[1] || "batch_find_replace_changes.xlsx";

			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			setMessage("Apply completed. Excel change report downloaded.");
		} catch (err) {
			setMessage(mapFetchErrorMessage(err, "Apply failed."));
		} finally {
			setApplying(false);
		}
	};

	const applyCadChanges = async () => {
		if (!canRunCad) return;
		const selectedMatches = preview.filter((match, index) =>
			selectedPreviewKeys.includes(buildPreviewKey(match, index)),
		);
		if (selectedMatches.length === 0) {
			setMessage("Select at least one preview row to apply.");
			return;
		}

		setApplying(true);
		setMessage(null);
		try {
			await ensureBatchSession();
			const res = await fetchWithTimeout("/api/batch-find-replace/cad/apply", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					matches: selectedMatches,
					blockNameHint: "R3P-24x36BORDER&TITLE",
				}),
				timeoutMs: 120_000,
				requestName: "CAD batch apply request",
				throwOnHttpError: true,
			});

			const blob = await res.blob();
			const cd = res.headers.get("content-disposition") || "";
			const match = cd.match(/filename="?([^";]+)"?/i);
			const filename = match?.[1] || "cad_batch_find_replace_changes.xlsx";

			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			setMessage("CAD apply completed. Excel change report downloaded.");
		} catch (err) {
			setMessage(mapFetchErrorMessage(err, "CAD apply failed."));
		} finally {
			setApplying(false);
		}
	};

	return (
		<PageFrame maxWidth="lg">
			<PageContextBand
				eyebrow="Cleanup workflow"
				summary={
					<p className={styles.helperText}>
						Use file-based text replacement or active-drawing AutoCAD cleanup
						from the same surface. Structured ACADE metadata updates should stay
						in Drawing List Manager and title-block sync.
					</p>
				}
				actions={
					<div className={styles.actions}>
						<button
							type="button"
							onClick={() =>
								void (mode === "cad" ? runCadPreview() : runTextPreview())
							}
							disabled={
								(mode === "cad" ? !canRunCad : !canRunText) || runningPreview
							}
							className={styles.secondaryButton}
						>
							<Search size={14} />
							{runningPreview ? "Previewing…" : "Preview"}
						</button>
						<button
							type="button"
							onClick={() =>
								void (mode === "cad" ? applyCadChanges() : applyTextChanges())
							}
							disabled={(mode === "cad" ? !canRunCad : !canRunText) || applying}
							className={styles.primaryButton}
						>
							<Wand2 size={14} />
							{applying ? "Applying…" : "Apply Changes"}
						</button>
					</div>
				}
			/>
			<div className={styles.modeSwitch}>
				<button
					type="button"
					className={
						mode === "cad" ? styles.modeButtonActive : styles.modeButton
					}
					onClick={() => {
						setMode("cad");
						setPreview([]);
						setWarnings([]);
					}}
				>
					AutoCAD Cleanup
				</button>
				<button
					type="button"
					className={
						mode === "text" ? styles.modeButtonActive : styles.modeButton
					}
					onClick={() => {
						setMode("text");
						setPreview([]);
						setWarnings([]);
					}}
				>
					Text Files
				</button>
			</div>

			{message && <div className={styles.message}>{message}</div>}
			{warnings.length > 0 ? (
				<div className={styles.warningPanel}>
					{warnings.map((warning) => (
						<div key={warning}>{warning}</div>
					))}
				</div>
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
							onChange={(e) => {
								setFiles(Array.from(e.target.files || []));
								setPreview([]);
							}}
							name="batchfindreplaceapp_input_175"
						/>
					</label>
					{files.length > 0 && (
						<p className={styles.fileCount}>
							{files.length} file{files.length !== 1 && "s"} selected
						</p>
					)}
				</section>
			) : (
				<section className={styles.section}>
					<h3 className={styles.sectionTitle}>Active Drawing Cleanup</h3>
					<p className={styles.helperText}>
						Scans the currently open AutoCAD drawing, including DBText, MText,
						and block attributes. Apply uses optimistic current-value checks so
						stale preview rows are skipped instead of overwritten. Use this for
						legacy cleanup and one-off remediation, not project-wide ACADE-owned
						metadata updates.
					</p>
				</section>
			)}

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Rules</h3>
				<div className={styles.rulesList}>
					{rules.map((rule) => (
						<div key={rule.id} className={styles.ruleCard}>
							<div className={styles.ruleGrid}>
								<input
									value={rule.find}
									onChange={(e) =>
										updateRule(rule.id, { find: e.target.value })
									}
									placeholder="Find"
									className={styles.textInput}
									name="batchfindreplaceapp_input_199"
								/>
								<input
									value={rule.replace}
									onChange={(e) =>
										updateRule(rule.id, { replace: e.target.value })
									}
									placeholder="Replace"
									className={styles.textInput}
									name="batchfindreplaceapp_input_207"
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
										name="batchfindreplaceapp_input_225"
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
										name="batchfindreplaceapp_input_236"
									/>
									<span>Case sensitive</span>
								</label>
							</div>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={() => setRules((prev) => [...prev, createRule()])}
					className={styles.addRuleButton}
				>
					<Plus size={14} /> Add rule
				</button>
			</section>

			{preview.length > 0 && (
				<section className={styles.section}>
					<div className={styles.previewHeader}>
						<h3 className={styles.sectionTitle}>
							Preview — {preview.length} match{preview.length !== 1 && "es"}
						</h3>
						{mode === "cad" ? (
							<div className={styles.selectionControls}>
								<button
									type="button"
									className={styles.secondaryButton}
									onClick={() =>
										setSelectedPreviewKeys(preview.map(buildPreviewKey))
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
							const previewKey = buildPreviewKey(match, index);
							const selected = selectedPreviewKeys.includes(previewKey);
							return (
								<div
									key={previewKey}
									className={
										selected ? styles.previewItemSelected : styles.previewItem
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
															? current.filter((value) => value !== previewKey)
															: [...current, previewKey],
													)
												}
												className={styles.previewCheckbox}
											/>
											<label
												htmlFor={`preview-select-${index}`}
												className={styles.previewSelectLabel}
											>
												{match.entityType || "Text"} •{" "}
												{match.layoutName || "Active"} •{" "}
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
											<span className={styles.previewDiffPrefixDanger}>−</span>
											{match.before}
										</div>
										<div>
											<span className={styles.previewDiffPrefixSuccess}>+</span>
											{match.after}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</section>
			)}
		</PageFrame>
	);
}
