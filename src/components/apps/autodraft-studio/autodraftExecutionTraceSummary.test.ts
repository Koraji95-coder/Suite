import { describe, expect, it } from "vitest";
import {
	buildAutoDraftExecutionIssueSummary,
	buildAutoDraftRevisionTraceNotes,
	summarizeAutoDraftExecution,
} from "./autodraftExecutionTraceSummary";
import type { AutoDraftExecuteResponse } from "./autodraftService";

function buildResponse(): AutoDraftExecuteResponse {
	return {
		ok: true,
		source: "dotnet-bridge",
		job_id: "job-1",
		status: "partially-committed",
		accepted: 2,
		skipped: 1,
		dry_run: false,
		message: "Commit completed in 'E-101.dwg'. 2 action(s) were written; 1 skipped.",
		requestId: "req-1",
		meta: {
			requestId: "req-1",
			providerPath: "bridge",
			cad: {
				drawingName: "E-101.dwg",
				drawingPath: "C:/drawings/E-101.dwg",
				activeLayout: "Sheet-1",
				activeSpace: "paper",
				readOnly: false,
				commandMask: 0,
				layoutCount: 3,
				blockCount: 42,
				layerCount: 12,
				modelSpaceCount: 64,
				paperSpaceCount: 21,
			},
			executionReceipt: {
				id: "receipt-1",
				requestId: "req-1",
				jobId: "job-1",
				providerPath: "bridge",
				dryRun: false,
				accepted: 2,
				skipped: 1,
				createdHandles: ["AB12", "CD34"],
				titleBlockUpdates: [{ attributeTag: "REV" }],
				textReplacementUpdates: [{ targetEntityId: "42" }],
				textDeleteUpdates: [{ targetEntityId: "99" }],
				dimensionTextUpdates: [{ targetEntityId: "77" }],
			},
		},
	};
}

describe("autodraftExecutionTraceSummary", () => {
	it("summarizes receipt counts and cad context", () => {
		const summary = summarizeAutoDraftExecution(buildResponse());
		expect(summary).not.toBeNull();
		expect(summary?.counts.createdHandles).toBe(2);
		expect(summary?.counts.titleBlockUpdates).toBe(1);
		expect(summary?.counts.textReplacementUpdates).toBe(1);
		expect(summary?.counts.textDeleteUpdates).toBe(1);
		expect(summary?.counts.dimensionTextUpdates).toBe(1);
		expect(summary?.cad.drawingName).toBe("E-101.dwg");
		expect(summary?.cad.activeLayout).toBe("Sheet-1");
		expect(summary?.cad.layoutCount).toBe(3);
		expect(summary?.cad.blockCount).toBe(42);
	});

	it("builds revision notes with receipt and workflow details", () => {
		const notes = buildAutoDraftRevisionTraceNotes({
			response: buildResponse(),
			workflowContext: {
				projectId: "project-1",
				lane: "autodraft-studio",
				phase: "commit",
			},
			revisionContext: {
				projectId: "project-1",
				revision: "B",
				notes: "Reviewed with PM context.",
			},
		});
		expect(notes).toContain("Reviewed with PM context.");
		expect(notes).toContain("Status: partially-committed");
		expect(notes).toContain("Title block updates: 1");
		expect(notes).toContain("Text replacement updates: 1");
		expect(notes).toContain("Text deletions: 1");
		expect(notes).toContain("Dimension text updates: 1");
		expect(notes).toContain("Workflow lane: autodraft-studio");
	});

	it("builds a compact issue summary from receipt counts", () => {
		const summary = buildAutoDraftExecutionIssueSummary(buildResponse());
		expect(summary).toContain("AutoDraft commit:");
		expect(summary).toContain("1 title block update(s)");
		expect(summary).toContain("1 text replacement update(s)");
		expect(summary).toContain("1 text deletion(s)");
		expect(summary).toContain("1 dimension update(s)");
	});
});
