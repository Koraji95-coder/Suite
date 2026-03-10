import { beforeEach, describe, expect, it, vi } from "vitest";
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
			"Shared channel conversation",
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
			"Shared channel conversation",
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

	it("persists per-message profile attribution for shared chat history", () => {
		const conversation = agentTaskManager.createConversation("team", "Shared");
		agentTaskManager.saveConversation(conversation);

		agentTaskManager.addMessageToConversation(
			conversation.id,
			"user",
			"Hello",
			{ profileId: "draftsmith" },
		);
		agentTaskManager.addMessageToConversation(
			conversation.id,
			"assistant",
			"Acknowledged",
			{ profileId: "draftsmith" },
		);

		const stored = agentTaskManager.getConversation(conversation.id);
		expect(stored?.messages).toHaveLength(2);
		expect(stored?.messages[0]?.profileId).toBe("draftsmith");
		expect(stored?.messages[1]?.profileId).toBe("draftsmith");
	});

	it("applies transcript safety limits for message length and history size", () => {
		const conversation = agentTaskManager.createConversation("team", "Stress");
		agentTaskManager.saveConversation(conversation);

		for (let index = 0; index < 240; index += 1) {
			agentTaskManager.addMessageToConversation(
				conversation.id,
				"assistant",
				`message-${index}`,
				{ profileId: "gridsage" },
			);
		}
		const largeMessage = "x".repeat(13_500);
		agentTaskManager.addMessageToConversation(
			conversation.id,
			"assistant",
			largeMessage,
			{ profileId: "gridsage" },
		);

		const stored = agentTaskManager.getConversation(conversation.id);
		expect((stored?.messages.length || 0) <= 200).toBe(true);
		expect(stored?.messages.some((entry) => entry.profileId === "gridsage")).toBe(
			true,
		);
		expect(
			stored?.messages.some((entry) =>
				entry.content.includes("[message truncated for chat stability]"),
			),
		).toBe(true);
	});

	it("creates and reuses run-linked conversations for General threads", () => {
		const first = agentTaskManager.getOrCreateRunConversation("run-abc-123", {
			profileId: "team",
			title: "Run abc",
		});
		expect(first.runId).toBe("run-abc-123");
		expect(first.kind).toBe("run");

		agentTaskManager.addMessageToConversation(
			first.id,
			"assistant",
			"Step started",
			{
				kind: "event",
				eventType: "step_started",
				runId: "run-abc-123",
				source: "run",
			},
		);

		const second = agentTaskManager.getOrCreateRunConversation("run-abc-123", {
			profileId: "team",
		});
		expect(second.id).toBe(first.id);
		const stored = agentTaskManager.getConversation(second.id);
		expect(stored?.messages[0]?.kind).toBe("event");
		expect(stored?.messages[0]?.eventType).toBe("step_started");
		expect(stored?.messages[0]?.runId).toBe("run-abc-123");
	});

	it("recovers from localStorage quota errors with aggressive trimming", () => {
		const originalSetItem = localStorage.setItem.bind(localStorage);
		let attempts = 0;
		const setItemSpy = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation((key: string, value: string) => {
				attempts += 1;
				if (attempts === 1) {
					throw new DOMException("Quota exceeded", "QuotaExceededError");
				}
				originalSetItem(key, value);
			});

		const conversation = agentTaskManager.createConversation("team", "Quota");
		for (let index = 0; index < 240; index += 1) {
			conversation.messages.push({
				id: `msg-${index}`,
				role: "assistant",
				content: `payload-${index}-${"x".repeat(200)}`,
				timestamp: new Date().toISOString(),
			});
		}

		expect(() => agentTaskManager.saveConversation(conversation)).not.toThrow();
		const stored = agentTaskManager.getConversations();
		expect(stored.length).toBeGreaterThan(0);
		expect(stored[0]?.messages.length).toBeLessThanOrEqual(200);

		setItemSpy.mockRestore();
	});
});
