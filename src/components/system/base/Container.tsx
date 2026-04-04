import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import styles from "./Container.module.css";

type ContainerSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
	size?: ContainerSize;
	padded?: boolean;
}

export function Container({
	size = "xl",
	padded = true,
	className,
	children,
	...props
}: ContainerProps) {
	return (
		<div
			className={cn(
				styles.root,
				styles[size],
				padded && styles.padded,
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}
