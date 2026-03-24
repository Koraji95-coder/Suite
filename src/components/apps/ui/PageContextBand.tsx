import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "./PageContextBand.module.css";

interface PageContextBandProps {
	eyebrow?: string;
	summary?: ReactNode;
	meta?: ReactNode;
	actions?: ReactNode;
	children?: ReactNode;
	mode?: "hero" | "compact";
	className?: string;
}

export function PageContextBand({
	eyebrow,
	summary,
	meta,
	actions,
	children,
	mode = "hero",
	className,
}: PageContextBandProps) {
	return (
		<section
			data-page-context-band={mode}
			className={cn(
				styles.band,
				mode === "hero" ? styles.bandHero : styles.bandCompact,
				className,
			)}
		>
			{eyebrow || summary || meta || actions ? (
				<div className={styles.main}>
					<div className={styles.intro}>
						{eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
						{summary ? <div className={styles.summary}>{summary}</div> : null}
					</div>
					{meta || actions ? (
						<div className={styles.aside}>
							{meta ? <div className={styles.meta}>{meta}</div> : null}
							{actions ? <div className={styles.actions}>{actions}</div> : null}
						</div>
					) : null}
				</div>
			) : null}

			{children ? <div className={styles.body}>{children}</div> : null}
		</section>
	);
}
