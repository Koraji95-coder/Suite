import { describe, expect, it } from "vitest";

import { buildMenuIndexFromInstallationSummary } from "./generate-autodesk-acade-menu-index.mjs";

describe("AutoCAD Electrical menu index generator", () => {
	it("builds a compact menu index from installation summary data", () => {
		const payload = buildMenuIndexFromInstallationSummary({
			generatedAt: "2026-04-02T20:00:00.000Z",
			menuSummaries: [
				{
					fileName: "ACE_JIC_MENU.DAT",
					firstPageTitle: "JIC: Schematic Symbols",
					pageCount: 55,
					totalEntryCount: 555,
					submenuCount: 57,
					commandActionCount: 68,
					symbolInsertCount: 429,
					topLevelEntries: [
						{ label: "Push Buttons" },
						{ label: "Selector Switches" },
						{ label: "PLC I/O" },
					],
				},
				{
					fileName: "ACE_PANEL_MENU.DAT",
					firstPageTitle: "Panel Layout Symbols",
					pageCount: 18,
					totalEntryCount: 147,
					submenuCount: 17,
					commandActionCount: 130,
					symbolInsertCount: 0,
					topLevelEntries: [
						{ label: "Push Buttons" },
						{ label: "Relays" },
					],
				},
				{
					fileName: "ACE_PID_MENU.DAT",
					firstPageTitle: "Piping and Instrumentation Symbols",
					pageCount: 30,
					totalEntryCount: 273,
					submenuCount: 29,
					commandActionCount: 0,
					symbolInsertCount: 244,
					topLevelEntries: [
						{ label: "Equipment" },
						{ label: "Valves" },
					],
				},
				{
					fileName: "wd_locs.dat",
					firstPageTitle: "INSERT LOCATION SYMBOLS:",
					pageCount: 2,
					totalEntryCount: 9,
					submenuCount: 1,
					commandActionCount: 0,
					symbolInsertCount: 8,
					topLevelEntries: [{ label: "Filled Triangle" }],
				},
			],
		});

		expect(payload.schemaVersion).toBe("suite.autodesk.acade.menu-index.v1");
		expect(payload.generatedAt).toBe("2026-04-02T20:00:00.000Z");
		expect(payload.counts.menus).toBe(4);
		expect(payload.counts.byKind).toMatchObject({
			schematic: 1,
			panel: 1,
			process: 1,
			utility: 1,
			other: 0,
		});
		expect(payload.menus[0]).toMatchObject({
			fileName: "ACE_PANEL_MENU.DAT",
			kind: "panel",
			familyId: "panel_layout",
		});
		expect(payload.menus[1]).toMatchObject({
			fileName: "ACE_PID_MENU.DAT",
			kind: "process",
			familyId: "pid",
		});
		expect(payload.menus[2]).toMatchObject({
			fileName: "ACE_JIC_MENU.DAT",
			kind: "schematic",
			familyId: "jic",
			topCategories: ["Push Buttons", "Selector Switches", "PLC I/O"],
		});
		expect(payload.menus[3]).toMatchObject({
			fileName: "wd_locs.dat",
			kind: "utility",
			familyId: "location_symbols",
		});
		expect(payload.standards).toHaveLength(1);
		expect(payload.standards[0]).toMatchObject({
			id: "jic",
			label: "JIC",
			kind: "schematic",
			menuCount: 1,
			totalEntryCount: 555,
		});
		expect(payload.recommendedDefaults).toMatchObject({
			schematic: ["jic"],
			panel: ["panel_layout"],
			process: ["pid"],
			utility: ["location_symbols"],
		});
	});

	it("classifies ACE_IEC_MENU.DAT as iec family with isLegacy false", () => {
		const payload = buildMenuIndexFromInstallationSummary({
			generatedAt: "2026-04-02T20:00:00.000Z",
			menuSummaries: [
				{
					fileName: "ACE_IEC_MENU.DAT",
					firstPageTitle: "IEC: Schematic Symbols",
					pageCount: 104,
					totalEntryCount: 1118,
					submenuCount: 102,
					commandActionCount: 221,
					symbolInsertCount: 793,
					topLevelEntries: [
						{ label: "Push Buttons" },
						{ label: "Selector Switches" },
						{ label: "Breakers/Disconnects" },
					],
				},
			],
		});

		expect(payload.counts.menus).toBe(1);
		const menu = payload.menus[0];
		expect(menu).toMatchObject({
			fileName: "ACE_IEC_MENU.DAT",
			kind: "schematic",
			familyId: "iec",
			familyLabel: "IEC",
			isLegacy: false,
			totalEntryCount: 1118,
		});
	});

	it("classifies IEC_MENU.DAT as legacy_iec family with isLegacy true", () => {
		const payload = buildMenuIndexFromInstallationSummary({
			generatedAt: "2026-04-02T20:00:00.000Z",
			menuSummaries: [
				{
					fileName: "IEC_MENU.DAT",
					firstPageTitle: "IEC Schematic Symbols (Legacy)",
					pageCount: 50,
					totalEntryCount: 642,
					submenuCount: 48,
					commandActionCount: 90,
					symbolInsertCount: 504,
					topLevelEntries: [
						{ label: "Push Buttons" },
						{ label: "Selector Switches" },
					],
				},
			],
		});

		expect(payload.counts.menus).toBe(1);
		const menu = payload.menus[0];
		expect(menu).toMatchObject({
			fileName: "IEC_MENU.DAT",
			kind: "schematic",
			familyId: "legacy_iec",
			familyLabel: "Legacy IEC",
			isLegacy: true,
		});
	});

	it("classifies WD_MENU.DAT as legacy_jic family with isLegacy true", () => {
		const payload = buildMenuIndexFromInstallationSummary({
			generatedAt: "2026-04-02T20:00:00.000Z",
			menuSummaries: [
				{
					fileName: "WD_MENU.DAT",
					firstPageTitle: "Schematic Symbols",
					pageCount: 42,
					totalEntryCount: 535,
					submenuCount: 40,
					commandActionCount: 80,
					symbolInsertCount: 415,
					topLevelEntries: [
						{ label: "Push Buttons" },
						{ label: "Relays/Contacts" },
					],
				},
			],
		});

		expect(payload.counts.menus).toBe(1);
		const menu = payload.menus[0];
		expect(menu).toMatchObject({
			fileName: "WD_MENU.DAT",
			kind: "schematic",
			familyId: "legacy_jic",
			familyLabel: "Legacy JIC",
			isLegacy: true,
		});
	});

	it("includes iec in recommendedDefaults when ACE_IEC_MENU.DAT is the only schematic menu", () => {
		const payload = buildMenuIndexFromInstallationSummary({
			generatedAt: "2026-04-02T20:00:00.000Z",
			menuSummaries: [
				{
					fileName: "ACE_IEC_MENU.DAT",
					firstPageTitle: "IEC: Schematic Symbols",
					pageCount: 104,
					totalEntryCount: 1118,
					submenuCount: 102,
					commandActionCount: 221,
					symbolInsertCount: 793,
					topLevelEntries: [{ label: "Push Buttons" }],
				},
			],
		});

		expect(payload.recommendedDefaults.schematic).toEqual(["iec"]);
	});

	it("places iec after jic in recommendedDefaults fallback order when both are present", () => {
		const payload = buildMenuIndexFromInstallationSummary({
			generatedAt: "2026-04-02T20:00:00.000Z",
			menuSummaries: [
				{
					fileName: "ACE_JIC_MENU.DAT",
					firstPageTitle: "JIC: Schematic Symbols",
					pageCount: 55,
					totalEntryCount: 555,
					submenuCount: 57,
					commandActionCount: 68,
					symbolInsertCount: 429,
					topLevelEntries: [{ label: "Push Buttons" }],
				},
				{
					fileName: "ACE_IEC_MENU.DAT",
					firstPageTitle: "IEC: Schematic Symbols",
					pageCount: 104,
					totalEntryCount: 1118,
					submenuCount: 102,
					commandActionCount: 221,
					symbolInsertCount: 793,
					topLevelEntries: [{ label: "Push Buttons" }],
				},
			],
		});

		const schematicDefaults = payload.recommendedDefaults.schematic;
		expect(schematicDefaults).toContain("jic");
		expect(schematicDefaults).toContain("iec");
		expect(schematicDefaults.indexOf("jic")).toBeLessThan(schematicDefaults.indexOf("iec"));
	});

	it("excludes legacy_iec and legacy_jic from recommendedDefaults.schematic", () => {
		const payload = buildMenuIndexFromInstallationSummary({
			generatedAt: "2026-04-02T20:00:00.000Z",
			menuSummaries: [
				{
					fileName: "ACE_JIC_MENU.DAT",
					firstPageTitle: "JIC: Schematic Symbols",
					pageCount: 55,
					totalEntryCount: 555,
					submenuCount: 57,
					commandActionCount: 68,
					symbolInsertCount: 429,
					topLevelEntries: [{ label: "Push Buttons" }],
				},
				{
					fileName: "IEC_MENU.DAT",
					firstPageTitle: "IEC Schematic Symbols (Legacy)",
					pageCount: 50,
					totalEntryCount: 642,
					submenuCount: 48,
					commandActionCount: 90,
					symbolInsertCount: 504,
					topLevelEntries: [{ label: "Push Buttons" }],
				},
				{
					fileName: "WD_MENU.DAT",
					firstPageTitle: "Schematic Symbols",
					pageCount: 42,
					totalEntryCount: 535,
					submenuCount: 40,
					commandActionCount: 80,
					symbolInsertCount: 415,
					topLevelEntries: [{ label: "Push Buttons" }],
				},
			],
		});

		expect(payload.recommendedDefaults.schematic).not.toContain("legacy_iec");
		expect(payload.recommendedDefaults.schematic).not.toContain("legacy_jic");
		expect(payload.recommendedDefaults.schematic).toContain("jic");
	});
});
