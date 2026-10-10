"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film, Search, Filter, ArrowUpDown, ChevronLeft, Plus,
  Star, Clock, CheckCircle2, AlertTriangle, X, Play,
  Edit3, Trash2, RotateCcw, Sparkles, SlidersHorizontal,
  Eye, Check, Calendar, Tv, Loader2, MoreVertical
} from 'lucide-react';
import { collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  getLocalMovies, upsertLocalMovie, deleteLocalMovie,
  addToDirtyQueue, getUserId
} from '../utils/localStore';
import AddMovieModal from '../components/AddMovieModal';
import EditMovieModal from '../components/EditMovieModal';
import MediaPreviewModal from '../components/MediaPreviewModal';
import CachedImage from '../utils/imageCache';

const YoutubeLogo = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000" />
    <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FFFFFF" />
  </svg>
);

const ALL_GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music", "Mystery",
  "Romance", "Science Fiction", "Thriller", "TV Movie", "War", "Western"
];

const DURATION_OPTIONS = [
  { id: 'all', label: 'All Durations' },
  { id: 'under1', label: '< 1 hr', min: 0, max: 60 },
  { id: '1to2', label: '1 - 2 hrs', min: 60, max: 120 },
  { id: '2to3', label: '2 - 3 hrs', min: 120, max: 180 },
  { id: '3to4', label: '3 - 4 hrs', min: 180, max: 240 },
  { id: 'over4', label: '4+ hrs', min: 240, max: 9999 },
];

const SORT_OPTIONS = [
  { id: 'recent', label: 'Recently Watched' },
  { id: 'alpha-asc', label: 'A - Z' },
  { id: 'alpha-desc', label: 'Z - A' },
  { id: 'duration-desc', label: 'Long - Short' },
  { id: 'duration-asc', label: 'Short - Long' },
  { id: 'rating', label: 'Highest Rating' },
  { id: 'year', label: 'Release Year' },
];

