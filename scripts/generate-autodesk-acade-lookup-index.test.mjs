import { describe, expect, it } from "vitest";

import { buildLookupIndexFromInstallationSummary } from "./generate-autodesk-acade-lookup-index.mjs";

describe("AutoCAD Electrical lookup index generator", () => {
	it("builds a compact lookup index from installation summary data", () => {
		const payload = buildLookupIndexFromInstallationSummary({
			generatedAt: "2026-04-02T21:15:00.000Z",
			databaseInventories: [
				{
					filePath: "C:\\Acade\\en-US\\DB\\default_cat.mdb",
					tableCount: 3,
					tables: [
						{
							name: "_FAM",
							type: "TABLE",
							columnCount: 4,
							columns: ["MFG", "CAT", "FAMILY", "DESC1"],
						},
						{
							name: "_PINLIST",
							type: "TABLE",
							columnCount: 3,
							columns: ["PIN1", "PIN2", "TYPE"],
						},
					],
					interestingTables: [
						{
							name: "_FAM",
							type: "TABLE",
							columnCount: 4,
							columns: ["MFG", "CAT", "FAMILY", "DESC1"],
						},
					],
				},
				{
					filePath: "C:\\Acade\\en-US\\DB\\ace_plc.mdb",
					tableCount: 2,
					tables: [
						{
							name: "_PLCIO",
							type: "TABLE",
							columnCount: 4,
							columns: ["STYLE", "MFG", "CAT", "PINS"],
						},
					],
					interestingTables: [
						{
							name: "_PLCIO",
							type: "TABLE",
							columnCount: 4,
							columns: ["STYLE", "MFG", "CAT", "PINS"],
						},
					],
				},
				{
					filePath: "C:\\Acade\\UserSupport\\wdviacmp.mdb",
					tableCount: 1,
					tables: [
						{
							name: "VIA_MAPPINGS",
							type: "TABLE",
							columnCount: 3,
							columns: ["SOURCE", "TARGET", "ATTR"],
						},
					],
					interestingTables: [
						{
							name: "VIA_MAPPINGS",
							type: "TABLE",
							columnCount: 3,
							columns: ["SOURCE", "TARGET", "ATTR"],
						},
					],
				},
				{
					filePath: "C:\\Acade\\en-US\\DB\\footprint_lookup.mdb",
					tableCount: 0,
					error: "",
					tables: [],
					interestingTables: [],
				},
			],
		});

		expect(payload.schemaVersion).toBe("suite.autodesk.acade.lookup-index.v1");
		expect(payload.generatedAt).toBe("2026-04-02T21:15:00.000Z");
		expect(payload.counts).toMatchObject({
			databases: 4,
			roles: 4,
			tables: 6,
			databasesWithErrors: 0,
		});
		expect(payload.recommendedDefaults).toMatchObject({
			catalog: "default_cat",
			plc: "ace_plc",
			viaComponent: "wdviacmp",
		});
		expect(payload.availableRoleIds).toEqual([
			"catalog_lookup",
			"footprint_lookup",
			"plc_lookup",
			"via_component_lookup",
		]);
		expect(payload.databases[0]).toMatchObject({
			id: "default_cat",
			roleId: "catalog_lookup",
			label: "Default Catalog",
			isOptional: false,
			tableCount: 3,
			interestingTableCount: 1,
			tableNames: ["_FAM", "_PINLIST"],
		});
		expect(payload.databases[1]).toMatchObject({
			id: "footprint_lookup",
			roleId: "footprint_lookup",
			isOptional: true,
			tableCount: 0,
		});
		expect(payload.databases[2]).toMatchObject({
			id: "ace_plc",
			roleId: "plc_lookup",
			label: "ACE PLC",
		});
		expect(payload.databases[3]).toMatchObject({
			id: "wdviacmp",
			roleId: "via_component_lookup",
		});
	});
});
