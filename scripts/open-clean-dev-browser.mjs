import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const targetUrl = String(process.argv[2] || "http://localhost:5173").trim();
const profileDir = path.join(os.tmpdir(), "suite-dev-browser");

function commandExists(command) {
	const probe =
		process.platform === "win32"
			? spawnSync("where", [command], { stdio: "pipe", encoding: "utf8" })
			: spawnSync("which", [command], { stdio: "pipe", encoding: "utf8" });
	if (probe.status !== 0) {
		return null;
	}
	const firstMatch = String(probe.stdout || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean);
	return firstMatch || command;
}

function resolveBrowserCommand() {
	const explicitBrowser = String(process.env.SUITE_DEV_BROWSER || "").trim();
	if (explicitBrowser) {
		return {
			command: explicitBrowser,
			label: path.basename(explicitBrowser),
		};
	}

	const localAppData = process.env.LOCALAPPDATA || "";
	const programFiles = process.env.ProgramFiles || "";
	const programFilesX86 = process.env["ProgramFiles(x86)"] || "";
	const candidates =
		process.platform === "win32"
			? [
					{
						command: path.join(
							programFilesX86,
							"Microsoft",
							"Edge",
							"Application",
							"msedge.exe",
						),
						label: "Microsoft Edge",
					},
					{
						command: path.join(
							programFiles,
							"Microsoft",
							"Edge",
							"Application",
							"msedge.exe",
						),
						label: "Microsoft Edge",
					},
					{
						command: path.join(
							programFilesX86,
							"Google",
							"Chrome",
							"Application",
							"chrome.exe",
						),
						label: "Google Chrome",
					},
					{
						command: path.join(
							programFiles,
							"Google",
							"Chrome",
							"Application",
							"chrome.exe",
						),
						label: "Google Chrome",
					},
					{
						command: path.join(
							localAppData,
							"Google",
							"Chrome",
							"Application",
							"chrome.exe",
						),
						label: "Google Chrome",
					},
				]
			: [
					{ command: "microsoft-edge", label: "Microsoft Edge" },
					{ command: "google-chrome", label: "Google Chrome" },
					{ command: "chromium", label: "Chromium" },
				];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate.command)) {
			return candidate;
		}
		const resolvedFromPath = commandExists(candidate.command);
		if (resolvedFromPath) {
			return {
				command: resolvedFromPath,
				label: candidate.label,
			};
		}
	}

	return null;
}

const browser = resolveBrowserCommand();
if (!browser) {
	console.error(
		"[browser:dev:clean] Could not find Edge or Chrome. Set SUITE_DEV_BROWSER to an explicit browser executable path.",
	);
	process.exit(1);
}

fs.mkdirSync(profileDir, { recursive: true });

const child = spawn(
	browser.command,
	[
		`--user-data-dir=${profileDir}`,
		"--disable-extensions",
		"--disable-sync",
		"--no-default-browser-check",
		"--new-window",
		targetUrl,
	],
	{
		detached: true,
		stdio: "ignore",
	},
);

child.unref();

console.log(
	`[browser:dev:clean] Launched ${browser.label} with a clean profile at ${profileDir}`,
);
