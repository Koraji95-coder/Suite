#!/usr/bin/env node
import {
	getRepoEnvPaths,
	loadRepoEnv,
	parseDotEnvText,
	readEnvFile,
	readSetting,
	writeEnvEntries,
} from "./lib/env-files.mjs";
import {
	runSupabaseStartWithRetry,
	runSupabaseSync,
} from "./lib/supabase-cli.mjs";
import {
	ACTIVE_LOCAL_SUPABASE_KEYS,
	LOCAL_SUPABASE_SMTP_KEYS,
	buildLocalSmtpEntries,
	buildLocalSupabaseActiveEntries,
	collectPreservedLocalEntries,
	normalizeLocalEmailMode,
	resolveLocalEmailConfig,
} from "./lib/supabase-local-mode.mjs";

const repoRoot = process.cwd();
const { localEnvPath } = getRepoEnvPaths(repoRoot);
const args = new Set(process.argv.slice(2));
function readArgValue(flag) {
	const index = process.argv.indexOf(flag);
	if (index < 0) return "";
	return String(process.argv[index + 1] || "").trim();
}

const requestedEmailMode =
	normalizeLocalEmailMode(readArgValue("--mail")) ||
	normalizeLocalEmailMode(readArgValue("--email"));
const ensureRunning = args.has("--ensure-running");
const strictMail = args.has("--strict-mail") || requestedEmailMode === "gmail";
const restartIfRunning = args.has("--restart-if-running");
const managedKeys = new Set([
	...ACTIVE_LOCAL_SUPABASE_KEYS,
	...LOCAL_SUPABASE_SMTP_KEYS,
]);

function readRequiredValue(envMap, keys) {
	for (const key of keys) {
		const value = String(envMap[key] || "").trim();
		if (value) {
			return value;
		}
	}
	return "";
}

function writeSupabaseCommandOutput(result) {
	const stdout = String(result?.stdout || "");
	const stderr = String(result?.stderr || "");
	if (stdout) {
		process.stdout.write(stdout);
	}
	if (stderr) {
		process.stderr.write(stderr);
	}
}

async function startLocalSupabase() {
	const { result } = await runSupabaseStartWithRetry(
		() => {
			const startResult = runSupabaseSync(["start"], {
				cwd: repoRoot,
				encoding: "utf8",
				stdio: "pipe",
				maxBuffer: 10 * 1024 * 1024,
			});
			writeSupabaseCommandOutput(startResult);
			return startResult;
		},
		{
			delayMs: 4000,
			onRetry: ({ nextAttempt, maxAttempts, outputText }) => {
				const retryReason = /Conflict\./i.test(outputText)
					? "Docker container name conflict"
					: "transient Supabase startup failure";
				console.warn(
					`supabase:env:local: ${retryReason} detected. Retrying local Supabase start (${nextAttempt}/${maxAttempts}) in 4s.`,
				);
			},
		},
	);
	if (result?.status !== 0) {
		process.exit(result?.status || 1);
	}
}

async function readLocalStatusEnv() {
	let wasRunning = false;
	let startedNow = false;
	let statusResult = runSupabaseSync(["status", "-o", "env"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	if (statusResult.status === 0) {
		wasRunning = true;
	}

	if (statusResult.status !== 0 && ensureRunning) {
		console.log(
			"supabase:env:local: local Supabase is not running; starting it now.",
		);
		await startLocalSupabase();
		startedNow = true;
		statusResult = runSupabaseSync(["status", "-o", "env"], {
			cwd: repoRoot,
			encoding: "utf8",
		});
	}

	if (statusResult.status !== 0) {
		const stderr = String(statusResult.stderr || "").trim();
		const stdout = String(statusResult.stdout || "").trim();
		console.error(
			[
				"supabase:env:local: unable to read local Supabase credentials.",
				"Run `npm run supabase:start` first and make sure Docker Desktop is installed and running.",
				stderr || stdout || "Supabase CLI did not return any output.",
			]
				.filter(Boolean)
				.join("\n"),
		);
		process.exit(statusResult.status || 1);
	}

	return {
		statusEnv: parseDotEnvText(statusResult.stdout || ""),
		wasRunning,
		startedNow,
	};
}

const mergedRepoEnv = loadRepoEnv(repoRoot);
const existingLocalEnv = readEnvFile(localEnvPath);
const statusState = await readLocalStatusEnv();
const statusEnv = statusState.statusEnv;
const apiUrl = readRequiredValue(statusEnv, ["API_URL", "SUPABASE_URL"]);
const anonKey = readRequiredValue(statusEnv, ["ANON_KEY", "SUPABASE_ANON_KEY"]);
const serviceRoleKey = readRequiredValue(statusEnv, [
	"SERVICE_ROLE_KEY",
	"SUPABASE_SERVICE_ROLE_KEY",
]);
const jwtSecret = readRequiredValue(statusEnv, ["JWT_SECRET", "SUPABASE_JWT_SECRET"]);

if (!apiUrl || !anonKey) {
	console.error(
		[
			"supabase:env:local: local Supabase status output did not include the required API URL and anon key.",
			`Available keys: ${Object.keys(statusEnv).sort().join(", ") || "(none)"}`,
		].join("\n"),
	);
	process.exit(1);
}

const currentEmailMode = normalizeLocalEmailMode(
	existingLocalEnv.SUITE_SUPABASE_LOCAL_EMAIL_MODE,
);
const preserveLocalOverrides =
	!requestedEmailMode || requestedEmailMode === currentEmailMode;
const emailConfig = resolveLocalEmailConfig(
	{ ...mergedRepoEnv, ...existingLocalEnv, ...process.env },
	requestedEmailMode,
	{
		strict: strictMail,
		useLocalOverrides: preserveLocalOverrides,
	},
);

const preservedLocalEntries = collectPreservedLocalEntries(
	existingLocalEnv,
	managedKeys,
);

const generatedEntries = [
	...buildLocalSmtpEntries(emailConfig),
	...buildLocalSupabaseActiveEntries({
		apiUrl,
		anonKey,
		serviceRoleKey,
		jwtSecret,
		adminEmail: readSetting(mergedRepoEnv, "VITE_DEV_ADMIN_EMAIL"),
		adminEmails: readSetting(mergedRepoEnv, "VITE_DEV_ADMIN_EMAILS"),
	}),
];

const smtpEntriesChanged = buildLocalSmtpEntries(emailConfig).some(([key, value]) => {
	return String(existingLocalEnv[key] || "") !== String(value || "");
});

writeEnvEntries(
	localEnvPath,
	[...preservedLocalEntries, ...generatedEntries],
	[
		"Machine-local Supabase overrides generated by `npm run supabase:env:local`.",
		"Re-run after `npm run supabase:start` if local credentials change.",
		"Do not commit this file.",
	],
);

for (const warning of emailConfig.warnings) {
	console.warn(`supabase:env:local: ${warning}`);
}

if (
	smtpEntriesChanged &&
	(restartIfRunning || statusState.startedNow) &&
	(statusState.wasRunning || statusState.startedNow)
) {
	console.log(
		"supabase:env:local: restarting local Supabase to apply SMTP/auth configuration changes.",
	);
	const stopResult = runSupabaseSync(["stop"], {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: "inherit",
	});
	if (stopResult.status !== 0) {
		process.exit(stopResult.status || 1);
	}
	await startLocalSupabase();
}

console.log(
	`supabase:env:local: wrote ${localEnvPath} (${emailConfig.mode} local auth email mode)`,
);
