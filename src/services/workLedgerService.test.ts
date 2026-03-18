import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildWorktalePublishPayload,
	workLedgerService,
} from "./workLedgerService";

const mockGetUser = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn());
const mockChannelSubscribe = vi.hoisted(() => vi.fn());
const mockChannelOn = vi.hoisted(() => vi.fn());
const mockSafeSupabaseQuery = vi.hoisted(() => vi.fn());

vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			getUser: mockGetUser,
		},
		channel: vi.fn(() => ({
			on: mockChannelOn.mockReturnThis(),
			subscribe: mockChannelSubscribe,
		})),
		removeChannel: mockRemoveChannel,
	},
}));

vi.mock("@/supabase/utils", () => ({
	isSupabaseConfigured: () => false,
	safeSupabaseQuery: mockSafeSupabaseQuery,
}));

describe("workLedgerService", () => {
	beforeEach(() => {
		localStorage.clear();
		mockGetUser.mockResolvedValue({
			data: { user: null },
			error: new Error("missing-user"),
		});
		mockSafeSupabaseQuery.mockReset();
	});

	afterEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	it("creates, filters, and updates local work ledger entries when no Supabase user is available", async () => {
		const created = await workLedgerService.createEntry({
			title: "Ground grid controller split",
			summary: "Moved placement and history logic behind focused controllers.",
			sourceKind: "git_checkpoint",
			commitRefs: ["abc123"],
			projectId: "project-1",
			appArea: "ground-grid-generator",
			architecturePaths: ["src/components/apps/ground-grid-generator/useGridGeneratorState.ts"],
			hotspotIds: ["ground-grid-generator/useGridGeneratorState.ts"],
			publishState: "draft",
		});

		expect(created).not.toBeNull();
		expect(created?.publish_state).toBe("draft");

		const filtered = await workLedgerService.fetchEntries({
			projectId: "project-1",
			pathQuery: "ground-grid-generator",
			publishState: "draft",
			search: "placement",
			limit: 10,
		});

		expect(filtered.error).toBeNull();
		expect(filtered.data).toHaveLength(1);
		expect(filtered.data[0]?.title).toBe("Ground grid controller split");

		const updated = await workLedgerService.updateEntry(created?.id ?? "", {
			publishState: "ready",
			externalReference: "worktale draft",
		});

		expect(updated).not.toBeNull();
		expect(updated?.publish_state).toBe("ready");
		expect(updated?.external_reference).toBe("worktale draft");

		const readyEntries = await workLedgerService.fetchEntries({
			publishState: "ready",
			limit: 10,
		});
		expect(readyEntries.data).toHaveLength(1);
		expect(readyEntries.data[0]?.publish_state).toBe("ready");
	});

	it("builds a Worktale-ready payload from a work ledger entry", () => {
		const payload = buildWorktalePublishPayload({
			id: "ledger-1",
			title: "Agent service split checkpoint",
			summary: "Separated orchestration, pairing, and catalog flows behind the stable facade.",
			source_kind: "git_checkpoint",
			commit_refs: ["efc4560", "abc1234"],
			project_id: "project-1",
			app_area: "agent",
			architecture_paths: ["src/services/agentService.ts"],
			hotspot_ids: ["agentService"],
			publish_state: "ready",
			external_reference: "worktale draft",
			external_url: null,
			user_id: "local",
			created_at: "2026-03-18T00:00:00.000Z",
			updated_at: "2026-03-18T01:00:00.000Z",
		});

		expect(payload.title).toBe("Agent service split checkpoint");
		expect(payload.markdown).toContain("# Agent service split checkpoint");
		expect(payload.markdown).toContain("- Source: git_checkpoint");
		expect(payload.markdown).toContain("- Paths: src/services/agentService.ts");
		expect(payload.json).toMatchObject({
			id: "ledger-1",
			sourceKind: "git_checkpoint",
			publishState: "ready",
			appArea: "agent",
		});
	});
});
