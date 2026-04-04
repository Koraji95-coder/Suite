import { basenameFromPath } from "@/lib/watchdogTelemetry";
import type { WatchdogCollectorEvent } from "@/services/watchdogService";

export type WatchdogEventPresentationTone =
	| "ready"
	| "background"
	| "needs-attention"
	| "unavailable";

export interface PresentedWatchdogEvent {
	eventId: number;
	label: string;
	detail: string;
	context: string;
	timestamp: number;
	tone: WatchdogEventPresentationTone;
	eventType: string;
	rawCommandName: string | null;
	targetPath: string | null;
	targetKey: string | null;
}

const HIDDEN_COMMANDS = new Set([
	"COMMANDLINE",
	"COMMANDMACROSCLOSE",
	"LOGINITIALWORKSPACEESW",
	"RIBBON",
]);

const SAVE_COMMANDS = new Set(["QSAVE", "SAVE", "SAVEALL", "SAVEAS"]);
const DRAWING_TARGET_EXTENSIONS = new Set([".dwg", ".dxf", ".pdf"]);

function readCommandName(event: WatchdogCollectorEvent): string | null {
	const value = event.metadata?.commandName;
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim().toUpperCase();
	return trimmed || null;
}

function titleize(value: string): string {
	return value
		.toLowerCase()
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function resolveProjectLabel(
	event: WatchdogCollectorEvent,
	projectNameById: ReadonlyMap<string, { name: string }>,
): string {
	if (!event.projectId) {
		return "Workspace";
	}
	return projectNameById.get(event.projectId)?.name || event.projectId;
}

function resolveTargetLabel(event: WatchdogCollectorEvent): string {
	return basenameFromPath(event.drawingPath || event.path);
}

function resolveTargetPath(event: WatchdogCollectorEvent): string | null {
	return event.drawingPath || event.path || null;
}

function isDrawingTargetPath(value: string | null | undefined): boolean {
	if (!value) {
		return false;
	}
	const normalized = value.replace(/\\/g, "/").trim().toLowerCase();
	const extensionIndex = normalized.lastIndexOf(".");
	if (extensionIndex < 0) {
		return false;
	}
	return DRAWING_TARGET_EXTENSIONS.has(normalized.slice(extensionIndex));
}

function resolveTargetKey(event: WatchdogCollectorEvent): string | null {
	const targetPath = resolveTargetPath(event);
	if (!targetPath) {
		return null;
	}
	const normalized = targetPath.replace(/\\/g, "/").trim().toLowerCase();
	return normalized || null;
}

function buildContext(
	projectLabel: string,
	workstationId: string,
	extra?: string | null,
): string {
	return [projectLabel, workstationId, extra].filter(Boolean).join(" • ");
}

export function getWatchdogTechnicalSourceLabel(
	event: Pick<WatchdogCollectorEvent, "sourceType" | "collectorType">,
): string {
	if (event.sourceType === "autocad" || event.collectorType === "autocad_state") {
		return "CAD";
	}
	if (event.sourceType === "filesystem") {
		return "Filesystem";
	}
	return "Collector";
}

export function formatWatchdogTechnicalLabel(
	event: WatchdogCollectorEvent,
): string {
	const commandName = readCommandName(event);
	if (event.eventType === "command_executed" && commandName) {
		return `${getWatchdogTechnicalSourceLabel(event)} command • ${commandName}`;
	}
	switch (event.eventType) {
		case "drawing_opened":
			return "CAD lifecycle • Drawing opened";
		case "drawing_closed":
			return "CAD lifecycle • Drawing closed";
		case "drawing_activated":
			return "CAD lifecycle • Drawing activated";
		case "added":
			return "Filesystem • Added";
		case "modified":
			return "Filesystem • Modified";
		case "removed":
			return "Filesystem • Removed";
		default:
			return `${getWatchdogTechnicalSourceLabel(event)} • ${titleize(event.eventType)}`;
	}
}

export function presentWatchdogOperatorEvent(
	event: WatchdogCollectorEvent,
	projectNameById: ReadonlyMap<string, { name: string }>,
): PresentedWatchdogEvent | null {
	const projectLabel = resolveProjectLabel(event, projectNameById);
	const targetLabel = resolveTargetLabel(event);
	const commandName = readCommandName(event);
	const targetPath = resolveTargetPath(event);
	const targetKey = resolveTargetKey(event);
	const isDrawingTarget = isDrawingTargetPath(targetPath);

	if (!isDrawingTarget) {
		return null;
	}

	switch (event.eventType) {
		case "drawing_opened":
			return {
				eventId: event.eventId,
				label: "Opened drawing",
				detail: targetLabel,
				context: buildContext(projectLabel, event.workstationId),
				timestamp: event.timestamp,
				tone: "ready",
				eventType: event.eventType,
				rawCommandName: commandName,
				targetPath,
				targetKey,
			};
		case "drawing_closed":
			return {
				eventId: event.eventId,
				label: "Closed drawing",
				detail: targetLabel,
				context: buildContext(projectLabel, event.workstationId),
				timestamp: event.timestamp,
				tone: "background",
				eventType: event.eventType,
				rawCommandName: commandName,
				targetPath,
				targetKey,
			};
		case "drawing_activated":
			return {
				eventId: event.eventId,
				label: "Switched drawing",
				detail: targetLabel,
				context: buildContext(projectLabel, event.workstationId),
				timestamp: event.timestamp,
				tone: "ready",
				eventType: event.eventType,
				rawCommandName: commandName,
				targetPath,
				targetKey,
			};
		case "added":
			return {
				eventId: event.eventId,
				label: "Added file",
				detail: targetLabel,
				context: buildContext(projectLabel, event.workstationId),
				timestamp: event.timestamp,
				tone: "background",
				eventType: event.eventType,
				rawCommandName: commandName,
				targetPath,
				targetKey,
			};
		case "modified":
			return {
				eventId: event.eventId,
				label: "Updated file",
				detail: targetLabel,
				context: buildContext(projectLabel, event.workstationId),
				timestamp: event.timestamp,
				tone: "background",
				eventType: event.eventType,
				rawCommandName: commandName,
				targetPath,
				targetKey,
			};
		case "removed":
			return {
				eventId: event.eventId,
				label: "Removed file",
				detail: targetLabel,
				context: buildContext(projectLabel, event.workstationId),
				timestamp: event.timestamp,
				tone: "needs-attention",
				eventType: event.eventType,
				rawCommandName: commandName,
				targetPath,
				targetKey,
			};
		case "command_executed": {
			if (!commandName || HIDDEN_COMMANDS.has(commandName)) {
				return null;
			}
			if (SAVE_COMMANDS.has(commandName)) {
				return {
					eventId: event.eventId,
					label: "Saved drawing",
					detail: targetLabel,
					context: buildContext(projectLabel, event.workstationId),
					timestamp: event.timestamp,
					tone: "ready",
					eventType: event.eventType,
					rawCommandName: commandName,
					targetPath,
					targetKey,
				};
			}
			return {
				eventId: event.eventId,
				label: `Ran ${titleize(commandName)}`,
				detail: targetLabel,
				context: buildContext(projectLabel, event.workstationId, commandName),
				timestamp: event.timestamp,
				tone: "background",
				eventType: event.eventType,
				rawCommandName: commandName,
				targetPath,
				targetKey,
			};
		}
		case "idle_started":
		case "idle_resumed":
			return null;
		default:
			return {
				eventId: event.eventId,
				label: titleize(event.eventType),
				detail: targetLabel,
				context: buildContext(projectLabel, event.workstationId),
				timestamp: event.timestamp,
				tone: "background",
				eventType: event.eventType,
				rawCommandName: commandName,
				targetPath,
				targetKey,
			};
	}
}

export function presentWatchdogOperatorFeed(
	events: WatchdogCollectorEvent[],
	projectNameById: ReadonlyMap<string, { name: string }>,
): PresentedWatchdogEvent[] {
	return events
		.map((event) => presentWatchdogOperatorEvent(event, projectNameById))
		.filter((event): event is PresentedWatchdogEvent => event !== null);
}
