import {
	type ProjectAutomationReceiptRecord,
	projectAutomationReceiptService,
} from "@/services/projectAutomationReceiptService";
import {
	type ProjectDeliverableRegisterSnapshot,
	projectDeliverableRegisterService,
} from "@/features/project-delivery";
import {
	type ProjectIssueSetRecord,
	projectIssueSetService,
} from "./issueSetService";
import {
	type ProjectReviewDecisionRecord,
	projectReviewDecisionService,
} from "@/services/projectReviewDecisionService";
import {
	type ProjectTransmittalReceiptRecord,
	projectTransmittalReceiptService,
} from "@/services/projectTransmittalReceiptService";
import { createProjectScopedFetchCache } from "@/services/projectWorkflowClientSupport";

export interface ProjectWorkflowSharedStateSnapshot {
	issueSets: ProjectIssueSetRecord[];
	decisions: ProjectReviewDecisionRecord[];
	registerSnapshot: ProjectDeliverableRegisterSnapshot | null;
	transmittalReceipts: ProjectTransmittalReceiptRecord[];
	automationReceipts: ProjectAutomationReceiptRecord[];
}

export interface ProjectWorkflowSharedStateResult {
	data: ProjectWorkflowSharedStateSnapshot;
	messages: string[];
}

const projectWorkflowSharedStateCache =
	createProjectScopedFetchCache<ProjectWorkflowSharedStateResult>();

function normalizeProjectId(projectId: string) {
	return String(projectId ?? "").trim();
}

function emptyState(): ProjectWorkflowSharedStateSnapshot {
	return {
		issueSets: [],
		decisions: [],
		registerSnapshot: null,
		transmittalReceipts: [],
		automationReceipts: [],
	};
}

export const projectWorkflowSharedStateService = {
	async fetch(projectId: string): Promise<ProjectWorkflowSharedStateResult> {
		const normalizedProjectId = normalizeProjectId(projectId);
		if (!normalizedProjectId) {
			return {
				data: emptyState(),
				messages: ["Project id is required."],
			};
		}

		const cached = projectWorkflowSharedStateCache.read(normalizedProjectId);
		if (cached) {
			return cached;
		}

		const inFlight =
			projectWorkflowSharedStateCache.readInFlight(normalizedProjectId);
		if (inFlight) {
			return await inFlight;
		}

		const loader = projectWorkflowSharedStateCache.writeInFlight(
			normalizedProjectId,
			(async () => {
				const [
					issueSetsResult,
					decisionsResult,
					registerResult,
					transmittalReceiptsResult,
					automationReceiptsResult,
				] = await Promise.all([
					projectIssueSetService.fetchIssueSets(normalizedProjectId),
					projectReviewDecisionService.fetchDecisions(normalizedProjectId),
					projectDeliverableRegisterService.fetchSnapshot(normalizedProjectId),
					projectTransmittalReceiptService.fetchReceipts(normalizedProjectId),
					projectAutomationReceiptService.fetchReceipts(normalizedProjectId),
				]);

				return projectWorkflowSharedStateCache.write(normalizedProjectId, {
					data: {
						issueSets: issueSetsResult.data,
						decisions: decisionsResult.data,
						registerSnapshot: registerResult.data,
						transmittalReceipts: transmittalReceiptsResult.data,
						automationReceipts: automationReceiptsResult.data,
					},
					messages: [
						...(issueSetsResult.error ? [issueSetsResult.error.message] : []),
						...(decisionsResult.error ? [decisionsResult.error.message] : []),
						...(registerResult.error ? [registerResult.error.message] : []),
						...(transmittalReceiptsResult.error
							? [transmittalReceiptsResult.error.message]
							: []),
						...(automationReceiptsResult.error
							? [automationReceiptsResult.error.message]
							: []),
					],
				});
			})(),
		);

		try {
			return await loader;
		} finally {
			projectWorkflowSharedStateCache.clearInFlight(normalizedProjectId);
		}
	},

	clear(projectId: string) {
		const normalizedProjectId = normalizeProjectId(projectId);
		if (!normalizedProjectId) {
			return;
		}
		projectWorkflowSharedStateCache.clear(normalizedProjectId);
	},

	clearAll() {
		projectWorkflowSharedStateCache.clearAll();
	},
};
