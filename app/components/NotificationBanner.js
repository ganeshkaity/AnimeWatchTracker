"use client";

import React, { useEffect, useState } from 'react';
import { Bell, X, ExternalLink, Sparkles } from 'lucide-react';
import { setupForegroundMessageListener, getNotificationPreferences } from '../utils/notifications';

/**
 * NotificationBanner.js
 * 
 * Floating in-app toast display for foreground push notifications.
 * When the PWA is active and open in foreground, FCM delivers messages directly
 * to the client without presenting an OS-level notification. This component displays
 * the incoming message cleanly without disturbing user playback.
 */
export default function NotificationBanner() {
  const [activeNotification, setActiveNotification] = useState(null);

  useEffect(() => {
    // 1. Setup Firebase Messaging foreground listener
    let unsubscribe = () => {};

    setupForegroundMessageListener((payload) => {
      const prefs = getNotificationPreferences();
      if (!prefs.enabled) return;

      const title =
        payload?.notification?.title ||
        payload?.data?.title ||
        'New WatchAnime Alert';
      const body =
        payload?.notification?.body ||
        payload?.data?.body ||
        payload?.data?.message ||
        '';
      const url =
        payload?.data?.url ||
        payload?.notification?.click_action ||
        payload?.fcmOptions?.link ||
        '/';
      const icon = payload?.notification?.icon || payload?.data?.icon || '/icons/icon-192x192.png';

      setActiveNotification({
        id: Date.now(),
        title,
        body,
        url,
        icon,
      });

      // Optional sound chime
      if (prefs.sound && typeof window !== 'undefined' && window.AudioContext) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
        } catch (_) {}
      }
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    // 2. Also listen for custom window push events
    const handleCustomPush = (e) => {
      const payload = e.detail;
      if (!payload) return;
      const title = payload?.notification?.title || payload?.data?.title || 'WatchAnime Alert';
      const body = payload?.notification?.body || payload?.data?.body || payload?.data?.message || '';
      const url = payload?.data?.url || '/';
      setActiveNotification({ id: Date.now(), title, body, url });
    };

    window.addEventListener('watchanime_foreground_push', handleCustomPush);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      window.removeEventListener('watchanime_foreground_push', handleCustomPush);
    };
  }, []);

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (!activeNotification) return;
    const timer = setTimeout(() => {
      setActiveNotification(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeNotification]);

  if (!activeNotification) return null;

  return (
    <aside
      aria-label="New notification"
      className="fixed bottom-6 right-6 z-50 max-w-sm w-full animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-auto"
    >
      <div className="glass-panel p-4 rounded-2xl border border-purple-500/30 bg-[#0f172a]/95 shadow-2xl backdrop-blur-xl flex items-start gap-3">
        <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 shrink-0 mt-0.5">
          <Bell size={18} className="animate-pulse text-[#a855f7]" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1">
              <Sparkles size={11} /> WatchAnime
            </span>
          </div>
          <h4 className="text-xs font-bold text-white truncate">
            {activeNotification.title}
          </h4>
          {activeNotification.body && (
            <p className="text-[11px] text-gray-300 line-clamp-2 mt-0.5 leading-relaxed">
              {activeNotification.body}
            </p>
          )}

          {activeNotification.url && activeNotification.url !== '/' && (
            <a
              href={activeNotification.url}
              onClick={() => setActiveNotification(null)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 transition"
            >
              <span>View details</span>
              <ExternalLink size={11} />
            </a>
          )}
        </div>

        <button
          onClick={() => setActiveNotification(null)}
          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition shrink-0"
          title="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>
    </aside>
  );
}

