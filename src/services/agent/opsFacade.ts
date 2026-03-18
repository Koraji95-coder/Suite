import { fetchAgentProfileCatalog, healthCheckAgent } from "./catalog";
import {
	cancelBrokerOrchestrationRun,
	createBrokerOrchestrationRun,
	getBrokerAgentActivity,
	getBrokerAgentTask,
	getBrokerOrchestrationRun,
	listBrokerAgentTasks,
	reviewBrokerAgentTask,
	subscribeBrokerRunEvents,
} from "./orchestration";
import {
	resolveHealthCheckTimeoutMs,
	type AgentServiceRuntimeState,
} from "./runtime";
import type {
	AgentActivityItem,
	AgentProfileCatalogItem,
	AgentReviewAction,
	AgentRunCreateRequest,
	AgentRunEventStream,
	AgentRunEventStreamHandlers,
	AgentRunSnapshot,
	AgentTaskItem,
	AgentTaskPriority,
	AgentTaskStatus,
} from "./types";

interface AgentOpsContext {
	runtime: AgentServiceRuntimeState;
	getSupabaseAccessToken: () => Promise<string | null>;
}

function createBrokerContext(context: AgentOpsContext) {
	return {
		useBroker: context.runtime.useBroker,
		brokerUrl: context.runtime.brokerUrl,
		getSupabaseAccessToken: context.getSupabaseAccessToken,
	};
}

export async function healthCheckService(
	context: AgentOpsContext,
): Promise<boolean> {
	return healthCheckAgent(
		{
			useBroker: context.runtime.useBroker,
			baseUrl: context.runtime.baseUrl,
			brokerUrl: context.runtime.brokerUrl,
			getSupabaseAccessToken: context.getSupabaseAccessToken,
			setLastHealthError: (message) => {
				context.runtime.lastHealthError = message;
			},
		},
		resolveHealthCheckTimeoutMs(),
	);
}

export async function fetchProfileCatalogService(
	context: AgentOpsContext,
): Promise<{
	success: boolean;
	profiles: AgentProfileCatalogItem[];
	error?: string;
}> {
	return fetchAgentProfileCatalog(createBrokerContext(context));
}

export async function createOrchestrationRunService(
	context: AgentOpsContext,
	input: AgentRunCreateRequest,
): Promise<{
	success: boolean;
	runId?: string;
	status?: string;
	requestId?: string;
	error?: string;
}> {
	return createBrokerOrchestrationRun(createBrokerContext(context), input);
}

export async function getOrchestrationRunService(
	context: AgentOpsContext,
	runId: string,
): Promise<{
	success: boolean;
	run?: AgentRunSnapshot;
	requestId?: string;
	error?: string;
}> {
	return getBrokerOrchestrationRun(createBrokerContext(context), runId);
}

export async function cancelOrchestrationRunService(
	context: AgentOpsContext,
	runId: string,
): Promise<{
	success: boolean;
	status?: string;
	requestId?: string;
	error?: string;
}> {
	return cancelBrokerOrchestrationRun(createBrokerContext(context), runId);
}

export async function listAgentTasksService(
	context: AgentOpsContext,
	filters?: {
		status?: AgentTaskStatus | AgentTaskStatus[];
		priority?: AgentTaskPriority;
		assigneeProfile?: string;
		runId?: string;
		limit?: number;
	},
): Promise<{
	success: boolean;
	tasks: AgentTaskItem[];
	requestId?: string;
	error?: string;
}> {
	return listBrokerAgentTasks(createBrokerContext(context), filters);
}

export async function getAgentTaskService(
	context: AgentOpsContext,
	taskId: string,
): Promise<{
	success: boolean;
	task?: AgentTaskItem;
	requestId?: string;
	error?: string;
}> {
	return getBrokerAgentTask(createBrokerContext(context), taskId);
}

export async function reviewAgentTaskService(
	context: AgentOpsContext,
	taskId: string,
	action: AgentReviewAction,
	note?: string,
): Promise<{
	success: boolean;
	task?: AgentTaskItem;
	requestId?: string;
	error?: string;
}> {
	return reviewBrokerAgentTask(
		createBrokerContext(context),
		taskId,
		action,
		note,
	);
}

export async function getAgentActivityService(
	context: AgentOpsContext,
	options?: {
		runId?: string;
		limit?: number;
	},
): Promise<{
	success: boolean;
	activity: AgentActivityItem[];
	requestId?: string;
	error?: string;
}> {
	return getBrokerAgentActivity(createBrokerContext(context), options);
}

export function subscribeOrchestrationRunEventsService(
	context: AgentOpsContext,
	runId: string,
	handlers: AgentRunEventStreamHandlers,
): AgentRunEventStream {
	return subscribeBrokerRunEvents(createBrokerContext(context), runId, handlers);
}
