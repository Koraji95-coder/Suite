import styles from "./StandardsChecker.module.css";
import { StandardsCheckerActionBar } from "./StandardsCheckerActionBar";
import { StandardsCheckerHeaderPanel } from "./StandardsCheckerHeaderPanel";
import { StandardsCheckerModeTabs } from "./StandardsCheckerModeTabs";
import { StandardsCheckerResultsSummary } from "./StandardsCheckerResultsSummary";
import { StandardsCheckerStandardsList } from "./StandardsCheckerStandardsList";
import { StandardsDrawingChecker } from "./StandardsDrawingPanel";
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

	return (
		<div className={styles.page}>
			<StandardsCheckerModeTabs mode={mode} onModeChange={setMode} />

			{mode === "standards-drawing" ? (
				<StandardsDrawingChecker />
			) : (
				<>
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
				</>
			)}
		</div>
	);
}
