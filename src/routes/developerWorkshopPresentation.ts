import type { TrustState } from "@/components/apps/ui/TrustStateBadge";
import type { SuiteRuntimeDoctorReport } from "@/lib/runtimeDoctor";
import { getSuiteDoctorLeadDetail } from "@/lib/suiteDoctorPresentation";
import type { DeveloperPortalOverviewSnapshot } from "./useDeveloperPortalOverviewData";

interface DeveloperWorkshopAgentConnectionState {
	paired: boolean;
	healthy: boolean | null;
	error: string;
	loading: boolean;
}

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
	id: "publishing" | "agents" | "automation";
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
	agentConnection: DeveloperWorkshopAgentConnectionState;
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

function resolveAgentState(
	snapshot: DeveloperPortalOverviewSnapshot,
	agentConnection: DeveloperWorkshopAgentConnectionState,
): TrustState {
	if (!snapshot.agents.brokerEnabled) {
		return "background";
	}
	if (agentConnection.error.trim()) {
		return agentConnection.healthy === false
			? "needs-attention"
			: "unavailable";
	}
	if (agentConnection.loading && agentConnection.healthy === null) {
		return "background";
	}
	if (agentConnection.paired && agentConnection.healthy === true) {
		return "ready";
	}
	if (!agentConnection.paired || agentConnection.healthy === false) {
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
}: Omit<
	BuildDeveloperWorkshopModelsArgs,
	"agentConnection"
>): DeveloperWorkshopSignal[] {
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
			id: "agents",
			label: "Agent review",
			value: formatNumber(data.agents.awaitingReviewCount, loading),
			meta: loading
				? "Agent queue health settles from the latest cached workshop snapshot."
				: data.agents.activeTaskCount > 0
					? `${data.agents.activeTaskCount} active task${data.agents.activeTaskCount === 1 ? "" : "s"} running`
					: "No active orchestration runs in the queue.",
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
	agentConnection,
}: Omit<
	BuildDeveloperWorkshopModelsArgs,
	"suiteDoctorReport" | "suiteDoctorLoading"
>): DeveloperWorkshopDesk[] {
	const publishingState = resolvePublishingState(data);
	const agentState = resolveAgentState(data, agentConnection);
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
			actionRoute: "/app/changelog",
		},
		{
			id: "agents",
			tone: "support",
			eyebrow: "Agent lab",
			title: "Pairing and runs",
			description:
				"Keep experimental agent pairing, review queues, and run activity in the workshop until the surface is ready to graduate.",
			state: agentState,
			stats: [
				{
					label: "Profiles",
					value: formatNumber(data.agents.profileCount, loading),
				},
				{
					label: "Awaiting review",
					value: formatNumber(data.agents.awaitingReviewCount, loading),
				},
				{
					label: "Activity",
					value: formatNumber(data.agents.activityCount, loading),
				},
			],
			details: [
				{
					label: "Pairing",
					value: data.agents.brokerEnabled
						? agentConnection.paired
							? "Trusted device paired"
							: "Pairing still needs attention"
						: "Broker transport disabled for this runtime",
					meta: loading
						? "Pairing and gateway health restore from the cached workshop snapshot."
						: agentConnection.error ||
							(agentConnection.healthy === true
								? "Gateway health is reachable."
								: agentConnection.healthy === false
									? "Gateway health failed the latest check."
									: "Agent health settles in the background."),
				},
				{
					label: "Latest activity",
					value: loading
						? "Loading the latest run activity"
						: data.agents.latestActivity?.message || "No recent run activity",
					meta: loading
						? "Recent run timestamps settle after the workshop queue snapshot loads."
						: formatTimestamp(data.agents.latestActivity?.createdAt),
				},
			],
			actionLabel: "Open Agents",
			actionRoute: "/app/agent",
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
			actionRoute: "/app/apps/autodraft-studio",
		},
	];
}
