import { Search } from "lucide-react";
import { Section } from "@/components/apps/ui/PageFrame";
import styles from "./StandardsDrawingFiltersPanel.module.css";

interface StandardsDrawingFiltersPanelProps {
	searchTerm: string;
	onSearchTermChange: (value: string) => void;
	filterStatus: string;
	onFilterStatusChange: (value: string) => void;
	totalCount: number;
	passCount: number;
	warningCount: number;
	failCount: number;
	enabledRuleCount: number;
	totalRuleCount: number;
}

export function StandardsDrawingFiltersPanel({
	searchTerm,
	onSearchTermChange,
	filterStatus,
	onFilterStatusChange,
	totalCount,
	passCount,
	warningCount,
	failCount,
	enabledRuleCount,
	totalRuleCount,
}: StandardsDrawingFiltersPanelProps) {
	return (
		<Section className={styles.root}>
			<div className={styles.controls}>
				<div className={styles.searchWrap}>
					<Search className={styles.searchIcon} />
					<input
						type="text"
						value={searchTerm}
						onChange={(event) => onSearchTermChange(event.target.value)}
						placeholder="Search drawings..."
						className={styles.searchInput}
					name="standardsdrawingfilterspanel_input_35"
					/>
				</div>

				<div>
					<select
						value={filterStatus}
						onChange={(event) => onFilterStatusChange(event.target.value)}
						className={styles.statusSelect}
					 name="standardsdrawingfilterspanel_select_45">
						<option value="all">All Status</option>
						<option value="pass">Pass</option>
						<option value="warning">Warning</option>
						<option value="fail">Fail</option>
						<option value="pending">Pending</option>
					</select>
				</div>
			</div>

			<div className={styles.metrics}>
				<div className={styles.counts}>
					<span>Total: {totalCount}</span>
					<span>Pass: {passCount}</span>
					<span>Warning: {warningCount}</span>
					<span>Fail: {failCount}</span>
				</div>
				<div className={styles.rules}>
					Active Rules: {enabledRuleCount}/{totalRuleCount}
				</div>
			</div>
		</Section>
	);
}
