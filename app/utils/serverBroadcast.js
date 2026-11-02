/**
 * serverBroadcast.js — Local Server → Remote Devices Notification Trigger
 * 
 * Invokes the local server broadcaster (/api/notifications/broadcast)
 * to deliver push messages to all registered devices (including Vercel PWA).
 */

import { getUserId } from './localStore';

export async function broadcastToDevices({
  title = 'WatchAnime Alert',
  message = '',
  url = '/',
  image,
  eventType = 'general',
  data = {},
} = {}) {
  try {
    const userId = getUserId();
    const res = await fetch('/api/notifications/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        message,
        url,
        image,
        eventType,
        userId,
        data: { ...data, image, eventType, timestamp: Date.now() },
      }),
    });

    const result = await res.json();
    return result;
  } catch (err) {
    console.warn('[Broadcast] Error triggering broadcast:', err);
    return { success: false, error: err.message };
  }
}

export async function fetchSubscribedDevices() {
  try {
    const userId = getUserId();
    const res = await fetch(`/api/notifications/broadcast?userId=${encodeURIComponent(userId)}`);
    const data = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: err.message, subscribers: [] };
  }
}

