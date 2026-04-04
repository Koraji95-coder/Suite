import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "..", "..");
const runWorkstationIntegration =
	process.platform === "win32" &&
	process.env.SUITE_RUN_WORKSTATION_INTEGRATION === "1";
const workstationIntegrationTest = test.runIf(runWorkstationIntegration);

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
	workstationIntegrationTest(
		"get-suite-runtime-status returns the six primary service ids",
		() => {
			const payload = runPowerShellJson("scripts/get-suite-runtime-status.ps1", [
				"-Json",
			]);
			expect(typeof payload.support?.text).toBe("string");
			expect(typeof payload.support?.workstation?.workstationId).toBe("string");
			expect(typeof payload.support?.config?.codexConfigPresent).toBe("boolean");
			expect(typeof payload.support?.paths?.statusDir).toBe("string");
			expect(typeof payload.support?.config?.stableSuiteRoot).toBe("string");
			expect(typeof payload.support?.config?.dailyRoot).toBe("string");
			expect(typeof payload.support?.config?.officeExecutablePath).toBe("string");
			expect(typeof payload.shell?.status).toBe("string");
			expect(typeof payload.shell?.detail).toBe("string");
			expect(Array.isArray(payload.companionApps)).toBe(true);
			expect(payload.companionApps.some((app: { id: string }) => app.id === "office")).toBe(true);
			const office = payload.companionApps.find(
				(app: { id: string }) => app.id === "office",
			);
			expect(typeof office?.launchMode).toBe("string");
			expect(typeof office?.enabled).toBe("boolean");
			expect(typeof office?.executableFound).toBe("boolean");
			expect(typeof office?.running).toBe("boolean");
			expect(typeof office?.configSource).toBe("string");
			expect(typeof office?.configPath).toBe("string");
			expect(Array.isArray(payload.services)).toBe(true);
			expect(payload.services).toHaveLength(5);
			expect(payload.services.map((service: { id: string }) => service.id)).toEqual([
				"supabase",
				"backend",
				"frontend",
				"watchdog-filesystem",
				"watchdog-autocad",
			]);
		},
		20_000,
	);

	workstationIntegrationTest(
		"workstation-doctor returns shared shell health",
		() => {
			const payload = runPowerShellJson("scripts/workstation-doctor.ps1", [
				"-Json",
			]);
			expect(typeof payload.workstation?.workstationId).toBe("string");
			expect(typeof payload.shell?.status).toBe("string");
			expect(typeof payload.shell?.detail).toBe("string");
			expect(typeof payload.startupOwner?.owner).toBe("string");
		},
		20_000,
	);

	workstationIntegrationTest(
		"bootstrap-suite-workstation validate mode returns structured bring-up data",
		() => {
			const dailyRoot = process.env.USERPROFILE
				? resolve(process.env.USERPROFILE, "OneDrive", "Desktop", "Daily")
				: resolve(repoRoot, "..");
			const payload = runPowerShellJson("scripts/bootstrap-suite-workstation.ps1", [
				"-SuiteRoot",
				repoRoot,
				"-DailyRoot",
				dailyRoot,
				"-ValidateOnly",
				"-Json",
			]);
			expect(typeof payload.ok).toBe("boolean");
			expect(payload.validateOnly).toBe(true);
			expect(payload.suiteRoot).toBe(repoRoot);
			expect(typeof payload.dailyRoot).toBe("string");
			expect(typeof payload.officeExecutablePath).toBe("string");
			expect(Array.isArray(payload.prerequisites)).toBe(true);
			expect(payload.prerequisites.length).toBeGreaterThan(0);
			expect(Array.isArray(payload.steps)).toBe(true);
			expect(payload.steps.some((step: { id: string }) => step.id === "prerequisites")).toBe(true);
			expect(payload.steps.some((step: { id: string }) => step.id === "validation-only")).toBe(true);
		},
		20_000,
	);

	workstationIntegrationTest(
		"control-suite-companion-app status returns structured Office data",
		() => {
			const payload = runPowerShellJson(
				"scripts/control-suite-companion-app.ps1",
				["-CompanionAppId", "office", "-Action", "status", "-Json"],
			);
			expect(payload.companionAppId).toBe("office");
			expect(payload.action).toBe("status");
			expect(payload.snapshot?.id).toBe("office");
			expect(typeof payload.snapshot?.enabled).toBe("boolean");
			expect(typeof payload.snapshot?.launchMode).toBe("string");
			expect(typeof payload.snapshot?.executableFound).toBe("boolean");
		},
		20_000,
	);

	workstationIntegrationTest(
		"legacy runtime control snapshot preserves compatibility component ids",
		() => {
			const payload = runPowerShellJson("scripts/open-suite-runtime-control.ps1", [
				"-SnapshotJson",
			]);
			expect(Array.isArray(payload.components)).toBe(true);
			expect(payload.components.map((component: { key: string }) => component.key)).toEqual([
				"frontend",
				"docker",
				"supabase",
				"backend",
				"watchdogFilesystem",
				"watchdogAutoCad",
				"autocadPlugin",
			]);
			expect(typeof payload.summary).toBe("string");
		},
		20_000,
	);

	workstationIntegrationTest(
		"control-suite-runtime-service status returns structured backend service data",
		() => {
			const payload = runPowerShellJson(
				"scripts/control-suite-runtime-service.ps1",
				["-Service", "backend", "-Action", "status", "-Json"],
			);
			expect(payload.service).toBe("backend");
			expect(payload.action).toBe("status");
			expect(payload.status?.id).toBe("backend");
			expect(typeof payload.summary).toBe("string");
			expect(payload.logTarget?.kind).toBe("path");
			expect(typeof payload.logTarget?.target).toBe("string");
		},
		20_000,
	);

	workstationIntegrationTest(
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
