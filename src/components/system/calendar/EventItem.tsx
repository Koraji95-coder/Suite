import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { format, getMinutes, isPast } from "date-fns";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
	type CalendarEvent,
	type EventColor,
	getEventInlineStyle,
} from "./calendarindex";
import styles from "./EventItem.module.css";

const formatTimeWithOptionalMinutes = (date: Date) => {
	return format(date, getMinutes(date) === 0 ? "ha" : "h:mma").toLowerCase();
};

const getEventColorClass = (color?: EventColor | string): string => {
	switch (color) {
		case "amber":
			return styles.colorAmber;
		case "violet":
			return styles.colorViolet;
		case "rose":
			return styles.colorRose;
		case "emerald":
			return styles.colorEmerald;
		case "orange":
			return styles.colorOrange;
		case "sky":
		default:
			return styles.colorSky;
	}
};

const getRadiusClass = (isFirstDay: boolean, isLastDay: boolean): string => {
	if (isFirstDay && isLastDay) return styles.radiusSingle;
	if (isFirstDay) return styles.radiusStart;
	if (isLastDay) return styles.radiusEnd;
	return styles.radiusMiddle;
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
			type="button"
			className={cn(
				styles.eventWrapper,
				inlineStyle ? styles.customColor : getEventColorClass(event.color),
				getRadiusClass(isFirstDay, isLastDay),
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
				className={cn(styles.monthEvent, className)}
				currentTime={currentTime}
				dndListeners={dndListeners}
				dndAttributes={dndAttributes}
				onMouseDown={onMouseDown}
				onTouchStart={onTouchStart}
			>
				{children || (
					<span className={styles.monthContent}>
						{!event.allDay && (
							<span className={styles.timeLabel}>
								{formatTimeWithOptionalMinutes(displayStart)}{" "}
							</span>
						)}
						<span className={styles.monthTitle}>{event.title}</span>
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
				className={cn(styles.gridEvent, className)}
				currentTime={currentTime}
				dndListeners={dndListeners}
				dndAttributes={dndAttributes}
				onMouseDown={onMouseDown}
				onTouchStart={onTouchStart}
			>
				<div className={styles.gridContent}>
					<span className={styles.gridTitle}>{event.title}</span>
					{showTime && (
						<span className={styles.gridTime}>{shortTimeLabel}</span>
					)}
				</div>
			</EventWrapper>
		);
	}

	return (
		<button
			type="button"
			className={cn(
				styles.agendaButton,
				event.colorHex
					? styles.agendaCustomColor
					: getEventColorClass(event.color),
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
			<div className={styles.agendaTitle}>{event.title}</div>
			<div className={styles.agendaMeta}>
				{event.allDay ? (
					<span>All day</span>
				) : (
					<span className={styles.timeRange}>
						{formatTimeWithOptionalMinutes(displayStart)} -{" "}
						{formatTimeWithOptionalMinutes(displayEnd)}
					</span>
				)}
				{event.location && (
					<>
						<span className={styles.separator}> · </span>
						<span>{event.location}</span>
					</>
				)}
			</div>
			{event.description && (
				<div className={styles.agendaDescription}>{event.description}</div>
			)}
		</button>
	);
}
