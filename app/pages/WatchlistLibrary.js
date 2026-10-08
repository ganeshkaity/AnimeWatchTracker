"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bookmark, Search, Filter, ArrowUpDown, ChevronLeft, Plus,
  Star, Clock, CheckCircle2, AlertTriangle, X, Play,
  Edit3, Trash2, RotateCcw, Sparkles, SlidersHorizontal,
  Eye, Check, Calendar, Tv, Loader2, HardDrive, Globe,
  CreditCard, DollarSign, Film, BookOpen, Headphones, Layers, BookMarked
} from 'lucide-react';
import { collection, getDocs, doc, deleteDoc, updateDoc, onSnapshot, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  getLocalWatchlist, setLocalWatchlist, upsertLocalWatchlist, deleteLocalWatchlist,
  getUserId
} from '../utils/localStore';
import AddWatchlistModal from '../components/AddWatchlistModal';
import EditWatchlistModal from '../components/EditWatchlistModal';
import TransferWatchlistModal from '../components/TransferWatchlistModal';
import CachedImage from '../utils/imageCache';

const ALL_GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
  "Romance", "Science Fiction", "Thriller", "War", "Supernatural"
];

const CONTENT_TYPES = [
  { id: 'all', label: 'All Media' },
  { id: 'movie', label: 'Movies' },
  { id: 'web-series', label: 'Web-Series' },
  { id: 'anime', label: 'Anime' },
  { id: 'manga', label: 'Manga' },
  { id: 'audio-stories', label: 'Audio Stories' },
  { id: 'manhwa', label: 'Manhwa' },
  { id: 'webtoon', label: 'Webtoon' },
];

const STREAM_FILTERS = [
  { id: 'all', label: 'All Providers' },
  { id: 'needPlan', label: 'Need Plan (Sub)' },
  { id: 'rent', label: 'Rent' },
  { id: 'buy', label: 'Buy' },
  { id: 'free', label: 'Free to Watch' },
];

const STATUS_FILTERS = [
  { id: 'all', label: 'All Status' },
  { id: 'Plan to Watch', label: 'Plan to Watch' },
  { id: 'Currently Watching', label: 'Watching' },
  { id: 'Completed', label: 'Completed' },
];

const SORT_OPTIONS = [
  { id: 'recent', label: 'Recently Added' },
  { id: 'alpha-asc', label: 'A - Z' },
  { id: 'alpha-desc', label: 'Z - A' },
  { id: 'rating', label: 'Highest Rating' },
  { id: 'year', label: 'Release Year' },
];

