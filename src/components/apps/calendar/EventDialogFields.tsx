import { format, isBefore } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Checkbox } from "@/components/apps/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/apps/ui/Popover";
import { RadioGroup, RadioGroupItem } from "@/components/apps/ui/RadioGroup";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/apps/ui/select";
import { Button } from "@/components/primitives/Button";
import { Input, TextArea } from "@/components/primitives/Input";
import { Label } from "@/components/primitives/Text";
import { cn } from "@/lib/utils";
import { Calendar } from "./Calendar";
import type { EventColor } from "./calendarindex";
import styles from "./EventDialogFields.module.css";
import {
	EVENT_DIALOG_COLOR_OPTIONS,
	EVENT_DIALOG_TIME_OPTIONS,
} from "./eventDialogModels";

const TIME_OPTIONS = EVENT_DIALOG_TIME_OPTIONS.filter(
	(option) => option.value.trim().length > 0,
);

interface EventDialogFieldsProps {
	projectOptions: Array<{ id: string; name: string }>;
	filteredTaskOptions: Array<{
		id: string;
		name: string;
		project_id: string | null;
	}>;
	title: string;
	description: string;
	startDate: Date;
	endDate: Date;
	startTime: string;
	endTime: string;
	allDay: boolean;
	location: string;
	color: EventColor;
	startDateOpen: boolean;
	endDateOpen: boolean;
	projectId: string | null;
	taskId: string | null;
	setTitle: (value: string) => void;
	setDescription: (value: string) => void;
	setStartDate: (date: Date) => void;
	setEndDate: (date: Date) => void;
	setStartTime: (value: string) => void;
	setEndTime: (value: string) => void;
	setAllDay: (value: boolean) => void;
	setLocation: (value: string) => void;
	setColor: (value: EventColor) => void;
	setStartDateOpen: (open: boolean) => void;
	setEndDateOpen: (open: boolean) => void;
	setProjectId: (value: string | null) => void;
	setTaskId: (value: string | null) => void;
	setError: (value: string | null) => void;
}

const NO_PROJECT_VALUE = "__none_project__";
const NO_TASK_VALUE = "__none_task__";

