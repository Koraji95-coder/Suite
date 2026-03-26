declare module "../../scripts/lib/supabase-cli.mjs" {
	export function isRetriableSupabaseStartFailure(outputText?: string): boolean;
	export function runSupabaseStartWithRetry(
		runOnce: () => Promise<{
			status?: number | null;
			stdout?: string;
			stderr?: string;
		}>,
		options?: {
			maxAttempts?: number;
			delayMs?: number;
			onRetry?: (attempt: number, outputText: string) => void;
		},
	): Promise<{
		result: {
			status?: number | null;
			stdout?: string;
			stderr?: string;
		} | null;
		attempts: number;
		outputText: string;
		retried: boolean;
	}>;
}
