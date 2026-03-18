import {
	analyzeProject,
	analyzeRegulations,
	calculateElectricalGrid,
	calculateVoltageDrop,
	cancelAgentRequest,
	executeAgentPythonScript,
	forecastTimeline,
	generateDocumentation,
	generateFloorPlan,
	generateTransmittal,
	recallSimilarProjects,
	rememberProjectPattern,
	researchStandard,
	researchTopic,
	searchElectricalStandards,
	sendAgentMessage,
} from "./agent/actions";
import { getBrokerConfig, getSupabaseAccessToken } from "./agent/brokerAuth";
import {
	cancelOrchestrationRunService,
	createOrchestrationRunService,
	fetchProfileCatalogService,
	getAgentActivityService,
	getAgentTaskService,
	getOrchestrationRunService,
	healthCheckService,
	listAgentTasksService,
	reviewAgentTaskService,
	subscribeOrchestrationRunEventsService,
} from "./agent/opsFacade";
import {
	checkPairing,
	createPairingVerificationContext,
	pairAgent,
	refreshPairingStatus,
	refreshPairingStatusDetailed,
	restorePairingForActiveUser,
	unpairAgent,
	type AgentPairingLifecycleContext,
} from "./agent/pairingLifecycle";
import {
	readBrokerError,
	readPairingBrokerError,
	readSessionBrokerError,
} from "./agent/pairingErrors";
import {
	confirmPairingVerificationViaBroker,
	requestPairingCodeByEmailViaBroker,
	requestPairingVerificationLinkViaBroker,
	type AgentPairingVerificationContext,
} from "./agent/pairingVerification";
import type { AgentRequestTransportContext } from "./agent/requestTransport";
import {
	createAgentServiceRuntimeState,
	getEndpoint,
	getLastHealthError,
	getToken,
	isTaskAllowedForCurrentUser,
	resolveDirectConnectTimeoutMs,
	resolveDirectStreamMaxMs,
	setActiveUser,
	shouldRequireWebhookSecret,
	usesBroker,
	type AgentServiceRuntimeState,
} from "./agent/runtime";
import {
	type AgentActivityItem,
	type AgentPairingAction,
	type AgentPairingRefreshResult,
	type AgentPairingVerificationOptions,
	type AgentProfileCatalogItem,
	type AgentResponse,
	type AgentReviewAction,
	type AgentRunCreateRequest,
	type AgentRunEventStream,
	type AgentRunEventStreamHandlers,
	type AgentRunSnapshot,
	type AgentSendOptions,
	type AgentTaskItem,
	type AgentTaskPriority,
	type AgentTaskStatus,
	type PythonToolRequest,
} from "./agent/types";

export { AGENT_PAIRING_STATE_EVENT, AgentPairingRequestError } from "./agent/types";
export type {
	AgentActivityItem,
	AgentPairingAction,
	AgentPairingRefreshResult,
	AgentPairingVerificationOptions,
	AgentProfileCatalogItem,
	AgentResponse,
	AgentReviewAction,
	AgentRunCreateRequest,
	AgentRunEventStream,
	AgentRunEventStreamHandlers,
	AgentRunSnapshot,
	AgentSendOptions,
	AgentTask,
	AgentTaskItem,
	AgentTaskPriority,
	AgentTaskStatus,
	PythonToolRequest,
} from "./agent/types";

class AgentService {
	private runtime: AgentServiceRuntimeState;

	constructor() {
		this.runtime = createAgentServiceRuntimeState();
	}

	private getPairingLifecycleContext(): AgentPairingLifecycleContext {
		return {
			runtime: this.runtime,
			getSupabaseAccessToken: () => getSupabaseAccessToken(this.runtime),
			readBrokerError,
			readPairingBrokerError,
			readSessionBrokerError,
		};
	}

	private getPairingVerificationContext(): AgentPairingVerificationContext {
		return createPairingVerificationContext(this.getPairingLifecycleContext());
	}

	private getRequestTransportContext(): AgentRequestTransportContext {
		const pairingContext = this.getPairingLifecycleContext();
		return {
			useBroker: this.runtime.useBroker,
			baseUrl: this.runtime.baseUrl,
			brokerUrl: this.runtime.brokerUrl,
			getSupabaseAccessToken: pairingContext.getSupabaseAccessToken,
			refreshPairingStatus: () => refreshPairingStatus(pairingContext),
			checkPairing: () => checkPairing(this.runtime),
			getToken,
			unpair: () => unpairAgent(pairingContext),
			shouldRequireWebhookSecret: () => shouldRequireWebhookSecret(this.runtime),
			resolveDirectConnectTimeoutMs,
			resolveDirectStreamMaxMs,
			getActiveDirectChatAbortController: () =>
				this.runtime.activeDirectChatAbortController,
			setActiveDirectChatAbortController: (
				controller: AbortController | null,
			) => {
				this.runtime.activeDirectChatAbortController = controller;
			},
			getActiveDirectChatCancelledByUser: () =>
				this.runtime.activeDirectChatCancelledByUser,
			setActiveDirectChatCancelledByUser: (cancelled: boolean) => {
				this.runtime.activeDirectChatCancelledByUser = cancelled;
			},
			isTaskAllowedForCurrentUser: (taskName: string) =>
				isTaskAllowedForCurrentUser(this.runtime, taskName),
		};
	}

