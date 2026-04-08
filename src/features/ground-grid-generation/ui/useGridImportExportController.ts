import {
	type ChangeEvent,
	type DragEvent,
	useCallback,
	useRef,
	useState,
} from "react";
import { useToast } from "@/components/notification-system/ToastProvider";
import { generateGridReport } from "./gridPdfExport";
import {
	parseConductorsText,
	parseRodsText,
} from "./gridEngine";
import { SAMPLE_CONDUCTORS_TEXT, SAMPLE_RODS_TEXT } from "./sampleData";
import type { GridConductor, GridPlacement, GridRod } from "./types";

interface UseGridImportExportControllerOptions {
	addLog: (source: "grabber" | "generator" | "system", message: string) => void;
	designName: string;
	rods: GridRod[];
	conductors: GridConductor[];
	placements: GridPlacement[];
	segmentCount: number;
	teeCount: number;
	crossCount: number;
	pushSnapshot: (
		rods: GridRod[],
		conductors: GridConductor[],
		placements: GridPlacement[],
	) => void;
	invalidateGeneratedPlacements: () => void;
	setRods: (rows: GridRod[]) => void;
	setConductors: (rows: GridConductor[]) => void;
	setPlacements: (rows: GridPlacement[]) => void;
	setPlacementLock: (locked: boolean) => void;
	setLastPlottedSnapshot: (
		snapshot:
			| {
					conductors: GridConductor[];
					placements: GridPlacement[];
			  }
			| null,
	) => void;
}

export function useGridImportExportController({
	addLog,
	designName,
	rods,
	conductors,
	placements,
	segmentCount,
	teeCount,
	crossCount,
	pushSnapshot,
	invalidateGeneratedPlacements,
	setRods,
	setConductors,
	setPlacements,
	setPlacementLock,
	setLastPlottedSnapshot,
}: UseGridImportExportControllerOptions) {
	const { showToast } = useToast();
	const [isDragging, setIsDragging] = useState(false);
	const [pasteMode, setPasteMode] = useState<"rods" | "conductors">("rods");
	const [pasteText, setPasteText] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const processFile = useCallback(
		(file: File) => {
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
		},
		[
			conductors,
			invalidateGeneratedPlacements,
			placements,
			pushSnapshot,
			rods,
			setConductors,
			setRods,
			showToast,
		],
	);

	const handleFileDrop = useCallback(
		(event: DragEvent) => {
			event.preventDefault();
			setIsDragging(false);
			const file = event.dataTransfer.files[0];
			if (file) processFile(file);
		},
		[processFile],
	);

	const handleFileSelect = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (file) processFile(file);
			if (fileInputRef.current) fileInputRef.current.value = "";
		},
		[processFile],
	);

	const applyPaste = useCallback(() => {
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
	}, [
		conductors,
		invalidateGeneratedPlacements,
		pasteMode,
		pasteText,
		placements,
		pushSnapshot,
		rods,
		setConductors,
		setRods,
		showToast,
	]);

	const clearAll = useCallback(() => {
		pushSnapshot(rods, conductors, placements);
		setRods([]);
		setConductors([]);
		setPlacements([]);
		invalidateGeneratedPlacements();
		setLastPlottedSnapshot(null);
		setPlacementLock(false);
		showToast("success", "All data cleared");
	}, [
		conductors,
		invalidateGeneratedPlacements,
		placements,
		pushSnapshot,
		rods,
		setConductors,
		setLastPlottedSnapshot,
		setPlacementLock,
		setPlacements,
		setRods,
		showToast,
	]);

	const loadSampleData = useCallback(() => {
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
	}, [
		conductors,
		invalidateGeneratedPlacements,
		placements,
		pushSnapshot,
		rods,
		setConductors,
		setLastPlottedSnapshot,
		setRods,
		showToast,
	]);

	const handleExcelExport = useCallback(async () => {
		addLog("generator", "[PROCESSING] Exporting to Excel...");
		try {
			const { exportGridToExcel } = await import("../services/GroundGridExcelAdapter");
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

	return {
		applyPaste,
		clearAll,
		fileInputRef,
		handleExcelExport,
		handleFileDrop,
		handleFileSelect,
		handlePdfExport,
		isDragging,
		loadSampleData,
		pasteMode,
		pasteText,
		setIsDragging,
		setPasteMode,
		setPasteText,
	};
}
