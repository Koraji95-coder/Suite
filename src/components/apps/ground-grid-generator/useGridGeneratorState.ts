import {
	type ChangeEvent,
	type DragEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { supabase } from "@/supabase/client";
import type { Json } from "@/supabase/database";
import { coordinatesGrabberService } from "./coordinatesGrabberService";
import { exportGridToExcel } from "./excelExport";
import type {
	PasteMode,
	PlotDiffPreview,
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

function toRodRows(designId: string, rows: GridRod[]) {
	return rows.map((rod) => ({
		design_id: designId,
		label: rod.label,
		grid_x: rod.grid_x,
		grid_y: rod.grid_y,
		depth: rod.depth,
		diameter: rod.diameter,
		sort_order: rod.sort_order,
	}));
}

function toConductorRows(designId: string, rows: GridConductor[]) {
	return rows.map((conductor) => ({
		design_id: designId,
		label: conductor.label,
		length: conductor.length,
		x1: conductor.x1,
		y1: conductor.y1,
		x2: conductor.x2,
		y2: conductor.y2,
		diameter: conductor.diameter,
		sort_order: conductor.sort_order,
	}));
}

function dataSignature(rods: GridRod[], conductors: GridConductor[]): string {
	return JSON.stringify({
		rods: rods.map((rod) => [rod.grid_x, rod.grid_y, rod.depth, rod.diameter]),
		conductors: conductors.map((conductor) => [
			conductor.x1,
			conductor.y1,
			conductor.x2,
			conductor.y2,
			conductor.diameter,
		]),
	});
}

type PlotSnapshot = {
	conductors: GridConductor[];
	placements: GridPlacement[];
};

function quantCoord(value: number): number {
	return Math.round(value * 1_000_000);
}

function conductorKey(conductor: GridConductor): string {
	const p1 = `${quantCoord(conductor.x1)},${quantCoord(conductor.y1)}`;
	const p2 = `${quantCoord(conductor.x2)},${quantCoord(conductor.y2)}`;
	return p1 <= p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
}

function placementBaseKey(placement: GridPlacement): string {
	return `${placement.type}|${quantCoord(placement.grid_x)},${quantCoord(placement.grid_y)}`;
}

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
	const [placementLock, setPlacementLock] = useState(false);
	const [placementSourceSignature, setPlacementSourceSignature] =
		useState<string>("");
	const [lastPlottedSnapshot, setLastPlottedSnapshot] =
		useState<PlotSnapshot | null>(null);
	const { pushSnapshot, undo, redo, canUndo, canRedo } = useGridHistory();

	const invalidateGeneratedPlacements = useCallback(() => {
		setPlacements([]);
		setSegmentCount(0);
		setTeeCount(0);
		setCrossCount(0);
		setPlacementSourceSignature("");
	}, []);

	const countPlacementType = useCallback(
		(targetType: GridPlacement["type"], list: GridPlacement[]) =>
			list.filter((placement) => placement.type === targetType).length,
		[],
	);

	const plotDiffPreview = useMemo<PlotDiffPreview>(() => {
		const issues: PlotDiffPreview["issues"] = [];
		const stalePlacements =
			placements.length > 0 &&
			placementSourceSignature !== dataSignature(rods, conductors);
		if (stalePlacements) {
			issues.push({
				severity: "error",
				message: "Placements are stale relative to rods/conductors. Regenerate before plotting.",
			});
		}

		const validTypes = new Set(["ROD", "TEE", "CROSS", "GROUND_ROD_WITH_TEST_WELL"]);
		const unknownTypes = Array.from(
			new Set(
				placements
					.map((placement) => placement.type)
					.filter((type) => !validTypes.has(type)),
			),
		);
		if (unknownTypes.length > 0) {
			issues.push({
				severity: "error",
				message: `Unknown placement type(s): ${unknownTypes.join(", ")}`,
			});
		}

		const placementBuckets = new Map<string, Set<string>>();
		for (const placement of placements) {
			const xy = `${quantCoord(placement.grid_x)},${quantCoord(placement.grid_y)}`;
			const set = placementBuckets.get(xy) || new Set<string>();
			set.add(placement.type);
			placementBuckets.set(xy, set);
		}
		const hardCollisions = Array.from(placementBuckets.values()).filter(
			(types) =>
				types.size > 1 &&
				!(types.size === 2 && types.has("ROD") && types.has("GROUND_ROD_WITH_TEST_WELL")),
		).length;
		if (hardCollisions > 0) {
			issues.push({
				severity: "error",
				message: `Detected ${hardCollisions} placement point collision(s) with mixed types.`,
			});
		}

		if (conductors.length > 0 && placements.length === 0) {
			issues.push({
				severity: "warning",
				message: "No placements are present. Run Generate Grid before plotting.",
			});
		}
		if (!backendConnected) {
			issues.push({
				severity: "warning",
				message: "Backend is currently offline.",
			});
		}
		if (placementLock) {
			issues.push({
				severity: "info",
				message: "Placement lock is ON. Generate Grid keeps existing placements.",
			});
		}

		if (!lastPlottedSnapshot) {
			return {
				hasBaseline: false,
				conductorsAdded: conductors.length,
				conductorsRemoved: 0,
				placementsAdded: placements.length,
				placementsRemoved: 0,
				placementsRotationChanged: 0,
				placementTypeSwaps: 0,
				issues,
				canPlot: issues.every((issue) => issue.severity !== "error"),
			};
		}

		const currentConductorSet = new Set(conductors.map(conductorKey));
		const previousConductorSet = new Set(lastPlottedSnapshot.conductors.map(conductorKey));
		const conductorsAdded = Array.from(currentConductorSet).filter(
			(key) => !previousConductorSet.has(key),
		).length;
		const conductorsRemoved = Array.from(previousConductorSet).filter(
			(key) => !currentConductorSet.has(key),
		).length;

		const currentPlacementMap = new Map(
			placements.map((placement) => [placementBaseKey(placement), placement]),
		);
		const previousPlacementMap = new Map(
			lastPlottedSnapshot.placements.map((placement) => [
				placementBaseKey(placement),
				placement,
			]),
		);
		const placementsAdded = Array.from(currentPlacementMap.keys()).filter(
			(key) => !previousPlacementMap.has(key),
		).length;
		const placementsRemoved = Array.from(previousPlacementMap.keys()).filter(
			(key) => !currentPlacementMap.has(key),
		).length;

		let placementsRotationChanged = 0;
		for (const [key, currentPlacement] of currentPlacementMap) {
			const previousPlacement = previousPlacementMap.get(key);
			if (!previousPlacement) continue;
			if (
				Math.abs(currentPlacement.rotation_deg - previousPlacement.rotation_deg) >
				1e-6
			) {
				placementsRotationChanged++;
			}
		}

		const typeByCoordinateCurrent = new Map<string, string>();
		for (const placement of placements) {
			typeByCoordinateCurrent.set(
				`${quantCoord(placement.grid_x)},${quantCoord(placement.grid_y)}`,
				placement.type,
			);
		}
		const typeByCoordinatePrevious = new Map<string, string>();
		for (const placement of lastPlottedSnapshot.placements) {
			typeByCoordinatePrevious.set(
				`${quantCoord(placement.grid_x)},${quantCoord(placement.grid_y)}`,
				placement.type,
			);
		}
		let placementTypeSwaps = 0;
		for (const [xy, currType] of typeByCoordinateCurrent) {
			const prevType = typeByCoordinatePrevious.get(xy);
			if (prevType && prevType !== currType) placementTypeSwaps++;
		}

		return {
			hasBaseline: true,
			conductorsAdded,
			conductorsRemoved,
			placementsAdded,
			placementsRemoved,
			placementsRotationChanged,
			placementTypeSwaps,
			issues,
			canPlot: issues.every((issue) => issue.severity !== "error"),
		};
	}, [
		backendConnected,
		conductors,
		lastPlottedSnapshot,
		placementLock,
		placementSourceSignature,
		placements,
		rods,
	]);

	const replaceDesignEntities = useCallback(
		async (designId: string) => {
			const [backupRodsRes, backupCondsRes] = await Promise.all([
				supabase
					.from("ground_grid_rods")
					.select("*")
					.eq("design_id", designId)
					.order("sort_order"),
				supabase
					.from("ground_grid_conductors")
					.select("*")
					.eq("design_id", designId)
					.order("sort_order"),
			]);
			if (backupRodsRes.error) throw backupRodsRes.error;
			if (backupCondsRes.error) throw backupCondsRes.error;

			const backupRods = (backupRodsRes.data || []) as GridRod[];
			const backupConds = (backupCondsRes.data || []) as GridConductor[];

			try {
				const { error: deleteRodsErr } = await supabase
					.from("ground_grid_rods")
					.delete()
					.eq("design_id", designId);
				if (deleteRodsErr) throw deleteRodsErr;

				const { error: deleteCondsErr } = await supabase
					.from("ground_grid_conductors")
					.delete()
					.eq("design_id", designId);
				if (deleteCondsErr) throw deleteCondsErr;

				if (rods.length > 0) {
					const { error: rodsErr } = await supabase
						.from("ground_grid_rods")
						.insert(toRodRows(designId, rods));
					if (rodsErr) throw rodsErr;
				}

				if (conductors.length > 0) {
					const { error: condsErr } = await supabase
						.from("ground_grid_conductors")
						.insert(toConductorRows(designId, conductors));
					if (condsErr) throw condsErr;
				}
			} catch (saveErr: unknown) {
				let rollbackErrorText = "";
				try {
					await supabase.from("ground_grid_rods").delete().eq("design_id", designId);
					await supabase
						.from("ground_grid_conductors")
						.delete()
						.eq("design_id", designId);
					if (backupRods.length > 0) {
						const { error: restoreRodsErr } = await supabase
							.from("ground_grid_rods")
							.insert(toRodRows(designId, backupRods));
						if (restoreRodsErr) throw restoreRodsErr;
					}
					if (backupConds.length > 0) {
						const { error: restoreCondsErr } = await supabase
							.from("ground_grid_conductors")
							.insert(toConductorRows(designId, backupConds));
						if (restoreCondsErr) throw restoreCondsErr;
					}
				} catch (rollbackErr: unknown) {
					rollbackErrorText =
						rollbackErr && typeof rollbackErr === "object" && "message" in rollbackErr
							? ` Rollback failed: ${(rollbackErr as { message: string }).message}`
							: ` Rollback failed: ${String(rollbackErr)}`;
				}
				const message =
					saveErr && typeof saveErr === "object" && "message" in saveErr
						? (saveErr as { message: string }).message
						: String(saveErr);
				throw new Error(`${message}${rollbackErrorText}`);
			}
		},
		[conductors, rods],
	);

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
		invalidateGeneratedPlacements();
		setLastPlottedSnapshot(null);
		setPlacementLock(false);
	}, [invalidateGeneratedPlacements]);

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

				await replaceDesignEntities(currentDesign.id);

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
							.insert(toRodRows(design.id, rods));
						if (rodsErr) throw rodsErr;
					}
					if (conductors.length > 0) {
						const { error: condsErr } = await supabase
							.from("ground_grid_conductors")
							.insert(toConductorRows(design.id, conductors));
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
		invalidateGeneratedPlacements();
		setLastPlottedSnapshot(null);
		setPlacementLock(false);
		setLinkedProjectId(null);
		void loadDesigns();
		showToast("success", "Design deleted");
	};

	const newDesign = () => {
		setCurrentDesign(null);
		setDesignName("New Ground Grid Design");
		setRods([]);
		setConductors([]);
		invalidateGeneratedPlacements();
		setLastPlottedSnapshot(null);
		setPlacementLock(false);
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
			const effectivePlacements =
				placementLock && placements.length > 0 ? placements : result.placements;
			setPlacements(effectivePlacements);
			setSegmentCount(result.segmentCount);
			if (placementLock && placements.length > 0) {
				setTeeCount(countPlacementType("TEE", placements));
				setCrossCount(countPlacementType("CROSS", placements));
				addLog(
					"generator",
					"[WARNING] Placement lock is ON. Generated placements were not applied.",
				);
			} else {
				setTeeCount(result.teeCount);
				setCrossCount(result.crossCount);
			}
			setPlacementSourceSignature(dataSignature(rods, conductors));

			if (currentDesign) {
				void supabase.from("ground_grid_results").insert({
					design_id: currentDesign.id,
					placements: effectivePlacements as unknown as Json,
					segment_count: result.segmentCount,
					tee_count:
						placementLock && placements.length > 0
							? countPlacementType("TEE", placements)
							: result.teeCount,
					cross_count:
						placementLock && placements.length > 0
							? countPlacementType("CROSS", placements)
							: result.crossCount,
					rod_count: rods.length,
					total_conductor_length: totalConductorLength(conductors),
				});
			}

			setGenerating(false);
			addLog(
				"generator",
				`[SUCCESS] Generated ${result.placements.length} placements (${result.teeCount} tees, ${result.crossCount} crosses, ${conductors.length} conductors)`,
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
					invalidateGeneratedPlacements();
					showToast("success", `Imported ${parsed.length} conductors`);
					return;
				}
			}

			const parsedRods = parseRodsText(text);
			if (parsedRods.length > 0) {
				pushSnapshot(rods, conductors, placements);
				setRods(parsedRods);
				invalidateGeneratedPlacements();
				showToast("success", `Imported ${parsedRods.length} rods`);
				return;
			}

			const parsedConds = parseConductorsText(text);
			if (parsedConds.length > 0) {
				pushSnapshot(rods, conductors, placements);
				setConductors(parsedConds);
				invalidateGeneratedPlacements();
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
				invalidateGeneratedPlacements();
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
				invalidateGeneratedPlacements();
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
		invalidateGeneratedPlacements();
		setLastPlottedSnapshot(null);
		setPlacementLock(false);
		showToast("success", "All data cleared");
	};

	const loadSampleData = () => {
		pushSnapshot(rods, conductors, placements);
		const parsedRods = parseRodsText(SAMPLE_RODS_TEXT);
		const parsedConds = parseConductorsText(SAMPLE_CONDUCTORS_TEXT);
		setRods(parsedRods);
		setConductors(parsedConds);
		invalidateGeneratedPlacements();
		setLastPlottedSnapshot(null);
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
			setPlacementSourceSignature(
				snapshot.placements.length > 0
					? dataSignature(snapshot.rods, snapshot.conductors)
					: "",
			);
			setTeeCount(countPlacementType("TEE", snapshot.placements));
			setCrossCount(countPlacementType("CROSS", snapshot.placements));
			setSegmentCount(0);
		}
	}, [undo, rods, conductors, placements, countPlacementType]);

	const handleRedo = useCallback(() => {
		const snapshot = redo(rods, conductors, placements);
		if (snapshot) {
			setRods(snapshot.rods);
			setConductors(snapshot.conductors);
			setPlacements(snapshot.placements);
			setPlacementSourceSignature(
				snapshot.placements.length > 0
					? dataSignature(snapshot.rods, snapshot.conductors)
					: "",
			);
			setTeeCount(countPlacementType("TEE", snapshot.placements));
			setCrossCount(countPlacementType("CROSS", snapshot.placements));
			setSegmentCount(0);
		}
	}, [redo, rods, conductors, placements, countPlacementType]);

	const handleManualRodsChange = useCallback(
		(newRods: GridRod[]) => {
			pushSnapshot(rods, conductors, placements);
			setRods(newRods);
			invalidateGeneratedPlacements();
		},
		[rods, conductors, placements, pushSnapshot, invalidateGeneratedPlacements],
	);

	const handleManualConductorsChange = useCallback(
		(newConductors: GridConductor[]) => {
			pushSnapshot(rods, conductors, placements);
			setConductors(newConductors);
			invalidateGeneratedPlacements();
		},
		[rods, conductors, placements, pushSnapshot, invalidateGeneratedPlacements],
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

	const handlePlotToAutoCad = useCallback(async () => {
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
		if (conductors.length === 0 && placements.length === 0) {
			addLog("generator", "[ERROR] Nothing to plot - generate or load grid data first");
			showToast("error", "Nothing to plot");
			return;
		}
		if (
			placements.length > 0 &&
			placementSourceSignature !== dataSignature(rods, conductors)
		) {
			addLog(
				"generator",
				"[ERROR] Placements are stale relative to rods/conductors. Regenerate before plotting.",
			);
			showToast("error", "Placements are stale. Regenerate grid first.");
			return;
		}

		addLog("generator", "[PROCESSING] Plotting to active AutoCAD drawing...");
		const plotConfig = {
			...config,
			grid_max_y: computeGridMaxY(rods, conductors),
		};
		const result = await coordinatesGrabberService.plotGroundGrid({
			conductors: conductors.map((conductor) => ({
				x1: conductor.x1,
				y1: conductor.y1,
				x2: conductor.x2,
				y2: conductor.y2,
			})),
			placements: placements.map((placement) => ({
				type: placement.type,
				grid_x: placement.grid_x,
				grid_y: placement.grid_y,
				autocad_x: placement.autocad_x,
				autocad_y: placement.autocad_y,
				rotation_deg: placement.rotation_deg,
			})),
			config: {
				origin_x_feet: plotConfig.origin_x_feet,
				origin_x_inches: plotConfig.origin_x_inches,
				origin_y_feet: plotConfig.origin_y_feet,
				origin_y_inches: plotConfig.origin_y_inches,
				block_scale: plotConfig.block_scale,
				layer_name: plotConfig.layer_name,
				grid_max_y: plotConfig.grid_max_y,
			},
		});

		if (!result.success) {
			addLog(
				"generator",
				`[ERROR] Plot failed: ${result.error_details || result.message}`,
			);
			showToast("error", result.message);
			return;
		}

		setLastPlottedSnapshot({
			conductors: conductors.map((conductor) => ({ ...conductor })),
			placements: placements.map((placement) => ({ ...placement })),
		});

		const testWellInfo = result.test_well_block_name
			? ` (test-well block: ${result.test_well_block_name})`
			: "";
		addLog("generator", `[SUCCESS] ${result.message}${testWellInfo}`);
		showToast(
			"success",
			`Plotted ${result.lines_drawn} lines and ${result.blocks_inserted} placements`,
		);
	}, [
		backendConnected,
		showToast,
		addLog,
		conductors,
		placements,
		config,
		rods,
		placementSourceSignature,
	]);

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
		plotDiffPreview,
		placementLock,
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
		setPlacementLock,
		setRods,
		setSoilResistivity,
		setTeeCount,
		soilResistivity,
		teeCount,
		clearAll,
	};
}