	getEndpoint(): string {
		return getEndpoint(this.runtime);
	}

	usesBroker(): boolean {
		return usesBroker(this.runtime);
	}

	async getBrokerConfig(): Promise<{
		ok: boolean;
		missing: string[];
		warnings?: string[];
		require_webhook_secret?: boolean;
	} | null> {
		return getBrokerConfig(this.runtime);
	}

	getLastHealthError(): string | null {
		return getLastHealthError(this.runtime);
	}

	setActiveUser(
		userId: string | null,
		email?: string | null,
		isAdmin = false,
	): void {
		setActiveUser(this.runtime, userId, email, isAdmin);
	}

	async requestPairingVerificationLink(
		action: AgentPairingAction,
		pairingCode?: string,
		options?: AgentPairingVerificationOptions,
	): Promise<void> {
		return requestPairingVerificationLinkViaBroker(
			this.getPairingVerificationContext(),
			action,
			pairingCode,
			options,
		);
	}

	async requestPairingCodeByEmail(
		options?: AgentPairingVerificationOptions,
	): Promise<void> {
		return requestPairingCodeByEmailViaBroker(
			this.getPairingVerificationContext(),
			options,
		);
	}

	async confirmPairingVerification(
		action: AgentPairingAction,
		challengeId: string,
	): Promise<boolean> {
		return confirmPairingVerificationViaBroker(
			this.getPairingVerificationContext(),
			action,
			challengeId,
		);
	}

	async restorePairingForActiveUser(): Promise<{
		restored: boolean;
		reason: string;
	}> {
		return restorePairingForActiveUser(this.getPairingLifecycleContext());
	}

	async pair(pairingCode: string): Promise<boolean> {
		return pairAgent(this.getPairingLifecycleContext(), pairingCode);
	}

	checkPairing(): boolean {
		return checkPairing(this.runtime);
	}

	async refreshPairingStatus(): Promise<boolean> {
		return refreshPairingStatus(this.getPairingLifecycleContext());
	}

	async refreshPairingStatusDetailed(): Promise<AgentPairingRefreshResult> {
		return refreshPairingStatusDetailed(this.getPairingLifecycleContext());
	}

	async unpair(): Promise<void> {
		return unpairAgent(this.getPairingLifecycleContext());
	}

	cancelActiveRequest(): boolean {
		return cancelAgentRequest(this.getRequestTransportContext());
	}

	async sendMessage(
		message: string,
		options?: AgentSendOptions,
	): Promise<AgentResponse> {
		return sendAgentMessage(this.getRequestTransportContext(), message, options);
	}

	async executePythonScript(
		request: PythonToolRequest,
	): Promise<AgentResponse> {
		return executeAgentPythonScript(this.getRequestTransportContext(), request);
	}

	async generateFloorPlan(specs: {
		width: number;
		height: number;
		rooms: number;
		output_path?: string;
	}): Promise<AgentResponse> {
		return generateFloorPlan(this.getRequestTransportContext(), specs);
	}

	async calculateElectricalGrid(specs: {
		conductor_size?: string;
		grid_spacing?: number;
		soil_resistivity?: number;
		fault_current?: number;
	}): Promise<AgentResponse> {
		return calculateElectricalGrid(this.getRequestTransportContext(), specs);
	}

	async calculateVoltageDrop(specs: {
		length: number;
		current: number;
		voltage?: number;
		conductor?: "Copper" | "Aluminum";
	}): Promise<AgentResponse> {
		return calculateVoltageDrop(this.getRequestTransportContext(), specs);
	}

	async analyzeProject(
		projectData: Record<string, unknown>,
	): Promise<AgentResponse> {
		return analyzeProject(this.getRequestTransportContext(), projectData);
	}

	async forecastTimeline(projectData: {
		type: string;
		complexity: "low" | "medium" | "high";
		team_size?: number;
	}): Promise<AgentResponse> {
		return forecastTimeline(this.getRequestTransportContext(), projectData);
	}

	async generateTransmittal(data: {
		project_id: string;
		files: string[];
		recipient: string;
		notes?: string;
	}): Promise<AgentResponse> {
		return generateTransmittal(this.getRequestTransportContext(), data);
	}

	async rememberProjectPattern(pattern: string): Promise<AgentResponse> {
		return rememberProjectPattern(this.getRequestTransportContext(), pattern);
	}

