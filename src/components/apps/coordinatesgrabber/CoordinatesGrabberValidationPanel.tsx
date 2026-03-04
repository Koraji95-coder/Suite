import { hexToRgba } from "@/lib/palette";

interface CoordinatesGrabberValidationPanelProps {
	errors: string[];
}

export function CoordinatesGrabberValidationPanel({
	errors,
}: CoordinatesGrabberValidationPanelProps) {
	if (errors.length === 0) return null;

	return (
		<div
			style={{
				gridColumn: "1 / -1",
				padding: "12px",
				borderRadius: "8px",
				background: hexToRgba("#ff6b6b", 0.1),
				border: `1px solid ${hexToRgba("#ff6b6b", 0.3)}`,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "8px",
					marginBottom: "8px",
				}}
			>
				<span style={{ fontSize: "14px", color: "#ff6b6b" }}>!</span>
				<span
					style={{
						color: "#ff6b6b",
						fontSize: "12px",
						fontWeight: "600",
					}}
				>
					Validation Errors
				</span>
			</div>
			<ul
				style={{
					margin: "0",
					paddingLeft: "20px",
					color: "#ff6b6b",
					fontSize: "11px",
				}}
			>
				{errors.map((err, idx) => (
					<li key={idx}>{err}</li>
				))}
			</ul>
		</div>
	);
}
