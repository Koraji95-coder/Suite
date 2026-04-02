import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	buildSnapshotId,
	extractFirstJsonObject,
	listLocalSupabaseSnapshots,
	parseSupabaseStatusOutput,
	resolveSnapshotSelection,
} from "./supabase-local-snapshot.mjs";

const createdPaths = [];

function createTempDir(prefix) {
	const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	createdPaths.push(directoryPath);
	return directoryPath;
}

afterEach(() => {
	for (const targetPath of createdPaths.splice(0)) {
		fs.rmSync(targetPath, { recursive: true, force: true });
	}
});

describe("supabase-local-snapshot helpers", () => {
	it("extracts the first JSON object from mixed Supabase CLI output", () => {
		const payload = {
			API_URL: "http://127.0.0.1:54421",
			DB_URL: "postgresql://postgres:postgres@127.0.0.1:54422/postgres",
		};
		const text = `${JSON.stringify(payload, null, 2)}\nUsing workdir C:\\temp\\cli-workdir\nStopped services: []`;

		expect(extractFirstJsonObject(text)).toBe(JSON.stringify(payload, null, 2));
		expect(parseSupabaseStatusOutput(text)).toEqual(payload);
	});

	it("builds stable snapshot ids with optional workstation and label tokens", () => {
		const snapshotId = buildSnapshotId({
			createdAt: new Date("2026-04-02T12:34:56.000Z"),
			workstationId: "DUSTIN-WORK",
			label: "Recovery Lane",
		});

		expect(snapshotId).toBe("20260402-123456z-dustin-work-recovery-lane");
	});

	it("lists and resolves snapshots by latest or explicit id", () => {
		const snapshotRoot = createTempDir("suite-snapshot-root-");
		const firstDir = path.join(snapshotRoot, "20260401-010101z-dustin-work");
		const secondDir = path.join(snapshotRoot, "20260402-020202z-dustin-work");
		fs.mkdirSync(firstDir, { recursive: true });
		fs.mkdirSync(secondDir, { recursive: true });
		fs.writeFileSync(
			path.join(firstDir, "manifest.json"),
			JSON.stringify({
				snapshotId: "20260401-010101z-dustin-work",
				createdAt: "2026-04-01T01:01:01.000Z",
			}),
			"utf8",
		);
		fs.writeFileSync(path.join(firstDir, "data.sql"), "select 1;", "utf8");
		fs.writeFileSync(
			path.join(secondDir, "manifest.json"),
			JSON.stringify({
				snapshotId: "20260402-020202z-dustin-work",
				createdAt: "2026-04-02T02:02:02.000Z",
			}),
			"utf8",
		);
		fs.writeFileSync(path.join(secondDir, "data.sql"), "select 2;", "utf8");

		const snapshots = listLocalSupabaseSnapshots(snapshotRoot);
		expect(snapshots.map((snapshot) => snapshot.snapshotId)).toEqual([
			"20260402-020202z-dustin-work",
			"20260401-010101z-dustin-work",
		]);
		expect(resolveSnapshotSelection("latest", snapshotRoot)?.snapshotId).toBe(
			"20260402-020202z-dustin-work",
		);
		expect(
			resolveSnapshotSelection("20260401-010101z-dustin-work", snapshotRoot)
				?.snapshotId,
		).toBe("20260401-010101z-dustin-work");
	});
});
