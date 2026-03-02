import { Search } from "lucide-react";
import { FrameSection } from "../ui/PageFrame";

interface QAQCFiltersPanelProps {
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

export function QAQCFiltersPanel({
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
}: QAQCFiltersPanelProps) {
	return (
		<FrameSection>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div className="relative md:col-span-2">
					<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 [color:var(--success)]" />
					<input
						type="text"
						value={searchTerm}
						onChange={(event) => onSearchTermChange(event.target.value)}
						placeholder="Search drawings..."
						className="w-full rounded-lg border [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface)] px-4 py-2 pl-10 [color:var(--text)] focus:outline-none focus:ring-2 focus:[--tw-ring-color:var(--success)]"
					/>
				</div>

				<div>
					<select
						value={filterStatus}
						onChange={(event) => onFilterStatusChange(event.target.value)}
						className="w-full rounded-lg border [border-color:color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--surface)] px-4 py-2 [color:var(--text)] focus:outline-none focus:ring-2 focus:[--tw-ring-color:var(--success)]"
					>
						<option value="all">All Status</option>
						<option value="pass">Pass</option>
						<option value="warning">Warning</option>
						<option value="fail">Fail</option>
						<option value="pending">Pending</option>
					</select>
				</div>
			</div>

			<div className="flex items-center justify-between mt-4 text-sm">
				<div className="flex items-center space-x-4 [color:var(--text-muted)]">
					<span>Total: {totalCount}</span>
					<span>Pass: {passCount}</span>
					<span>Warning: {warningCount}</span>
					<span>Fail: {failCount}</span>
				</div>
				<div className="[color:var(--text-muted)]">
					Active Rules: {enabledRuleCount}/{totalRuleCount}
				</div>
			</div>
		</FrameSection>
	);
}
