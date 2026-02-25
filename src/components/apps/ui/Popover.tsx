import * as React from "react";
import { cn } from "@/lib/utils";

interface PopoverContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
	triggerRef: React.RefObject<HTMLElement | null>;
	modal: boolean;
}

const PopoverContext = React.createContext<PopoverContextValue>({
	open: false,
	setOpen: (_open: boolean) => undefined,
	triggerRef: { current: null },
	modal: false,
});

export function Popover({
	open: controlledOpen,
	defaultOpen = false,
	onOpenChange,
	modal = false,
	children,
}: {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	modal?: boolean; // ✅ added (fixes <Popover modal> TS error)
	children: React.ReactNode;
}) {
	const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
	const triggerRef = React.useRef<HTMLElement | null>(null);

	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen : internalOpen;

	const setOpen = (v: boolean) => {
		if (!isControlled) setInternalOpen(v);
		onOpenChange?.(v);
	};

	return (
		<PopoverContext.Provider value={{ open, setOpen, triggerRef, modal }}>
			<div className="relative inline-block">{children}</div>
		</PopoverContext.Provider>
	);
}

/** Utility to preserve both refs when cloning asChild */
function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
	return (node: T) => {
		for (const ref of refs) {
			if (!ref) continue;
			if (typeof ref === "function") ref(node);
			else (ref as React.MutableRefObject<T>).current = node;
		}
	};
}

export function PopoverTrigger({
	asChild,
	children,
	className,
	...props
}: {
	asChild?: boolean;
	children: React.ReactNode;
	className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
	const { open, setOpen, triggerRef } = React.useContext(PopoverContext);

	if (asChild && React.isValidElement(children)) {
		const child = children as React.ReactElement<
			Record<string, unknown>,
			string | React.JSXElementConstructor<unknown>
		>;
		const childOnClick = child.props?.onClick as
			| ((e: React.MouseEvent) => void)
			| undefined;

		return React.cloneElement(child, {
			onClick: (e: React.MouseEvent) => {
				childOnClick?.(e);
				setOpen(!open);
			},
			ref: composeRefs(
				(child as unknown as { ref?: React.Ref<unknown> }).ref,
				triggerRef as unknown as React.Ref<unknown>,
			),
		});
	}

	return (
		<div
			ref={triggerRef as unknown as React.RefObject<HTMLDivElement>}
			className={className}
			onClick={() => setOpen(!open)}
			{...props}
		>
			{children}
		</div>
	);
}

export function PopoverAnchor({
	children,
	className,
	...props
}: {
	children: React.ReactNode;
	className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={className} {...props}>
			{children}
		</div>
	);
}

export function PopoverContent({
	children,
	className,
	align = "center",
	...props
}: {
	children: React.ReactNode;
	className?: string;
	align?: "start" | "center" | "end";
} & React.HTMLAttributes<HTMLDivElement>) {
	const { open, setOpen, modal } = React.useContext(PopoverContext);
	const ref = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (!open) return;

		const onMouseDown = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		};

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};

		document.addEventListener("mousedown", onMouseDown);
		document.addEventListener("keydown", onKeyDown);

		return () => {
			document.removeEventListener("mousedown", onMouseDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open, setOpen]);

	if (!open) return null;

	return (
		<>
			{/* Minimal “modal” behavior: overlay exists when modal=true */}
			{modal && (
				<div
					className="fixed inset-0 z-40"
					onMouseDown={() => setOpen(false)}
					aria-hidden="true"
				/>
			)}

			<div
				ref={ref}
				role={modal ? "dialog" : "menu"}
				aria-modal={modal ? true : undefined}
				className={cn(
					"absolute z-50 mt-2 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none",
					modal && "z-50",
					align === "start" && "left-0",
					align === "center" && "left-1/2 -translate-x-1/2",
					align === "end" && "right-0",
					className,
				)}
				{...props}
			>
				{children}
			</div>
		</>
	);
}
