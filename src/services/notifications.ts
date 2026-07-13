import { safeSetItem } from '../utils/storage';
import { apiFetch } from '../utils/apiClient';

export type NotificationType = 'render-complete' | 'render-failed';
export type NotificationMethod = 'browser' | 'email' | 'webhook';

export interface NotificationConfig {
  method: NotificationMethod;
  email?: string;
  webhookUrl?: string;
  enabled: boolean;
}

interface NotificationData {
  projectId: string;
  projectTitle: string;
  timestamp: string;
  error?: string;
  videoUrl?: string;
}

let config: NotificationConfig = {
  method: 'browser',
  enabled: true,
};

export function configureNotification(method: NotificationMethod, options: { email?: string; webhookUrl?: string; enabled?: boolean }) {
  config = {
    method,
    email: options.email ?? config.email,
    webhookUrl: options.webhookUrl ?? config.webhookUrl,
    enabled: options.enabled ?? true,
  };
}

export function getConfig(): NotificationConfig {
  return { ...config };
}

async function requestBrowserPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  return Notification.requestPermission();
}

function sendBrowserNotification(type: NotificationType, data: NotificationData) {
  if (!config.enabled) return;

  const title = type === 'render-complete'
    ? 'Render Complete'
    : 'Render Failed';

  const body = type === 'render-complete'
    ? `"${data.projectTitle}" is ready.`
    : `"${data.projectTitle}" failed: ${data.error ?? 'Unknown error'}`;

  void requestBrowserPermission().then((permission) => {
    if (permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: data.projectId,
      });
    }
  });
}

async function sendEmailNotification(type: NotificationType, data: NotificationData) {
  if (!config.enabled || !config.email) {
    throw new Error('Email notifications are not configured. Add an email address in notification settings.');
  }

  const response = await apiFetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'email',
      type,
      to: config.email,
      data,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Email notification failed: ${response.status} ${text}`);
  }
}

async function sendWebhookNotification(type: NotificationType, data: NotificationData) {
  if (!config.enabled || !config.webhookUrl) return;

  try {
    await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        project_id: data.projectId,
        project_title: data.projectTitle,
        timestamp: data.timestamp,
        error: data.error,
        video_url: data.videoUrl,
      }),
    });
  } catch {
    // Webhook unavailable; silently fail
  }
}

export async function sendNotification(type: NotificationType, data: NotificationData) {
  if (!config.enabled) return;

  const notificationData: NotificationData = {
    ...data,
    timestamp: data.timestamp ?? new Date().toISOString(),
  };

  switch (config.method) {
    case 'browser':
      sendBrowserNotification(type, notificationData);
      break;
    case 'email':
      await sendEmailNotification(type, notificationData);
      break;
    case 'webhook':
      await sendWebhookNotification(type, notificationData);
      break;
  }
}

export function loadNotificationConfig() {
  try {
    const stored = localStorage.getItem('autotube-notification-config');
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<NotificationConfig>;
      config = {
        method: parsed.method ?? 'browser',
        email: parsed.email,
        webhookUrl: parsed.webhookUrl,
        enabled: parsed.enabled ?? true,
      };
    }
  } catch {
    // ignore
  }
  return { ...config };
}

export function saveNotificationConfig(newConfig: NotificationConfig) {
  config = newConfig;
  try {
    safeSetItem('autotube-notification-config', JSON.stringify(newConfig));
  } catch {
    // ignore
  }
}
