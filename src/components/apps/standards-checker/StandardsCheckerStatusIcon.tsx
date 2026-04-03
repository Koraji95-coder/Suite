import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import styles from "./StandardsChecker.module.css";
import type { CheckResult } from "@/features/standards-checker/standardsCheckerModels";

interface StandardsCheckerStatusIconProps {
	status: CheckResult["status"];
}

export function StandardsCheckerStatusIcon({
	status,
}: StandardsCheckerStatusIconProps) {
	if (status === "pass") {
		return <CheckCircle className={`${styles.iconSm} ${styles.iconPass}`} />;
	}
	if (status === "warning") {
		return (
			<AlertTriangle className={`${styles.iconSm} ${styles.iconWarning}`} />
		);
	}
	return <XCircle className={`${styles.iconSm} ${styles.iconFail}`} />;
}
