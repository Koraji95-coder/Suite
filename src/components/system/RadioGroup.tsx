// src/components/ui/radio-group.tsx

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import "./ui.global.css";

type RadioGroupProps = React.ComponentPropsWithoutRef<
	typeof RadioGroupPrimitive.Root
>;
type RadioGroupItemProps = React.ComponentPropsWithoutRef<
	typeof RadioGroupPrimitive.Item
>;

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
	({ className, ...props }, ref) => (
		<RadioGroupPrimitive.Root
			className={cn("suite-ui-radio-group", className)}
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
			className={cn("suite-ui-radio-item", className)}
			{...props}
		>
			<RadioGroupPrimitive.Indicator className="suite-ui-radio-indicator">
				<Circle className="suite-ui-radio-icon" />
			</RadioGroupPrimitive.Indicator>
		</RadioGroupPrimitive.Item>
	),
);
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };
