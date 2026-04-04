import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAutodeskStandardsReferenceSummary } from "./referenceCatalogService";

const mockFetch = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);
vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			getSession: getSessionMock,
		},
	},
}));

afterEach(() => {
	mockFetch.mockReset();
	getSessionMock.mockReset();
});

describe("fetchAutodeskStandardsReferenceSummary", () => {
	it("normalizes standards family payloads from the backend", async () => {
		getSessionMock.mockResolvedValue({
			data: { session: { access_token: "token-123" } },
			error: null,
		});
		mockFetch.mockResolvedValue({
			ok: true,
			json: async () => ({
				requestId: "req-123",
				recommendedDefaults: ["jic", "nfpa"],
				count: 2,
				standards: [
					{
						id: "jic",
						label: "JIC",
						kind: "schematic",
						menuCount: 1,
						totalEntryCount: 555,
						topCategories: ["Push Buttons", "PLC I/O"],
						fileNames: ["ACE_JIC_MENU.DAT"],
						includesLegacy: false,
					},
					{
						id: "nfpa",
						label: "NFPA",
						kind: "schematic",
						menuCount: 1,
						totalEntryCount: 559,
						topCategories: ["Relays"],
						fileNames: ["ACE_NFPA_MENU.DAT"],
						includesLegacy: false,
					},
				],
			}),
		});

		const result = await fetchAutodeskStandardsReferenceSummary();

		expect(result.requestId).toBe("req-123");
		expect(result.recommendedDefaults).toEqual(["jic", "nfpa"]);
		expect(result.count).toBe(2);
		expect(result.standards.map((family) => family.label)).toEqual([
			"JIC",
			"NFPA",
		]);
		expect(mockFetch).toHaveBeenCalledWith(
			"/api/autocad/reference/standards",
			expect.objectContaining({
				headers: expect.objectContaining({
					Accept: "application/json",
					Authorization: "Bearer token-123",
				}),
			}),
		);
	});

	it("throws on non-ok responses", async () => {
		getSessionMock.mockResolvedValue({
			data: { session: { access_token: "token-123" } },
			error: null,
		});
		mockFetch.mockResolvedValue({
			ok: false,
			status: 503,
			headers: {
				get: () => null,
			},
			clone: () => ({
				json: async () => null,
				text: async () => "",
			}),
		});

		await expect(fetchAutodeskStandardsReferenceSummary()).rejects.toThrow(
			"Autodesk standards reference request failed with 503.",
		);
	});
});
