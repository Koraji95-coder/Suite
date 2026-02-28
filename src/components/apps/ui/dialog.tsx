import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface DialogProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
	if (!open) return null;
	if (typeof document === "undefined") return null;

	return createPortal(
		<div className="fixed inset-0 z-[120]">
			<div
				className="fixed inset-0 bg-[color:rgb(10_10_10_/_0.72)]"
				onClick={() => onOpenChange?.(false)}
			/>
			<div className="fixed inset-0 flex items-end justify-center overflow-y-auto p-2 sm:items-center sm:p-4">
				{children}
			</div>
		</div>,
		document.body,
	);
}

export function DialogContent({
	className,
	children,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"relative z-50 w-full max-w-lg rounded-xl border border-border bg-background p-4 shadow-lg sm:p-6",
				"my-2 max-h-[calc(100dvh-1rem)] overflow-y-auto sm:my-6 sm:max-h-[min(88dvh,760px)]",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export function DialogHeader({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"flex flex-col space-y-1.5 text-center sm:text-left",
				className,
			)}
			{...props}
		/>
	);
}

export function DialogTitle({
	className,
	...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
	return (
		<h2
			className={cn(
				"text-lg font-semibold leading-none tracking-tight text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function DialogDescription({
	className,
	...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
	return (
		<p className={cn("text-sm text-muted-foreground", className)} {...props} />
	);
}

export function DialogFooter({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
				className,
			)}
			{...props}
		/>
	);
}
