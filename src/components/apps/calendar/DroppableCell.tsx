import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { useCalendarDnd } from "./calendarindex";

interface DroppableCellProps {
	id: string;
	date: Date;
	time?: number; // For week/day views, represents hours (e.g., 9.25 for 9:15)
	children?: React.ReactNode;
	className?: string;
	onClick?: () => void;
	onDoubleClick?: () => void; // ✅ new
}

export function DroppableCell({
	id,
	date,
	time,
	children,
	className,
	onClick,
	onDoubleClick,
}: DroppableCellProps) {
	const { activeEvent } = useCalendarDnd();

	const { setNodeRef, isOver } = useDroppable({
		id,
		data: {
			date,
			time,
		},
	});

	const formattedTime =
		time !== undefined
			? `${Math.floor(time)}:${Math.round((time - Math.floor(time)) * 60)
					.toString()
					.padStart(2, "0")}`
			: null;

	return (
		<div
			ref={setNodeRef}
			onClick={onClick}
			onDoubleClick={onDoubleClick} // ✅ new
			className={cn(
				"data-dragging:bg-accent flex h-full flex-col overflow-hidden px-0.5 py-1 sm:px-1",
				className,
			)}
			title={formattedTime ? `${formattedTime}` : undefined}
			data-dragging={isOver && activeEvent ? true : undefined}
		>
			{children}
		</div>
	);
}
