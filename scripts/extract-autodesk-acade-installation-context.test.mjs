import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import {
	buildArtifactsFromAcadeRoot,
	buildDocFromAcadeRoot,
	buildYamlFromAcadeRoot,
	parseLispSurface,
	parseMenuDat,
} from "./extract-autodesk-acade-installation-context.mjs";

describe("AutoCAD Electrical installation context extractor", () => {
	it("parses Autodesk menu DAT files", () => {
		const parsed = parseMenuDat(`; comment
**M0
D0
INSERT COMPONENT: JIC SCHEMATIC SYMBOLS
Push Buttons|s2(s_pb)|$S=M3
DOT|s1(shdot)|$C=wd_repeat WDDOT
Relay Coil|s1(SHCR1)|HCR1
`, "ACE_JIC_MENU.DAT");

		expect(parsed.pageCount).toBe(1);
		expect(parsed.firstPageTitle).toBe("INSERT COMPONENT: JIC SCHEMATIC SYMBOLS");
		expect(parsed.submenuCount).toBe(1);
		expect(parsed.commandActionCount).toBe(1);
		expect(parsed.symbolInsertCount).toBe(1);
		expect(parsed.topLevelEntries[0]).toMatchObject({
			label: "Push Buttons",
			submenuId: "M3",
		});
	});

	it("parses support-script entry points and file references", () => {
		const parsed = parseLispSurface(`(defun c:wdio () nil)
(defun c:wdio_autorun (param_lst) nil)
(defun wd_load () (findfile "wd.env") (load "acade_demandload.fas"))`, "wdio.lsp");

		expect(parsed.commandEntryPoints).toEqual(["c:wdio", "c:wdio_autorun"]);
		expect(parsed.fileReferences).toContain("wd.env");
		expect(parsed.fileReferences).toContain("acade_demandload.fas");
	});

	it("builds an installation context doc from a synthetic ACADE root", async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "suite-acade-install-"));
		const acadeRoot = path.join(tempRoot, "Acade");
		const userSupportRoot = path.join(
			acadeRoot,
			"UserDataCache",
			"en-US",
			"Electrical",
			"UserSupport",
		);
		const sharedSupportRoot = path.join(acadeRoot, "Support", "en-US", "Shared");
		const sampleRoot = path.join(acadeRoot, "Sample");
		const demoRoot = path.join(
			acadeRoot,
			"UserDataCache",
			"My Documents",
			"Acade 2026",
			"AeData",
			"Proj",
			"Demo",
		);
		const dbRoot = path.join(acadeRoot, "en-US", "DB");

		await fs.mkdir(userSupportRoot, { recursive: true });
		await fs.mkdir(sharedSupportRoot, { recursive: true });
		await fs.mkdir(sampleRoot, { recursive: true });
		await fs.mkdir(demoRoot, { recursive: true });
		await fs.mkdir(dbRoot, { recursive: true });

		await fs.writeFile(
			path.join(userSupportRoot, "ACE_JIC_MENU.DAT"),
			`**M0
D0
INSERT COMPONENT: JIC SCHEMATIC SYMBOLS
Push Buttons|s2(s_pb)|$S=M3
DOT|s1(shdot)|$C=wd_repeat WDDOT
Relay Coil|s1(SHCR1)|HCR1
`,
			"utf8",
		);
		await fs.writeFile(
			path.join(userSupportRoot, "acade.cuix"),
			"",
			"utf8",
		);
		await fs.writeFile(path.join(acadeRoot, "wd_load.lsp"), `(defun wd_load () (findfile "wd.env"))`, "utf8");
		await fs.writeFile(
			path.join(sharedSupportRoot, "wdio.lsp"),
			`(defun c:wdio () nil)
(defun c:wdio_autorun (param_lst) (findfile "wdio.dcl") (findfile "default_cat.mdb"))
(defun c:wdio_doit () nil)`,
			"utf8",
		);
		await fs.writeFile(path.join(sampleRoot, "Control Schematic.DWG"), "", "utf8");
		await fs.writeFile(path.join(demoRoot, "wddemo.wdp"), "", "utf8");
		await fs.writeFile(path.join(demoRoot, "DEMO01.DWG"), "", "utf8");
		await fs.writeFile(path.join(demoRoot, "wddemo_wdtitle.wdl"), "", "utf8");
		await fs.writeFile(path.join(dbRoot, "default_cat.mdb"), "", "utf8");

		const markdown = await buildDocFromAcadeRoot(acadeRoot, {
			generatedAt: "2026-04-02T17:00:00.000Z",
			databaseInventories: [
				{
					filePath: path.join(dbRoot, "default_cat.mdb"),
					tables: [
						{
							name: "_PINLIST",
							type: "TABLE",
							columnCount: 3,
							columns: ["MFG", "CAT", "PINLIST"],
						},
						{
							name: "CR",
							type: "TABLE",
							columnCount: 2,
							columns: ["MFG", "CAT"],
						},
					],
				},
			],
		});

		expect(markdown).toContain("# AutoCAD Electrical 2026 Installation Context Reference");
		expect(markdown).toContain("Generated at: 2026-04-02T17:00:00.000Z");
		expect(markdown).toContain("ACE_JIC_MENU.DAT");
		expect(markdown).toContain("INSERT COMPONENT: JIC SCHEMATIC SYMBOLS");
		expect(markdown).toContain("c:wdio_autorun");
		expect(markdown).toContain("default_cat.mdb");
		expect(markdown).toContain("_PINLIST");
		expect(markdown).toContain("Control Schematic.DWG");
		expect(markdown).toContain("wddemo.wdp");
		expect(markdown).toContain(
			"docs/development/autocad-electrical-2026-installation-context.generated.yaml",
		);
	});

	it("builds a structured YAML companion from the same synthetic ACADE root", async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "suite-acade-install-yaml-"));
		const acadeRoot = path.join(tempRoot, "Acade");
		const userSupportRoot = path.join(
			acadeRoot,
			"UserDataCache",
			"en-US",
			"Electrical",
			"UserSupport",
		);
		const sharedSupportRoot = path.join(acadeRoot, "Support", "en-US", "Shared");
		const sampleRoot = path.join(acadeRoot, "Sample");
		const demoRoot = path.join(
			acadeRoot,
			"UserDataCache",
			"My Documents",
			"Acade 2026",
			"AeData",
			"Proj",
			"Demo",
		);
		const dbRoot = path.join(acadeRoot, "en-US", "DB");

		await fs.mkdir(userSupportRoot, { recursive: true });
		await fs.mkdir(sharedSupportRoot, { recursive: true });
		await fs.mkdir(sampleRoot, { recursive: true });
		await fs.mkdir(demoRoot, { recursive: true });
		await fs.mkdir(dbRoot, { recursive: true });

		await fs.writeFile(
			path.join(userSupportRoot, "ACE_JIC_MENU.DAT"),
			`**M0
D0
INSERT COMPONENT: JIC SCHEMATIC SYMBOLS
Push Buttons|s2(s_pb)|$S=M3
DOT|s1(shdot)|$C=wd_repeat WDDOT
Relay Coil|s1(SHCR1)|HCR1
`,
			"utf8",
		);
		await fs.writeFile(path.join(userSupportRoot, "acade.cuix"), "", "utf8");
		await fs.writeFile(path.join(acadeRoot, "wd_load.lsp"), `(defun wd_load () (findfile "wd.env"))`, "utf8");
		await fs.writeFile(
			path.join(sharedSupportRoot, "wdio.lsp"),
			`(defun c:wdio () nil)
(defun c:wdio_autorun (param_lst) (findfile "wdio.dcl") (findfile "default_cat.mdb"))
(defun c:wdio_doit () nil)`,
			"utf8",
		);
		await fs.writeFile(path.join(sampleRoot, "Control Schematic.DWG"), "", "utf8");
		await fs.writeFile(path.join(demoRoot, "wddemo.wdp"), "", "utf8");
		await fs.writeFile(path.join(demoRoot, "DEMO01.DWG"), "", "utf8");
		await fs.writeFile(path.join(demoRoot, "wddemo_wdtitle.wdl"), "", "utf8");
		await fs.writeFile(path.join(dbRoot, "default_cat.mdb"), "", "utf8");

		const yaml = await buildYamlFromAcadeRoot(acadeRoot, {
			generatedAt: "2026-04-02T17:30:00.000Z",
			databaseInventories: [
				{
					filePath: path.join(dbRoot, "default_cat.mdb"),
					tables: [
						{
							name: "_PINLIST",
							type: "TABLE",
							columnCount: 3,
							columns: ["MFG", "CAT", "PINLIST"],
						},
					],
				},
			],
		});
		const parsed = parseYaml(yaml);

		expect(parsed.schemaVersion).toBe("suite.autodesk.acade.installation-context.v1");
		expect(parsed.generatedAt).toBe("2026-04-02T17:30:00.000Z");
		expect(parsed.roots.acade).toBe(acadeRoot.replaceAll("\\", "/"));
		expect(parsed.outputs.yaml).toBe(
			"docs/development/autocad-electrical-2026-installation-context.generated.yaml",
		);
		expect(parsed.userSupport.menuCatalogs[0]).toMatchObject({
			fileName: "ACE_JIC_MENU.DAT",
			firstPageTitle: "INSERT COMPONENT: JIC SCHEMATIC SYMBOLS",
		});
		expect(parsed.userSupport.menuCatalogs[0].topLevelEntries[0]).toMatchObject({
			label: "Push Buttons",
			actionType: "submenu",
			submenuId: "M3",
		});
		expect(parsed.supportScripts[1].commandEntryPoints).toEqual([
			"c:wdio",
			"c:wdio_autorun",
			"c:wdio_doit",
		]);
		expect(parsed.lookupDatabases[0]).toMatchObject({
			fileName: "default_cat.mdb",
			tableCount: 1,
		});
		expect(parsed.samples.shippedSampleDrawings[0].name).toBe("Control Schematic.DWG");
		expect(parsed.samples.demoProjects[0]).toMatchObject({
			name: "Demo",
			rootPath: demoRoot.replaceAll("\\", "/"),
		});
	});

	it("builds markdown and YAML artifacts from one shared summary", async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "suite-acade-install-artifacts-"));
		const acadeRoot = path.join(tempRoot, "Acade");
		const userSupportRoot = path.join(
			acadeRoot,
			"UserDataCache",
			"en-US",
			"Electrical",
			"UserSupport",
		);

		await fs.mkdir(userSupportRoot, { recursive: true });
		await fs.writeFile(
			path.join(userSupportRoot, "ACE_JIC_MENU.DAT"),
			`**M0
D0
INSERT COMPONENT: JIC SCHEMATIC SYMBOLS
Push Buttons|s2(s_pb)|$S=M3
`,
			"utf8",
		);

		const { summary, markdown, yaml } = await buildArtifactsFromAcadeRoot(acadeRoot, {
			generatedAt: "2026-04-02T18:00:00.000Z",
			databaseInventories: [],
		});

		expect(summary.generatedAt).toBe("2026-04-02T18:00:00.000Z");
		expect(markdown).toContain("Structured YAML companion");
		expect(parseYaml(yaml).generatedAt).toBe("2026-04-02T18:00:00.000Z");
	});
});
