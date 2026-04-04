// src/components/ui/checkbox.tsx

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import "./ui.global.css";

type CheckboxProps = React.ComponentPropsWithoutRef<
	typeof CheckboxPrimitive.Root
>;

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
	({ className, ...props }, ref) => (
		<CheckboxPrimitive.Root
			ref={ref}
			className={cn("suite-ui-checkbox", className)}
			{...props}
		>
			<CheckboxPrimitive.Indicator className="suite-ui-checkbox-indicator">
				<Check className="suite-ui-checkbox-icon" strokeWidth={3} />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	),
);
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
