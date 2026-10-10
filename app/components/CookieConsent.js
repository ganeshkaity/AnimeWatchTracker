"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Check, Cookie, ShieldCheck, Heart } from 'lucide-react';

/**
 * Cute Animated Cookie SVG Character
 */
function CuteCookieCharacter({ isBitten = false }) {
  return (
    <motion.div
      animate={{
        y: [0, -5, 0],
        rotate: [0, 2, -2, 0],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut"
      }}
      className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 select-none"
    >
      {/* Golden Aura Glow */}
      <div className="absolute inset-0 rounded-full bg-amber-500/25 blur-lg animate-pulse" />

      {/* Cookie Body SVG */}
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full relative z-10 drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
      >
        <defs>
          <linearGradient id="cookieGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <radialGradient id="chipGrad" cx="30%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#451a03" />
            <stop offset="100%" stopColor="#1e0a01" />
          </radialGradient>
        </defs>

        {/* Cookie Base */}
        <path
          d={
            isBitten
              ? "M 50,5 C 75,5 95,25 95,50 C 95,55 90,57 88,52 C 84,43 73,45 70,54 C 67,63 56,61 58,72 C 60,82 50,88 47,82 C 45,78 40,80 38,84 C 30,95 10,85 5,55 C 0,25 25,5 50,5 Z"
              : "M 50,5 C 75,5 95,25 95,50 C 95,75 75,95 50,95 C 25,95 5,75 5,50 C 5,25 25,5 50,5 Z"
          }
          fill="url(#cookieGrad)"
          stroke="#78350f"
          strokeWidth="2.5"
        />

        {/* Chocolate Chips */}
        <circle cx="28" cy="28" r="4.5" fill="url(#chipGrad)" />
        <circle cx="72" cy="30" r="5" fill="url(#chipGrad)" />
        <circle cx="78" cy="62" r="4.5" fill="url(#chipGrad)" />
        <circle cx="22" cy="68" r="5" fill="url(#chipGrad)" />
        <circle cx="48" cy="20" r="3.5" fill="url(#chipGrad)" />

        {/* Cute Kawaii Face */}
        {/* Blushing cheeks */}
        <ellipse cx="32" cy="55" rx="4" ry="2.5" fill="#f43f5e" opacity="0.6" />
        <ellipse cx="68" cy="55" rx="4" ry="2.5" fill="#f43f5e" opacity="0.6" />

        {/* Big Happy Anime Eyes */}
        <g>
          {/* Left Eye */}
          <ellipse cx="36" cy="46" rx="4.5" ry="6" fill="#1e1b4b" />
          <circle cx="34.5" cy="44" r="2" fill="#ffffff" />
          <circle cx="37.5" cy="48" r="1" fill="#ffffff" />

          {/* Right Eye */}
          <ellipse cx="64" cy="46" rx="4.5" ry="6" fill="#1e1b4b" />
          <circle cx="62.5" cy="44" r="2" fill="#ffffff" />
          <circle cx="65.5" cy="48" r="1" fill="#ffffff" />
        </g>

        {/* Cute Smile */}
        <path
          d="M 44,53 Q 50,60 56,53"
          fill="none"
          stroke="#1e1b4b"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      {/* Floating Sparkles */}
      <motion.div
        animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute -top-1.5 -right-1 text-amber-300 pointer-events-none"
      >
        <Sparkles size={14} />
      </motion.div>
    </motion.div>
  );
}

export default function CookieConsent() {
  const [show, setShow] = useState(false);
  const [isBitten, setIsBitten] = useState(false);

  useEffect(() => {
    try {
      const consent = localStorage.getItem('ganeshspace_cookie_consent');
      if (!consent) {
        // Delay entrance slightly so user lands smoothly on the page
        const timer = setTimeout(() => setShow(true), 900);
        return () => clearTimeout(timer);
      }
    } catch {
      // ignore SSR or restricted localStorage
    }
  }, []);

  const handleAcceptAll = () => {
    setIsBitten(true);
    try {
      localStorage.setItem('ganeshspace_cookie_consent', 'accepted');
    } catch {}
    setTimeout(() => setShow(false), 500);
  };

  const handleEssentialOnly = () => {
    try {
      localStorage.setItem('ganeshspace_cookie_consent', 'essential');
    } catch {}
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.92 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[100] max-w-[390px] w-[calc(100vw-2rem)] select-none"
        >
          <div className="relative overflow-hidden rounded-3xl bg-[#0b0f19]/95 backdrop-blur-2xl border border-amber-500/30 p-4 sm:p-5 shadow-[0_15px_50px_rgba(0,0,0,0.85),0_0_35px_rgba(245,158,11,0.18)]">
            {/* Ambient neon gradient back-glow */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-orange-600/15 rounded-full blur-2xl pointer-events-none" />

            {/* Top Row: Badge + Close */}
            <div className="flex items-center justify-between gap-2 pb-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span>Cookies & Privacy 🍪</span>
              </div>
              <button
                type="button"
                onClick={handleEssentialOnly}
                className="p-1 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="Dismiss"
              >
                <X size={15} />
              </button>
            </div>

            {/* Middle: Cute Cookie + Message */}
            <div className="flex items-center gap-3.5 pt-1">
              <CuteCookieCharacter isBitten={isBitten} />
              <div className="space-y-1">
                <h4 className="text-sm font-black text-white flex items-center gap-1.5">
                  <span>Sweeten Your Stream!</span>
                  <Heart size={13} className="text-rose-400 fill-rose-400" />
                </h4>
                <p className="text-[11px] sm:text-xs text-gray-300 leading-snug">
                  We bake cookies to remember your watch progress, save favorite episodes & give you the best experience!
                </p>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center gap-2 pt-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={handleAcceptAll}
                className="flex-1 py-2.5 px-3 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/25 transition cursor-pointer"
              >
                <Sparkles size={13} className="fill-black" />
                <span>Accept Cookies</span>
              </motion.button>

              <button
                type="button"
                onClick={handleEssentialOnly}
                className="py-2.5 px-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 text-gray-400 hover:text-white font-bold text-xs transition cursor-pointer"
              >
                <span>Essential Only</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
