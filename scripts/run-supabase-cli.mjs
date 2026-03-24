#!/usr/bin/env node
import {
	createSupabaseRuntimeEnv,
	runSupabaseStartWithRetry,
	runSupabaseSync,
	spawnSupabase,
	normalizeSupabaseDotEnv,
} from "./lib/supabase-cli.mjs";

const repoRoot = process.cwd();
const args = process.argv.slice(2);

if (args.length === 0) {
	console.error("run-supabase-cli: missing Supabase CLI arguments.");
	process.exit(1);
}

const normalized = normalizeSupabaseDotEnv(repoRoot);
if (normalized) {
	console.log("run-supabase-cli: normalized UTF-8 BOM from .env for Supabase CLI compatibility.");
}

const runtimeEnv = createSupabaseRuntimeEnv(repoRoot, process.env);

function writeSupabaseResultOutput(result) {
	const stdout = typeof result?.stdout === "string" ? result.stdout : "";
	const stderr = typeof result?.stderr === "string" ? result.stderr : "";
	if (stdout) {
		process.stdout.write(stdout);
	}
	if (stderr) {
		process.stderr.write(stderr);
	}
}

async function main() {
	if (args[0] === "start") {
		const executeStart = () => {
			const result = runSupabaseSync(args, {
				cwd: repoRoot,
				env: runtimeEnv,
				encoding: "utf8",
				stdio: "pipe",
				maxBuffer: 10 * 1024 * 1024,
			});
			writeSupabaseResultOutput(result);
			return result;
		};

		const { result } = await runSupabaseStartWithRetry(executeStart, {
			delayMs: 4000,
			onRetry: ({ nextAttempt, maxAttempts, outputText }) => {
				const retryReason = /Conflict\./i.test(outputText)
					? "Docker container name conflict"
					: "transient Supabase startup failure";
				console.warn(
					`run-supabase-cli: ${retryReason} detected. Retrying local Supabase start (${nextAttempt}/${maxAttempts}) in 4s.`,
				);
			},
		});

		if (result?.error) {
			console.error(`run-supabase-cli: failed to launch Supabase CLI: ${result.error.message}`);
			process.exit(1);
			return;
		}

		process.exit(Number(result?.status ?? 0));
		return;
	}

	const child = spawnSupabase(args, {
		cwd: repoRoot,
		env: runtimeEnv,
		stdio: "inherit",
	});

	child.on("exit", (code, signal) => {
		if (signal) {
			process.kill(process.pid, signal);
			return;
		}
		process.exit(code ?? 0);
	});

	child.on("error", (error) => {
		console.error(`run-supabase-cli: failed to launch Supabase CLI: ${error.message}`);
		process.exit(1);
	});
}

main().catch((error) => {
	console.error(`run-supabase-cli: unexpected failure: ${error.message}`);
	process.exit(1);
});

