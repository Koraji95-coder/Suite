/**
 * Hook for monitoring Coordinates Grabber Service status
 * Listens for connection state changes and notifies user of issues
 */

import { useEffect } from 'react';
import { useNotification } from "../auth/NotificationContext";
import { coordinatesGrabberService } from "../components/apps/Ground-Grid-Generation/coordinatesGrabberService";

export function useCoordinatesServiceStatus() {
	const { error } = useNotifications();

	useEffect(() => {
		// Subscribe to service-disconnected event
		const unsubscribe = coordinatesGrabberService.on(
			"service-disconnected",
			() => {
				// Show persistent error notification
				error(
					"Coordinates Service Offline",
					"The AutoCAD coordinates service has stopped responding. Restart the server to reconnect.",
					0, // Persistent (no auto-dismiss)
				);
			},
		);

		// Cleanup
		return () => {
			unsubscribe();
		};
	}, [error]);

	return {
		isConnected: coordinatesGrabberService.isConnected(),
	};
}
