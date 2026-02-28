// src/supabase/client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";

const supabaseUrl =
	import.meta.env.VITE_SUPABASE_URL ?? "https://example.supabase.co";
const supabaseAnonKey =
	import.meta.env.VITE_SUPABASE_ANON_KEY ?? "public-anon-key-placeholder";

type AppSupabaseClient = SupabaseClient<Database>;
const _global = globalThis as unknown as { __supabase?: AppSupabaseClient };

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

export const supabase = (_global.__supabase ??= createClient<Database>(
	supabaseUrl,
	supabaseAnonKey,
	{
		auth: {
			storageKey: "suite-auth",
			autoRefreshToken: true,
			detectSessionInUrl: true,
			persistSession: true,
			...devAuthOverrides,
		},
	},
)) as AppSupabaseClient;
