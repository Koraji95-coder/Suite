import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
	buildDocFromRoot,
	extractHtmlFromWrapped,
	htmlToMarkdown,
} from "./extract-autodesk-offline-help.mjs";

describe("Autodesk offline help extractor", () => {
	const fixturePath = path.join("scripts", "testdata", "sample-wrapped.js");

	it("extracts the embedded HTML string from a wrapped topic", async () => {
		const content = await fs.readFile(fixturePath, "utf8");
		const html = extractHtmlFromWrapped(content);
		expect(html).toContain("<h1>Test Title</h1>");
		expect(html).toContain("Hello world.");
	});

	it("converts the HTML snippet into Markdown with heading and paragraph", () => {
		const html = "<h1>Title</h1><p>Body text</p>";
		const markdown = htmlToMarkdown(html);
		expect(markdown).toContain("# Title");
		expect(markdown).toContain("Body text");
	});

	it("builds a doc string with injected allowlist and section order", async () => {
		const tempDocRoot = path.join("scripts", "testdata");
		const customAllowlist = [
			{
				id: "sample",
				targetSection: "AEPROJECT / Project Manager entrypoints",
				label: "Sample topic",
				source: "sample-wrapped.js",
			},
		];
		const markdown = await buildDocFromRoot(tempDocRoot, {
			allowlist: customAllowlist,
			sectionOrder: ["AEPROJECT / Project Manager entrypoints"],
		});
		expect(markdown).toContain("## AEPROJECT / Project Manager entrypoints");
		expect(markdown).toContain("### Sample topic");
		expect(markdown).toContain("Hello world.");
	});
});
