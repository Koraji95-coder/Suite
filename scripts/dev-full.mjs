import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { createInterface } from "node:readline";

function parseBoolEnv(rawValue, fallback = false) {
	if (rawValue === undefined || rawValue === null) return fallback;
	const normalized = String(rawValue).trim().toLowerCase();
	if (!normalized) return fallback;
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return fallback;
}

const children = [];
let shuttingDown = false;
const autocadPipeName =
	(process.env.AUTOCAD_DOTNET_PIPE_NAME || "").trim() || "SUITE_AUTOCAD_PIPE";
const namedPipeServerProject =
	"dotnet/named-pipe-bridge/NamedPipeServer.csproj";
const autodraftApiProject =
	"dotnet/autodraft-api-contract/AutoDraft.ApiContract.csproj";
const namedPipeBridgeAutostartEnabled = parseBoolEnv(
	process.env.SUITE_DEV_AUTOSTART_NAMED_PIPE_BRIDGE,
	false,
);
const autodraftApiAutostartDisabled = !parseBoolEnv(
	process.env.SUITE_DEV_AUTOSTART_AUTODRAFT_DOTNET,
	true,
);
const redisAutostartDisabled = !parseBoolEnv(
	process.env.SUITE_DEV_AUTOSTART_REDIS,
	true,
);
const limiterRequireSharedStorage = parseBoolEnv(
	process.env.API_REQUIRE_SHARED_LIMITER_STORAGE,
	false,
);
const limiterDevDegradeOnRedisFailure = parseBoolEnv(
	process.env.API_LIMITER_DEV_DEGRADE_ON_REDIS_FAILURE,
	true,
);
const limiterMode = (
	String(process.env.API_ENV || "").trim() ||
	String(process.env.FLASK_ENV || "").trim() ||
	""
)
	.toLowerCase()
	.trim();
const limiterStrictMode =
	limiterRequireSharedStorage ||
	limiterMode === "production" ||
	limiterMode === "prod";
const runtimeCoreComposePath = "docker/runtime-core/runtime-core.compose.yml";
const runtimeCoreComposeProjectName = "suite-runtime-core";
const backendPort = Number.parseInt(
	(process.env.API_PORT || "").trim() || "5000",
	10,
);
const limiterStorageUri =
	(process.env.API_LIMITER_STORAGE_URI || "").trim() ||
	(process.env.REDIS_URL || "").trim() ||
	"redis://127.0.0.1:6379/0";

function parseRedisEndpoint(uri) {
	try {
		const parsed = new URL(uri);
		if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:")
			return null;
		const host = parsed.hostname || "127.0.0.1";
		const port = Number.parseInt(parsed.port || "6379", 10);
		if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
		return { host, port };
	} catch {
		return null;
	}
}

function commandExists(command) {
	const probe =
		process.platform === "win32"
			? spawnSync("where", [command], { stdio: "ignore" })
			: spawnSync("which", [command], { stdio: "ignore" });
	return probe.status === 0;
}

function killStaleNamedPipeBridgeHosts() {
	if (process.platform !== "win32" || !commandExists("powershell")) return;
	const script = [
		"$targets = Get-CimInstance Win32_Process | Where-Object {",
		"  ($_.Name -eq 'NamedPipeServer.exe') -or",
		"  (($_.Name -eq 'dotnet.exe' -or $_.Name -eq '.NET Host') -and $_.CommandLine -like '*NamedPipeServer*')",
		"} | Select-Object -ExpandProperty ProcessId -Unique",
		"foreach ($id in $targets) {",
		"  try { Stop-Process -Id $id -Force -ErrorAction Stop } catch {}",
		"}",
	].join(" ");
	spawnSync("powershell", ["-NoProfile", "-Command", script], {
		stdio: "ignore",
	});
}

function parseHttpEndpoint(urlValue, fallbackPort) {
	const raw = String(urlValue || "").trim();
	if (!raw) {
		return { host: "127.0.0.1", port: fallbackPort };
	}
	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return { host: "127.0.0.1", port: fallbackPort };
		}
		const host = parsed.hostname || "127.0.0.1";
		const defaultPort = parsed.protocol === "https:" ? 443 : 80;
		const parsedPort = Number.parseInt(parsed.port || `${defaultPort}`, 10);
		if (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
			return { host, port: fallbackPort };
		}
		return { host, port: parsedPort };
	} catch {
		return { host: "127.0.0.1", port: fallbackPort };
	}
}

function npmInvocation(args = []) {
	if (process.platform === "win32") {
		return {
			command: "cmd.exe",
			args: ["/d", "/c", "npm", ...args],
		};
	}
	return {
		command: "npm",
		args,
	};
}

