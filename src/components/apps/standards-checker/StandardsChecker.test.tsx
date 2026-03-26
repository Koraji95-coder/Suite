import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StandardsChecker } from "./StandardsChecker";

const mockGetUser = vi.hoisted(() => vi.fn());
const mockProjectOrder = vi.hoisted(() => vi.fn());
const mockFetchIssueSet = vi.hoisted(() => vi.fn());

vi.mock("@/supabase/client", () => ({
	supabase: {
		auth: {
			getUser: mockGetUser,
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

vi.mock("@/services/projectIssueSetService", () => ({
	projectIssueSetService: {
		fetchIssueSet: mockFetchIssueSet,
	},
}));

afterEach(() => {
	vi.restoreAllMocks();
	mockGetUser.mockReset();
	mockProjectOrder.mockReset();
	mockFetchIssueSet.mockReset();
});

describe("StandardsChecker", () => {
	it("starts with a calm package-review top band", () => {
		mockGetUser.mockResolvedValue({
			data: { user: null },
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
		vi.spyOn(Math, "random").mockReturnValue(0.95);
		mockGetUser.mockResolvedValue({
			data: { user: { id: "user-1" } },
			error: null,
		});
		mockProjectOrder.mockResolvedValue({
			data: [{ id: "project-1", name: "Nanulak" }],
			error: null,
		});
		mockFetchIssueSet.mockResolvedValue({
			data: {
				id: "issue-set-1",
				projectId: "project-1",
				name: "Nanulak IFC package",
				issueTag: "IFC-01",
				status: "review",
				targetDate: "2026-03-31",
				transmittalNumber: "XMTL-001",
				transmittalDocumentName: "IFC package",
				summary: "Ready for review.",
				notes: null,
				selectedDrawingPaths: ["Issued/R3P-25074-E0-0001 - DRAWING INDEX.dwg"],
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

		fireEvent.change(await screen.findByLabelText("Project"), {
			target: { value: "project-1" },
		});
		fireEvent.click(screen.getByRole("button", { name: /NEC 210/i }));
		fireEvent.click(
			screen.getByRole("button", { name: /run review/i }),
		);

		expect(
			await screen.findByText(/needs follow-up before issue/i, undefined, {
				timeout: 2500,
			}),
		).toBeTruthy();
		expect(
			screen.getByRole("link", { name: /issue sets/i }).getAttribute("href"),
		).toBe("/app/projects/project-1?view=issue-sets&issueSet=issue-set-1");
		expect(
			screen.getByRole("link", { name: /review/i }).getAttribute("href"),
		).toBe("/app/projects/project-1?view=review&issueSet=issue-set-1");
	});
});
