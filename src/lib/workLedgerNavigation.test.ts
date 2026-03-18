import { describe, expect, it } from "vitest";
import {
	buildChangelogSearchParams,
	buildDashboardLedgerSearchParams,
} from "./workLedgerNavigation";

describe("workLedgerNavigation", () => {
	it("builds changelog params from dashboard filters", () => {
		const params = buildChangelogSearchParams({
			projectId: "project-1",
			query: "agent facade",
			path: "src/services/agentService.ts",
			hotspot: "agentService",
			publishState: "ready",
		});

		expect(params.get("focus")).toBe("ledger");
		expect(params.get("project")).toBe("project-1");
		expect(params.get("query")).toBe("agent facade");
		expect(params.get("path")).toBe("src/services/agentService.ts");
		expect(params.get("hotspot")).toBe("agentService");
		expect(params.get("publishState")).toBe("ready");
	});

	it("builds dashboard ledger params from changelog filters", () => {
		const params = buildDashboardLedgerSearchParams({
			projectId: "project-9",
			path: "src/components/apps/dashboard/DashboardOverviewPanel.tsx",
			publishState: "published",
		});

		expect(params.toString()).toContain("focus=ledger");
		expect(params.get("project")).toBe("project-9");
		expect(params.get("path")).toBe(
			"src/components/apps/dashboard/DashboardOverviewPanel.tsx",
		);
		expect(params.get("publishState")).toBe("published");
	});
});
