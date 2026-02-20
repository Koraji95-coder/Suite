/**
 * Hook for monitoring Coordinates Grabber Service status
 * Listens for connection state changes and notifies user of issues
 */

import { useEffect } from 'react';
import { coordinatesGrabberService } from '@/Ground-Grid-Generation/coordinatesGrabberService';
import { useNotifications } from '@/contexts/NotificationContext';

export function useCoordinatesServiceStatus() {
  const { error, info } = useNotifications();

  useEffect(() => {
    // Subscribe to service-disconnected event
    const unsubscribe = coordinatesGrabberService.on('service-disconnected', (data) => {
      // Show persistent error notification
      error('Coordinates Service Offline', 
        'The AutoCAD coordinates service has stopped responding. Restart the server to reconnect.',
        0 // Persistent (no auto-dismiss)
      );
    });

    // Cleanup
    return () => {
      unsubscribe();
    };
  }, [error, info]);

  return {
    isConnected: coordinatesGrabberService.isConnected(),
  };
}
