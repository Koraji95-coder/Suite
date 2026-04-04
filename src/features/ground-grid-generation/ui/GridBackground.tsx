import { useEffect, useRef } from "react";
import styles from "./GridBackground.module.css";
import { createGridBackgroundEngine } from "./GridBackgroundEngine";

interface GridBackgroundProps {
	opacity?: number;
}

export function GridBackground({ opacity = 0.35 }: GridBackgroundProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		return createGridBackgroundEngine(container);
	}, []);

	return (
		<div
			ref={containerRef}
			aria-hidden="true"
			className={styles.root}
			style={{
				opacity,
				zIndex: 0,
				borderRadius: "inherit",
				contain: "paint",
			}}
		/>
	);
}
