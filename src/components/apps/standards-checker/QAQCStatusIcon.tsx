import { AlertTriangle, CheckCircle, FileText, XCircle } from "lucide-react";
import type { DrawingAnnotation } from "./qaqcModels";

interface QAQCStatusIconProps {
	status: DrawingAnnotation["qa_status"];
	className?: string;
}

export function QAQCStatusIcon({ status, className }: QAQCStatusIconProps) {
	switch (status) {
		case "pass":
			return (
				<CheckCircle
					className={className ?? "w-5 h-5 [color:var(--success)]"}
				/>
			);
		case "fail":
			return (
				<XCircle className={className ?? "w-5 h-5 [color:var(--danger)]"} />
			);
		case "warning":
			return (
				<AlertTriangle
					className={className ?? "w-5 h-5 [color:var(--warning)]"}
				/>
			);
		default:
			return (
				<FileText
					className={className ?? "w-5 h-5 [color:var(--text-muted)]"}
				/>
			);
	}
}
