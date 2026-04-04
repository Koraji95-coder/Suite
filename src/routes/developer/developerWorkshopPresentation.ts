import type { TrustState } from "@/components/system/TrustStateBadge";
import type { SuiteRuntimeDoctorReport } from "@/lib/runtimeDoctor";
import { getSuiteDoctorLeadDetail } from "@/lib/suiteDoctorPresentation";
import type { DeveloperPortalOverviewSnapshot } from "./useDeveloperPortalOverviewData";

export interface DeveloperWorkshopSignal {
	id: string;
	label: string;
	value: string;
	meta: string;
}

export interface DeveloperWorkshopDeskStat {
	label: string;
	value: string;
}

export interface DeveloperWorkshopDeskDetail {
	label: string;
	value: string;
	meta?: string;
}

export interface DeveloperWorkshopDesk {
	id: "publishing" | "automation";
	tone: "feature" | "support";
	eyebrow: string;
	title: string;
	description: string;
	state: TrustState;
	stats: DeveloperWorkshopDeskStat[];
	details: DeveloperWorkshopDeskDetail[];
	actionLabel: string;
	actionRoute: string;
}

interface BuildDeveloperWorkshopModelsArgs {
	data: DeveloperPortalOverviewSnapshot;
	loading: boolean;
	suiteDoctorReport: SuiteRuntimeDoctorReport | null;
	suiteDoctorLoading: boolean;
}

function formatTimestamp(value: string | null | undefined) {
	if (!value) {
		return "No recent activity";
	}
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return parsed.toLocaleString([], {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatNumber(value: number, loading: boolean) {
	return loading ? "—" : value.toString();
}

function resolvePublishingState(
	snapshot: DeveloperPortalOverviewSnapshot,
): TrustState {
	if (snapshot.publishing.readinessError) {
		return "unavailable";
	}
	if (snapshot.publishing.readiness?.ready) {
		return "ready";
	}
	if ((snapshot.publishing.readiness?.issues.length ?? 0) > 0) {
		return "needs-attention";
	}
	return "background";
}

function resolveAutomationState(
	snapshot: DeveloperPortalOverviewSnapshot,
): TrustState {
	if (snapshot.automation.error) {
		return "unavailable";
	}
	if (
		snapshot.automation.health?.ok &&
		snapshot.automation.health?.dotnet?.reachable
	) {
		return "ready";
	}
	if (
		snapshot.automation.health?.ok ||
		snapshot.automation.health?.dotnet?.configured
	) {
		return "needs-attention";
	}
	return "background";
}

export function buildDeveloperWorkshopSignals({
	data,
	loading,
	suiteDoctorReport,
	suiteDoctorLoading,
}: BuildDeveloperWorkshopModelsArgs): DeveloperWorkshopSignal[] {
	const actionableIssueCount = suiteDoctorReport?.actionableIssueCount ?? 0;
	return [
		{
			id: "publishing",
			label: "Publish queue",
			value: formatNumber(data.publishing.readyCount, loading),
			meta: loading
				? "Publishing signals settle after the workstation snapshot restores."
				: data.publishing.draftCount > 0
					? `${data.publishing.draftCount} draft note${data.publishing.draftCount === 1 ? "" : "s"} still open`
					: "No publish-ready backlog behind the current queue.",
		},
		{
			id: "published",
			label: "Published notes",
			value: formatNumber(data.publishing.publishedCount, loading),
			meta: loading
				? "Published evidence settles from the latest cached workshop snapshot."
				: data.publishing.publishedCount > 0
					? `${data.publishing.publishedCount} published note${data.publishing.publishedCount === 1 ? "" : "s"} currently in the ledger`
					: "No published notes have been recorded yet.",
		},
		{
			id: "automation",
			label: "Automation rules",
			value: formatNumber(data.automation.ruleCount, loading),
			meta: loading
				? "Automation bridge health settles in the background."
				: data.automation.health?.dotnet?.reachable
					? "AutoDraft .NET bridge is reachable."
					: "Automation bridge needs a runtime check.",
		},
		{
			id: "doctor",
			label: "Actionable issues",
			value: suiteDoctorLoading ? "—" : actionableIssueCount.toString(),
			meta: suiteDoctorLoading
				? "Suite Doctor is restoring the shared workstation snapshot."
				: actionableIssueCount > 0
					? getSuiteDoctorLeadDetail(suiteDoctorReport) ||
						"Shared doctor recommendations appear here when the local workshop drifts."
					: "No actionable drift is active across Runtime Control, scripts, or the workshop.",
		},
	];
}

export function buildDeveloperWorkshopDesks({
	data,
	loading,
}: Omit<
	BuildDeveloperWorkshopModelsArgs,
	"suiteDoctorReport" | "suiteDoctorLoading"
>): DeveloperWorkshopDesk[] {
	const publishingState = resolvePublishingState(data);
	const automationState = resolveAutomationState(data);

	return [
		{
			id: "publishing",
			tone: "feature",
			eyebrow: "Publishing desk",
			title: "Work ledger and evidence",
			description:
				"Track publish-ready notes, machine suggestions, and delivery evidence without crowding the customer workspace with builder-only detail.",
			state: publishingState,
			stats: [
				{
					label: "Ready",
					value: formatNumber(data.publishing.readyCount, loading),
				},
				{
					label: "Drafts",
					value: formatNumber(data.publishing.draftCount, loading),
				},
				{
					label: "Suggestions",
					value: formatNumber(data.publishing.suggestionCount, loading),
				},
			],
			details: [
				{
					label: "Readiness",
					value: loading
						? "Loading publish readiness"
						: data.publishing.readiness?.ready
							? `Ready on ${data.publishing.readiness.workstationId}`
							: data.publishing.readiness?.issues[0] ||
								data.publishing.readinessError ||
								"Publisher readiness is still settling.",
				},
				{
					label: "Latest entry",
					value: loading
						? "Loading the latest ledger entry"
						: data.publishing.latestEntry?.title || "No recent ledger entry",
					meta: loading
						? "Recent publish timestamps settle with the workshop snapshot."
						: formatTimestamp(data.publishing.latestEntry?.updated_at),
				},
			],
			actionLabel: "Open Changelog",
			actionRoute: "/app/developer/control/changelog",
		},
		{
			id: "automation",
			tone: "support",
			eyebrow: "Automation lab",
			title: "AutoDraft and future tools",
			description:
				"Stage future product tools here until each workflow is clean enough to move into the released customer app.",
			state: automationState,
			stats: [
				{
					label: "Rules",
					value: formatNumber(data.automation.ruleCount, loading),
				},
				{
					label: "Mode",
					value: loading ? "—" : data.automation.health?.mode || "Unknown",
				},
				{
					label: "Bridge",
					value: loading
						? "—"
						: data.automation.health?.dotnet?.reachable
							? "Reachable"
							: data.automation.health?.dotnet?.configured
								? "Configured"
								: "Not ready",
				},
			],
			details: [
				{
					label: "Execution path",
					value: loading
						? "Automation health is loading"
						: data.automation.health?.ok
							? "AutoDraft backend responded to the latest health check."
							: data.automation.error ||
								"Automation health has not returned a usable snapshot yet.",
				},
				{
					label: "Bridge details",
					value: loading
						? "Loading bridge details"
						: data.automation.health?.dotnet?.base_url ||
							"No .NET base URL reported",
				},
			],
			actionLabel: "Open AutoDraft Studio",
			actionRoute: "/app/developer/labs/autodraft-studio",
		},
	];
}
