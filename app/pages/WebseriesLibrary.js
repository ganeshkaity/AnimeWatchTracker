"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tv, Search, Filter, ArrowUpDown, ChevronLeft, Plus,
  Star, Clock, CheckCircle2, AlertTriangle, X, Play,
  Edit3, Trash2, RotateCcw, Sparkles, SlidersHorizontal,
  Eye, Check, Calendar, Loader2, HardDrive, Layers,
  MoreVertical
} from 'lucide-react';
import { collection, doc, deleteDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  getLocalWebseries, setLocalWebseries, upsertLocalWebseries, deleteLocalWebseries,
  setLocalWebseriesEpisodes, getUserId
} from '../utils/localStore';
import AddWebseriesModal from '../components/AddWebseriesModal';
import EditWebseriesModal from '../components/EditWebseriesModal';
import MediaPreviewModal from '../components/MediaPreviewModal';
import CachedImage from '../utils/imageCache';

const ALL_GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
  "Romance", "Sci-Fi & Fantasy", "Science Fiction", "Soap", "Talk", "Thriller", "War & Politics", "Western"
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

export default function WebseriesLibrary() {
  const router = useRouter();
  const { currentUser } = useAuth();

  const [webseriesList, setWebseriesList] = useState(() => {
    if (typeof window !== 'undefined') {
      return getLocalWebseries() || [];
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      const local = getLocalWebseries();
      return !(local && local.length > 0);
    }
    return true;
  });

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [sortBy, setSortBy] = useState('recent');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSeries, setEditingSeries] = useState(null);
  const [deleteConfirmSeries, setDeleteConfirmSeries] = useState(null);
  const [completeConfirmSeries, setCompleteConfirmSeries] = useState(null);

  // Card Hover Preview Modal & Mobile Action Sheet
  const [activePreview, setActivePreview] = useState(null); // { item, type, rect }
  const [activeMobileMenu, setActiveMobileMenu] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  // Infinite Scroll / Scroll-to-load
  const [visibleCount, setVisibleCount] = useState(12);
  const loadMoreRef = useRef(null);

  const handleCardMouseEnter = (item, type, e) => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (activePreview?.item?.id === item.id) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const delay = activePreview ? 80 : 500;
    hoverTimeoutRef.current = setTimeout(() => {
      setActivePreview({ item, type, rect });
    }, delay);
  };

  const handleCardMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    closeTimeoutRef.current = setTimeout(() => {
      setActivePreview(null);
    }, 140);
  };

  const handleModalMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleModalMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setActivePreview(null);
    }, 120);
  };

  // Sync with Firestore
  useEffect(() => {
    const uid = currentUser?.uid || getUserId();
    if (!db || !uid) {
      setLoading(false);
      return;
    }

    const seriesCol = collection(db, 'users', uid, 'webseries');
    const unsubscribe = onSnapshot(seriesCol, (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));

      const localNow = getLocalWebseries() || [];
      if (items.length > 0) {
        setWebseriesList(items);
        setLocalWebseries(items);
      } else if (localNow.length > 0) {
        setWebseriesList(localNow);
        localNow.forEach((s) => {
          setDoc(doc(db, 'users', uid, 'webseries', s.id), s, { merge: true }).catch(console.warn);
        });
      } else {
        setWebseriesList([]);
        setLocalWebseries([]);
      }
      setLoading(false);
    }, (err) => {
      console.warn('Firestore load webseries error:', err);
      setWebseriesList(getLocalWebseries() || []);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Add Item Handler
  const handleAddWebseries = async (newDoc, episodes) => {
    setWebseriesList(prev => [newDoc, ...prev.filter(s => s.id !== newDoc.id)]);
    upsertLocalWebseries(newDoc);
    if (episodes && episodes.length > 0) {
      setLocalWebseriesEpisodes(newDoc.id, episodes);
    }
    if (db) {
      const uid = currentUser?.uid || getUserId();
      try {
        await setDoc(doc(db, 'users', uid, 'webseries', newDoc.id), newDoc, { merge: true });
        if (episodes && episodes.length > 0) {
          const { writeBatch } = await import('firebase/firestore');
          const batch = writeBatch(db);
          episodes.forEach(ep => {
            const epRef = doc(db, 'users', uid, 'webseries', newDoc.id, 'episodes', ep.id);
            batch.set(epRef, ep, { merge: true });
          });
          await batch.commit();
        }
      } catch (err) {
        console.error('Save to firestore error:', err);
      }
    }
  };

  // Save Edit Handler
  const handleSaveEdit = async (updatedDoc) => {
    setWebseriesList(prev => prev.map(s => s.id === updatedDoc.id ? updatedDoc : s));
    upsertLocalWebseries(updatedDoc);
    if (db) {
      const uid = currentUser?.uid || getUserId();
      await setDoc(doc(db, 'users', uid, 'webseries', updatedDoc.id), updatedDoc, { merge: true }).catch(console.error);
    }
  };

  // Delete Handler
  const handleDeleteSeries = async (sId) => {
    setWebseriesList(prev => prev.filter(s => s.id !== sId));
    deleteLocalWebseries(sId);
    setDeleteConfirmSeries(null);
    if (db) {
      const uid = currentUser?.uid || getUserId();
      try {
        await deleteDoc(doc(db, 'users', uid, 'webseries', sId));
      } catch (err) {
        console.error('Delete error:', err);
      }
    }
  };

  // Toggle Status
  const handleToggleStatus = (item) => {
    const isCompleted = item.completed || item.watchStatus === 'Completed';
    const newStatus = isCompleted ? 'Plan to Watch' : 'Completed';
    const updated = {
      ...item,
      watchStatus: newStatus,
      completed: !isCompleted,
      watched: !isCompleted,
      updatedAt: new Date().toISOString()
    };
    handleSaveEdit(updated);
  };

  // Filter & Sort Logic
  const filteredAndSorted = useMemo(() => {
    return webseriesList.filter((item) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesOrig = item.originalTitle?.toLowerCase().includes(q);
        const matchesOverview = item.overview?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesOrig && !matchesOverview) return false;
      }

      // Status
      if (selectedStatus !== 'all') {
        const itemStatus = item.watchStatus || (item.completed ? 'Completed' : 'Plan to Watch');
        if (itemStatus !== selectedStatus) return false;
      }

      // Genres
      if (selectedGenres.length > 0) {
        const hasGenre = selectedGenres.some(g => item.genres?.includes(g));
        if (!hasGenre) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'recent') {
        return new Date(b.addedAt || b.updatedAt || 0) - new Date(a.addedAt || a.updatedAt || 0);
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
  }, [webseriesList, search, selectedStatus, selectedGenres, sortBy]);

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
    setSelectedStatus('all');
    setSelectedGenres([]);
    setSortBy('recent');
  };

  const hasActiveFilters = search || selectedStatus !== 'all' || selectedGenres.length > 0 || sortBy !== 'recent';

  return (
    <div className="min-h-screen bg-[#07090f] text-white flex flex-col selection:bg-amber-500 selection:text-black">
      {/* ── Sticky Navigation Header ────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 px-4 md:px-8 py-3.5 flex items-center justify-between bg-[#07090f]/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            <ChevronLeft size={16} />
            <span>Home</span>
          </button>

          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-extrabold tracking-wide text-white">
              Web-series Library
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition cursor-pointer active:scale-95"
        >
          <Plus size={15} />
          <span>Add</span>
        </button>
      </header>

      {/* ── Search & Controls Bar ───────────────────────────────────────────── */}
      <div className="max-w-7xl w-full mx-auto px-4 md:px-8 pt-6 pb-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
            <input
              type="text"
              placeholder="Search webseries title, genre, or local folder..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 text-xs rounded-2xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 focus:bg-white/[0.06] transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Action Buttons: Filter & Sort */}
          <div className="flex items-center gap-2.5 self-end md:self-auto w-full md:w-auto justify-between md:justify-end">
            {/* Filter Toggle */}
            <button
              type="button"
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold border transition cursor-pointer ${
                showFilterPanel || hasActiveFilters
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Filter size={14} className={hasActiveFilters ? 'text-amber-400' : 'text-gray-400'} />
              <span>Filters</span>
              {(selectedGenres.length + (selectedStatus !== 'all' ? 1 : 0)) > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-black text-[10px] font-black flex items-center justify-center">
                  {selectedGenres.length + (selectedStatus !== 'all' ? 1 : 0)}
                </span>
              )}
            </button>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-xs">
              <ArrowUpDown size={14} className="text-amber-400 shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent text-xs text-gray-200 font-semibold focus:outline-none cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-[#111827] text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Active Filter Pills Bar ────────────────────────────────────────── */}
        {(hasActiveFilters || search) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
              Active:
            </span>

            {search && (
              <span className="px-2.5 py-1 rounded-xl bg-white/10 text-white text-[11px] font-semibold flex items-center gap-1.5 border border-white/10">
                <span>"{search}"</span>
                <button type="button" onClick={() => setSearch('')} className="hover:text-amber-400">
                  <X size={12} />
                </button>
              </span>
            )}

            {selectedStatus !== 'all' && (
              <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold flex items-center gap-1.5">
                <span>Status: {STATUS_FILTERS.find(s => s.id === selectedStatus)?.label}</span>
                <button type="button" onClick={() => setSelectedStatus('all')} className="hover:text-white">
                  <X size={12} />
                </button>
              </span>
            )}

            {selectedGenres.map(g => (
              <span key={g} className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-gray-200 text-[11px] font-semibold flex items-center gap-1.5">
                <span>{g}</span>
                <button type="button" onClick={() => setSelectedGenres(prev => prev.filter(x => x !== g))} className="hover:text-amber-400">
                  <X size={12} />
                </button>
              </span>
            ))}

            <button
              type="button"
              onClick={resetAllFilters}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-bold ml-1 transition cursor-pointer"
            >
              Clear All
            </button>
          </div>
        )}

        {/* ── Filter Expansion Panel (When Open) ───────────────────────────── */}
        <AnimatePresence>
          {showFilterPanel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3"
            >
              {/* Status Filters */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-gray-400 mr-2 uppercase tracking-wider">
                  Status:
                </span>
                {STATUS_FILTERS.map((sf) => (
                  <button
                    key={sf.id}
                    onClick={() => setSelectedStatus(sf.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      selectedStatus === sf.id
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {sf.label}
                  </button>
                ))}
              </div>

              {/* Genre Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-gray-400 mr-2 uppercase tracking-wider">
                  Genres:
                </span>
                {ALL_GENRES.map((g) => {
                  const isChecked = selectedGenres.includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() => {
                        setSelectedGenres(prev =>
                          isChecked ? prev.filter(x => x !== g) : [...prev, g]
                        );
                      }}
                      className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition border cursor-pointer ${
                        isChecked
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── MAIN CONTENT GRID ──────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-6 space-y-6">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
              <div key={i} className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filteredAndSorted.length === 0 ? (
          <div className="p-16 text-center rounded-3xl bg-white/[0.01] border border-white/5 space-y-3">
            <Tv size={42} className="mx-auto text-gray-600" />
            <h3 className="text-base font-bold text-white">No Web-series Found</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'No web-series matched your filter criteria. Try resetting filters.'
                : 'Your library is empty. Click "+ Add Web-series" above to import your first show.'}
            </p>
            {hasActiveFilters ? (
              <button
                onClick={resetAllFilters}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white cursor-pointer"
              >
                Reset Filters
              </button>
            ) : (
              <button
                onClick={() => setShowAddModal(true)}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold cursor-pointer"
              >
                Add Web-series
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4">
              {displayedItems.map((item) => {
                const isCompleted = item.completed || item.watchStatus === 'Completed';

                return (
                  <div
                    key={item.id}
                    onMouseEnter={(e) => handleCardMouseEnter(item, 'webseries', e)}
                    onMouseLeave={handleCardMouseLeave}
                    onClick={() => router.push(`/webseries/${item.id}`)}
                    className="group relative rounded-2xl overflow-hidden bg-[#0d121f] border border-white/10 hover:border-amber-400/50 hover:shadow-2xl hover:shadow-black/70 transition-all duration-300 cursor-pointer flex flex-col"
                  >
                    {/* Poster Card */}
                    <div className="relative aspect-[2/3] w-full overflow-hidden bg-black/60">
                      {item.posterUrl ? (
                        <CachedImage
                          src={item.posterUrl}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                          <Tv size={36} />
                        </div>
                      )}

                      {/* Top Badges */}
                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
                        {item.rating > 0 ? (
                          <div className="px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-bold text-amber-400 flex items-center gap-0.5 border border-white/10 shadow">
                            <Star size={10} className="fill-amber-400" />
                            {item.rating}
                          </div>
                        ) : <span />}

                        {isCompleted && (
                          <div className="px-1.5 py-0.5 rounded-md bg-emerald-600/90 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow">
                            <Check size={9} /> Done
                          </div>
                        )}
                      </div>

                      {/* Mobile 3-dot menu trigger button */}
                      <div className="md:hidden absolute top-2 right-2 z-20">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMobileMenu(activeMobileMenu?.id === item.id ? null : { type: 'webseries', id: item.id, item });
                          }}
                          className="p-1.5 rounded-lg bg-black/80 text-white border border-white/20 shadow-lg"
                        >
                          <MoreVertical size={13} />
                        </button>
                      </div>

                      {/* Bottom Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                      {/* Bottom Info inside Card */}
                      <div className="absolute bottom-2 left-2 right-2 z-10 space-y-0.5">
                        <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-amber-300 transition">
                          {item.title}
                        </h3>
                        <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                          <span>{item.year || 'Series'}</span>
                          <span>{item.episodeCount ? `${item.episodeCount} eps` : 'TV'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scroll-to-load sentinel */}
            {visibleCount < filteredAndSorted.length && (
              <div ref={loadMoreRef} className="py-8 flex justify-center items-center gap-2 text-gray-400 text-xs">
                <Loader2 size={18} className="animate-spin text-amber-500" />
                <span>Loading more webseries...</span>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── CARD HOVER PREVIEW MODAL ────────────────────────────────────────── */}
      {activePreview && (
        <MediaPreviewModal
          isOpen={Boolean(activePreview)}
          item={activePreview.item}
          type="webseries"
          cardRect={activePreview.rect}
          onMouseEnter={handleModalMouseEnter}
          onMouseLeave={handleModalMouseLeave}
          onOpenDetails={(item) => {
            setActivePreview(null);
            router.push(`/webseries/${item.id}`);
          }}
          onAskComplete={(item) => {
            setActivePreview(null);
            setCompleteConfirmSeries(item);
          }}
          onEdit={(item) => {
            setActivePreview(null);
            setEditingSeries(item);
          }}
          onDelete={(item) => {
            setActivePreview(null);
            setDeleteConfirmSeries(item);
          }}
        />
      )}

      {/* ── MOBILE 3-DOT ACTION SHEET ───────────────────────────────────────── */}
      {activeMobileMenu && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
          onClick={() => setActiveMobileMenu(null)}
        >
          <div
            className="w-full max-w-sm bg-[#111622] border border-white/15 rounded-3xl p-4 space-y-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="font-bold text-sm text-white truncate">
                {activeMobileMenu.item?.title}
              </span>
              <button onClick={() => setActiveMobileMenu(null)} className="p-1 text-gray-400">
                <X size={16} />
              </button>
            </div>

            <button
              onClick={() => {
                const s = activeMobileMenu.item;
                setActiveMobileMenu(null);
                router.push(`/webseries/${s.id}`);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-left text-xs font-bold text-white flex items-center gap-2.5"
            >
              <Eye size={15} className="text-amber-400" />
              <span>View Details & Episodes</span>
            </button>

            <button
              onClick={() => {
                const s = activeMobileMenu.item;
                setActiveMobileMenu(null);
                handleToggleStatus(s);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-left text-xs font-bold text-white flex items-center gap-2.5"
            >
              <CheckCircle2 size={15} className="text-emerald-400" />
              <span>
                {activeMobileMenu.item?.completed ? 'Mark as Incomplete' : 'Mark as Completed'}
              </span>
            </button>

            <button
              onClick={() => {
                const s = activeMobileMenu.item;
                setActiveMobileMenu(null);
                setEditingSeries(s);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-left text-xs font-bold text-white flex items-center gap-2.5"
            >
              <Edit3 size={15} className="text-cyan-400" />
              <span>Edit Details</span>
            </button>

            <button
              onClick={() => {
                const s = activeMobileMenu.item;
                setActiveMobileMenu(null);
                setDeleteConfirmSeries(s);
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-left text-xs font-bold text-rose-400 flex items-center gap-2.5"
            >
              <Trash2 size={15} />
              <span>Delete Series</span>
            </button>
          </div>
        </div>
      )}

      {/* ── ADD WEBSERIES MODAL ─────────────────────────────────────────────── */}
      {showAddModal && (
        <AddWebseriesModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAddWebseries={handleAddWebseries}
          existingWebseries={webseriesList}
        />
      )}

      {/* ── EDIT WEBSERIES MODAL ────────────────────────────────────────────── */}
      {editingSeries && (
        <EditWebseriesModal
          isOpen={Boolean(editingSeries)}
          webseries={editingSeries}
          onClose={() => setEditingSeries(null)}
          onSaveWebseries={handleSaveEdit}
        />
      )}

      {/* ── DELETE CONFIRM MODAL ────────────────────────────────────────────── */}
      {deleteConfirmSeries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full bg-[#0d121f] border border-rose-500/30 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle size={24} />
              <h3 className="text-base font-bold text-white">Delete Web-series?</h3>
            </div>
            <p className="text-xs text-gray-300">
              Are you sure you want to delete <span className="font-bold text-white">"{deleteConfirmSeries.title}"</span>?
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setDeleteConfirmSeries(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteSeries(deleteConfirmSeries.id)}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPLETE CONFIRM MODAL ──────────────────────────────────────────── */}
      {completeConfirmSeries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full bg-[#0d121f] border border-emerald-500/30 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-emerald-400">
              <CheckCircle2 size={24} />
              <h3 className="text-base font-bold text-white">
                {completeConfirmSeries.completed || completeConfirmSeries.watchStatus === 'Completed'
                  ? 'Mark as Incomplete?'
                  : 'Mark as Completed?'}
              </h3>
            </div>
            <p className="text-xs text-gray-300">
              Do you want to change the watch status for{' '}
              <span className="font-bold text-white">"{completeConfirmSeries.title}"</span>?
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setCompleteConfirmSeries(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleToggleStatus(completeConfirmSeries);
                  setCompleteConfirmSeries(null);
                }}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
