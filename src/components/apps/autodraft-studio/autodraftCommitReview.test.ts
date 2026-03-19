import { describe, expect, it } from "vitest";
import {
	buildAutoDraftCommitReview,
} from "./autodraftCommitReview";
import type { AutoDraftAction } from "./autodraftService";

function buildAction(overrides: Partial<AutoDraftAction>): AutoDraftAction {
	return {
		id: "action-1",
		rule_id: "rule-1",
		category: "NOTE",
		action: "Add note",
		confidence: 0.95,
		status: "proposed",
		markup: { text: "General note" },
		...overrides,
	};
}

describe("autodraftCommitReview", () => {
it("marks note, title block, resolved replacement, delete, and dimension actions as commit ready", () => {
		const summary = buildAutoDraftCommitReview(
			[
				buildAction({
					id: "note-1",
					category: "NOTE",
					action: "Add grounding note",
					markup: { text: "Add grounding note" },
				}),
				buildAction({
					id: "title-1",
					category: "TITLE_BLOCK",
					action: "Update revision in title block",
					markup: { text: "Revision B" },
				}),
				buildAction({
					id: "replace-1",
					category: "ADD",
					action: "Replace feeder tag",
					replacement: {
						new_text: "TS416",
						old_text: "TS410",
						target_entity_id: "E-TS410",
						confidence: 0.99,
						status: "resolved",
						target_source: "pairing",
						candidates: [],
					},
				}),
				buildAction({
					id: "delete-1",
					category: "DELETE",
					action: "Delete obsolete tag",
					markup: {
						text: "delete old tag",
						bounds: { x: 10, y: 12, width: 30, height: 8 },
					},
				}),
				buildAction({
					id: "dimension-1",
					category: "DIMENSION",
					action: "Update dimension to 12'-0\"",
					markup: {
						text: "12'-0\"",
						bounds: { x: 40, y: 20, width: 24, height: 6 },
					},
				}),
			],
			{
				revision: "B",
				drawingNumber: "E-101",
				title: "One-line",
			},
		);

		expect(summary.readyCount).toBe(5);
		expect(summary.needsContextCount).toBe(0);
		expect(summary.reviewCount).toBe(0);
		expect(summary.items[0]?.status).toBe("ready");
		expect(summary.items.some((item) => item.target.includes("Revision: B"))).toBe(
			true,
		);
	});

	it("marks title block actions as needing context when the target value is missing", () => {
		const summary = buildAutoDraftCommitReview([
			buildAction({
				id: "title-1",
				category: "TITLE_BLOCK",
				action: "Update revision in title block",
				markup: { text: "Revision" },
			}),
		]);

		expect(summary.readyCount).toBe(0);
		expect(summary.needsContextCount).toBe(1);
		expect(summary.items[0]?.status).toBe("needs_context");
	});

	it("marks unresolved replacement and unsupported categories as review-only", () => {
		const summary = buildAutoDraftCommitReview([
			buildAction({
				id: "replace-1",
				category: "ADD",
				action: "Replace feeder tag",
				replacement: {
					new_text: "TS416",
					old_text: null,
					target_entity_id: null,
					confidence: 0.42,
					status: "ambiguous",
					target_source: "pairing",
					candidates: [],
				},
			}),
			buildAction({
				id: "delete-1",
				category: "DELETE",
				action: "Delete bus duct A3",
			}),
			buildAction({
				id: "dimension-1",
				category: "DIMENSION",
				action: "Update dimension text",
				markup: { text: "" },
			}),
		]);

		expect(summary.readyCount).toBe(0);
		expect(summary.reviewCount).toBe(3);
		expect(summary.items.every((item) => item.status === "review")).toBe(true);
	});
});
