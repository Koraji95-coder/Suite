import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

const children = [];
let shuttingDown = false;
const autocadPipeName =
	(process.env.AUTOCAD_DOTNET_PIPE_NAME || "").trim() || "SUITE_AUTOCAD_PIPE";
const namedPipeServerProject = "dotnet/named-pipe-bridge/NamedPipeServer.csproj";
const redisAutostartDisabled = /^(0|false|no)$/i.test(
	String(process.env.SUITE_DEV_AUTOSTART_REDIS || "").trim(),
);
const gatewayPort = Number.parseInt(
	(process.env.AGENT_GATEWAY_PORT || "").trim() || "3000",
	10,
);
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
		if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") return null;
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
	for (const [index, rawLine] of String(probe.stdout || "").split(/\r?\n/).entries()) {
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
	const required = [
		{ name: "gateway", port: gatewayPort },
		{ name: "backend", port: backendPort },
	];
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
		"[dev-full] Stop the conflicting process(es) or change AGENT_GATEWAY_PORT/API_PORT before retrying.",
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

async function ensureRedis(label = "redis") {
	if (redisAutostartDisabled) {
		console.log("[dev-full] Redis autostart disabled via SUITE_DEV_AUTOSTART_REDIS.");
		return;
	}

	const endpoint = parseRedisEndpoint(limiterStorageUri);
	if (!endpoint) {
		console.log(
			`[dev-full] Skipping Redis autostart because limiter URI is not redis:// (${limiterStorageUri}).`,
		);
		return;
	}

	if (await isPortOpen(endpoint.host, endpoint.port)) {
		console.log(
			`[dev-full] Redis already reachable at ${endpoint.host}:${endpoint.port}.`,
		);
		return;
	}

	const redisBin =
		(process.env.SUITE_REDIS_BIN || "").trim() ||
		(process.platform === "win32" ? "redis-server.exe" : "redis-server");

	let command = "";
	let args = [];
	let reason = "";

	if (commandExists(redisBin)) {
		command = redisBin;
		args = [
			"--bind",
			endpoint.host,
			"--port",
			String(endpoint.port),
			"--save",
			"",
			"--appendonly",
			"no",
		];
		reason = redisBin;
	} else if (commandExists("docker")) {
		command = "docker";
		args = [
			"run",
			"--rm",
			"--name",
			`suite-dev-redis-${endpoint.port}-${process.pid}`,
			"-p",
			`${endpoint.host}:${endpoint.port}:6379`,
			"redis:7-alpine",
			"--save",
			"",
			"--appendonly",
			"no",
		];
		reason = "docker redis:7-alpine";
	}

	if (!command) {
		console.error(
			"[dev-full] Unable to autostart Redis. Install redis-server or Docker, or set SUITE_DEV_AUTOSTART_REDIS=false.",
		);
		process.exit(1);
	}

	console.log(
		`[dev-full] Starting Redis via ${reason} at ${endpoint.host}:${endpoint.port}...`,
	);
	run(label, command, args);

	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (await isPortOpen(endpoint.host, endpoint.port, 500)) {
			console.log(`[dev-full] Redis is ready at ${endpoint.host}:${endpoint.port}.`);
			return;
		}
		if (shuttingDown) return;
		await wait(250);
	}

	console.error(
		`[dev-full] Redis did not become reachable at ${endpoint.host}:${endpoint.port}.`,
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
	if (
		!redisAutostartDisabled &&
		!sharedEnv.API_LIMITER_STORAGE_URI &&
		!sharedEnv.REDIS_URL
	) {
		sharedEnv.API_LIMITER_STORAGE_URI = limiterStorageUri;
	}

	ensureRequiredPortsAvailable();
	await ensureRedis("redis");

	run(
		"pipe-bridge",
		"dotnet",
		["run", "--project", namedPipeServerProject, "--", autocadPipeName],
		{ env: sharedEnv },
	);
	const frontendNpm = npmInvocation(["run", "dev"]);
	const backendNpm = npmInvocation(["run", "backend:coords:dev"]);
	const gatewayNpm = npmInvocation(["run", "gateway:dev"]);
	run("frontend", frontendNpm.command, frontendNpm.args, { env: sharedEnv });
	run("backend", backendNpm.command, backendNpm.args, { env: sharedEnv });
	run("gateway", gatewayNpm.command, gatewayNpm.args, { env: sharedEnv });
}

main().catch((error) => {
	console.error(`[dev-full] Startup failed: ${error?.message || String(error)}`);
	process.exit(1);
});
