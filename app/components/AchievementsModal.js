"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, X, Check, Lock, Sparkles
} from 'lucide-react';
import { calculateAchievements } from '../utils/achievements';

const RARITY_STYLES = {
  Mythic: {
    pill: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    glow: 'from-amber-500/15 via-rose-500/10 to-purple-600/15 border-amber-400/35',
    iconBg: 'bg-gradient-to-br from-amber-400/25 to-rose-500/25 border-amber-400/40',
  },
  Legendary: {
    pill: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    glow: 'from-amber-500/15 to-yellow-600/10 border-amber-500/35',
    iconBg: 'bg-gradient-to-br from-amber-500/25 to-yellow-500/20 border-amber-500/40',
  },
  Epic: {
    pill: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
    glow: 'from-purple-500/15 to-indigo-600/10 border-purple-500/35',
    iconBg: 'bg-gradient-to-br from-purple-500/25 to-indigo-500/20 border-purple-500/40',
  },
  Rare: {
    pill: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
    glow: 'from-cyan-500/15 to-blue-600/10 border-cyan-500/35',
    iconBg: 'bg-gradient-to-br from-cyan-500/25 to-blue-500/20 border-cyan-500/40',
  },
  Uncommon: {
    pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    glow: 'from-emerald-500/15 to-teal-600/10 border-emerald-500/35',
    iconBg: 'bg-gradient-to-br from-emerald-500/25 to-teal-500/20 border-emerald-500/40',
  },
  Special: {
    pill: 'bg-pink-500/15 text-pink-300 border-pink-500/40',
    glow: 'from-pink-500/15 to-rose-600/10 border-pink-500/35',
    iconBg: 'bg-gradient-to-br from-pink-500/25 to-rose-500/20 border-pink-500/40',
  },
};

export default function AchievementsModal({ isOpen, onClose }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'unlocked' | 'locked'
  const [categoryFilter, setCategoryFilter] = useState('All');

  const achievementData = useMemo(() => {
    if (!isOpen) return null;
    return calculateAchievements();
  }, [isOpen]);

  const categories = useMemo(() => {
    if (!achievementData) return ['All'];
    const set = new Set(achievementData.badges.map((b) => b.category));
    return ['All', ...Array.from(set)];
  }, [achievementData]);

  if (!isOpen || !achievementData) return null;

  const { badges, unlockedCount, totalBadges, rank, rankLevel, nextRankTarget } = achievementData;
  const overallPct = Math.round((unlockedCount / Math.max(1, totalBadges)) * 100);
  const rankPct = Math.min(100, Math.round((unlockedCount / Math.max(1, nextRankTarget)) * 100));

  const filteredBadges = badges.filter((b) => {
    if (filter === 'unlocked' && !b.unlocked) return false;
    if (filter === 'locked' && b.unlocked) return false;
    if (categoryFilter !== 'All' && b.category !== categoryFilter) return false;
    return true;
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.18 }}
          className="relative w-full max-w-5xl h-[90vh] max-h-[90vh] bg-[#070709] border border-white/15 rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col"
        >
          {/* Compact Executive Header */}
          <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-white/10 bg-gradient-to-r from-white/[0.05] via-purple-950/20 to-black">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-purple-600 p-[1px] shadow-lg shadow-amber-500/15 shrink-0">
                  <div className="w-full h-full rounded-[15px] bg-[#0c0c10] flex items-center justify-center">
                    <Trophy size={22} className="text-amber-300" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight truncate">
                      Achievements &amp; Milestones
                    </h2>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                      Tier {rankLevel}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white">{rank}</span>
                    <span className="text-gray-600">•</span>
                    <span>
                      <strong className="text-emerald-400">{unlockedCount}</strong>/{totalBadges} unlocked ({overallPct}%)
                    </span>
                    <span className="hidden sm:inline text-gray-600">•</span>
                    <span className="hidden sm:inline-flex items-center gap-2">
                      <span>Next Tier {unlockedCount}/{nextRankTarget}</span>
                      <span className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden inline-block align-middle">
                        <span
                          className="block h-full bg-gradient-to-r from-amber-400 via-purple-500 to-cyan-400 rounded-full"
                          style={{ width: `${rankPct}%` }}
                        />
                      </span>
                    </span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Non-overlapping Filter Bar */}
          <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-white/10 bg-[#0b0b0f] flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl text-xs font-bold border border-white/10 w-fit shrink-0">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition cursor-pointer ${
                  filter === 'all' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                All ({totalBadges})
              </button>
              <button
                type="button"
                onClick={() => setFilter('unlocked')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                  filter === 'unlocked' ? 'bg-emerald-500 text-black shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Check size={13} /> Unlocked ({unlockedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('locked')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition cursor-pointer flex items-center gap-1 ${
                  filter === 'locked' ? 'bg-amber-400 text-black shadow-sm' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Lock size={12} /> In Progress ({totalBadges - unlockedCount})
              </button>
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap shrink-0 transition cursor-pointer ${
                    categoryFilter === cat
                      ? 'bg-purple-500/25 text-purple-200 border-purple-400/50'
                      : 'bg-white/[0.03] text-gray-400 border-white/10 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Spacious Scrollable Badges Grid */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
            {filteredBadges.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
                <Sparkles size={24} className="text-gray-600" />
                <span>No achievements match this filter.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredBadges.map((badge) => {
                  const style = RARITY_STYLES[badge.rarity] || RARITY_STYLES.Uncommon;

                  return (
                    <div
                      key={badge.id}
                      className={`relative p-4 rounded-2xl border transition-colors duration-200 flex flex-col justify-between ${
                        badge.unlocked
                          ? `bg-gradient-to-br ${style.glow} shadow-lg`
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border ${
                              badge.unlocked ? style.iconBg : 'bg-white/5 border-white/10 grayscale opacity-70'
                            }`}
                          >
                            <span>{badge.icon}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${style.pill}`}>
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

                        <h4 className="text-sm font-extrabold text-white">{badge.title}</h4>
                        <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                          {badge.description}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className={badge.unlocked ? 'text-emerald-400 font-bold' : 'text-gray-400'}>
                            {badge.unlocked ? 'COMPLETED' : `${badge.current} / ${badge.target}`}
                          </span>
                          <span className="text-gray-400 font-bold">{badge.progressPercent}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-black/70 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              badge.unlocked
                                ? 'bg-gradient-to-r from-emerald-400 to-teal-400'
                                : 'bg-gradient-to-r from-purple-500 to-cyan-400'
                            }`}
                            style={{ width: `${badge.progressPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
