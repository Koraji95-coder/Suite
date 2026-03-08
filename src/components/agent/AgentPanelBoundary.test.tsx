import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentPanelBoundary } from "./AgentPanelBoundary";

function Thrower() {
	throw new Error("panel-crash");
	return null;
}

describe("AgentPanelBoundary", () => {
	it("contains panel crashes and exposes recovery actions", () => {
		const onResetPanelCache = vi.fn();
		render(
			<AgentPanelBoundary onResetPanelCache={onResetPanelCache}>
				<Thrower />
			</AgentPanelBoundary>,
		);

		expect(screen.getByText(/Agent panel recovered mode/i)).toBeTruthy();
		expect(screen.getByText(/panel-crash/i)).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /Reset panel cache/i }));
		expect(onResetPanelCache).toHaveBeenCalledTimes(1);
	});
});
