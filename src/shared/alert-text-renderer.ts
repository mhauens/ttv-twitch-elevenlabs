import type { AlertQueueItem } from '../domain/alert-queue-item.js';

export function renderAlertText(item: AlertQueueItem): string {
  const message = typeof item.payload.message === 'string' ? item.payload.message : 'Alert received';
  const userName = typeof item.payload.userName === 'string' ? item.payload.userName : 'viewer';
  const normalizedAlertType = item.alertType.trim().toLowerCase();

  if (normalizedAlertType === 'cheer' || normalizedAlertType === 'subscrition') {
    return `Von ${userName}. ${message}`;
  }

  return `${userName}: ${message}`;
}
