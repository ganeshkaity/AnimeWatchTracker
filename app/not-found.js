"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  Home, 
  ArrowLeft, 
  Compass, 
  Tv, 
  Sparkles, 
  Radio, 
  Film, 
  StickyNote,
  Terminal,
  Search
} from 'lucide-react';

export default function NotFound() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      const { clientX, clientY } = e;
      const x = (clientX / (typeof window !== 'undefined' ? window.innerWidth : 1000) - 0.5) * 30;
      const y = (clientY / (typeof window !== 'undefined' ? window.innerHeight : 1000) - 0.5) * 30;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden select-none">
      {/* Dynamic Interactive Liquid Ambient Light Orbs */}
      <motion.div
        animate={{
          x: mousePosition.x * 1.5,
          y: mousePosition.y * 1.5,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 100 }}
        className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-purple-600/20 via-pink-500/15 to-transparent blur-[120px] pointer-events-none -top-20 -left-20"
      />
      <motion.div
        animate={{
          x: -mousePosition.x * 1.2,
          y: -mousePosition.y * 1.2,
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 100 }}
        className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-br from-cyan-500/20 via-blue-600/15 to-transparent blur-[120px] pointer-events-none -bottom-20 -right-20"
      />

      {/* Futuristic Background Grid with Perspective */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 65% 50% at 50% 50%, #000 70%, transparent 100%)',
        }}
      />

      {/* Main Glass Centerpiece Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 max-w-xl w-full transparent-liquid-glass rounded-3xl p-8 sm:p-12 text-center border border-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.3)] backdrop-blur-2xl"
      >
        {/* Status Pill Badge with animated pulse */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs font-mono text-purple-300 mb-6 shadow-inner backdrop-blur-md"
        >
          <Radio size={13} className="text-cyan-400 animate-pulse" />
          <span className="font-bold tracking-wider uppercase text-[11px] text-gray-300">
            Signal Lost <span className="text-gray-500">•</span> Episode 404
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
        </motion.div>

        {/* Dynamic Glowing 404 Typography with Subtle Parallax */}
        <div className="relative my-2 select-none">
          <motion.h1
            animate={{
              x: mousePosition.x * 0.4,
              y: mousePosition.y * 0.4,
            }}
            transition={{ type: 'spring', damping: 20, stiffness: 80 }}
            className="text-8xl sm:text-9xl font-black tracking-tighter bg-gradient-to-b from-white via-gray-200 to-gray-500/30 bg-clip-text text-transparent drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)]"
          >
            404
          </motion.h1>

          {/* Holographic Subtle Accent Underglow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-10">
            <span className="text-8xl sm:text-9xl font-black tracking-tighter text-cyan-400/10 blur-xl scale-105">
              404
            </span>
          </div>
        </div>

        {/* Minimalist Subtitle & Description */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="space-y-2 mt-2 mb-8"
        >
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            Timeline Disconnected
            <Sparkles size={18} className="text-amber-300 animate-pulse" />
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
            The episode, folder, or dimension you are looking for does not exist or has been shifted to another realm.
          </p>
        </motion.div>

        {/* Primary Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full"
        >
          <Link
            href="/"
            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-[#7c5cff] via-[#a855f7] to-[#ec4899] hover:brightness-110 text-white text-xs font-black uppercase tracking-wider shadow-[0_0_25px_rgba(168,85,247,0.4)] transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <Home size={16} />
            Back to Library
          </Link>

          <button
            type="button"
            onClick={() => window.history.back()}
            className="w-full sm:w-auto px-6 py-3 rounded-2xl liquid-glass-item text-gray-300 hover:text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <ArrowLeft size={16} />
            Previous Page
          </button>
        </motion.div>

        {/* Quick Nav Destination Shortcuts */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="mt-8 pt-6 border-t border-white/10 flex flex-wrap items-center justify-center gap-2 text-xs"
        >
          <span className="text-gray-500 text-[11px] mr-1">Quick Jump:</span>
          
          <Link
            href="/"
            className="px-3 py-1 rounded-xl liquid-glass-item text-gray-400 hover:text-cyan-300 text-[11px] font-medium flex items-center gap-1.5 transition"
          >
            <Tv size={12} className="text-cyan-400" /> Dashboard
          </Link>

          <Link
            href="/notes"
            className="px-3 py-1 rounded-xl liquid-glass-item text-gray-400 hover:text-amber-300 text-[11px] font-medium flex items-center gap-1.5 transition"
          >
            <StickyNote size={12} className="text-amber-400" /> Anime Notes
          </Link>

          <Link
            href="/stream"
            className="px-3 py-1 rounded-xl liquid-glass-item text-gray-400 hover:text-purple-300 text-[11px] font-medium flex items-center gap-1.5 transition"
          >
            <Film size={12} className="text-purple-400" /> Show Stream
          </Link>
        </motion.div>
      </motion.div>

      {/* Minimal Footer Tag */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 0.6 }}
        className="mt-6 text-[10px] font-mono tracking-widest text-gray-500 uppercase"
      >
        WatchAnime System • Error 404 • Page Not Found
      </motion.p>
    </div>
  );
}