export default function WatchlistLibrary() {
  const router = useRouter();
  const { currentUser } = useAuth();

  const [watchlist, setWatchlist] = useState(() => {
    if (typeof window !== 'undefined') {
      return getLocalWatchlist() || [];
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      const local = getLocalWatchlist();
      return !(local && local.length > 0);
    }
    return true;
  });

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStreamPlan, setSelectedStreamPlan] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [sortBy, setSortBy] = useState('recent');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [transferringItem, setTransferringItem] = useState(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);

  // Progressive loading screen count
  const [visibleCount, setVisibleCount] = useState(18);
  const loadMoreRef = useRef(null);

  // Load from Firestore / localStore with real-time sync
  useEffect(() => {
    const local = getLocalWatchlist() || [];
    if (local.length > 0) {
      setWatchlist(local);
      setLoading(false);
    }

    if (!db) {
      setLoading(false);
      return;
    }

    const uid = currentUser?.uid || getUserId();
    if (!uid) {
      setLoading(false);
      return;
    }

    const watchlistRef = collection(db, 'users', uid, 'watchlist');
    const unsubscribe = onSnapshot(query(watchlistRef), (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, userId: uid, ...d.data() });
      });
      const localNow = getLocalWatchlist() || [];
      if (list.length > 0) {
        setWatchlist(list);
        setLocalWatchlist(list);
      } else if (localNow.length > 0) {
        setWatchlist(localNow);
        // Upload local items to Firestore so they are never lost on refresh
        localNow.forEach((item) => {
          setDoc(doc(db, 'users', uid, 'watchlist', item.id), item, { merge: true }).catch(console.warn);
        });
      } else {
        setWatchlist([]);
        setLocalWatchlist([]);
      }
      setLoading(false);
    }, (err) => {
      console.warn('Firestore load watchlist error:', err);
      setWatchlist(getLocalWatchlist() || []);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Add Item Handler
  const handleAddWatchlist = (newItem) => {
    setWatchlist(prev => [newItem, ...prev.filter(i => i.id !== newItem.id)]);
    upsertLocalWatchlist(newItem);
    if (db) {
      const uid = currentUser?.uid || getUserId();
      import('firebase/firestore').then(({ setDoc, doc }) => {
        setDoc(doc(db, 'users', uid, 'watchlist', newItem.id), newItem, { merge: true }).catch(console.error);
      });
    }
  };

  // Save Edit Handler
  const handleSaveEdit = (updatedItem) => {
    setWatchlist(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
    upsertLocalWatchlist(updatedItem);
    if (db) {
      const uid = currentUser?.uid || getUserId();
      import('firebase/firestore').then(({ setDoc, doc }) => {
        setDoc(doc(db, 'users', uid, 'watchlist', updatedItem.id), updatedItem, { merge: true }).catch(console.error);
      });
    }
  };

  // Delete Handler
  const handleDeleteItem = async (itemId) => {
    setWatchlist(prev => prev.filter(i => i.id !== itemId));
    deleteLocalWatchlist(itemId);
    setDeleteConfirmItem(null);
    if (db) {
      const uid = currentUser?.uid || getUserId();
      try {
        await deleteDoc(doc(db, 'users', uid, 'watchlist', itemId));
      } catch (err) {
        console.error('Delete error:', err);
      }
    }
  };

  // Toggle Status (Plan to Watch <-> Completed)
  const handleToggleStatus = (item) => {
    const newStatus = item.status === 'Completed' ? 'Plan to Watch' : 'Completed';
    const updated = { ...item, status: newStatus, updatedAt: new Date().toISOString() };
    handleSaveEdit(updated);
  };

  // Filter & Sort Logic
  const filteredAndSorted = useMemo(() => {
    return watchlist.filter((item) => {
      // 1. Text Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesOrig = item.originalTitle?.toLowerCase().includes(q);
        const matchesOverview = item.overview?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesOrig && !matchesOverview) return false;
      }

      // 2. Content Type Filter
      if (selectedType !== 'all') {
        if (item.contentType !== selectedType) return false;
      }

      // 3. Status Filter
      if (selectedStatus !== 'all') {
        if (item.status !== selectedStatus) return false;
      }

      // 4. Stream Provider Filter
      if (selectedStreamPlan !== 'all') {
        const provs = item.streamProviders?.[selectedStreamPlan];
        if (!Array.isArray(provs) || provs.length === 0) return false;
      }

      // 5. Genres
      if (selectedGenres.length > 0) {
        const hasGenre = selectedGenres.some(g => item.genres?.includes(g));
        if (!hasGenre) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'recent') {
        return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
      }
      if (sortBy === 'alpha-asc') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortBy === 'alpha-desc') {
        return (b.title || '').localeCompare(a.title || '');
      }
      if (sortBy === 'rating') {
        return (b.rating || 0) - (a.rating || 0);
      }
      if (sortBy === 'year') {
        return (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0);
      }
      return 0;
    });
  }, [watchlist, search, selectedType, selectedStatus, selectedStreamPlan, selectedGenres, sortBy]);

  // Infinite Scroll Trigger
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && visibleCount < filteredAndSorted.length) {
        setVisibleCount(prev => prev + 12);
      }
    }, { threshold: 0.1 });

    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [visibleCount, filteredAndSorted.length]);

  const displayedItems = filteredAndSorted.slice(0, visibleCount);

  const resetAllFilters = () => {
    setSearch('');
    setSelectedType('all');
    setSelectedStreamPlan('all');
    setSelectedStatus('all');
    setSelectedGenres([]);
    setSortBy('recent');
  };

  const hasActiveFilters = search || selectedType !== 'all' || selectedStreamPlan !== 'all' || selectedStatus !== 'all' || selectedGenres.length > 0 || sortBy !== 'recent';

  return (
    <div className="min-h-screen bg-[#07090f] text-white flex flex-col selection:bg-amber-500 selection:text-black">
      {/* ── Top Header Panel ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#07090f]/90 backdrop-blur-xl border-b border-white/10 px-4 md:px-8 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Back & Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
              title="Back to Dashboard"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base sm:text-lg font-black tracking-wide text-white">
                    Watchlist
                  </h1>
                </div>
              </div>
            </div>
          </div>

          {/* Action: Add to Watchlist */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white font-black text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer active:scale-95 transition"
            >
              <Plus size={16} />
              <span>Add</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Filters & Controls Bar ───────────────────────────────────────────── */}
      <div className="max-w-7xl w-full mx-auto px-4 md:px-8 pt-5 pb-3 space-y-3">
        {/* Search & Main Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              type="text"
              placeholder="Search watchlist titles, descriptions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Secondary Controls: Sort & Filter Toggle */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-gray-300">
              <ArrowUpDown size={13} className="text-gray-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent border-none text-xs text-white font-semibold focus:outline-none cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-[#101420] text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Panel Toggle */}
            <button
              type="button"
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                showFilterPanel || hasActiveFilters
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              <SlidersHorizontal size={13} />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Content Type Quick-Pills Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedType(t.id)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                selectedType === t.id
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Expandable Advanced Filter Panel */}
        <AnimatePresence>
          {showFilterPanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4 overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                {/* Streaming Availability */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Streaming Plan / Type
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {STREAM_FILTERS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedStreamPlan(s.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                          selectedStreamPlan === s.id
                            ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                    Status
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_FILTERS.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSelectedStatus(st.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                          selectedStatus === st.id
                            ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reset Action */}
                <div className="flex items-end justify-start sm:justify-end">
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Reset All Filters</span>
                  </button>
                </div>
              </div>

              {/* Genre Pills */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                  Genres
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                  {ALL_GENRES.map((g) => {
                    const active = selectedGenres.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          setSelectedGenres(active ? selectedGenres.filter(x => x !== g) : [...selectedGenres, g]);
                        }}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border transition ${
                          active
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Main Media Grid ─────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 pb-16">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5 pt-2">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div key={idx} className="glass-card rounded-2xl overflow-hidden aspect-[2/3] bg-white/[0.04] shimmer" />
            ))}
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="p-12 md:p-16 rounded-3xl glass-panel text-center border border-white/10 max-w-lg mx-auto my-12 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
              <Bookmark size={28} />
            </div>
            {watchlist.length === 0 ? (
              <>
                <h3 className="text-lg font-bold text-white">No Items in Watchlist</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Start adding movies, web-series, anime, manga, and audio stories to keep track of what you want to watch next!
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer transition"
                >
                  <Plus size={16} />
                  <span>Add First Item</span>
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-white">No Matching Items</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Try adjusting your search terms or filter criteria to find the media you're looking for.
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer border border-white/10"
                >
                  <RotateCcw size={13} />
                  <span>Clear All Filters</span>
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5 pt-2">
            {displayedItems.map((item) => {
              const coverImg = item.posterUrl || (item.images?.posters?.[0]?.url || null);
              const isCompleted = item.status === 'Completed';

              // Extract top streaming provider pills
              const streamBadges = [];
              if (item.streamProviders?.needPlan?.length > 0) {
                streamBadges.push(item.streamProviders.needPlan[0].name);
              } else if (item.streamProviders?.free?.length > 0) {
                streamBadges.push(item.streamProviders.free[0].name);
              } else if (item.streamProviders?.rent?.length > 0) {
                streamBadges.push(`Rent: ${item.streamProviders.rent[0].name}`);
              }

              return (
                <div
                  key={item.id}
                  onClick={() => router.push(`/watchlist/${item.id}`)}
                  className="glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col justify-between border border-white/10 hover:border-amber-500/50 transition-all duration-300 shadow-md hover:shadow-2xl relative"
                >
                  {/* Poster Area */}
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#181c24] flex items-center justify-center">
                    {coverImg ? (
                      <CachedImage
                        src={coverImg}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-900/50 to-black flex flex-col items-center justify-center p-3 text-center">
                        <Bookmark size={28} className="text-amber-400 mb-1" />
                        <span className="text-[10px] font-bold text-white/90 line-clamp-2">{item.title}</span>
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30 pointer-events-none" />

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-amber-300 text-[9px] font-extrabold uppercase tracking-wider border border-white/10">
                        {item.contentType || 'Media'}
                      </span>
                    </div>

                    <div className="absolute top-2 right-2">
                      {item.rating > 0 ? (
                        <span className="px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-amber-400 text-[9px] font-bold flex items-center gap-0.5 border border-white/10">
                          <Star size={9} className="fill-amber-400" />
                          {item.rating}
                        </span>
                      ) : null}
                    </div>

                    {/* Hover Overlay with Action Buttons */}
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center p-3 gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/watchlist/${item.id}`);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold flex items-center gap-1.5 shadow-lg active:scale-95 transition"
                      >
                        <Eye size={13} />
                        <span>Details</span>
                      </button>

                      <div className="flex items-center gap-1.5 mt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingItem(item);
                          }}
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white transition"
                          title="Edit Details"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStatus(item);
                          }}
                          className={`p-1.5 rounded-lg border transition ${
                            isCompleted
                              ? 'bg-emerald-500/30 border-emerald-500/50 text-emerald-300'
                              : 'bg-white/10 border-white/20 text-gray-300 hover:text-white'
                          }`}
                          title={isCompleted ? 'Mark Plan to Watch' : 'Mark Completed'}
                        >
                          <CheckCircle2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmItem(item);
                          }}
                          className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 transition"
                          title="Remove from Watchlist"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Details */}
                  <div className="p-3 bg-[#0d1117] flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-white truncate group-hover:text-amber-300 transition-colors" title={item.title}>
                        {item.title}
                      </h4>

                      <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1">
                        <span>{item.year || item.contentType}</span>
                        <span className={isCompleted ? "text-emerald-400 font-bold flex items-center gap-0.5" : "text-amber-400 font-semibold"}>
                          {item.status || 'Plan to Watch'}
                        </span>
                      </div>
                    </div>

                    {/* Stream Pill */}
                    {streamBadges.length > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center gap-1 text-[9px] text-cyan-300 truncate">
                        <Globe size={10} className="shrink-0 text-cyan-400" />
                        <span className="truncate">{streamBadges[0]}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Load More Trigger */}
        {visibleCount < filteredAndSorted.length && (
          <div ref={loadMoreRef} className="py-8 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-amber-400" />
            <span>Loading more watchlist items...</span>
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      <AddWatchlistModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAddWatchlist={handleAddWatchlist}
      />

      <EditWatchlistModal
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
        item={editingItem}
        onSave={handleSaveEdit}
      />

      <TransferWatchlistModal
        isOpen={Boolean(transferringItem)}
        onClose={() => setTransferringItem(null)}
        item={transferringItem}
        onTransferred={(deletedId) => {
          setWatchlist(prev => prev.filter(i => i.id !== deletedId));
          setTransferringItem(null);
        }}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#0f1422] border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-400" /> Remove from Watchlist?
            </h3>
            <p className="text-xs text-gray-300">
              Are you sure you want to remove <span className="text-white font-bold">{deleteConfirmItem.title}</span> from your watchlist?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteItem(deleteConfirmItem.id)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
