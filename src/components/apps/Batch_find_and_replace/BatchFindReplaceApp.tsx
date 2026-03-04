import { Plus, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { PageFrame } from "@/components/apps/ui/PageFrame";
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
};

const createRule = (): ReplaceRule => ({
	id: crypto.randomUUID(),
	find: "",
	replace: "",
	useRegex: false,
	matchCase: false,
});

export function BatchFindReplaceApp() {
	const [rules, setRules] = useState<ReplaceRule[]>([createRule()]);
	const [files, setFiles] = useState<File[]>([]);
	const [preview, setPreview] = useState<PreviewMatch[]>([]);
	const [runningPreview, setRunningPreview] = useState(false);
	const [applying, setApplying] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [sessionReady, setSessionReady] = useState(false);

	const canRun = useMemo(
		() => files.length > 0 && rules.some((r) => r.find.trim().length > 0),
		[files.length, rules],
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
		const res = await fetch("/api/batch-find-replace/session", {
			method: "POST",
			credentials: "include",
		});
		if (!res.ok) {
			let msg = "Unable to start batch session";
			try {
				const payload = await res.json();
				msg = payload?.error || msg;
			} catch {
				/* keep default */
			}
			throw new Error(msg);
		}
		setSessionReady(true);
	};

	const runPreview = async () => {
		if (!canRun) return;
		setRunningPreview(true);
		setMessage(null);
		try {
			await ensureBatchSession();
			const body = new FormData();
			files.forEach((f) => body.append("files", f));
			body.append("rules", JSON.stringify(rules));

			const res = await fetch("/api/batch-find-replace/preview", {
				method: "POST",
				credentials: "include",
				body,
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.error || "Preview failed");

			setPreview(Array.isArray(payload?.matches) ? payload.matches : []);
			setMessage(payload?.message || "Preview completed.");
		} catch (err) {
			setMessage(err instanceof Error ? err.message : "Preview failed.");
		} finally {
			setRunningPreview(false);
		}
	};

	const applyChanges = async () => {
		if (!canRun) return;
		setApplying(true);
		setMessage(null);
		try {
			await ensureBatchSession();
			const body = new FormData();
			files.forEach((f) => body.append("files", f));
			body.append("rules", JSON.stringify(rules));

			const res = await fetch("/api/batch-find-replace/apply", {
				method: "POST",
				credentials: "include",
				body,
			});
			if (!res.ok) {
				let msg = "Apply failed";
				try {
					const payload = await res.json();
					msg = payload?.error || msg;
				} catch {
					/* keep default */
				}
				throw new Error(msg);
			}

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
			setMessage(err instanceof Error ? err.message : "Apply failed.");
		} finally {
			setApplying(false);
		}
	};

	return (
		<PageFrame
			title="Batch Find & Replace"
			description="Bulk text replacement pipeline bridged through the backend service."
			maxWidth="lg"
			actions={
				<div className={styles.actions}>
					<button
						type="button"
						onClick={runPreview}
						disabled={!canRun || runningPreview}
						className={styles.secondaryButton}
					>
						<Search size={14} />
						{runningPreview ? "Previewing…" : "Preview"}
					</button>
					<button
						type="button"
						onClick={applyChanges}
						disabled={!canRun || applying}
						className={styles.primaryButton}
					>
						{applying ? "Applying…" : "Apply Changes"}
					</button>
				</div>
			}
		>
			{message && <div className={styles.message}>{message}</div>}

			{/* File upload */}
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
					/>
				</label>
				{files.length > 0 && (
					<p className={styles.fileCount}>
						{files.length} file{files.length !== 1 && "s"} selected
					</p>
				)}
			</section>

			{/* Rules */}
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
								/>
								<input
									value={rule.replace}
									onChange={(e) =>
										updateRule(rule.id, { replace: e.target.value })
									}
									placeholder="Replace"
									className={styles.textInput}
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
								<label className={styles.checkboxLabel}>
									<input
										type="checkbox"
										checked={rule.useRegex}
										onChange={(e) =>
											updateRule(rule.id, { useRegex: e.target.checked })
										}
										className={styles.checkbox}
									/>
									Regex
								</label>
								<label className={styles.checkboxLabel}>
									<input
										type="checkbox"
										checked={rule.matchCase}
										onChange={(e) =>
											updateRule(rule.id, { matchCase: e.target.checked })
										}
										className={styles.checkbox}
									/>
									Case sensitive
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

			{/* Preview */}
			{preview.length > 0 && (
				<section className={styles.section}>
					<h3 className={styles.sectionTitle}>
						Preview — {preview.length} match{preview.length !== 1 && "es"}
					</h3>
					<div className={styles.previewPanel}>
						{preview.map((m, i) => (
							<div
								key={`${m.file}-${m.line}-${i}`}
								className={styles.previewItem}
							>
								<span className={styles.previewItemTitle}>
									{m.file}:{m.line}
								</span>
								<div className={styles.previewDiff}>
									<div>
										<span className={styles.previewDiffPrefixDanger}>−</span>
										{m.before}
									</div>
									<div>
										<span className={styles.previewDiffPrefixSuccess}>+</span>
										{m.after}
									</div>
								</div>
							</div>
						))}
					</div>
				</section>
			)}
		</PageFrame>
	);
}
