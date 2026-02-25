import {
	autoUpdate,
	FloatingFocusManager,
	FloatingOverlay,
	FloatingPortal,
	flip,
	offset,
	type Placement,
	shift,
	useClick,
	useDismiss,
	useFloating,
	useInteractions,
	useRole,
} from "@floating-ui/react";
import * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownMenuContextValue {
	open: boolean;
	setOpen: (open: boolean) => void;
	context: ReturnType<typeof useFloating>["context"];
	refs: ReturnType<typeof useFloating>["refs"];
	floatingStyles: React.CSSProperties;
	getReferenceProps: ReturnType<typeof useInteractions>["getReferenceProps"];
	getFloatingProps: ReturnType<typeof useInteractions>["getFloatingProps"];
	placement: Placement;
	modal: boolean;
}

const DropdownMenuContext =
	React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenuContext() {
	const ctx = React.useContext(DropdownMenuContext);
	if (!ctx) {
		throw new Error(
			"DropdownMenu components must be used within <DropdownMenu />",
		);
	}
	return ctx;
}

export function DropdownMenu({
	children,
	open: controlledOpen,
	onOpenChange,
	modal = false,
	placement = "bottom-end",
	offsetPx = 8,
}: {
	children: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	modal?: boolean;
	placement?: Placement;
	offsetPx?: number;
}) {
	const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen : uncontrolledOpen;

	const setOpen = React.useCallback(
		(v: boolean) => {
			onOpenChange?.(v);
			if (!isControlled) setUncontrolledOpen(v);
		},
		[isControlled, onOpenChange],
	);

	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange: setOpen,
		placement,
		whileElementsMounted: autoUpdate,
		middleware: [offset(offsetPx), flip({ padding: 8 }), shift({ padding: 8 })],
	});

	const click = useClick(context, { toggle: true });
	const dismiss = useDismiss(context, { outsidePressEvent: "mousedown" });
	const role = useRole(context, { role: "menu" });

	const { getReferenceProps, getFloatingProps } = useInteractions([
		click,
		dismiss,
		role,
	]);

	return (
		<DropdownMenuContext.Provider
			value={{
				open,
				setOpen,
				context,
				refs,
				floatingStyles,
				getReferenceProps,
				getFloatingProps,
				placement,
				modal,
			}}
		>
			{children}
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
	const { refs, getReferenceProps } = useDropdownMenuContext();

	if (asChild && React.isValidElement(children)) {
		return React.cloneElement(
			children as React.ReactElement<Record<string, unknown>>,
			{
				ref: refs.setReference,
				...getReferenceProps(
					(children as React.ReactElement<Record<string, unknown>>).props,
				),
			},
		);
	}

	return (
		<button
			ref={refs.setReference}
			type="button"
			className={className}
			{...getReferenceProps()}
		>
			{children}
		</button>
	);
}

export function DropdownMenuContent({
	children,
	className,
	align = "start",
	side = "bottom",
	showOverlay = false,
}: {
	children: React.ReactNode;
	className?: string;
	align?: "start" | "center" | "end";
	side?: "top" | "right" | "bottom" | "left";
	showOverlay?: boolean;
}) {
	const {
		open,
		refs,
		context,
		floatingStyles,
		getFloatingProps,
		modal,
		setOpen,
	} = useDropdownMenuContext();

	if (!open) return null;

	const placement = `${side}-${align}`;

	const content = (
		<div
			ref={refs.setFloating}
			className={cn("dropdown-menu-content", className)}
			style={floatingStyles}
			{...getFloatingProps()}
			data-placement={placement}
		>
			{children}
		</div>
	);

	return (
		<FloatingPortal>
			{showOverlay ? (
				<FloatingOverlay
					lockScroll={modal}
					style={{ background: "transparent" }}
					onClick={() => setOpen(false)}
				>
					<FloatingFocusManager context={context} modal={modal}>
						{content}
					</FloatingFocusManager>
				</FloatingOverlay>
			) : (
				<FloatingFocusManager context={context} modal={modal}>
					{content}
				</FloatingFocusManager>
			)}
		</FloatingPortal>
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
	const { setOpen } = useDropdownMenuContext();
	return (
		<div
			className={cn("dropdown-menu-item", className)}
			role="menuitem"
			tabIndex={0}
			onClick={() => {
				onClick?.();
				setOpen(false);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick?.();
					setOpen(false);
				}
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
		<span className={cn("dropdown-menu-shortcut", className)} {...props} />
	);
}
