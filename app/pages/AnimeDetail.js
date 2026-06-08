"use client";

import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, getDocs, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import {
  getLocalAnime, upsertLocalAnime,
  getLocalEpisodes, upsertLocalEpisode, setLocalEpisodes,
  addToDirtyQueue, getUserId
} from '../utils/localStore';
import { sortEpisodes, getSubfolder, getSafeDocId, processScannedFiles } from '../utils/parser';
import { 
  ArrowLeft, Play, CheckCircle2, Bookmark, StickyNote, Star, AlertTriangle, 
  Sparkles, History, RotateCcw, X, Heart, EyeOff, Film, Clock, Search,
  ChevronDown, ChevronUp, Folder, Tv, ExternalLink, RefreshCw, Loader2, CheckCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FLAG_TYPES = [
  { name: 'Favorite', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30', icon: Heart },
  { name: 'Filler', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: EyeOff },
  { name: 'Peak', color: 'bg-neonCyan/20 text-neonCyan border-neonCyan/30', icon: Sparkles },
  { name: 'Emotional', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: History },
  { name: 'Rewatch', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: RotateCcw },
  { name: 'Skip', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: X },
  { name: 'Important', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertTriangle },
];

// getSubfolder helper imported from parser.js

// Custom sort for folders (alphanumeric, case-insensitive)
const sortFolders = (a, b) => {
  if (a === '') return -1;
  if (b === '') return 1;

  // Try to parse numbers to sort seasons correctly
  const numA = a.match(/\d+/);
  const numB = b.match(/\d+/);

  if (numA && numB) {
    const valA = parseInt(numA[0], 10);
    const valB = parseInt(numB[0], 10);
    if (valA !== valB) {
      return valA - valB;
    }
  }

  // Fallback to case-insensitive localeCompare with numeric option
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

// Custom VLC Icon
const VLCIcon = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M24 2L18 17H30L24 2Z" fill="#F47C20" />
    <path d="M17 19L13 29H35L31 19H17Z" fill="#F47C20" />
    <path d="M12 31L7 41H41L36 31H12Z" fill="#F47C20" />
    <path d="M4 43V45H44V43H4Z" fill="#F47C20" />
    {/* White bands */}
    <path d="M19.2 14H28.8L27.6 17H20.4L19.2 14Z" fill="white" />
    <path d="M14.8 25H33.2L32 29H16L14.8 25Z" fill="white" />
  </svg>
);

export default function AnimeDetail({ animeId, onBack, onPlayEpisode }) {
  const { currentUser } = useAuth();
  const { isOffline } = useOffline();
  const [anime, setAnime] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Local state for currently playing episode
  const [activePlayback, setActivePlayback] = useState(null);
  
  // Note Modal state
  const [editingEp, setEditingEp] = useState(null);
  const [noteText, setNoteText] = useState('');
  
  // Flags Modal state
  const [flaggingEp, setFlaggingEp] = useState(null);
  
  // Play Option Modal state
  const [promptPlayEp, setPromptPlayEp] = useState(null);
  const [makeDefault, setMakeDefault] = useState(false);

  
  // Search / Filters
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('unwatched'); // Default to unwatched filter

  // Expanded/Collapsed subfolder groups (initially closed)
  const [expandedFolders, setExpandedFolders] = useState({});

  // Rescan Modal state
  const [showRescanModal, setShowRescanModal] = useState(false);
  const [rescanStatus, setRescanStatus] = useState('idle'); // idle, scanning, comparing, syncing, completed, error
  const [rescanError, setRescanError] = useState('');
  const [rescanChanges, setRescanChanges] = useState({ added: [], removed: [] });
  const [scannedFilesCount, setScannedFilesCount] = useState(0);

  const handleRescan = async () => {
    if (!currentUser || !anime) return;
    setShowRescanModal(true);
    setRescanStatus('scanning');
    setRescanError('');
    setRescanChanges({ added: [], removed: [] });
    setScannedFilesCount(0);

    const targetUserId = getUserId();

    try {
      // 1. Fetch latest scan from local path
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: anime.folderPath })
      });
      const scanData = await res.json();

      if (!scanData.success) {
        throw new Error(scanData.error || "Failed to scan folder");
      }

      const scannedFiles = scanData.episodes;
      setScannedFilesCount(scannedFiles.length);
      setRescanStatus('comparing');

      // 2. Fetch existing episodes from Firestore
      const episodesRef = collection(db, 'users', targetUserId, 'anime', anime.id, 'episodes');
      const snap = await getDocs(episodesRef);
      const dbEpisodes = [];
      snap.forEach((d) => {
        dbEpisodes.push({ id: d.id, ...d.data() });
      });

      // Match scanned files with database episodes by filePath
      const existingPaths = new Set(dbEpisodes.map(ep => ep.filePath.replace(/\\/g, '/')));
      const scannedPaths = new Set(scannedFiles.map(f => f.path.replace(/\\/g, '/')));

      const newFiles = scannedFiles.filter(f => !existingPaths.has(f.path.replace(/\\/g, '/')));
      const removedEpisodes = dbEpisodes.filter(ep => !scannedPaths.has(ep.filePath.replace(/\\/g, '/')));

      setRescanChanges({
        added: newFiles,
        removed: removedEpisodes
      });

      if (newFiles.length === 0 && removedEpisodes.length === 0) {
        setRescanStatus('completed');
        return;
      }

      setRescanStatus('syncing');

      // 3. Process scanned files per-folder using processScannedFiles
      const processedScanned = processScannedFiles(scannedFiles, anime.folderPath, anime.namingPattern || 'auto');

      const batch = writeBatch(db);

      // Add new files
      newFiles.forEach(f => {
        const processed = processedScanned.find(p => p.filePath === f.path);
        const epNum = processed ? processed.episodeNumber : 1;
        const docId = processed ? processed.docId : getSafeDocId(f.path, anime.folderPath);
        const isOff = processed ? !!processed.isOffPattern : false;

        const newEpData = {
          episodeNumber: epNum,
          fileName: f.name,
          filePath: f.path,
          createdAt: f.createdAt || Date.now(),
          watchedSeconds: 0,
          durationSeconds: 0,
          lastPositionSeconds: 0,
          isWatched: false,
          isFlagged: false,
          flags: [],
          note: '',
          updatedAt: new Date().toISOString(),
          isOffPattern: isOff
        };

        const epDocRef = doc(db, 'users', targetUserId, 'anime', anime.id, 'episodes', docId);
        batch.set(epDocRef, newEpData);
      });

      // Delete removed episodes
      removedEpisodes.forEach(ep => {
        const epDocRef = doc(db, 'users', targetUserId, 'anime', anime.id, 'episodes', ep.id);
        batch.delete(epDocRef);
      });

      // Commit batch
      await batch.commit();

      // 4. Update parent anime metadata
      const finalEpsCount = scannedFiles.length;
      let finalWatchedCount = 0;
      dbEpisodes.forEach(ep => {
        const isRemoved = removedEpisodes.some(r => r.id === ep.id);
        if (!isRemoved && ep.isWatched) {
          finalWatchedCount++;
        }
      });
      const nextProgressPercent = finalEpsCount > 0 ? (finalWatchedCount / finalEpsCount) * 100 : 0;

      const animeRef = doc(db, 'users', targetUserId, 'anime', anime.id);
      await updateDoc(animeRef, {
        episodeCount: finalEpsCount,
        progressPercent: nextProgressPercent,
        updatedAt: new Date().toISOString()
      });

      setRescanStatus('completed');
    } catch (err) {
      console.error("Rescanning error:", err);
      setRescanStatus('error');
      setRescanError(err.message || "An error occurred during rescanning.");
    }
  };

  const handleMarkAllWatched = async () => {
    if (!currentUser || !animeId) return;
    try {
      const targetUserId = getUserId();
      const updatedEps = episodes.map(ep => ({ ...ep, isWatched: true, updatedAt: new Date().toISOString() }));
      setLocalEpisodes(animeId, updatedEps);
      setEpisodes(updatedEps); // update local state
      
      const updateProgress = { id: animeId, progressPercent: 100, updatedAt: new Date().toISOString() };
      upsertLocalAnime(updateProgress);
      setAnime(prev => prev ? { ...prev, progressPercent: 100 } : prev);

      if (!isOffline && db) {
        const batch = writeBatch(db);
        updatedEps.forEach(ep => {
          const { id, ...data } = ep;
          batch.update(doc(db, 'users', targetUserId, 'anime', animeId, 'episodes', id), {
            isWatched: true, updatedAt: new Date().toISOString()
          });
        });
        batch.update(doc(db, 'users', targetUserId, 'anime', animeId), {
          progressPercent: 100, updatedAt: new Date().toISOString()
        });
        await batch.commit();
      } else {
        addToDirtyQueue({
          type: 'SET_EPISODES_BATCH',
          dedupeKey: `MARK_COMPLETE_${animeId}`,
          payload: { animeId, animeUserId: targetUserId, episodes: updatedEps },
        });
        addToDirtyQueue({
          type: 'SET_ANIME',
          dedupeKey: `SET_ANIME_${animeId}`,
          payload: { id: animeId, userId: targetUserId, progressPercent: 100, updatedAt: new Date().toISOString() },
        });
      }
    } catch (err) {
      console.error('Mark complete error:', err);
    }
  };

  // References for polling and throttling
  const pollIntervalRef = useRef(null);
  const lastWriteTimeRef = useRef(0);
  const playbackStateRef = useRef(null);

  // 1. Fetch Anime Metadata — localStorage first, then Firestore
  useEffect(() => {
    if (!animeId) return;

    // Load from local cache immediately
    const localAnime = getLocalAnime(animeId);
    if (localAnime) setAnime(localAnime);

    if (isOffline || !db || !currentUser) {
      setLoading(false);
      return;
    }

    const animeRef = doc(db, 'users', getUserId(), 'anime', animeId);
    const unsubscribe = onSnapshot(animeRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = { id: snapshot.id, ...snapshot.data() };
        setAnime(data);
        upsertLocalAnime(data);
      }
    });
    return unsubscribe;
  }, [currentUser, animeId, isOffline]);

  // 2. Fetch Episodes List — localStorage first, then Firestore
  useEffect(() => {
    if (!animeId) return;

    // Load from local cache immediately
    const localEps = getLocalEpisodes(animeId);
    if (localEps.length > 0) {
      setEpisodes(sortEpisodes(localEps));
      setLoading(false);
    }

    if (isOffline || !db || !currentUser) {
      setLoading(false);
      return;
    }

    const episodesRef = collection(db, 'users', getUserId(), 'anime', animeId, 'episodes');
    const q = query(episodesRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setEpisodes(sortEpisodes(list));
      setLocalEpisodes(animeId, list);
      setLoading(false);
    });
    return unsubscribe;
  }, [currentUser, animeId, isOffline]);

  // 3. Dynamic Initializer for Filters and Folders Default State
  const hasInitializedDefaults = useRef(false);

  useEffect(() => {
    hasInitializedDefaults.current = false;
  }, [animeId]);

  useEffect(() => {
    if (!anime || episodes.length === 0 || hasInitializedDefaults.current) return;

    // Filter default: if 100% watched, open with 'all'
    if (anime.progressPercent === 100) {
      setFilter('all');
    } else {
      setFilter('unwatched');
    }

    // Expanded folders default: if only 1 folder, expand it; otherwise keep collapsed
    const folders = new Set();
    episodes.forEach(ep => {
      const folder = getSubfolder(ep.filePath, anime.folderPath || '');
      folders.add(folder);
    });

    if (folders.size === 1) {
      const singleFolder = Array.from(folders)[0];
      setExpandedFolders({ [singleFolder]: true });
    } else {
      setExpandedFolders({});
    }

    hasInitializedDefaults.current = true;
  }, [anime, episodes, animeId]);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Save Progress — local first, then Firestore if online
  const saveProgressToFirestore = async (episodeId, time, length) => {
    if (!animeId || !episodeId) return;
    const isCompleted = length > 0 && time >= length * 0.9;
    const update = {
      id: episodeId,
      watchedSeconds: Math.floor(time),
      durationSeconds: Math.floor(length),
      lastPositionSeconds: Math.floor(time),
      isWatched: isCompleted,
      updatedAt: new Date().toISOString(),
    };

    upsertLocalEpisode(animeId, update);
    // Always update React state immediately so offline UI reflects watched status
    setEpisodes(prev => prev.map(ep => ep.id === episodeId ? { ...ep, ...update } : ep));

    if (!isOffline && db && currentUser) {
      try {
        const epRef = doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', episodeId);
        await updateDoc(epRef, update);
        updateOverallProgress();
      } catch (e) {
        console.error('Failed to save progress to Firestore:', e);
        addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${episodeId}`, payload: { animeId, ...update } });
      }
    } else {
      addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${episodeId}`, payload: { animeId, ...update } });
      // Recalculate progress locally
      updateOverallProgressLocal();
    }
  };

  // Recalculate progress from local cache
  const updateOverallProgressLocal = () => {
    const eps = getLocalEpisodes(animeId);
    const total = eps.length;
    const watched = eps.filter(e => e.isWatched).length;
    const percent = total > 0 ? (watched / total) * 100 : 0;
    let lastWatchedNum = '';
    let lastOpened = new Date(0);
    eps.forEach(ep => {
      if (ep.lastPositionSeconds > 0) {
        const t = new Date(ep.updatedAt || 0);
        if (t > lastOpened) { lastOpened = t; lastWatchedNum = `EP-${ep.episodeNumber}`; }
      }
    });
    const update = { id: animeId, progressPercent: percent, lastWatchedEpisode: lastWatchedNum, updatedAt: new Date().toISOString() };
    upsertLocalAnime(update);
    setAnime(prev => prev ? { ...prev, progressPercent: percent, lastWatchedEpisode: lastWatchedNum } : prev);
    addToDirtyQueue({ type: 'SET_ANIME', dedupeKey: `SET_ANIME_${animeId}`, payload: update });
  };

  // Recalculate and update the overall progress bar of the anime
  const updateOverallProgress = async () => {
    if (!currentUser || !animeId) return;
    try {
      const episodesRef = collection(db, 'users', getUserId(), 'anime', animeId, 'episodes');
      const snap = await getDocs(episodesRef);
      let total = snap.size;
      let watched = 0;
      let lastWatchedNum = '';
      let lastOpened = new Date(0);
      snap.forEach((d) => {
        const data = d.data();
        if (data.isWatched) watched++;
        if (data.lastPositionSeconds > 0) {
          const epTime = new Date(data.updatedAt || 0);
          if (epTime > lastOpened) { lastOpened = epTime; lastWatchedNum = `EP-${data.episodeNumber}`; }
        }
      });
      const percent = total > 0 ? (watched / total) * 100 : 0;
      const animeRef = doc(db, 'users', getUserId(), 'anime', animeId);
      await updateDoc(animeRef, { progressPercent: percent, lastWatchedEpisode: lastWatchedNum, updatedAt: new Date().toISOString() });
    } catch (e) {
      console.error('Failed to update parent progress:', e);
    }
  };

  const saveDefaultPlayerIfChecked = async (playerType) => {
    if (makeDefault && currentUser) {
      try {
        await updateDoc(doc(db, 'users', getUserId()), {
          defaultPlayer: playerType
        });
      } catch (err) {
        console.error("Failed to save default player:", err);
      }
    }
  };

  const playInVlc = async (episode) => {
    setPromptPlayEp(null);
    await saveDefaultPlayerIfChecked('vlc');
    setActivePlayback({
      episodeId: episode.id,
      episodeNumber: episode.episodeNumber,
      fileName: episode.fileName,
      filePath: episode.filePath,
      time: episode.lastPositionSeconds || 0,
      length: episode.durationSeconds || 0,
      state: 'launching'
    });

    try {
      const res = await fetch('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: episode.filePath,
          customVlcPath: currentUser?.vlcPath || '',
          resumeTime: episode.lastPositionSeconds || 0
        })
      });
      const data = await res.json();

      if (data.success) {
        // Touch parent anime timestamp
        const animeRef = doc(db, 'users', getUserId(), 'anime', animeId);
        await updateDoc(animeRef, { lastOpenedAt: new Date().toISOString() });

        // Start active status API polling
        startPollingVlc(episode);
      } else {
        alert("Failed to launch VLC. Ensure VLC is installed, or configure its path in settings.\nError: " + data.error);
        setActivePlayback(null);
      }
    } catch (err) {
      console.error(err);
      alert("Error playing episode: " + err.message);
      setActivePlayback(null);
    }
  };

  const playInBuiltin = async (episode) => {
    setPromptPlayEp(null);
    await saveDefaultPlayerIfChecked('builtin');
    if (onPlayEpisode) {
      onPlayEpisode(episode.id, episodes);
    }
  };

  const playInArtPlayer = async (episode) => {
    setPromptPlayEp(null);
    await saveDefaultPlayerIfChecked('artplayer');
    if (onPlayEpisode) {
      onPlayEpisode(episode.id, episodes, 'artplayer');
    }
  };

  // Trigger episode click options
  const handlePlayEpisode = async (episode) => {
    const defPlayer = currentUser?.defaultPlayer;
    if (defPlayer && defPlayer !== 'ask') {
      if (defPlayer === 'builtin') {
        playInBuiltin(episode);
      } else if (defPlayer === 'artplayer') {
        playInArtPlayer(episode);
      } else if (defPlayer === 'vlc') {
        playInVlc(episode);
      }
    } else {
      setMakeDefault(false);
      setPromptPlayEp(episode);
    }
  };


  // Poll Next.js proxy API endpoint to check VLC status
  const startPollingVlc = (episode) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    let pollCount = 0;
    let lastTime = episode.lastPositionSeconds || 0;
    let lastLength = episode.durationSeconds || 0;

    const poll = async () => {
      try {
        const response = await fetch('/api/vlc-status');
        const data = await response.json();

        if (data.success && data.state) {
          pollCount = 0; // reset fails counter
          
          lastTime = data.time;
          lastLength = data.length;

          setActivePlayback({
            episodeId: episode.id,
            episodeNumber: episode.episodeNumber,
            fileName: episode.fileName,
            filePath: episode.filePath,
            time: data.time,
            length: data.length,
            state: data.state
          });

          // Sync with ref so unmount or sudden close knows current state
          playbackStateRef.current = {
            episodeId: episode.id,
            time: data.time,
            length: data.length
          };

          // Save every 15 seconds to db, or immediately if paused
          const now = Date.now();
          if (data.state !== 'playing' || now - lastWriteTimeRef.current >= 15000) {
            saveProgressToFirestore(episode.id, data.time, data.length);
            lastWriteTimeRef.current = now;
          }
        } else {
          // If API returns false (e.g. status XML/JSON unavailable or stopped)
          pollCount++;
          if (pollCount >= 4) {
            stopPollingVlc(episode.id, lastTime, lastLength);
          }
        }
      } catch (err) {
        pollCount++;
        if (pollCount >= 4) {
          stopPollingVlc(episode.id, lastTime, lastLength);
        }
      }
    };

    // Run poll every 2 seconds
    pollIntervalRef.current = setInterval(poll, 2000);
  };

  // Stop polling and update final progress
  const stopPollingVlc = (episodeId, time, length) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    saveProgressToFirestore(episodeId, time, length);
    setActivePlayback(null);
    playbackStateRef.current = null;
  };

  // Close VLC Player explicitly
  const handleCloseVlc = async () => {
    try {
      await fetch('/api/close-vlc', { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
    
    // Trigger cleanup
    const state = playbackStateRef.current;
    if (state) {
      stopPollingVlc(state.episodeId, state.time, state.length);
    } else {
      setActivePlayback(null);
    }
  };

  // Toggle IsWatched Manually — local first
  const handleToggleWatched = async (episode, e) => {
    e.stopPropagation();
    const nextWatched = !episode.isWatched;
    const update = {
      id: episode.id,
      isWatched: nextWatched,
      watchedSeconds: nextWatched ? (episode.durationSeconds || 1440) : 0,
      lastPositionSeconds: nextWatched ? (episode.durationSeconds || 1440) : 0,
      updatedAt: new Date().toISOString(),
    };
    upsertLocalEpisode(animeId, update);
    // Immediately update React state so the watched badge and filter hide/show correctly
    setEpisodes(prev => prev.map(ep => ep.id === episode.id ? { ...ep, ...update } : ep));
    updateOverallProgressLocal();

    if (!isOffline && db && currentUser) {
      try {
        await updateDoc(doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', episode.id), update);
        updateOverallProgress();
      } catch (err) {
        console.error(err);
        addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${episode.id}`, payload: { animeId, ...update } });
      }
    } else {
      addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${episode.id}`, payload: { animeId, ...update } });
    }
  };

  // Save Note — local first
  const handleSaveNote = async () => {
    if (!editingEp) return;
    const epId = editingEp.id;
    const update = { id: epId, note: noteText.trim(), updatedAt: new Date().toISOString() };
    upsertLocalEpisode(animeId, update);
    // Immediately update React state so note is visible without snapshot
    setEpisodes(prev => prev.map(ep => ep.id === epId ? { ...ep, ...update } : ep));
    setEditingEp(null);
    setNoteText('');

    if (!isOffline && db && currentUser) {
      try {
        await updateDoc(doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', epId), update);
      } catch (err) {
        console.error(err);
        addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${epId}`, payload: { animeId, ...update } });
      }
    } else {
      addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${epId}`, payload: { animeId, ...update } });
    }
  };

  // Toggle Flag Option — local first
  const handleToggleFlag = async (episode, flagName) => {
    const currentFlags = episode.flags || [];
    const nextFlags = currentFlags.includes(flagName)
      ? currentFlags.filter(f => f !== flagName)
      : [...currentFlags, flagName];
    const update = { id: episode.id, flags: nextFlags, isFlagged: nextFlags.length > 0, updatedAt: new Date().toISOString() };
    upsertLocalEpisode(animeId, update);
    // Immediately update React state so flag badges reflect without snapshot
    setEpisodes(prev => prev.map(ep => ep.id === episode.id ? { ...ep, ...update } : ep));

    if (!isOffline && db && currentUser) {
      try {
        await updateDoc(doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', episode.id), update);
      } catch (err) {
        console.error(err);
        addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${episode.id}`, payload: { animeId, ...update } });
      }
    } else {
      addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${episode.id}`, payload: { animeId, ...update } });
    }
  };

  // Resume overall anime from last position
  const handleResumeAnime = () => {
    const activeEps = episodes.filter(ep => ep.lastPositionSeconds > 0 && !ep.isWatched);
    
    if (activeEps.length > 0) {
      const latest = activeEps.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
      handlePlayEpisode(latest);
    } else {
      const unwatched = episodes.find(ep => !ep.isWatched);
      if (unwatched) {
        handlePlayEpisode(unwatched);
      } else if (episodes.length > 0) {
        handlePlayEpisode(episodes[0]);
      }
    }
  };

  // Format seconds to string: mm:ss or hh:mm:ss
  const formatTime = (secs) => {
    if (!secs) return '0:00';
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);

    const pad = (n) => String(n).padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${minutes}:${pad(seconds)}`;
  };

  // Filter episodes list
  const filteredEpisodes = episodes.filter(ep => {
    const matchSearch = ep.fileName.toLowerCase().includes(search.toLowerCase()) || 
                        (ep.note || '').toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;

    if (filter === 'watched') return ep.isWatched;
    if (filter === 'unwatched') return !ep.isWatched;
    if (filter === 'flagged') return ep.isFlagged;
    return true;
  });

  // Group episodes by folder
  const groupedEpisodes = {};
  filteredEpisodes.forEach(ep => {
    const folder = getSubfolder(ep.filePath, anime?.folderPath || '');
    if (!groupedEpisodes[folder]) {
      groupedEpisodes[folder] = [];
    }
    groupedEpisodes[folder].push(ep);
  });

  const sortedFolderKeys = Object.keys(groupedEpisodes).sort(sortFolders);

  return (
    <div className="min-h-screen text-white" style={{ background: anime?.coverGradient ? `linear-gradient(160deg, ${anime.coverGradient.replace('from-','').replace('to-','').split(' ').map(c => c.replace(/-\d+$/,'').replace('neonCyan','#00f0ff').replace('neonPurple','#bd00ff').replace('neonPink','#ff2d78')).join(', ')})` : undefined }}>
      {/* Sticky Detail Header */}
      {anime && (
        <div className="sticky top-0 z-20 glass-panel border-b border-white/5 py-4 px-6 md:px-12">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            
            <div className="flex items-center gap-4">
              <button 
                onClick={onBack}
                className="p-2 rounded-lg bg-white/5 border border-white/5 hover:text-neonCyan hover:bg-white/10 transition cursor-pointer"
              >
                <ArrowLeft size={18} />
              </button>
              
              <div>
                <h1 className="text-xl font-bold tracking-wide flex items-center gap-2">
                  {anime.title}
                  <span className="text-xs text-gray-500 font-normal hidden sm:inline">({anime.episodeCount} Episodes)</span>
                </h1>
                <p className="text-[10px] text-gray-500 line-clamp-1 max-w-md">
                  {anime.folderPath}
                </p>
              </div>
            </div>

            {/* Resume button & progress */}
            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
              <div className="text-right">
                <div className="text-xs text-gray-400 mb-1">
                  Library Progress: <span className="font-semibold text-white">{Math.round(anime.progressPercent || 0)}%</span>
                </div>
                <div className="w-32 md:w-40 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-neon-gradient shadow-purple-glow rounded-full"
                    style={{ width: `${anime.progressPercent || 0}%` }}
                  />
                </div>
              </div>

              {anime.progressPercent !== 100 && (
                <button
                  onClick={handleMarkAllWatched}
                  className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/40 hover:bg-emerald-500 text-emerald-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-inner whitespace-nowrap"
                >
                  <CheckCheck size={14} />
                  Mark Complete
                </button>
              )}

              <button
                onClick={handleRescan}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 hover:text-neonCyan hover:bg-white/10 hover:border-neonCyan/20 text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-inner"
              >
                <RefreshCw size={14} />
                Rescan Folder
              </button>

              <button
                onClick={handleResumeAnime}
                className="px-5 py-2 rounded-xl bg-neon-gradient hover:brightness-110 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-purple-glow transition-all"
              >
                <Play size={14} fill="currentColor" />
                Resume Tracking
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left column: Episode list */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Episode Filters & Search */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 z-10 pointer-events-none" size={16} />
              <input
                type="text"
                placeholder="Search episodes/notes..."
                className="w-full pl-9 pr-4 py-2 rounded-lg glass-input text-xs text-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold cursor-pointer transition ${
                  filter === 'all' ? 'bg-neonCyan/10 border border-neonCyan text-neonCyan' : 'bg-white/5 border border-transparent text-gray-400'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('watched')}
                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold cursor-pointer transition ${
                  filter === 'watched' ? 'bg-emerald-500/15 border border-emerald-500 text-emerald-400' : 'bg-white/5 border border-transparent text-gray-400'
                }`}
              >
                Watched
              </button>
              <button
                onClick={() => setFilter('unwatched')}
                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold cursor-pointer transition ${
                  filter === 'unwatched' ? 'bg-neonPurple/15 border border-neonPurple text-neonPurple' : 'bg-white/5 border border-transparent text-gray-400'
                }`}
              >
                Unwatched
              </button>
              <button
                onClick={() => setFilter('flagged')}
                className={`px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold cursor-pointer transition ${
                  filter === 'flagged' ? 'bg-neonPink/15 border border-neonPink text-neonPink' : 'bg-white/5 border border-transparent text-gray-400'
                }`}
              >
                Flagged
              </button>
            </div>
          </div>

          {/* Episode Cards */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-white/5 shimmer" />
              ))}
            </div>
          ) : filteredEpisodes.length === 0 ? (
            <div className="text-center p-12 bg-white/[0.01] border border-white/5 rounded-2xl text-gray-500">
              No matching episodes found.
            </div>
          ) : (
            <div className="space-y-4">
              {sortedFolderKeys.map((folderKey) => {
                const folderEpisodes = groupedEpisodes[folderKey];
                const isExpanded = !!expandedFolders[folderKey];
                const folderLabel = folderKey === '' ? 'Main / Specials' : folderKey;

                return (
                  <div key={folderKey} className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
                    {/* Collapsible Header */}
                    <button
                      onClick={() => setExpandedFolders(prev => ({ ...prev, [folderKey]: !isExpanded }))}
                      className="w-full px-5 py-4 flex items-center justify-between bg-white/[0.02] hover:bg-white/[0.04] transition duration-200 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Folder className="text-neonPurple shrink-0" size={16} />
                        <span className="text-sm font-bold text-white tracking-wide text-left">{folderLabel}</span>
                        <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-[10px] text-gray-400 font-semibold">
                          {folderEpisodes.length} {folderEpisodes.length === 1 ? 'episode' : 'episodes'}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp size={16} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={16} className="text-gray-400" />
                      )}
                    </button>

                    {/* Collapsible Content */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden border-t border-white/5 bg-[#0b0b1a]/20 p-4 space-y-3"
                        >
                          {folderEpisodes.map((ep) => {
                            const percentage = ep.durationSeconds > 0 ? (ep.watchedSeconds / ep.durationSeconds) * 100 : 0;
                            
                            return (
                              <div
                                key={ep.id}
                                className={`glass-card p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition duration-300 relative group overflow-hidden ${
                                  ep.isWatched ? 'border-emerald-500/20 bg-emerald-950/5' : 'border-white/5'
                                }`}
                              >
                                {/* Tiny Bottom Progress bar */}
                                {percentage > 0 && !ep.isWatched && (
                                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
                                    <div 
                                      className="h-full bg-neonCyan shadow-cyan-glow" 
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                )}

                                <div className="flex items-center gap-4 flex-grow min-w-0">
                                  {/* Play Action */}
                                  <button
                                    onClick={() => handlePlayEpisode(ep)}
                                    className={`p-3 rounded-lg flex items-center justify-center cursor-pointer transition ${
                                      ep.isWatched 
                                        ? 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-bgDark' 
                                        : 'bg-white/5 text-gray-400 group-hover:bg-neonCyan group-hover:text-bgDark group-hover:shadow-cyan-glow'
                                    }`}
                                  >
                                    <Play size={16} fill="currentColor" />
                                  </button>

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-xs font-bold uppercase tracking-wider ${
                                        ep.isWatched ? 'text-emerald-400' : 'text-neonCyan'
                                      }`}>
                                        EP {String(ep.episodeNumber).padStart(2, '0')}
                                      </span>
                                      
                                      {/* Active flag chips */}
                                      {ep.flags && ep.flags.map(fName => {
                                        const match = FLAG_TYPES.find(ft => ft.name === fName);
                                        const Icon = match ? match.icon : Bookmark;
                                        return (
                                          <span 
                                            key={fName} 
                                            className={`px-2 py-0.5 rounded-full border text-[9px] font-semibold flex items-center gap-1 ${match ? match.color : 'bg-white/5'}`}
                                          >
                                            <Icon size={8} />
                                            {fName}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    
                                    <h4 className="text-sm font-semibold text-white/90 truncate mt-1" title={ep.fileName}>
                                      {ep.fileName}
                                    </h4>

                                    {/* Note snippet */}
                                    {ep.note && (
                                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-gray-400 bg-white/5 border border-white/5 rounded-md px-2 py-1 max-w-prose">
                                        <StickyNote size={12} className="text-neonPurple flex-shrink-0" />
                                        <span className="truncate italic">"{ep.note}"</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Actions block */}
                                <div className="flex items-center gap-3 sm:self-center justify-end">
                                  {ep.lastPositionSeconds > 0 && !ep.isWatched && (
                                    <span className="text-[10px] text-gray-400 flex items-center gap-1 bg-white/5 px-2 py-1 rounded border border-white/5">
                                      <Clock size={10} />
                                      {formatTime(ep.lastPositionSeconds)} / {formatTime(ep.durationSeconds)}
                                    </span>
                                  )}

                                  {/* Flag Editor Toggle */}
                                  <button
                                    onClick={() => setFlaggingEp(ep)}
                                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
                                    title="Flags"
                                  >
                                    <Bookmark size={14} />
                                  </button>

                                  {/* Note Editor Toggle */}
                                  <button
                                    onClick={() => {
                                      setEditingEp(ep);
                                      setNoteText(ep.note || '');
                                    }}
                                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
                                    title="Notes"
                                  >
                                    <StickyNote size={14} />
                                  </button>

                                  {/* Watched State Toggle */}
                                  <button
                                    onClick={(e) => handleToggleWatched(ep, e)}
                                    className={`p-2 rounded-lg border transition cursor-pointer ${
                                      ep.isWatched 
                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                                        : 'bg-white/5 border-transparent text-gray-500 hover:text-white hover:border-white/10'
                                    }`}
                                    title={ep.isWatched ? "Mark Unwatched" : "Mark Watched"}
                                  >
                                    <CheckCircle2 size={14} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Right column: Current play status & guide */}
        <div className="space-y-6">
          {/* Active Playback Tracker */}
          {activePlayback ? (
            <div className="glass-panel p-6 rounded-2xl border border-neonCyan/30 shadow-neon-border relative overflow-hidden">
              <div className="absolute top-0 right-0 h-1 bg-neon-gradient w-full" />
              
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] uppercase font-bold tracking-widest text-neonCyan bg-neonCyan/10 px-2 py-0.5 rounded border border-neonCyan/20">
                  VLC Integration Active
                </span>
                {activePlayback.state === 'launching' ? (
                  <span className="text-[10px] text-gray-400 animate-pulse">Launching...</span>
                ) : (
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Tracking Playback
                  </span>
                )}
              </div>

              <h3 className="font-extrabold text-sm text-white line-clamp-2 mb-2">
                EP-{activePlayback.episodeNumber}: {activePlayback.fileName}
              </h3>
              
              {activePlayback.length > 0 && (
                <div className="space-y-3 mt-4">
                  <div className="flex justify-between items-center text-xs text-gray-400">
                    <span>{formatTime(activePlayback.time)}</span>
                    <span>{formatTime(activePlayback.length)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-neonCyan shadow-cyan-glow transition-all" 
                      style={{ width: `${(activePlayback.time / activePlayback.length) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleCloseVlc}
                className="w-full mt-6 py-2 rounded-lg bg-red-950/40 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider hover:bg-red-600 hover:text-white transition cursor-pointer"
              >
                Close VLC Player
              </button>
            </div>
          ) : (
            <div className="glass-panel p-6 rounded-2xl border border-white/5 text-gray-400 text-xs space-y-4">
              <h3 className="font-bold text-white uppercase tracking-wider text-[10px] flex items-center gap-1.5 text-neonPurple">
                <Film size={14} />
                Desktop Playback Helper
              </h3>
              <p className="leading-relaxed">
                Clicking the play button launches the episode in the native VLC media player on your machine.
              </p>
              <p className="leading-relaxed">
                <strong>Progress Syncing:</strong> As you watch, playback status is queried in the background and stored locally. Closing VLC automatically pushes your resume position to Firestore.
              </p>
              <p className="leading-relaxed">
                <strong>Auto-Complete:</strong> Once you watch past 90% of the video duration, the episode is marked as completed automatically.
              </p>
            </div>
          )}

          {/* Quick flags list */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5">
            <h3 className="font-bold text-white uppercase tracking-wider text-[10px] mb-4 text-neonPink">
              Available Flags Info
            </h3>
            <div className="flex flex-col gap-2.5">
              {FLAG_TYPES.map(flag => {
                const Icon = flag.icon;
                return (
                  <div key={flag.name} className="flex items-center gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded border text-[9px] font-bold flex items-center gap-1 ${flag.color}`}>
                      <Icon size={8} />
                      {flag.name}
                    </span>
                    <span className="text-gray-500">
                      {flag.name === 'Filler' && 'Skips in story'}
                      {flag.name === 'Favorite' && 'Loved episodes'}
                      {flag.name === 'Peak' && 'Amazing visual/hype'}
                      {flag.name === 'Emotional' && 'Feels moment'}
                      {flag.name === 'Rewatch' && 'Must watch again'}
                      {flag.name === 'Skip' && 'For recap/op-ed'}
                      {flag.name === 'Important' && 'Crucial plot points'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* Note Editor Modal */}
      <AnimatePresence>
        {editingEp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md glass-panel p-6 rounded-2xl border border-white/10 shadow-neon-border"
            >
              <h2 className="text-lg font-bold mb-2 flex items-center gap-2 text-white">
                <StickyNote className="text-neonPurple" size={18} />
                EP-{editingEp.episodeNumber} Notes
              </h2>
              <p className="text-[10px] text-gray-500 truncate mb-4">{editingEp.fileName}</p>

              <textarea
                rows={4}
                placeholder="Write a review, thoughts, or reminders..."
                className="w-full p-3 rounded-lg glass-input text-xs text-white"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />

              <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingEp(null);
                    setNoteText('');
                  }}
                  className="px-4 py-2 bg-transparent text-gray-400 hover:text-white text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="px-5 py-2 rounded-lg bg-neon-gradient text-white text-xs font-bold uppercase tracking-wider hover:brightness-110 shadow-purple-glow cursor-pointer"
                >
                  Save Note
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Flags Selector Modal */}
      <AnimatePresence>
        {flaggingEp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel p-6 rounded-2xl border border-white/10 shadow-neon-border"
            >
              <h2 className="text-lg font-bold mb-2 flex items-center gap-2 text-white">
                <Bookmark className="text-neonPink" size={18} />
                Manage Episode Flags
              </h2>
              <p className="text-[10px] text-gray-500 truncate mb-4">EP-{flaggingEp.episodeNumber}: {flaggingEp.fileName}</p>

              <div className="space-y-2 py-2">
                {FLAG_TYPES.map(flag => {
                  const Icon = flag.icon;
                  const isChecked = (flaggingEp.flags || []).includes(flag.name);
                  
                  return (
                    <button
                      key={flag.name}
                      onClick={() => {
                        handleToggleFlag(flaggingEp, flag.name);
                        setFlaggingEp(prev => {
                          const currentFlags = prev.flags || [];
                          const nextFlags = currentFlags.includes(flag.name) 
                            ? currentFlags.filter(f => f !== flag.name)
                            : [...currentFlags, flag.name];
                          return { ...prev, flags: nextFlags };
                        });
                      }}
                      className={`w-full p-2.5 rounded-lg border text-left text-xs font-semibold flex items-center justify-between cursor-pointer transition ${
                        isChecked 
                          ? 'bg-white/5 border-neonCyan/30 text-white' 
                          : 'bg-transparent border-white/5 text-gray-400 hover:bg-white/[0.02]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded border text-[9px] font-bold flex items-center gap-1 ${flag.color}`}>
                          <Icon size={8} />
                          {flag.name}
                        </span>
                      </span>
                      {isChecked && <span className="text-[10px] text-neonCyan font-bold">Enabled</span>}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end pt-4 mt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setFlaggingEp(null)}
                  className="px-5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-bold cursor-pointer transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Play Options Selector Modal */}
      <AnimatePresence>
        {promptPlayEp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg glass-panel p-6 rounded-2xl border border-white/10 shadow-neon-border"
            >
              <h2 className="text-lg font-bold mb-1 flex items-center gap-2 text-white">
                <Play className="text-neonCyan animate-pulse" size={18} fill="currentColor" />
                Select Playback Method
              </h2>
              <span className="text-[10px] text-neonPurple font-extrabold uppercase tracking-widest bg-neonPurple/10 px-2 py-0.5 rounded border border-neonPurple/20">
                Episode {promptPlayEp.episodeNumber}
              </span>
              <p className="text-xs text-gray-400 truncate mt-3 mb-6 bg-white/5 p-2 rounded border border-white/5" title={promptPlayEp.fileName}>
                {promptPlayEp.fileName}
              </p>

              <div className="flex items-center gap-2.5 mb-6 px-1">
                <input
                  type="checkbox"
                  id="set-default-player"
                  checked={makeDefault}
                  onChange={(e) => setMakeDefault(e.target.checked)}
                  className="rounded border-white/10 bg-white/5 text-neonCyan focus:ring-neonCyan cursor-pointer h-4 w-4"
                />
                <label htmlFor="set-default-player" className="text-xs text-gray-300 cursor-pointer select-none">
                  Set selected player as default for future plays
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Built-in Player Card */}
                <button
                  type="button"
                  onClick={() => playInBuiltin(promptPlayEp)}
                  className="p-5 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 hover:border-cyan-400/50 text-cyan-300 hover:text-white hover:bg-cyan-500/10 transition-all duration-300 flex flex-col items-center justify-center gap-3 cursor-pointer group hover:shadow-[0_0_20px_rgba(6,182,212,0.25)]"
                >
                  <div className="p-3 rounded-xl bg-cyan-500/10 group-hover:bg-cyan-500/20 transition-colors">
                    <Tv size={24} className="text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Built-in</span>
                </button>

                {/* ArtPlayer Card */}
                <button
                  type="button"
                  onClick={() => playInArtPlayer(promptPlayEp)}
                  className="p-5 rounded-2xl bg-purple-500/5 border border-purple-500/20 hover:border-purple-400/50 text-purple-300 hover:text-white hover:bg-purple-500/10 transition-all duration-300 flex flex-col items-center justify-center gap-3 cursor-pointer group hover:shadow-[0_0_20px_rgba(168,85,247,0.25)]"
                >
                  <div className="p-3 rounded-xl bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                    <Film size={24} className="text-purple-400" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">ArtPlayer</span>
                </button>

                {/* VLC Player Card */}
                <button
                  type="button"
                  onClick={() => playInVlc(promptPlayEp)}
                  className="p-5 rounded-2xl bg-orange-500/5 border border-orange-500/20 hover:border-orange-400/50 text-orange-300 hover:text-white hover:bg-orange-500/10 transition-all duration-300 flex flex-col items-center justify-center gap-3 cursor-pointer group hover:shadow-[0_0_20px_rgba(249,115,22,0.25)]"
                >
                  <div className="p-3 rounded-xl bg-orange-500/10 group-hover:bg-orange-500/20 transition-colors">
                    <VLCIcon className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">VLC Player</span>
                </button>
              </div>

              <div className="flex justify-end pt-6 mt-6 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setPromptPlayEp(null)}
                  className="px-5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-bold cursor-pointer transition"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Folder Rescan Modal */}
      <AnimatePresence>
        {showRescanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg glass-panel p-6 rounded-2xl border border-white/10 shadow-neon-border text-left"
            >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                  <RefreshCw className={`text-neonCyan ${rescanStatus === 'scanning' || rescanStatus === 'comparing' || rescanStatus === 'syncing' ? 'animate-spin' : ''}`} size={18} />
                  Rescan Local Folder
                </h2>
                {rescanStatus !== 'scanning' && rescanStatus !== 'syncing' && rescanStatus !== 'comparing' && (
                  <button
                    onClick={() => setShowRescanModal(false)}
                    className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="bg-black/20 border border-white/5 rounded-xl p-4 space-y-4 text-xs">
                {/* Status indicator */}
                <div className="flex items-center gap-2">
                  {(rescanStatus === 'scanning' || rescanStatus === 'comparing' || rescanStatus === 'syncing') ? (
                    <Loader2 className="animate-spin text-neonCyan" size={16} />
                  ) : rescanStatus === 'completed' ? (
                    <CheckCircle2 className="text-emerald-400" size={16} />
                  ) : rescanStatus === 'error' ? (
                    <AlertTriangle className="text-red-400" size={16} />
                  ) : null}
                  <span className="font-semibold text-gray-200">
                    {rescanStatus === 'scanning' && 'Scanning directory...'}
                    {rescanStatus === 'comparing' && `Comparing files... (${scannedFilesCount} detected)`}
                    {rescanStatus === 'syncing' && 'Syncing database...'}
                    {rescanStatus === 'completed' && 'Scan & sync completed successfully!'}
                    {rescanStatus === 'error' && 'Scanning failed'}
                  </span>
                </div>

                {/* Progress Logs */}
                <div className="max-h-48 overflow-y-auto border border-white/5 rounded bg-black/40 p-3 font-mono text-[10px] text-gray-400 space-y-2">
                  <div>[INFO] Target folder: {anime.folderPath}</div>
                  
                  {rescanStatus === 'scanning' && (
                    <div className="text-neonCyan animate-pulse">&gt; Reading filesystem entries...</div>
                  )}

                  {(rescanStatus !== 'scanning' && rescanStatus !== 'idle') && (
                    <div>[INFO] Filesystem scan completed. Found {scannedFilesCount} matching files.</div>
                  )}

                  {(rescanStatus === 'comparing' || rescanStatus === 'syncing' || rescanStatus === 'completed') && (
                    <>
                      <div>[INFO] Comparing with Firestore database...</div>
                      <div className="text-emerald-400">+ Detected {rescanChanges.added.length} new files.</div>
                      <div className="text-rose-400">- Detected {rescanChanges.removed.length} removed files.</div>
                      
                      {rescanChanges.added.length > 0 && (
                        <div className="pl-3 border-l border-emerald-500/30 text-gray-500 max-h-24 overflow-y-auto space-y-0.5">
                          {rescanChanges.added.map(f => (
                            <div key={f.path} className="truncate">+ {f.name}</div>
                          ))}
                        </div>
                      )}

                      {rescanChanges.removed.length > 0 && (
                        <div className="pl-3 border-l border-rose-500/30 text-gray-500 max-h-24 overflow-y-auto space-y-0.5">
                          {rescanChanges.removed.map(f => (
                            <div key={f.id} className="truncate">- {f.fileName}</div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {rescanStatus === 'syncing' && (
                    <div className="text-neonPurple animate-pulse">&gt; Writing batch operations to Firestore...</div>
                  )}

                  {rescanStatus === 'completed' && (
                    <div className="text-emerald-400 font-semibold">[SUCCESS] Library has been updated.</div>
                  )}

                  {rescanStatus === 'error' && (
                    <div className="text-red-400 font-semibold">[ERROR] {rescanError}</div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-white/5">
                {(rescanStatus === 'completed' || rescanStatus === 'error') ? (
                  <button
                    type="button"
                    onClick={() => setShowRescanModal(false)}
                    className="px-5 py-2 rounded-lg bg-neon-gradient text-white text-xs font-bold uppercase tracking-wider hover:brightness-110 shadow-purple-glow cursor-pointer"
                  >
                    Close
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="px-5 py-2 rounded-lg bg-white/5 text-gray-500 text-xs font-bold uppercase tracking-wider border border-white/5"
                  >
                    Processing...
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
