import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type AutoDraftHealth,
	autoDraftService,
} from "@/components/apps/autodraft-studio/autodraftService";
import type { AgentActivityItem } from "@/services/agent/types";
import { agentService } from "@/services/agentService";
import type {
	WorkLedgerRow,
	WorktaleReadinessResponse,
} from "@/services/workLedgerService";
import { workLedgerService } from "@/services/workLedgerService";

const DEVELOPER_PORTAL_OVERVIEW_CACHE_TTL_MS = 60_000;

export interface DeveloperPortalPublishingSnapshot {
	readiness: WorktaleReadinessResponse | null;
	readinessError: string | null;
	draftCount: number;
	readyCount: number;
	publishedCount: number;
	suggestionCount: number;
	suggestionSources: {
		git: number;
		agent: number;
		watchdog: number;
	} | null;
	latestEntry: WorkLedgerRow | null;
}

export interface DeveloperPortalAgentSnapshot {
	brokerEnabled: boolean;
	profileCount: number;
	awaitingReviewCount: number;
	activeTaskCount: number;
	activityCount: number;
	latestActivity: AgentActivityItem | null;
	error: string | null;
}

export interface DeveloperPortalAutomationSnapshot {
	health: AutoDraftHealth | null;
	ruleCount: number;
	error: string | null;
}

export interface DeveloperPortalOverviewSnapshot {
	publishing: DeveloperPortalPublishingSnapshot;
	agents: DeveloperPortalAgentSnapshot;
	automation: DeveloperPortalAutomationSnapshot;
}

interface UseDeveloperPortalOverviewDataResult {
	data: DeveloperPortalOverviewSnapshot;
	loading: boolean;
	refreshing: boolean;
	refreshNow: () => Promise<void>;
}

const EMPTY_OVERVIEW: DeveloperPortalOverviewSnapshot = {
	publishing: {
		readiness: null,
		readinessError: null,
		draftCount: 0,
		readyCount: 0,
		publishedCount: 0,
		suggestionCount: 0,
		suggestionSources: null,
		latestEntry: null,
	},
	agents: {
		brokerEnabled: false,
		profileCount: 0,
		awaitingReviewCount: 0,
		activeTaskCount: 0,
		activityCount: 0,
		latestActivity: null,
		error: null,
	},
	automation: {
		health: null,
		ruleCount: 0,
		error: null,
	},
};

let cachedOverviewState: {
	userId: string;
	updatedAt: number;
	data: DeveloperPortalOverviewSnapshot;
} | null = null;

function isFreshCache(updatedAt: number) {
	return Date.now() - updatedAt <= DEVELOPER_PORTAL_OVERVIEW_CACHE_TTL_MS;
}

function readCachedOverviewState(userId: string | null) {
	if (!userId || !cachedOverviewState) {
		return null;
	}
	if (cachedOverviewState.userId !== userId) {
		return null;
	}
	if (!isFreshCache(cachedOverviewState.updatedAt)) {
		return null;
	}
	return cachedOverviewState.data;
}

function writeCachedOverviewState(
	userId: string,
	data: DeveloperPortalOverviewSnapshot,
) {
	cachedOverviewState = {
		userId,
		updatedAt: Date.now(),
		data,
	};
}

function resolveErrorMessage(error: unknown) {
	if (error instanceof Error && error.message.trim()) {
		return error.message.trim();
	}
	return "Unable to load developer workshop signals.";
}

async function loadPublishingSnapshot(): Promise<DeveloperPortalPublishingSnapshot> {
	const [readinessResult, entriesResult, suggestionsResult] = await Promise.all(
		[
			workLedgerService.fetchWorktaleReadiness(),
			workLedgerService.fetchEntries({ limit: 48 }),
			workLedgerService.fetchDraftSuggestions(),
		],
	);

	const entries = entriesResult.data ?? [];
	const suggestions = suggestionsResult.data ?? [];

	return {
		readiness: readinessResult.data,
		readinessError:
			readinessResult.error?.message ?? entriesResult.error?.message ?? null,
		draftCount: entries.filter((entry) => entry.publish_state === "draft")
			.length,
		readyCount: entries.filter((entry) => entry.publish_state === "ready")
			.length,
		publishedCount: entries.filter(
			(entry) => entry.publish_state === "published",
		).length,
		suggestionCount: suggestions.length,
		suggestionSources: suggestionsResult.sources ?? null,
		latestEntry: entries[0] ?? null,
	};
}