function parseWindowsNetstatPortOwners(port) {
	const probe = spawnSync("netstat", ["-ano", "-p", "tcp"], {
		encoding: "utf8",
	});
	if (probe.status !== 0) return [];

	const pids = new Set();
	const portSuffix = `:${port}`;
	for (const rawLine of String(probe.stdout || "").split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || !line.includes("LISTENING")) continue;
		const cols = line.split(/\s+/);
		if (cols.length < 5) continue;
		const localAddress = cols[1] || "";
		const state = cols[3] || "";
		const pid = cols[4] || "";
		if (state !== "LISTENING") continue;
		if (!localAddress.endsWith(portSuffix)) continue;
		if (/^\d+$/.test(pid)) pids.add(Number.parseInt(pid, 10));
	}

	return [...pids].map((pid) => ({
		pid,
		processName: resolveProcessName(pid),
	}));
}

function parseUnixLsofPortOwners(port) {
	if (!commandExists("lsof")) return [];
	const probe = spawnSync("lsof", [`-nP`, `-iTCP:${port}`, "-sTCP:LISTEN"], {
		encoding: "utf8",
	});
	if (probe.status !== 0 && !String(probe.stdout || "").trim()) return [];

	const owners = [];
	for (const [index, rawLine] of String(probe.stdout || "")
		.split(/\r?\n/)
		.entries()) {
		if (!rawLine.trim() || index === 0) continue;
		const cols = rawLine.trim().split(/\s+/);
		const processName = cols[0] || "unknown";
		const pid = Number.parseInt(cols[1] || "", 10);
		if (Number.isFinite(pid)) {
			owners.push({ pid, processName });
		}
	}
	return owners;
}

function resolveProcessName(pid) {
	if (!Number.isFinite(pid) || pid < 1) return "unknown";
	if (process.platform === "win32") {
		const probe = spawnSync(
			"tasklist",
			["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
			{ encoding: "utf8" },
		);
		if (probe.status !== 0) return "unknown";
		const line = String(probe.stdout || "").trim();
		if (!line || line.startsWith("INFO:")) return "unknown";
		const match = line.match(/^"([^"]+)"/);
		return match?.[1] || "unknown";
	}
	if (commandExists("ps")) {
		const probe = spawnSync("ps", ["-p", String(pid), "-o", "comm="], {
			encoding: "utf8",
		});
		if (probe.status === 0) {
			const name = String(probe.stdout || "").trim();
			return name || "unknown";
		}
	}
	return "unknown";
}

function getPortOwners(port) {
	if (!Number.isFinite(port) || port < 1 || port > 65535) return [];
	if (process.platform === "win32") return parseWindowsNetstatPortOwners(port);
	return parseUnixLsofPortOwners(port);
}

function ensureRequiredPortsAvailable() {
	const required = [{ name: "backend", port: backendPort }];
	const conflicts = [];
	for (const target of required) {
		const owners = getPortOwners(target.port);
		if (owners.length === 0) continue;
		conflicts.push({ ...target, owners });
	}

	if (!conflicts.length) return;

	console.error("[dev-full] Startup blocked: required ports already in use.");
	for (const conflict of conflicts) {
		const ownerText = conflict.owners
			.map((owner) => `${owner.processName} (pid=${owner.pid})`)
			.join(", ");
		console.error(
			`[dev-full] ${conflict.name} port ${conflict.port} is occupied by ${ownerText}.`,
		);
	}
	console.error(
		"[dev-full] Stop the conflicting process(es) or change API_PORT before retrying.",
	);
	process.exit(1);
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortOpen(host, port, timeoutMs = 800) {
	return new Promise((resolve) => {
		let done = false;
		const finish = (value) => {
			if (done) return;
			done = true;
			socket.destroy();
			resolve(value);
		};

		const socket = net.createConnection({ host, port });
		socket.setTimeout(timeoutMs);
		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
	});
}

function isLoopbackHost(host) {
	const normalized = String(host || "")
		.trim()
		.toLowerCase();
	return (
		normalized === "127.0.0.1" ||
		normalized === "localhost" ||
		normalized === "::1"
	);
}

async function waitForPortReady(
	host,
	port,
	attempts = 20,
	timeoutMs = 500,
	delayMs = 250,
) {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		if (await isPortOpen(host, port, timeoutMs)) {
			return true;
		}
		if (shuttingDown) return false;
		if (attempt < attempts - 1) {
			await wait(delayMs);
		}
	}
	return false;
}

function limiterModeSummary() {
	return `strict_mode=${limiterStrictMode}, dev_degrade=${limiterDevDegradeOnRedisFailure}`;
}

