import { format, isBefore } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/apps/ui/button";
import { Checkbox } from "@/components/apps/ui/checkbox";
import { Input } from "@/components/apps/ui/input";
import { Label } from "@/components/apps/ui/label";
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
import { Textarea } from "@/components/apps/ui/textarea";
import { cn } from "@/lib/utils";
import { Calendar } from "./Calendar";
import type { EventColor } from "./calendarindex";
import {
	EVENT_DIALOG_COLOR_OPTIONS,
	EVENT_DIALOG_TIME_OPTIONS,
} from "./eventDialogModels";

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
	return (
		<div className="grid gap-4 py-2 sm:py-4">
			<div className="grid gap-3">
				<div className="*:not-first:mt-1.5">
					<Label htmlFor="project">Project</Label>
					<Select
						value={projectId ?? ""}
						onValueChange={(value) => {
							setProjectId(value || null);
							setTaskId(null);
						}}
					>
						<SelectTrigger id="project" className="w-full">
							<SelectValue placeholder="No project" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="">No project</SelectItem>
							{projectOptions.map((project) => (
								<SelectItem key={project.id} value={project.id}>
									{project.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="*:not-first:mt-1.5">
					<Label htmlFor="task">Task</Label>
					<Select
						value={taskId ?? ""}
						onValueChange={(value) => setTaskId(value || null)}
					>
						<SelectTrigger id="task" className="w-full">
							<SelectValue placeholder="No task" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="">No task</SelectItem>
							{filteredTaskOptions.map((task) => (
								<SelectItem key={task.id} value={task.id}>
									{task.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="*:not-first:mt-1.5">
				<Label htmlFor="title">Title</Label>
				<Input
					id="title"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
				/>
			</div>

			<div className="*:not-first:mt-1.5">
				<Label htmlFor="description">Description</Label>
				<Textarea
					id="description"
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					rows={3}
				/>
			</div>

			<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px] sm:gap-4">
				<div className="flex-1 *:not-first:mt-1.5">
					<Label htmlFor="start-date">Start Date</Label>
					<Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
						<PopoverTrigger asChild>
							<Button
								id="start-date"
								variant="outline"
								className={cn(
									"group bg-background hover:bg-background border-input w-full justify-between px-3 font-normal outline-offset-0 outline-none focus-visible:outline-[3px]",
									!startDate && "text-muted-foreground",
								)}
							>
								<span
									className={cn(
										"truncate",
										!startDate && "text-muted-foreground",
									)}
								>
									{startDate ? format(startDate, "PPP") : "Pick a date"}
								</span>
								<CalendarIcon
									className="text-muted-foreground/80 h-4 w-4 shrink-0"
									aria-hidden="true"
								/>
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-2" align="start">
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
					<div className="w-full *:not-first:mt-1.5">
						<Label htmlFor="start-time">Start Time</Label>
						<Select value={startTime} onValueChange={setStartTime}>
							<SelectTrigger id="start-time">
								<SelectValue placeholder="Select time" />
							</SelectTrigger>
							<SelectContent>
								{EVENT_DIALOG_TIME_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				) : null}
			</div>

			<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px] sm:gap-4">
				<div className="flex-1 *:not-first:mt-1.5">
					<Label htmlFor="end-date">End Date</Label>
					<Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
						<PopoverTrigger asChild>
							<Button
								id="end-date"
								variant="outline"
								className={cn(
									"group bg-background hover:bg-background border-input w-full justify-between px-3 font-normal outline-offset-0 outline-none focus-visible:outline-[3px]",
									!endDate && "text-muted-foreground",
								)}
							>
								<span
									className={cn(
										"truncate",
										!endDate && "text-muted-foreground",
									)}
								>
									{endDate ? format(endDate, "PPP") : "Pick a date"}
								</span>
								<CalendarIcon
									className="text-muted-foreground/80 h-4 w-4 shrink-0"
									aria-hidden="true"
								/>
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-2" align="start">
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
					<div className="w-full *:not-first:mt-1.5">
						<Label htmlFor="end-time">End Time</Label>
						<Select value={endTime} onValueChange={setEndTime}>
							<SelectTrigger id="end-time">
								<SelectValue placeholder="Select time" />
							</SelectTrigger>
							<SelectContent>
								{EVENT_DIALOG_TIME_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				) : null}
			</div>

			<div className="flex items-center gap-2">
				<Checkbox
					id="all-day"
					checked={allDay}
					onCheckedChange={(checked) => setAllDay(checked === true)}
				/>
				<Label htmlFor="all-day">All day</Label>
			</div>

			<div className="*:not-first:mt-1.5">
				<Label htmlFor="location">Location</Label>
				<Input
					id="location"
					value={location}
					onChange={(event) => setLocation(event.target.value)}
				/>
			</div>

			<fieldset className="space-y-4">
				<legend className="text-foreground text-sm leading-none font-medium">
					Etiquette
				</legend>
				<RadioGroup
					className="flex gap-1.5"
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
								"size-6 shadow-none",
								colorOption.bgClass,
								colorOption.borderClass,
							)}
						/>
					))}
				</RadioGroup>
			</fieldset>
		</div>
	);
}
