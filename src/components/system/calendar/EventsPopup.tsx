import { format, isSameDay } from "date-fns";
import { XIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { type CalendarEvent, EventItem } from "./calendarindex";
import styles from "./EventsPopup.module.css";

interface EventsPopupProps {
	date: Date;
	events: CalendarEvent[];
	position: { top: number; left: number };
	onClose: () => void;
	onEventSelect: (event: CalendarEvent) => void;
}

export function EventsPopup({
	date,
	events,
	position,
	onClose,
	onEventSelect,
}: EventsPopupProps) {
	const popupRef = useRef<HTMLDivElement>(null);

	// Handle click outside to close popup
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				popupRef.current &&
				!popupRef.current.contains(event.target as Node)
			) {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [onClose]);

	// Handle escape key to close popup
	useEffect(() => {
		const handleEscKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("keydown", handleEscKey);
		return () => {
			document.removeEventListener("keydown", handleEscKey);
		};
	}, [onClose]);

	const handleEventClick = (event: CalendarEvent) => {
		onEventSelect(event);
		onClose();
	};

	// Adjust position to ensure popup stays within viewport
	const adjustedPosition = useMemo(() => {
		const positionCopy = { ...position };

		// Check if we need to adjust the position to fit in the viewport
		if (popupRef.current) {
			const rect = popupRef.current.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			// Adjust horizontally if needed
			if (positionCopy.left + rect.width > viewportWidth) {
				positionCopy.left = Math.max(0, viewportWidth - rect.width);
			}

			// Adjust vertically if needed
			if (positionCopy.top + rect.height > viewportHeight) {
				positionCopy.top = Math.max(0, viewportHeight - rect.height);
			}
		}

		return positionCopy;
	}, [position]);

	return (
		<div
			ref={popupRef}
			className={styles.root}
			style={{
				top: `${adjustedPosition.top}px`,
				left: `${adjustedPosition.left}px`,
				zIndex: "var(--z-dropdown)",
			}}
		>
			<div className={styles.header}>
				<h3 className={styles.title}>{format(date, "d MMMM yyyy")}</h3>
				<button
					onClick={onClose}
					className={styles.closeButton}
					aria-label="Close"
				>
					<XIcon className={styles.closeIcon} />
				</button>
			</div>

			<div className={styles.body}>
				{events.length === 0 ? (
					<div className={styles.emptyState}>No events</div>
				) : (
					events.map((event) => {
						const eventStart = new Date(event.start);
						const eventEnd = new Date(event.end);
						const isFirstDay = isSameDay(date, eventStart);
						const isLastDay = isSameDay(date, eventEnd);

						return (
							<div
								key={event.id}
								className={styles.eventRow}
								onClick={() => handleEventClick(event)}
							>
								<EventItem
									event={event}
									view="agenda"
									isFirstDay={isFirstDay}
									isLastDay={isLastDay}
								/>
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}