function resolveRedisUnavailableStatus(detail) {
	const message = `${detail} (${limiterModeSummary()})`;
	if (!limiterStrictMode && limiterDevDegradeOnRedisFailure) {
		console.warn(`[dev-full] RATE LIMITER DEGRADED: ${message}`);
		return {
			mode: "degraded",
			available: false,
			storageUri: "memory://",
			reason: message,
		};
	}
	console.error(`[dev-full] Redis is required: ${message}`);
	process.exit(1);
}

function normalizeDockerPublishHost(host) {
	return isLoopbackHost(host) ? "127.0.0.1" : String(host || "").trim();
}

function ensureRuntimeCoreRedisService(endpoint) {
	if (!commandExists("docker")) {
		return {
			ok: false,
			reason: "docker_not_available",
			detail: "docker is not available on PATH",
		};
	}

	if (!isLoopbackHost(endpoint.host)) {
		return {
			ok: false,
			reason: "unsupported_non_local_host",
			detail: `Runtime-core Redis reuse only supports loopback hosts; got ${endpoint.host}`,
		};
	}

	const publishHost = normalizeDockerPublishHost(endpoint.host);
	if (publishHost !== "127.0.0.1" || endpoint.port !== 6379) {
		return {
			ok: false,
			reason: "unsupported_runtime_core_endpoint",
			detail: `Runtime-core Redis is published on 127.0.0.1:6379; requested ${publishHost}:${endpoint.port}`,
		};
	}

	const composeResult = spawnSync(
		"docker",
		[
			"compose",
			"-f",
			runtimeCoreComposePath,
			"-p",
			runtimeCoreComposeProjectName,
			"up",
			"-d",
			"redis",
		],
		{ encoding: "utf8" },
	);
	const composeText =
		`${String(composeResult.stdout || "")}\n${String(composeResult.stderr || "")}`.trim();
	if (composeResult.status === 0) {
		return {
			ok: true,
			reason: `runtime_core_compose:${runtimeCoreComposeProjectName}/redis`,
		};
	}
	return {
		ok: false,
		reason: "docker_compose_failed",
		detail: composeText,
	};
}

function forwardOutput(stream, label, write) {
	if (!stream) return;
	const rl = createInterface({ input: stream });
	rl.on("line", (line) => {
		write(`[${label}] ${line}`);
	});
}

function run(name, command, args = [], options = {}) {
	const child = spawn(command, args, {
		stdio: ["inherit", "pipe", "pipe"],
		...options,
	});

	forwardOutput(child.stdout, name, console.log);
	forwardOutput(child.stderr, name, console.error);

	children.push(child);

	child.on("exit", (code, signal) => {
		if (!shuttingDown) {
			shuttingDown = true;
			console.error(
				`${name} exited (${signal ? `signal: ${signal}` : `code: ${code ?? 0}`}). Stopping other processes.`,
			);
			shutdown(code ?? 0);
		}
	});

	child.on("error", (error) => {
		if (!shuttingDown) {
			shuttingDown = true;
			console.error(`${name} failed to start: ${error.message}`);
			shutdown(1);
		}
	});

	return child;
}

async function ensureRedis() {
	const endpoint = parseRedisEndpoint(limiterStorageUri);
	if (!endpoint) {
		console.log(
			`[dev-full] Skipping Redis autostart because limiter URI is not redis:// (${limiterStorageUri}).`,
		);
		return {
			mode: "non_redis_storage",
			available: true,
			storageUri: limiterStorageUri,
			reason: "limiter_storage_uri_not_redis",
		};
	}

	const endpointLabel = `${endpoint.host}:${endpoint.port}`;
	if (await isPortOpen(endpoint.host, endpoint.port)) {
		console.log(`[dev-full] Redis already reachable at ${endpointLabel}.`);
		return {
			mode: "redis",
			available: true,
			storageUri: limiterStorageUri,
			reason: "redis_already_reachable",
		};
	}

	if (redisAutostartDisabled) {
		console.log(
			"[dev-full] Redis autostart disabled via SUITE_DEV_AUTOSTART_REDIS.",
		);
		return resolveRedisUnavailableStatus(
			`Redis endpoint ${endpointLabel} is unreachable and autostart is disabled`,
		);
	}

	console.log(
		`[dev-full] Ensuring runtime-core Redis service is running at ${endpointLabel}...`,
	);
	const redisStart = ensureRuntimeCoreRedisService(endpoint);
	if (!redisStart.ok) {
		return resolveRedisUnavailableStatus(
			`Unable to autostart runtime-core Redis (${redisStart.detail || redisStart.reason})`,
		);
	}

	if (await waitForPortReady(endpoint.host, endpoint.port, 20, 500, 250)) {
		console.log(`[dev-full] Redis is ready at ${endpointLabel}.`);
		return {
			mode: "redis",
			available: true,
			storageUri: limiterStorageUri,
			reason: redisStart.reason,
		};
	}

	return resolveRedisUnavailableStatus(
		`Runtime-core Redis did not become reachable at ${endpointLabel}`,
	);
}

