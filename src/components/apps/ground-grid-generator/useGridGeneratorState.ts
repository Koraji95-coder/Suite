import {
	type ChangeEvent,
	type DragEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { supabase } from "@/supabase/client";
import type { Json } from "@/supabase/database";
import { exportGridToExcel } from "./excelExport";
import type {
	PasteMode,
	PreviewMode,
	ProjectOption,
} from "./GridGeneratorPanelModels";
import { useGroundGrid } from "./GroundGridContext";
import {
	computeGridMaxY,
	generatePlacements,
	parseConductorsText,
	parseRodsText,
	totalConductorLength,
} from "./gridEngine";
import { generateGridReport } from "./gridPdfExport";
import { SAMPLE_CONDUCTORS_TEXT, SAMPLE_RODS_TEXT } from "./sampleData";
import type {
	GridConductor,
	GridConfig,
	GridDesign,
	GridPlacement,
	GridRod,
} from "./types";
import { DEFAULT_CONFIG } from "./types";
import { useGridHistory } from "./useGridHistory";

export function useGridGeneratorState(designIdParam: string | null) {
	const { showToast } = useToast();
	const { addLog, backendConnected } = useGroundGrid();
	const [designs, setDesigns] = useState<GridDesign[]>([]);
	const [currentDesign, setCurrentDesign] = useState<GridDesign | null>(null);
	const [designName, setDesignName] = useState("New Ground Grid Design");
	const [rods, setRods] = useState<GridRod[]>([]);
	const [conductors, setConductors] = useState<GridConductor[]>([]);
	const [placements, setPlacements] = useState<GridPlacement[]>([]);
	const [segmentCount, setSegmentCount] = useState(0);
	const [teeCount, setTeeCount] = useState(0);
	const [crossCount, setCrossCount] = useState(0);
	const [config, setConfig] = useState<GridConfig>(DEFAULT_CONFIG);
	const [projects, setProjects] = useState<ProjectOption[]>([]);
	const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [saving, setSaving] = useState(false);
	const [pasteMode, setPasteMode] = useState<PasteMode>("rods");
	const [pasteText, setPasteText] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [previewMode, setPreviewMode] = useState<PreviewMode>("2d");
	const [soilResistivity, setSoilResistivity] = useState(100);
	const [faultCurrent, setFaultCurrent] = useState(5000);
	const { pushSnapshot, undo, redo, canUndo, canRedo } = useGridHistory();

	const loadDesigns = useCallback(async () => {
		const { data } = await supabase
			.from("ground_grid_designs")
			.select("*")
			.order("updated_at", { ascending: false });
		if (data) setDesigns(data as GridDesign[]);
	}, []);

	const loadProjects = useCallback(async () => {
		const { data } = await supabase
			.from("projects")
			.select("id, name, color")
			.order("name");
		if (data) setProjects(data as ProjectOption[]);
	}, []);

	const loadDesign = useCallback(async (design: GridDesign) => {
		setCurrentDesign(design);
		setDesignName(design.name);
		setLinkedProjectId(design.project_id);
		if (design.config && Object.keys(design.config).length > 0) {
			setConfig({ ...DEFAULT_CONFIG, ...design.config });
		}

		const [rodsRes, condsRes] = await Promise.all([
			supabase
				.from("ground_grid_rods")
				.select("*")
				.eq("design_id", design.id)
				.order("sort_order"),
			supabase
				.from("ground_grid_conductors")
				.select("*")
				.eq("design_id", design.id)
				.order("sort_order"),
		]);

		const loadedRods = (rodsRes.data || []) as GridRod[];
		const loadedConds = (condsRes.data || []) as GridConductor[];
		setRods(loadedRods);
		setConductors(loadedConds);
		setPlacements([]);
		setSegmentCount(0);
		setTeeCount(0);
		setCrossCount(0);
	}, []);

	useEffect(() => {
		void loadDesigns();
		void loadProjects();
	}, [loadDesigns, loadProjects]);

	useEffect(() => {
		if (designIdParam && designs.length > 0) {
			const found = designs.find((design) => design.id === designIdParam);
			if (found) {
				void loadDesign(found);
			}
		}
	}, [designIdParam, designs, loadDesign]);

	const saveDesign = async () => {
		setSaving(true);
		addLog("generator", "[PROCESSING] Saving design...");
		try {
			const configPayload = config as unknown as Json;
			if (currentDesign) {
				const { error: updateErr } = await supabase
					.from("ground_grid_designs")
					.update({
						name: designName,
						project_id: linkedProjectId,
						config: configPayload,
						updated_at: new Date().toISOString(),
					})
					.eq("id", currentDesign.id);
				if (updateErr) throw updateErr;

				await supabase
					.from("ground_grid_rods")
					.delete()
					.eq("design_id", currentDesign.id);
				await supabase
					.from("ground_grid_conductors")
					.delete()
					.eq("design_id", currentDesign.id);

				if (rods.length > 0) {
					const { error: rodsErr } = await supabase
						.from("ground_grid_rods")
						.insert(
							rods.map((rod) => ({
								design_id: currentDesign.id,
								label: rod.label,
								grid_x: rod.grid_x,
								grid_y: rod.grid_y,
								depth: rod.depth,
								diameter: rod.diameter,
								sort_order: rod.sort_order,
							})),
						);
					if (rodsErr) throw rodsErr;
				}
				if (conductors.length > 0) {
					const { error: condsErr } = await supabase
						.from("ground_grid_conductors")
						.insert(
							conductors.map((conductor) => ({
								design_id: currentDesign.id,
								label: conductor.label,
								length: conductor.length,
								x1: conductor.x1,
								y1: conductor.y1,
								x2: conductor.x2,
								y2: conductor.y2,
								diameter: conductor.diameter,
								sort_order: conductor.sort_order,
							})),
						);
					if (condsErr) throw condsErr;
				}

				addLog("generator", "[SUCCESS] Design saved");
				showToast("success", "Design saved");
			} else {
				const { data, error: insertErr } = await supabase
					.from("ground_grid_designs")
					.insert({
						name: designName,
						project_id: linkedProjectId,
						config: configPayload,
					})
					.select()
					.maybeSingle();
				if (insertErr) throw insertErr;

				if (data) {
					const design = data as GridDesign;
					setCurrentDesign(design);

					if (rods.length > 0) {
						const { error: rodsErr } = await supabase
							.from("ground_grid_rods")
							.insert(
								rods.map((rod) => ({
									design_id: design.id,
									label: rod.label,
									grid_x: rod.grid_x,
									grid_y: rod.grid_y,
									depth: rod.depth,
									diameter: rod.diameter,
									sort_order: rod.sort_order,
								})),
							);
						if (rodsErr) throw rodsErr;
					}
					if (conductors.length > 0) {
						const { error: condsErr } = await supabase
							.from("ground_grid_conductors")
							.insert(
								conductors.map((conductor) => ({
									design_id: design.id,
									label: conductor.label,
									length: conductor.length,
									x1: conductor.x1,
									y1: conductor.y1,
									x2: conductor.x2,
									y2: conductor.y2,
									diameter: conductor.diameter,
									sort_order: conductor.sort_order,
								})),
							);
						if (condsErr) throw condsErr;
					}

					addLog("generator", "[SUCCESS] Design created");
					showToast("success", "Design created");
					void loadDesigns();
				}
			}
		} catch (error: unknown) {
			const message =
				error && typeof error === "object" && "message" in error
					? (error as { message: string }).message
					: String(error);
			addLog("generator", `[ERROR] Save failed: ${message}`);
			showToast("error", `Failed to save: ${message}`);
		} finally {
			setSaving(false);
		}
	};

	const deleteDesign = async () => {
		if (!currentDesign) return;
		await supabase
			.from("ground_grid_designs")
			.delete()
			.eq("id", currentDesign.id);
		setCurrentDesign(null);
		setDesignName("New Ground Grid Design");
		setRods([]);
		setConductors([]);
		setPlacements([]);
		setLinkedProjectId(null);
		void loadDesigns();
		showToast("success", "Design deleted");
	};

	const newDesign = () => {
		setCurrentDesign(null);
		setDesignName("New Ground Grid Design");
		setRods([]);
		setConductors([]);
		setPlacements([]);
		setSegmentCount(0);
		setTeeCount(0);
		setCrossCount(0);
		setLinkedProjectId(null);
		setConfig(DEFAULT_CONFIG);
	};

	const runGeneration = () => {
		if (conductors.length === 0) {
			showToast("error", "No conductor data to process");
			return;
		}
		setGenerating(true);
		addLog("generator", "[PROCESSING] Generating grid placements...");
		requestAnimationFrame(() => {
			const maxY = computeGridMaxY(rods, conductors);
			const nextConfig = { ...config, grid_max_y: maxY };
			setConfig(nextConfig);
			const result = generatePlacements(rods, conductors, nextConfig);
			setPlacements(result.placements);
			setSegmentCount(result.segmentCount);
			setTeeCount(result.teeCount);
			setCrossCount(result.crossCount);

			if (currentDesign) {
				void supabase.from("ground_grid_results").insert({
					design_id: currentDesign.id,
					placements: result.placements as unknown as Json,
					segment_count: result.segmentCount,
					tee_count: result.teeCount,
					cross_count: result.crossCount,
					rod_count: rods.length,
					total_conductor_length: totalConductorLength(conductors),
				});
			}

			setGenerating(false);
			addLog(
				"generator",
				`[SUCCESS] Generated ${result.placements.length} placements (${result.teeCount} tees, ${result.crossCount} crosses, ${result.segmentCount} segments)`,
			);
			showToast("success", `Generated: ${result.placements.length} placements`);
		});
	};

	const processFile = (file: File) => {
		const reader = new FileReader();
		reader.onload = (event) => {
			const text = event.target?.result as string;
			if (!text) return;
			const lines = text.trim().split("\n");
			const firstLine =
				lines[0]?.trim().replace(/,/g, "\t").split(/\s+/).filter(Boolean) || [];

			if (firstLine.length >= 8 || firstLine[0]?.match(/^\d+$/)) {
				const parsed = parseConductorsText(text);
				if (parsed.length > 0) {
					pushSnapshot(rods, conductors, placements);
					setConductors(parsed);
					showToast("success", `Imported ${parsed.length} conductors`);
					return;
				}
			}

			const parsedRods = parseRodsText(text);
			if (parsedRods.length > 0) {
				pushSnapshot(rods, conductors, placements);
				setRods(parsedRods);
				showToast("success", `Imported ${parsedRods.length} rods`);
				return;
			}

			const parsedConds = parseConductorsText(text);
			if (parsedConds.length > 0) {
				pushSnapshot(rods, conductors, placements);
				setConductors(parsedConds);
				showToast("success", `Imported ${parsedConds.length} conductors`);
				return;
			}

			showToast("error", "Could not parse file data");
		};
		reader.readAsText(file);
	};

	const handleFileDrop = (event: DragEvent) => {
		event.preventDefault();
		setIsDragging(false);
		const file = event.dataTransfer.files[0];
		if (file) processFile(file);
	};

	const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) processFile(file);
		if (fileInputRef.current) fileInputRef.current.value = "";
	};

	const applyPaste = () => {
		if (!pasteText.trim()) return;
		if (pasteMode === "rods") {
			const parsed = parseRodsText(pasteText);
			if (parsed.length > 0) {
				pushSnapshot(rods, conductors, placements);
				setRods(parsed);
				setPasteText("");
				showToast("success", `Parsed ${parsed.length} rods`);
			} else {
				showToast("error", "Could not parse rod data");
			}
		} else {
			const parsed = parseConductorsText(pasteText);
			if (parsed.length > 0) {
				pushSnapshot(rods, conductors, placements);
				setConductors(parsed);
				setPasteText("");
				showToast("success", `Parsed ${parsed.length} conductors`);
			} else {
				showToast("error", "Could not parse conductor data");
			}
		}
	};

	const clearAll = () => {
		pushSnapshot(rods, conductors, placements);
		setRods([]);
		setConductors([]);
		setPlacements([]);
		setSegmentCount(0);
		setTeeCount(0);
		setCrossCount(0);
		showToast("success", "All data cleared");
	};

	const loadSampleData = () => {
		pushSnapshot(rods, conductors, placements);
		const parsedRods = parseRodsText(SAMPLE_RODS_TEXT);
		const parsedConds = parseConductorsText(SAMPLE_CONDUCTORS_TEXT);
		setRods(parsedRods);
		setConductors(parsedConds);
		showToast(
			"success",
			`Loaded ${parsedRods.length} rods, ${parsedConds.length} conductors`,
		);
	};

	const handleUndo = useCallback(() => {
		const snapshot = undo(rods, conductors, placements);
		if (snapshot) {
			setRods(snapshot.rods);
			setConductors(snapshot.conductors);
			setPlacements(snapshot.placements);
		}
	}, [undo, rods, conductors, placements]);

	const handleRedo = useCallback(() => {
		const snapshot = redo(rods, conductors, placements);
		if (snapshot) {
			setRods(snapshot.rods);
			setConductors(snapshot.conductors);
			setPlacements(snapshot.placements);
		}
	}, [redo, rods, conductors, placements]);

	const handleManualRodsChange = useCallback(
		(newRods: GridRod[]) => {
			pushSnapshot(rods, conductors, placements);
			setRods(newRods);
		},
		[rods, conductors, placements, pushSnapshot],
	);

	const handleManualConductorsChange = useCallback(
		(newConductors: GridConductor[]) => {
			pushSnapshot(rods, conductors, placements);
			setConductors(newConductors);
		},
		[rods, conductors, placements, pushSnapshot],
	);

	const handleManualPlacementsChange = useCallback(
		(newPlacements: GridPlacement[]) => {
			setPlacements(newPlacements);
		},
		[],
	);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
			if ((event.ctrlKey || event.metaKey) && event.key === "z") {
				if (event.shiftKey) {
					event.preventDefault();
					handleRedo();
				} else {
					event.preventDefault();
					handleUndo();
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [handleUndo, handleRedo]);

	const linkedProject = projects.find(
		(project) => project.id === linkedProjectId,
	);

	const handleDesignSelect = useCallback(
		(designId: string) => {
			const selected = designs.find((design) => design.id === designId);
			if (selected) {
				void loadDesign(selected);
			}
		},
		[designs, loadDesign],
	);

	const handleProjectSelect = useCallback((projectId: string) => {
		setLinkedProjectId(projectId === "__none" ? null : projectId);
	}, []);

	const handleExcelExport = useCallback(async () => {
		addLog("generator", "[PROCESSING] Exporting to Excel...");
		try {
			await exportGridToExcel(designName, placements, rods, conductors);
			addLog("generator", "[SUCCESS] Excel file exported");
			showToast("success", "Excel file exported");
		} catch (error: unknown) {
			const message =
				error && typeof error === "object" && "message" in error
					? (error as { message: string }).message
					: String(error);
			addLog("generator", `[ERROR] Excel export failed: ${message}`);
			showToast("error", `Excel export failed: ${message}`);
		}
	}, [addLog, designName, placements, rods, conductors, showToast]);

	const handlePdfExport = useCallback(() => {
		generateGridReport({
			designName,
			rods,
			conductors,
			placements,
			segments: segmentCount,
			tees: teeCount,
			crosses: crossCount,
		});
	}, [
		designName,
		rods,
		conductors,
		placements,
		segmentCount,
		teeCount,
		crossCount,
	]);

	const handlePlotToAutoCad = useCallback(() => {
		if (!backendConnected) {
			showToast(
				"error",
				"AutoCAD backend is offline. Check the log for more details.",
			);
			addLog(
				"generator",
				"[ERROR] Cannot plot to AutoCAD - backend is not connected",
			);
			return;
		}
		addLog("generator", "[PROCESSING] Plotting to active AutoCAD drawing...");
		showToast("info", "Plot to AutoCAD is not yet implemented");
	}, [backendConnected, showToast, addLog]);

	return {
		applyPaste,
		backendConnected,
		canRedo,
		canUndo,
		conductors,
		crossCount,
		currentDesign,
		deleteDesign,
		designName,
		designs,
		faultCurrent,
		fileInputRef,
		generating,
		handleDesignSelect,
		handleExcelExport,
		handleFileDrop,
		handleFileSelect,
		handleManualConductorsChange,
		handleManualPlacementsChange,
		handleManualRodsChange,
		handlePdfExport,
		handlePlotToAutoCad,
		handleProjectSelect,
		handleRedo,
		handleUndo,
		isDragging,
		linkedProject,
		linkedProjectId,
		loadSampleData,
		newDesign,
		pasteMode,
		pasteText,
		placements,
		previewMode,
		projects,
		rods,
		runGeneration,
		saveDesign,
		saving,
		segmentCount,
		setConductors,
		setCrossCount,
		setDesignName,
		setFaultCurrent,
		setIsDragging,
		setPasteMode,
		setPasteText,
		setPlacements,
		setPreviewMode,
		setRods,
		setSoilResistivity,
		setTeeCount,
		soilResistivity,
		teeCount,
		clearAll,
	};
}
