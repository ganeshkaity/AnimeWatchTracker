"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, Sparkles, X, Check, Smartphone, ShieldCheck } from 'lucide-react';
import {
  isPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
  registerDevicePushToken,
  getCurrentDeviceToken,
} from '../utils/notifications';
import { useAuth } from '../context/AuthContext';

/**
 * AutoPushPrompt.js
 * 
 * Automatically prompts the user to enable push notifications when opening
 * the application (PWA or localhost, on mobile or PC) if push is not yet enabled.
 * 
 * Features:
 * 1. Checks on boot if push is supported and whether permission / token is active.
 * 2. Attempts native browser prompt where permitted, and displays an elegant
 *    glassmorphism action card to guarantee user-gesture compatibility across
 *    Chrome, Safari, iOS, and Android.
 * 3. Registers device FCM token directly to Firestore upon acceptance.
 */
export default function AutoPushPrompt() {
  const { currentUser } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if push is supported in this browser/device
    if (!isPushSupported()) return;

    const currentPermission = getNotificationPermission();
    const existingToken = getCurrentDeviceToken();

    // If permission is already granted AND device has a token registered, no prompt needed
    if (currentPermission === 'granted' && existingToken) {
      return;
    }

    // If permission was explicitly permanently denied by user, do not spam
    if (currentPermission === 'denied') {
      return;
    }

    // Check session or temporary dismiss to avoid interrupting on every page change
    const dismissedUntil = localStorage.getItem('watchanime_push_prompt_dismissed');
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
      return;
    }

    // 1. Attempt native browser prompt after 1.5 seconds if supported
    const initialTimer = setTimeout(async () => {
      try {
        if (Notification.permission === 'default') {
          // Attempt direct native browser request
          const result = await Notification.requestPermission();
          if (result === 'granted') {
            await registerDevicePushToken(currentUser?.uid);
            return;
          }
        }
      } catch (_) {
        // Modern browsers require a user gesture; proceed to display prompt card
      }

      // Show prompt banner if still not granted or registered
      if (Notification.permission !== 'granted' || !getCurrentDeviceToken()) {
        setShowPrompt(true);
      }
    }, 1500);

    // 2. Also register a single-use gesture listener on the document so the first tap/click
    // can trigger native browser permission if the auto-call was ignored by the browser
    const handleFirstGesture = async () => {
      if (Notification.permission === 'default' && !getCurrentDeviceToken()) {
        try {
          const res = await Notification.requestPermission();
          if (res === 'granted') {
            await registerDevicePushToken(currentUser?.uid);
            setShowPrompt(false);
          }
        } catch (_) {}
      }
    };

    window.addEventListener('pointerdown', handleFirstGesture, { once: true });

    return () => {
      clearTimeout(initialTimer);
      window.removeEventListener('pointerdown', handleFirstGesture);
    };
  }, [currentUser?.uid]);

  const handleEnablePush = async () => {
    setLoading(true);
    try {
      const res = await registerDevicePushToken(currentUser?.uid);
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          setShowPrompt(false);
        }, 1500);
      } else {
        // If permission was denied or failed
        setShowPrompt(false);
      }
    } catch (err) {
      console.warn('[AutoPushPrompt] Registration error:', err);
      setShowPrompt(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    // Dismiss for 12 hours so user is not annoyed on every refresh
    try {
      localStorage.setItem(
        'watchanime_push_prompt_dismissed',
        String(Date.now() + 12 * 60 * 60 * 1000)
      );
    } catch (_) {}
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 sm:top-auto sm:bottom-6 sm:left-6 sm:translate-x-0 z-[90] max-w-sm w-[calc(100vw-2rem)] select-none pointer-events-auto"
      >
        <div className="relative overflow-hidden rounded-3xl bg-[#0b0f19]/95 backdrop-blur-2xl border border-purple-500/30 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_35px_rgba(168,85,247,0.2)]">
          {/* Neon gradient back-glow */}
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-cyan-500/20 rounded-full blur-2xl pointer-events-none" />

          {/* Top header row */}
          <div className="flex items-center justify-between gap-2 pb-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-black uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>Real-Time Alerts </span>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Dismiss"
            >
              <X size={15} />
            </button>
          </div>

          {/* Content */}
          <div className="flex items-start gap-3 pt-1.5">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 text-[#a855f7] border border-purple-500/30 shrink-0 mt-0.5">
              <BellRing size={20} className="animate-pulse" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                <span>Enable Push Notifications</span>
                <Sparkles size={12} className="text-amber-400" />
              </h4>
              <p className="text-[11px] text-gray-300 leading-snug">
                Receive instant updates when movies or anime are tracked, scanned, or added to your watchlist.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-3.5">
            {success ? (
              <div className="w-full py-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 animate-in fade-in">
                <Check size={14} />
                <span>Notifications Enabled!</span>
              </div>
            ) : (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleEnablePush}
                  disabled={loading}
                  className="flex-1 py-2.5 px-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-500/25 transition cursor-pointer disabled:opacity-50"
                >
                  <Bell size={13} />
                  <span>{loading ? 'Enabling...' : 'Enable Now'}</span>
                </motion.button>

                <button
                  type="button"
                  onClick={handleDismiss}
                  className="py-2.5 px-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-gray-400 hover:text-white font-bold text-xs transition cursor-pointer"
                >
                  <span>Later</span>
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