async function ensureAutoDraftApi(env, label = "autodraft-dotnet") {
	if (autodraftApiAutostartDisabled) {
		console.log(
			"[dev-full] AutoDraft .NET API autostart disabled via SUITE_DEV_AUTOSTART_AUTODRAFT_DOTNET.",
		);
		return;
	}

	const targetUrl =
		String(env.AUTODRAFT_DOTNET_API_URL || "").trim() ||
		"http://127.0.0.1:5275";
	const endpoint = parseHttpEndpoint(targetUrl, 5275);

	if (await isPortOpen(endpoint.host, endpoint.port)) {
		console.log(
			`[dev-full] AutoDraft .NET API already reachable at ${endpoint.host}:${endpoint.port}.`,
		);
		return;
	}

	console.log(
		`[dev-full] Starting AutoDraft .NET API (${autodraftApiProject}) at ${endpoint.host}:${endpoint.port}...`,
	);
	run(label, "dotnet", ["run", "--project", autodraftApiProject], { env });

	for (let attempt = 0; attempt < 120; attempt += 1) {
		if (await isPortOpen(endpoint.host, endpoint.port, 1000)) {
			console.log(
				`[dev-full] AutoDraft .NET API is ready at ${endpoint.host}:${endpoint.port}.`,
			);
			return;
		}
		if (shuttingDown) return;
		await wait(500);
	}

	console.error(
		`[dev-full] AutoDraft .NET API did not become reachable at ${endpoint.host}:${endpoint.port}.`,
	);
	process.exit(1);
}

function shutdown(exitCode = 0) {
	for (const child of children) {
		if (!child.killed) {
			child.kill("SIGTERM");
		}
	}

	setTimeout(() => process.exit(exitCode), 300);
}

process.on("SIGINT", () => {
	if (!shuttingDown) {
		shuttingDown = true;
		shutdown(0);
	}
});

process.on("SIGTERM", () => {
	if (!shuttingDown) {
		shuttingDown = true;
		shutdown(0);
	}
});

async function main() {
	const sharedEnv = { ...process.env };
	if (!sharedEnv.API_DEV_SERVER_THREADED) {
		sharedEnv.API_DEV_SERVER_THREADED = "true";
	}
	if (!sharedEnv.API_LIMITER_STORAGE_URI && !sharedEnv.REDIS_URL) {
		sharedEnv.API_LIMITER_STORAGE_URI = limiterStorageUri;
	}

	console.log(`[dev-full] Limiter mode: ${limiterModeSummary()}.`);
	ensureRequiredPortsAvailable();
	const redisStatus = await ensureRedis();
	console.log(
		`[dev-full] Redis mode: ${redisStatus.mode} (storage=${redisStatus.storageUri}, reason=${redisStatus.reason}).`,
	);
	await ensureAutoDraftApi(sharedEnv);
	if (namedPipeBridgeAutostartEnabled) {
		killStaleNamedPipeBridgeHosts();
		console.log(
			`[dev-full] Starting named-pipe bridge on '${autocadPipeName}' because SUITE_DEV_AUTOSTART_NAMED_PIPE_BRIDGE=true. This is for explicit diagnostics or manual legacy bridge fallback only.`,
		);
		run(
			"pipe-bridge",
			"dotnet",
			["run", "--project", namedPipeServerProject, "--", autocadPipeName],
			{ env: sharedEnv },
		);
	} else {
		console.log(
			"[dev-full] Named-pipe bridge autostart disabled. Default CAD traffic stays on suite-cad-authoring and the AutoDraft .NET API; start dotnet/named-pipe-bridge manually only for explicit diagnostics.",
		);
	}
	const frontendNpm = npmInvocation(["run", "dev"]);
	const backendNpm = npmInvocation(["run", "backend:coords:dev"]);
	run("frontend", frontendNpm.command, frontendNpm.args, { env: sharedEnv });
	run("backend", backendNpm.command, backendNpm.args, { env: sharedEnv });
}

main().catch((error) => {
	console.error(
		`[dev-full] Startup failed: ${error?.message || String(error)}`,
	);
	process.exit(1);
});
