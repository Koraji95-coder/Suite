import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/system/dialog";
import { cn } from "@/lib/utils";
import styles from "./EventDialog.module.css";
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

	const dialogTitle = event?.id ? "Edit Event" : "Create Event";
	const dialogDescription = event?.id
		? "Edit the details of this event"
		: "Add a new event to your calendar";
	const eventFormFields = (
		<>
			{error ? <div className={styles.errorBanner}>{error}</div> : null}

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
		</>
	);

	if (inline) {
		return (
			<div className={styles.inlineWrap}>
				<div className={cn(styles.dialogContent, styles.dialogContentInline)}>
					<h2 className={styles.inlineTitle}>{dialogTitle}</h2>
					<p className={styles.srOnly}>{dialogDescription}</p>
					{eventFormFields}
				</div>
			</div>
		);
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className={styles.dialogContent}>
				<DialogHeader>
					<DialogTitle>{dialogTitle}</DialogTitle>
					<DialogDescription className={styles.srOnly}>
						{dialogDescription}
					</DialogDescription>
				</DialogHeader>
				{eventFormFields}
			</DialogContent>
		</Dialog>
	);
}
