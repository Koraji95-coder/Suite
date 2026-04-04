import styles from "./GridCanvasEmptyState.module.css";

interface GridCanvasEmptyStateProps {
	message: string;
}

export function GridCanvasEmptyState({ message }: GridCanvasEmptyStateProps) {
	return <div className={styles.root}>{message}</div>;
}
