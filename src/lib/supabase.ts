import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Reuse a single Supabase client across Vite HMR reloads and replace the
 * Navigator Lock with a no-op.  We don't use Supabase Auth in this app, so
 * the lock (used to coordinate auth-token refresh across tabs) is unnecessary
 * and only causes NavigatorLockAcquireTimeoutError noise during development.
 *
 * The custom `lock` function simply executes `fn` immediately without
 * acquiring any real lock – this is the officially-supported escape hatch
 * from auth-js when you don't need cross-tab session coordination.
 */
const _global = globalThis as unknown as { __supabase: ReturnType<typeof createClient> };
export const supabase =
  _global.__supabase ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'suite-auth',
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      // No-op lock – bypasses Navigator LockManager entirely
      lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => {
        return await fn();
      },
    },
  });

export interface Formula {
  id: string;
  name: string;
  category: string;
  formula: string;
  description: string;
  variables: Array<{
    symbol: string;
    name: string;
    unit: string;
  }>;
  created_at: string;
}

export interface SavedCalculation {
  id: string;
  user_id?: string;
  calculation_type: string;
  inputs: Record<string, number>;
  results: Record<string, number>;
  notes: string;
  created_at: string;
}

export interface SavedCircuit {
  id: string;
  user_id?: string;
  name: string;
  circuit_data: {
    components: Array<{
      type: string;
      value: string;
      position: { x: number; y: number };
    }>;
  };
  image_url?: string;
  created_at: string;
}
