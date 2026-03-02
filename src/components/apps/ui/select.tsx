import { ChevronDown } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface SelectContextValue {
	value?: string;
	onValueChange?: (value: string) => void;
	open: boolean;
	setOpen: (open: boolean) => void;
	triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const SelectContext = React.createContext<SelectContextValue>({
	open: false,
	setOpen: (_open: boolean) => undefined,
	triggerRef: { current: null },
});

export function Select({
	value,
	onValueChange,
	children,
}: {
	value?: string;
	onValueChange?: (v: string) => void;
	children: React.ReactNode;
}) {
	const [open, setOpen] = React.useState(false);
	const triggerRef = React.useRef<HTMLButtonElement | null>(null);
	return (
		<SelectContext.Provider
			value={{ value, onValueChange, open, setOpen, triggerRef }}
		>
			<div className="relative">{children}</div>
		</SelectContext.Provider>
	);
}

export function SelectTrigger({
	className,
	children,
	id,
}: {
	className?: string;
	children: React.ReactNode;
	id?: string;
}) {
	const { open, setOpen, triggerRef } = React.useContext(SelectContext);
	return (
		<button
			ref={triggerRef}
			id={id}
			type="button"
			className={cn(
				"flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-foreground cursor-pointer",
				className,
			)}
			onClick={() => setOpen(!open)}
			aria-expanded={open}
		>
			{children}
			<ChevronDown className="h-4 w-4 opacity-50" />
		</button>
	);
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
	const { value } = React.useContext(SelectContext);
	return (
		<span className={cn(!value && "text-muted-foreground")}>
			{value || placeholder}
		</span>
	);
}

export function SelectContent({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	const { open, setOpen, triggerRef } = React.useContext(SelectContext);
	const ref = React.useRef<HTMLDivElement>(null);
	const [{ top, left, width }, setPosition] = React.useState({
		top: 0,
		left: 0,
		width: 0,
	});
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
		setPosition({
			top: rect.bottom + 4,
			left: rect.left,
			width: rect.width,
		});
	}, [triggerRef]);

	React.useLayoutEffect(() => {
		if (!open) return;
		updatePosition();
	}, [open, updatePosition]);

	React.useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
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

		document.addEventListener("mousedown", handler);
		document.addEventListener("keydown", onKeyDown);
		window.addEventListener("resize", onReposition);
		window.addEventListener("scroll", onReposition, true);
		return () => {
			document.removeEventListener("mousedown", handler);
			document.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("resize", onReposition);
			window.removeEventListener("scroll", onReposition, true);
		};
	}, [open, setOpen, triggerRef, updatePosition]);

	if (!open || typeof document === "undefined") return null;

	const content = (
		<div
			ref={ref}
			style={{
				top,
				left,
				width,
				zIndex: layerZIndex,
			}}
			className={cn(
				"fixed max-h-60 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
				className,
			)}
		>
			{children}
		</div>
	);

	return createPortal(content, document.body);
}

export function SelectItem({
	value,
	children,
	className,
}: {
	value: string;
	children: React.ReactNode;
	className?: string;
}) {
	const {
		value: selected,
		onValueChange,
		setOpen,
	} = React.useContext(SelectContext);
	return (
		<div
			className={cn(
				"relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
				selected === value && "bg-accent text-accent-foreground",
				className,
			)}
			onClick={() => {
				onValueChange?.(value);
				setOpen(false);
			}}
		>
			{children}
		</div>
	);
}
