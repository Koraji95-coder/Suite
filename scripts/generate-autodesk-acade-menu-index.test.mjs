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

	it("classifies ACE_PANEL_MENU_GB.DAT as panel kind with panel_layout family", () => {
		const payload = buildMenuIndexFromInstallationSummary({
			generatedAt: "2026-04-06T00:00:00.000Z",
			menuSummaries: [
				{
					fileName: "ACE_PANEL_MENU_GB.DAT",
					firstPageTitle: "Panel Layout Symbols",
					pageCount: 17,
					totalEntryCount: 128,
					submenuCount: 16,
					commandActionCount: 112,
					symbolInsertCount: 0,
					topLevelEntries: [
						{ label: "Push Buttons" },
						{ label: "Selector Switches" },
						{ label: "Limit Switches" },
						{ label: "Relays" },
						{ label: "Pressure/ Temperature Switches" },
					],
				},
			],
		});

		expect(payload.counts.menus).toBe(1);
		expect(payload.counts.byKind).toMatchObject({ panel: 1, schematic: 0 });
		expect(payload.menus[0]).toMatchObject({
			fileName: "ACE_PANEL_MENU_GB.DAT",
			kind: "panel",
			familyId: "panel_layout",
			familyLabel: "Panel Layout",
			isLegacy: false,
			symbolInsertCount: 0,
			commandActionCount: 112,
			totalEntryCount: 128,
		});
		expect(payload.menus[0].topCategories).toContain("Push Buttons");
		expect(payload.menus[0].topCategories).toContain("Relays");
		expect(payload.recommendedDefaults.panel).toContain("panel_layout");
	});

	it("classifies ACE_PANEL_MENU_IEC-60617.DAT as panel kind with iec_60617 family", () => {
		const payload = buildMenuIndexFromInstallationSummary({
			generatedAt: "2026-04-06T00:00:00.000Z",
			menuSummaries: [
				{
					fileName: "ACE_PANEL_MENU_IEC-60617.DAT",
					firstPageTitle: "Panel Layout Symbols",
					pageCount: 17,
					totalEntryCount: 128,
					submenuCount: 16,
					commandActionCount: 112,
					symbolInsertCount: 0,
					topLevelEntries: [
						{ label: "Push Buttons" },
						{ label: "Selector Switches" },
						{ label: "Limit Switches" },
						{ label: "Relays" },
						{ label: "Pressure/ Temperature Switches" },
					],
				},
			],
		});

		expect(payload.counts.menus).toBe(1);
		expect(payload.counts.byKind).toMatchObject({ panel: 1, schematic: 0 });
		expect(payload.menus[0]).toMatchObject({
			fileName: "ACE_PANEL_MENU_IEC-60617.DAT",
			kind: "panel",
			familyId: "iec_60617",
			familyLabel: "IEC 60617",
			isLegacy: false,
			symbolInsertCount: 0,
			commandActionCount: 112,
			totalEntryCount: 128,
		});
		expect(payload.menus[0].topCategories).toContain("Push Buttons");
		expect(payload.menus[0].topCategories).toContain("Relays");
		// iec_60617 is not in the panel recommendedDefaults list (panel_layout/legacy_panel);
		// the panel family is correctly identified via familyId on the menu entry itself.
		expect(payload.recommendedDefaults.panel).not.toContain("iec_60617");
	});

	it("separates ACE_PANEL_MENU_GB.DAT and ACE_PANEL_MENU_IEC-60617.DAT into distinct panel families", () => {
		const payload = buildMenuIndexFromInstallationSummary({
			generatedAt: "2026-04-06T00:00:00.000Z",
			menuSummaries: [
				{
					fileName: "ACE_PANEL_MENU_GB.DAT",
					firstPageTitle: "Panel Layout Symbols",
					pageCount: 17,
					totalEntryCount: 128,
					submenuCount: 16,
					commandActionCount: 112,
					symbolInsertCount: 0,
					topLevelEntries: [{ label: "Push Buttons" }, { label: "Relays" }],
				},
				{
					fileName: "ACE_PANEL_MENU_IEC-60617.DAT",
					firstPageTitle: "Panel Layout Symbols",
					pageCount: 17,
					totalEntryCount: 128,
					submenuCount: 16,
					commandActionCount: 112,
					symbolInsertCount: 0,
					topLevelEntries: [{ label: "Push Buttons" }, { label: "Relays" }],
				},
			],
		});

		expect(payload.counts.menus).toBe(2);
		expect(payload.counts.byKind).toMatchObject({ panel: 2, schematic: 0 });

		const gb = payload.menus.find((m) => m.fileName === "ACE_PANEL_MENU_GB.DAT");
		const iec = payload.menus.find((m) => m.fileName === "ACE_PANEL_MENU_IEC-60617.DAT");

		expect(gb).toBeDefined();
		expect(gb).toMatchObject({ kind: "panel", familyId: "panel_layout" });

		expect(iec).toBeDefined();
		expect(iec).toMatchObject({ kind: "panel", familyId: "iec_60617" });

		const familyIds = payload.families.map((s) => s.id);
		expect(familyIds).toContain("panel_layout");
		expect(familyIds).toContain("iec_60617");
	});
});
