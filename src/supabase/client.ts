// src/supabase/client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { shouldDetectSupabaseSessionInUrl } from "@/auth/supabaseCallback";
import {
	buildSupabaseAuthStorageKey,
	cleanupLegacySupabaseAuthStorage,
} from "./authStorage";
import type { Database } from "./database";

const supabaseUrl =
	import.meta.env.VITE_SUPABASE_URL ?? "https://example.supabase.co";
const supabaseAnonKey =
	import.meta.env.VITE_SUPABASE_ANON_KEY ?? "public-anon-key-placeholder";
const supabaseStorageKey = buildSupabaseAuthStorageKey(supabaseUrl);

type AppSupabaseClient = SupabaseClient<Database>;
const _global = globalThis as unknown as {
	__supabase?: AppSupabaseClient;
	__supabaseStorageKey?: string;
};

const devAuthOverrides = import.meta.env.DEV
	? {
			// No-op lock in DEV to avoid LockManager weirdness during HMR.
			lock: async <R>(
				_name: string,
				_acquireTimeout: number,
				fn: () => Promise<R>,
			): Promise<R> => fn(),
		}
	: {};

cleanupLegacySupabaseAuthStorage(supabaseStorageKey);

if (_global.__supabaseStorageKey !== supabaseStorageKey) {
	_global.__supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
		auth: {
			storageKey: supabaseStorageKey,
			autoRefreshToken: true,
			detectSessionInUrl: shouldDetectSupabaseSessionInUrl,
			persistSession: true,
			...devAuthOverrides,
		},
	});
	_global.__supabaseStorageKey = supabaseStorageKey;
}

export const supabase = _global.__supabase as AppSupabaseClient;
