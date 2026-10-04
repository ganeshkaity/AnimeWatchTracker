"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Play, CheckCircle2, Bookmark, StickyNote, Star, AlertTriangle,
  Sparkles, History, RotateCcw, X, Heart, EyeOff, Film, Clock, Search,
  ChevronDown, ChevronUp, Folder, Tv, ExternalLink, RefreshCw, Loader2,
  HardDrive, Headphones, FileVideo, Music, Edit3, Trash2, Check, CheckCheck,
  ImagePlus, Disc, SlidersHorizontal, ListFilter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, getDocs, collection, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import {
  getLocalAudioStory, upsertLocalAudioStory, deleteLocalAudioStory,
  getLocalAudioTracks, setLocalAudioTracks, deleteLocalAudioTrack,
  addToDirtyQueue, getUserId
} from '../utils/localStore';
import MangaCoverSearch from '../components/MangaCoverSearch';

const FLAG_TYPES = [
  { name: 'Favorite', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30', icon: Heart },
  { name: 'Peak', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', icon: Sparkles },
  { name: 'Emotional', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: History },
  { name: 'Rewatch', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: RotateCcw },
  { name: 'Important', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: AlertTriangle },
];

export default function AudioStoryDetail({ storyId, onBack, onPlayTrack }) {
  const { currentUser } = useAuth();
  const { isOffline } = useOffline();

  const [story, setStory] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('asc'); // asc | desc
  const [typeFilter, setTypeFilter] = useState('all'); // all | audio | video

  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSynopsis, setEditSynopsis] = useState('');
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [showCoverSearch, setShowCoverSearch] = useState(false);

  // Rescan Modal
  const [isRescanning, setIsRescanning] = useState(false);
  const [rescanMessage, setRescanMessage] = useState('');

  // Track Note Modal
  const [editingTrackNote, setEditingTrackNote] = useState(null);
  const [noteContent, setNoteContent] = useState('');

  // Track Flag Modal
  const [flaggingTrack, setFlaggingTrack] = useState(null);

  // Load Data
  useEffect(() => {
    if (!storyId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        let localStory = getLocalAudioStory(storyId);
        let localTracks = getLocalAudioTracks(storyId) || [];

        if ((!localStory || localTracks.length === 0) && currentUser?.uid && db && !isOffline) {
          const targetUserId = getUserId();
          const docRef = doc(db, 'users', targetUserId, 'audioStories', storyId);
          const tracksRef = collection(db, 'users', targetUserId, 'audioStories', storyId, 'tracks');

          const [storySnap, tracksSnap] = await Promise.all([
            import('firebase/firestore').then(m => m.getDoc(docRef)),
            getDocs(tracksRef)
          ]);

          if (storySnap.exists()) {
            localStory = { id: storySnap.id, ...storySnap.data() };
            upsertLocalAudioStory(localStory);
          }

          if (!tracksSnap.empty) {
            const dbTracks = [];
            tracksSnap.forEach(d => dbTracks.push({ id: d.id, ...d.data() }));
            localTracks = dbTracks;
            setLocalAudioTracks(storyId, dbTracks);
          }
        }

        setStory(localStory);
        setTracks(localTracks);
      } catch (err) {
        console.error('[AudioStoryDetail] Load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [storyId, currentUser, isOffline]);

  // Compute stats
  const completedCount = useMemo(() => {
    return tracks.filter(t => Boolean(t.isWatched || (t.progressPercent && t.progressPercent >= 95))).length;
  }, [tracks]);

  const progressPercent = useMemo(() => {
    if (tracks.length === 0) return 0;
    return Math.round((completedCount / tracks.length) * 100);
  }, [completedCount, tracks.length]);

  // Filtered & Sorted Tracks
  const displayTracks = useMemo(() => {
    let result = [...tracks];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(t =>
        (t.title || t.name || '').toLowerCase().includes(q) ||
        String(t.trackNumber).includes(q)
      );
    }

    if (typeFilter === 'audio') {
      result = result.filter(t => !t.isVideo);
    } else if (typeFilter === 'video') {
      result = result.filter(t => t.isVideo);
    }

    result.sort((a, b) => {
      const numA = a.trackNumber !== undefined ? a.trackNumber : 0;
      const numB = b.trackNumber !== undefined ? b.trackNumber : 0;
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });

    return result;
  }, [tracks, searchQuery, typeFilter, sortOrder]);

  // Toggle single track watched/completed
  const handleToggleTrackWatched = async (trackItem, e) => {
    e?.stopPropagation();
    try {
      const isCurrentlyWatched = Boolean(trackItem.isWatched || (trackItem.progressPercent && trackItem.progressPercent >= 95));
      const shouldComplete = !isCurrentlyWatched;
      const targetUserId = story?.userId || getUserId();

      const updatedTracks = tracks.map(t => {
        if (t.id === trackItem.id) {
          return {
            ...t,
            isWatched: shouldComplete,
            progressPercent: shouldComplete ? 100 : 0,
            updatedAt: new Date().toISOString(),
          };
        }
        return t;
      });

      setTracks(updatedTracks);
      setLocalAudioTracks(storyId, updatedTracks);

      const newCompletedCount = updatedTracks.filter(t => t.isWatched).length;
      const newStoryPercent = updatedTracks.length > 0 ? Math.round((newCompletedCount / updatedTracks.length) * 100) : 0;
      const updatedStory = {
        ...story,
        progressPercent: newStoryPercent,
        isWatched: newStoryPercent === 100,
        updatedAt: new Date().toISOString(),
      };
      setStory(updatedStory);
      upsertLocalAudioStory(updatedStory);

      if (!isOffline && db) {
        await updateDoc(doc(db, 'users', targetUserId, 'audioStories', storyId, 'tracks', trackItem.id), {
          isWatched: shouldComplete,
          progressPercent: shouldComplete ? 100 : 0,
          updatedAt: new Date().toISOString(),
        });
        await updateDoc(doc(db, 'users', targetUserId, 'audioStories', storyId), {
          progressPercent: newStoryPercent,
          isWatched: newStoryPercent === 100,
          updatedAt: new Date().toISOString(),
        });
      } else {
        addToDirtyQueue({
          type: 'SET_AUDIO_TRACK',
          dedupeKey: `SET_AUDIO_TRACK_${storyId}_${trackItem.id}`,
          payload: { storyId, id: trackItem.id, storyUserId: targetUserId, isWatched: shouldComplete },
        });
      }
    } catch (err) {
      console.error('Error toggling track watched:', err);
    }
  };

  // Mark all completed / uncompleted
  const handleToggleAllWatched = async () => {
    const shouldMarkAll = completedCount < tracks.length;
    const targetUserId = story?.userId || getUserId();

    const updatedTracks = tracks.map(t => ({
      ...t,
      isWatched: shouldMarkAll,
      progressPercent: shouldMarkAll ? 100 : 0,
      updatedAt: new Date().toISOString(),
    }));

    setTracks(updatedTracks);
    setLocalAudioTracks(storyId, updatedTracks);

    const updatedStory = {
      ...story,
      progressPercent: shouldMarkAll ? 100 : 0,
      isWatched: shouldMarkAll,
      updatedAt: new Date().toISOString(),
    };
    setStory(updatedStory);
    upsertLocalAudioStory(updatedStory);

    if (!isOffline && db) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', targetUserId, 'audioStories', storyId), {
        progressPercent: shouldMarkAll ? 100 : 0,
        isWatched: shouldMarkAll,
        updatedAt: new Date().toISOString(),
      });
      updatedTracks.forEach(t => {
        batch.update(doc(db, 'users', targetUserId, 'audioStories', storyId, 'tracks', t.id), {
          isWatched: shouldMarkAll,
          progressPercent: shouldMarkAll ? 100 : 0,
        });
      });
      await batch.commit();
    }
  };

  // Rescan Folder
  const handleRescanFolder = async () => {
    if (!story?.folderPath) return;
    setIsRescanning(true);
    setRescanMessage('Scanning folder for audio and video files...');
    try {
      const res = await fetch('/api/audio-story/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: story.folderPath })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.tracks)) {
        const existingMap = new Map(tracks.map(t => [t.filePath || t.name, t]));
        const mergedTracks = data.tracks.map((t, idx) => {
          const exist = existingMap.get(t.filePath || t.name);
          return {
            id: exist?.id || `track_${idx + 1}_${encodeURIComponent(t.name || t.fileName)}`,
            ...t,
            isWatched: exist?.isWatched || false,
            progressPercent: exist?.progressPercent || 0,
            flags: exist?.flags || [],
            note: exist?.note || '',
          };
        });

        setTracks(mergedTracks);
        setLocalAudioTracks(storyId, mergedTracks);

        const updatedStory = {
          ...story,
          trackCount: mergedTracks.length,
          totalTracks: mergedTracks.length,
          updatedAt: new Date().toISOString(),
        };
        setStory(updatedStory);
        upsertLocalAudioStory(updatedStory);

        setRescanMessage(`✓ Scanned successfully. Found ${mergedTracks.length} tracks (${data.audioCount} audio, ${data.videoCount} video).`);
      } else {
        setRescanMessage('Scan error: ' + (data.error || 'Failed to scan'));
      }
    } catch (err) {
      setRescanMessage('Rescan failed: ' + err.message);
    } finally {
      setIsRescanning(false);
      setTimeout(() => setRescanMessage(''), 5000);
    }
  };

  // Delete Audio Story
  const handleDeleteStory = async () => {
    if (!confirm(`Are you sure you want to stop tracking "${story?.title}"?`)) return;
    try {
      deleteLocalAudioStory(storyId);
      const targetUserId = story?.userId || getUserId();
      if (!isOffline && db) {
        await deleteDoc(doc(db, 'users', targetUserId, 'audioStories', storyId));
      } else {
        addToDirtyQueue({
          type: 'DELETE_AUDIO_STORY',
          dedupeKey: `DELETE_AUDIO_STORY_${storyId}`,
          payload: { id: storyId, userId: targetUserId }
        });
      }
      onBack?.();
    } catch (err) {
      console.error(err);
      alert('Delete failed: ' + err.message);
    }
  };

  // Save Edit Metadata
  const handleSaveMetadata = async () => {
    if (!editTitle.trim()) return;
    const targetUserId = story?.userId || getUserId();
    const updated = {
      ...story,
      title: editTitle.trim(),
      synopsis: editSynopsis.trim(),
      description: editSynopsis.trim(),
      thumbnailBase64: editCoverUrl || story.thumbnailBase64 || '',
      updatedAt: new Date().toISOString(),
    };
    setStory(updated);
    upsertLocalAudioStory(updated);

    if (!isOffline && db) {
      await updateDoc(doc(db, 'users', targetUserId, 'audioStories', storyId), {
        title: editTitle.trim(),
        synopsis: editSynopsis.trim(),
        description: editSynopsis.trim(),
        thumbnailBase64: editCoverUrl || story.thumbnailBase64 || '',
        updatedAt: new Date().toISOString(),
      });
    }
    setShowEditModal(false);
  };

  // Save Track Note
  const handleSaveTrackNote = async () => {
    if (!editingTrackNote) return;
    const updatedTracks = tracks.map(t => t.id === editingTrackNote.id ? { ...t, note: noteContent } : t);
    setTracks(updatedTracks);
    setLocalAudioTracks(storyId, updatedTracks);
    if (!isOffline && db) {
      updateDoc(doc(db, 'users', story?.userId || getUserId(), 'audioStories', storyId, 'tracks', editingTrackNote.id), {
        note: noteContent,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
    setEditingTrackNote(null);
  };

  // Toggle Flag on Track
  const handleToggleFlag = async (flagName) => {
    if (!flaggingTrack) return;
    const existing = flaggingTrack.flags || [];
    const newFlags = existing.includes(flagName)
      ? existing.filter(f => f !== flagName)
      : [...existing, flagName];

    const updatedTracks = tracks.map(t => t.id === flaggingTrack.id ? { ...t, flags: newFlags } : t);
    setTracks(updatedTracks);
    setLocalAudioTracks(storyId, updatedTracks);

    if (!isOffline && db) {
      updateDoc(doc(db, 'users', story?.userId || getUserId(), 'audioStories', storyId, 'tracks', flaggingTrack.id), {
        flags: newFlags,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
    setFlaggingTrack(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-3 bg-[#0d1117] text-white">
        <Loader2 className="animate-spin text-cyan-400" size={36} />
        <span className="text-xs uppercase tracking-widest text-gray-400 font-bold">Loading Audio Story...</span>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-4 bg-[#0d1117] text-white p-6 text-center">
        <HardDrive size={48} className="text-gray-600 mb-2" />
        <h2 className="text-lg font-bold">Audio Story Not Found</h2>
        <p className="text-xs text-gray-400">The requested audio story could not be loaded.</p>
        <button onClick={onBack} className="px-4 py-2 rounded-xl bg-cyan-500 text-black text-xs font-bold">
          Return to Dashboard
        </button>
      </div>
    );
  }

  const coverImg = story.thumbnailBase64 ||
    (story.thumbnailPath ? `/api/image?path=${encodeURIComponent(story.thumbnailPath)}` : null);

  const nextUnplayedTrack = tracks.find(t => !t.isWatched) || tracks[0];

  return (
    <div className="min-h-screen bg-[#07090f] text-white">
      {/* ── Top Sticky Header Bar ────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 bg-[#07090f]/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <span className="text-xs font-bold text-gray-200 truncate max-w-[200px] sm:max-w-md">
            {story.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRescanFolder}
            disabled={isRescanning}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Scan folder for new tracks"
          >
            <RefreshCw size={13} className={isRescanning ? 'animate-spin text-cyan-400' : ''} />
            <span className="hidden sm:inline">Rescan</span>
          </button>

          <button
            onClick={() => {
              setEditTitle(story.title || '');
              setEditSynopsis(story.synopsis || story.description || '');
              setEditCoverUrl(story.thumbnailBase64 || '');
              setShowEditModal(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Edit3 size={13} />
            <span className="hidden sm:inline">Edit</span>
          </button>

          <button
            onClick={handleDeleteStory}
            className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 transition cursor-pointer"
            title="Stop tracking this audio story"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* Rescan Notification Banner */}
      {rescanMessage && (
        <div className="bg-cyan-500/10 border-b border-cyan-500/20 px-4 py-2 text-center text-xs font-semibold text-cyan-300">
          {rescanMessage}
        </div>
      )}

      {/* ── Hero Story Banner ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-b from-[#0d111a] to-[#07090f] py-8 sm:py-12">
        {/* Background Ambient Blur */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10 flex flex-col md:flex-row gap-6 sm:gap-8 items-center md:items-start">
          {/* Cover Poster */}
          <div className="relative w-48 sm:w-56 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-black/40 shrink-0 group">
            {coverImg ? (
              <img
                src={coverImg}
                alt={story.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-cyan-400 gap-2 bg-gradient-to-br from-cyan-950/40 via-purple-950/20 to-black">
                <Headphones size={48} />
                <span className="text-[10px] font-mono tracking-widest uppercase text-gray-400">Audio Story</span>
              </div>
            )}
            <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-cyan-300 font-bold">
              {tracks.length} Tracks
            </div>
          </div>

          {/* Details & Primary CTA */}
          <div className="flex-1 text-center md:text-left space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Headphones size={12} /> Local Audio & Video Story
                </span>
                {story.isWatched && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center gap-1">
                    <CheckCircle2 size={12} /> Completed
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
                {story.title}
              </h1>

              {story.folderPath && (
                <div className="flex items-center justify-center md:justify-start gap-2 text-xs text-gray-400 font-mono">
                  <Folder size={14} className="text-gray-500 shrink-0" />
                  <span className="truncate max-w-lg">{story.folderPath}</span>
                </div>
              )}
            </div>

            {/* Synopsis / Description */}
            <p className="text-xs sm:text-sm text-gray-300 leading-relaxed max-w-3xl">
              {story.synopsis || story.description || 'No description provided for this audio story.'}
            </p>

            {/* Genres / Tags */}
            {Array.isArray(story.genres) && story.genres.length > 0 && (
              <div className="flex flex-wrap justify-center md:justify-start gap-1.5 pt-1">
                {story.genres.map(g => (
                  <span key={g} className="px-2.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-gray-300">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Progress Bar & Actions */}
            <div className="pt-2 space-y-3 max-w-xl">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-400 font-medium">
                  <span>Listening Progress</span>
                  <span className="font-mono text-cyan-300">{completedCount} / {tracks.length} tracks ({progressPercent}%)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
                {nextUnplayedTrack && (
                  <button
                    onClick={() => onPlayTrack?.(nextUnplayedTrack.id, tracks)}
                    className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-black font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/25 transition cursor-pointer transform active:scale-95"
                  >
                    <Play size={16} fill="currentColor" />
                    <span>{completedCount > 0 ? `Resume Track ${nextUnplayedTrack.trackNumber || 1}` : 'Start Listening'}</span>
                  </button>
                )}

                <button
                  onClick={handleToggleAllWatched}
                  className="px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-300 hover:text-white flex items-center gap-2 transition cursor-pointer"
                >
                  <CheckCheck size={16} />
                  <span>{completedCount === tracks.length ? 'Mark All Unlistened' : 'Mark All Listened'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tracklist Section ────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Headphones size={20} className="text-cyan-400" />
              <span>Episodes & Tracks</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                {displayTracks.length}
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Click any track to begin playing in the Audio Stories Player</p>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search tracks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400/60"
              />
            </div>

            {/* Type Filter */}
            <div className="flex rounded-xl bg-white/5 border border-white/10 p-0.5 text-xs font-bold">
              {['all', 'audio', 'video'].map(type => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-2.5 py-1 rounded-lg capitalize transition cursor-pointer ${
                    typeFilter === type ? 'bg-cyan-500 text-black font-extrabold' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Sort Order */}
            <button
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-bold transition cursor-pointer"
              title={sortOrder === 'asc' ? 'Sorted Old to New (Ascending)' : 'Sorted New to Old (Descending)'}
            >
              <ListFilter size={15} />
            </button>
          </div>
        </div>

        {/* Tracks List */}
        {displayTracks.length === 0 ? (
          <div className="p-12 text-center text-gray-400 rounded-2xl glass-card border border-white/10 space-y-2">
            <Music size={36} className="mx-auto text-gray-600 mb-2" />
            <h3 className="text-sm font-bold text-white">No tracks found</h3>
            <p className="text-xs text-gray-500">Try modifying your search or filter options, or click Rescan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {displayTracks.map((trk, index) => {
              const isWatched = Boolean(trk.isWatched || (trk.progressPercent && trk.progressPercent >= 95));
              const isVideo = trk.isVideo;

              return (
                <div
                  key={trk.id || index}
                  onClick={() => onPlayTrack?.(trk.id, tracks)}
                  className={`group p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer ${
                    isWatched
                      ? 'bg-white/[0.02] border-white/5 hover:border-cyan-500/30'
                      : 'glass-card border-white/10 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10'
                  }`}
                >
                  <div className="flex items-center gap-3.5 truncate">
                    {/* Track Number Badge */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono text-xs font-bold shrink-0 transition-transform group-hover:scale-105 ${
                      isWatched
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 group-hover:bg-cyan-500 group-hover:text-black'
                    }`}>
                      {trk.trackNumber || index + 1}
                    </div>

                    <div className="truncate">
                      <div className="flex items-center gap-2 truncate">
                        <h4 className="font-bold text-sm text-white group-hover:text-cyan-300 transition-colors truncate">
                          {trk.title || trk.name}
                        </h4>
                        {/* Format Badge */}
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold shrink-0 ${
                          isVideo
                            ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300'
                            : 'bg-cyan-500/20 border border-cyan-500/30 text-cyan-300'
                        }`}>
                          {isVideo ? 'VIDEO' : (trk.ext || 'AUDIO')}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-gray-400 font-mono mt-0.5">
                        {trk.size ? <span>{(trk.size / (1024 * 1024)).toFixed(1)} MB</span> : null}
                        {trk.note && (
                          <span className="text-amber-400 truncate max-w-xs flex items-center gap-1">
                            <StickyNote size={11} /> {trk.note}
                          </span>
                        )}
                        {Array.isArray(trk.flags) && trk.flags.length > 0 && (
                          <div className="flex items-center gap-1">
                            {trk.flags.map(f => (
                              <span key={f} className="px-1.5 py-0.2 rounded bg-white/10 text-[9px] text-cyan-300">
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    {/* Flag button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFlaggingTrack(trk);
                      }}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition cursor-pointer"
                      title="Add Flag"
                    >
                      <Bookmark size={15} />
                    </button>

                    {/* Note button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTrackNote(trk);
                        setNoteContent(trk.note || '');
                      }}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition cursor-pointer"
                      title="Track Note"
                    >
                      <StickyNote size={15} />
                    </button>

                    {/* Toggle Watched */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleTrackWatched(trk, e)}
                      className={`p-2 rounded-xl border transition cursor-pointer ${
                        isWatched
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                      }`}
                      title={isWatched ? 'Mark as Unlistened' : 'Mark as Listened'}
                    >
                      <CheckCircle2 size={16} />
                    </button>

                    {/* Play button */}
                    <button
                      type="button"
                      onClick={() => onPlayTrack?.(trk.id, tracks)}
                      className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md transition cursor-pointer active:scale-95"
                    >
                      <Play size={13} fill="currentColor" />
                      <span>Play</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Edit Metadata Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl space-y-4 bg-[#0d1117]/95"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit3 size={18} className="text-cyan-400" />
                  <span>Edit Audio Story Details</span>
                </h3>
                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold mb-1">
                    Story Title
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold mb-1">
                    Synopsis / Description
                  </label>
                  <textarea
                    rows={4}
                    value={editSynopsis}
                    onChange={(e) => setEditSynopsis(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold mb-1">
                    Cover Picture Artwork
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCoverSearch(true)}
                      className="px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-black text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles size={14} /> Search Online Covers
                    </button>
                  </div>
                  {editCoverUrl && (
                    <div className="relative w-24 h-32 rounded-xl overflow-hidden border border-white/20 mt-2">
                      <img src={editCoverUrl} alt="Cover Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setEditCoverUrl('')}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveMetadata}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs uppercase tracking-wider"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Track Note Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {editingTrackNote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md glass-panel p-5 rounded-2xl border border-white/10 space-y-3 bg-[#0d1117]"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <StickyNote size={16} className="text-amber-400" />
                  <span>Note for Track {editingTrackNote.trackNumber}</span>
                </h4>
                <button onClick={() => setEditingTrackNote(null)} className="text-gray-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <textarea
                rows={4}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write timestamps, cliffhangers, voice cast notes..."
                className="w-full p-3 rounded-xl glass-input text-xs text-white"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditingTrackNote(null)} className="px-3 py-1.5 text-xs text-gray-400">
                  Cancel
                </button>
                <button onClick={handleSaveTrackNote} className="px-4 py-1.5 rounded-xl bg-cyan-500 text-black text-xs font-bold">
                  Save Note
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Track Flag Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {flaggingTrack && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel p-5 rounded-2xl border border-white/10 space-y-3 bg-[#0d1117]"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Bookmark size={16} className="text-cyan-400" />
                  <span>Flag Track {flaggingTrack.trackNumber}</span>
                </h4>
                <button onClick={() => setFlaggingTrack(null)} className="text-gray-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1">
                {FLAG_TYPES.map(({ name, color, icon: IconComponent }) => {
                  const isTagged = (flaggingTrack.flags || []).includes(name);
                  return (
                    <button
                      key={name}
                      onClick={() => handleToggleFlag(name)}
                      className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition cursor-pointer ${
                        isTagged ? color : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <IconComponent size={14} />
                        <span>{name}</span>
                      </div>
                      {isTagged && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Cover Search Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showCoverSearch && (
          <MangaCoverSearch
            initialQuery={story.title}
            onSelectCover={(url) => {
              setEditCoverUrl(url);
              setShowCoverSearch(false);
            }}
            onClose={() => setShowCoverSearch(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
