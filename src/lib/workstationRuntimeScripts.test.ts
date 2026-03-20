import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "..", "..");

function runPowerShellJson(scriptRelativePath: string, args: string[] = []) {
	const scriptPath = resolve(repoRoot, scriptRelativePath);
	const stdout = execFileSync(
		"PowerShell.exe",
		["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args],
		{
			cwd: repoRoot,
			encoding: "utf8",
			timeout: 30_000,
		},
	);

	return JSON.parse(stdout);
}

describe("workstation runtime PowerShell contracts", () => {
	test.runIf(process.platform === "win32")(
		"get-suite-runtime-status returns the six primary service ids",
		() => {
			const payload = runPowerShellJson("scripts/get-suite-runtime-status.ps1", [
				"-Json",
			]);
			expect(Array.isArray(payload.services)).toBe(true);
			expect(payload.services).toHaveLength(6);
			expect(payload.services.map((service: { id: string }) => service.id)).toEqual([
				"supabase",
				"backend",
				"gateway",
				"frontend",
				"watchdog-filesystem",
				"watchdog-autocad",
			]);
		},
		20_000,
	);

	test.runIf(process.platform === "win32")(
		"control-suite-runtime-service status returns structured service data",
		() => {
			const payload = runPowerShellJson(
				"scripts/control-suite-runtime-service.ps1",
				["-Service", "gateway", "-Action", "status", "-Json"],
			);
			expect(payload.service).toBe("gateway");
			expect(payload.action).toBe("status");
			expect(payload.status?.id).toBe("gateway");
			expect(typeof payload.summary).toBe("string");
			expect(payload.logTarget?.kind).toBe("path");
		},
		20_000,
	);

	test.runIf(process.platform === "win32")(
		"frontend status exposes a concrete log target",
		() => {
			const payload = runPowerShellJson(
				"scripts/control-suite-runtime-service.ps1",
				["-Service", "frontend", "-Action", "status", "-Json"],
			);
			expect(payload.service).toBe("frontend");
			expect(payload.action).toBe("status");
			expect(payload.status?.id).toBe("frontend");
			expect(payload.logTarget?.kind).toBe("path");
			expect(typeof payload.logTarget?.target).toBe("string");
		},
		20_000,
	);
});
