import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "./..lib/utils";

interface SelectContextValue {
	value?: string;
	onValueChange?: (value: string) => void;
	open: boolean;
	setOpen: (open: boolean) => void;
}

const SelectContext = React.createContext<SelectContextValue>({
	open: false,
	setOpen: () => {},
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
	return (
		<SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
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
	const { open, setOpen } = React.useContext(SelectContext);
	return (
		<button
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
	const { open, setOpen } = React.useContext(SelectContext);
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
				"absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
				className,
			)}
		>
			{children}
		</div>
	);
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
