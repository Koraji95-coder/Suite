import { describe, expect, it } from "vitest";
import { normalizeTitleBlockWorkflowWarnings } from "./workflowMessages";

describe("projectSetup workflowMessages", () => {
	it("normalizes AutoCAD bridge fallback warnings into customer-safe copy", () => {
		expect(
			normalizeTitleBlockWorkflowWarnings([
				"AutoCAD scan bridge unavailable; using filename-only fallback for DWG metadata. Named pipe '\\\\.\\pipe\\SUITE_AUTOCAD_PIPE' not found.",
			]),
		).toEqual([
			"Live drawing metadata is not connected right now, so Suite is pairing drawing rows by filename until the DWG bridge is available.",
		]);
	});

	it("suppresses hosted title block profile schema drift warnings", () => {
		expect(
			normalizeTitleBlockWorkflowWarnings([
				"Supabase schema is missing `project_title_block_profiles`. Apply the latest consolidated migration to enable hosted title block profiles.",
			]),
		).toEqual([]);
	});

	it("keeps distinct actionable warnings after normalization", () => {
		expect(
			normalizeTitleBlockWorkflowWarnings([
				"AutoCAD bridge is not configured; using filename-only fallback for DWG metadata.",
				"Supabase schema is missing `drawing_revision_register_entries`. Apply the latest consolidated migration to enable hosted revision register storage.",
			]),
		).toEqual([
			"Live drawing metadata is not connected right now, so Suite is pairing drawing rows by filename until the DWG bridge is available.",
			"Hosted revision history is unavailable right now, so Suite is using local revision data where available.",
		]);
	});
});
