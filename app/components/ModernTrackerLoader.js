"use client";

import React from 'react';
import { motion } from 'framer-motion';

export default function ModernTrackerLoader({ text = "Booting Tracker..." }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#07090f] relative overflow-hidden select-none">
      {/* Dynamic Background Aura Lights */}
      <div className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-[#7c5cff]/15 via-cyan-500/10 to-transparent blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute w-[350px] h-[350px] rounded-full bg-gradient-to-br from-pink-500/10 via-purple-600/15 to-transparent blur-2xl pointer-events-none" />

      {/* Cyber Grid Lines Overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center">
        {/* Animated Cyber Holographic Ring Center */}
        <div className="relative w-32 h-32 sm:w-36 sm:h-36 flex items-center justify-center">
          {/* Outer Pulsing Glow */}
          <div className="absolute inset-0 rounded-full bg-[#7c5cff]/20 blur-xl animate-pulse" />

          {/* Outer Segmented Rotating Ring */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#7c5cff] border-r-cyan-400"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
          />

          {/* Middle Counter-Rotating Ring */}
          <motion.div
            className="absolute inset-3 rounded-full border border-dashed border-purple-400/50"
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: 5, ease: "linear" }}
          />

          {/* Inner Glowing Orbit */}
          <motion.div
            className="absolute inset-6 rounded-full border-2 border-transparent border-b-cyan-300 border-l-[#7c5cff]"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
          />

          {/* Center Brand Hologram / Logo Pulse */}
          <motion.div
            className="relative z-20 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#121626] to-[#0c0f1d] border border-white/20 p-2.5 shadow-2xl flex items-center justify-center backdrop-blur-md"
            animate={{
              scale: [1, 1.06, 1],
              boxShadow: [
                "0 0 15px rgba(124, 92, 255, 0.3)",
                "0 0 25px rgba(6, 182, 212, 0.5)",
                "0 0 15px rgba(124, 92, 255, 0.3)",
              ],
            }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
          >
            <img
              src="/logo.png"
              alt="Logo"
              className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(124,92,255,0.8)]"
            />
          </motion.div>

          {/* Orbiting Photon Particle */}
          <motion.div
            className="absolute w-full h-full"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2.8, ease: "linear" }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#22d3ee] -top-1 left-1/2 -translate-x-1/2 absolute" />
          </motion.div>
        </div>

        {/* Text & Neon Loading Track */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-100 to-gray-400">
              GANESH<span className="text-[#7c5cff]">SPACE</span>
            </span>
          </div>

          {/* Cyber Status Text with shimmer */}
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-[11px] uppercase tracking-[0.25em] text-gray-400 font-semibold font-mono">
              {text}
            </span>
          </div>

          {/* Animated Neon Light Progress Track */}
          <div className="w-48 sm:w-56 h-1 rounded-full bg-white/5 border border-white/10 overflow-hidden relative mt-1">
            <motion.div
              className="absolute top-0 bottom-0 w-24 rounded-full bg-gradient-to-r from-transparent via-[#7c5cff] to-cyan-400"
              animate={{ x: [-100, 240] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

