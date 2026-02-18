import * as React from "react";
import { cn } from "@/lib/utils";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isBefore,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarProps {
  mode?: "single";
  selected?: Date;
  defaultMonth?: Date;
  onSelect?: (date: Date | undefined) => void;
  disabled?: { before?: Date };
  className?: string;
}

export function Calendar({ selected, defaultMonth, onSelect, disabled, className }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState(defaultMonth || selected || new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const days: Date[] = [];
  let day = calStart;
  while (day <= calEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const isDisabled = (d: Date) => {
    if (disabled?.before && isBefore(d, disabled.before)) return true;
    return false;
  };

  return (
    <div className={cn("p-3", className)}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-1 rounded hover:bg-accent text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-foreground">{format(currentMonth, "MMMM yyyy")}</span>
        <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-1 rounded hover:bg-accent text-muted-foreground">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <th key={d} className="text-muted-foreground text-xs font-normal p-2 text-center">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((d, di) => {
                const inMonth = isSameMonth(d, currentMonth);
                const sel = selected && isSameDay(d, selected);
                const dis = isDisabled(d);
                const today = isSameDay(d, new Date());
                return (
                  <td key={di} className="p-0 text-center">
                    <button
                      type="button"
                      disabled={dis}
                      onClick={() => !dis && onSelect?.(d)}
                      className={cn(
                        "h-8 w-8 rounded-md text-sm mx-auto flex items-center justify-center cursor-pointer",
                        !inMonth && "text-muted-foreground/40",
                        inMonth && !sel && "text-foreground hover:bg-accent",
                        sel && "bg-primary text-primary-foreground",
                        today && !sel && "border border-primary/50",
                        dis && "opacity-30 cursor-not-allowed"
                      )}
                    >
                      {format(d, "d")}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

