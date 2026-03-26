import { describe, expect, it } from "vitest";
import { APPS_CATALOG } from "./appsCatalog";

describe("appsCatalog", () => {
	it("keeps the Apps Hub product-only", () => {
		for (const item of APPS_CATALOG) {
			expect(item.audience).toBe("customer");
			expect(item.releaseState).toBe("released");
		}
	});
});
