import { describe, expect, it } from "vitest";
import { normalizeAgentResponseText } from "./agentResponseNormalizer";

describe("agentResponseNormalizer", () => {
	it("normalizes identity tool-call payloads into readable text", () => {
		const raw =
			'<tool_call name="identity_set" args="{&quot;name&quot;: &quot;Dustin&quot;}"></tool_call>';
		expect(normalizeAgentResponseText(raw)).toBe("Saved your name as Dustin.");
	});

	it("normalizes generic tool-call payloads", () => {
		const raw =
			'<tool_call name="update_task" args="{&quot;id&quot;:&quot;task-1&quot;,&quot;status&quot;:&quot;done&quot;}"></tool_call>';
		expect(normalizeAgentResponseText(raw)).toBe(
			"Tool call: update_task (id: task-1, status: done).",
		);
	});

	it("normalizes nested json responses", () => {
		const raw = JSON.stringify({
			model: "devstral-small-2:latest",
			response:
				'<tool_call name="identity_set" args="{&quot;name&quot;:&quot;Dustin&quot;}"></tool_call>',
		});
		expect(normalizeAgentResponseText(raw)).toBe("Saved your name as Dustin.");
	});
});

