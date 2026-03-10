// src/components/LoadingCard.tsx
import { Panel, Progress, Stack, Text } from "@/components/primitives";
import "./ui.global.css";

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
		<Panel variant="default" padding="lg" className="suite-ui-loading-card">
			<Stack gap={4} align="center">
				{/* Spinner */}
				<div className="suite-ui-loading-spinner">
					<div className="suite-ui-loading-ring-base" />
					<div className="suite-ui-loading-ring-spin" />
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
					<Progress value={progress} showValue className="suite-ui-loading-progress" />
				)}
			</Stack>
		</Panel>
	);
}
