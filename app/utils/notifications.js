/**
 * notifications.js — Unified Notification Engine for WatchAnime
 * 
 * Supports:
 * 1. Native Local Browser Notifications (Immediate & Scheduled)
 * 2. Remote Push Notifications via Firebase Cloud Messaging (FCM)
 * 3. Token Registration & Lifecycle in Firestore: users/{userId}/pushTokens/{tokenId}
 * 4. Foreground & Background Message Handling
 * 
 * Zero external paid dependencies. Reuses existing Firebase & Service Worker.
 */

import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { app, db } from '../firebase';
import { getUserId } from './localStore';

// ─── Constants & Storage Keys ────────────────────────────────────────────────
const STORAGE_KEYS = {
  PREFERENCES: 'watchanime_notification_prefs',
  LOCAL_REMINDERS: 'watchanime_local_reminders',
  CUSTOM_VAPID_KEY: 'watchanime_custom_vapid_key',
  LAST_REGISTERED_TOKEN: 'watchanime_last_fcm_token',
};

// Default Notification Preferences
export const DEFAULT_PREFERENCES = {
  enabled: true,
  pushEnabled: false,
  newReleases: true,
  watchlistReminders: true,
  episodeReleases: true,
  systemUpdates: true,
  sound: true,
};

// In-memory active timer registry for scheduled local reminders
const activeTimers = new Map();

// ─── Helpers: Detection & Permission ─────────────────────────────────────────

export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function isServiceWorkerSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission; // 'default', 'granted', 'denied'
}

/**
 * Requests browser notification permission after an explicit user interaction.
 * @returns {Promise<NotificationPermission | 'unsupported'>}
 */
export async function requestNotificationPermission() {
  if (!isNotificationSupported()) {
    console.warn('[Notifications] Notifications are not supported in this browser.');
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('[Notifications] Permission request error:', err);
    return Notification.permission || 'denied';
  }
}

// ─── Device & Browser Metadata Helper ────────────────────────────────────────

export function getDeviceInfo() {
  if (typeof window === 'undefined') return { type: 'server' };

  const ua = navigator.userAgent || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/i.test(ua);

  let browserName = 'Unknown Browser';
  if (ua.includes('Firefox/')) browserName = 'Firefox';
  else if (ua.includes('Edg/')) browserName = 'Edge';
  else if (ua.includes('Chrome/')) browserName = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browserName = 'Safari';

  return {
    type: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop',
    browser: browserName,
    platform: navigator.platform || 'Unknown',
    language: navigator.language || 'en',
    userAgent: ua,
  };
}

/**
 * Generates a clean, deterministic document ID for a token to prevent duplicate Firestore docs.
 */
function getDeterministicTokenId(token) {
  if (!token) return 'token_unknown';
  // Use a clean URL-safe hash-like string of the token
  try {
    const base = btoa(token.slice(-32)).replace(/[/+=]/g, '_');
    return `token_${base}`;
  } catch {
    return `token_${token.slice(-16).replace(/[^a-zA-Z0-9]/g, '_')}`;
  }
}

// ─── Preferences Store ────────────────────────────────────────────────────────

