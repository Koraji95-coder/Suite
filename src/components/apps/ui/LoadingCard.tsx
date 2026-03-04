// src/components/LoadingCard.tsx
import { Panel, Progress, Stack, Text } from "@/components/primitives";

interface LoadingCardProps {
	title?: string;
	message?: string;
	progress?: number;
}

export function LoadingCard({
	title = "Loading...",
	message,
	progress,
}: LoadingCardProps) {
	return (
		<Panel variant="default" padding="lg" className="max-w-sm mx-auto">
			<Stack gap={4} align="center">
				{/* Spinner */}
				<div className="relative w-12 h-12">
					<div className="absolute inset-0 rounded-full border-2 border-border" />
					<div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
				</div>

				{/* Text */}
				<Stack gap={1} align="center">
					<Text weight="medium">{title}</Text>
					{message && (
						<Text size="sm" color="muted">
							{message}
						</Text>
					)}
				</Stack>

				{/* Optional progress bar */}
				{progress !== undefined && (
					<Progress value={progress} showValue className="w-full" />
				)}
			</Stack>
		</Panel>
	);
}
