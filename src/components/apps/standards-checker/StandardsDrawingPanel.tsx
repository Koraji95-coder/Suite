import { StandardsDrawingCards } from "./StandardsDrawingCards";
import { StandardsDrawingDeleteDialog } from "./StandardsDrawingDeleteDialog";
import { StandardsDrawingDetailDialog } from "./StandardsDrawingDetailDialog";
import { StandardsDrawingFiltersPanel } from "./StandardsDrawingFiltersPanel";
import { StandardsDrawingHeader } from "./StandardsDrawingHeader";
import styles from "./StandardsDrawingPanel.module.css";
import { StandardsDrawingRulesDialog } from "./StandardsDrawingRulesDialog";
import { StandardsDrawingUploadDialog } from "./StandardsDrawingUploadDialog";
import { useStandardsDrawingCheckerState } from "./useStandardsDrawingCheckerState";

export function StandardsDrawingChecker() {
	const {
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
	} = useStandardsDrawingCheckerState();

	return (
		<div className={styles.root}>
			<StandardsDrawingHeader
				onOpenRules={() => setShowRulesModal(true)}
				onOpenUpload={() => setShowUploadModal(true)}
			/>

			<StandardsDrawingFiltersPanel
				searchTerm={searchTerm}
				onSearchTermChange={setSearchTerm}
				filterStatus={filterStatus}
				onFilterStatusChange={setFilterStatus}
				totalCount={stats.total}
				passCount={stats.pass}
				warningCount={stats.warning}
				failCount={stats.fail}
				enabledRuleCount={enabledRuleCount}
				totalRuleCount={rules.length}
			/>

			<StandardsDrawingCards
				loading={loading}
				filteredDrawings={filteredDrawings}
				searchTerm={searchTerm}
				filterStatus={filterStatus}
				onSelectDrawing={setSelectedDrawing}
				onDeleteDrawing={setPendingDeleteDrawing}
			/>

			<StandardsDrawingUploadDialog
				open={showUploadModal}
				onOpenChange={setShowUploadModal}
				checkingDrawing={checkingDrawing}
				enabledRuleCount={enabledRuleCount}
				uploadForm={uploadForm}
				setUploadForm={setUploadForm}
				onSubmit={(event) => {
					void handleUpload(event);
				}}
				onCancel={closeUploadModal}
			/>

			<StandardsDrawingRulesDialog
				open={showRulesModal}
				onOpenChange={setShowRulesModal}
				rules={rules}
				onToggleRule={toggleRule}
				onClose={() => setShowRulesModal(false)}
			/>

			<StandardsDrawingDetailDialog
				selectedDrawing={selectedDrawing}
				onClose={() => setSelectedDrawing(null)}
				onRecheckDrawing={checkDrawing}
			/>

			<StandardsDrawingDeleteDialog
				pendingDeleteDrawing={pendingDeleteDrawing}
				onCancel={() => setPendingDeleteDrawing(null)}
				onConfirmDelete={() => {
					void confirmDeleteDrawing();
				}}
			/>
		</div>
	);
}
