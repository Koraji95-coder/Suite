import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadRepoEnv } from "./env-files.mjs";

export function normalizeSupabaseDotEnv(repoRoot = process.cwd()) {
	const envPath = path.join(repoRoot, ".env");
	if (!fs.existsSync(envPath)) {
		return false;
	}

	const current = fs.readFileSync(envPath);
	const hasUtf8Bom =
		current.length >= 3 &&
		current[0] === 0xef &&
		current[1] === 0xbb &&
		current[2] === 0xbf;

	if (!hasUtf8Bom) {
		return false;
	}

	fs.writeFileSync(envPath, current.subarray(3));
	return true;
}

function resolveSupabaseSmtpPort(envMap = process.env) {
	const raw = String(envMap.SUPABASE_LOCAL_SMTP_PORT || "").trim();
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 2500;
}

function resolveSupabasePortOverride(envMap = process.env, key, fallback = null) {
	const raw = String(envMap[key] || "").trim();
	const parsed = Number.parseInt(raw, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}

function parseBooleanEnvValue(value) {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (!normalized) {
		return null;
	}
	if (["1", "true", "yes", "y", "on"].includes(normalized)) {
		return true;
	}
	if (["0", "false", "no", "n", "off"].includes(normalized)) {
		return false;
	}
	return null;
}

export function resolveSupabaseAnalyticsEnabled(
	envMap = process.env,
	platform = process.platform,
) {
	const explicitValue = parseBooleanEnvValue(
		envMap.SUITE_SUPABASE_LOCAL_ANALYTICS_ENABLED,
	);
	if (explicitValue !== null) {
		return explicitValue;
	}

	// Supabase's local analytics sidecar uses DOCKER_HOST=http://host.docker.internal:2375
	// on Windows. Docker Desktop does not expose that insecure endpoint by default, so
	// the Vector container exits immediately unless the user opts in explicitly.
	if (platform === "win32") {
		return false;
	}

	return null;
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceTomlSectionIntegerValue(configText, sectionName, key, value) {
	const sectionPattern = new RegExp(
		`(\\[${escapeRegExp(sectionName)}\\][\\s\\S]*?\\n${escapeRegExp(key)}\\s*=\\s*)\\d+`,
		"m",
	);
	return configText.replace(sectionPattern, `$1${value}`);
}

function replaceTomlSectionBooleanValue(configText, sectionName, key, value) {
	const sectionPattern = new RegExp(
		`(\\[${escapeRegExp(sectionName)}\\][\\s\\S]*?\\n${escapeRegExp(key)}\\s*=\\s*)(true|false)`,
		"m",
	);
	return configText.replace(sectionPattern, `$1${value ? "true" : "false"}`);
}

function applySupabaseConfigOverrides(configText, envMap = process.env) {
	const overrides = [
		["api", "port", resolveSupabasePortOverride(envMap, "SUITE_SUPABASE_LOCAL_API_PORT")],
		["db", "port", resolveSupabasePortOverride(envMap, "SUITE_SUPABASE_LOCAL_DB_PORT")],
		["db", "shadow_port", resolveSupabasePortOverride(envMap, "SUITE_SUPABASE_LOCAL_SHADOW_PORT")],
		["db.pooler", "port", resolveSupabasePortOverride(envMap, "SUITE_SUPABASE_LOCAL_POOLER_PORT")],
		["studio", "port", resolveSupabasePortOverride(envMap, "SUITE_SUPABASE_LOCAL_STUDIO_PORT")],
		["inbucket", "port", resolveSupabasePortOverride(envMap, "SUITE_SUPABASE_LOCAL_INBUCKET_PORT")],
		["auth.email.smtp", "port", resolveSupabaseSmtpPort(envMap)],
		["analytics", "port", resolveSupabasePortOverride(envMap, "SUITE_SUPABASE_LOCAL_ANALYTICS_PORT")],
	];

	let nextConfigText = configText;
	for (const [sectionName, key, value] of overrides) {
		if (!Number.isFinite(value) || value <= 0) {
			continue;
		}
		nextConfigText = replaceTomlSectionIntegerValue(
			nextConfigText,
			sectionName,
			key,
			value,
		);
	}

	const analyticsEnabled = resolveSupabaseAnalyticsEnabled(envMap);
	if (analyticsEnabled !== null) {
		nextConfigText = replaceTomlSectionBooleanValue(
			nextConfigText,
			"analytics",
			"enabled",
			analyticsEnabled,
		);
	}

	return nextConfigText;
}

function ensureGeneratedSupabaseWorkdir(
	repoRoot = process.cwd(),
	envMap = process.env,
) {
	const sourceDir = path.join(repoRoot, "supabase");
	const generatedRoot = path.join(sourceDir, ".temp", "cli-workdir");
	const generatedSupabaseDir = path.join(generatedRoot, "supabase");
	const sourceConfigPath = path.join(sourceDir, "config.toml");
	const generatedConfigPath = path.join(generatedSupabaseDir, "config.toml");

	fs.mkdirSync(generatedSupabaseDir, { recursive: true });

	for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
		if (entry.name === ".temp" || entry.name === "config.toml") {
			continue;
		}
		fs.cpSync(
			path.join(sourceDir, entry.name),
			path.join(generatedSupabaseDir, entry.name),
			{ recursive: true, force: true },
		);
	}

	const smtpPort = resolveSupabaseSmtpPort(envMap);
	const configText = fs.readFileSync(sourceConfigPath, "utf8");
	const generatedConfigText = applySupabaseConfigOverrides(configText, {
		...envMap,
		SUPABASE_LOCAL_SMTP_PORT: smtpPort,
	});
	fs.writeFileSync(generatedConfigPath, generatedConfigText, "utf8");

	return generatedRoot;
}

export function createSupabaseInvocation(args = [], workdir = process.cwd(), options = {}) {
	const platform = options.platform || process.platform;
	const nodeExecPath = options.nodeExecPath || process.execPath;
	const npmCliPath =
		options.npmCliPath ||
		path.join(path.dirname(nodeExecPath), "node_modules", "npm", "bin", "npm-cli.js");
	const cliArgs = ["supabase", "--workdir", workdir, ...args];
	if (platform === "win32") {
		return {
			command: nodeExecPath,
			args: [npmCliPath, "exec", "--yes", "--package", "supabase", "--", ...cliArgs],
		};
	}

	return {
		command: "npx",
		args: cliArgs,
	};
}

export function createSupabaseRuntimeEnv(
	repoRoot = process.cwd(),
	baseEnv = process.env,
) {
	return {
		...loadRepoEnv(repoRoot),
		...baseEnv,
	};
}

export function spawnSupabase(args = [], options = {}) {
	const cwd = options.cwd || process.cwd();
	normalizeSupabaseDotEnv(cwd);
	const env = options.env || createSupabaseRuntimeEnv(cwd, process.env);
	const workdir = ensureGeneratedSupabaseWorkdir(cwd, env);
	const invocation = createSupabaseInvocation(args, workdir);
	return spawn(invocation.command, invocation.args, {
		cwd,
		env,
		stdio: options.stdio || "inherit",
	});
}

export function runSupabaseSync(args = [], options = {}) {
	const cwd = options.cwd || process.cwd();
	normalizeSupabaseDotEnv(cwd);
	const env = options.env || createSupabaseRuntimeEnv(cwd, process.env);
	const workdir = ensureGeneratedSupabaseWorkdir(cwd, env);
	const invocation = createSupabaseInvocation(args, workdir);
	return spawnSync(invocation.command, invocation.args, {
		cwd,
		env,
		encoding: options.encoding || "utf8",
		maxBuffer: options.maxBuffer,
		stdio: options.stdio,
	});
}

function normalizeProcessOutputText(value) {
	if (typeof value === "string") {
		return value;
	}
	if (Buffer.isBuffer(value)) {
		return value.toString("utf8");
	}
	if (value === null || value === undefined) {
		return "";
	}
	return String(value);
}

export function collectSupabaseResultOutput(result = {}) {
	const stdout = normalizeProcessOutputText(result.stdout);
	const stderr = normalizeProcessOutputText(result.stderr);
	return [stdout, stderr].filter(Boolean).join("\n").trim();
}

export function isRetriableSupabaseStartFailure(outputText = "") {
	const normalized = String(outputText || "");
	return (
		/failed to create docker container:\s*Error response from daemon:\s*Conflict\./i.test(
			normalized,
		) || /Error status 502:/i.test(normalized)
	);
}

export async function runSupabaseStartWithRetry(runOnce, options = {}) {
	const maxAttempts = Math.max(1, Number.parseInt(String(options.maxAttempts ?? 3), 10) || 3);
	const delayMs = Math.max(0, Number.parseInt(String(options.delayMs ?? 4000), 10) || 0);
	const shouldRetry =
		typeof options.shouldRetry === "function"
			? options.shouldRetry
			: isRetriableSupabaseStartFailure;
	const onRetry = typeof options.onRetry === "function" ? options.onRetry : null;

	let attempts = 0;
	let result = null;
	while (attempts < maxAttempts) {
		attempts += 1;
		result = await runOnce(attempts);
		const failed = Boolean(result?.error) || Number(result?.status ?? 0) !== 0;
		if (!failed) {
			return { attempts, result };
		}

		const outputText = collectSupabaseResultOutput(result);
		const retryable = attempts < maxAttempts && shouldRetry(outputText);
		if (!retryable) {
			return { attempts, result };
		}

		if (onRetry) {
			onRetry({
				attempt: attempts,
				nextAttempt: attempts + 1,
				maxAttempts,
				outputText,
				result,
			});
		}

		if (delayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	return { attempts, result };
}

