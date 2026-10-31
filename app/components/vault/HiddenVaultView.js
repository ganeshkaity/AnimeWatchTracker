"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock, Unlock, Plus, ArrowLeft, Shield, Eye, Trash2, Film, Tv,
  Sparkles, BookOpen, Bookmark, X, Search
} from 'lucide-react';
import { getVaultItems, toggleVaultItem } from '../../utils/localStore';
import MediaCard from '../dashboard/cards/MediaCard';
import VaultManageModal from './VaultManageModal';

export default function HiddenVaultView({ onExitVault, onSelectAnime }) {
  const router = useRouter();
  const [vaultItems, setVaultItems] = useState(() => (typeof window !== 'undefined' ? getVaultItems() || [] : []));
  const [showManageModal, setShowManageModal] = useState(false);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'movie' | 'anime' | 'webseries' | 'manga' | 'watchlist'
  const [search, setSearch] = useState('');

  const refreshVault = () => {
    if (typeof window !== 'undefined') {
      setVaultItems(getVaultItems() || []);
    }
  };

  useEffect(() => {
    refreshVault();
    window.addEventListener('vault_items_updated', refreshVault);
    return () => window.removeEventListener('vault_items_updated', refreshVault);
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vaultItems.filter((it) => {
      if (filterType !== 'all' && it.mediaType !== filterType) return false;
      if (!q) return true;
      const t = (it.title || it.name || '').toLowerCase();
      return t.includes(q);
    });
  }, [vaultItems, filterType, search]);

  return (
    <div className="min-h-screen bg-[#07090e] text-white">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 bg-[#07090e]/95 backdrop-blur-xl border-b border-purple-500/20 px-4 sm:px-6 lg:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onExitVault}
              className="p-2 sm:p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 shadow-md"
              title="Lock & Exit Vault to Normal Home"
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Exit Vault</span>
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
                <Lock size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                    <span>Secret Vault</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      Hidden Shelf
                    </span>
                  </h1>
                </div>
                <p className="text-[11px] text-gray-400 hidden sm:block">
                  Protected personal content • Not visible on public shelves
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowManageModal(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition shadow-lg shadow-purple-600/20 cursor-pointer active:scale-95"
            >
              <Plus size={16} />
              <span>Add / Manage Content</span>
            </button>

            <button
              type="button"
              onClick={onExitVault}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95"
            >
              <Lock size={14} />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-6 sm:py-8 space-y-8">
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] border border-white/5 p-3 rounded-2xl">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {['all', 'movie', 'anime', 'webseries', 'manga', 'watchlist'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterType(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition cursor-pointer ${
                  filterType === tab
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                {tab === 'all' ? 'All Items' : tab}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter vault items..."
              className="w-full pl-9 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
            />
          </div>
        </div>

        {/* Items Grid */}
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 shadow-xl">
              <Lock size={28} />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mb-2">Secret Vault is Empty</h2>
            <p className="text-xs sm:text-sm text-gray-400 max-w-md mb-6 leading-relaxed">
              No private titles in your hidden shelf yet. Click below to choose which movies, anime, or series to keep private.
            </p>
            <button
              type="button"
              onClick={() => setShowManageModal(true)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-purple-600/30 cursor-pointer active:scale-95"
            >
              <Plus size={16} />
              <span>Add Items to Vault</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-1.5 sm:gap-2">
            {filteredItems.map((item) => {
              const coverImg = item.posterUrl || item.posterPath || (item.thumbnailBase64 || null);
              const rating = item.rating || item.score || null;
              const movieYear = item.year || 'Item';
              const runtimeStr = item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : null;

              return (
                <div key={item.id} className="relative group/vault">
                  {/* Remove from Vault Action Pill on Card */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVaultItem(item);
                      refreshVault();
                    }}
                    className="absolute top-2 right-2 z-30 p-1.5 rounded-lg bg-black/80 hover:bg-rose-600 text-gray-300 hover:text-white border border-white/20 transition opacity-0 group-hover/vault:opacity-100 shadow-xl cursor-pointer"
                    title="Remove from Secret Vault"
                  >
                    <Trash2 size={12} />
                  </button>

                  <MediaCard
                    item={item}
                    type={item.mediaType || 'movie'}
                    coverImg={coverImg}
                    rating={rating}
                    subLeft={movieYear}
                    subRight={runtimeStr || (item.mediaType === 'webseries' ? 'Series' : item.mediaType === 'anime' ? 'Anime' : 'Movie')}
                    accentBorder="hover:border-purple-400/50"
                    onClick={() => {
                      if (item.mediaType === 'movie') {
                        router.push(`/movies/${item.id}`);
                      } else if (item.mediaType === 'webseries') {
                        router.push(`/webseries/${item.id}`);
                      } else if (item.mediaType === 'anime' && onSelectAnime) {
                        onSelectAnime(item.id);
                      } else if (item.mediaType === 'watchlist') {
                        router.push(`/watchlist/${item.id}`);
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add / Manage Content Modal */}
      <VaultManageModal
        isOpen={showManageModal}
        onClose={() => setShowManageModal(false)}
        onVaultUpdated={refreshVault}
      />
    </div>
  );
}

