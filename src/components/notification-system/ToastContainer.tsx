/**
 * Toast notification UI component
 * Displays notifications from the NotificationContext
 */

import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from "lucide-react";
import { Notification, useNotification } from "../../auth/NotificationContext";
import { cn } from "../../lib/utils";
import styles from "./ToastContainer.module.css";

const iconMap = {
	success: CheckCircle,
	error: AlertCircle,
	warning: AlertTriangle,
	info: Info,
};

const colorMap = {
	success: styles.toastSuccess,
	error: styles.toastError,
	warning: styles.toastWarning,
	info: styles.toastInfo,
};

const iconColorMap = {
	success: styles.iconSuccess,
	error: styles.iconError,
	warning: styles.iconWarning,
	info: styles.iconInfo,
};

function ToastItem({ notification }: { notification: Notification }) {
	const { dismissNotification } = useNotification();
	const Icon = iconMap[notification.type];

	return (
		<div
			className={cn(
				styles.toast,
				styles.animateIn,
				colorMap[notification.type],
			)}
		>
			<Icon className={cn(styles.icon, iconColorMap[notification.type])} />

			<div className={styles.content}>
				<div className={styles.title}>{notification.title}</div>
				{notification.message && (
					<div className={styles.message}>{notification.message}</div>
				)}
				{notification.action && (
					<button
						onClick={notification.action.onClick}
						className={styles.actionButton}
					>
						{notification.action.label}
					</button>
				)}
			</div>

			<button
				onClick={() => dismissNotification(notification.id)}
				className={styles.dismissButton}
				aria-label="Dismiss notification"
			>
				<X className={styles.dismissIcon} />
			</button>
		</div>
	);
}

export function ToastContainer() {
	const { notifications } = useNotification();

	if (notifications.length === 0) return null;

	return (
		<div className={styles.container} style={{ zIndex: "var(--z-toast)" }}>
			<div className={styles.stack}>
				{notifications.map((notification) => (
					<ToastItem key={notification.id} notification={notification} />
				))}
			</div>
		</div>
	);
}
