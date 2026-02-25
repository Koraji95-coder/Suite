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
	success: "bg-green-50 border-green-200 text-green-900",
	error: "bg-red-50 border-red-200 text-red-900",
	warning: "bg-yellow-50 border-yellow-200 text-yellow-900",
	info: "bg-blue-50 border-blue-200 text-blue-900",
};

const iconColorMap = {
	success: "text-green-500",
	error: "text-red-500",
	warning: "text-yellow-500",
	info: "text-blue-500",
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
		<div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
			<div className="flex flex-col gap-2 pointer-events-auto">
				{notifications.map((notification) => (
					<ToastItem key={notification.id} notification={notification} />
				))}
			</div>
		</div>
	);
}
