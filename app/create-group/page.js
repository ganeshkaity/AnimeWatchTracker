"use client";

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderPlus, ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown,
  Search, Film, Check, Sparkles, Layers, Eye, Edit3, X, Save,
  AlertCircle, CheckCircle2, ArrowRight
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  getLocalMovies,
  getLocalMovieGroups,
  setLocalMovieGroups,
  upsertLocalMovieGroup,
  deleteLocalMovieGroup,
  getUserId
} from '../utils/localStore';
import { slugify } from '../components/dashboard/utils/dashboardHelpers';
import MediaCard from '../components/dashboard/cards/MediaCard';

function CreateGroupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editParam = searchParams.get('edit');
  const { currentUser } = useAuth();

  const [movies, setMovies] = useState(() => (typeof window !== 'undefined' ? getLocalMovies() || [] : []));
  const [movieGroups, setMovieGroups] = useState(() => (typeof window !== 'undefined' ? getLocalMovieGroups() || [] : []));

  // Current editing group state
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  // assignedMovies: array of { movieId: string, order: number }
  const [assignedMovies, setAssignedMovies] = useState([]);

  // Search filter for available movies
  const [movieSearch, setMovieSearch] = useState('');
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error', text: '' }

  // Load and listen to localStore and Firestore
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setMovies(getLocalMovies() || []);
      setMovieGroups(getLocalMovieGroups() || []);
    }

    const handleGroupsUpdate = () => {
      setMovieGroups(getLocalMovieGroups() || []);
    };
    window.addEventListener('movie_groups_updated', handleGroupsUpdate);

    if (!currentUser?.uid || !db) return;
    const targetUserId = currentUser.uid || getUserId();

    // Subscribe to movies
    const unsubMovies = onSnapshot(collection(db, 'users', targetUserId, 'movies'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (list.length > 0) setMovies(list);
    });

    // Subscribe to movieGroups
    const unsubGroups = onSnapshot(collection(db, 'users', targetUserId, 'movieGroups'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (list.length > 0) {
        setMovieGroups(list);
        setLocalMovieGroups(list);
      }
    });

    return () => {
      window.removeEventListener('movie_groups_updated', handleGroupsUpdate);
      unsubMovies();
      unsubGroups();
    };
  }, [currentUser]);

  // Load group if editParam is present
  useEffect(() => {
    if (editParam && movieGroups.length > 0) {
      const targetGroup = movieGroups.find(g => g.id === editParam || g.slug === editParam);
      if (targetGroup) {
        loadGroupForEdit(targetGroup);
      }
    }
  }, [editParam, movieGroups]);

  const loadGroupForEdit = (group) => {
    setActiveGroupId(group.id);
    setGroupName(group.name || '');
    setGroupDescription(group.description || '');
    const sorted = [...(group.movies || [])].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    setAssignedMovies(sorted);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setActiveGroupId(null);
    setGroupName('');
    setGroupDescription('');
    setAssignedMovies([]);
    setStatusMessage(null);
  };

  // Movie lookup dictionary for fast access
  const movieMap = useMemo(() => {
    const map = new Map();
    movies.forEach(m => {
      map.set(m.id, m);
      if (m.tmdbId) map.set(String(m.tmdbId), m);
    });
    return map;
  }, [movies]);

  // Available movies that are not yet assigned to the current group
  const assignedMovieIdsSet = useMemo(() => {
    return new Set(assignedMovies.map(a => a.movieId));
  }, [assignedMovies]);

  const availableMovies = useMemo(() => {
    const q = movieSearch.toLowerCase().trim();
    return movies.filter(m => {
      if (assignedMovieIdsSet.has(m.id)) return false;
      if (!q) return true;
      const title = (m.title || '').toLowerCase();
      const orig = (m.originalTitle || '').toLowerCase();
      return title.includes(q) || orig.includes(q);
    });
  }, [movies, assignedMovieIdsSet, movieSearch]);

  // Add movie to assigned list with the next sequential order number
  const handleAddMovie = (movieId) => {
    setAssignedMovies(prev => {
      const maxOrder = prev.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0);
      return [...prev, { movieId, order: maxOrder + 1 }];
    });
  };

  // Remove movie from assigned list and re-normalize order numbers
  const handleRemoveMovie = (movieId) => {
    setAssignedMovies(prev => {
      const filtered = prev.filter(item => item.movieId !== movieId);
      return filtered.map((item, idx) => ({ ...item, order: idx + 1 }));
    });
  };

  // Directly change the order number of an assigned movie
  const handleOrderChange = (movieId, newOrderVal) => {
    const parsed = parseInt(newOrderVal, 10);
    if (isNaN(parsed) || parsed < 1) return;

    setAssignedMovies(prev => {
      const currentIdx = prev.findIndex(item => item.movieId === movieId);
      if (currentIdx === -1) return prev;

      const updated = [...prev];
      const targetItem = { ...updated[currentIdx], order: parsed };
      updated.splice(currentIdx, 1);

      // Insert at target order - 1
      const insertAt = Math.max(0, Math.min(parsed - 1, updated.length));
      updated.splice(insertAt, 0, targetItem);

      // Re-normalize all order numbers 1..N
      return updated.map((item, idx) => ({ ...item, order: idx + 1 }));
    });
  };

  // Move movie up or down in order
  const handleMoveOrder = (index, direction) => {
    setAssignedMovies(prev => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;

      return next.map((item, idx) => ({ ...item, order: idx + 1 }));
    });
  };

  // Save or update the group
  const handleSaveGroup = async (e) => {
    if (e) e.preventDefault();
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      setStatusMessage({ type: 'error', text: 'Please enter a name for the group.' });
      return;
    }

    if (assignedMovies.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please assign at least 1 movie to this group.' });
      return;
    }

    const generatedSlug = slugify(trimmedName);
    const groupId = activeGroupId || `group_${generatedSlug}_${Date.now()}`;

    // Normalize final order
    const finalizedMovies = assignedMovies.map((item, idx) => ({
      movieId: item.movieId,
      order: idx + 1,
    }));

    const groupData = {
      id: groupId,
      name: trimmedName,
      slug: generatedSlug,
      description: groupDescription.trim(),
      movies: finalizedMovies,
      movieCount: finalizedMovies.length,
      createdAt: activeGroupId
        ? (movieGroups.find(g => g.id === activeGroupId)?.createdAt || new Date().toISOString())
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Save to local storage
    upsertLocalMovieGroup(groupData);

    // 2. Save to Firestore if available
    const targetUserId = currentUser?.uid || getUserId();
    if (db && targetUserId) {
      try {
        await setDoc(doc(db, 'users', targetUserId, 'movieGroups', groupId), groupData, { merge: true });
      } catch (err) {
        console.warn('[CreateGroup] Firestore save error:', err);
      }
    }

    setStatusMessage({
      type: 'success',
      text: activeGroupId ? `Group "${trimmedName}" updated successfully!` : `Group "${trimmedName}" created successfully!`,
    });

    if (!activeGroupId) {
      resetForm();
    }
  };

  // Delete a group
  const handleDeleteGroup = async (groupId, name) => {
    if (!confirm(`Are you sure you want to delete the group "${name}"?`)) return;

    deleteLocalMovieGroup(groupId);

    const targetUserId = currentUser?.uid || getUserId();
    if (db && targetUserId) {
      try {
        await deleteDoc(doc(db, 'users', targetUserId, 'movieGroups', groupId));
      } catch (err) {
        console.warn('[CreateGroup] Firestore delete error:', err);
      }
    }

    if (activeGroupId === groupId) {
      resetForm();
    }

    setStatusMessage({ type: 'success', text: `Group "${name}" has been removed.` });
  };

  // Resolved list of movies in their current assigned order
  const resolvedOrderedMovies = useMemo(() => {
    return assignedMovies
      .map(item => {
        const movie = movieMap.get(item.movieId);
        return movie ? { ...movie, groupOrder: item.order } : null;
      })
      .filter(Boolean);
  }, [assignedMovies, movieMap]);

  return (
    <div className="min-h-screen bg-[#07090e] text-white px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
      {/* ── Top Bar with Navigation ────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/movies')}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 shadow-md"
          >
            <ArrowLeft size={18} />
            <span className="hidden sm:inline">Movie Library</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <FolderPlus size={18} />
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {activeGroupId ? 'Edit Movie Group' : 'Create Movie Group'}
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Group your movies together (e.g. franchises, trilogies, directors) and set their custom watch order!
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => router.push('/group')}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-gray-300 hover:text-white transition flex items-center gap-2 cursor-pointer"
          >
            <Layers size={14} className="text-cyan-400" />
            <span>View All Groups</span>
          </button>

          {activeGroupId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-xs font-semibold text-purple-300 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>New Group</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Status Banner ──────────────────────────────────────────────────── */}
      {statusMessage && (
        <div className="max-w-7xl mx-auto mb-6">
          <div
            className={`p-3.5 rounded-2xl flex items-center justify-between text-xs font-semibold border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{statusMessage.text}</span>
            </div>
            <button type="button" onClick={() => setStatusMessage(null)} className="opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Main Two-Column Layout ─────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* LEFT COLUMN: Group Details & Assigned Movies Ordering (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">

          {/* Group Info Form */}
          <div className="bg-[#0c101c] p-5 sm:p-6 rounded-2xl border border-white/10 space-y-4 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
              <Sparkles size={16} />
              <span>Group Information</span>
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Group Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Harry Potter Saga, Marvel MCU Phase 1, Nolan Collection"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/60 transition"
                />
                {groupName.trim() && (
                  <p className="text-[10px] text-gray-400 font-mono mt-1">
                    Slug tracker: <span className="text-purple-300">/group/{slugify(groupName)}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Description <span className="text-gray-500 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief description or chronological viewing note..."
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/60 transition resize-none"
                />
              </div>
            </div>
          </div>

          {/* Assigned Movies List with Number-Sensitive Ordering */}
          <div className="bg-[#0c101c] p-5 sm:p-6 rounded-2xl border border-white/10 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <Film size={16} className="text-amber-400" />
                  <span>Assigned Movies ({assignedMovies.length})</span>
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Manage the sequence: set number or use arrows to define which appears 1st, 2nd, etc.
                </p>
              </div>

              {assignedMovies.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAssignedMovies([])}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold transition"
                >
                  Clear All
                </button>
              )}
            </div>

            {assignedMovies.length === 0 ? (
              <div className="py-10 text-center space-y-2 border border-dashed border-white/10 rounded-xl">
                <Film size={32} className="mx-auto text-gray-600" />
                <p className="text-xs text-gray-400">No movies assigned to this group yet.</p>
                <p className="text-[11px] text-gray-500">Pick movies from the list on the right to assign them!</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto no-scrollbar pr-1">
                {assignedMovies.map((item, index) => {
                  const movie = movieMap.get(item.movieId);
                  if (!movie) return null;
                  const coverImg = movie.posterUrl || movie.posterPath || (movie.thumbnailBase64 || null);

                  return (
                    <div
                      key={item.movieId}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/[0.08] border border-white/10 transition group"
                    >
                      {/* Left: Rank order & thumbnail & title */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Order Number Badge */}
                        <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold text-xs flex items-center justify-center shrink-0">
                          #{item.order}
                        </div>

                        {/* Thumbnail */}
                        <div className="w-10 h-14 rounded-lg overflow-hidden bg-black/60 shrink-0 border border-white/10 relative">
                          {coverImg ? (
                            <img src={coverImg} alt={movie.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600">
                              <Film size={16} />
                            </div>
                          )}
                        </div>

                        {/* Movie Info */}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-white truncate" title={movie.title}>
                            {movie.title}
                          </h4>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                            {movie.year || (movie.releaseDate ? movie.releaseDate.split('-')[0] : 'Movie')}
                            {movie.runtime ? ` • ${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : ''}
                          </p>
                        </div>
                      </div>

                      {/* Right: Number sensitive controls */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Direct Order Number Input */}
                        <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-lg border border-white/10">
                          <span className="text-[9px] text-gray-500 font-bold uppercase">Pos:</span>
                          <input
                            type="number"
                            min="1"
                            max={assignedMovies.length}
                            value={item.order}
                            onChange={(e) => handleOrderChange(item.movieId, e.target.value)}
                            className="w-10 bg-transparent text-center text-xs font-bold text-amber-300 focus:outline-none"
                            title="Directly enter position number (1, 2, 3...)"
                          />
                        </div>

                        {/* Move Up / Move Down buttons */}
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(index, 'up')}
                            disabled={index === 0}
                            className={`p-1 rounded bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition ${
                              index === 0 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                            title="Move Up"
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(index, 'down')}
                            disabled={index === assignedMovies.length - 1}
                            className={`p-1 rounded bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition ${
                              index === assignedMovies.length - 1 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                            title="Move Down"
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>

                        {/* Remove Movie */}
                        <button
                          type="button"
                          onClick={() => handleRemoveMovie(item.movieId)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition cursor-pointer ml-1"
                          title="Remove from group"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Save Button */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
              <span className="text-[11px] text-gray-400 font-mono">
                {assignedMovies.length} movies ordered
              </span>

              <button
                type="button"
                onClick={handleSaveGroup}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-purple-600/20 active:scale-95 transition cursor-pointer"
              >
                <Save size={15} />
                <span>{activeGroupId ? 'Update Group' : 'Save Group'}</span>
              </button>
            </div>
          </div>

          {/* Live Ordered Cards Preview */}
          {resolvedOrderedMovies.length > 0 && (
            <div className="bg-[#0c101c] p-5 sm:p-6 rounded-2xl border border-white/10 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <Eye size={14} className="text-cyan-400" />
                    <span>Live Cards Preview (Exact Ordered Sequence)</span>
                  </h3>
                  <p className="text-[10px] text-gray-400">Cards will appear in this exact order on your Group and Home page sections</p>
                </div>
              </div>

              <div className="flex items-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-2">
                {resolvedOrderedMovies.map((movie) => {
                  const coverImg = movie.posterUrl || movie.posterPath || (movie.thumbnailBase64 || null);
                  const isWatched = Boolean(movie.watched || movie.completed || movie.watchStatus === 'Completed' || (movie.watchProgress && movie.watchProgress >= 95));
                  const pct = movie.watchProgress || 0;
                  const movieYear = movie.year || (movie.releaseDate ? movie.releaseDate.split('-')[0] : 'Movie');
                  const runtimeStr = movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : 'Feature';

                  return (
                    <div key={`prev-${movie.id}`} className="relative shrink-0 flex flex-col items-center">
                      <span className="mb-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-purple-500/30 text-purple-200 border border-purple-500/30">
                        #{movie.groupOrder}
                      </span>
                      <MediaCard
                        item={movie}
                        type="movie"
                        coverImg={coverImg}
                        rating={movie.rating}
                        isCompleted={isWatched}
                        pct={pct}
                        subLeft={movieYear}
                        subRight={runtimeStr}
                        accentBorder="hover:border-purple-400/50"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Available Movies Picker & Managed Groups (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">

          {/* Available Movies to Assign */}
          <div className="bg-[#0c101c] p-5 rounded-2xl border border-white/10 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Plus size={16} className="text-cyan-400" />
                <span>Select Movies from Library</span>
              </h2>
              <span className="text-[10px] text-gray-400 font-mono">
                {availableMovies.length} available
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search movies to add..."
                value={movieSearch}
                onChange={(e) => setMovieSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition"
              />
              {movieSearch && (
                <button
                  type="button"
                  onClick={() => setMovieSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* List of Available Movies */}
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto no-scrollbar pr-1">
              {availableMovies.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-500">
                  {movies.length === 0
                    ? 'No movies found in your library. Add movies first!'
                    : 'All matching movies are already assigned!'}
                </div>
              ) : (
                availableMovies.map((movie) => {
                  const coverImg = movie.posterUrl || movie.posterPath || (movie.thumbnailBase64 || null);
                  return (
                    <div
                      key={`avail-${movie.id}`}
                      className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-white/5 hover:bg-white/[0.08] border border-white/5 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-11 rounded overflow-hidden bg-black/60 shrink-0 relative">
                          {coverImg ? (
                            <img src={coverImg} alt={movie.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600">
                              <Film size={12} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-white truncate">{movie.title}</h4>
                          <p className="text-[10px] text-gray-400">
                            {movie.year || (movie.releaseDate ? movie.releaseDate.split('-')[0] : '')}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddMovie(movie.id)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-bold flex items-center gap-1 transition cursor-pointer active:scale-95"
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Manage Created Groups Section */}
          <div className="bg-[#0c101c] p-5 rounded-2xl border border-white/10 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Layers size={16} className="text-purple-400" />
                <span>Existing Groups ({movieGroups.length})</span>
              </h2>
            </div>

            {movieGroups.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-500">
                No groups created yet. Use the form on the left to create your first group!
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto no-scrollbar pr-1">
                {movieGroups.map((group) => {
                  const isCurrent = activeGroupId === group.id;
                  return (
                    <div
                      key={group.id}
                      className={`p-3 rounded-xl border transition space-y-2 ${
                        isCurrent
                          ? 'bg-purple-600/15 border-purple-500/40 ring-1 ring-purple-500/30'
                          : 'bg-white/5 hover:bg-white/[0.08] border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-white truncate">{group.name}</h4>
                          {group.description && (
                            <p className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">
                              {group.description}
                            </p>
                          )}
                          <span className="text-[10px] text-purple-300 font-mono mt-1 block">
                            {group.movies?.length || 0} movies assigned
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => loadGroupForEdit(group)}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition cursor-pointer"
                            title="Edit group"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(`/group/${group.slug || group.id}`)}
                            className="p-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 transition cursor-pointer"
                            title="View group page"
                          >
                            <ArrowRight size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(group.id, group.name)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition cursor-pointer"
                            title="Delete group"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}

export default function CreateGroupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#07090e] flex flex-col justify-center items-center gap-3 text-white">
          <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Loading Group Manager...</span>
        </div>
      }
    >
      <CreateGroupContent />
    </Suspense>
  );
}

