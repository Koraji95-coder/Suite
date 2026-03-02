import { type ReactNode, useCallback } from "react";
import { useNotification } from "@/auth/NotificationContext";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastApi {
	showToast: (type: ToastType, message: string) => void;
}

/**
 * Compatibility hook for existing call sites.
 * Internally delegates to NotificationContext so we keep a single toast system.
 */
export function useToast(): ToastApi {
	const notification = useNotification();

	const showToast = useCallback(
		(type: ToastType, message: string) => {
			const text = message.trim();
			if (!text) return;
			notification.showNotification({
				type,
				title: text,
			});
		},
		[notification],
	);

	return { showToast };
}

/**
 * Kept for backward compatibility with previous provider composition.
 * This provider no longer owns toast state.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
	return <>{children}</>;
}
