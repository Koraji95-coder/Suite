// src/components/ui/popover.tsx

import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";
import { cn } from "@/lib/utils";
import "./ui.global.css";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

type PopoverContentProps = React.ComponentPropsWithoutRef<
	typeof PopoverPrimitive.Content
>;

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
	({ className, align = "center", sideOffset = 4, ...props }, ref) => (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				ref={ref}
				align={align}
				sideOffset={sideOffset}
				className={cn("suite-ui-popover-content", className)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	),
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
