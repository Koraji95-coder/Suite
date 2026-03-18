import { describe, expect, it } from "vitest";
import { parseRunEventBlock } from "./orchestration";

describe("parseRunEventBlock", () => {
	it("parses orchestration SSE payloads into stable event records", () => {
		const event = parseRunEventBlock(
			[
				"id: 14",
				"event: run.message",
				'data: {"id":14,"eventType":"stage_message","runId":"run-1","stage":"analysis","profileId":"koro","requestId":"req-1","message":"hello","payload":{"step":"one"},"createdAt":"2026-03-18T01:00:00.000Z"}',
				"",
			].join("\n"),
		);

		expect(event).toEqual({
			id: 14,
			eventType: "stage_message",
			runId: "run-1",
			stage: "analysis",
			profileId: "koro",
			requestId: "req-1",
			message: "hello",
			payload: { step: "one" },
			createdAt: "2026-03-18T01:00:00.000Z",
		});
	});

	it("returns null for empty SSE blocks", () => {
		expect(parseRunEventBlock("event: ping\n")).toBeNull();
	});
});