function formatRuntime(minutes) {
  if (!minutes || isNaN(minutes) || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m > 0 ? `${m}m` : ''}`;
  return `${m}m`;
}

let persistedMovieVisibleCount = 0;

const getMovieInitialScreenCount = () => {
  if (typeof window === 'undefined') return 16;
  const w = window.innerWidth;
  if (w < 460) return 8;   // mobile: 2 cols x 4 rows
  if (w < 640) return 12;  // 3 cols x 4 rows
  if (w < 768) return 16;  // 4 cols x 4 rows
  if (w < 1024) return 20; // 5 cols x 4 rows
  if (w < 1280) return 24; // 6 cols x 4 rows
  return 28;               // 7-8 cols
};

export default function MoviesLibrary() {
  const router = useRouter();
  const { currentUser } = useAuth();

  const [movies, setMovies] = useState(() => {
    if (typeof window !== 'undefined') {
      return getLocalMovies() || [];
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      const local = getLocalMovies();
      return !(local && local.length > 0);
    }
    return true;
  });

  // Dynamic Document Title
  useEffect(() => {
    document.title = "Movie Library - Ganeshspace";
  }, []);

  // Progressive loading & screen-filling card count state with session persistence
  const [visibleCount, setVisibleCount] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('watchanime_movie_lib_visible_count');
        const parsed = stored ? parseInt(stored, 10) : 0;
        const saved = Math.max(parsed || 0, persistedMovieVisibleCount || 0);
        if (saved > 0) return saved;
      } catch (e) {}
      return getMovieInitialScreenCount();
    }
    return 16;
  });

  const loadMoreRef = useRef(null);
  const isLoadingMoreRef = useRef(false);

  // Persist visibleCount to module and sessionStorage so re-opening library retains all loaded cards
  useEffect(() => {
    if (visibleCount > 0) {
      persistedMovieVisibleCount = visibleCount;
      try {
        sessionStorage.setItem('watchanime_movie_lib_visible_count', String(visibleCount));
      } catch (e) {}
    }
  }, [visibleCount]);

  // Card Hover Preview Modal & Mobile Action Sheet States
  const [activePreview, setActivePreview] = useState(null); // { item, type, rect }
  const [activeMobileMenu, setActiveMobileMenu] = useState(null); // { type, id, item }
  const hoverTimeoutRef = useRef(null);
  const closeTimeoutRef = useRef(null);

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
    // Fast switch (80ms) if already previewing another card, else 500ms initial hover
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
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setActivePreview(null);
  };

  useEffect(() => {
    const handleDismissOnScroll = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (activePreview) {
        setActivePreview(null);
      }
    };
    window.addEventListener('scroll', handleDismissOnScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleDismissOnScroll);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, [activePreview]);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // default: recently watched
  const [selectedDuration, setSelectedDuration] = useState('all');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('all'); // all, watching, watched, unwatched

  // Filter Modal
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Add / Edit Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [movieEditing, setMovieEditing] = useState(null);
  const [movieCompleteConfirm, setMovieCompleteConfirm] = useState(null);

  // Load Movies
  useEffect(() => {
    const loadMovies = async () => {
      setLoading(true);
      try {
        const local = getLocalMovies();
        if (local && local.length > 0) {
          setMovies(local);
          setLoading(false);
        }

        if (currentUser?.uid && db) {
          const snap = await getDocs(collection(db, 'users', currentUser.uid, 'movies'));
          const remoteMovies = [];
          snap.forEach(d => remoteMovies.push({ id: d.id, ...d.data() }));

          if (remoteMovies.length > 0) {
            setMovies(remoteMovies);
            remoteMovies.forEach(m => upsertLocalMovie(m));
          }
        }
      } catch (err) {
        console.error('[MoviesLibrary] Load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadMovies();
  }, [currentUser]);

  // Handle Delete
  const handleDeleteMovie = async (movieId, movieTitle) => {
    if (!confirm(`Are you sure you want to stop tracking "${movieTitle}"?`)) return;

    deleteLocalMovie(movieId);
    setMovies(prev => prev.filter(m => m.id !== movieId));

    const targetUserId = getUserId();
    if (db && targetUserId) {
      deleteDoc(doc(db, 'users', targetUserId, 'movies', movieId)).catch(err => {
        addToDirtyQueue({
          type: 'DELETE_MOVIE',
          dedupeKey: `DELETE_MOVIE_${movieId}`,
          payload: { id: movieId, userId: targetUserId }
        });
      });
    }
  };

  // Handle Toggle Watched / Completed Status
  const handleToggleMovieWatched = async (movieItem, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const isCurrentlyWatched = Boolean(movieItem.watched || movieItem.completed || movieItem.watchStatus === 'Completed' || (movieItem.watchProgress && movieItem.watchProgress >= 95));
      const shouldComplete = !isCurrentlyWatched;
      const movieId = movieItem.id;
      const targetUserId = movieItem.userId || currentUser?.uid || getUserId();

      const updatedMovie = {
        ...movieItem,
        watched: shouldComplete,
        completed: shouldComplete,
        watchStatus: shouldComplete ? 'Completed' : 'Not Started',
        watchProgress: shouldComplete ? 100 : 0,
        progressPercentage: shouldComplete ? 100 : 0,
        currentTime: shouldComplete ? (movieItem.duration || 0) : 0,
        updatedAt: new Date().toISOString(),
      };

      upsertLocalMovie(updatedMovie);
      setMovies(prev => prev.map(m => m.id === movieId ? updatedMovie : m));

      if (db && targetUserId) {
        updateDoc(doc(db, 'users', targetUserId, 'movies', movieId), {
          watched: shouldComplete,
          completed: shouldComplete,
          watchStatus: shouldComplete ? 'Completed' : 'Not Started',
          watchProgress: shouldComplete ? 100 : 0,
          progressPercentage: shouldComplete ? 100 : 0,
          currentTime: shouldComplete ? (movieItem.duration || 0) : 0,
          updatedAt: new Date().toISOString(),
        }).catch(err => {
          addToDirtyQueue({
            type: 'UPDATE_MOVIE',
            dedupeKey: `UPDATE_MOVIE_${movieId}`,
            payload: { id: movieId, userId: targetUserId, data: updatedMovie }
          });
        });
      }
    } catch (err) {
      console.error('[MoviesLibrary] Failed to toggle movie watched status:', err);
    }
  };

  // Filter & Sort Logic
  const filteredAndSortedMovies = useMemo(() => {
    const q = (search || '').toLowerCase().trim();

    return (movies || [])
      .filter(m => {
        // 1. Text Search
        if (q) {
          const matchTitle = (m.title || '').toLowerCase().includes(q);
          const matchOrig = (m.originalTitle || '').toLowerCase().includes(q);
          const matchFile = (m.localFileName || '').toLowerCase().includes(q);
          const matchDirector = (m.director || '').toLowerCase().includes(q);
          const matchGenres = Array.isArray(m.genres) && m.genres.some(g => g.toLowerCase().includes(q));
          if (!matchTitle && !matchOrig && !matchFile && !matchDirector && !matchGenres) {
            return false;
          }
        }

        // 2. Duration Filter
        if (selectedDuration !== 'all') {
          const durOpt = DURATION_OPTIONS.find(d => d.id === selectedDuration);
          const runtime = Number(m.runtime || 0);
          if (durOpt && runtime > 0) {
            if (runtime < durOpt.min || runtime >= durOpt.max) return false;
          } else if (durOpt && runtime === 0 && durOpt.id !== 'all') {
            return false;
          }
        }

        // 3. Genre Filter (match if movie contains ANY of the selected genres)
        if (selectedGenres.length > 0) {
          if (!Array.isArray(m.genres) || m.genres.length === 0) return false;
          const hasMatch = selectedGenres.some(sg =>
            m.genres.some(mg => mg.toLowerCase() === sg.toLowerCase())
          );
          if (!hasMatch) return false;
        }

        // 4. Status Filter
        const isWatched = Boolean(m.watched || m.completed || m.watchStatus === 'Completed' || (m.watchProgress && m.watchProgress >= 95));
        const isWatching = (m.currentTime > 10 || (m.watchProgress && m.watchProgress > 0)) && !isWatched;
        const isUnwatched = !isWatched && !isWatching;

        if (selectedStatus === 'watching' && !isWatching) return false;
        if (selectedStatus === 'watched' && !isWatched) return false;
        if (selectedStatus === 'unwatched' && !isUnwatched) return false;

        return true;
      })
      .sort((a, b) => {
        // Default: Recently Watched first priority, then latest added
        if (sortBy === 'recent') {
          const aWatch = new Date(a.lastWatchedAt || a.lastOpenedAt || ((a.currentTime > 0 || a.watchProgress > 0) ? (a.updatedAt || 0) : 0)).getTime();
          const bWatch = new Date(b.lastWatchedAt || b.lastOpenedAt || ((b.currentTime > 0 || b.watchProgress > 0) ? (b.updatedAt || 0) : 0)).getTime();
          if (aWatch > 0 && bWatch > 0) return bWatch - aWatch;
          if (aWatch > 0 && bWatch <= 0) return -1;
          if (bWatch > 0 && aWatch <= 0) return 1;
          const timeA = new Date(a.addedAt || a.createdAt || a.updatedAt || 0).getTime();
          const timeB = new Date(b.addedAt || b.createdAt || b.updatedAt || 0).getTime();
          return timeB - timeA;
        }

        if (sortBy === 'alpha-asc') {
          return (a.title || '').localeCompare(b.title || '');
        }

        if (sortBy === 'alpha-desc') {
          return (b.title || '').localeCompare(a.title || '');
        }

        if (sortBy === 'duration-desc') {
          return (b.runtime || 0) - (a.runtime || 0);
        }

        if (sortBy === 'duration-asc') {
          return (a.runtime || 0) - (b.runtime || 0);
        }

        if (sortBy === 'rating') {
          return parseFloat(b.rating || 0) - parseFloat(a.rating || 0);
        }

        if (sortBy === 'year') {
          const yearA = parseInt(a.year || (a.releaseDate ? a.releaseDate.split('-')[0] : '0'), 10) || 0;
          const yearB = parseInt(b.year || (b.releaseDate ? b.releaseDate.split('-')[0] : '0'), 10) || 0;
          return yearB - yearA;
        }

        return 0;
      });
  }, [movies, search, sortBy, selectedDuration, selectedGenres, selectedStatus]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedDuration !== 'all') count++;
    if (selectedGenres.length > 0) count += selectedGenres.length;
    if (selectedStatus !== 'all') count++;
    return count;
  }, [selectedDuration, selectedGenres, selectedStatus]);

  const resetAllFilters = () => {
    setSelectedDuration('all');
    setSelectedGenres([]);
    setSelectedStatus('all');
    setSearch('');
  };

  // Reset lock when visibleCount updates
  useEffect(() => {
    isLoadingMoreRef.current = false;
  }, [visibleCount]);

  // Infinite scroll observer to progressively load more cards as user scrolls down
  useEffect(() => {
    if (visibleCount >= filteredAndSortedMovies.length) return;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMoreRef.current) {
          isLoadingMoreRef.current = true;
          setVisibleCount((prev) => prev + getMovieInitialScreenCount());
        }
      },
      { rootMargin: '350px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [visibleCount, filteredAndSortedMovies.length]);

  const displayedMovies = useMemo(() => {
    return filteredAndSortedMovies.slice(0, visibleCount);
  }, [filteredAndSortedMovies, visibleCount]);

  const skeletonCount = Math.max(visibleCount || 0, getMovieInitialScreenCount());

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
              Movies Library
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
              placeholder="Search movie title, original name, genre, or local file..."
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
            {/* Filter Modal Trigger */}
            <button
              type="button"
              onClick={() => setShowFilterModal(true)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold border transition cursor-pointer ${
                activeFilterCount > 0
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Filter size={14} className={activeFilterCount > 0 ? 'text-amber-400' : 'text-gray-400'} />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-black text-[10px] font-black flex items-center justify-center">
                  {activeFilterCount}
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
        {(activeFilterCount > 0 || search) && (
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

            {selectedDuration !== 'all' && (
              <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold flex items-center gap-1.5">
                <span>Duration: {DURATION_OPTIONS.find(d => d.id === selectedDuration)?.label}</span>
                <button type="button" onClick={() => setSelectedDuration('all')} className="hover:text-white">
                  <X size={12} />
                </button>
              </span>
            )}

            {selectedStatus !== 'all' && (
              <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold flex items-center gap-1.5">
                <span className="capitalize">Status: {selectedStatus}</span>
                <button type="button" onClick={() => setSelectedStatus('all')} className="hover:text-white">
                  <X size={12} />
                </button>
              </span>
            )}

            {selectedGenres.map(g => (
              <span key={g} className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold flex items-center gap-1.5">
                <span>{g}</span>
                <button type="button" onClick={() => setSelectedGenres(prev => prev.filter(x => x !== g))} className="hover:text-white">
                  <X size={12} />
                </button>
              </span>
            ))}

            <button
              type="button"
              onClick={resetAllFilters}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-bold ml-1 transition"
            >
              Reset All
            </button>
          </div>
        )}
      </div>

      {/* ── Movie Grid Content ──────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 pb-16">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 md:gap-5 pt-2">
            {Array.from({ length: skeletonCount }).map((_, idx) => (
              <div
                key={`movie-skel-${idx}`}
                className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse"
              />
            ))}
          </div>
        ) : filteredAndSortedMovies.length === 0 ? (
          <div className="p-12 md:p-16 rounded-3xl glass-panel text-center border border-white/10 max-w-lg mx-auto my-12 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
              <Film size={28} />
            </div>
            {movies.length === 0 ? (
              <>
                <h3 className="text-lg font-bold text-white">No Movies Added Yet</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Track your local movie collection with automatic TMDB metadata, posters, and playback progress!
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer transition"
                >
                  <Plus size={16} />
                  <span>Add First Movie</span>
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-white">No Movies Match Criteria</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Try adjusting your search terms, genre selection, or duration filter to find what you're looking for.
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4 md:gap-5 pt-2">
            {displayedMovies.map((movie) => {
              const isWatched = Boolean(movie.watched || movie.completed || movie.watchStatus === 'Completed' || (movie.watchProgress && movie.watchProgress >= 95));
              const pct = movie.watchProgress || (movie.duration ? Math.min(100, Math.round(((movie.currentTime || 0) / movie.duration) * 100)) : 0);
              const coverImg = movie.posterUrl || movie.posterPath || (movie.thumbnailBase64 || null);
              const movieYear = movie.year || (movie.releaseDate ? movie.releaseDate.split('-')[0] : '');
              const runtimeStr = formatRuntime(movie.runtime);

              return (
                <div
                  key={`lib-movie-${movie.id}`}
                  onClick={() => router.push(`/movies/${movie.id}`)}
                  onMouseEnter={(e) => handleCardMouseEnter(movie, 'movie', e)}
                  onMouseLeave={handleCardMouseLeave}
                  className="group relative rounded-2xl overflow-hidden bg-[#0d121f] border border-white/10 hover:border-amber-400/50 hover:shadow-2xl hover:shadow-black/70 transition-all duration-300 cursor-pointer flex flex-col"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-black/60">
                    {coverImg ? (
                      <CachedImage
                        src={coverImg}
                        alt={movie.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-1.5 p-3">
                        <Film size={36} />
                        <span className="text-[10px] font-bold text-white/90 line-clamp-2 text-center">{movie.title}</span>
                      </div>
                    )}

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
                      {movie.rating ? (
                        <div className="px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-bold text-amber-400 flex items-center gap-0.5 border border-white/10 shadow">
                          <Star size={10} className="fill-amber-400" />
                          <span>{parseFloat(movie.rating).toFixed(1)}</span>
                        </div>
                      ) : <span />}

                      {isWatched ? (
                        <div className="px-1.5 py-0.5 rounded-md bg-emerald-600/90 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow">
                          <Check size={9} /> DONE
                        </div>
                      ) : pct > 0 ? (
                        <div className="px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-amber-400 text-[9px] font-extrabold tracking-wider border border-white/10 shadow">
                          {Math.round(pct)}%
                        </div>
                      ) : null}
                    </div>

                    {/* Mobile 3-Dot Options Button */}
                    <div className="md:hidden absolute top-2 right-2 z-20">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMobileMenu({ type: 'movie', id: movie.id, item: movie });
                        }}
                        className="p-1.5 rounded-lg bg-black/80 text-white border border-white/20 shadow-lg"
                      >
                        <MoreVertical size={13} />
                      </button>
                    </div>

                    {/* Bottom Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity pointer-events-none" />

                    {/* Bottom Info inside Card */}
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 space-y-0.5 pointer-events-none">
                      <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-amber-300 transition" title={movie.title}>
                        {movie.title}
                      </h3>
                      <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                        <span>{movieYear || 'Movie'}</span>
                        <span>{runtimeStr || 'Feature'}</span>
                      </div>
                    </div>

                    {/* Watch progress bar at the very bottom inside the poster card */}
                    {pct > 0 && (
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20 z-20 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Infinite Scroll Sentinel */}
            {visibleCount < filteredAndSortedMovies.length && (
              <div ref={loadMoreRef} className="col-span-full py-8 flex justify-center items-center">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400 backdrop-blur-md">
                  <Loader2 size={15} className="animate-spin text-amber-400" />
                  <span>Loading more movies...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Filter Modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFilterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl bg-[#0d111a] space-y-5 max-h-[85vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Filter size={18} className="text-amber-400" />
                  Filter Movies
                </h2>
                <button
                  type="button"
                  onClick={() => setShowFilterModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 1. Watch Status Filter */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                  Watch Status
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'all', label: 'All Status' },
                    { id: 'watching', label: 'Currently Watching' },
                    { id: 'watched', label: 'Watched' },
                    { id: 'unwatched', label: 'Unwatched' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedStatus(opt.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        selectedStatus === opt.id
                          ? 'bg-amber-500 text-black border-amber-500 shadow-md font-extrabold'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Duration Filter */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                  Movie Duration
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {DURATION_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedDuration(opt.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        selectedDuration === opt.id
                          ? 'bg-amber-500 text-black border-amber-500 shadow-md font-extrabold'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Genres Filter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                    Genres
                  </label>
                  {selectedGenres.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedGenres([])}
                      className="text-[10px] text-amber-400 hover:underline font-bold"
                    >
                      Clear Genres
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto no-scrollbar p-1 border border-white/5 rounded-2xl bg-black/20">
                  {ALL_GENRES.map(genre => {
                    const isSelected = selectedGenres.includes(genre);
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => {
                          setSelectedGenres(prev =>
                            prev.includes(genre)
                              ? prev.filter(g => g !== genre)
                              : [...prev, genre]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer border ${
                          isSelected
                            ? 'bg-amber-500 text-black border-amber-400 font-extrabold shadow'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {genre}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold transition cursor-pointer"
                >
                  Reset All
                </button>

                <button
                  type="button"
                  onClick={() => setShowFilterModal(false)}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black font-extrabold text-xs uppercase tracking-wider transition cursor-pointer shadow-lg shadow-amber-500/20"
                >
                  Show Results ({filteredAndSortedMovies.length})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Add Movie Modal ─────────────────────────────────────────────────── */}
      <AddMovieModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        existingMovies={movies}
        onAddMovie={(newMovie) => {
          setMovies(prev => [newMovie, ...prev]);
          setShowAddModal(false);
        }}
      />

      {/* ── Edit Movie Modal ────────────────────────────────────────────────── */}
      {movieEditing && (
        <EditMovieModal
          isOpen={!!movieEditing}
          movie={movieEditing}
          onClose={() => setMovieEditing(null)}
          onSaveMovie={(updated) => {
            setMovies(prev => prev.map(m => m.id === updated.id ? updated : m));
            setMovieEditing(null);
          }}
        />
      )}

      {/* ── Movie Complete Confirmation Modal ──────────────────────────────── */}
      <AnimatePresence>
        {movieCompleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl space-y-4 bg-[#0d1117] text-white text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-base font-bold">
                {movieCompleteConfirm.watched || movieCompleteConfirm.completed || movieCompleteConfirm.watchStatus === 'Completed'
                  ? 'Mark Movie Incomplete?'
                  : 'Mark Movie as Completed?'}
              </h3>
              <p className="text-xs text-gray-400">
                {movieCompleteConfirm.watched || movieCompleteConfirm.completed || movieCompleteConfirm.watchStatus === 'Completed'
                  ? `Reset "${movieCompleteConfirm.title}" progress back to uncompleted.`
                  : `Mark "${movieCompleteConfirm.title}" as fully watched (100%).`}
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMovieCompleteConfirm(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold text-gray-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = movieCompleteConfirm;
                    setMovieCompleteConfirm(null);
                    handleToggleMovieWatched(target);
                  }}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 text-black text-xs font-bold cursor-pointer"
                >
                  Yes, Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop Card Hover Preview Modal with YouTube Teaser/Trailer Autoplay */}
      <MediaPreviewModal
        isOpen={Boolean(activePreview)}
        item={activePreview?.item}
        type="movie"
        cardRect={activePreview?.rect}
        onClose={() => setActivePreview(null)}
        onMouseEnter={handleModalMouseEnter}
        onMouseLeave={handleModalMouseLeave}
        onOpenDetails={(item) => {
          setActivePreview(null);
          router.push(`/movies/${item.id}`);
        }}
        onAskComplete={(item) => {
          setMovieCompleteConfirm(item);
        }}
        onEdit={(item) => {
          setActivePreview(null);
          setMovieEditing(item);
        }}
        onDelete={(item) => {
          setActivePreview(null);
          handleDeleteMovie(item.id, item.title);
        }}
      />

      {/* Mobile 3-Dot Bottom Action Sheet (Unclipped, Accessible) */}
      <AnimatePresence>
        {activeMobileMenu && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
            onClick={() => setActiveMobileMenu(null)}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-sm bg-[#121622] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-3xl p-4 shadow-2xl space-y-2 text-white max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="min-w-0 pr-2">
                  <h4 className="text-sm font-bold text-white truncate">{activeMobileMenu.item?.title}</h4>
                  <span className="text-[11px] text-gray-400">Movie Options</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveMobileMenu(null)}
                  className="p-1 rounded-lg text-gray-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-1 pt-1">
                {/* Play */}
                <button
                  type="button"
                  onClick={() => {
                    const target = activeMobileMenu.item;
                    setActiveMobileMenu(null);
                    router.push(`/movies/${target.id}`);
                  }}
                  className="w-full text-left px-3.5 py-3 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 flex items-center gap-3 text-sm font-bold transition active:scale-98 cursor-pointer"
                >
                  <Play size={18} fill="currentColor" />
                  <span>Play Movie</span>
                </button>

                {/* Mark Complete */}
                <button
                  type="button"
                  onClick={() => {
                    const target = activeMobileMenu.item;
                    setActiveMobileMenu(null);
                    setMovieCompleteConfirm(target);
                  }}
                  className="w-full text-left px-3.5 py-3 rounded-2xl hover:bg-white/10 flex items-center gap-3 text-sm font-semibold text-white transition active:scale-98 cursor-pointer"
                >
                  <CheckCircle2
                    size={18}
                    className={
                      activeMobileMenu.item?.watched || activeMobileMenu.item?.completed || activeMobileMenu.item?.watchStatus === 'Completed'
                        ? 'text-emerald-400'
                        : 'text-gray-400'
                    }
                  />
                  <span>
                    {activeMobileMenu.item?.watched || activeMobileMenu.item?.completed || activeMobileMenu.item?.watchStatus === 'Completed'
                      ? 'Mark Incomplete'
                      : 'Mark as Completed'}
                  </span>
                </button>

                {/* Edit */}
                <button
                  type="button"
                  onClick={() => {
                    const target = activeMobileMenu.item;
                    setActiveMobileMenu(null);
                    setMovieEditing(target);
                  }}
                  className="w-full text-left px-3.5 py-3 rounded-2xl hover:bg-white/10 flex items-center gap-3 text-sm font-semibold text-white transition active:scale-98 cursor-pointer"
                >
                  <Edit3 size={18} className="text-amber-400" />
                  <span>Edit Details</span>
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => {
                    const target = activeMobileMenu.item;
                    setActiveMobileMenu(null);
                    handleDeleteMovie(target.id, target.title);
                  }}
                  className="w-full text-left px-3.5 py-3 rounded-2xl hover:bg-rose-500/20 text-rose-300 flex items-center gap-3 text-sm font-semibold transition active:scale-98 cursor-pointer"
                >
                  <Trash2 size={18} className="text-rose-400" />
                  <span>Delete Movie</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
