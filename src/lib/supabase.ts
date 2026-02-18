import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Reuse a single Supabase client across Vite HMR reloads and replace the
 * Navigator Lock with a no-op to avoid NavigatorLockAcquireTimeoutError.
 * 
 * Auth persistence is enabled (persistSession: true) to maintain session
 * across page reloads. The custom `lock` function is a no-op to avoid
 * cross-tab coordination overhead in development.
 */
const _global = globalThis as unknown as { __supabase: ReturnType<typeof createClient> };
export const supabase =
  _global.__supabase ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storageKey: 'suite-auth',
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      // No-op lock – bypasses Navigator LockManager entirely
      lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
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
