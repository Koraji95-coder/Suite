import type { RealtimeChannel } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { supabase } from "@/supabase/client";
import { isSupabaseConfigured } from "@/supabase/utils";
import type { WorkLedgerRow } from "./types";

let realtimeChannel: RealtimeChannel | null = null;
let realtimeUserId: string | null = null;

export async function startRealtimeEntryListener(
	onEntry: (entry: WorkLedgerRow) => void,
	getUserId: () => Promise<string | null>,
) {
	if (!isSupabaseConfigured()) return;
	const userId = await getUserId();
	if (!userId) return;

	if (realtimeChannel && realtimeUserId === userId) return;

	if (realtimeChannel) {
		supabase.removeChannel(realtimeChannel);
		realtimeChannel = null;
	}

	realtimeUserId = userId;
	realtimeChannel = supabase
		.channel(`work_ledger_entries:${userId}`)
		.on(
			"postgres_changes",
			{
				event: "*",
				schema: "public",
				table: "work_ledger_entries",
				filter: `user_id=eq.${userId}`,
			},
			(payload) => {
				if (payload.new && typeof payload.new === "object") {
					onEntry(payload.new as WorkLedgerRow);
				}
			},
		)
		.subscribe((status) => {
			if (status === "CHANNEL_ERROR") {
				logger.warn("WorkLedgerService", "Realtime channel error");
			}
		});
}

export function stopRealtimeIfIdle(hasListeners: () => boolean) {
	if (hasListeners() || !realtimeChannel) return;
	supabase.removeChannel(realtimeChannel);
	realtimeChannel = null;
	realtimeUserId = null;
}
