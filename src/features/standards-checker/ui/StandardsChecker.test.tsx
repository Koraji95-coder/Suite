import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StandardsChecker } from "./StandardsChecker";

const mockGetUser = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());
const mockProjectOrder = vi.hoisted(() => vi.fn());
const mockFetchIssueSet = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			getUser: mockGetUser,
			getSession: mockGetSession,
		},
		from: () => ({
			select: () => ({
				eq: () => ({
					order: mockProjectOrder,
				}),
			}),
		}),
	},
}));

vi.mock("@/features/project-workflow/issueSetService", () => ({
	projectIssueSetService: {
		fetchIssueSet: mockFetchIssueSet,
	},
}));

function jsonResponse(payload: unknown, status = 200) {
	const text = JSON.stringify(payload);
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: {
			get: (name: string) =>
				name.toLowerCase() === "content-type" ? "application/json" : null,
		},
		json: async () => payload,
		text: async () => text,
		clone() {
			return {
				headers: {
					get: (name: string) =>
						name.toLowerCase() === "content-type"
							? "application/json"
							: null,
				},
				json: async () => payload,
				text: async () => text,
			};
		},
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	mockGetUser.mockReset();
	mockGetSession.mockReset();
	mockProjectOrder.mockReset();
	mockFetchIssueSet.mockReset();
	mockFetch.mockReset();
});

