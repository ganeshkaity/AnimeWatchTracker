"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, X, Search, Check, Plus, Film, Tv, Sparkles, BookOpen, Bookmark
} from 'lucide-react';
import {
  getLocalMovies,
  getLocalAnimes,
  getLocalWebseries,
  getLocalManga,
  getLocalWatchlist,
  getVaultItems,
  toggleVaultItem
} from '../../utils/localStore';

const CATEGORIES = [
  { id: 'all', label: 'All Media', icon: Sparkles },
  { id: 'movie', label: 'Movies', icon: Film },
  { id: 'anime', label: 'Anime', icon: Sparkles },
  { id: 'webseries', label: 'Web-series', icon: Tv },
  { id: 'manga', label: 'Manga', icon: BookOpen },
  { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
];

export default function VaultManageModal({ isOpen, onClose, onVaultUpdated }) {
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');

  // Read all media libraries
  const allMedia = useMemo(() => {
    if (!isOpen) return [];
    if (typeof window === 'undefined') return [];

    const movies = (getLocalMovies() || []).map((m) => ({ ...m, mediaType: 'movie' }));
    const animes = (getLocalAnimes() || []).map((a) => ({ ...a, mediaType: 'anime' }));
    const webseries = (getLocalWebseries() || []).map((w) => ({ ...w, mediaType: 'webseries' }));
    const mangas = (getLocalManga() || []).map((m) => ({ ...m, mediaType: 'manga' }));
    const watchlist = (getLocalWatchlist() || []).map((w) => ({ ...w, mediaType: 'watchlist' }));

    return [...movies, ...animes, ...webseries, ...mangas, ...watchlist];
  }, [isOpen]);

  // Read currently vaulted item IDs
  const [vaultedIds, setVaultedIds] = useState(() => {
    if (typeof window === 'undefined') return new Set();
    return new Set((getVaultItems() || []).map((it) => it.id));
  });

  const handleToggle = (item) => {
    const isAdded = toggleVaultItem(item);
    setVaultedIds((prev) => {
      const next = new Set(prev);
      if (isAdded) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
    if (onVaultUpdated) onVaultUpdated();
  };

  // Filter items
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allMedia.filter((it) => {
      if (activeTab !== 'all' && it.mediaType !== activeTab) return false;
      if (!q) return true;
      const t = (it.title || it.name || '').toLowerCase();
      return t.includes(q);
    });
  }, [allMedia, activeTab, search]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-[#090d16] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        >
          {/* Header */}
          <div className="p-5 sm:p-6 bg-gradient-to-r from-purple-950/40 via-indigo-950/40 to-black/80 border-b border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shrink-0">
                <Lock size={18} />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-white">
                  Add / Remove Content in Secret Vault
                </h2>
                <p className="text-xs text-gray-400">
                  Select which movies, anime, or series to keep private in your hidden shelf
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

          {/* Search & Category Tabs */}
          <div className="p-4 sm:p-5 border-b border-white/5 space-y-3 bg-black/20">
            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search across your movies, anime, series, and watchlist..."
                className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveTab(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      activeTab === cat.id
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon size={12} />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Items List */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-2 flex-1 custom-scrollbar text-xs">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                No items found matching your filter.
              </div>
            ) : (
              filtered.map((item) => {
                const isVaulted = vaultedIds.has(item.id);
                const coverImg = item.posterUrl || item.posterPath || item.coverUrl || item.thumbnailBase64 || null;

                return (
                  <div
                    key={`${item.mediaType}-${item.id}`}
                    className={`p-2.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                      isVaulted
                        ? 'bg-purple-950/25 border-purple-500/40 text-white'
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'
                    }`}
                  >
                    {/* Item Thumbnail & Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-14 rounded-lg bg-black/60 overflow-hidden shrink-0 border border-white/10">
                        {coverImg ? (
                          <img src={coverImg} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600">
                            <Film size={16} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-white truncate text-xs">
                          {item.title || item.name || 'Untitled'}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                          <span className="uppercase font-mono text-purple-300 font-bold">{item.mediaType}</span>
                          {item.year && <span>• {item.year}</span>}
                          {item.rating > 0 && <span className="text-amber-400">★ {item.rating}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Toggle Button */}
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0 ${
                        isVaulted
                          ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md'
                          : 'bg-white/10 hover:bg-white/20 text-gray-200'
                      }`}
                    >
                      {isVaulted ? (
                        <>
                          <Check size={13} strokeWidth={3} />
                          <span>In Vault</span>
                        </>
                      ) : (
                        <>
                          <Plus size={13} strokeWidth={2.5} />
                          <span>Add to Vault</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-white/10 bg-black/30 flex items-center justify-between">
            <span className="text-xs text-gray-400 font-mono">
              {vaultedIds.size} {vaultedIds.size === 1 ? 'item' : 'items'} in secret vault
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs cursor-pointer transition"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

