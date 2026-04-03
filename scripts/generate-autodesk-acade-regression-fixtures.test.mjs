import { describe, expect, it } from "vitest";

import {
	buildRegressionFixturePlanFromInstallationSummary,
	buildRegressionFixturesMarkdownFromPlan,
} from "./generate-autodesk-acade-regression-fixtures.mjs";

describe("AutoCAD Electrical regression fixtures generator", () => {
	it("selects primary and secondary fixtures from installation summary data", () => {
		const plan = buildRegressionFixturePlanFromInstallationSummary({
			generatedAt: "2026-04-02T22:10:00.000Z",
			demoProjects: [
				{
					name: "Demo",
					rootPath: "C:\\Acade\\Proj\\Demo",
					projectFiles: ["C:\\Acade\\Proj\\Demo\\wddemo.wdp"],
					drawingFiles: [
						"C:\\Acade\\Proj\\Demo\\Drawing1.dwg",
						"C:\\Acade\\Proj\\Demo\\Drawing2.dwg",
					],
					sidecarFiles: [
						"C:\\Acade\\Proj\\Demo\\wddemo.wdt",
						"C:\\Acade\\Proj\\Demo\\wddemo_wdtitle.wdl",
					],
				},
				{
					name: "Point2Point",
					rootPath: "C:\\Acade\\Proj\\Point2Point",
					projectFiles: ["C:\\Acade\\Proj\\Point2Point\\Point2Point.wdp"],
					drawingFiles: ["C:\\Acade\\Proj\\Point2Point\\Connector.dwg"],
					sidecarFiles: [],
				},
				{
					name: "NfpaDemo",
					rootPath: "C:\\Acade\\Proj\\NfpaDemo",
					projectFiles: ["C:\\Acade\\Proj\\NfpaDemo\\Nfpademo.wdp"],
					drawingFiles: ["C:\\Acade\\Proj\\NfpaDemo\\Page1.dwg"],
					sidecarFiles: ["C:\\Acade\\Proj\\NfpaDemo\\Nfpademo.wdt"],
				},
			],
			sampleDrawings: [
				"C:\\Acade\\Sample\\Safety Circuit.dwg",
				"C:\\Acade\\Sample\\PLC IO Rack Arrangement (1746-A7).DWG",
			],
		});

		expect(plan.schemaVersion).toBe("suite.autodesk.acade.regression-fixtures.v1");
		expect(plan.counts).toMatchObject({
			fixtures: 5,
			projects: 3,
			drawings: 2,
			primary: 3,
			secondary: 2,
		});
		expect(plan.primaryFixtures.map((fixture) => fixture.id)).toEqual([
			"wddemo-project",
			"point2point-project",
			"safety-circuit-drawing",
		]);
		expect(plan.secondaryFixtures.map((fixture) => fixture.id)).toEqual([
			"nfpa-demo-project",
			"plc-io-rack-drawing",
		]);

		const markdown = buildRegressionFixturesMarkdownFromPlan(plan);
		expect(markdown).toContain("# AutoCAD Electrical 2026 Regression Fixtures");
		expect(markdown).toContain("`wddemo-project`");
		expect(markdown).toContain("`point2point-project`");
		expect(markdown).toContain("`safety-circuit-drawing`");
		expect(markdown).toContain("`plc-io-rack-drawing`");
		expect(markdown).toContain("npm run fixtures:autodesk:stage");
	});
});
