import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { supabase } from "@/supabase/client";
import {
	buildDrawingAnnotationInsert,
	DEFAULT_QA_RULES,
	type DrawingAnnotation,
	type Issue,
	mapDrawingRow,
	type QARule,
} from "./qaqcModels";

const DEFAULT_UPLOAD_FORM = {
	name: "",
};

export function useQAQCCheckerState() {
	const { showToast } = useToast();
	const [drawings, setDrawings] = useState<DrawingAnnotation[]>([]);
	const [rules, setRules] = useState<QARule[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedDrawing, setSelectedDrawing] =
		useState<DrawingAnnotation | null>(null);
	const [showRulesModal, setShowRulesModal] = useState(false);
	const [showUploadModal, setShowUploadModal] = useState(false);
	const [pendingDeleteDrawing, setPendingDeleteDrawing] =
		useState<DrawingAnnotation | null>(null);
	const [filterStatus, setFilterStatus] = useState<string>("all");
	const [searchTerm, setSearchTerm] = useState("");
	const [checkingDrawing, setCheckingDrawing] = useState(false);
	const [uploadForm, setUploadForm] = useState(DEFAULT_UPLOAD_FORM);

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
		setRules(DEFAULT_QA_RULES);
	}, []);

	useEffect(() => {
		void loadDrawings();
		void loadRules();
	}, [loadDrawings, loadRules]);

	const checkDrawing = useCallback(
		async (drawingName: string) => {
			setCheckingDrawing(true);

			setTimeout(() => {
				void (async () => {
					try {
						const enabledRules = rules.filter((rule) => rule.enabled);
						const issues: Issue[] = [];

						const random = Math.random();
						if (random > 0.3) {
							issues.push({
								type: "title_block",
								severity: "error",
								message:
									"Project name is missing or does not match standard format",
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
								message:
									'Layer "POWER" should be renamed to "E-POWR" per standards',
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

						const qaStatus = issues.some((issue) => issue.severity === "error")
							? "fail"
							: issues.some((issue) => issue.severity === "warning")
								? "warning"
								: "pass";

						const payload = buildDrawingAnnotationInsert(
							drawingName,
							issues,
							enabledRules.map((rule) => rule.name),
							qaStatus,
						);

						const { data, error } = await supabase
							.from("drawing_annotations")
							.insert(payload)
							.select()
							.single();

						if (!error && data) {
							setDrawings((prev) => [mapDrawingRow(data), ...prev]);
							showToast("success", "QA/QC check completed.");
						} else {
							showToast("error", "Failed to save QA/QC check.");
						}
					} finally {
						setCheckingDrawing(false);
						setShowUploadModal(false);
						setUploadForm(DEFAULT_UPLOAD_FORM);
					}
				})();
			}, 2000);
		},
		[rules, showToast],
	);

	const handleUpload = async (event: FormEvent) => {
		event.preventDefault();
		await checkDrawing(uploadForm.name);
	};

	const toggleRule = (ruleId: string) => {
		setRules((prev) =>
			prev.map((rule) =>
				rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule,
			),
		);
	};

	const confirmDeleteDrawing = async () => {
		if (!pendingDeleteDrawing) return;
		const id = pendingDeleteDrawing.id;
		const { error } = await supabase
			.from("drawing_annotations")
			.delete()
			.eq("id", id);

		if (!error) {
			setDrawings((prev) => prev.filter((drawing) => drawing.id !== id));
			setSelectedDrawing((prev) => (prev?.id === id ? null : prev));
			showToast("success", "Drawing check deleted.");
		} else {
			showToast("error", "Failed to delete drawing check.");
		}
		setPendingDeleteDrawing(null);
	};

	const filteredDrawings = useMemo(() => {
		return drawings.filter((drawing) => {
			const matchesSearch = drawing.drawing_name
				.toLowerCase()
				.includes(searchTerm.toLowerCase());
			const matchesStatus =
				filterStatus === "all" || drawing.qa_status === filterStatus;
			return matchesSearch && matchesStatus;
		});
	}, [drawings, searchTerm, filterStatus]);

	const stats = useMemo(() => {
		return {
			total: drawings.length,
			pass: drawings.filter((drawing) => drawing.qa_status === "pass").length,
			warning: drawings.filter((drawing) => drawing.qa_status === "warning")
				.length,
			fail: drawings.filter((drawing) => drawing.qa_status === "fail").length,
		};
	}, [drawings]);

	const enabledRuleCount = useMemo(
		() => rules.filter((rule) => rule.enabled).length,
		[rules],
	);

	const closeUploadModal = () => {
		setShowUploadModal(false);
		setUploadForm(DEFAULT_UPLOAD_FORM);
	};

	return {
		checkDrawing,
		checkingDrawing,
		closeUploadModal,
		confirmDeleteDrawing,
		enabledRuleCount,
		filterStatus,
		filteredDrawings,
		handleUpload,
		loading,
		pendingDeleteDrawing,
		rules,
		searchTerm,
		selectedDrawing,
		setFilterStatus,
		setPendingDeleteDrawing,
		setSearchTerm,
		setSelectedDrawing,
		setShowRulesModal,
		setShowUploadModal,
		setUploadForm,
		showRulesModal,
		showUploadModal,
		stats,
		toggleRule,
		uploadForm,
	};
}
