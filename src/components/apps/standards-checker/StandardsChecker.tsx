import { QAQCChecker } from "./QAQCPanel";
import { StandardsCheckerActionBar } from "./StandardsCheckerActionBar";
import { StandardsCheckerHeaderPanel } from "./StandardsCheckerHeaderPanel";
import { StandardsCheckerModeTabs } from "./StandardsCheckerModeTabs";
import { StandardsCheckerResultsSummary } from "./StandardsCheckerResultsSummary";
import { StandardsCheckerStandardsList } from "./StandardsCheckerStandardsList";
import { useStandardsCheckerState } from "./useStandardsCheckerState";

export function StandardsChecker() {
	const {
		activeCategory,
		failCount,
		filteredStandards,
		getResultForStandard,
		mode,
		passCount,
		results,
		running,
		selectedStandards,
		setActiveCategory,
		setMode,
		toggleStandard,
		runChecks,
		warningCount,
	} = useStandardsCheckerState();

	if (mode === "qaqc") {
		return (
			<div className="space-y-3">
				<div className="px-6 pt-3">
					<StandardsCheckerModeTabs mode={mode} onModeChange={setMode} />
				</div>
				<QAQCChecker />
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
			<StandardsCheckerModeTabs mode={mode} onModeChange={setMode} />

			<StandardsCheckerHeaderPanel
				activeCategory={activeCategory}
				onCategoryChange={setActiveCategory}
			/>

			<StandardsCheckerStandardsList
				activeCategory={activeCategory}
				filteredStandards={filteredStandards}
				selectedStandards={selectedStandards}
				onToggleStandard={toggleStandard}
				getResultForStandard={getResultForStandard}
			/>

			<StandardsCheckerActionBar
				selectedCount={selectedStandards.size}
				running={running}
				onRunChecks={runChecks}
			/>

			{results.length > 0 ? (
				<StandardsCheckerResultsSummary
					passCount={passCount}
					warningCount={warningCount}
					failCount={failCount}
				/>
			) : null}
		</div>
	);
}
