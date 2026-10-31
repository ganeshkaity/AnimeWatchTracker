"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, X, Sparkles, Check, Lock, Award, Star,
  Shield, Flame, Zap
} from 'lucide-react';
import { calculateAchievements } from '../utils/achievements';

const RARITY_COLORS = {
  Mythic: 'from-amber-400 via-rose-500 to-purple-600 border-amber-400 text-amber-300',
  Legendary: 'from-amber-500 to-yellow-600 border-amber-500 text-amber-300',
  Epic: 'from-purple-600 to-indigo-600 border-purple-500 text-purple-300',
  Rare: 'from-blue-600 to-cyan-600 border-cyan-500 text-cyan-300',
  Uncommon: 'from-emerald-600 to-teal-600 border-emerald-500 text-emerald-300',
  Special: 'from-pink-600 to-rose-600 border-pink-500 text-pink-300',
};

export default function AchievementsModal({ isOpen, onClose }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'unlocked' | 'locked'

  const achievementData = useMemo(() => {
    if (!isOpen) return null;
    return calculateAchievements();
  }, [isOpen]);

  if (!isOpen || !achievementData) return null;

  const { badges, unlockedCount, totalBadges, rank, rankLevel, nextRankTarget } = achievementData;

  const filteredBadges = badges.filter((b) => {
    if (filter === 'unlocked') return b.unlocked;
    if (filter === 'locked') return !b.unlocked;
    return true;
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-3xl bg-[#090d16] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header Banner with Rank */}
          <div className="relative p-5 sm:p-6 bg-gradient-to-r from-purple-950/60 via-indigo-950/60 to-black/80 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-amber-500/20 shrink-0">
                <Trophy size={24} className="text-amber-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-wide">
                    Achievements &amp; Badges
                  </h2>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Tier {rankLevel}
                  </span>
                </div>
                <p className="text-xs text-gray-300 mt-0.5 flex items-center gap-1.5">
                  <span>Current Rank:</span>
                  <span className="font-extrabold text-amber-400">{rank}</span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-400 font-mono">
                    {unlockedCount} / {totalBadges} Unlocked
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 sm:static p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="px-5 sm:px-6 pt-4 pb-2 flex items-center justify-between border-b border-white/5 gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl text-xs font-bold border border-white/5">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  filter === 'all' ? 'bg-[#7c5cff] text-white shadow-md' : 'text-gray-400 hover:text-white'
                }`}
              >
                All ({totalBadges})
              </button>
              <button
                type="button"
                onClick={() => setFilter('unlocked')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  filter === 'unlocked' ? 'bg-emerald-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Check size={13} /> Unlocked ({unlockedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('locked')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  filter === 'locked' ? 'bg-amber-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Lock size={13} /> In Progress ({totalBadges - unlockedCount})
              </button>
            </div>

            {/* Rank Progress Bar */}
            <div className="text-[11px] text-gray-400 flex items-center gap-2">
              <span>Next Rank Progress:</span>
              <div className="w-24 sm:w-32 h-2 rounded-full bg-black/60 overflow-hidden border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((unlockedCount / nextRankTarget) * 100))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Badges Grid */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredBadges.map((badge) => {
                const rarityStyle = RARITY_COLORS[badge.rarity] || 'from-gray-700 to-gray-800 text-gray-300';

                return (
                  <div
                    key={badge.id}
                    className={`relative p-3.5 rounded-2xl border transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                      badge.unlocked
                        ? 'bg-gradient-to-br from-white/[0.06] to-white/[0.01] border-white/20 shadow-lg hover:border-amber-400/50'
                        : 'bg-black/40 border-white/5 opacity-70'
                    }`}
                  >
                    <div>
                      {/* Top Row: Icon + Rarity */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-lg border ${
                            badge.unlocked
                              ? 'bg-gradient-to-br from-amber-500/20 to-purple-500/20 border-amber-500/40 shadow-amber-500/10 scale-105'
                              : 'bg-white/5 border-white/10 grayscale'
                          }`}
                        >
                          <span>{badge.icon}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border bg-white/5 ${rarityStyle}`}>
                            {badge.rarity}
                          </span>
                          {badge.unlocked ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                              <Check size={11} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-white/5 border border-white/10 text-gray-500 flex items-center justify-center">
                              <Lock size={10} />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Title & Description */}
                      <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                        <span>{badge.title}</span>
                      </h4>
                      <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                        {badge.description}
                      </p>
                    </div>

                    {/* Progress Bar & Numeric Target */}
                    <div className="mt-3 pt-2.5 border-t border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className={badge.unlocked ? 'text-emerald-400 font-bold' : 'text-gray-400'}>
                          {badge.unlocked ? 'COMPLETED' : `${badge.current} / ${badge.target}`}
                        </span>
                        <span className="text-gray-500 font-bold">{badge.progressPercent}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-black/60 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            badge.unlocked
                              ? 'bg-gradient-to-r from-emerald-400 to-teal-400'
                              : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                          }`}
                          style={{ width: `${badge.progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

