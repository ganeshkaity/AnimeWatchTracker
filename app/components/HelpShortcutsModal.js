"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Keyboard, X, Film, Tv, Sparkles, Bookmark, HelpCircle,
  Command, CornerDownLeft
} from 'lucide-react';

const SHORTCUTS = [
  {
    keys: ['Ctrl', 'N'],
    label: 'Add Anime',
    desc: 'Open the Add Anime modal to track local folders or YouTube playlists',
    icon: Sparkles,
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  },
  {
    keys: ['Ctrl', 'M'],
    label: 'Add Movie',
    desc: 'Open the Add Movie modal to link local movie files with TMDB metadata',
    icon: Film,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  {
    keys: ['Ctrl', 'W'],
    label: 'Add Web-series',
    desc: 'Open the Add Web-series modal to scan seasons & episodes with TMDB',
    icon: Tv,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  },
  {
    keys: ['Ctrl', 'L'],
    label: 'Add to Watchlist',
    desc: 'Open the Add Watchlist modal to save movies & series for later',
    icon: Bookmark,
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  },
  {
    keys: ['Ctrl', 'H'],
    label: 'Shortcuts Help',
    desc: 'Open this keyboard shortcuts quick reference cheatsheet',
    icon: HelpCircle,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
  {
    keys: ['Esc'],
    label: 'Close Active Modal',
    desc: 'Dismiss any open dialog, preview player, or lightbox immediately',
    icon: CornerDownLeft,
    color: 'text-gray-300 bg-white/5 border-white/10',
  },
];

export default function HelpShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-xl bg-[#090d16] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-5 sm:p-6 bg-gradient-to-r from-purple-950/40 via-indigo-950/40 to-black/80 border-b border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shrink-0">
                <Keyboard size={20} />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <span>Keyboard Shortcuts</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
                    Ctrl + Key
                  </span>
                </h2>
                <p className="text-xs text-gray-400">
                  Quick hotkeys to navigate &amp; track media with your keyboard
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Shortcuts List */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-3 max-h-[70vh] custom-scrollbar">
            {SHORTCUTS.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl border shrink-0 ${item.color}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-white">{item.label}</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{item.desc}</p>
                    </div>
                  </div>

                  {/* Visual Keyboard Badges */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {item.keys.map((k, kIdx) => (
                      <React.Fragment key={kIdx}>
                        {kIdx > 0 && <span className="text-xs text-gray-500 font-bold">+</span>}
                        <kbd className="px-2.5 py-1 rounded-lg bg-black/70 border border-white/20 text-white font-mono text-[11px] font-black shadow-[0_2px_0_rgba(255,255,255,0.2)]">
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-white/10 bg-black/40 flex items-center justify-between text-xs text-gray-400">
            <span>Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">Esc</kbd> anytime to dismiss modals</span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs cursor-pointer transition"
            >
              Got It
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

