// src/components/system/PageFrame.tsx
import { type ReactNode } from "react";
import { Container, Heading, Stack, Text } from "@/components/system/base";
import { cn } from "@/lib/utils";
import styles from "./PageFrame.module.css";

interface PageFrameProps {
	children: ReactNode;
	/** Page title */
	title?: string;
	/** Page description */
	description?: string;
	/** Right-aligned actions */
	actions?: ReactNode;
	/** Max width constraint */
	maxWidth?: "sm" | "md" | "lg" | "xl" | "full";
	/** Additional padding */
	padded?: boolean;
	className?: string;
}

export function PageFrame({
	children,
	title,
	description,
	actions,
	maxWidth = "xl",
	padded = true,
	className,
}: PageFrameProps) {
	// Shell routes now own visible page identity. Keep legacy props in the
	// signature for compatibility, but do not render a second page hero here.
	void title;
	void description;
	void actions;

	return (
		<div className={cn(styles.root, padded && styles.padded, className)}>
			<Container size={maxWidth} padded={padded}>
				<div className={styles.inner}>
					<div className={styles.content}>{children}</div>
				</div>
			</Container>
		</div>
	);
}

interface SectionProps {
	children: ReactNode;
	title?: string;
	description?: string;
	actions?: ReactNode;
	className?: string;
}

export function Section({
	children,
	title,
	description,
	actions,
	className,
}: SectionProps) {
	return (
		<section className={cn(styles.section, className)}>
			{(title || description || actions) && (
				<div className={styles.sectionHeader}>
					<Stack gap={0} className={styles.sectionText}>
						{title && <Heading level={3}>{title}</Heading>}
						{description && (
							<Text
								color="muted"
								size="xs"
								className={styles.sectionDescription}
							>
								{description}
							</Text>
						)}
					</Stack>
					{actions && <div className={styles.sectionActions}>{actions}</div>}
				</div>
			)}
			{children}
		</section>
	);
}
