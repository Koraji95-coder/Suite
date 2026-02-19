/**
 * Unified notification/toast system for the Suite application
 * Provides consistent user feedback across all components
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { logger } from '@/lib/logger';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number; // milliseconds, 0 = persistent
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationContextValue {
  notifications: Notification[];
  showNotification: (notification: Omit<Notification, 'id'>) => string;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
  // Convenience methods
  success: (title: string, message?: string, duration?: number) => string;
  error: (title: string, message?: string, duration?: number) => string;
  warning: (title: string, message?: string, duration?: number) => string;
  info: (title: string, message?: string, duration?: number) => string;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const DEFAULT_DURATION = 5000; // 5 seconds

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const generateId = useCallback(() => {
    return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const showNotification = useCallback(
    (notification: Omit<Notification, 'id'>): string => {
      const id = generateId();
      const newNotification: Notification = {
        ...notification,
        id,
        duration: notification.duration ?? DEFAULT_DURATION,
      };

      setNotifications((prev) => [...prev, newNotification]);

      // Auto-dismiss if duration is set
      if (newNotification.duration && newNotification.duration > 0) {
        setTimeout(() => {
          dismissNotification(id);
        }, newNotification.duration);
      }

      // Log notification for debugging
      logger.debug('Notification shown', 'NotificationContext', {
        type: notification.type,
        title: notification.title,
      });

      return id;
    },
    [generateId]
  );

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Convenience methods
  const success = useCallback(
    (title: string, message?: string, duration?: number) =>
      showNotification({ type: 'success', title, message, duration }),
    [showNotification]
  );

  const error = useCallback(
    (title: string, message?: string, duration?: number) =>
      showNotification({ type: 'error', title, message, duration }),
    [showNotification]
  );

  const warning = useCallback(
    (title: string, message?: string, duration?: number) =>
      showNotification({ type: 'warning', title, message, duration }),
    [showNotification]
  );

  const info = useCallback(
    (title: string, message?: string, duration?: number) =>
      showNotification({ type: 'info', title, message, duration }),
    [showNotification]
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        showNotification,
        dismissNotification,
        clearAll,
        success,
        error,
        warning,
        info,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
