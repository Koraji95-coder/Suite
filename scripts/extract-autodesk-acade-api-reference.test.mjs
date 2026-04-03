import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	buildDocFromExtractedRoot,
	parseChmToc,
	parseCommandPage,
	parseSampleIndexPage,
	parseSectionTopicsPage,
} from "./extract-autodesk-acade-api-reference.mjs";

describe("AutoCAD Electrical AutoLISP/API extractor", () => {
	it("parses the CHM table of contents", () => {
		const toc = parseChmToc(`<!DOCTYPE html><html><body>
			<ul>
				<li><object type="text/sitemap">
					<param name="Name" value="Introduction" />
					<param name="Local" value="Introduction.html" />
				</object></li>
				<li><object type="text/sitemap">
					<param name="Name" value="Section A - Schematic Components" />
					<param name="Local" value="Section_A.html" />
				</object>
					<ul>
						<li><object type="text/sitemap">
							<param name="Name" value="c:ace_get_wnum" />
							<param name="Local" value="c_ace_get_wnum.html" />
						</object></li>
					</ul>
				</li>
			</ul>
		</body></html>`);

		expect(toc).toHaveLength(2);
		expect(toc[1]?.children).toHaveLength(1);
		expect(toc[1]?.children[0]).toMatchObject({
			name: "c:ace_get_wnum",
			local: "c_ace_get_wnum.html",
		});
	});

	it("parses command and section pages", () => {
		const command = parseCommandPage(`<!DOCTYPE html><html><body>
			<div class="Element5">c:ace_get_wnum</div>
			<div class="Element58">
				<div class="Element14">Description</div>
				<div class="Element11"><p>Retrieve wire number value from selected wire network.</p></div>
				<div class="Element14">AutoLISP</div>
				<div class="Element11"><pre>(c:ace_get_wnum wen)</pre></div>
				<div class="Element14">Parameters</div>
				<div class="Element11">
					<table>
						<tr><td>Parameters</td><td>Description</td></tr>
						<tr><td>wen</td><td>Entity name of LINE wire segment of network.</td></tr>
					</table>
				</div>
				<div class="Element14">Returns</div>
				<div class="Element11"><p>nil on failure, else a wire-number tuple.</p></div>
				<div class="Element14">Links</div>
				<div class="Element11"><a href="_example.html">Example</a></div>
			</div>
		</body></html>`);
		expect(command.description).toContain("Retrieve wire number value");
		expect(command.signature).toBe("(c:ace_get_wnum wen)");
		expect(command.parameters[0]).toMatchObject({
			name: "wen",
			description: "Entity name of LINE wire segment of network.",
		});
		expect(command.exampleTopicHref).toBe("_example.html");

		const section = parseSectionTopicsPage(`<!DOCTYPE html><html><body>
			<div class="Element5">Section A - Schematic Components</div>
			<div class="Element58">
				<div class="Element14">Description</div>
				<div class="Element11"><p>Insert Component, Break Wire, and Auto Tag Generation.</p></div>
				<div class="Element14">Topics</div>
				<div class="Element11">
					<table>
						<tr><td>Name</td><td>Description</td></tr>
						<tr><td><a href="c_ace_get_wnum.html">c:ace_get_wnum</a></td><td>Retrieve wire number value.</td></tr>
					</table>
				</div>
			</div>
		</body></html>`);
		expect(section.description).toContain("Insert Component");
		expect(section.topics[0]).toMatchObject({
			name: "c:ace_get_wnum",
			href: "c_ace_get_wnum.html",
		});
	});

	it("parses the samples index page", () => {
		const samples = parseSampleIndexPage(`<!DOCTYPE html><html><body>
			<table class="Table2">
				<tr><td><a href="AutoLISP_sample_code.html">AutoLISP</a></td><td>Sample to map a color suffix.</td></tr>
			</table>
			<table class="Table2">
				<tr><td>Section C. Insert wires and wire numbers.</td></tr>
				<tr><td><a href="c_ace_get_wnum.html">ace_get_wnum</a></td></tr>
			</table>
		</body></html>`);

		expect(samples.generalSamples[0]).toMatchObject({
			label: "AutoLISP",
			href: "AutoLISP_sample_code.html",
		});
		expect(samples.referenceSamples[0]).toMatchObject({
			section: "Section C. Insert wires and wire numbers.",
			label: "ace_get_wnum",
			href: "c_ace_get_wnum.html",
		});
	});

	it("builds a generated markdown doc from an extracted CHM root", async () => {
		const tempRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "suite-acade-api-doc-"),
		);
		const extractedRoot = path.join(tempRoot, "extracted");
		const acadeRoot = path.join(tempRoot, "Acade");
		await fs.mkdir(extractedRoot, { recursive: true });
		await fs.mkdir(path.join(acadeRoot, "Support", "en-US", "Shared"), { recursive: true });
		await fs.mkdir(path.join(acadeRoot, "en-US", "DB"), { recursive: true });
		await fs.mkdir(path.join(acadeRoot, "UserDataCache", "en-US", "Template"), {
			recursive: true,
		});
		await fs.mkdir(
			path.join(
				acadeRoot,
				"UserDataCache",
				"My Documents",
				"Acade 2026",
				"AeData",
				"Proj",
				"Demo",
			),
			{ recursive: true },
		);

		await fs.writeFile(path.join(acadeRoot, "wd_load.lsp"), "; load", "utf8");
		await fs.writeFile(
			path.join(acadeRoot, "Support", "en-US", "Shared", "wdio.lsp"),
			"; wdio",
			"utf8",
		);
		await fs.writeFile(
			path.join(acadeRoot, "Support", "en-US", "Shared", "wdio.dcl"),
			"; dcl",
			"utf8",
		);
		await fs.writeFile(
			path.join(acadeRoot, "en-US", "DB", "default_cat.mdb"),
			"",
			"utf8",
		);
		await fs.writeFile(path.join(acadeRoot, "WDMENU.fas"), "", "utf8");

		await fs.writeFile(
			path.join(extractedRoot, "AutoLISP Reference.hhc"),
			`<!DOCTYPE html><html><body>
				<ul>
					<li><object type="text/sitemap"><param name="Name" value="Introduction" /><param name="Local" value="Introduction.html" /></object></li>
					<li><object type="text/sitemap"><param name="Name" value="What's New" /><param name="Local" value="What's_New.html" /></object></li>
					<li><object type="text/sitemap"><param name="Name" value="Section A - Schematic Components" /><param name="Local" value="Section_A.html" /></object>
						<ul>
							<li><object type="text/sitemap"><param name="Name" value="c:ace_get_wnum" /><param name="Local" value="c_ace_get_wnum.html" /></object></li>
						</ul>
					</li>
					<li><object type="text/sitemap"><param name="Name" value="Samples Index" /><param name="Local" value="Samples_Index.html" /></object></li>
					<li><object type="text/sitemap"><param name="Name" value="Appendix" /><param name="Local" value="Appendix.html" /></object></li>
				</ul>
			</body></html>`,
			"utf8",
		);
		await fs.writeFile(
			path.join(extractedRoot, "Introduction.html"),
			`<!DOCTYPE html><html><body>
				<div class="Element5">Introduction</div>
				<div class="Element58">
					<div class="Element14">Description</div>
					<div class="Element11">
						<p>The API entry point list consists of entry points into the software executable.</p>
						<ul><li><a href="c_ace_get_wnum.html">ace_get_wnum</a> - wire number routine.</li></ul>
					</div>
				</div>
			</body></html>`,
			"utf8",
		);
		await fs.writeFile(
			path.join(extractedRoot, "What's_New.html"),
			`<!DOCTYPE html><html><body>
				<div class="Element5">What's New</div>
				<div class="Element58">
					<div class="Element14">Description</div>
					<div class="Element11"><p>No changes were made to the API this release.</p></div>
				</div>
			</body></html>`,
			"utf8",
		);
		await fs.writeFile(
			path.join(extractedRoot, "Section_A.html"),
			`<!DOCTYPE html><html><body>
				<div class="Element5">Section A - Schematic Components</div>
				<div class="Element58">
					<div class="Element14">Description</div>
					<div class="Element11"><p>Insert Component and Auto Tag Generation.</p></div>
					<div class="Element14">Topics</div>
					<div class="Element11">
						<table>
							<tr><td>Name</td><td>Description</td></tr>
							<tr><td><a href="c_ace_get_wnum.html">c:ace_get_wnum</a></td><td>Retrieve wire number value.</td></tr>
						</table>
					</div>
				</div>
			</body></html>`,
			"utf8",
		);
		await fs.writeFile(
			path.join(extractedRoot, "c_ace_get_wnum.html"),
			`<!DOCTYPE html><html><body>
				<div class="Element5">c:ace_get_wnum</div>
				<div class="Element58">
					<div class="Element14">Description</div>
					<div class="Element11"><p>Retrieve wire number value from selected wire network.</p></div>
					<div class="Element14">AutoLISP</div>
					<div class="Element11"><pre>(c:ace_get_wnum wen)</pre></div>
					<div class="Element14">Parameters</div>
					<div class="Element11">
						<table>
							<tr><td>Parameters</td><td>Description</td></tr>
							<tr><td>wen</td><td>Entity name of LINE wire segment of network.</td></tr>
						</table>
					</div>
					<div class="Element14">Returns</div>
					<div class="Element11"><p>nil on failure, else a wire-number tuple.</p></div>
					<div class="Element14">Links</div>
					<div class="Element11"><a href="_c_ace_get_wnum_3_Example.html">Example</a></div>
				</div>
			</body></html>`,
			"utf8",
		);
		await fs.writeFile(
			path.join(extractedRoot, "Samples_Index.html"),
			`<!DOCTYPE html><html><body>
				<table class="Table2">
					<tr><td><a href="AutoLISP_sample_code.html">AutoLISP</a></td><td>Sample to map a color suffix.</td></tr>
				</table>
				<table class="Table2">
					<tr><td>Section C. Insert wires and wire numbers.</td></tr>
					<tr><td><a href="c_ace_get_wnum.html">ace_get_wnum</a></td></tr>
				</table>
			</body></html>`,
			"utf8",
		);
		await fs.writeFile(
			path.join(extractedRoot, "Appendix.html"),
			`<!DOCTYPE html><html><body>
				<div class="Element5">Appendix</div>
				<div class="Element58">
					<div class="Element14">Module</div>
					<div class="Element11"><p><a href="Section_M.html">Section M - Project Database Service</a></p></div>
					<div class="Element14">Topics</div>
					<div class="Element11">
						<table>
							<tr><td>Name</td><td>Description</td></tr>
							<tr><td><a href="ProjectVars.html">Project Variables</a></td><td>Variable reference.</td></tr>
						</table>
					</div>
				</div>
			</body></html>`,
			"utf8",
		);

		const markdown = await buildDocFromExtractedRoot(extractedRoot, {
			acadeRoot,
			chmPath: path.join(acadeRoot, "Help", "en-US", "Help", "ACE_API.chm"),
			generatedAt: "2026-04-02T18:00:00.000Z",
		});

		expect(markdown).toContain("# AutoCAD Electrical 2026 AutoLISP Reference API Documentation");
		expect(markdown).toContain("Generated at: 2026-04-02T18:00:00.000Z");
		expect(markdown).toContain("`c:ace_get_wnum` - Retrieve wire number value from selected wire network.");
		expect(markdown).toContain("Signature: `(c:ace_get_wnum wen)`.");
		expect(markdown).toContain("Parameters: `wen` = Entity name of LINE wire segment of network.");
		expect(markdown).toContain("Returns: nil on failure, else a wire-number tuple.");
		expect(markdown).toContain("wd_load.lsp");
		expect(markdown).toContain("default_cat.mdb");
		expect(markdown).toContain("`AutoLISP_sample_code.html`");
		expect(markdown).toContain("`ProjectVars.html`");
	});
});