export function EventDialogFields({
	projectOptions,
	filteredTaskOptions,
	title,
	description,
	startDate,
	endDate,
	startTime,
	endTime,
	allDay,
	location,
	color,
	startDateOpen,
	endDateOpen,
	projectId,
	taskId,
	setTitle,
	setDescription,
	setStartDate,
	setEndDate,
	setStartTime,
	setEndTime,
	setAllDay,
	setLocation,
	setColor,
	setStartDateOpen,
	setEndDateOpen,
	setProjectId,
	setTaskId,
	setError,
}: EventDialogFieldsProps) {
	const projectSelectValue = projectId ?? NO_PROJECT_VALUE;
	const taskSelectValue = taskId ?? NO_TASK_VALUE;

	return (
		<div className={styles.root}>
			<div className={styles.fieldGroup}>
				<div className={styles.fieldStack}>
					<Label htmlFor="project">Project</Label>
					<Select
						value={projectSelectValue}
						onValueChange={(value) => {
							setProjectId(value === NO_PROJECT_VALUE ? null : value);
							setTaskId(null);
						}}
					>
						<SelectTrigger id="project" className={styles.fullWidth}>
							<SelectValue placeholder="No project" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
							{projectOptions.map((project) => (
								<SelectItem key={project.id} value={project.id}>
									{project.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className={styles.fieldStack}>
					<Label htmlFor="task">Task</Label>
					<Select
						value={taskSelectValue}
						onValueChange={(value) =>
							setTaskId(value === NO_TASK_VALUE ? null : value)
						}
					>
						<SelectTrigger id="task" className={styles.fullWidth}>
							<SelectValue placeholder="No task" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={NO_TASK_VALUE}>No task</SelectItem>
							{filteredTaskOptions.map((task) => (
								<SelectItem key={task.id} value={task.id}>
									{task.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className={styles.fieldStack}>
				<Label htmlFor="title">Title</Label>
				<Input
					id="title"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
				/>
			</div>

			<div className={styles.fieldStack}>
				<Label htmlFor="description">Description</Label>
				<TextArea
					id="description"
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					rows={3}
				/>
			</div>

			<div className={styles.dateTimeRow}>
				<div className={cn(styles.dateColumn, styles.fieldStack)}>
					<Label htmlFor="start-date">Start Date</Label>
					<Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
						<PopoverTrigger asChild>
							<Button
								id="start-date"
								variant="outline"
								className={cn(
									styles.dateTrigger,
									!startDate && styles.mutedText,
								)}
							>
								<span
									className={cn(
										styles.dateLabel,
										!startDate && styles.mutedText,
									)}
								>
									{startDate ? format(startDate, "PPP") : "Pick a date"}
								</span>
								<CalendarIcon
									className={styles.calendarIcon}
									aria-hidden="true"
								/>
							</Button>
						</PopoverTrigger>
						<PopoverContent className={styles.popoverContent} align="start">
							<Calendar
								mode="single"
								selected={startDate}
								defaultMonth={startDate}
								onSelect={(date) => {
									if (!date) return;
									setStartDate(date);
									if (isBefore(endDate, date)) {
										setEndDate(date);
									}
									setError(null);
									setStartDateOpen(false);
								}}
							/>
						</PopoverContent>
					</Popover>
				</div>

				{!allDay ? (
					<div className={cn(styles.timeColumn, styles.fieldStack)}>
						<Label htmlFor="start-time">Start Time</Label>
						<Select value={startTime} onValueChange={setStartTime}>
							<SelectTrigger id="start-time">
								<SelectValue placeholder="Select time" />
							</SelectTrigger>
							<SelectContent>
								{TIME_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				) : null}
			</div>

			<div className={styles.dateTimeRow}>
				<div className={cn(styles.dateColumn, styles.fieldStack)}>
					<Label htmlFor="end-date">End Date</Label>
					<Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
						<PopoverTrigger asChild>
							<Button
								id="end-date"
								variant="outline"
								className={cn(styles.dateTrigger, !endDate && styles.mutedText)}
							>
								<span
									className={cn(styles.dateLabel, !endDate && styles.mutedText)}
								>
									{endDate ? format(endDate, "PPP") : "Pick a date"}
								</span>
								<CalendarIcon
									className={styles.calendarIcon}
									aria-hidden="true"
								/>
							</Button>
						</PopoverTrigger>
						<PopoverContent className={styles.popoverContent} align="start">
							<Calendar
								mode="single"
								selected={endDate}
								defaultMonth={endDate}
								disabled={{ before: startDate }}
								onSelect={(date) => {
									if (!date) return;
									setEndDate(date);
									setError(null);
									setEndDateOpen(false);
								}}
							/>
						</PopoverContent>
					</Popover>
				</div>

				{!allDay ? (
					<div className={cn(styles.timeColumn, styles.fieldStack)}>
						<Label htmlFor="end-time">End Time</Label>
						<Select value={endTime} onValueChange={setEndTime}>
							<SelectTrigger id="end-time">
								<SelectValue placeholder="Select time" />
							</SelectTrigger>
							<SelectContent>
								{TIME_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				) : null}
			</div>

			<div className={styles.allDayRow}>
				<Checkbox
					id="all-day"
					checked={allDay}
					onCheckedChange={(checked) => setAllDay(checked === true)}
				/>
				<Label htmlFor="all-day">All day</Label>
			</div>

			<div className={styles.fieldStack}>
				<Label htmlFor="location">Location</Label>
				<Input
					id="location"
					value={location}
					onChange={(event) => setLocation(event.target.value)}
				/>
			</div>

			<fieldset className={styles.colorFieldset}>
				<legend className={styles.colorLegend}>Etiquette</legend>
				<RadioGroup
					className={styles.colorOptions}
					defaultValue={EVENT_DIALOG_COLOR_OPTIONS[0]?.value}
					value={color}
					onValueChange={(value: EventColor) => setColor(value)}
				>
					{EVENT_DIALOG_COLOR_OPTIONS.map((colorOption) => (
						<RadioGroupItem
							key={colorOption.value}
							id={`color-${colorOption.value}`}
							value={colorOption.value}
							aria-label={colorOption.label}
							className={cn(
								styles.colorOption,
								styles[`colorOption-${colorOption.value}`],
							)}
						/>
					))}
				</RadioGroup>
			</fieldset>
		</div>
	);
}