	async recallSimilarProjects(query: string): Promise<AgentResponse> {
		return recallSimilarProjects(this.getRequestTransportContext(), query);
	}

	async researchStandard(standard: string): Promise<AgentResponse> {
		return researchStandard(this.getRequestTransportContext(), standard);
	}

	async researchTopic(topic: string, context?: string): Promise<AgentResponse> {
		return researchTopic(this.getRequestTransportContext(), topic, context);
	}

	async searchElectricalStandards(query: string): Promise<AgentResponse> {
		return searchElectricalStandards(this.getRequestTransportContext(), query);
	}

	async analyzeRegulations(specifications: string): Promise<AgentResponse> {
		return analyzeRegulations(
			this.getRequestTransportContext(),
			specifications,
		);
	}

	async generateDocumentation(specs: {
		type: "design_report" | "calculation_sheet" | "test_report";
		data: Record<string, unknown>;
	}): Promise<AgentResponse> {
		return generateDocumentation(this.getRequestTransportContext(), specs);
	}

	async healthCheck(): Promise<boolean> {
		return healthCheckService({
			runtime: this.runtime,
			getSupabaseAccessToken: () => getSupabaseAccessToken(this.runtime),
		});
	}

	async fetchProfileCatalog(): Promise<{
		success: boolean;
		profiles: AgentProfileCatalogItem[];
		error?: string;
	}> {
		return fetchProfileCatalogService({
			runtime: this.runtime,
			getSupabaseAccessToken: () => getSupabaseAccessToken(this.runtime),
		});
	}

	async createOrchestrationRun(input: AgentRunCreateRequest): Promise<{
		success: boolean;
		runId?: string;
		status?: string;
		requestId?: string;
		error?: string;
	}> {
		return createOrchestrationRunService(
			{
				runtime: this.runtime,
				getSupabaseAccessToken: () => getSupabaseAccessToken(this.runtime),
			},
			input,
		);
	}

	async getOrchestrationRun(runId: string): Promise<{
		success: boolean;
		run?: AgentRunSnapshot;
		requestId?: string;
		error?: string;
	}> {
		return getOrchestrationRunService(
			{
				runtime: this.runtime,
				getSupabaseAccessToken: () => getSupabaseAccessToken(this.runtime),
			},
			runId,
		);
	}

	async cancelOrchestrationRun(runId: string): Promise<{
		success: boolean;
		status?: string;
		requestId?: string;
		error?: string;
	}> {
		return cancelOrchestrationRunService(
			{
				runtime: this.runtime,
				getSupabaseAccessToken: () => getSupabaseAccessToken(this.runtime),
			},
			runId,
		);
	}

	async listAgentTasks(filters?: {
		status?: AgentTaskStatus | AgentTaskStatus[];
		priority?: AgentTaskPriority;
		assigneeProfile?: string;
		runId?: string;
		limit?: number;
	}): Promise<{
		success: boolean;
		tasks: AgentTaskItem[];
		requestId?: string;
		error?: string;
	}> {
		return listAgentTasksService(
			{
				runtime: this.runtime,
				getSupabaseAccessToken: () => getSupabaseAccessToken(this.runtime),
			},
			filters,
		);
	}

	async getAgentTask(taskId: string): Promise<{
		success: boolean;
		task?: AgentTaskItem;
		requestId?: string;
		error?: string;
	}> {
		return getAgentTaskService(
			{
				runtime: this.runtime,
				getSupabaseAccessToken: () => getSupabaseAccessToken(this.runtime),
			},
			taskId,
		);
	}

	async reviewAgentTask(
		taskId: string,
		action: AgentReviewAction,
		note?: string,
	): Promise<{
		success: boolean;
		task?: AgentTaskItem;
		requestId?: string;
		error?: string;
	}> {
		return reviewAgentTaskService(
			{
				runtime: this.runtime,
				getSupabaseAccessToken: () => getSupabaseAccessToken(this.runtime),
			},
			taskId,
			action,
			note,
		);
	}

	async getAgentActivity(options?: {
		runId?: string;
		limit?: number;
	}): Promise<{
		success: boolean;
		activity: AgentActivityItem[];
		requestId?: string;
		error?: string;
	}> {
		return getAgentActivityService(
			{
				runtime: this.runtime,
				getSupabaseAccessToken: () => getSupabaseAccessToken(this.runtime),
			},
			options,
		);
	}

	subscribeOrchestrationRunEvents(
		runId: string,
		handlers: AgentRunEventStreamHandlers,
	): AgentRunEventStream {
		return subscribeOrchestrationRunEventsService(
			{
				runtime: this.runtime,
				getSupabaseAccessToken: () => getSupabaseAccessToken(this.runtime),
			},
			runId,
			handlers,
		);
	}
}

export const agentService = new AgentService();
