import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const children = [];
let shuttingDown = false;

function forwardOutput(stream, label, write) {
	if (!stream) return;
	const rl = createInterface({ input: stream });
	rl.on("line", (line) => {
		write(`[${label}] ${line}`);
	});
}

function run(name, command) {
	const child = spawn(command, {
		stdio: ["inherit", "pipe", "pipe"],
		shell: true,
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

run("frontend", "npm run dev");
run("backend", "npm run backend:coords:dev");
