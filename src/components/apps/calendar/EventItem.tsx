import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { format, getMinutes, isPast } from "date-fns";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
	type CalendarEvent,
	getBorderRadiusClasses,
	getEventColorClasses,
	getEventInlineStyle,
} from "./calendarindex";

const formatTimeWithOptionalMinutes = (date: Date) => {
	return format(date, getMinutes(date) === 0 ? "ha" : "h:mma").toLowerCase();
};

interface EventWrapperProps {
	event: CalendarEvent;
	isFirstDay?: boolean;
	isLastDay?: boolean;
	isDragging?: boolean;
	onClick?: (e: React.MouseEvent) => void;
	className?: string;
	children: React.ReactNode;
	currentTime?: Date;
	dndListeners?: SyntheticListenerMap;
	dndAttributes?: DraggableAttributes;
	onMouseDown?: (e: React.MouseEvent) => void;
	onTouchStart?: (e: React.TouchEvent) => void;
}

function EventWrapper({
	event,
	isFirstDay = true,
	isLastDay = true,
	isDragging,
	onClick,
	className,
	children,
	currentTime,
	dndListeners,
	dndAttributes,
	onMouseDown,
	onTouchStart,
}: EventWrapperProps) {
	const displayEnd = currentTime
		? new Date(
				new Date(currentTime).getTime() +
					(new Date(event.end).getTime() - new Date(event.start).getTime()),
			)
		: new Date(event.end);

	const isEventInPast = isPast(displayEnd);

	const inlineStyle = getEventInlineStyle(event.colorHex);

	return (
		<button
			className={cn(
				"focus-visible:border-ring focus-visible:ring-ring/50 flex size-full overflow-hidden px-2 text-left font-medium leading-tight backdrop-blur-md transition outline-none select-none focus-visible:ring-[3px] data-dragging:cursor-grabbing data-dragging:shadow-lg data-past-event:line-through sm:px-2.5",
				inlineStyle ? "shadow-black/10" : getEventColorClasses(event.color),
				getBorderRadiusClasses(isFirstDay, isLastDay),
				className,
			)}
			style={inlineStyle}
			data-dragging={isDragging || undefined}
			data-past-event={isEventInPast || undefined}
			onClick={onClick}
			onMouseDown={onMouseDown}
			onTouchStart={onTouchStart}
			{...dndListeners}
			{...dndAttributes}
		>
			{children}
		</button>
	);
}

interface EventItemProps {
	event: CalendarEvent;
	view: "month" | "week" | "day" | "agenda";
	isDragging?: boolean;
	onClick?: (e: React.MouseEvent) => void;
	showTime?: boolean;
	currentTime?: Date;
	isFirstDay?: boolean;
	isLastDay?: boolean;
	children?: React.ReactNode;
	className?: string;
	dndListeners?: SyntheticListenerMap;
	dndAttributes?: DraggableAttributes;
	onMouseDown?: (e: React.MouseEvent) => void;
	onTouchStart?: (e: React.TouchEvent) => void;
}

export function EventItem({
	event,
	view,
	isDragging,
	onClick,
	showTime,
	currentTime,
	isFirstDay = true,
	isLastDay = true,
	children,
	className,
	dndListeners,
	dndAttributes,
	onMouseDown,
	onTouchStart,
}: EventItemProps) {
	const displayStart = useMemo(
		() => currentTime || new Date(event.start),
		[currentTime, event.start],
	);

	const displayEnd = useMemo(() => {
		return currentTime
			? new Date(
					new Date(currentTime).getTime() +
						(new Date(event.end).getTime() - new Date(event.start).getTime()),
				)
			: new Date(event.end);
	}, [currentTime, event.start, event.end]);

	const shortTimeLabel = event.allDay
		? "All day"
		: formatTimeWithOptionalMinutes(displayStart);

	if (view === "month") {
		return (
			<EventWrapper
				event={event}
				isFirstDay={isFirstDay}
				isLastDay={isLastDay}
				isDragging={isDragging}
				onClick={onClick}
				className={cn(
					"mt-[var(--event-gap)] h-[var(--event-height)] items-center justify-center text-[11px] leading-none sm:text-xs",
					className,
				)}
				currentTime={currentTime}
				dndListeners={dndListeners}
				dndAttributes={dndAttributes}
				onMouseDown={onMouseDown}
				onTouchStart={onTouchStart}
			>
				{children || (
					<span className="flex w-full items-center justify-center gap-1 overflow-hidden text-center leading-none">
						{!event.allDay && (
							<span className="truncate font-normal opacity-70 text-[10px] sm:text-[11px]">
								{formatTimeWithOptionalMinutes(displayStart)}{" "}
							</span>
						)}
						<span className="truncate">{event.title}</span>
					</span>
				)}
			</EventWrapper>
		);
	}

	if (view === "week" || view === "day") {
		return (
			<EventWrapper
				event={event}
				isFirstDay={isFirstDay}
				isLastDay={isLastDay}
				isDragging={isDragging}
				onClick={onClick}
				className={cn(
					"items-center justify-center text-[11px] leading-none sm:text-xs",
					className,
				)}
				currentTime={currentTime}
				dndListeners={dndListeners}
				dndAttributes={dndAttributes}
				onMouseDown={onMouseDown}
				onTouchStart={onTouchStart}
			>
				<div className="flex w-full items-center justify-center gap-1 overflow-hidden text-center leading-none">
					<span className="truncate">{event.title}</span>
					{showTime && (
						<span className="truncate opacity-70 text-[10px] sm:text-[11px]">
							{shortTimeLabel}
						</span>
					)}
				</div>
			</EventWrapper>
		);
	}

	return (
		<button
			className={cn(
				"focus-visible:border-ring focus-visible:ring-ring/50 flex w-full flex-col gap-1.5 rounded-lg px-3 py-2.5 text-left transition outline-none focus-visible:ring-[3px] data-past-event:line-through data-past-event:opacity-90",
				event.colorHex
					? "bg-muted/40 hover:bg-muted/50 text-foreground/90"
					: getEventColorClasses(event.color),
				className,
			)}
			style={getEventInlineStyle(event.colorHex)}
			data-past-event={isPast(new Date(event.end)) || undefined}
			onClick={onClick}
			onMouseDown={onMouseDown}
			onTouchStart={onTouchStart}
			{...dndListeners}
			{...dndAttributes}
		>
			<div className="text-sm font-medium leading-tight">{event.title}</div>
			<div className="text-xs opacity-70">
				{event.allDay ? (
					<span>All day</span>
				) : (
					<span className="uppercase">
						{formatTimeWithOptionalMinutes(displayStart)} -{" "}
						{formatTimeWithOptionalMinutes(displayEnd)}
					</span>
				)}
				{event.location && (
					<>
						<span className="px-1 opacity-35"> · </span>
						<span>{event.location}</span>
					</>
				)}
			</div>
			{event.description && (
				<div className="my-1 text-xs opacity-90">{event.description}</div>
			)}
		</button>
	);
}
