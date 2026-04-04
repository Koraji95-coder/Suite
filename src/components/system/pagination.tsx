// src/components/ui/pagination.tsx

import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import "./ui.global.css";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
	return (
		<nav
			role="navigation"
			aria-label="pagination"
			className={cn("suite-ui-pagination", className)}
			{...props}
		/>
	);
}
Pagination.displayName = "Pagination";

const PaginationContent = React.forwardRef<
	HTMLUListElement,
	React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
	<ul
		ref={ref}
		className={cn("suite-ui-pagination-content", className)}
		{...props}
	/>
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<
	HTMLLIElement,
	React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
	<li ref={ref} className={className} {...props} />
));
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = {
	isActive?: boolean;
} & React.ComponentProps<"a">;

function PaginationLink({
	className,
	isActive,
	...props
}: PaginationLinkProps) {
	return (
		<a
			aria-current={isActive ? "page" : undefined}
			className={cn(
				"suite-ui-pagination-link",
				isActive && "suite-ui-pagination-link-active",
				className,
			)}
			{...props}
		/>
	);
}
PaginationLink.displayName = "PaginationLink";

function PaginationPrevious({
	className,
	...props
}: React.ComponentProps<typeof PaginationLink>) {
	return (
		<PaginationLink
			aria-label="Go to previous page"
			className={cn("suite-ui-pagination-link-arrow", className)}
			{...props}
		>
			<ChevronLeft className="suite-ui-pagination-icon" />
			<span>Previous</span>
		</PaginationLink>
	);
}
PaginationPrevious.displayName = "PaginationPrevious";

function PaginationNext({
	className,
	...props
}: React.ComponentProps<typeof PaginationLink>) {
	return (
		<PaginationLink
			aria-label="Go to next page"
			className={cn("suite-ui-pagination-link-arrow", className)}
			{...props}
		>
			<span>Next</span>
			<ChevronRight className="suite-ui-pagination-icon" />
		</PaginationLink>
	);
}
PaginationNext.displayName = "PaginationNext";

function PaginationEllipsis({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			aria-hidden
			className={cn("suite-ui-pagination-ellipsis", className)}
			{...props}
		>
			<MoreHorizontal className="suite-ui-pagination-icon" />
			<span className="sr-only">More pages</span>
		</span>
	);
}
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
	Pagination,
	PaginationContent,
	PaginationLink,
	PaginationItem,
	PaginationPrevious,
	PaginationNext,
	PaginationEllipsis,
};
