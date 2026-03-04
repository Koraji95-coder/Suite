// src/components/ui/radio-group.tsx

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type RadioGroupProps = React.ComponentPropsWithoutRef<
	typeof RadioGroupPrimitive.Root
>;
type RadioGroupItemProps = React.ComponentPropsWithoutRef<
	typeof RadioGroupPrimitive.Item
>;

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
	({ className, ...props }, ref) => (
		<RadioGroupPrimitive.Root
			className={cn("grid gap-2", className)}
			{...props}
			ref={ref}
		/>
	),
);
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<HTMLButtonElement, RadioGroupItemProps>(
	({ className, ...props }, ref) => (
		<RadioGroupPrimitive.Item
			ref={ref}
			className={cn(
				"aspect-square h-5 w-5 rounded-full border border-border bg-bg",
				"hover:border-border-strong",
				"focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"data-[state=checked]:border-primary",
				"transition-colors duration-150",
				className,
			)}
			{...props}
		>
			<RadioGroupPrimitive.Indicator className="flex items-center justify-center">
				<Circle className="h-2.5 w-2.5 fill-primary text-primary" />
			</RadioGroupPrimitive.Indicator>
		</RadioGroupPrimitive.Item>
	),
);
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
