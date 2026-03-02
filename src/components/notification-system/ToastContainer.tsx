/**
 * Toast notification UI component
 * Displays notifications from the NotificationContext
 */

import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from "lucide-react";
import { Notification, useNotification } from "../../auth/NotificationContext";
import { cn } from "../../lib/utils";

const iconMap = {
	success: CheckCircle,
	error: AlertCircle,
	warning: AlertTriangle,
	info: Info,
};

const colorMap = {
	success: "[background:color-mix(in_srgb,var(--success)_10%,var(--surface))] [border-color:var(--success)] [color:var(--success)]",
	error: "[background:color-mix(in_srgb,var(--danger)_10%,var(--surface))] [border-color:var(--danger)] [color:var(--danger)]",
	warning: "[background:color-mix(in_srgb,var(--warning)_10%,var(--surface))] [border-color:var(--warning)] [color:var(--warning)]",
	info: "[background:color-mix(in_srgb,var(--accent)_10%,var(--surface))] [border-color:var(--accent)] [color:var(--accent)]",
};

const iconColorMap = {
	success: "[color:var(--success)]",
	error: "[color:var(--danger)]",
	warning: "[color:var(--warning)]",
	info: "[color:var(--accent)]",
};

function ToastItem({ notification }: { notification: Notification }) {
	const { dismissNotification } = useNotification();
	const Icon = iconMap[notification.type];

	return (
		<div
			className={cn(
				"flex items-start gap-3 p-4 rounded-lg border shadow-lg max-w-md w-full",
				"animate-in slide-in-from-right-full duration-300",
				colorMap[notification.type],
			)}
		>
			<Icon
				className={cn(
					"w-5 h-5 mt-0.5 flex-shrink-0",
					iconColorMap[notification.type],
				)}
			/>

			<div className="flex-1 min-w-0">
				<div className="font-semibold text-sm">{notification.title}</div>
				{notification.message && (
					<div className="text-sm mt-1 opacity-90">{notification.message}</div>
				)}
				{notification.action && (
					<button
						onClick={notification.action.onClick}
						className="text-sm font-medium mt-2 hover:underline"
					>
						{notification.action.label}
					</button>
				)}
			</div>

			<button
				onClick={() => dismissNotification(notification.id)}
				className="flex-shrink-0 hover:opacity-70 transition-opacity"
				aria-label="Dismiss notification"
			>
				<X className="w-4 h-4" />
			</button>
		</div>
	);
}

export function ToastContainer() {
	const { notifications } = useNotification();

	if (notifications.length === 0) return null;

	return (
		<div className="fixed top-4 right-4 flex flex-col gap-2 pointer-events-none" style={{ zIndex: "var(--z-toast)" }}>
			<div className="flex flex-col gap-2 pointer-events-auto">
				{notifications.map((notification) => (
					<ToastItem key={notification.id} notification={notification} />
				))}
			</div>
		</div>
	);
}
