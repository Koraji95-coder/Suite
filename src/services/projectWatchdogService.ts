import { logger } from "@/lib/logger";
import { deleteSetting, loadSetting, saveSetting } from "@/settings/userSettings";
import { supabase } from "@/supabase/client";
import type { Database } from "@/supabase/database";
import {
	type WatchdogProjectRule,
	type WatchdogProjectRulesSyncResponse,
	type WatchdogDrawingActivitySyncResponse,
	watchdogService,
} from "./watchdogService";

export const WATCHDOG_PROJECT_RULE_SETTING_KEY = "watchdog_project_rule";

type ProjectRow = Pick<
	Database["public"]["Tables"]["projects"]["Row"],
	"id" | "user_id" | "watchdog_root_path" | "updated_at"
>;

interface StoredProjectWatchdogRule {
	roots?: string[];
	includeGlobs?: string[];
	excludeGlobs?: string[];
	drawingPatterns?: string[];
	metadata?: Record<string, unknown>;
	updatedAt?: number | null;
}

function normalizeStringList(values: string[] | undefined | null): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const value of values ?? []) {
		const trimmed = String(value ?? "").trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
	}
	return out;
}

function normalizeMetadata(
	value: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
	return value && typeof value === "object" ? { ...value } : {};
}

function isStoredRuleConfigured(rule: StoredProjectWatchdogRule | null | undefined): boolean {
	if (!rule) {
		return false;
	}
	return Boolean(
		(rule.roots ?? []).length ||
			(rule.includeGlobs ?? []).length ||
			(rule.excludeGlobs ?? []).length ||
			(rule.drawingPatterns ?? []).length ||
			Object.keys(rule.metadata ?? {}).length,
	);
}

function composeProjectRule(
	projectId: string,
	primaryRoot: string | null | undefined,
	stored: StoredProjectWatchdogRule | null | undefined,
	projectUpdatedAt?: string | null,
): WatchdogProjectRule {
	const normalizedPrimaryRoot = String(primaryRoot ?? "").trim() || null;
	const extraRoots = normalizeStringList(stored?.roots);
	const roots = normalizedPrimaryRoot
		? normalizeStringList([normalizedPrimaryRoot, ...extraRoots])
		: extraRoots;
	const storedUpdatedAt =
		typeof stored?.updatedAt === "number" && Number.isFinite(stored.updatedAt)
			? stored.updatedAt
			: null;
	const projectUpdatedAtMs =
		projectUpdatedAt && Number.isFinite(Date.parse(projectUpdatedAt))
			? Date.parse(projectUpdatedAt)
			: null;

	return {
		projectId,
		roots,
		includeGlobs: normalizeStringList(stored?.includeGlobs),
		excludeGlobs: normalizeStringList(stored?.excludeGlobs),
		drawingPatterns: normalizeStringList(stored?.drawingPatterns),
		metadata: normalizeMetadata(stored?.metadata),
		updatedAt: Math.max(storedUpdatedAt ?? 0, projectUpdatedAtMs ?? 0),
	};
}

async function requireCurrentUserId(): Promise<string> {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error) {
		throw error;
	}
	if (!user) {
		throw new Error("Not authenticated");
	}
	return user.id;
}

async function loadStoredProjectRule(
	projectId: string,
): Promise<StoredProjectWatchdogRule | null> {
	const stored = await loadSetting<StoredProjectWatchdogRule | null>(
		WATCHDOG_PROJECT_RULE_SETTING_KEY,
		projectId,
		null,
	);
	return stored && typeof stored === "object" ? stored : null;
}

export async function loadSharedProjectWatchdogRule(
	projectId: string,
): Promise<WatchdogProjectRule | null> {
	const normalizedProjectId = String(projectId ?? "").trim();
	if (!normalizedProjectId) {
		return null;
	}
	const userId = await requireCurrentUserId();
	const [{ data: project, error: projectError }, stored] = await Promise.all([
		supabase
			.from("projects")
			.select("id, user_id, watchdog_root_path, updated_at")
			.eq("id", normalizedProjectId)
			.eq("user_id", userId)
			.maybeSingle(),
		loadStoredProjectRule(normalizedProjectId),
	]);
	if (projectError) {
		throw projectError;
	}
	if (!project) {
		return null;
	}
	return composeProjectRule(
		(project as ProjectRow).id,
		(project as ProjectRow).watchdog_root_path,
		stored,
		(project as ProjectRow).updated_at,
	);
}

