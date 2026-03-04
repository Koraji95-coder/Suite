import {
	CalendarCheck,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	PlusIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/apps/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { CalendarView } from "./calendarindex";

interface EventCalendarToolbarProps {
	compact: boolean;
	view: CalendarView;
	viewTitle: ReactNode;
	onToday: () => void;
	onPrev: () => void;
	onNext: () => void;
	onViewChange: (view: CalendarView) => void;
	onNewEvent: () => void;
}

const viewLabel: Record<CalendarView, string> = {
	agenda: "Agenda",
	day: "Day",
	month: "Month",
	week: "Week",
};

export function EventCalendarToolbar({
	compact,
	view,
	viewTitle,
	onToday,
	onPrev,
	onNext,
	onViewChange,
	onNewEvent,
}: EventCalendarToolbarProps) {
	const controlBase =
		"inline-flex items-center justify-center rounded-lg font-semibold transition-all leading-none text-center whitespace-nowrap";
	const controlSize = compact
		? "min-h-9 px-3 py-2 text-sm"
		: "min-h-[46px] px-5 py-2.5 text-sm sm:text-base";
	const primaryControlSize = compact
		? "min-h-10 px-4 py-2 text-sm"
		: "min-h-[52px] px-6 py-3 text-sm sm:text-base";

	return (
		<div
			className={cn(
				"sticky top-0 z-20 rounded-xl border backdrop-blur-md",
				"[border-color:var(--border)] [background:color-mix(in_srgb,var(--surface)_60%,transparent)]",
				compact ? "mx-2 mt-2" : "mx-2 mt-2 sm:mx-4 sm:mt-4",
			)}
		>
			<div
				className={cn(
					"grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center",
					compact ? "p-2" : "p-3 sm:p-4",
				)}
			>
				{/* Left: Today + nav + view tabs */}
				<div
					className={cn(
						"flex min-w-0 flex-wrap items-center",
						compact ? "gap-1.5" : "gap-3",
					)}
				>
					<button
						onClick={onToday}
						className={cn(
							controlBase,
							controlSize,
							"border [border-color:var(--border)] [background:var(--surface)] [color:var(--primary)]",
							"hover:[background:var(--surface-2)]",
						)}
					>
						<CalendarCheck className="h-4 w-4 sm:me-2" aria-hidden="true" />
						<span className="max-[479px]:sr-only sm:not-sr-only">Today</span>
					</button>

					<div className="flex items-center gap-1">
						<button
							onClick={onPrev}
							aria-label="Previous"
							className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors
								[color:var(--text-muted)] hover:[background:var(--surface-2)]"
						>
							<ChevronLeftIcon size={18} aria-hidden="true" />
						</button>
						<button
							onClick={onNext}
							aria-label="Next"
							className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors
								[color:var(--text-muted)] hover:[background:var(--surface-2)]"
						>
							<ChevronRightIcon size={18} aria-hidden="true" />
						</button>
					</div>

					{/* Desktop view tabs */}
					<div className="ms-1 hidden items-center gap-1 md:flex">
						{(["month", "week", "day", "agenda"] as CalendarView[]).map(
							(v) => {
								const active = v === view;
								return (
									<button
										key={v}
										type="button"
										onClick={() => onViewChange(v)}
										className={cn(
											"inline-flex h-10 w-24 items-center justify-center rounded-xl border text-center text-sm leading-none transition-colors",
											active
												? "border-[color-mix(in_srgb,var(--primary)_22%,transparent)] [background:var(--surface-2)] [color:var(--text)]"
												: "[border-color:var(--border)] [color:var(--text-muted)] hover:[background:var(--surface)]",
										)}
									>
										{viewLabel[v]}
									</button>
								);
							},
						)}
					</div>
				</div>

				{/* Center: Title */}
				<div className="flex items-center justify-center sm:justify-self-center">
					<h2
						className={cn(
							"text-center font-semibold [color:var(--text)]",
							compact ? "text-sm" : "text-sm sm:text-lg md:text-xl",
						)}
					>
						{viewTitle}
					</h2>
				</div>

				{/* Right: Mobile view dropdown + New event */}
				<div
					className={cn(
						"flex min-w-0 items-center justify-between pr-2 sm:justify-end sm:pr-3",
						compact ? "gap-1.5" : "gap-2",
					)}
				>
					{/* Mobile view dropdown */}
					<div className="md:hidden">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									className={cn(
										controlBase,
										controlSize,
										"gap-1.5 border [border-color:var(--border)] [background:var(--surface)] [color:var(--text-muted)]",
									)}
								>
									<span>{viewLabel[view]}</span>
									<ChevronDownIcon
										className="-me-1 opacity-60"
										size={16}
										aria-hidden="true"
									/>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="min-w-36">
								<DropdownMenuItem onClick={() => onViewChange("month")}>
									Month <DropdownMenuShortcut>M</DropdownMenuShortcut>
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => onViewChange("week")}>
									Week <DropdownMenuShortcut>W</DropdownMenuShortcut>
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => onViewChange("day")}>
									Day <DropdownMenuShortcut>D</DropdownMenuShortcut>
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => onViewChange("agenda")}>
									Agenda <DropdownMenuShortcut>A</DropdownMenuShortcut>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					<button
						type="button"
						className={cn(
							controlBase,
							primaryControlSize,
							"ms-1 me-2 gap-1.5 rounded-xl sm:ms-2 sm:me-3",
							"[background:var(--primary)] [color:var(--primary-contrast)]",
							"[box-shadow:0_0_12px_color-mix(in_srgb,var(--primary)_30%,transparent)]",
							"hover:opacity-90",
						)}
						onClick={onNewEvent}
					>
						<PlusIcon
							className="opacity-80 sm:-ms-1"
							size={16}
							aria-hidden="true"
						/>
						<span className="max-sm:sr-only">New event</span>
					</button>
				</div>
			</div>

			{/* Divider */}
			<div className="h-px [background:linear-gradient(90deg,transparent,color-mix(in_srgb,var(--primary)_14%,transparent),transparent)]" />
		</div>
	);
}
