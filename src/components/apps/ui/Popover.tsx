import * as React from "react";
import { createPortal } from "react-dom";
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
			<div className="relative">{children}</div>
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
	const { open, setOpen, modal, triggerRef } = React.useContext(PopoverContext);
	const ref = React.useRef<HTMLDivElement>(null);
	const [{ top, left }, setPosition] = React.useState({ top: 0, left: 0 });
	const { style, ...restProps } = props;
	const inDialog = Boolean(
		triggerRef.current?.closest("[data-ui-dialog-content='true']"),
	);
	const layerZIndex = inDialog
		? "calc(var(--z-dialog) + 1)"
		: "var(--z-dropdown)";

	const updatePosition = React.useCallback(() => {
		const trigger = triggerRef.current;
		if (!trigger) return;

		const rect = trigger.getBoundingClientRect();
		const nextLeft =
			align === "start"
				? rect.left
				: align === "end"
					? rect.right
					: rect.left + rect.width / 2;
		setPosition({
			top: rect.bottom + 8,
			left: nextLeft,
		});
	}, [align, triggerRef]);

	React.useLayoutEffect(() => {
		if (!open) return;
		updatePosition();
	}, [open, updatePosition]);

	React.useEffect(() => {
		if (!open) return;

		const onMouseDown = (e: MouseEvent) => {
			const target = e.target as Node;
			const clickedInTrigger =
				triggerRef.current && triggerRef.current.contains(target);
			if (clickedInTrigger) return;
			if (ref.current && !ref.current.contains(target)) setOpen(false);
		};

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};

		const onReposition = () => updatePosition();

		document.addEventListener("mousedown", onMouseDown);
		document.addEventListener("keydown", onKeyDown);
		window.addEventListener("resize", onReposition);
		window.addEventListener("scroll", onReposition, true);

		return () => {
			document.removeEventListener("mousedown", onMouseDown);
			document.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("resize", onReposition);
			window.removeEventListener("scroll", onReposition, true);
		};
	}, [open, setOpen, triggerRef, updatePosition]);

	if (!open || typeof document === "undefined") return null;

	const content = (
		<>
			{/* Minimal “modal” behavior: overlay exists when modal=true */}
			{modal && (
				<div
					className="fixed inset-0"
					style={{ zIndex: layerZIndex }}
					onMouseDown={() => setOpen(false)}
					aria-hidden="true"
				/>
			)}

			<div
				ref={ref}
				role={modal ? "dialog" : "menu"}
				aria-modal={modal ? true : undefined}
				style={{
					top,
					left,
					zIndex: layerZIndex,
					...style,
				}}
				className={cn(
					"fixed rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md outline-none",
					align === "center" && "-translate-x-1/2",
					align === "end" && "-translate-x-full",
					className,
				)}
				{...restProps}
			>
				{children}
			</div>
		</>
	);

	return createPortal(content, document.body);
}
