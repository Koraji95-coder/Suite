import { useEffect, useMemo, useState } from "react";
import {
	saveSharedProjectWatchdogRule,
	syncSharedProjectWatchdogRulesToLocalRuntime,
} from "@/services/projectWatchdogService";
import type {
	ProjectTrackedDrawingSummary,
	ProjectWatchdogTelemetry,
} from "./useProjectWatchdogTelemetry";

interface RuleSummaryItem {
	label: string;
	values: string[] | undefined;
	alwaysShow: boolean;
}

interface UseProjectTelemetryPanelStateArgs {
	projectId: string;
	telemetry: ProjectWatchdogTelemetry;
	onRootPathChange?: (rootPath: string | null) => void;
}

function joinRuleLines(values: string[] | undefined): string {
	return (values ?? []).join("\n");
}

function parseRuleLines(rawValue: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const part of rawValue.split(/[\n,]/)) {
		const trimmed = part.trim();
		if (!trimmed) {
			continue;
		}
		const key = trimmed.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		out.push(trimmed);
	}
	return out;
}

export function useProjectTelemetryPanelState({
	projectId,
	telemetry,
	onRootPathChange,
}: UseProjectTelemetryPanelStateArgs) {
	const [rulesExpanded, setRulesExpanded] = useState(false);
	const [editingRules, setEditingRules] = useState(false);
	const [savingRules, setSavingRules] = useState(false);
	const [ruleError, setRuleError] = useState<string | null>(null);
	const [ruleRoots, setRuleRoots] = useState("");
	const [ruleIncludes, setRuleIncludes] = useState("");
	const [ruleExcludes, setRuleExcludes] = useState("");
	const [rulePatterns, setRulePatterns] = useState("");
	const [localRule, setLocalRule] = useState(telemetry.rule);
	const [expandedDrawings, setExpandedDrawings] = useState<Record<string, boolean>>(
		{},
	);

	useEffect(() => {
		if (editingRules) {
			return;
		}
		const incomingRule = telemetry.rule;
		const currentUpdatedAt = localRule?.updatedAt ?? 0;
		const incomingUpdatedAt = incomingRule?.updatedAt ?? 0;
		const nextRule =
			!localRule || incomingUpdatedAt > currentUpdatedAt
				? incomingRule
				: localRule;
		if (nextRule !== localRule) {
			setLocalRule(nextRule);
		}
		setRuleRoots(joinRuleLines(nextRule?.roots));
		setRuleIncludes(joinRuleLines(nextRule?.includeGlobs));
		setRuleExcludes(joinRuleLines(nextRule?.excludeGlobs));
		setRulePatterns(joinRuleLines(nextRule?.drawingPatterns));
	}, [editingRules, localRule, telemetry.rule]);

	const effectiveRule = localRule ?? telemetry.rule;
	const sessionTimeline = useMemo(
		() =>
			(telemetry.sessions.length ? telemetry.sessions : telemetry.liveSessions).slice(
				0,
				3,
			),
		[telemetry.liveSessions, telemetry.sessions],
	);
	const loggedSessionCount = telemetry.sessions.length
		? telemetry.sessions.length
		: telemetry.liveSessions.length;
	const trackedDrawings = useMemo(
		() => telemetry.trackedDrawings.slice(0, 12),
		[telemetry.trackedDrawings],
	);
	const fallbackSessions = useMemo(
		() => telemetry.sessions.slice(0, 4),
		[telemetry.sessions],
	);
	const ruleSummaryItems = useMemo<RuleSummaryItem[]>(
		() =>
			[
				{
					label: "Roots",
					values: effectiveRule?.roots,
					alwaysShow: true,
				},
				{
					label: "Include",
					values: effectiveRule?.includeGlobs,
					alwaysShow: false,
				},
				{
					label: "Exclude",
					values: effectiveRule?.excludeGlobs,
					alwaysShow: false,
				},
				{
					label: "Drawing patterns",
					values: effectiveRule?.drawingPatterns,
					alwaysShow: false,
				},
			].filter((item) => item.alwaysShow || (item.values?.length ?? 0) > 0),
		[effectiveRule],
	);

	const startEditingRules = () => {
		setRuleError(null);
		setRulesExpanded(true);
		setEditingRules(true);
		setRuleRoots(joinRuleLines(effectiveRule?.roots));
		setRuleIncludes(joinRuleLines(effectiveRule?.includeGlobs));
		setRuleExcludes(joinRuleLines(effectiveRule?.excludeGlobs));
		setRulePatterns(joinRuleLines(effectiveRule?.drawingPatterns));
	};

	const cancelEditingRules = () => {
		setEditingRules(false);
		setRuleError(null);
		setRuleRoots(joinRuleLines(effectiveRule?.roots));
		setRuleIncludes(joinRuleLines(effectiveRule?.includeGlobs));
		setRuleExcludes(joinRuleLines(effectiveRule?.excludeGlobs));
		setRulePatterns(joinRuleLines(effectiveRule?.drawingPatterns));
	};

	const saveRules = async () => {
		if (savingRules) {
			return;
		}
		setSavingRules(true);
		setRuleError(null);
		try {
			const responseRule = await saveSharedProjectWatchdogRule(projectId, {
				roots: parseRuleLines(ruleRoots),
				includeGlobs: parseRuleLines(ruleIncludes),
				excludeGlobs: parseRuleLines(ruleExcludes),
				drawingPatterns: parseRuleLines(rulePatterns),
				metadata: effectiveRule?.metadata ?? {},
			});
			setLocalRule(responseRule);
			setEditingRules(false);
			onRootPathChange?.(responseRule.roots[0] ?? null);

			try {
				await syncSharedProjectWatchdogRulesToLocalRuntime();
			} catch (syncError) {
				setRuleError(
					syncError instanceof Error
						? `Rules saved, but local watchdog sync failed: ${syncError.message}`
						: "Rules saved, but local watchdog sync failed.",
				);
			}
		} catch (error) {
			setRuleError(
				error instanceof Error
					? error.message
					: "Unable to update project mapping rules.",
			);
		} finally {
			setSavingRules(false);
		}
	};

	const toggleDrawingExpansion = (drawing: ProjectTrackedDrawingSummary) => {
		setExpandedDrawings((previous) => ({
			...previous,
			[drawing.drawingPath]: !previous[drawing.drawingPath],
		}));
	};

	return {
		effectiveRule,
		sessionTimeline,
		loggedSessionCount,
		trackedDrawings,
		fallbackSessions,
		ruleSummaryItems,
		rulesExpanded,
		setRulesExpanded,
		editingRules,
		savingRules,
		ruleError,
		ruleRoots,
		setRuleRoots,
		ruleIncludes,
		setRuleIncludes,
		ruleExcludes,
		setRuleExcludes,
		rulePatterns,
		setRulePatterns,
		expandedDrawings,
		startEditingRules,
		cancelEditingRules,
		saveRules,
		toggleDrawingExpansion,
	};
}
