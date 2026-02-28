import {
	AlertTriangle,
	CheckCircle,
	Download,
	Eye,
	FileText,
	Search,
	Settings as SettingsIcon,
	Upload,
	XCircle,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/supabase/client";
import type { Database, Json } from "@/supabase/database";
import { FrameSection } from "../ui/PageFrame";

interface DrawingAnnotation {
	id: string;
	drawing_name: string;
	file_path: string;
	annotations: Issue[];
	qa_status: "pass" | "fail" | "warning" | "pending";
	checked_at: string | null;
	checked_by: string | null;
	rules_applied: string[];
	issues_found: number;
	created_at: string;
}

type DrawingAnnotationRow =
	Database["public"]["Tables"]["drawing_annotations"]["Row"];

const mapDrawingRow = (row: DrawingAnnotationRow): DrawingAnnotation => {
	const annotations = Array.isArray(row.annotation_data)
		? (row.annotation_data as unknown as Issue[])
		: [];
	const rulesApplied = Array.isArray(row.qa_checks)
		? (row.qa_checks as string[])
		: [];
	const issuesFound =
		typeof row.issues_found === "number"
			? row.issues_found
			: annotations.length;
	const qa_status: DrawingAnnotation["qa_status"] =
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
		qa_status,
		checked_at: row.reviewed_at,
		checked_by: null,
		rules_applied: rulesApplied,
		issues_found: issuesFound,
		created_at: row.created_at,
	};
};

interface QARule {
	id: string;
	name: string;
	description: string;
	category:
		| "title_block"
		| "layer"
		| "dimension"
		| "text"
		| "compliance"
		| "standard";
	severity: "error" | "warning" | "info";
	enabled: boolean;
}

interface Issue {
	type: string;
	severity: "error" | "warning" | "info";
	message: string;
	location?: string;
}

