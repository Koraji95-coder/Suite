import { describe, expect, it } from "vitest";

import { buildAcadeIntegrationPlaybookMarkdown } from "./generate-autodesk-acade-integration-playbook.mjs";

describe("AutoCAD Electrical integration playbook generator", () => {
	it("builds a focused Suite-facing playbook from installation summary data", async () => {
		const markdown = await buildAcadeIntegrationPlaybookMarkdown({
			summary: {
				generatedAt: "2026-04-02T19:00:00.000Z",
				menuSummaries: [
					{
						fileName: "ACE_JIC_MENU.DAT",
						firstPageTitle: "JIC: Schematic Symbols",
						totalEntryCount: 555,
						topLevelEntries: [
							{ label: "Push Buttons" },
							{ label: "Selector Switches" },
							{ label: "PLC I/O" },
						],
					},
					{
						fileName: "ACE_PANEL_MENU.DAT",
						firstPageTitle: "Panel Layout Symbols",
						totalEntryCount: 147,
						topLevelEntries: [
							{ label: "Push Buttons" },
							{ label: "Relays" },
							{ label: "Pilot Lights" },
						],
					},
					{
						fileName: "ACE_PID_MENU.DAT",
						firstPageTitle: "Piping and Instrumentation Symbols",
						totalEntryCount: 273,
						topLevelEntries: [
							{ label: "Equipment" },
							{ label: "Valves" },
							{ label: "Instrumentation" },
						],
					},
					{
						fileName: "wd_locs.dat",
						firstPageTitle: "INSERT LOCATION SYMBOLS:",
						totalEntryCount: 9,
						topLevelEntries: [{ label: "Filled Triangle" }],
					},
				],
				supportScripts: [
					{
						fileName: "wd_load.lsp",
						defuns: ["wd_load"],
						commandEntryPoints: [],
						fileReferences: ["wd.env", "acade_demandload.fas"],
					},
					{
						fileName: "wdio.lsp",
						defuns: ["c:wdio", "c:wdio_autorun", "c:wdio_doit"],
						commandEntryPoints: ["c:wdio", "c:wdio_autorun", "c:wdio_doit"],
						fileReferences: ["wdio.dcl", "demoplc.xls", "default_cat.mdb", "demoplc.wdi"],
					},
				],
				databaseInventories: [
					{
						filePath: "C:\\Acade\\en-US\\DB\\default_cat.mdb",
						tableCount: 63,
					},
					{
						filePath: "C:\\Acade\\en-US\\DB\\ace_plc.mdb",
						tableCount: 4,
					},
					{
						filePath: "C:\\Acade\\UserSupport\\wdviacmp.mdb",
						tableCount: 3,
					},
					{
						filePath: "C:\\Acade\\en-US\\DB\\footprint_lookup.mdb",
						tableCount: 0,
					},
				],
				sampleDrawings: ["C:\\Acade\\Sample\\PLC IO Rack Arrangement (1746-A7).DWG"],
				demoProjects: [
					{
						projectFiles: ["C:\\Acade\\Demo\\wddemo.wdp"],
					},
				],
			},
		});

		expect(markdown).toContain("# AutoCAD Electrical 2026 Suite Integration Playbook");
		expect(markdown).toContain("## Standards and Symbol Surface");
		expect(markdown).toContain("ACE_JIC_MENU.DAT");
		expect(markdown).toContain("ACE_PANEL_MENU.DAT");
		expect(markdown).toContain("ACE_PID_MENU.DAT");
		expect(markdown).toContain("wd_locs.dat");
		expect(markdown).toContain("## Automation Surface That Matters Most");
		expect(markdown).toContain("`c:wdio_autorun`");
		expect(markdown).toContain("`default_cat.mdb`");
		expect(markdown).toContain("`wddemo.wdp`");
		expect(markdown).toContain("`/api/autocad/reference/menu-index`");
		expect(markdown).toContain("`/api/autocad/reference/lookups/summary`");
		expect(markdown).toContain("docs/development/autocad-electrical-2026-menu-index.generated.json");
		expect(markdown).toContain("docs/development/autocad-electrical-2026-lookup-index.generated.json");
		expect(markdown).toContain("docs/development/autocad-electrical-2026-regression-fixtures.md");
		expect(markdown).toContain("## Recommended Guardrails");
		expect(markdown).toContain("## Recommended Suite Feature Opportunities");
		expect(markdown).toContain("## Suggested Next Steps");
	});

	it("renders fallback note for ACE_IEC_MENU.DAT and legacy menus when present", async () => {
		const markdown = await buildAcadeIntegrationPlaybookMarkdown({
			summary: {
				generatedAt: "2026-04-02T19:00:00.000Z",
				menuSummaries: [
					{
						fileName: "ACE_JIC_MENU.DAT",
						firstPageTitle: "JIC: Schematic Symbols",
						totalEntryCount: 555,
						topLevelEntries: [{ label: "Push Buttons" }],
					},
					{
						fileName: "ACE_IEC_MENU.DAT",
						firstPageTitle: "IEC: Schematic Symbols",
						totalEntryCount: 1118,
						topLevelEntries: [
							{ label: "Push Buttons" },
							{ label: "Selector Switches" },
							{ label: "Breakers/Disconnects" },
						],
					},
					{
						fileName: "IEC_MENU.DAT",
						firstPageTitle: "IEC Schematic Symbols (Legacy)",
						totalEntryCount: 642,
						topLevelEntries: [
							{ label: "Push Buttons" },
							{ label: "Selector Switches" },
						],
					},
					{
						fileName: "WD_MENU.DAT",
						firstPageTitle: "Schematic Symbols",
						totalEntryCount: 535,
						topLevelEntries: [{ label: "Push Buttons" }],
					},
				],
				supportScripts: [],
				databaseInventories: [],
				sampleDrawings: [],
				demoProjects: [],
			},
		});

		expect(markdown).toContain("ACE_IEC_MENU.DAT");
		expect(markdown).toContain("IEC_MENU.DAT");
		expect(markdown).toContain("WD_MENU.DAT");
		expect(markdown).toContain(
			"Legacy/default menu path that still matters for fallback menu-loading behavior.",
		);
	});
});
