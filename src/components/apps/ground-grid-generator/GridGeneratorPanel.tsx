import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { hexToRgba, useTheme } from "@/lib/palette";
import { GridGeneratorDataColumn } from "./GridGeneratorDataColumn";
import styles from "./GridGeneratorPanel.module.css";
import { GridGeneratorPreviewColumn } from "./GridGeneratorPreviewColumn";
import { GridGeneratorTopBar } from "./GridGeneratorTopBar";
import { useGridGeneratorState } from "./useGridGeneratorState";

export function GridGeneratorPanel() {
	const { palette } = useTheme();
	const [searchParams] = useSearchParams();
	const designIdParam = searchParams.get("design");
	const {
		applyPaste,
		backendConnected,
		canRedo,
		canUndo,
		clearAll,
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
		plotDiffPreview,
		placementLock,
		previewMode,
		projects,
		rods,
		runGeneration,
		saveDesign,
		saving,
		setDesignName,
		setFaultCurrent,
		setIsDragging,
		setPasteMode,
		setPasteText,
		setPreviewMode,
		setPlacementLock,
		setSoilResistivity,
		soilResistivity,
		teeCount,
	} = useGridGeneratorState(designIdParam);

	const btnStyle = (active = false): CSSProperties => ({
		padding: "6px 12px",
		fontSize: 12,
		fontWeight: 600,
		border: `1px solid ${hexToRgba(palette.primary, active ? 0.4 : 0.2)}`,
		borderRadius: 6,
		background: active
			? hexToRgba(palette.primary, 0.15)
			: hexToRgba(palette.surfaceLight, 0.4),
		color: active ? palette.text : palette.textMuted,
		cursor: "pointer",
		display: "flex",
		alignItems: "center",
		gap: 6,
		transition: "all 0.15s",
	});

	return (
		<div className={styles.root}>
			<GridGeneratorTopBar
				designs={designs}
				currentDesign={currentDesign}
				designName={designName}
				saving={saving}
				projects={projects}
				linkedProjectId={linkedProjectId}
				linkedProject={linkedProject}
				palettePrimary={palette.primary}
				paletteSurfaceLight={palette.surfaceLight}
				paletteText={palette.text}
				btnStyle={btnStyle}
				onNewDesign={newDesign}
				onDesignSelect={handleDesignSelect}
				onDesignNameChange={setDesignName}
				onSaveDesign={() => {
					void saveDesign();
				}}
				onDeleteDesign={() => {
					void deleteDesign();
				}}
				onProjectSelect={handleProjectSelect}
			/>

			<div className={styles.columns}>
				<div className={styles.dataColumn}>
					<GridGeneratorDataColumn
						isDragging={isDragging}
						fileInputRef={fileInputRef}
						pasteMode={pasteMode}
						pasteText={pasteText}
						rods={rods}
						conductors={conductors}
						placements={placements}
						palettePrimary={palette.primary}
						paletteSurfaceLight={palette.surfaceLight}
						paletteText={palette.text}
						paletteTextMuted={palette.textMuted}
						btnStyle={btnStyle}
						onDragStateChange={setIsDragging}
						onFileDrop={handleFileDrop}
						onFileSelect={handleFileSelect}
						onPasteModeChange={setPasteMode}
						onPasteTextChange={setPasteText}
						onApplyPaste={applyPaste}
						onLoadSampleData={loadSampleData}
						onClearAll={clearAll}
					/>
				</div>

				<div className={styles.previewColumn}>
					<GridGeneratorPreviewColumn
						previewMode={previewMode}
						generating={generating}
						canUndo={canUndo}
						canRedo={canRedo}
						backendConnected={backendConnected}
						soilResistivity={soilResistivity}
						faultCurrent={faultCurrent}
						teeCount={teeCount}
						crossCount={crossCount}
						rods={rods}
						conductors={conductors}
						placements={placements}
						plotDiffPreview={plotDiffPreview}
						palettePrimary={palette.primary}
						paletteSurfaceLight={palette.surfaceLight}
						paletteText={palette.text}
						paletteTextMuted={palette.textMuted}
						btnStyle={btnStyle}
						onRunGeneration={runGeneration}
						onUndo={handleUndo}
						onRedo={handleRedo}
						onExportExcel={() => {
							void handleExcelExport();
						}}
						onExportPdf={handlePdfExport}
						onPlotToAutoCad={handlePlotToAutoCad}
						placementLock={placementLock}
						onTogglePlacementLock={() => setPlacementLock((prev) => !prev)}
						onPreviewModeChange={setPreviewMode}
						onSoilResistivityChange={setSoilResistivity}
						onFaultCurrentChange={setFaultCurrent}
						onManualRodsChange={handleManualRodsChange}
						onManualConductorsChange={handleManualConductorsChange}
						onManualPlacementsChange={handleManualPlacementsChange}
					/>
				</div>
			</div>
		</div>
	);
}