describe("StandardsChecker", () => {
	it("starts with a calm package-review top band", () => {
		mockFetch.mockResolvedValue(
			jsonResponse({
				recommendedDefaults: ["jic", "nfpa"],
				count: 2,
				standards: [
					{ id: "jic", label: "JIC" },
					{ id: "nfpa", label: "NFPA" },
				],
			}),
		);
		mockGetUser.mockResolvedValue({
			data: { user: null },
			error: null,
		});
		mockGetSession.mockResolvedValue({
			data: { session: { access_token: "token-1" } },
			error: null,
		});
		mockProjectOrder.mockResolvedValue({
			data: [],
			error: null,
		});

		render(
			<MemoryRouter>
				<StandardsChecker />
			</MemoryRouter>,
		);

		expect(
			screen.getByText("Choose the project you want to clear for issue."),
		).toBeTruthy();
		expect(screen.getByText("No project selected")).toBeTruthy();
		expect(screen.getByText(/select a project/i)).toBeTruthy();
	});

	it("updates the top band after a standards run finds blockers", async () => {
		mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("/api/autocad/reference/standards")) {
				return jsonResponse({
					recommendedDefaults: ["jic", "nfpa"],
					count: 2,
					standards: [
						{ id: "jic", label: "JIC", kind: "schematic" },
						{ id: "nfpa", label: "NFPA", kind: "schematic" },
					],
				});
			}
			if (url.includes("/api/project-standards/projects/project-1/profile")) {
				return jsonResponse({
					success: true,
					message: "Project standards profile is ready.",
					data: {
						id: "profile-1",
						projectId: "project-1",
						userId: "user-1",
						cadFamilyId: "jic",
						standardsCategory: "NEC",
						selectedStandardIds: [],
						createdAt: "2026-04-03T01:00:00Z",
						updatedAt: "2026-04-03T01:00:00Z",
					},
				});
			}
			if (url.includes("/api/project-standards/projects/project-1/latest-review")) {
				return jsonResponse({
					success: true,
					message: "Project standards latest review is ready.",
					data: {
						id: "review-1",
						projectId: "project-1",
						userId: "user-1",
						requestId: "",
						recordedAt: "2026-04-03T01:00:00Z",
						cadFamilyId: "jic",
						standardsCategory: "NEC",
						selectedStandardIds: [],
						results: [],
						warnings: [],
						summary: {},
						meta: {},
						overallStatus: "warning",
					},
				});
			}
			if (url.includes("/api/project-setup/projects/project-1/profile")) {
				return jsonResponse({
					success: true,
					message: "Project setup profile is ready.",
					data: {
						id: "setup-1",
						project_id: "project-1",
						user_id: "user-1",
						block_name: "R3P-24x36BORDER&TITLE",
						project_root_path: "C:/Projects/MyProject",
						acade_project_file_path: null,
						acade_line1: "",
						acade_line2: "",
						acade_line4: "",
						signer_drawn_by: "",
						signer_checked_by: "",
						signer_engineer: "",
						created_at: "2026-04-03T01:00:00Z",
						updated_at: "2026-04-03T01:00:00Z",
					},
				});
			}
			if (url.includes("/api/project-standards/tickets")) {
				return jsonResponse({
					ok: true,
					ticket: "ticket-1",
					requestId: "native-review-1",
					action: "run-review",
					issuedAt: 1,
					expiresAt: 2,
					ttlSeconds: 180,
					projectId: "project-1",
				});
			}
			if (url.includes("http://127.0.0.1:57421/api/workstation/project-standards/run-review")) {
				return jsonResponse({
					success: true,
					message:
						"Native standards review inspected 3 drawing(s) and found follow-up items before issue.",
					requestId: "native-review-1",
					data: {
						results: [
							{
								standardId: "nec-210",
								status: "fail",
								message: "Native standards review inspected 3 drawing(s) and found follow-up items before issue.",
							},
						],
						summary: {
							drawingCount: 3,
							inspectedDrawingCount: 3,
							dwsFileCount: 0,
							suspiciousLayerCount: 2,
							openFailureCount: 0,
							providerPath: "dotnet+inproc",
						},
						dwsPaths: [],
						inspectedDrawings: ["A.dwg", "B.dwg", "C.dwg"],
						layerAlerts: ["A.dwg | BAD LAYER"],
					},
					warnings: [
						"No .dws standards files were found under the project root.",
					],
					meta: {
						providerPath: "runtime-control",
					},
				});
			}
			if (url.includes("/api/project-standards/results")) {
				return jsonResponse({
					success: true,
					message: "Project standards latest review recorded.",
					data: {
						id: "review-1",
						projectId: "project-1",
						userId: "user-1",
						requestId: "native-review-1",
						recordedAt: "2026-04-03T02:00:00Z",
						cadFamilyId: "jic",
						standardsCategory: "NEC",
						selectedStandardIds: ["nec-210"],
						results: [
							{
								standardId: "nec-210",
								status: "fail",
								message: "Native standards review inspected 3 drawing(s) and found follow-up items before issue.",
							},
						],
						warnings: [],
						summary: {},
						meta: {},
						overallStatus: "fail",
					},
				});
			}
			throw new Error(`Unexpected fetch call: ${url}`);
		});
		mockGetUser.mockResolvedValue({
			data: { user: { id: "user-1" } },
			error: null,
		});
		mockGetSession.mockResolvedValue({
			data: { session: { access_token: "token-1" } },
			error: null,
		});
		mockProjectOrder.mockResolvedValue({
			data: [{ id: "project-1", name: "MyProject" }],
			error: null,
		});
		mockFetchIssueSet.mockResolvedValue({
			data: {
				id: "issue-set-1",
				projectId: "project-1",
				name: "MyProject IFC package",
				issueTag: "IFC-01",
				status: "review",
				targetDate: "2026-03-31",
				transmittalNumber: "XMTL-001",
				transmittalDocumentName: "IFC package",
				summary: "Ready for review.",
				notes: null,
				selectedDrawingPaths: ["Issued/PROJ-00001-E0-0001 - DRAWING INDEX.dwg"],
				snapshot: {
					drawingCount: 1,
					selectedDrawingCount: 1,
					reviewItemCount: 1,
					titleBlockReviewCount: 1,
					standardsReviewCount: 0,
					unresolvedRevisionCount: 0,
					setupBlockerCount: 0,
					trackedDrawingCount: 1,
					acceptedTitleBlockCount: 0,
					waivedStandardsCount: 0,
				},
				createdAt: "2026-03-23T10:00:00.000Z",
				updatedAt: "2026-03-23T10:00:00.000Z",
				issuedAt: null,
			},
			error: null,
		});

		render(
			<MemoryRouter>
				<StandardsChecker
					preferredProjectId="project-1"
					preferredIssueSetId="issue-set-1"
				/>
			</MemoryRouter>,
		);

		await screen.findByText(
			"Project standards defaults are loaded from hosted core for this project.",
		);
		fireEvent.click(screen.getByRole("button", { name: /NEC 210/i }));
		fireEvent.click(screen.getByRole("button", { name: /run review/i }));

		expect(
			await screen.findByText(/needs follow-up before issue/i, undefined, {
				timeout: 2500,
			}),
		).toBeTruthy();
		expect(
			screen.getByRole("link", { name: /issue sets/i }).getAttribute("href"),
		).toBe("/app/projects/project-1/release?issueSet=issue-set-1");
		expect(
			screen.getByRole("link", { name: /review/i }).getAttribute("href"),
		).toBe("/app/projects/project-1/review?issueSet=issue-set-1");
	});

	it("loads and saves project standards defaults through hosted core", async () => {
		const fetchCalls: Array<{
			url: string;
			method: string;
			body?: string;
		}> = [];
		mockFetch.mockImplementation(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const method = String(init?.method || "GET").toUpperCase();
				fetchCalls.push({
					url,
					method,
					body: typeof init?.body === "string" ? init.body : undefined,
				});
				if (url.includes("/api/autocad/reference/standards")) {
					return jsonResponse({
						recommendedDefaults: ["jic", "nfpa"],
						count: 2,
				standards: [
					{ id: "jic", label: "JIC", kind: "schematic" },
					{ id: "nfpa", label: "NFPA", kind: "schematic" },
				],
					});
				}
				if (
					url.includes("/api/project-standards/projects/project-1/profile") &&
					method === "GET"
				) {
					return jsonResponse({
						success: true,
						message: "Project standards profile is ready.",
						data: {
							id: "profile-1",
							projectId: "project-1",
							userId: "user-1",
							cadFamilyId: "nfpa",
							standardsCategory: "IEEE",
							selectedStandardIds: ["ieee-80"],
							createdAt: "2026-04-03T01:00:00Z",
						updatedAt: "2026-04-03T02:00:00Z",
					},
				});
			}
			if (
				url.includes("/api/project-standards/projects/project-1/latest-review") &&
				method === "GET"
			) {
				return jsonResponse({
					success: true,
					message: "Project standards latest review is ready.",
					data: {
						id: "review-1",
						projectId: "project-1",
						userId: "user-1",
						requestId: "",
						recordedAt: "2026-04-03T01:00:00Z",
						cadFamilyId: "nfpa",
						standardsCategory: "IEEE",
						selectedStandardIds: ["ieee-80"],
						results: [
							{
								standardId: "ieee-80",
								status: "pass",
								message: "Native standards review inspected 2 drawing(s) with no obvious blockers.",
							},
						],
						warnings: [],
						summary: {
							drawingCount: 2,
							inspectedDrawingCount: 2,
						},
						meta: {},
						overallStatus: "pass",
					},
				});
			}
			if (
				url.includes("/api/project-standards/projects/project-1/profile") &&
				method === "PUT"
				) {
					return jsonResponse({
						success: true,
						message: "Project standards profile saved.",
						data: {
							id: "profile-1",
							projectId: "project-1",
							userId: "user-1",
							cadFamilyId: "jic",
							standardsCategory: "IEEE",
							selectedStandardIds: ["ieee-80", "ieee-1584"],
							createdAt: "2026-04-03T01:00:00Z",
							updatedAt: "2026-04-03T03:00:00Z",
						},
					});
				}
				throw new Error(`Unexpected fetch call: ${url}`);
			},
		);
		mockGetUser.mockResolvedValue({
			data: { user: { id: "user-1" } },
			error: null,
		});
		mockGetSession.mockResolvedValue({
			data: { session: { access_token: "token-1" } },
			error: null,
		});
		mockProjectOrder.mockResolvedValue({
			data: [{ id: "project-1", name: "MyProject" }],
			error: null,
		});
		mockFetchIssueSet.mockResolvedValue({ data: null, error: null });

		render(
			<MemoryRouter>
				<StandardsChecker />
			</MemoryRouter>,
		);

		fireEvent.change(await screen.findByLabelText("Project"), {
			target: { value: "project-1" },
		});

		const cadFamilySelect = await screen.findByLabelText("CAD family");
		expect((cadFamilySelect as HTMLSelectElement).value).toBe("nfpa");
		expect(
			await screen.findByText(
				"Project standards defaults are loaded from hosted core for this project.",
			),
		).toBeTruthy();
		expect(
			await screen.findByText(
				"Latest native standards review loaded from hosted core.",
			),
		).toBeTruthy();

		fireEvent.change(cadFamilySelect, {
			target: { value: "jic" },
		});
		fireEvent.click(screen.getByRole("button", { name: /ieee 1584/i }));
		fireEvent.click(screen.getByRole("button", { name: /save defaults/i }));

		expect(
			await screen.findByText("Project standards defaults saved to hosted core."),
		).toBeTruthy();
		const saveCall = fetchCalls.find(
			(call) =>
				call.url.includes("/api/project-standards/projects/project-1/profile") &&
				call.method === "PUT",
		);
		expect(saveCall).toBeTruthy();
		expect(JSON.parse(saveCall?.body || "{}")).toEqual({
			cadFamilyId: "jic",
			standardsCategory: "IEEE",
			selectedStandardIds: ["ieee-80", "ieee-1584"],
		});
	});
});
