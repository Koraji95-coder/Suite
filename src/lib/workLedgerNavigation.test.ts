import { describe, expect, it } from "vitest";
import {
	buildChangelogSearchParams,
	buildDashboardLedgerSearchParams,
} from "./workLedgerNavigation";

describe("workLedgerNavigation", () => {
	it("builds changelog params from dashboard filters", () => {
		const params = buildChangelogSearchParams({
			projectId: "project-1",
			query: "autodraft compare panel",
			path: "src/features/autodraft-studio/ui/AutoDraftComparePanel.tsx",
			hotspot: "AutoDraftComparePanel",
			publishState: "ready",
		});

		expect(params.get("focus")).toBe("ledger");
		expect(params.get("project")).toBe("project-1");
		expect(params.get("query")).toBe("autodraft compare panel");
		expect(params.get("path")).toBe(
			"src/features/autodraft-studio/ui/AutoDraftComparePanel.tsx",
		);
		expect(params.get("hotspot")).toBe("AutoDraftComparePanel");
		expect(params.get("publishState")).toBe("ready");
	});

	it("builds dashboard ledger params from changelog filters", () => {
		const params = buildDashboardLedgerSearchParams({
			projectId: "project-9",
			path: "src/features/project-overview/useDashboardOverviewData.ts",
			publishState: "published",
		});

		expect(params.toString()).toContain("focus=ledger");
		expect(params.get("project")).toBe("project-9");
		expect(params.get("path")).toBe(
			"src/features/project-overview/useDashboardOverviewData.ts",
		);
		expect(params.get("publishState")).toBe("published");
	});
});
