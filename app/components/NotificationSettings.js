"use client";

import React, { useState, useEffect } from 'react';
import {
  Bell,
  BellRing,
  BellOff,
  Check,
  AlertCircle,
  Clock,
  Send,
  Smartphone,
  Shield,
  Key,
  Copy,
  Info,
  RefreshCw,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  getNotificationPermission,
  requestNotificationPermission,
  isPushSupported,
  isNotificationSupported,
  getNotificationPreferences,
  saveNotificationPreferences,
  showLocalNotification,
  scheduleLocalReminder,
  getActiveScheduledReminders,
  cancelScheduledReminder,
  registerDevicePushToken,
  unregisterDevicePushToken,
  getCurrentDeviceToken,
  getVapidPublicKey,
  setCustomVapidKey,
} from '../utils/notifications';
import { useAuth } from '../context/AuthContext';

export default function NotificationSettings({ isCompact = false }) {
  const { currentUser } = useAuth();
  const [permission, setPermission] = useState('default');
  const [prefs, setPrefs] = useState(getNotificationPreferences);
  const [pushSupported, setPushSupported] = useState(false);
  const [deviceToken, setDeviceToken] = useState(null);
  const [vapidKey, setVapidKey] = useState('');
  const [customVapidInput, setCustomVapidInput] = useState('');
  const [showVapidConfig, setShowVapidConfig] = useState(false);

  // Status & loading indicators
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
  const [copiedToken, setCopiedToken] = useState(false);

  // Local testing states
  const [testTitle, setTestTitle] = useState('WatchAnime Test');
  const [testMessage, setTestMessage] = useState('This is a test notification!');
  const [scheduledSeconds, setScheduledSeconds] = useState(5);
  const [pendingReminders, setPendingReminders] = useState([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPermission(getNotificationPermission());
      setPushSupported(isPushSupported());
      setDeviceToken(getCurrentDeviceToken());
      const currentVapid = getVapidPublicKey();
      setVapidKey(currentVapid);
      setCustomVapidInput(currentVapid);
      setPendingReminders(getActiveScheduledReminders());

      const handleRemindersUpdate = () => {
        setPendingReminders(getActiveScheduledReminders());
      };
      window.addEventListener('watchanime_reminders_updated', handleRemindersUpdate);
      return () => window.removeEventListener('watchanime_reminders_updated', handleRemindersUpdate);
    }
  }, []);

  const showFeedback = (type, text) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage({ type: '', text: '' });
    }, 4500);
  };

  // ─── Enable / Request Permission ───────────────────────────────────────────
  const handleEnablePush = async () => {
    setLoading(true);
    setStatusMessage({ type: '', text: '' });

    try {
      const res = await registerDevicePushToken(currentUser?.uid);
      setPermission(getNotificationPermission());

      if (res.success) {
        setDeviceToken(res.token);
        setPrefs(getNotificationPreferences());
        showFeedback('success', 'Push notifications enabled successfully on this device!');
      } else {
        if (res.reason === 'VAPID_KEY_MISSING') {
          setShowVapidConfig(true);
        }
        showFeedback('error', res.message || 'Failed to enable push notifications.');
      }
    } catch (err) {
      showFeedback('error', err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Disable Push ──────────────────────────────────────────────────────────
  const handleDisablePush = async () => {
    setLoading(true);
    try {
      const res = await unregisterDevicePushToken(currentUser?.uid);
      setDeviceToken(null);
      setPrefs(getNotificationPreferences());
      showFeedback('info', res.message || 'Push notifications disabled on this device.');
    } catch (err) {
      showFeedback('error', err.message || 'Failed to disable notifications.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Toggle Preference ─────────────────────────────────────────────────────
  const handlePrefToggle = (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    const saved = saveNotificationPreferences(updated);
    setPrefs(saved);
  };

  // ─── Test Local Notification ───────────────────────────────────────────────
  const handleTestLocal = async () => {
    if (permission !== 'granted') {
      const perm = await requestNotificationPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        showFeedback('error', 'Notification permission is required to display notifications.');
        return;
      }
    }

    const res = await showLocalNotification({
      title: testTitle || 'WatchAnime Test',
      body: testMessage || 'Local browser notification working properly!',
      url: '/',
      tag: 'test-local',
    });

    if (res) {
      showFeedback('success', `Local notification delivered via ${res.method}.`);
    } else {
      showFeedback('error', 'Could not show local notification. Check browser settings.');
    }
  };

  // ─── Schedule Local Reminder ───────────────────────────────────────────────
  const handleScheduleTest = () => {
    if (permission !== 'granted') {
      requestNotificationPermission().then(setPermission);
    }

    const delayMs = Math.max(1, parseInt(scheduledSeconds, 10) || 5) * 1000;
    const { id, scheduledFor } = scheduleLocalReminder({
      title: 'WatchAnime Scheduled Reminder',
      body: `Reminder triggered after ${scheduledSeconds} seconds!`,
      delayMs,
      url: '/',
      tag: `test-schedule-${Date.now()}`,
    });

    setPendingReminders(getActiveScheduledReminders());
    showFeedback('info', `Reminder scheduled to trigger in ${scheduledSeconds}s.`);
  };

  // ─── Test Remote Push (via /api/notifications/send) ─────────────────────────
  const handleTestRemotePush = async () => {
    if (!deviceToken) {
      showFeedback('error', 'Please enable push notifications first to obtain a device token.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: deviceToken,
          title: 'Remote Push Test',
          message: 'FCM push notification received successfully on this device!',
          url: '/',
          tag: 'test-remote',
        }),
      });

      const data = await res.json();
      if (data.success) {
        showFeedback('success', `Remote push sent via ${data.method}! Delivery in progress.`);
      } else if (data.reason === 'SERVER_CREDENTIALS_MISSING') {
        showFeedback('info', data.message);
      } else {
        showFeedback('error', data.error || data.message || 'Push delivery failed.');
      }
    } catch (err) {
      showFeedback('error', `Server send error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Save Custom VAPID Key ─────────────────────────────────────────────────
  const handleSaveVapid = (e) => {
    e.preventDefault();
    setCustomVapidKey(customVapidInput);
    setVapidKey(customVapidInput.trim());
    showFeedback('success', 'VAPID public key updated successfully.');
  };

  const copyTokenToClipboard = () => {
    if (!deviceToken) return;
    navigator.clipboard.writeText(deviceToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className={`space-y-4 ${isCompact ? 'text-xs' : 'text-sm'}`}>
      {/* ─── Status Message Feedback ────────────────────────────────────────── */}
      {statusMessage.text && (
        <div
          className={`p-3 rounded-2xl flex items-center gap-2 border text-xs animate-in fade-in ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : statusMessage.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
          }`}
        >
          {statusMessage.type === 'success' && <Check size={14} className="shrink-0" />}
          {statusMessage.type === 'error' && <AlertCircle size={14} className="shrink-0" />}
          {statusMessage.type === 'info' && <Info size={14} className="shrink-0" />}
          <span className="flex-1 leading-snug">{statusMessage.text}</span>
        </div>
      )}

      {/* ─── Overview Card: Permission & Push Status ────────────────────────── */}
      <div className="p-4 rounded-2xl bg-[#111827]/80 border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/20 text-[#a855f7]">
              <BellRing size={16} />
            </div>
            <div>
              <h3 className="font-bold text-white text-xs">Notification Engine</h3>
              <p className="text-[10px] text-gray-400">Local browser &amp; FCM remote push</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                permission === 'granted'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : permission === 'denied'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              Permission: {permission}
            </span>
          </div>
        </div>

        {/* Master Toggle */}
        <div className="flex items-center justify-between pt-1 border-t border-white/5">
          <div>
            <span className="text-xs font-semibold text-white block">Push Notifications (FCM)</span>
            <span className="text-[10px] text-gray-400">
              {deviceToken
                ? 'Device is subscribed for remote background delivery'
                : 'Enable to receive updates even when app is closed'}
            </span>
          </div>

          {deviceToken ? (
            <button
              type="button"
              onClick={handleDisablePush}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs font-bold transition flex items-center gap-1"
            >
              <BellOff size={13} />
              <span>Disable</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={loading || permission === 'denied'}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center gap-1 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Bell size={13} />
              )}
              <span>Enable Push</span>
            </button>
          )}
        </div>

        {/* Permission Denied Warning */}
        {permission === 'denied' && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] leading-relaxed flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>
              Notifications are blocked in your browser settings. To enable them, click the padlock/tune icon in your address bar and set Notifications to "Allow".
            </span>
          </div>
        )}

        {/* Device Token Pill (if registered) */}
        {deviceToken && (
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
              <span className="flex items-center gap-1">
                <Smartphone size={11} className="text-purple-400" /> Current Device Token:
              </span>
              <button
                type="button"
                onClick={copyTokenToClipboard}
                className="text-purple-400 hover:text-purple-300 flex items-center gap-1 font-semibold cursor-pointer"
              >
                {copiedToken ? <Check size={11} /> : <Copy size={11} />}
                <span>{copiedToken ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-[10px] font-mono text-gray-300 truncate">
              {deviceToken}
            </p>
          </div>
        )}
      </div>

      {/* ─── Notification Preferences ────────────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-[#111827]/80 border border-white/10 space-y-3">
        <h4 className="text-xs font-bold text-[#7c5cff] flex items-center gap-1.5">
          <Sliders size={14} className="text-cyan-400" />
          Notification Preferences
        </h4>

        <div className="space-y-2 text-xs">
          <label className="flex items-center justify-between cursor-pointer py-1">
            <div>
              <span className="text-white block font-medium">New Releases &amp; Episodes</span>
              <span className="text-[10px] text-gray-400">Alerts when new media or episodes are ready</span>
            </div>
            <input
              type="checkbox"
              checked={prefs.newReleases}
              onChange={() => handlePrefToggle('newReleases')}
              className="accent-[#a855f7] h-4 w-4 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer py-1 border-t border-white/5">
            <div>
              <span className="text-white block font-medium">Watchlist Reminders</span>
              <span className="text-[10px] text-gray-400">Reminders for saved anime, movies, and series</span>
            </div>
            <input
              type="checkbox"
              checked={prefs.watchlistReminders}
              onChange={() => handlePrefToggle('watchlistReminders')}
              className="accent-[#a855f7] h-4 w-4 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer py-1 border-t border-white/5">
            <div>
              <span className="text-white block font-medium">System Updates &amp; Sync</span>
              <span className="text-[10px] text-gray-400">Sync confirmations and offline cache alerts</span>
            </div>
            <input
              type="checkbox"
              checked={prefs.systemUpdates}
              onChange={() => handlePrefToggle('systemUpdates')}
              className="accent-[#a855f7] h-4 w-4 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer py-1 border-t border-white/5">
            <div className="flex items-center gap-1.5">
              {prefs.sound ? (
                <Volume2 size={13} className="text-cyan-400" />
              ) : (
                <VolumeX size={13} className="text-gray-500" />
              )}
              <div>
                <span className="text-white block font-medium">Notification Audio Chime</span>
                <span className="text-[10px] text-gray-400">Play a subtle audio tone for foreground alerts</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={prefs.sound}
              onChange={() => handlePrefToggle('sound')}
              className="accent-[#a855f7] h-4 w-4 rounded cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* ─── Testing Suite: Local & Remote ──────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-[#111827]/80 border border-white/10 space-y-3">
        <h4 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
          <Send size={13} />
          Notification Diagnostics &amp; Testing
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div>
            <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
              Test Title
            </label>
            <input
              type="text"
              value={testTitle}
              onChange={(e) => setTestTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">
              Test Message
            </label>
            <input
              type="text"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {/* Immediate Local Notification Test */}
          <button
            type="button"
            onClick={handleTestLocal}
            className="flex-1 min-w-[140px] py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Bell size={13} />
            <span>Test Local Alert</span>
          </button>

          {/* Remote Push Test */}
          <button
            type="button"
            onClick={handleTestRemotePush}
            disabled={!deviceToken || loading}
            className="flex-1 min-w-[140px] py-2 px-3 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Send size={13} />
            <span>Test Remote Push</span>
          </button>
        </div>

        {/* Scheduled Reminder Section */}
        <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-300 flex items-center gap-1">
              <Clock size={12} className="text-amber-400" /> Scheduled In-App Reminder:
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="2"
                max="3600"
                value={scheduledSeconds}
                onChange={(e) => setScheduledSeconds(e.target.value)}
                className="w-14 px-2 py-0.5 rounded-lg bg-black border border-white/20 text-xs text-center text-white"
              />
              <span className="text-[11px] text-gray-400">sec</span>
              <button
                type="button"
                onClick={handleScheduleTest}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-[11px] transition cursor-pointer"
              >
                Schedule
              </button>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 leading-relaxed">
            Local scheduled reminders run while the browser or PWA is open or active in a tab. For delivery when the app is completely terminated, remote push notifications are used.
          </p>

          {pendingReminders.length > 0 && (
            <div className="pt-1 space-y-1">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">
                Active Pending Reminders:
              </span>
              {pendingReminders.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-white/5"
                >
                  <span className="truncate text-gray-300">{r.title}</span>
                  <button
                    type="button"
                    onClick={() => cancelScheduledReminder(r.id)}
                    className="text-rose-400 hover:text-rose-300 text-[10px] ml-2 shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── VAPID Key Configuration Drawer (Optional / Advanced) ───────────── */}
      <div className="p-3 rounded-2xl bg-black/30 border border-white/5">
        <button
          type="button"
          onClick={() => setShowVapidConfig(!showVapidConfig)}
          className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-white transition cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Key size={13} className="text-purple-400" />
            <span>Web Push VAPID Key Setup</span>
          </span>
          <span className="text-[10px] text-purple-400 font-mono">
            {vapidKey ? 'Configured' : 'Configure Key'}
          </span>
        </button>

        {showVapidConfig && (
          <form onSubmit={handleSaveVapid} className="mt-3 pt-3 border-t border-white/5 space-y-2">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Firebase Cloud Messaging Web Push requires a public VAPID key. You can add it to <code className="text-cyan-300">.env.local</code> as <code className="text-cyan-300">NEXT_PUBLIC_FIREBASE_VAPID_KEY</code>, or paste it below:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter public VAPID key (e.g. BDG...)"
                value={customVapidInput}
                onChange={(e) => setCustomVapidInput(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white font-mono"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase"
              >
                Save
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

