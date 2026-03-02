import { Plus, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { FrameSection, PageFrame } from "@/components/apps/ui/PageFrame";
import { hexToRgba, useTheme } from "@/lib/palette";

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
	const { palette } = useTheme();
	const [rules, setRules] = useState<ReplaceRule[]>([createRule()]);
	const [files, setFiles] = useState<File[]>([]);
	const [preview, setPreview] = useState<PreviewMatch[]>([]);
	const [runningPreview, setRunningPreview] = useState(false);
	const [applying, setApplying] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [sessionReady, setSessionReady] = useState(false);

	const canRun = useMemo(
		() => files.length > 0 && rules.some((rule) => rule.find.trim().length > 0),
		[files.length, rules],
	);

	const updateRule = (id: string, patch: Partial<ReplaceRule>) => {
		setRules((prev) => prev.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
	};

	const removeRule = (id: string) => {
		setRules((prev) => (prev.length > 1 ? prev.filter((rule) => rule.id !== id) : prev));
	};

	const ensureBatchSession = async () => {
		if (sessionReady) return;
		const response = await fetch("/api/batch-find-replace/session", {
			method: "POST",
			credentials: "include",
		});
		if (!response.ok) {
			let errorMessage = "Unable to start batch session";
			try {
				const payload = await response.json();
				errorMessage = payload?.error || errorMessage;
			} catch {
				// keep default error message
			}
			throw new Error(errorMessage);
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
			files.forEach((file) => body.append("files", file));
			body.append("rules", JSON.stringify(rules));

			const response = await fetch("/api/batch-find-replace/preview", {
				method: "POST",
				credentials: "include",
				body,
			});

			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload?.error || "Preview failed");
			}

			setPreview(Array.isArray(payload?.matches) ? payload.matches : []);
			setMessage(payload?.message || "Preview completed.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Preview failed.");
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
			files.forEach((file) => body.append("files", file));
			body.append("rules", JSON.stringify(rules));

			const response = await fetch("/api/batch-find-replace/apply", {
				method: "POST",
				credentials: "include",
				body,
			});
			if (!response.ok) {
				let errorMessage = "Apply failed";
				try {
					const payload = await response.json();
					errorMessage = payload?.error || errorMessage;
				} catch {
					// keep default error message
				}
				throw new Error(errorMessage);
			}

			const reportBlob = await response.blob();
			const contentDisposition = response.headers.get("content-disposition") || "";
			const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
			const filename = filenameMatch?.[1] || "batch_find_replace_changes.xlsx";

			const reportUrl = URL.createObjectURL(reportBlob);
			const downloadLink = document.createElement("a");
			downloadLink.href = reportUrl;
			downloadLink.download = filename;
			document.body.appendChild(downloadLink);
			downloadLink.click();
			document.body.removeChild(downloadLink);
			URL.revokeObjectURL(reportUrl);

			setMessage("Apply completed. Excel change report downloaded.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Apply failed.");
		} finally {
			setApplying(false);
		}
	};

	return (
		<PageFrame
			title="Batch Find and Replace"
			subtitle="Bulk text replacement pipeline bridged through the backend service."
		>
			<FrameSection title="Input Files">
				<label
					className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm"
					style={{
						borderColor: hexToRgba(palette.primary, 0.3),
						color: palette.text,
					}}
				>
					<Upload size={16} />
					Upload files
					<input
						type="file"
						multiple
						className="hidden"
						onChange={(event) => {
							setFiles(Array.from(event.target.files || []));
							setPreview([]);
						}}
					/>
				</label>
				<div className="mt-2 text-xs" style={{ color: palette.textMuted }}>
					{files.length} file(s) selected
				</div>
			</FrameSection>

			<FrameSection title="Rules">
				<div className="space-y-2">
					{rules.map((rule) => (
						<div key={rule.id} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_1fr_auto]" style={{ borderColor: hexToRgba(palette.primary, 0.18) }}>
							<input
								value={rule.find}
								onChange={(event) => updateRule(rule.id, { find: event.target.value })}
								placeholder="Find"
								className="rounded-lg border px-3 py-2 text-sm"
							/>
							<input
								value={rule.replace}
								onChange={(event) => updateRule(rule.id, { replace: event.target.value })}
								placeholder="Replace"
								className="rounded-lg border px-3 py-2 text-sm"
							/>
							<button
								type="button"
								onClick={() => removeRule(rule.id)}
								className="rounded-lg border px-3 py-2 text-xs"
							>
								Remove
							</button>
							<div className="flex items-center gap-3 md:col-span-3">
								<label className="text-xs">
									<input
										type="checkbox"
										checked={rule.useRegex}
										onChange={(event) => updateRule(rule.id, { useRegex: event.target.checked })}
									/>{" "}
									Regex
								</label>
								<label className="text-xs">
									<input
										type="checkbox"
										checked={rule.matchCase}
										onChange={(event) => updateRule(rule.id, { matchCase: event.target.checked })}
									/>{" "}
									Case sensitive
								</label>
							</div>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={() => setRules((prev) => [...prev, createRule()])}
					className="mt-3 inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"
				>
					<Plus size={14} /> Add rule
				</button>
			</FrameSection>

			<FrameSection title="Actions">
				<div className="flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={runPreview}
						disabled={!canRun || runningPreview}
						className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
					>
						<Search size={14} /> {runningPreview ? "Previewing..." : "Preview"}
					</button>
					<button
						type="button"
						onClick={applyChanges}
						disabled={!canRun || applying}
						className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
					>
						{applying ? "Applying..." : "Apply Changes"}
					</button>
				</div>
				{message && (
					<p className="mt-2 text-xs" style={{ color: palette.textMuted }}>
						{message}
					</p>
				)}
			</FrameSection>

			<FrameSection title="Preview Results">
				{preview.length === 0 ? (
					<p className="text-sm" style={{ color: palette.textMuted }}>
						No preview results yet.
					</p>
				) : (
					<div className="max-h-[360px] space-y-2 overflow-auto">
						{preview.map((match, index) => (
							<div key={`${match.file}-${match.line}-${index}`} className="rounded-lg border p-2 text-xs">
								<div className="font-semibold">{match.file} · line {match.line}</div>
								<div className="mt-1" style={{ color: palette.textMuted }}>
									Before: {match.before}
								</div>
								<div>After: {match.after}</div>
							</div>
						))}
					</div>
				)}
			</FrameSection>
		</PageFrame>
	);
}
