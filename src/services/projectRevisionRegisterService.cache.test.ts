import { beforeEach, describe, expect, it, vi } from "vitest";

const { safeSupabaseQueryMock, getUserMock } = vi.hoisted(() => {
	const nextRemoteRows = [
		{
			id: "entry-1",
			project_id: "11111111-1111-4111-8111-111111111111",
			file_id: null,
			drawing_number: "DWG-001",
			title: "One Line Diagram",
			revision: "A",
			previous_revision: null,
			revision_description: "",
			revision_by: "",
			revision_checked_by: "",
			revision_date: null,
			revision_sort_order: 0,
			issue_summary: "Imported",
			issue_status: "open",
			issue_severity: "medium",
			source_kind: "manual",
			source_ref: null,
			autodraft_request_id: null,
			transmittal_number: null,
			transmittal_document_name: null,
			notes: null,
			user_id: "user-1",
			created_at: "2026-04-02T00:00:00.000Z",
			updated_at: "2026-04-02T00:00:00.000Z",
		},
	];
	return {
		safeSupabaseQueryMock: vi.fn(async () => ({
			data: nextRemoteRows,
			error: null,
		})),
		getUserMock: vi.fn(async () => ({
			data: { user: { id: "user-1" } },
			error: null,
		})),
	};
});

vi.mock("@/supabase/utils", () => ({
	safeSupabaseQuery: safeSupabaseQueryMock,
}));

vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			getUser: getUserMock,
		},
	},
}));

import { projectRevisionRegisterService } from "@/services/projectRevisionRegisterService";

describe("projectRevisionRegisterService cache", () => {
	beforeEach(() => {
		safeSupabaseQueryMock.mockClear();
		getUserMock.mockClear();
		if (
			typeof window !== "undefined" &&
			window.localStorage &&
			typeof window.localStorage.clear === "function"
		) {
			window.localStorage.clear();
		}
	});

	it("dedupes concurrent remote fetches for the same project", async () => {
		const projectId = "11111111-1111-4111-8111-111111111111";

		const [first, second] = await Promise.all([
			projectRevisionRegisterService.fetchEntries(projectId),
			projectRevisionRegisterService.fetchEntries(projectId),
		]);

		expect(first.error).toBeNull();
		expect(second.data).toHaveLength(1);
		expect(safeSupabaseQueryMock).toHaveBeenCalledTimes(1);

		const third = await projectRevisionRegisterService.fetchEntries(projectId);
		expect(third.data[0]?.drawing_number).toBe("DWG-001");
		expect(safeSupabaseQueryMock).toHaveBeenCalledTimes(1);
	});

	it("bulk-loads revision entries for multiple projects in a single query", async () => {
		safeSupabaseQueryMock.mockResolvedValueOnce({
			data: [
				{
					id: "entry-1",
					project_id: "11111111-1111-4111-8111-111111111111",
					file_id: null,
					drawing_number: "DWG-001",
					title: "One Line Diagram",
					revision: "A",
					previous_revision: null,
					revision_description: "",
					revision_by: "",
					revision_checked_by: "",
					revision_date: null,
					revision_sort_order: 0,
					issue_summary: "Imported",
					issue_status: "open",
					issue_severity: "medium",
					source_kind: "manual",
					source_ref: null,
					autodraft_request_id: null,
					transmittal_number: null,
					transmittal_document_name: null,
					notes: null,
					user_id: "user-1",
					created_at: "2026-04-02T00:00:00.000Z",
					updated_at: "2026-04-02T00:00:00.000Z",
				},
				{
					id: "entry-2",
					project_id: "22222222-2222-4222-8222-222222222222",
					file_id: null,
					drawing_number: "DWG-002",
					title: "Power Plan",
					revision: "B",
					previous_revision: null,
					revision_description: "",
					revision_by: "",
					revision_checked_by: "",
					revision_date: null,
					revision_sort_order: 0,
					issue_summary: "Imported",
					issue_status: "open",
					issue_severity: "medium",
					source_kind: "manual",
					source_ref: null,
					autodraft_request_id: null,
					transmittal_number: null,
					transmittal_document_name: null,
					notes: null,
					user_id: "user-1",
					created_at: "2026-04-02T00:00:00.000Z",
					updated_at: "2026-04-02T00:00:00.000Z",
				},
			],
			error: null,
		});

		const results = await projectRevisionRegisterService.fetchEntriesForProjects([
			"11111111-1111-4111-8111-111111111111",
			"22222222-2222-4222-8222-222222222222",
		]);

		expect(safeSupabaseQueryMock).toHaveBeenCalledTimes(1);
		expect(
			results.get("11111111-1111-4111-8111-111111111111")?.data[0]
				?.drawing_number,
		).toBe("DWG-001");
		expect(
			results.get("22222222-2222-4222-8222-222222222222")?.data[0]
				?.drawing_number,
		).toBe("DWG-002");

		safeSupabaseQueryMock.mockClear();
		await projectRevisionRegisterService.fetchEntriesForProjects([
			"11111111-1111-4111-8111-111111111111",
			"22222222-2222-4222-8222-222222222222",
		]);
		expect(safeSupabaseQueryMock).not.toHaveBeenCalled();
	});
});