async function loadAgentSnapshot(): Promise<DeveloperPortalAgentSnapshot> {
	const brokerEnabled = agentService.usesBroker();
	if (!brokerEnabled) {
		return {
			...EMPTY_OVERVIEW.agents,
			brokerEnabled: false,
		};
	}

	try {
		const [catalogResult, tasksResult, activityResult] = await Promise.all([
			agentService.fetchProfileCatalog(),
			agentService.listAgentTasks({ limit: 80 }),
			agentService.getAgentActivity({ limit: 80 }),
		]);

		const tasks = tasksResult.tasks ?? [];
		const activity = activityResult.activity ?? [];
		const firstError = [
			catalogResult.success ? null : catalogResult.error,
			tasksResult.success ? null : tasksResult.error,
			activityResult.success ? null : activityResult.error,
		].find((value) => typeof value === "string" && value.trim());

		return {
			brokerEnabled: true,
			profileCount: catalogResult.profiles?.length ?? 0,
			awaitingReviewCount: tasks.filter(
				(item) => item.status === "awaiting_review",
			).length,
			activeTaskCount: tasks.filter(
				(item) => item.status === "queued" || item.status === "running",
			).length,
			activityCount: activity.length,
			latestActivity: activity[0] ?? null,
			error: firstError ?? null,
		};
	} catch (error) {
		return {
			...EMPTY_OVERVIEW.agents,
			brokerEnabled: true,
			error: resolveErrorMessage(error),
		};
	}
}

async function loadAutomationSnapshot(): Promise<DeveloperPortalAutomationSnapshot> {
	try {
		const [health, rules] = await Promise.all([
			autoDraftService.health(),
			autoDraftService.listRules(),
		]);
		return {
			health,
			ruleCount: rules.length,
			error: null,
		};
	} catch (error) {
		return {
			health: null,
			ruleCount: 0,
			error: resolveErrorMessage(error),
		};
	}
}

async function loadDeveloperPortalOverview(
	userId: string,
): Promise<DeveloperPortalOverviewSnapshot> {
	const [publishing, agents, automation] = await Promise.all([
		loadPublishingSnapshot(),
		loadAgentSnapshot(),
		loadAutomationSnapshot(),
	]);

	const next = {
		publishing,
		agents,
		automation,
	};
	writeCachedOverviewState(userId, next);
	return next;
}

export function useDeveloperPortalOverviewData(
	userId: string | null | undefined,
): UseDeveloperPortalOverviewDataResult {
	const normalizedUserId = useMemo(
		() => String(userId || "").trim() || null,
		[userId],
	);
	const cached = readCachedOverviewState(normalizedUserId);
	const [data, setData] = useState<DeveloperPortalOverviewSnapshot>(
		() => cached ?? EMPTY_OVERVIEW,
	);
	const [loading, setLoading] = useState(() => cached === null);
	const [refreshing, setRefreshing] = useState(false);

	const refreshNow = useCallback(async () => {
		if (!normalizedUserId) {
			setData(EMPTY_OVERVIEW);
			setLoading(false);
			setRefreshing(false);
			return;
		}

		const hasCachedState = readCachedOverviewState(normalizedUserId) !== null;
		if (!hasCachedState) {
			setLoading(true);
		}
		setRefreshing(true);
		try {
			const next = await loadDeveloperPortalOverview(normalizedUserId);
			setData(next);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, [normalizedUserId]);

	useEffect(() => {
		if (!normalizedUserId) {
			setData(EMPTY_OVERVIEW);
			setLoading(false);
			setRefreshing(false);
			return;
		}
		const cachedState = readCachedOverviewState(normalizedUserId);
		if (cachedState) {
			setData(cachedState);
			setLoading(false);
		}
		void refreshNow();
	}, [normalizedUserId, refreshNow]);

	return {
		data,
		loading,
		refreshing,
		refreshNow,
	};
}
