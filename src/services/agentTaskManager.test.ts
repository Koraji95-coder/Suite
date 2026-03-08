import { beforeEach, describe, expect, it } from "vitest";
import { agentTaskManager } from "./agentTaskManager";

describe("agentTaskManager conversation scope", () => {
	beforeEach(() => {
		localStorage.clear();
		agentTaskManager.setScope("test-user");
		agentTaskManager.setConversationScope("team");
	});

	it("keeps team and profile conversations isolated", () => {
		const teamConversation = agentTaskManager.createConversation(
			"team",
			"Team Home conversation",
		);
		agentTaskManager.saveConversation(teamConversation);
		expect(agentTaskManager.getConversations()).toHaveLength(1);

		agentTaskManager.setConversationScope("devstral");
		expect(agentTaskManager.getConversations()).toHaveLength(0);

		const profileConversation = agentTaskManager.createConversation(
			"devstral",
			"Devstral conversation",
		);
		agentTaskManager.saveConversation(profileConversation);
		expect(agentTaskManager.getConversations()).toHaveLength(1);

		agentTaskManager.setConversationScope("team");
		expect(agentTaskManager.getConversations()).toHaveLength(1);
		expect(agentTaskManager.getConversations()[0]?.title).toBe(
			"Team Home conversation",
		);
	});

	it("supports legacy setProfileScope alias", () => {
		agentTaskManager.setProfileScope("sentinel");
		const conversation = agentTaskManager.createConversation(
			"sentinel",
			"Sentinel conversation",
		);
		agentTaskManager.saveConversation(conversation);
		expect(agentTaskManager.getConversations()).toHaveLength(1);

		agentTaskManager.setConversationScope("team");
		expect(agentTaskManager.getConversations()).toHaveLength(0);
	});

	it("sanitizes malformed stored conversations and self-heals storage", () => {
		localStorage.setItem(
			"agent-conversations:test-user:team",
			JSON.stringify([
				{
					id: 123,
					title: "",
					messages: [{ role: "bad-role", content: "nope" }],
				},
			]),
		);

		const conversations = agentTaskManager.getConversations();
		expect(conversations).toHaveLength(1);
		expect(conversations[0]?.id).toBe("123");
		expect(conversations[0]?.title).toBe("New conversation");
		expect(conversations[0]?.messages).toHaveLength(0);

		const repaired = JSON.parse(
			localStorage.getItem("agent-conversations:test-user:team") || "[]",
		);
		expect(Array.isArray(repaired)).toBe(true);
		expect(repaired[0]?.id).toBe("123");
		expect(Array.isArray(repaired[0]?.messages)).toBe(true);
	});

	it("clears all conversation keys for the current user scope", () => {
		agentTaskManager.setConversationScope("team");
		agentTaskManager.saveConversation(
			agentTaskManager.createConversation("team", "Team"),
		);
		agentTaskManager.setConversationScope("devstral");
		agentTaskManager.saveConversation(
			agentTaskManager.createConversation("devstral", "Dev"),
		);
		expect(
			Object.keys(localStorage).some((key) =>
				key.startsWith("agent-conversations:test-user:"),
			),
		).toBe(true);

		agentTaskManager.clearConversationCacheForCurrentScope();
		expect(
			Object.keys(localStorage).some((key) =>
				key.startsWith("agent-conversations:test-user:"),
			),
		).toBe(false);
	});
});
