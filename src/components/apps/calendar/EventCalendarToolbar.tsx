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
import styles from "./EventCalendarToolbar.module.css";

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
	const controlSize = compact ? styles.controlCompact : styles.controlRegular;
	const primaryControlSize = compact
		? styles.primaryControlCompact
		: styles.primaryControlRegular;

	return (
		<div
			className={cn(
				styles.root,
				compact ? styles.rootCompact : styles.rootRegular,
			)}
		>
			<div
				className={cn(
					styles.layout,
					compact ? styles.layoutCompact : styles.layoutRegular,
				)}
			>
				{/* Left: Today + nav + view tabs */}
				<div
					className={cn(
						styles.leftGroup,
						compact ? styles.leftGroupCompact : styles.leftGroupRegular,
					)}
				>
					<button
						onClick={onToday}
						className={cn(styles.controlBase, controlSize, styles.todayButton)}
					>
						<CalendarCheck className={styles.todayIcon} aria-hidden="true" />
						<span className={styles.todayLabel}>Today</span>
					</button>

					<div className={styles.navGroup}>
						<button
							onClick={onPrev}
							aria-label="Previous"
							className={styles.navButton}
						>
							<ChevronLeftIcon className={styles.navIcon} aria-hidden="true" />
						</button>
						<button
							onClick={onNext}
							aria-label="Next"
							className={styles.navButton}
						>
							<ChevronRightIcon className={styles.navIcon} aria-hidden="true" />
						</button>
					</div>

					{/* Desktop view tabs */}
					<div className={styles.desktopTabs}>
						{(["month", "week", "day", "agenda"] as CalendarView[]).map((v) => {
							const active = v === view;
							return (
								<button
									key={v}
									type="button"
									onClick={() => onViewChange(v)}
									className={cn(
										styles.viewTab,
										active ? styles.viewTabActive : styles.viewTabInactive,
									)}
								>
									{viewLabel[v]}
								</button>
							);
						})}
					</div>
				</div>

				{/* Center: Title */}
				<div className={styles.titleWrap}>
					<h2
						className={cn(
							styles.title,
							compact ? styles.titleCompact : styles.titleRegular,
						)}
					>
						{viewTitle}
					</h2>
				</div>

				{/* Right: Mobile view dropdown + New event */}
				<div
					className={cn(
						styles.rightGroup,
						compact ? styles.rightGroupCompact : styles.rightGroupRegular,
					)}
				>
					{/* Mobile view dropdown */}
					<div className={styles.mobileOnly}>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									className={cn(
										styles.controlBase,
										controlSize,
										styles.mobileViewButton,
									)}
								>
									<span>{viewLabel[view]}</span>
									<ChevronDownIcon
										className={styles.dropdownChevron}
										size={16}
										aria-hidden="true"
									/>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className={styles.dropdownContent}
							>
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
							styles.controlBase,
							primaryControlSize,
							styles.newEventButton,
						)}
						onClick={onNewEvent}
					>
						<PlusIcon
							className={styles.newEventIcon}
							size={16}
							aria-hidden="true"
						/>
						<span className={styles.newEventLabel}>New event</span>
					</button>
				</div>
			</div>

			{/* Divider */}
			<div className={styles.divider} />
		</div>
	);
}