export function getNotificationPreferences() {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    return raw ? { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function saveNotificationPreferences(prefs) {
  if (typeof window === 'undefined') return;
  try {
    const merged = { ...getNotificationPreferences(), ...prefs };
    localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('watchanime_notification_prefs_changed', { detail: merged }));
    return merged;
  } catch (err) {
    console.warn('[Notifications] Failed to save preferences:', err);
  }
}

// ─── Local Notifications (Native Browser API) ────────────────────────────────

/**
 * Displays a local notification using the active Service Worker (preferred for PWA)
 * or falls back to native Notification constructor.
 */
export async function showLocalNotification({
  title = 'WatchAnime',
  body = '',
  icon = '/icons/icon-192x192.png',
  badge = '/icons/icon-96x96.png',
  url = '/',
  tag = 'watchanime-local',
  data = {},
  renotify = true,
  requireInteraction = false,
} = {}) {
  if (!isNotificationSupported()) {
    console.warn('[Notifications] Local notifications unsupported.');
    return null;
  }

  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermission();
    if (granted !== 'granted') {
      console.warn('[Notifications] Permission denied for local notification.');
      return null;
    }
  }

  const payloadData = { url, timestamp: Date.now(), ...data };

  // 1. Try displaying via existing Service Worker registration (handles click & navigation)
  if (isServiceWorkerSupported()) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration && registration.showNotification) {
        await registration.showNotification(title, {
          body,
          icon,
          badge,
          tag,
          renotify,
          requireInteraction,
          vibrate: [100, 50, 100],
          data: payloadData,
        });
        return { method: 'serviceWorker', title };
      }
    } catch (err) {
      console.warn('[Notifications] ServiceWorker showNotification fallback:', err);
    }
  }

  // 2. Fallback to direct window Notification constructor
  try {
    const notification = new Notification(title, {
      body,
      icon,
      badge,
      tag,
      data: payloadData,
    });

    notification.onclick = (e) => {
      e.preventDefault();
      window.focus();
      if (url && typeof window !== 'undefined') {
        window.location.href = url;
      }
      notification.close();
    };

    return { method: 'windowNotification', title };
  } catch (err) {
    console.error('[Notifications] Failed to create window notification:', err);
    return null;
  }
}

/**
 * Schedules a local reminder while the application is active or in background tab.
 * 
 * IMPORTANT: JavaScript timers (setTimeout) rely on the application runtime.
 * If the PWA is completely killed by the OS, scheduled timers will not execute.
 * For guaranteed delivery when the app is terminated, remote FCM push notifications are used.
 */
