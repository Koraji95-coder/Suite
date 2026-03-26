import { describe, expect, it } from "vitest";
import {
	DEVELOPER_TOOL_MANIFEST,
	DEVELOPER_TOOL_GROUPS,
} from "./developerToolsManifest";

describe("developerToolsManifest", () => {
	it("keeps all workshop tools dev-only", () => {
		for (const tool of DEVELOPER_TOOL_MANIFEST) {
			expect(tool.audience).toBe("dev");
		}
	});

	it("uses only declared developer tool groups", () => {
		const groupIds = new Set(DEVELOPER_TOOL_GROUPS.map((group) => group.id));
		for (const tool of DEVELOPER_TOOL_MANIFEST) {
			expect(groupIds.has(tool.group)).toBe(true);
		}
	});

	it("keeps release states within the workshop taxonomy", () => {
		for (const tool of DEVELOPER_TOOL_MANIFEST) {
			expect(["developer_beta", "lab"]).toContain(tool.releaseState);
		}
	});
});
