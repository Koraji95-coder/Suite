import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stageRegressionFixtures } from "./stage-autodesk-acade-regression-fixtures.mjs";

describe("AutoCAD Electrical regression fixture staging", () => {
	it("copies selected project and drawing fixtures into a local stage root", async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "suite-acade-stage-"));
		const acadeRoot = path.join(tempRoot, "Acade");
		const demoRoot = path.join(tempRoot, "Proj", "Demo");
		const pointRoot = path.join(tempRoot, "Proj", "Point2Point");
		const sampleRoot = path.join(tempRoot, "Sample");
		const stageRoot = path.join(tempRoot, "stage");

		await fs.mkdir(path.join(demoRoot), { recursive: true });
		await fs.mkdir(path.join(pointRoot), { recursive: true });
		await fs.mkdir(path.join(sampleRoot), { recursive: true });

		await fs.writeFile(path.join(demoRoot, "wddemo.wdp"), "demo", "utf8");
		await fs.writeFile(path.join(demoRoot, "wddemo.wdt"), "wdt", "utf8");
		await fs.writeFile(path.join(demoRoot, "wddemo_wdtitle.wdl"), "wdl", "utf8");
		await fs.writeFile(path.join(demoRoot, "Drawing1.dwg"), "dwg1", "utf8");
		await fs.writeFile(path.join(pointRoot, "Point2Point.wdp"), "p2p", "utf8");
		await fs.writeFile(path.join(pointRoot, "Connector.dwg"), "conn", "utf8");
		await fs.writeFile(path.join(sampleRoot, "Safety Circuit.dwg"), "safety", "utf8");

		const result = await stageRegressionFixtures({
			acadeRoot,
			stageRoot,
			summary: {
				generatedAt: "2026-04-02T22:30:00.000Z",
				demoProjects: [
					{
						name: "Demo",
						rootPath: demoRoot,
						projectFiles: [path.join(demoRoot, "wddemo.wdp")],
						drawingFiles: [path.join(demoRoot, "Drawing1.dwg")],
						sidecarFiles: [
							path.join(demoRoot, "wddemo.wdt"),
							path.join(demoRoot, "wddemo_wdtitle.wdl"),
						],
					},
					{
						name: "Point2Point",
						rootPath: pointRoot,
						projectFiles: [path.join(pointRoot, "Point2Point.wdp")],
						drawingFiles: [path.join(pointRoot, "Connector.dwg")],
						sidecarFiles: [],
					},
				],
				sampleDrawings: [path.join(sampleRoot, "Safety Circuit.dwg")],
			},
		});

		expect(result.fixtures).toHaveLength(3);
		expect(
			await fs.readFile(
				path.join(stageRoot, "wddemo-project", "project", "wddemo.wdp"),
				"utf8",
			),
		).toBe("demo");
		expect(
			await fs.readFile(
				path.join(stageRoot, "point2point-project", "project", "Point2Point.wdp"),
				"utf8",
			),
		).toBe("p2p");
		expect(
			await fs.readFile(
				path.join(stageRoot, "safety-circuit-drawing", "drawing", "Safety Circuit.dwg"),
				"utf8",
			),
		).toBe("safety");

		const manifest = JSON.parse(
			await fs.readFile(path.join(stageRoot, "manifest.json"), "utf8"),
		);
		expect(manifest.schemaVersion).toBe("suite.autodesk.acade.regression-fixture-stage.v1");
		expect(manifest.fixtures).toHaveLength(3);
	});
});
