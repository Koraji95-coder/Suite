import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentChatMessages } from "./AgentChatMessages";

describe("AgentChatMessages", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
			configurable: true,
			value: vi.fn(),
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("stops assistant speaking state shortly after a non-thinking reply", async () => {
		const { container } = render(
			<AgentChatMessages
				messages={[
					{
						id: "assistant-1",
						role: "assistant",
						content: "Reply complete.",
						timestamp: new Date().toISOString(),
					},
				]}
				profileId="koro"
				isThinking={false}
			/>,
		);

		expect(container.querySelector("[data-agent-state='speaking']")).not.toBeNull();

		await act(async () => {
			vi.advanceTimersByTime(1_500);
		});

		expect(container.querySelector("[data-agent-state='speaking']")).toBeNull();
		expect(container.querySelector("[data-agent-state='idle']")).not.toBeNull();
	});

	it("does not show thinking indicator after an assistant reply is already present", () => {
		render(
			<AgentChatMessages
				messages={[
					{
						id: "user-1",
						role: "user",
						content: "Run the check.",
						timestamp: new Date().toISOString(),
					},
					{
						id: "assistant-1",
						role: "assistant",
						content: "Done.",
						timestamp: new Date().toISOString(),
					},
				]}
				profileId="koro"
				isThinking
			/>,
		);

		expect(screen.queryByText("Thinking...")).toBeNull();
	});

	it("shows thinking indicator while waiting on an assistant reply", () => {
		render(
			<AgentChatMessages
				messages={[
					{
						id: "user-1",
						role: "user",
						content: "Review this diff.",
						timestamp: new Date().toISOString(),
					},
				]}
				profileId="koro"
				isThinking
			/>,
		);

		expect(screen.getByText("Thinking...")).toBeTruthy();
	});
});
