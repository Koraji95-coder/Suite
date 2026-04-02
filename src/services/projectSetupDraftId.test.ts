import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock, fromMock, safeSupabaseQueryMock } = vi.hoisted(() => ({
	getUserMock: vi.fn(),
	fromMock: vi.fn(),
	safeSupabaseQueryMock: vi.fn(async (queryFn: () => Promise<unknown>) => {
		return await queryFn();
	}),
}));

vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			getUser: getUserMock,
		},
		from: fromMock,
	},
}));

vi.mock("@/supabase/utils", () => ({
	safeSupabaseQuery: safeSupabaseQueryMock,
}));

import { projectRevisionRegisterService } from "./projectRevisionRegisterService";
import { projectTitleBlockProfileService } from "./projectTitleBlockProfileService";

describe("draft project setup ids", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		getUserMock.mockResolvedValue({
			data: { user: { id: "user-1" } },
			error: null,
		});
	});

	it("keeps title block profile lookup local for non-UUID draft project ids", async () => {
		const result = await projectTitleBlockProfileService.fetchProfile(
			"project-setup-3b8653e8-1713-46b4-8c7b-99573cb55623",
			{
				projectRootPath: "C:/Projects/SuiteTest",
			},
		);

		expect(fromMock).not.toHaveBeenCalled();
		expect(result.error).toBeNull();
		expect(result.data.project_id).toBe(
			"project-setup-3b8653e8-1713-46b4-8c7b-99573cb55623",
		);
		expect(result.data.project_root_path).toBe("C:/Projects/SuiteTest");
	});

	it("keeps revision register lookup local for non-UUID draft project ids", async () => {
		const result = await projectRevisionRegisterService.fetchEntries(
			"project-setup-3b8653e8-1713-46b4-8c7b-99573cb55623",
		);

		expect(fromMock).not.toHaveBeenCalled();
		expect(result.error).toBeNull();
		expect(result.data).toEqual([]);
	});
});
