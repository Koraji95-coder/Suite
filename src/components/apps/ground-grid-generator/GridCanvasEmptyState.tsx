interface GridCanvasEmptyStateProps {
	message: string;
}

export function GridCanvasEmptyState({ message }: GridCanvasEmptyStateProps) {
	return (
		<div className="flex min-h-[min(300px,50vh)] items-center justify-center text-sm text-text-muted">
			{message}
		</div>
	);
}