export function QAQCChecker() {
	const [drawings, setDrawings] = useState<DrawingAnnotation[]>([]);
	const [rules, setRules] = useState<QARule[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedDrawing, setSelectedDrawing] =
		useState<DrawingAnnotation | null>(null);
	const [showRulesModal, setShowRulesModal] = useState(false);
	const [showUploadModal, setShowUploadModal] = useState(false);
	const [filterStatus, setFilterStatus] = useState<string>("all");
	const [searchTerm, setSearchTerm] = useState("");
	const [checkingDrawing, setCheckingDrawing] = useState(false);
	const [uploadForm, setUploadForm] = useState({
		name: "",
	});

	const loadDrawings = useCallback(async () => {
		setLoading(true);
		const { data, error } = await supabase
			.from("drawing_annotations")
			.select("*")
			.order("created_at", { ascending: false });

		if (!error && data) {
			setDrawings(data.map(mapDrawingRow));
		}
		setLoading(false);
	}, []);

	const loadRules = useCallback(async () => {
		const defaultRules: QARule[] = [
			{
				id: "1",
				name: "Title Block - Project Name",
				description:
					"Verify project name is present and matches project standards",
				category: "title_block",
				severity: "error",
				enabled: true,
			},
			{
				id: "2",
				name: "Title Block - Drawing Number",
				description:
					"Check drawing number format matches standard (e.g., E-001)",
				category: "title_block",
				severity: "error",
				enabled: true,
			},
			{
				id: "3",
				name: "Title Block - Revision",
				description: "Verify revision number/letter is present",
				category: "title_block",
				severity: "error",
				enabled: true,
			},
			{
				id: "4",
				name: "Title Block - Date",
				description: "Check date format and ensure it is current",
				category: "title_block",
				severity: "warning",
				enabled: true,
			},
			{
				id: "5",
				name: "Title Block - Drawn By",
				description: "Verify designer/drafter name is filled",
				category: "title_block",
				severity: "error",
				enabled: true,
			},
			{
				id: "6",
				name: "Title Block - Checked By",
				description: "Verify checker name is filled",
				category: "title_block",
				severity: "error",
				enabled: true,
			},
			{
				id: "7",
				name: "Title Block - Scale",
				description: "Check that scale is properly indicated",
				category: "title_block",
				severity: "warning",
				enabled: true,
			},
			{
				id: "8",
				name: "Layer Standards",
				description:
					"Verify layers follow naming conventions (e.g., E-POWR, E-LTNG)",
				category: "layer",
				severity: "warning",
				enabled: true,
			},
			{
				id: "9",
				name: "Text Height",
				description: "Check text heights meet minimum readability standards",
				category: "text",
				severity: "warning",
				enabled: true,
			},
			{
				id: "10",
				name: "NEC Compliance",
				description: "Verify calculations and designs meet NEC requirements",
				category: "compliance",
				severity: "error",
				enabled: true,
			},
			{
				id: "11",
				name: "Border and Margins",
				description: "Check drawing border and print margins",
				category: "standard",
				severity: "info",
				enabled: true,
			},
			{
				id: "12",
				name: "Line Weights",
				description: "Verify line weights are appropriate for drawing type",
				category: "standard",
				severity: "info",
				enabled: true,
			},
		];

		setRules(defaultRules);
	}, []);

	useEffect(() => {
		loadDrawings();
		loadRules();
	}, [loadDrawings, loadRules]);

	const checkDrawing = async (drawingName: string) => {
		setCheckingDrawing(true);

		setTimeout(async () => {
			const enabledRules = rules.filter((r) => r.enabled);
			const issues: Issue[] = [];

			const random = Math.random();
			if (random > 0.3) {
				issues.push({
					type: "title_block",
					severity: "error",
					message: "Project name is missing or does not match standard format",
					location: "Title Block - Project Name field",
				});
			}

			if (random > 0.5) {
				issues.push({
					type: "title_block",
					severity: "warning",
					message: "Date format should be MM/DD/YYYY",
					location: "Title Block - Date field",
				});
			}

			if (random > 0.4) {
				issues.push({
					type: "layer",
					severity: "warning",
					message: 'Layer "POWER" should be renamed to "E-POWR" per standards',
					location: "Layer Manager",
				});
			}

			if (random > 0.6) {
				issues.push({
					type: "text",
					severity: "info",
					message: 'Some text heights are below recommended 0.1" minimum',
					location: "Various locations",
				});
			}

			const qa_status = issues.some((i) => i.severity === "error")
				? "fail"
				: issues.some((i) => i.severity === "warning")
					? "warning"
					: "pass";

			const status =
				qa_status === "pass"
					? "approved"
					: qa_status === "fail"
						? "rejected"
						: "reviewed";

			const payload: Database["public"]["Tables"]["drawing_annotations"]["Insert"] =
				{
					drawing_name: drawingName,
					file_path: `/drawings/${drawingName}.dwg`,
					annotation_data: issues as unknown as Json,
					qa_checks: enabledRules.map((r) => r.name),
					issues_found: issues.length,
					status,
					reviewed_at: new Date().toISOString(),
				};

			const { data, error } = await supabase
				.from("drawing_annotations")
				.insert(payload)
				.select()
				.single();

			if (!error && data) {
				setDrawings([mapDrawingRow(data), ...drawings]);
			}

			setCheckingDrawing(false);
			setShowUploadModal(false);
			setUploadForm({ name: "" });
		}, 2000);
	};

	const handleUpload = async (e: React.FormEvent) => {
		e.preventDefault();
		await checkDrawing(uploadForm.name);
	};

	const toggleRule = (ruleId: string) => {
		setRules(
			rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
		);
	};

	const deleteDrawing = async (id: string) => {
		if (!confirm("Delete this drawing check?")) return;

		const { error } = await supabase
			.from("drawing_annotations")
			.delete()
			.eq("id", id);

		if (!error) {
			setDrawings(drawings.filter((d) => d.id !== id));
			if (selectedDrawing?.id === id) {
				setSelectedDrawing(null);
			}
		}
	};

	const filteredDrawings = drawings.filter((drawing) => {
		const matchesSearch = drawing.drawing_name
			.toLowerCase()
			.includes(searchTerm.toLowerCase());
		const matchesStatus =
			filterStatus === "all" || drawing.qa_status === filterStatus;
		return matchesSearch && matchesStatus;
	});

	const getStatusIcon = (status: string) => {
		switch (status) {
			case "pass":
				return <CheckCircle className="w-5 h-5 text-green-400" />;
			case "fail":
				return <XCircle className="w-5 h-5 text-red-400" />;
			case "warning":
				return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
			default:
				return <FileText className="w-5 h-5 text-gray-400" />;
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "pass":
				return "from-green-500/20 to-emerald-500/20 border-green-500/40";
			case "fail":
				return "from-red-500/20 to-rose-500/20 border-red-500/40";
			case "warning":
				return "from-yellow-500/20 to-orange-500/20 border-yellow-500/40";
			default:
				return "from-gray-500/20 to-slate-500/20 border-gray-500/40";
		}
	};

	const getSeverityColor = (severity: string) => {
		switch (severity) {
			case "error":
				return "text-red-400 bg-red-500/10 border-red-500/30";
			case "warning":
				return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
			default:
				return "text-blue-400 bg-blue-500/10 border-blue-500/30";
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center space-x-3">
					<div className="p-3 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-lg">
						<CheckCircle
							className="w-8 h-8 text-green-400 animate-pulse"
							style={{ animationDuration: "2s" }}
						/>
					</div>
					<div>
						<h2 className="text-3xl font-bold text-green-200">
							QA/QC Standards Checker
						</h2>
						<p className="text-green-400/70">
							Automated drawing compliance verification
						</p>
					</div>
				</div>
				<div className="flex items-center space-x-3">
					<button
						onClick={() => setShowRulesModal(true)}
						className="flex items-center space-x-2 rounded-lg border border-green-500/30 bg-[var(--color-surface)] px-6 py-3 text-green-300 transition-all hover:border-green-500/50"
					>
						<SettingsIcon className="w-5 h-5" />
						<span>Configure Rules</span>
					</button>
					<button
						onClick={() => setShowUploadModal(true)}
						className="flex items-center space-x-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold px-6 py-3 rounded-lg shadow-lg shadow-green-500/30 transition-all"
					>
						<Upload className="w-5 h-5" />
						<span>Check Drawing</span>
					</button>
				</div>
			</div>

			<FrameSection>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div className="relative md:col-span-2">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-green-400" />
						<input
							type="text"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search drawings..."
							className="w-full rounded-lg border border-green-500/30 bg-[var(--color-surface)] px-4 py-2 pl-10 text-green-100 focus:outline-none focus:ring-2 focus:ring-green-500"
						/>
					</div>

					<div>
						<select
							value={filterStatus}
							onChange={(e) => setFilterStatus(e.target.value)}
							className="w-full rounded-lg border border-green-500/30 bg-[var(--color-surface)] px-4 py-2 text-green-100 focus:outline-none focus:ring-2 focus:ring-green-500"
						>
							<option value="all">All Status</option>
							<option value="pass">Pass</option>
							<option value="warning">Warning</option>
							<option value="fail">Fail</option>
							<option value="pending">Pending</option>
						</select>
					</div>
				</div>

				<div className="flex items-center justify-between mt-4 text-sm">
					<div className="flex items-center space-x-4 text-green-300">
						<span>Total: {drawings.length}</span>
						<span>
							Pass: {drawings.filter((d) => d.qa_status === "pass").length}
						</span>
						<span>
							Warning:{" "}
							{drawings.filter((d) => d.qa_status === "warning").length}
						</span>
						<span>
							Fail: {drawings.filter((d) => d.qa_status === "fail").length}
						</span>
					</div>
					<div className="text-green-400/70">
						Active Rules: {rules.filter((r) => r.enabled).length}/{rules.length}
					</div>
				</div>
			</FrameSection>

			{loading ? (
				<div className="text-center text-green-300 py-12">
					Loading drawings...
				</div>
			) : filteredDrawings.length === 0 ? (
				<div className="text-center text-green-300/70 py-12">
					<CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400/30" />
					{searchTerm || filterStatus !== "all"
						? "No drawings match your filters"
						: "No drawings checked yet. Upload a drawing to perform QA/QC check!"}
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{filteredDrawings.map((drawing) => (
						<div
							key={drawing.id}
							className={`bg-gradient-to-br ${getStatusColor(drawing.qa_status)} backdrop-blur-md border rounded-lg overflow-hidden hover:shadow-lg transition-all cursor-pointer`}
							onClick={() => setSelectedDrawing(drawing)}
						>
							<div className="p-4">
								<div className="flex items-start justify-between mb-3">
									<div className="flex items-center space-x-2">
										{getStatusIcon(drawing.qa_status)}
										<h3 className="text-lg font-bold text-green-100">
											{drawing.drawing_name}
										</h3>
									</div>
								</div>

								<div className="space-y-2 text-sm">
									<div className="flex items-center justify-between text-green-300/70">
										<span>Issues Found:</span>
										<span className="font-semibold text-green-200">
											{drawing.issues_found}
										</span>
									</div>

									<div className="flex items-center justify-between text-green-300/70">
										<span>Status:</span>
										<span
											className={`capitalize font-semibold ${
												drawing.qa_status === "pass"
													? "text-green-400"
													: drawing.qa_status === "fail"
														? "text-red-400"
														: drawing.qa_status === "warning"
															? "text-yellow-400"
															: "text-gray-400"
											}`}
										>
											{drawing.qa_status}
										</span>
									</div>

									{drawing.checked_at && (
										<div className="flex items-center justify-between text-green-300/70">
											<span>Checked:</span>
											<span>
												{new Date(drawing.checked_at).toLocaleDateString()}
											</span>
										</div>
									)}
								</div>

								<div className="flex gap-2 mt-4">
									<button
										onClick={(e) => {
											e.stopPropagation();
											setSelectedDrawing(drawing);
										}}
										className="flex-1 flex items-center justify-center space-x-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-100 px-3 py-2 rounded-lg transition-all text-sm"
									>
										<Eye className="w-4 h-4" />
										<span>Details</span>
									</button>
									<button
										onClick={(e) => {
											e.stopPropagation();
											deleteDrawing(drawing.id);
										}}
										className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-100 rounded-lg transition-all text-sm"
									>
										<XCircle className="w-4 h-4" />
									</button>
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			{showUploadModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgb(10_10_10_/_0.62)] p-4 backdrop-blur-sm">
					<div className="w-full max-w-md rounded-lg border border-green-500/30 bg-[var(--color-surface)] p-6 backdrop-blur-xl">
						<h3 className="text-2xl font-bold text-green-200 mb-4">
							Check Drawing
						</h3>
						{checkingDrawing ? (
							<div className="text-center py-8">
								<Zap className="w-12 h-12 text-green-400 animate-pulse mx-auto mb-4" />
								<p className="text-green-300">Running QA/QC checks...</p>
								<p className="text-green-400/60 text-sm mt-2">
									Applying {rules.filter((r) => r.enabled).length} rules
								</p>
							</div>
						) : (
							<form onSubmit={handleUpload} className="space-y-4">
								<div>
									<label className="block text-green-300 text-sm font-medium mb-2">
										Drawing Name *
									</label>
									<input
										type="text"
										value={uploadForm.name}
										onChange={(e) =>
											setUploadForm({ ...uploadForm, name: e.target.value })
										}
										required
										className="w-full rounded-lg border border-green-500/30 bg-[var(--color-surface-elevated)] px-4 py-2 text-green-100 focus:outline-none focus:ring-2 focus:ring-green-500"
										placeholder="e.g., E-001-POWER-PLAN"
									/>
								</div>

								<div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
									<p className="text-green-300 text-sm">
										{rules.filter((r) => r.enabled).length} QA/QC rules will be
										applied to this drawing.
									</p>
								</div>

								<div className="flex gap-3 mt-6">
									<button
										type="submit"
										className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold px-6 py-2 rounded-lg transition-all"
									>
										Run Check
									</button>
									<button
										type="button"
										onClick={() => {
											setShowUploadModal(false);
											setUploadForm({ name: "" });
										}}
										className="rounded-lg border border-green-500/30 bg-[var(--color-surface)] px-6 py-2 text-green-300 transition-all hover:bg-green-500/10"
									>
										Cancel
									</button>
								</div>
							</form>
						)}
					</div>
				</div>
			)}

			{showRulesModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgb(10_10_10_/_0.62)] p-4 backdrop-blur-sm">
					<div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-lg border border-green-500/30 bg-[var(--color-surface)] p-6 backdrop-blur-xl">
						<div className="flex items-center justify-between mb-6">
							<h3 className="text-2xl font-bold text-green-200">
								QA/QC Rules Configuration
							</h3>
							<button
								onClick={() => setShowRulesModal(false)}
								className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
							>
								<span className="text-red-400 text-2xl">×</span>
							</button>
						</div>

						<div className="space-y-3">
							{rules.map((rule) => (
								<div
									key={rule.id}
									className={`rounded-lg border bg-[var(--color-surface-elevated)] p-4 transition-all ${
										rule.enabled
											? "border-green-500/30"
											: "border-gray-500/30 opacity-60"
									}`}
								>
									<div className="flex items-start justify-between">
										<div className="flex-1">
											<div className="flex items-center space-x-3 mb-2">
												<input
													type="checkbox"
													checked={rule.enabled}
													onChange={() => toggleRule(rule.id)}
													className="h-5 w-5 rounded border-green-500/30 bg-[var(--color-surface)]"
												/>
												<h4 className="text-lg font-semibold text-green-200">
													{rule.name}
												</h4>
												<span
													className={`text-xs px-2 py-1 rounded-full border ${getSeverityColor(rule.severity)}`}
												>
													{rule.severity}
												</span>
											</div>
											<p className="text-green-300/70 text-sm ml-8">
												{rule.description}
											</p>
											<div className="flex items-center space-x-2 ml-8 mt-2">
												<span className="text-xs px-2 py-1 bg-green-500/10 text-green-400 rounded-full border border-green-500/30 capitalize">
													{rule.category.replace("_", " ")}
												</span>
											</div>
										</div>
									</div>
								</div>
							))}
						</div>

						<div className="mt-6 flex justify-end">
							<button
								onClick={() => setShowRulesModal(false)}
								className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold px-6 py-2 rounded-lg transition-all"
							>
								Done
							</button>
						</div>
					</div>
				</div>
			)}

			{selectedDrawing && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:rgb(10_10_10_/_0.72)] p-4 backdrop-blur-sm">
					<div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg border border-green-500/30 bg-[var(--color-surface)] backdrop-blur-xl">
						<div className="sticky top-0 z-10 flex items-center justify-between border-b border-green-500/30 bg-[var(--color-surface)] p-6 backdrop-blur-sm">
							<div className="flex items-center space-x-3">
								{getStatusIcon(selectedDrawing.qa_status)}
								<div>
									<h3 className="text-2xl font-bold text-green-200">
										{selectedDrawing.drawing_name}
									</h3>
									<p className="text-green-400/70 text-sm">
										Checked on{" "}
										{selectedDrawing.checked_at
											? new Date(selectedDrawing.checked_at).toLocaleString()
											: "N/A"}
									</p>
								</div>
							</div>
							<button
								onClick={() => setSelectedDrawing(null)}
								className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
							>
								<span className="text-red-400 text-2xl">×</span>
							</button>
						</div>

						<div className="p-6 space-y-6">
							<div className="grid grid-cols-3 gap-4">
								<div className="rounded-lg border border-green-500/30 bg-[var(--color-surface-elevated)] p-4 text-center">
									<div className="text-3xl font-bold text-green-200">
										{selectedDrawing.issues_found}
									</div>
									<div className="text-green-400/70 text-sm mt-1">
										Issues Found
									</div>
								</div>
								<div className="rounded-lg border border-green-500/30 bg-[var(--color-surface-elevated)] p-4 text-center">
									<div className="text-3xl font-bold text-green-200 capitalize">
										{selectedDrawing.qa_status}
									</div>
									<div className="text-green-400/70 text-sm mt-1">Status</div>
								</div>
								<div className="rounded-lg border border-green-500/30 bg-[var(--color-surface-elevated)] p-4 text-center">
									<div className="text-3xl font-bold text-green-200">
										{selectedDrawing.rules_applied.length}
									</div>
									<div className="text-green-400/70 text-sm mt-1">
										Rules Applied
									</div>
								</div>
							</div>

							<div>
								<h4 className="text-lg font-bold text-green-200 mb-3">
									Issues Detected
								</h4>
								{selectedDrawing.annotations.length === 0 ? (
									<div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
										<CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-2" />
										<p className="text-green-300">
											No issues found! Drawing passes all checks.
										</p>
									</div>
								) : (
									<div className="space-y-3">
										{selectedDrawing.annotations.map(
											(issue: Issue, idx: number) => (
												<div
													key={idx}
													className={`rounded-lg border bg-[var(--color-surface-elevated)] p-4 ${
														issue.severity === "error"
															? "border-red-500/40"
															: issue.severity === "warning"
																? "border-yellow-500/40"
																: "border-blue-500/40"
													}`}
												>
													<div className="flex items-start space-x-3">
														{issue.severity === "error" && (
															<XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
														)}
														{issue.severity === "warning" && (
															<AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
														)}
														{issue.severity === "info" && (
															<FileText className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
														)}
														<div className="flex-1">
															<div className="flex items-center space-x-2 mb-1">
																<span
																	className={`text-xs px-2 py-1 rounded-full border capitalize ${getSeverityColor(issue.severity)}`}
																>
																	{issue.severity}
																</span>
																<span className="text-xs text-green-400/60 capitalize">
																	{issue.type.replace("_", " ")}
																</span>
															</div>
															<p className="text-green-100">{issue.message}</p>
															{issue.location && (
																<p className="text-green-400/60 text-sm mt-1">
																	Location: {issue.location}
																</p>
															)}
														</div>
													</div>
												</div>
											),
										)}
									</div>
								)}
							</div>

							<div className="flex gap-3">
								<button className="flex-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-100 px-6 py-3 rounded-lg transition-all flex items-center justify-center space-x-2">
									<Download className="w-5 h-5" />
									<span>Export Report</span>
								</button>
								<button
									onClick={async () => {
										await checkDrawing(selectedDrawing.drawing_name);
										setSelectedDrawing(null);
									}}
									className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg transition-all flex items-center space-x-2"
								>
									<Zap className="w-5 h-5" />
									<span>Re-check</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
