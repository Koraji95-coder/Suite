import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/apps/ui/dialog";
import { cn } from "@/lib/utils";
import { EventDialogFields } from "./EventDialogFields";
import { EventDialogFooter } from "./EventDialogFooter";
import type { EventDialogProps } from "./eventDialogModels";
import { useEventDialogState } from "./useEventDialogState";

export function EventDialog({
	event,
	isOpen,
	onClose,
	onSave,
	onDelete,
	projectOptions = [],
	taskOptions = [],
	inline = false,
}: EventDialogProps) {
	const {
		allDay,
		color,
		description,
		endDate,
		endDateOpen,
		endTime,
		error,
		filteredTaskOptions,
		handleDelete,
		handleSave,
		location,
		projectId,
		setAllDay,
		setColor,
		setDescription,
		setEndDate,
		setEndDateOpen,
		setEndTime,
		setError,
		setLocation,
		setProjectId,
		setStartDate,
		setStartDateOpen,
		setStartTime,
		setTaskId,
		setTitle,
		startDate,
		startDateOpen,
		startTime,
		taskId,
		title,
	} = useEventDialogState({
		event,
		onSave,
		onDelete,
		taskOptions,
	});

	if (!isOpen) return null;

	const dialogCard = (
		<DialogContent
			className={cn(
				"w-[min(96vw,840px)] border-primary/30 bg-card sm:max-w-170",
				inline && "w-full sm:max-w-none",
			)}
		>
			<DialogHeader>
				<DialogTitle>{event?.id ? "Edit Event" : "Create Event"}</DialogTitle>
				<DialogDescription className="sr-only">
					{event?.id
						? "Edit the details of this event"
						: "Add a new event to your calendar"}
				</DialogDescription>
			</DialogHeader>

			{error ? (
				<div className="bg-destructive/15 text-destructive rounded-md px-3 py-2 text-sm">
					{error}
				</div>
			) : null}

			<EventDialogFields
				projectOptions={projectOptions}
				filteredTaskOptions={filteredTaskOptions}
				title={title}
				description={description}
				startDate={startDate}
				endDate={endDate}
				startTime={startTime}
				endTime={endTime}
				allDay={allDay}
				location={location}
				color={color}
				startDateOpen={startDateOpen}
				endDateOpen={endDateOpen}
				projectId={projectId}
				taskId={taskId}
				setTitle={setTitle}
				setDescription={setDescription}
				setStartDate={setStartDate}
				setEndDate={setEndDate}
				setStartTime={setStartTime}
				setEndTime={setEndTime}
				setAllDay={setAllDay}
				setLocation={setLocation}
				setColor={setColor}
				setStartDateOpen={setStartDateOpen}
				setEndDateOpen={setEndDateOpen}
				setProjectId={setProjectId}
				setTaskId={setTaskId}
				setError={setError}
			/>

			<EventDialogFooter
				eventId={event?.id}
				onDelete={handleDelete}
				onCancel={onClose}
				onSave={handleSave}
			/>
		</DialogContent>
	);

	if (inline) {
		return <div className="px-2 pb-2 sm:px-5 sm:pb-5">{dialogCard}</div>;
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			{dialogCard}
		</Dialog>
	);
}
