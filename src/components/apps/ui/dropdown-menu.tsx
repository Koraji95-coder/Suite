import * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownMenuContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue>({
	open: false,
	setOpen: () => {},
});

export function DropdownMenu({ children }: { children: React.ReactNode }) {
	const [open, setOpen] = React.useState(false);
	return (
		<DropdownMenuContext.Provider value={{ open, setOpen }}>
			<div className="relative inline-block">{children}</div>
		</DropdownMenuContext.Provider>
	);
}

export function DropdownMenuTrigger({
	asChild,
	children,
	className,
}: {
	asChild?: boolean;
	children: React.ReactNode;
	className?: string;
}) {
	const { open, setOpen } = React.useContext(DropdownMenuContext);

	if (asChild && React.isValidElement(children)) {
		return React.cloneElement(
			children as React.ReactElement<Record<string, unknown>>,
			{
				onClick: (e: React.MouseEvent) => {
					(
						children as React.ReactElement<{
							onClick?: (e: React.MouseEvent) => void;
						}>
					).props.onClick?.(e);
					setOpen(!open);
				},
			},
		);
	}

	return (
		<button type="button" className={className} onClick={() => setOpen(!open)}>
			{children}
		</button>
	);
}

export function DropdownMenuContent({
	children,
	className,
	align = "start",
}: {
	children: React.ReactNode;
	className?: string;
	align?: "start" | "center" | "end";
}) {
	const { open, setOpen } = React.useContext(DropdownMenuContext);
	const ref = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open, setOpen]);

	if (!open) return null;
	return (
		<div
			ref={ref}
			className={cn(
				"absolute z-50 mt-2 min-w-[8rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
				align === "start" && "left-0",
				align === "center" && "left-1/2 -translate-x-1/2",
				align === "end" && "right-0",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function DropdownMenuItem({
	children,
	className,
	onClick,
}: {
	children: React.ReactNode;
	className?: string;
	onClick?: () => void;
}) {
	const { setOpen } = React.useContext(DropdownMenuContext);
	return (
		<div
			className={cn(
				"relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
				className,
			)}
			onClick={() => {
				onClick?.();
				setOpen(false);
			}}
		>
			{children}
		</div>
	);
}

export function DropdownMenuShortcut({
	className,
	...props
}: React.HTMLAttributes<HTMLSpanElement>) {
	return (
		<span
			className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
			{...props}
		/>
	);
}
