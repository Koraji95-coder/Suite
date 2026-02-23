import { Check } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
	({ className, checked = false, onCheckedChange, id }, ref) => {
		return (
			<button
				ref={ref}
				role="checkbox"
				aria-checked={checked}
				id={id}
				data-state={checked ? "checked" : "unchecked"}
				className={cn(
					"peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
					checked && "bg-primary text-primary-foreground",
					className,
				)}
				onClick={() => onCheckedChange?.(!checked)}
				type="button"
			>
				{checked && <Check className="h-3.5 w-3.5 mx-auto" />}
			</button>
		);
	},
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
