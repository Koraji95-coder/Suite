import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AgentPairingRedirectGate from "./AgentPairingRedirectGate";

function LocationProbe() {
	const location = useLocation();
	return (
		<div data-testid="location">
			{location.pathname}
			{location.search}
			{location.hash}
		</div>
	);
}

describe("AgentPairingRedirectGate", () => {
	it("redirects pairing links on non-callback routes into the callback page", async () => {
		const { getByTestId } = render(
			<MemoryRouter
				initialEntries={[
					"/?redirect_to=%2Fagent%2Fpairing-callback%3Fagent_challenge%3Dabc777%26agent_action%3Dpair#access_token=test",
				]}
			>
				<AgentPairingRedirectGate />
				<Routes>
					<Route path="*" element={<LocationProbe />} />
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(getByTestId("location").textContent).toBe(
				"/agent/pairing-callback?agent_challenge=abc777&agent_action=pair",
			);
		});
	});

	it("does not rewrite an existing pairing callback route", async () => {
		const { getByTestId } = render(
			<MemoryRouter
				initialEntries={[
					"/agent/pairing-callback?agent_action=pair&access_token=abc#agent_challenge=xyz",
				]}
			>
				<AgentPairingRedirectGate />
				<Routes>
					<Route path="*" element={<LocationProbe />} />
				</Routes>
			</MemoryRouter>,
		);

		await waitFor(() => {
			expect(getByTestId("location").textContent).toBe(
				"/agent/pairing-callback?agent_action=pair&access_token=abc#agent_challenge=xyz",
			);
		});
	});
});
