// src/settings/userSettings.ts
/**
 * User Settings Service
 * Stores user preferences/settings in Supabase.
 *
 * Critical: NEVER hardcode user ids. Always use the authenticated Supabase user id.
 */

import type { Database, Json } from "@/supabase/database";
import { logger } from "../lib/logger";
import { supabase } from "../supabase/client";
import { isSupabaseConfigured } from "../supabase/utils";

export type UserSetting = Database["public"]["Tables"]["user_settings"]["Row"];
export type UserPreferences =
	Database["public"]["Tables"]["user_preferences"]["Row"];

async function requireUserId(): Promise<string> {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();

	if (error) throw error;
	if (!user) throw new Error("Not authenticated");
	return user.id;
}

export async function saveSetting(
	key: string,
	value: unknown,
	projectId?: string | null,
): Promise<{ success: boolean; error?: string }> {
	try {
		if (!isSupabaseConfigured()) {
			return { success: false, error: "Supabase not configured" };
		}

		const userId = await requireUserId();

		const { error } = await supabase.rpc("upsert_user_setting", {
			p_user_id: userId,
			p_setting_key: key,
			p_setting_value: value as Json,
			p_project_id: projectId ?? null,
		});

		if (error) throw error;

		logger.debug(`Setting saved: ${key}`, "userSettings");
		return { success: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		logger.error(`Failed to save setting: ${key}`, "userSettings", {
			error: message,
		});
		return { success: false, error: message };
	}
}

export async function loadSetting<T = unknown>(
	key: string,
	projectId?: string | null,
	defaultValue?: T,
): Promise<T | null> {
	try {
		if (!isSupabaseConfigured()) return defaultValue ?? null;

		const userId = await requireUserId();

		let query = supabase
			.from("user_settings")
			.select("setting_value")
			.eq("user_id", userId)
			.eq("setting_key", key);

		if (projectId) query = query.eq("project_id", projectId);
		else query = query.is("project_id", null);

		const { data, error } = await query.maybeSingle();
		if (error) throw error;

		if (data) {
			logger.debug(`Setting loaded: ${key}`, "userSettings");
			return data.setting_value as T;
		}

		return defaultValue ?? null;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		logger.warn(
			`Failed to load setting: ${key}, using default`,
			"userSettings",
			{ error: message },
		);
		return defaultValue ?? null;
	}
}

export async function deleteSetting(
	key: string,
	projectId?: string | null,
): Promise<{ success: boolean; error?: string }> {
	try {
		if (!isSupabaseConfigured()) {
			return { success: false, error: "Supabase not configured" };
		}

		const userId = await requireUserId();

		let query = supabase
			.from("user_settings")
			.delete()
			.eq("user_id", userId)
			.eq("setting_key", key);

		if (projectId) query = query.eq("project_id", projectId);
		else query = query.is("project_id", null);

		const { error } = await query;
		if (error) throw error;

		logger.debug(`Setting deleted: ${key}`, "userSettings");
		return { success: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		logger.error(`Failed to delete setting: ${key}`, "userSettings", {
			error: message,
		});
		return { success: false, error: message };
	}
}

export async function loadProjectSettings(
	projectId: string,
): Promise<Record<string, unknown>> {
	try {
		if (!isSupabaseConfigured()) return {};

		const userId = await requireUserId();

		const { data, error } = await supabase
			.from("user_settings")
			.select("setting_key, setting_value")
			.eq("user_id", userId)
			.eq("project_id", projectId);

		if (error) throw error;

		const settings: Record<string, unknown> = {};
		data?.forEach((item) => {
			settings[item.setting_key] = item.setting_value;
		});

		return settings;
	} catch (error) {
		logger.error("Failed to load project settings", "userSettings", { error });
		return {};
	}
}

export async function savePreferences(
	preferences: Partial<
		Omit<UserPreferences, "id" | "user_id" | "created_at" | "updated_at">
	>,
): Promise<{ success: boolean; error?: string }> {
	try {
		if (!isSupabaseConfigured()) {
			return { success: false, error: "Supabase not configured" };
		}

		const userId = await requireUserId();

		const { data: existing, error: existingError } = await supabase
			.from("user_preferences")
			.select("id")
			.eq("user_id", userId)
			.maybeSingle();

		if (existingError) throw existingError;

		if (existing) {
			const { error } = await supabase
				.from("user_preferences")
				.update(preferences)
				.eq("user_id", userId);
			if (error) throw error;
		} else {
			const { error } = await supabase
				.from("user_preferences")
				.insert({ user_id: userId, ...preferences });
			if (error) throw error;
		}

		logger.debug("Preferences saved", "userSettings");
		return { success: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		logger.error("Failed to save preferences", "userSettings", {
			error: message,
		});
		return { success: false, error: message };
	}
}

export async function loadPreferences(): Promise<UserPreferences | null> {
	try {
		if (!isSupabaseConfigured()) return null;

		const userId = await requireUserId();

		const { data, error } = await supabase
			.from("user_preferences")
			.select("*")
			.eq("user_id", userId)
			.maybeSingle();

		if (error) throw error;

		if (data) {
			logger.debug("Preferences loaded", "userSettings");
			return data as UserPreferences;
		}

		return null;
	} catch (error) {
		logger.error("Failed to load preferences", "userSettings", { error });
		return null;
	}
}

export async function migrateFromLocalStorage(
	localStorageKey: string,
	settingKey: string,
	projectId?: string | null,
): Promise<void> {
	if (typeof window === "undefined") return;

	const raw = window.localStorage.getItem(localStorageKey);
	if (raw == null) return;

	let parsedValue: unknown = raw;
	try {
		parsedValue = JSON.parse(raw);
	} catch {
		parsedValue = raw;
	}

	const existing = await loadSetting<unknown>(settingKey, projectId, null);
	if (existing === null) {
		await saveSetting(settingKey, parsedValue, projectId);
	}

	window.localStorage.removeItem(localStorageKey);
}
