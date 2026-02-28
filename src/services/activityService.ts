import type { RealtimeChannel } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import { isSupabaseConfigured, safeSupabaseQuery } from "@/supabase/utils";
import type { Database } from "@/supabase/database";

export type ActivityLogRow =
	Database["public"]["Tables"]["activity_log"]["Row"];
export type ActivityLogInsert =
	Database["public"]["Tables"]["activity_log"]["Insert"];

export type ActivityLogInput = {
	action: string;
	description: string;
	projectId?: string | null;
	taskId?: string | null;
};

type ActivityListener = (entry: ActivityLogRow) => void;

const listeners = new Set<ActivityListener>();
let realtimeChannel: RealtimeChannel | null = null;
let realtimeUserId: string | null = null;
let warnedMissingUser = false;

const createId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const emit = (entry: ActivityLogRow) => {
	listeners.forEach((listener) => listener(entry));
};

const getCurrentUserId = async (): Promise<string | null> => {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user) {
		if (!warnedMissingUser) {
			logger.warn("ActivityService", "Missing authenticated user", { error });
			warnedMissingUser = true;
		}
		return null;
	}
	warnedMissingUser = false;
	return user.id;
};

const buildLocalEntry = (
	input: ActivityLogInput,
	userId: string | null,
): ActivityLogRow => ({
	id: createId(),
	action: input.action,
	description: input.description,
	project_id: input.projectId ?? null,
	task_id: input.taskId ?? null,
	timestamp: new Date().toISOString(),
	user_id: userId ?? "local",
});

const startRealtime = async () => {
	if (!isSupabaseConfigured()) return;
	const userId = await getCurrentUserId();
	if (!userId) return;

	if (realtimeChannel && realtimeUserId === userId) return;

	if (realtimeChannel) {
		supabase.removeChannel(realtimeChannel);
		realtimeChannel = null;
	}

	realtimeUserId = userId;
	realtimeChannel = supabase
		.channel(`activity_log:${userId}`)
		.on(
			"postgres_changes",
			{
				event: "INSERT",
				schema: "public",
				table: "activity_log",
				filter: `user_id=eq.${userId}`,
			},
			(payload) => {
				const entry = payload.new as ActivityLogRow;
				emit(entry);
			},
		)
		.subscribe((status) => {
			if (status === "CHANNEL_ERROR") {
				logger.warn("ActivityService", "Realtime channel error");
			}
		});
};

const stopRealtimeIfIdle = () => {
	if (listeners.size > 0 || !realtimeChannel) return;
	supabase.removeChannel(realtimeChannel);
	realtimeChannel = null;
	realtimeUserId = null;
};

export const activityService = {
	subscribe(listener: ActivityListener) {
		listeners.add(listener);
		void startRealtime();
		return () => {
			listeners.delete(listener);
			stopRealtimeIfIdle();
		};
	},

	async logActivity(input: ActivityLogInput): Promise<ActivityLogRow | null> {
		const userId = await getCurrentUserId();
		if (!userId) {
			const localEntry = buildLocalEntry(input, null);
			emit(localEntry);
			return localEntry;
		}

		const payload: ActivityLogInsert = {
			action: input.action,
			description: input.description,
			project_id: input.projectId ?? null,
			task_id: input.taskId ?? null,
			timestamp: new Date().toISOString(),
			user_id: userId,
		};

		const result = await safeSupabaseQuery(
			async () =>
				await supabase
					.from("activity_log")
					.insert(payload)
					.select("*")
					.maybeSingle(),
			"ActivityService",
		);

		if (result.data) {
			const entry = result.data as ActivityLogRow;
			emit(entry);
			return entry;
		}

		const fallback = buildLocalEntry(input, userId);
		emit(fallback);
		return fallback;
	},

	async fetchRecentActivity(limit = 7) {
		const userId = await getCurrentUserId();
		if (!userId) return { data: [] as ActivityLogRow[], error: null };

		const result = await safeSupabaseQuery(
			async () =>
				await supabase
					.from("activity_log")
					.select("*")
					.eq("user_id", userId)
					.order("timestamp", { ascending: false })
					.limit(limit),
			"ActivityService",
		);

		return {
			data: (result.data ?? []) as ActivityLogRow[],
			error: result.error,
		};
	},
};

export const logActivity = activityService.logActivity;
