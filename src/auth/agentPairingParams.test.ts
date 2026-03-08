import {
	buildAgentPairingSearchFromLocation,
	extractAgentPairingParamsFromLocation,
} from "@/auth/agentPairingParams";
import { describe, expect, it } from "vitest";

describe("agentPairingParams", () => {
	it("extracts pairing params from query string first", () => {
		const result = extractAgentPairingParamsFromLocation(
			"?agent_challenge=abc123&agent_action=pair",
			"#agent_challenge=other&agent_action=unpair",
		);
		expect(result).toEqual({
			challengeId: "abc123",
			action: "pair",
		});
	});

	it("extracts pairing params from hash when query is missing", () => {
		const result = extractAgentPairingParamsFromLocation(
			"",
			"#agent_challenge=abc999&agent_action=unpair",
		);
		expect(result).toEqual({
			challengeId: "abc999",
			action: "unpair",
		});
	});

	it("returns canonical pairing search when params are valid", () => {
		const result = buildAgentPairingSearchFromLocation(
			"",
			"#agent_challenge=abc999&agent_action=unpair",
		);
		expect(result).toBe("?agent_challenge=abc999&agent_action=unpair");
	});

	it("returns empty search when pairing params are incomplete", () => {
		const result = buildAgentPairingSearchFromLocation(
			"?agent_challenge=abc123",
			"",
		);
		expect(result).toBe("");
	});

	it("extracts pairing params from nested redirect_to payloads", () => {
		const result = extractAgentPairingParamsFromLocation(
			"?redirect_to=%2Fagent%2Fpairing-callback%3Fagent_challenge%3Dabc777%26agent_action%3Dpair",
			"#access_token=test",
		);
		expect(result).toEqual({
			challengeId: "abc777",
			action: "pair",
		});
	});

	it("extracts pairing params from hash route-style callbacks", () => {
		const result = extractAgentPairingParamsFromLocation(
			"",
			"#/login?agent_action=unpair&agent_challenge=abc888",
		);
		expect(result).toEqual({
			challengeId: "abc888",
			action: "unpair",
		});
	});
});
