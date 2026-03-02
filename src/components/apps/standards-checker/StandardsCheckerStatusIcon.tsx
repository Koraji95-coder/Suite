import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import type { CheckResult } from "./standardsCheckerModels";

interface StandardsCheckerStatusIconProps {
	status: CheckResult["status"];
}

export function StandardsCheckerStatusIcon({
	status,
}: StandardsCheckerStatusIconProps) {
	if (status === "pass") {
		return <CheckCircle className="h-4 w-4 [color:var(--success)]" />;
	}
	if (status === "warning") {
		return <AlertTriangle className="h-4 w-4 [color:var(--warning)]" />;
	}
	return <XCircle className="h-4 w-4 [color:var(--danger)]" />;
}
