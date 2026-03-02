import { QAQCDeleteDialog } from "./QAQCDeleteDialog";
import { QAQCDrawingCards } from "./QAQCDrawingCards";
import { QAQCDrawingDetailDialog } from "./QAQCDrawingDetailDialog";
import { QAQCFiltersPanel } from "./QAQCFiltersPanel";
import { QAQCHeader } from "./QAQCHeader";
import { QAQCRulesDialog } from "./QAQCRulesDialog";
import { QAQCUploadDialog } from "./QAQCUploadDialog";
import { useQAQCCheckerState } from "./useQAQCCheckerState";

export function QAQCChecker() {
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
	} = useQAQCCheckerState();

	return (
		<div className="space-y-6">
			<QAQCHeader
				onOpenRules={() => setShowRulesModal(true)}
				onOpenUpload={() => setShowUploadModal(true)}
			/>

			<QAQCFiltersPanel
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

			<QAQCDrawingCards
				loading={loading}
				filteredDrawings={filteredDrawings}
				searchTerm={searchTerm}
				filterStatus={filterStatus}
				onSelectDrawing={setSelectedDrawing}
				onDeleteDrawing={setPendingDeleteDrawing}
			/>

			<QAQCUploadDialog
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

			<QAQCRulesDialog
				open={showRulesModal}
				onOpenChange={setShowRulesModal}
				rules={rules}
				onToggleRule={toggleRule}
				onClose={() => setShowRulesModal(false)}
			/>

			<QAQCDrawingDetailDialog
				selectedDrawing={selectedDrawing}
				onClose={() => setSelectedDrawing(null)}
				onRecheckDrawing={checkDrawing}
			/>

			<QAQCDeleteDialog
				pendingDeleteDrawing={pendingDeleteDrawing}
				onCancel={() => setPendingDeleteDrawing(null)}
				onConfirmDelete={() => {
					void confirmDeleteDrawing();
				}}
			/>
		</div>
	);
}
