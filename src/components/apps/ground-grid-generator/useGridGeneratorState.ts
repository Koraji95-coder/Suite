import { useRef, useState } from "react";
import type {
	PasteMode,
	PreviewMode,
} from "./GridGeneratorPanelModels";
import { useGroundGrid } from "./GroundGridContext";
import type {
	GridConfig,
	GridConductor,
	GridRod,
} from "./types";
import { DEFAULT_CONFIG } from "./types";
import { useGridDesignPersistenceController } from "./useGridDesignPersistenceController";
import { useGridEditingHistoryController } from "./useGridEditingHistoryController";
import { useGridImportExportController } from "./useGridImportExportController";
import { useGridPlacementController } from "./useGridPlacementController";

export function useGridGeneratorState(designIdParam: string | null) {
	const { addLog, backendConnected } = useGroundGrid();
	const [rods, setRods] = useState<GridRod[]>([]);
	const [conductors, setConductors] = useState<GridConductor[]>([]);
	const [config, setConfig] = useState<GridConfig>(DEFAULT_CONFIG);
	const [previewMode, setPreviewMode] = useState<PreviewMode>("2d");
	const [soilResistivity, setSoilResistivity] = useState(100);
	const [faultCurrent, setFaultCurrent] = useState(5000);
	const resetPlacementStateRef = useRef<() => void>(() => undefined);

	const designPersistence = useGridDesignPersistenceController({
		designIdParam,
		addLog,
		rods,
		conductors,
		config,
		setRods,
		setConductors,
		setConfig,
		resetPlacementState: () => resetPlacementStateRef.current(),
	});

	const placement = useGridPlacementController({
		addLog,
		backendConnected,
		config,
		currentDesignId: designPersistence.currentDesign?.id ?? null,
		rods,
		conductors,
	});

	resetPlacementStateRef.current = () => {
		placement.invalidateGeneratedPlacements();
		placement.setLastPlottedSnapshot(null);
		placement.setPlacementLock(false);
	};

	const editingHistory = useGridEditingHistoryController({
		rods,
		conductors,
		placements: placement.placements,
		countPlacementType: placement.countPlacementType,
		invalidateGeneratedPlacements: placement.invalidateGeneratedPlacements,
		setRods,
		setConductors,
		setPlacements: placement.setPlacements,
		setTeeCount: placement.setTeeCount,
		setCrossCount: placement.setCrossCount,
		setSegmentCount: placement.setSegmentCount,
		setPlacementSourceSignature: placement.setPlacementSourceSignature,
	});

	const importExport = useGridImportExportController({
		addLog,
		designName: designPersistence.designName,
		rods,
		conductors,
		placements: placement.placements,
		segmentCount: placement.segmentCount,
		teeCount: placement.teeCount,
		crossCount: placement.crossCount,
		pushSnapshot: editingHistory.pushSnapshot,
		invalidateGeneratedPlacements: placement.invalidateGeneratedPlacements,
		setRods,
		setConductors,
		setPlacements: placement.setPlacements,
		setPlacementLock: placement.setPlacementLock,
		setLastPlottedSnapshot: placement.setLastPlottedSnapshot,
	});

	return {
		applyPaste: importExport.applyPaste,
		backendConnected,
		canRedo: editingHistory.canRedo,
		canUndo: editingHistory.canUndo,
		clearAll: importExport.clearAll,
		conductors,
		crossCount: placement.crossCount,
		currentDesign: designPersistence.currentDesign,
		deleteDesign: designPersistence.deleteDesign,
		designName: designPersistence.designName,
		designs: designPersistence.designs,
		faultCurrent,
		fileInputRef: importExport.fileInputRef,
		generating: placement.generating,
		handleDesignSelect: designPersistence.handleDesignSelect,
		handleExcelExport: importExport.handleExcelExport,
		handleFileDrop: importExport.handleFileDrop,
		handleFileSelect: importExport.handleFileSelect,
		handleManualConductorsChange: editingHistory.handleManualConductorsChange,
		handleManualPlacementsChange: editingHistory.handleManualPlacementsChange,
		handleManualRodsChange: editingHistory.handleManualRodsChange,
		handlePdfExport: importExport.handlePdfExport,
		handlePlotToAutoCad: placement.handlePlotToAutoCad,
		handleProjectSelect: designPersistence.handleProjectSelect,
		handleRedo: editingHistory.handleRedo,
		handleUndo: editingHistory.handleUndo,
		isDragging: importExport.isDragging,
		linkedProject: designPersistence.linkedProject,
		linkedProjectId: designPersistence.linkedProjectId,
		loadSampleData: importExport.loadSampleData,
		newDesign: designPersistence.newDesign,
		pasteMode: importExport.pasteMode as PasteMode,
		pasteText: importExport.pasteText,
		placements: placement.placements,
		previewMode,
		projects: designPersistence.projects,
		plotDiffPreview: placement.plotDiffPreview,
		placementLock: placement.placementLock,
		rods,
		runGeneration: placement.runGeneration,
		saveDesign: designPersistence.saveDesign,
		saving: designPersistence.saving,
		segmentCount: placement.segmentCount,
		setConductors,
		setCrossCount: placement.setCrossCount,
		setDesignName: designPersistence.setDesignName,
		setFaultCurrent,
		setIsDragging: importExport.setIsDragging,
		setPasteMode: importExport.setPasteMode,
		setPasteText: importExport.setPasteText,
		setPlacements: placement.setPlacements,
		setPreviewMode,
		setPlacementLock: placement.setPlacementLock,
		setRods,
		setSoilResistivity,
		setTeeCount: placement.setTeeCount,
		soilResistivity,
		teeCount: placement.teeCount,
	};
}
