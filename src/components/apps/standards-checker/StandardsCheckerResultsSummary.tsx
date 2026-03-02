import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { GlassPanel } from "../ui/GlassPanel";

interface StandardsCheckerResultsSummaryProps {
	passCount: number;
	warningCount: number;
	failCount: number;
}

export function StandardsCheckerResultsSummary({
	passCount,
	warningCount,
	failCount,
}: StandardsCheckerResultsSummaryProps) {
	return (
		<GlassPanel padded className="space-y-3">
			<h2 className="text-sm font-semibold [color:var(--text)]">
				Results Summary
			</h2>
			<div className="flex flex-wrap items-center gap-4 text-sm">
				<div className="inline-flex items-center gap-2 [color:var(--text-muted)]">
					<CheckCircle className="h-4 w-4 [color:var(--success)]" />
					Pass: {passCount}
				</div>
				<div className="inline-flex items-center gap-2 [color:var(--text-muted)]">
					<AlertTriangle className="h-4 w-4 [color:var(--warning)]" />
					Warning: {warningCount}
				</div>
				<div className="inline-flex items-center gap-2 [color:var(--text-muted)]">
					<XCircle className="h-4 w-4 [color:var(--danger)]" />
					Fail: {failCount}
				</div>
			</div>
		</GlassPanel>
	);
}