export function scheduleLocalReminder({
  id = `reminder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  title = 'WatchAnime Reminder',
  body = 'Time to continue watching your favorite series!',
  delayMs = 10000,
  url = '/',
  tag = 'watchanime-reminder',
  data = {},
} = {}) {
  // Cancel any existing timer with the same ID
  cancelScheduledReminder(id);

  const scheduledFor = Date.now() + delayMs;

  const timer = setTimeout(async () => {
    activeTimers.delete(id);
    removeStoredReminder(id);
    await showLocalNotification({
      title,
      body,
      url,
      tag,
      data: { ...data, reminderId: id, scheduledFor },
    });
  }, delayMs);

  activeTimers.set(id, timer);

  // Persist reminder entry in localStorage so the user can see pending reminders
  saveStoredReminder({ id, title, body, delayMs, scheduledFor, url, tag });

  return { id, scheduledFor };
}

export function cancelScheduledReminder(id) {
  if (activeTimers.has(id)) {
    clearTimeout(activeTimers.get(id));
    activeTimers.delete(id);
  }
  removeStoredReminder(id);
}

function getStoredReminders() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LOCAL_REMINDERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredReminder(item) {
  if (typeof window === 'undefined') return;
  try {
    const list = getStoredReminders().filter(r => r.id !== item.id && r.scheduledFor > Date.now());
    list.push(item);
    localStorage.setItem(STORAGE_KEYS.LOCAL_REMINDERS, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('watchanime_reminders_updated'));
  } catch (_) {}
}

function removeStoredReminder(id) {
  if (typeof window === 'undefined') return;
  try {
    const list = getStoredReminders().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEYS.LOCAL_REMINDERS, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('watchanime_reminders_updated'));
  } catch (_) {}
}

export function getActiveScheduledReminders() {
  return getStoredReminders().filter(r => r.scheduledFor > Date.now());
}

/**
 * Triggers a contextual notification based on an application event.
 * Dispatches a local notification AND broadcasts to subscribed remote devices (Vercel PWA)
 * via the local server broadcaster.
 */
export async function triggerAppEventNotification(eventType, eventData = {}) {
  const prefs = getNotificationPreferences();
  if (!prefs.enabled) return;

  let title = 'WatchAnime Update';
  let body = '';
  let url = '/';

  switch (eventType) {
    case 'watchlist_added':
      if (prefs.watchlistReminders) {
        title = 'Added to Watchlist';
        body = `"${eventData.title || 'Item'}" has been added to your collection.`;
        url = '/watchlist';
      }
      break;

    case 'movie_added':
      if (prefs.newReleases) {
        title = 'New Movie Added';
        body = `"${eventData.title || 'Movie'}" was added to your local library.`;
        url = eventData.url || '/movies';
      }
      break;

    case 'episode_completed':
      if (prefs.episodeReleases) {
        title = 'Episode Completed';
        body = `Finished Episode ${eventData.episodeNumber || ''} of "${eventData.title || 'Series'}". Ready for the next one?`;
        url = eventData.url || '/';
      }
      break;

    case 'download_ready':
      title = 'Media Ready';
      body = `"${eventData.title || 'Media'}" is ready for offline streaming.`;
      url = eventData.url || '/';
      break;

    default:
      title = eventData.title || 'WatchAnime Alert';
      body = eventData.message || eventData.body || '';
      url = eventData.url || '/';
      break;
  }

  if (!body) return;

  // 1. Show local notification on current device
  await showLocalNotification({
    title,
    body,
    url,
    tag: `app-event-${eventType}`,
  });

  // 2. Broadcast to all subscribed devices (including deployed Vercel PWA / phones)
  if (typeof window !== 'undefined') {
    import('./serverBroadcast')
      .then(({ broadcastToDevices }) => {
        broadcastToDevices({
          title,
          message: body,
          url,
          eventType,
          data: eventData,
        }).catch(() => {});
      })
      .catch(() => {});
  }
}

// ─── Remote Push Notifications (Firebase Cloud Messaging) ────────────────────

/**
 * Resolves the Firebase Messaging instance safely (client-side only).
 */
export async function getFirebaseMessagingInstance() {
  if (typeof window === 'undefined') return null;
  if (!app) return null;

  try {
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] Firebase Messaging is not supported in this browser context.');
      return null;
    }
    return getMessaging(app);
  } catch (err) {
    console.error('[FCM] Failed to initialize Firebase Messaging:', err);
    return null;
  }
}

/**
 * Retrieves the Web Push VAPID Public Key from:
 * 1. Process environment: NEXT_PUBLIC_FIREBASE_VAPID_KEY
 * 2. Local storage custom override
 */
export function getVapidPublicKey() {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem(STORAGE_KEYS.CUSTOM_VAPID_KEY);
    if (custom && custom.trim()) return custom.trim();
  }
  return process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
}

export function setCustomVapidKey(key) {
  if (typeof window === 'undefined') return;
  if (key && key.trim()) {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_VAPID_KEY, key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_VAPID_KEY);
  }
}

/**
 * Registers this device for remote push notifications via FCM.
 * 
 * 1. Requests permission.
 * 2. Obtains the Service Worker registration (/sw.js).
 * 3. Retrieves FCM registration token using VAPID key.
 * 4. Saves token and device metadata into Firestore:
 *    users/{userId}/pushTokens/{tokenId}
 */
export async function registerDevicePushToken(userIdOverride = null) {
  if (!isPushSupported()) {
    return {
      success: false,
      reason: 'UNSUPPORTED',
      message: 'Push notifications are not supported in this browser.',
    };
  }

  // 1. Permission check
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return {
      success: false,
      reason: 'PERMISSION_DENIED',
      message: 'Notification permission was denied by the user.',
    };
  }

  // 2. Messaging instance
  const messaging = await getFirebaseMessagingInstance();
  if (!messaging) {
    return {
      success: false,
      reason: 'MESSAGING_INIT_FAILED',
      message: 'Firebase Messaging could not be initialized.',
    };
  }

  // 3. Service Worker registration (reusing existing /sw.js)
  let swRegistration;
  try {
    swRegistration = await navigator.serviceWorker.ready;
  } catch (err) {
    console.error('[FCM] Service Worker ready error:', err);
    return {
      success: false,
      reason: 'SW_NOT_READY',
      message: 'Service Worker is not ready or failed to register.',
    };
  }

  // 4. Retrieve VAPID Key
  const vapidKey = getVapidPublicKey();
  if (!vapidKey) {
    console.warn('[FCM] No VAPID public key configured.');
    return {
      success: false,
      reason: 'VAPID_KEY_MISSING',
      message: 'Web Push VAPID public key is missing. Please add NEXT_PUBLIC_FIREBASE_VAPID_KEY to .env.local or enter it in settings.',
    };
  }

  // 5. Get FCM Token
  try {
    const { getToken } = await import('firebase/messaging');
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      return {
        success: false,
        reason: 'NO_TOKEN',
        message: 'No registration token available. Request permission to generate one.',
      };
    }

    // Persist token locally
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.LAST_REGISTERED_TOKEN, token);
    }

    // 6. Save token to Firestore under users/{userId}/pushTokens/{tokenId}
    const userId = userIdOverride || getUserId();
    if (db && userId) {
      const tokenId = getDeterministicTokenId(token);
      const tokenRef = doc(db, 'users', userId, 'pushTokens', tokenId);
      const deviceInfo = getDeviceInfo();
      const prefs = getNotificationPreferences();

      await setDoc(tokenRef, {
        token,
        tokenId,
        userId,
        device: deviceInfo,
        active: true,
        preferences: {
          newReleases: prefs.newReleases,
          watchlistReminders: prefs.watchlistReminders,
          episodeReleases: prefs.episodeReleases,
          systemUpdates: prefs.systemUpdates,
        },
        lastSeenAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }, { merge: true });

      console.log('[FCM] Device token registered to Firestore successfully:', tokenId);
    }

    // Update local preferences to indicate push is enabled
    saveNotificationPreferences({ pushEnabled: true });

    return {
      success: true,
      token,
      message: 'Push notifications registered successfully!',
    };
  } catch (err) {
    console.error('[FCM] Error generating device token:', err);
    return {
      success: false,
      reason: 'TOKEN_ERROR',
      message: err.message || 'Failed to retrieve FCM push token.',
    };
  }
}

/**
 * Disables remote push notifications on this device:
 * 1. Calls deleteToken from FCM.
 * 2. Marks the token inactive in Firestore: users/{userId}/pushTokens/{tokenId}.
 * 3. Updates local preferences.
 */
export async function unregisterDevicePushToken(userIdOverride = null) {
  try {
    const messaging = await getFirebaseMessagingInstance();
    const currentToken = typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_KEYS.LAST_REGISTERED_TOKEN)
      : null;

    if (messaging) {
      try {
        const { deleteToken } = await import('firebase/messaging');
        await deleteToken(messaging);
      } catch (e) {
        console.warn('[FCM] deleteToken warning:', e);
      }
    }

    // Update Firestore record
    const userId = userIdOverride || getUserId();
    if (db && userId && currentToken) {
      const tokenId = getDeterministicTokenId(currentToken);
      const tokenRef = doc(db, 'users', userId, 'pushTokens', tokenId);
      try {
        await updateDoc(tokenRef, {
          active: false,
          unregisteredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        // Document might not exist or network offline; proceed gracefully
        console.warn('[FCM] Firestore token deactivation warning:', err);
      }
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.LAST_REGISTERED_TOKEN);
    }

    saveNotificationPreferences({ pushEnabled: false });

    return { success: true, message: 'Push notifications disabled on this device.' };
  } catch (err) {
    console.error('[FCM] Error unregistering token:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Sets up a listener for incoming foreground messages.
 * When the app is in the foreground, FCM does not show a system notification by default.
 * This listener handles incoming messages and dispatches an event or shows an in-app banner.
 */
export async function setupForegroundMessageListener(onMessageCallback) {
  const messaging = await getFirebaseMessagingInstance();
  if (!messaging) return () => {};

  try {
    const { onMessage } = await import('firebase/messaging');
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[FCM] Foreground push message received:', payload);

      // Trigger user-provided callback
      if (typeof onMessageCallback === 'function') {
        onMessageCallback(payload);
      }

      // Dispatch global window event for in-app toast / banner
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('watchanime_foreground_push', { detail: payload }));
      }
    });

    return unsubscribe;
  } catch (err) {
    console.warn('[FCM] Failed to attach foreground listener:', err);
    return () => {};
  }
}

/**
 * Gets the currently stored FCM token for this device, if any.
 */
export function getCurrentDeviceToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.LAST_REGISTERED_TOKEN) || null;
}

