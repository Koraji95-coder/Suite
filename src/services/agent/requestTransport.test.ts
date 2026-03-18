import { describe, expect, it } from "vitest";
import {
	formatAgentGatewayFailureMessage,
	parseDirectStreamPayloadEvent,
} from "./requestTransport";

describe("formatAgentGatewayFailureMessage", () => {
	it("rewrites opaque provider failures into actionable guidance", () => {
		expect(
			formatAgentGatewayFailureMessage(500, "LLM request failed: upstream"),
		).toBe(
			"Agent model request failed in the gateway. Try another agent/profile or restart the gateway/provider runtime.",
		);
	});

	it("keeps specific non-generic messages intact", () => {
		expect(formatAgentGatewayFailureMessage(400, "Invalid task payload")).toBe(
			"Invalid task payload",
		);
	});
});

describe("parseDirectStreamPayloadEvent", () => {
	it("parses JSON SSE deltas with model metadata", () => {
		expect(
			parseDirectStreamPayloadEvent(
				'{"delta":"hello","model":"forge","error":""}',
			),
		).toEqual({
			done: false,
			delta: "hello",
			model: "forge",
			error: "",
		});
	});

	it("marks done events", () => {
		expect(parseDirectStreamPayloadEvent("[DONE]")).toEqual({
			done: true,
			delta: "",
			model: "",
			error: "",
		});
	});

	it("falls back to raw text for non-json payloads", () => {
		expect(parseDirectStreamPayloadEvent("partial text")).toEqual({
			done: false,
			delta: "partial text",
			model: "",
			error: "",
		});
	});
});
