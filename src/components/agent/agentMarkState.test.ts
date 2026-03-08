import { describe, expect, it } from "vitest";
import {
	mapLegacyMarkState,
	resolveAgentMarkState,
} from "./agentMarkState";

describe("resolveAgentMarkState", () => {
	it.each([
		{
			name: "error wins over all states",
			input: {
				error: true,
				waiting: true,
				running: true,
				speaking: true,
				thinking: true,
				warning: true,
				success: true,
				focus: true,
			},
			expected: "error",
		},
		{
			name: "waiting wins over running",
			input: { waiting: true, running: true, focus: true },
			expected: "waiting",
		},
		{
			name: "running wins over speaking",
			input: { running: true, speaking: true, thinking: true },
			expected: "running",
		},
		{
			name: "speaking wins over thinking",
			input: { speaking: true, thinking: true, warning: true },
			expected: "speaking",
		},
		{
			name: "thinking wins over warning",
			input: { thinking: true, warning: true, success: true },
			expected: "thinking",
		},
		{
			name: "warning wins over success",
			input: { warning: true, success: true, focus: true },
			expected: "warning",
		},
		{
			name: "success wins over focus",
			input: { success: true, focus: true },
			expected: "success",
		},
		{
			name: "focus wins over idle",
			input: { focus: true },
			expected: "focus",
		},
		{
			name: "falls back to idle",
			input: {},
			expected: "idle",
		},
	])("$name", ({ input, expected }) => {
		expect(resolveAgentMarkState(input)).toBe(expected);
	});
});

describe("mapLegacyMarkState", () => {
	it("maps active expression to thinking", () => {
		expect(
			mapLegacyMarkState({
				expression: "active",
			}),
		).toBe("thinking");
	});

	it("maps pulse to speaking", () => {
		expect(
			mapLegacyMarkState({
				expression: "neutral",
				pulse: true,
			}),
		).toBe("speaking");
	});

	it("maps focus + breathe to focus", () => {
		expect(
			mapLegacyMarkState({
				expression: "focus",
				breathe: true,
			}),
		).toBe("focus");
	});
});
