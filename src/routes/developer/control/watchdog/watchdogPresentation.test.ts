import { describe, expect, it } from "vitest";
import type { WatchdogCollectorEvent } from "@/services/watchdogService";
import {
	formatWatchdogTechnicalLabel,
	getWatchdogTechnicalSourceLabel,
	presentWatchdogOperatorEvent,
	presentWatchdogOperatorFeed,
} from "./watchdogPresentation";

const projectNameById = new Map([["project-1", { name: "MyProject" }]]);

function createEvent(
	overrides: Partial<WatchdogCollectorEvent>,
): WatchdogCollectorEvent {
	return {
		eventId: 1,
		collectorId: "collector-cad",
		collectorType: "autocad_state",
		workstationId: "DEV-WORKSTATION",
		eventType: "command_executed",
		sourceType: "autocad",
		timestamp: Date.now(),
		projectId: "project-1",
		sessionId: "session-1",
		drawingPath: "C:/Projects/MyProject/Drawing-01.dwg",
		path: null,
		metadata: {},
		...overrides,
	};
}

describe("watchdogPresentation", () => {
	it("normalizes save commands into a saved drawing label", () => {
		const event = createEvent({
			metadata: { commandName: "QSAVE" },
		});

		expect(presentWatchdogOperatorEvent(event, projectNameById)).toMatchObject({
			label: "Saved drawing",
			detail: "Drawing-01.dwg",
			context: "MyProject • DEV-WORKSTATION",
			rawCommandName: "QSAVE",
		});
	});

	it("omits internal AutoCAD shell commands from the operator feed", () => {
		const event = createEvent({
			metadata: { commandName: "COMMANDMACROSCLOSE" },
		});

		expect(presentWatchdogOperatorEvent(event, projectNameById)).toBeNull();
	});

	it("drops non-drawing filesystem changes from the operator feed", () => {
		const event = createEvent({
			eventId: 2,
			eventType: "modified",
			sourceType: "filesystem",
			path: "C:/Projects/MyProject/Submittals/index.xlsx",
			drawingPath: null,
			metadata: {},
		});

		expect(presentWatchdogOperatorEvent(event, projectNameById)).toBeNull();
	});

	it("builds a filtered operator feed and preserves technical labels", () => {
		const events = [
			createEvent({
				eventId: 3,
				eventType: "drawing_opened",
				metadata: {},
			}),
			createEvent({
				eventId: 4,
				metadata: { commandName: "COMMANDMACROSCLOSE" },
			}),
			createEvent({
				eventId: 5,
				metadata: { commandName: "QSAVE" },
			}),
		];

		const feed = presentWatchdogOperatorFeed(events, projectNameById);

		expect(feed.map((event) => event.label)).toEqual([
			"Opened drawing",
			"Saved drawing",
		]);
		expect(
			formatWatchdogTechnicalLabel(
				createEvent({
					metadata: { commandName: "QSAVE" },
				}),
			),
		).toBe("CAD command • QSAVE");
		expect(
			getWatchdogTechnicalSourceLabel(
				createEvent({
					eventType: "modified",
					sourceType: "filesystem",
					collectorType: "filesystem",
				}),
			),
		).toBe("Filesystem");
	});
});
