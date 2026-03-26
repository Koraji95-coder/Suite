import type {
	SuiteDoctorState,
	SuiteRuntimeDoctorReport,
} from "@/lib/runtimeDoctor";

export type SuiteDoctorSummaryModel = {
	state: SuiteDoctorState;
	actionableIssueCount: number;
	summary: string;
	leadDetail: string;
	updatedAtLabel: string | null;
};

export function resolveSuiteDoctorDisplayState(
	report: SuiteRuntimeDoctorReport | null,
	loading = false,
): SuiteDoctorState {
	if (report?.overallState) {
		return report.overallState;
	}
	return loading ? "background" : "background";
}

export function getSuiteDoctorLeadDetail(
	report: SuiteRuntimeDoctorReport | null,
): string | null {
	if (!report) {
		return null;
	}
	const actionableCheck = report.checks.find(
		(check) => check.actionable !== false && check.status !== "ok",
	);
	return actionableCheck?.detail || report.recommendations?.[0] || null;
}

export function summarizeSuiteDoctor(
	report: SuiteRuntimeDoctorReport | null,
	loading = false,
): string {
	if (loading && !report) {
		return "Suite Doctor is collecting the shared runtime snapshot.";
	}
	if (!report) {
		return "Suite Doctor has not produced a shared runtime snapshot yet.";
	}
	if (report.actionableIssueCount > 0) {
		return `${report.actionableIssueCount} actionable issue${report.actionableIssueCount === 1 ? "" : "s"} need attention across the workstation and local stack.`;
	}
	if (report.overallState === "background") {
		return "Background checks are still settling, but no actionable issues are active.";
	}
	return "Runtime Control, scripts, and developer routes agree on the current workstation health.";
}

export function buildSuiteDoctorSummaryModel(
	report: SuiteRuntimeDoctorReport | null,
	loading = false,
): SuiteDoctorSummaryModel {
	return {
		state: resolveSuiteDoctorDisplayState(report, loading),
		actionableIssueCount: report?.actionableIssueCount ?? 0,
		summary: summarizeSuiteDoctor(report, loading),
		leadDetail:
			getSuiteDoctorLeadDetail(report) ||
			"Manual doctor recommendations will appear here when the shared runtime snapshot finds drift.",
		updatedAtLabel: report?.checkedAt
			? new Date(report.checkedAt).toLocaleString()
			: null,
	};
}