export async function saveSharedProjectWatchdogRule(
	projectId: string,
	rule: Omit<WatchdogProjectRule, "projectId" | "updatedAt">,
): Promise<WatchdogProjectRule> {
	const normalizedProjectId = String(projectId ?? "").trim();
	if (!normalizedProjectId) {
		throw new Error("projectId is required");
	}
	const userId = await requireCurrentUserId();
	const normalizedRule = {
		roots: normalizeStringList(rule.roots),
		includeGlobs: normalizeStringList(rule.includeGlobs),
		excludeGlobs: normalizeStringList(rule.excludeGlobs),
		drawingPatterns: normalizeStringList(rule.drawingPatterns),
		metadata: normalizeMetadata(rule.metadata),
	};
	const primaryRoot = normalizedRule.roots[0] ?? null;
	const extraRoots = primaryRoot ? normalizedRule.roots.slice(1) : normalizedRule.roots;
	const updatedAt = Date.now();
	const storedRule: StoredProjectWatchdogRule = {
		roots: extraRoots,
		includeGlobs: normalizedRule.includeGlobs,
		excludeGlobs: normalizedRule.excludeGlobs,
		drawingPatterns: normalizedRule.drawingPatterns,
		metadata: normalizedRule.metadata,
		updatedAt,
	};

	const { data: project, error: projectError } = await supabase
		.from("projects")
		.update({
			watchdog_root_path: primaryRoot,
		})
		.eq("id", normalizedProjectId)
		.eq("user_id", userId)
		.select("id, user_id, watchdog_root_path, updated_at")
		.single();
	if (projectError) {
		throw projectError;
	}

	if (isStoredRuleConfigured(storedRule)) {
		const saveResult = await saveSetting(
			WATCHDOG_PROJECT_RULE_SETTING_KEY,
			storedRule,
			normalizedProjectId,
		);
		if (!saveResult.success) {
			throw new Error(saveResult.error || "Unable to save project watchdog rules.");
		}
	} else {
		const deleteResult = await deleteSetting(
			WATCHDOG_PROJECT_RULE_SETTING_KEY,
			normalizedProjectId,
		);
		if (!deleteResult.success) {
			throw new Error(
				deleteResult.error || "Unable to clear project watchdog rules.",
			);
		}
	}

	return composeProjectRule(
		normalizedProjectId,
		(project as ProjectRow).watchdog_root_path,
		storedRule,
		(project as ProjectRow).updated_at,
	);
}

export async function listSharedProjectWatchdogRules(): Promise<WatchdogProjectRule[]> {
	const userId = await requireCurrentUserId();
	const [{ data: projects, error: projectsError }, { data: settings, error: settingsError }] =
		await Promise.all([
			supabase
				.from("projects")
				.select("id, user_id, watchdog_root_path, updated_at")
				.eq("user_id", userId)
				.order("created_at", { ascending: false }),
			supabase
				.from("user_settings")
				.select("project_id, setting_value")
				.eq("user_id", userId)
				.eq("setting_key", WATCHDOG_PROJECT_RULE_SETTING_KEY)
				.not("project_id", "is", null),
		]);

	if (projectsError) {
		throw projectsError;
	}
	if (settingsError) {
		throw settingsError;
	}

	const settingsByProjectId = new Map<string, StoredProjectWatchdogRule>();
	for (const row of settings ?? []) {
		const projectId = String(row.project_id ?? "").trim();
		if (!projectId) continue;
		const settingValue =
			row.setting_value && typeof row.setting_value === "object"
				? (row.setting_value as unknown as StoredProjectWatchdogRule)
				: null;
		if (!settingValue) continue;
		settingsByProjectId.set(projectId, settingValue);
	}

	const rules: WatchdogProjectRule[] = [];
	for (const project of (projects ?? []) as ProjectRow[]) {
		const rule = composeProjectRule(
			project.id,
			project.watchdog_root_path,
			settingsByProjectId.get(project.id) ?? null,
			project.updated_at,
		);
		if (
			rule.roots.length === 0 &&
			rule.includeGlobs.length === 0 &&
			rule.excludeGlobs.length === 0 &&
			rule.drawingPatterns.length === 0
		) {
			continue;
		}
		rules.push(rule);
	}
	return rules;
}

export async function syncSharedProjectWatchdogRulesToLocalRuntime(): Promise<WatchdogProjectRulesSyncResponse> {
	const rules = await listSharedProjectWatchdogRules();
	return watchdogService.syncProjectRules(rules);
}

export async function syncSharedDrawingActivityFromLocalRuntime(
	limit?: number,
): Promise<WatchdogDrawingActivitySyncResponse> {
	return watchdogService.syncDrawingActivity(limit);
}

export async function clearLocalProjectWatchdogRule(projectId: string): Promise<void> {
	try {
		await watchdogService.deleteProjectRule(projectId);
	} catch (error) {
		logger.warn(
			"Unable to clear local watchdog project rule after project mutation.",
			"projectWatchdogService",
			error,
		);
	}
}
