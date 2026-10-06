"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film, Search, Filter, ArrowUpDown, ChevronLeft, Plus,
  Star, Clock, CheckCircle2, AlertTriangle, X, Play,
  Edit3, Trash2, RotateCcw, Sparkles, SlidersHorizontal,
  Eye, Check, Calendar, Tv
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
import CachedImage from '../utils/imageCache';

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

export default function MoviesLibrary() {
  const router = useRouter();
  const { currentUser } = useAuth();

  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);

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
            <span>Dashboard</span>
          </button>

          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-extrabold tracking-wide text-white">
              Movies Library
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono font-bold">
              {movies.length}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition cursor-pointer active:scale-95"
        >
          <Plus size={15} />
          <span>Add Movie</span>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5 pt-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((idx) => (
              <div key={idx} className="h-72 rounded-2xl bg-white/5 shimmer border border-white/5" />
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-5 pt-2">
            {filteredAndSortedMovies.map((movie) => {
              const isWatched = Boolean(movie.watched || movie.completed || movie.watchStatus === 'Completed' || (movie.watchProgress && movie.watchProgress >= 95));
              const pct = movie.watchProgress || (movie.duration ? Math.min(100, Math.round(((movie.currentTime || 0) / movie.duration) * 100)) : 0);
              const coverImg = movie.posterUrl || movie.posterPath || (movie.thumbnailBase64 || null);
              const movieYear = movie.year || (movie.releaseDate ? movie.releaseDate.split('-')[0] : '');
              const runtimeStr = formatRuntime(movie.runtime);

              return (
                <div
                  key={`lib-movie-${movie.id}`}
                  onClick={() => router.push(`/movies/${movie.id}`)}
                  className="glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col justify-between border border-white/10 hover:border-amber-500/50 transition-all duration-300 shadow-md hover:shadow-2xl relative"
                >
                  {/* Poster Area */}
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#181c24] flex items-center justify-center">
                    {coverImg ? (
                      <CachedImage
                        src={coverImg}
                        alt={movie.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-700/60 to-rose-950 flex flex-col items-center justify-center p-3 text-center">
                        <Film size={28} className="text-amber-300/80 mb-1" />
                        <span className="text-[10px] font-bold text-white/90 line-clamp-2">{movie.title}</span>
                      </div>
                    )}

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      {movie.rating ? (
                        <span className="px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-amber-300 text-[10px] font-bold flex items-center gap-0.5 border border-white/10">
                          <Star size={10} className="fill-amber-400 text-amber-400" />
                          {movie.rating}
                        </span>
                      ) : null}
                    </div>

                    <div className="absolute top-2 right-2">
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-black text-[9px] font-extrabold uppercase tracking-wider">
                        TMDB
                      </span>
                    </div>

                    {/* Hover Play & Edit Overlay */}
                    <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center p-3 gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          router.push(`/movies/${movie.id}`);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold flex items-center gap-1.5 shadow-lg transition active:scale-95 cursor-pointer"
                      >
                        <Play size={13} fill="currentColor" />
                        <span>{movie.currentTime ? 'Resume' : 'Play'}</span>
                      </button>

                      <div className="flex items-center gap-1.5 mt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setMovieEditing(movie);
                          }}
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white transition cursor-pointer"
                          title="Edit Movie"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleDeleteMovie(movie.id, movie.title);
                          }}
                          className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 transition cursor-pointer"
                          title="Delete Movie"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Details */}
                  <div className="p-3 bg-[#0d1117] flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="font-bold text-xs text-white truncate group-hover:text-amber-300 transition-colors" title={movie.title}>
                        {movie.title}
                      </h4>

                      <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1">
                        <span>{movieYear || runtimeStr || 'Movie'}</span>
                        <span className={isWatched ? "text-emerald-400 font-bold flex items-center gap-0.5" : pct > 0 ? "text-amber-400 font-semibold" : "text-gray-500"}>
                          {isWatched ? (
                            <>
                              <CheckCircle2 size={10} /> Completed
                            </>
                          ) : (
                            pct > 0 ? `${pct}%` : 'Unwatched'
                          )}
                        </span>
                      </div>
                    </div>

                    {pct > 0 && !isWatched && (
                      <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-rose-600 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
    </div>
  );
}
