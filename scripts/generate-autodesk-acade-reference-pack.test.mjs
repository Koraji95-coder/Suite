import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";

import {
	buildAcadeReferencePackMarkdown,
} from "./generate-autodesk-acade-reference-pack.mjs";

describe("AutoCAD Electrical reference pack generator", () => {
	it("builds a combined pack from local source docs", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "suite-acade-pack-"),
		);
		const docsRoot = path.join(tempRoot, "docs", "development");
		await fs.mkdir(docsRoot, { recursive: true });

		const projectFlowPath = path.join(
			docsRoot,
			"autocad-electrical-2026-project-flow-reference.md",
		);
		const apiReferencePath = path.join(
			docsRoot,
			"AutoCAD Electrical 2026 AutoLISP Reference API Documentation.md",
		);
		const installContextPath = path.join(
			docsRoot,
			"autocad-electrical-2026-installation-context-reference.md",
		);
		const regressionFixturesPath = path.join(
			docsRoot,
			"autocad-electrical-2026-regression-fixtures.md",
		);

		await fs.writeFile(
			projectFlowPath,
			"# Project Flow\n\n## Entry Points\n\n- AEPROJECT\n",
			"utf8",
		);
		await fs.writeFile(
			apiReferencePath,
			"# API Reference\n\n## Commands\n\n- ace_get_wnum\n- wd_putwn\n",
			"utf8",
		);
		await fs.writeFile(
			installContextPath,
			"# Install Context\n\n## User Support\n\n- ACE_JIC_MENU.DAT\n",
			"utf8",
		);
		await fs.writeFile(
			regressionFixturesPath,
			"# Regression Fixtures\n\n## Primary Fixtures\n\n- wddemo-project\n",
			"utf8",
		);

		const markdown = await buildAcadeReferencePackMarkdown({
			repoRoot: tempRoot,
			generatedAt: "2026-04-02T15:00:00.000Z",
		});

		expect(markdown).toContain("# AutoCAD Electrical 2026 Local Reference Pack");
		expect(markdown).toContain("Generated at 2026-04-02T15:00:00.000Z.");
		expect(markdown).toContain("## Source Map");
		expect(markdown).toContain(
			"repo://docs/development/autocad-electrical-2026-project-flow",
		);
		expect(markdown).toContain(
			"repo://docs/development/autocad-electrical-2026-autolisp-api-reference",
		);
		expect(markdown).toContain(
			"repo://docs/development/autocad-electrical-2026-installation-context",
		);
		expect(markdown).toContain(
			"repo://docs/development/autocad-electrical-2026-installation-context-yaml",
		);
		expect(markdown).toContain(
			"repo://docs/development/autocad-electrical-2026-regression-fixtures",
		);
		expect(markdown).toContain(
			"docs/development/autocad-electrical-2026-installation-context.generated.yaml",
		);
		expect(markdown).toContain("## AutoCAD Electrical 2026 Project Flow Reference");
		expect(markdown).toContain("### Entry Points");
		expect(markdown).toContain("## AutoCAD Electrical 2026 AutoLISP Reference API Documentation");
		expect(markdown).toContain("### Commands");
		expect(markdown).toContain("## AutoCAD Electrical 2026 Installation Context Reference");
		expect(markdown).toContain("### User Support");
		expect(markdown).toContain("## AutoCAD Electrical 2026 Regression Fixtures");
		expect(markdown).toContain("### Primary Fixtures");
		expect(markdown).toContain("ace_get_wnum");
		expect(markdown).toContain("wd_putwn");
	});
});
