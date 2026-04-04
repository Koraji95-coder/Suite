import { describe, expect, it } from "vitest";
import {
	basenameFromPath,
	isAutoCadCollector,
	isAutoCadEvent,
	readWatchdogCollectorRuntimeState,
} from "./watchdogTelemetry";

describe("watchdogTelemetry", () => {
	it("detects autocad collectors from type and capabilities", () => {
		expect(
			isAutoCadCollector({
				collectorId: "collector-a",
				name: "AutoCAD",
				collectorType: "autocad_state",
				workstationId: "DEV-WORKSTATION",
				capabilities: [],
				metadata: {},
				status: "online",
				createdAt: 1,
				updatedAt: 1,
				lastHeartbeatAt: 1,
				lastEventAt: 1,
				eventCount: 0,
				lastSequence: 0,
			}),
		).toBe(true);
		expect(
			isAutoCadCollector({
				collectorId: "collector-b",
				name: "Hybrid",
				collectorType: "filesystem",
				workstationId: "DEV-WORKSTATION",
				capabilities: ["filesystem", "autocad"],
				metadata: {},
				status: "online",
				createdAt: 1,
				updatedAt: 1,
				lastHeartbeatAt: 1,
				lastEventAt: 1,
				eventCount: 0,
				lastSequence: 0,
			}),
		).toBe(true);
	});

	it("reads runtime collector metadata safely", () => {
		const runtime = readWatchdogCollectorRuntimeState({
			collectorId: "collector-a",
			name: "AutoCAD",
			collectorType: "autocad_state",
			workstationId: "DEV-WORKSTATION",
			capabilities: ["autocad"],
			metadata: {
				sourceAvailable: true,
				isPaused: true,
				activeDrawingPath: "C:\\Projects\\Alpha\\sheet-1.dwg",
				activeDrawingName: "sheet-1.dwg",
				currentSessionId: "session-1",
				trackerUpdatedAt: 1234,
				lastActivityAt: "5678",
				pendingCount: "2",
			},
			status: "online",
			createdAt: 1,
			updatedAt: 1,
			lastHeartbeatAt: 1,
			lastEventAt: 1,
			eventCount: 0,
			lastSequence: 0,
		});

		expect(runtime.sourceAvailable).toBe(true);
		expect(runtime.isPaused).toBe(true);
		expect(runtime.activeDrawingName).toBe("sheet-1.dwg");
		expect(runtime.currentSessionId).toBe("session-1");
		expect(runtime.trackerUpdatedAt).toBe(1234);
		expect(runtime.lastActivityAt).toBe(5678);
		expect(runtime.pendingCount).toBe(2);
	});

	it("detects autocad events and summarizes path basenames", () => {
		expect(
			isAutoCadEvent({
				eventId: 1,
				collectorId: "collector-a",
				collectorType: "autocad_state",
				workstationId: "DEV-WORKSTATION",
				eventType: "drawing_opened",
				sourceType: "autocad",
				timestamp: 1,
				metadata: {},
			}),
		).toBe(true);
		expect(basenameFromPath("C:\\Projects\\Alpha\\sheet-1.dwg")).toBe(
			"sheet-1.dwg",
		);
	});
});
