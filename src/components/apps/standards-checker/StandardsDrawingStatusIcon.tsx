import { AlertTriangle, CheckCircle, FileText, XCircle } from "lucide-react";
import type { CSSProperties } from "react";
import type { DrawingAnnotation } from "@/features/standards-checker/standardsDrawingModels";

interface StandardsDrawingStatusIconProps {
	status: DrawingAnnotation["qa_status"];
	className?: string;
}

export function StandardsDrawingStatusIcon({
	status,
	className,
}: StandardsDrawingStatusIconProps) {
	const defaultStyle: CSSProperties = {
		width: "1.1rem",
		height: "1.1rem",
	};

	switch (status) {
		case "pass":
			return (
				<CheckCircle
					className={className}
					style={
						className ? undefined : { ...defaultStyle, color: "var(--success)" }
					}
				/>
			);
		case "fail":
			return (
				<XCircle
					className={className}
					style={
						className ? undefined : { ...defaultStyle, color: "var(--danger)" }
					}
				/>
			);
		case "warning":
			return (
				<AlertTriangle
					className={className}
					style={
						className ? undefined : { ...defaultStyle, color: "var(--warning)" }
					}
				/>
			);
		default:
			return (
				<FileText
					className={className}
					style={
						className
							? undefined
							: { ...defaultStyle, color: "var(--text-muted)" }
					}
				/>
			);
	}
}
