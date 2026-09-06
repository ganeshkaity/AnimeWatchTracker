"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, getDocs, writeBatch, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import {
  getLocalAnime, upsertLocalAnime,
  getLocalEpisodes, upsertLocalEpisode, setLocalEpisodes, deleteLocalEpisode,
  addToDirtyQueue, getUserId
} from '../utils/localStore';
import { sortEpisodes, getSubfolder, getSafeDocId, processScannedFiles } from '../utils/parser';
import { 
  ArrowLeft, Play, CheckCircle2, Bookmark, StickyNote, Star, AlertTriangle, 
  Sparkles, History, RotateCcw, X, Heart, EyeOff, Film, Clock, Search,
  ChevronDown, ChevronUp, Folder, Tv, ExternalLink, RefreshCw, Loader2, CheckCheck,
  Wifi, Laptop, Smartphone, Settings2, QrCode, Youtube, FolderPlus, Trash2, Edit3,
  Move, Upload, FolderTree, FileVideo, HardDrive, FilePlus, Server,
  PlusCircle, CheckSquare, Square, SlidersHorizontal, ShieldCheck, Check, Layers, FolderMinus
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
  const { currentUser, updateDefaultPlayer } = useAuth();
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
  const [fetchingDuration, setFetchingDuration] = useState(false);
  // Bulk duration refetch state
  const [refetchDurationProgress, setRefetchDurationProgress] = useState(null); // null | { done, total, current }

  const DEFAULT_HARDCODED_QUALITIES = [
    { id: 'best', label: 'Best Available (Auto)' },
    { id: '1080p', label: '1080p HD' },
    { id: '720p', label: '720p HD' },
    { id: '480p', label: '480p SD' },
    { id: '360p', label: '360p SD' },
    { id: '240p', label: '240p SD' },
    { id: '144p', label: '144p SD' },
    { id: 'audio-only', label: 'Audio Only' },
  ];

  // Dynamic YouTube Quality State — Default hardcoded options
  const [ytModalQualities, setYtModalQualities] = useState(DEFAULT_HARDCODED_QUALITIES);
  const [ytModalSelectedQuality, setYtModalSelectedQuality] = useState('best');
  const [ytModalLoadingQualities, setYtModalLoadingQualities] = useState(false);

  const [ytWidgetQualities, setYtWidgetQualities] = useState(DEFAULT_HARDCODED_QUALITIES);
  const [ytWidgetSelectedQuality, setYtWidgetSelectedQuality] = useState('best');
  const [ytWidgetLoadingQualities, setYtWidgetLoadingQualities] = useState(false);

  // Rescan & Naming Pattern State
  const [showRescanModal, setShowRescanModal] = useState(false);
  const [rescanStatus, setRescanStatus] = useState('idle'); // 'idle' | 'scanning' | 'preview' | 'applying' | 'completed' | 'error'
  const [rescanMessage, setRescanMessage] = useState('');
  const [selectedNamingPattern, setSelectedNamingPattern] = useState('Auto');
  const [manageFolderExpanded, setManageFolderExpanded] = useState(true);
  const [rescanDiff, setRescanDiff] = useState(null);
  const [rescanSyncMode, setRescanSyncMode] = useState('normal'); // 'normal' | 'new_only' | 'deleted_only' | 'custom'
  const [selectedNewEpIds, setSelectedNewEpIds] = useState(new Set());
  const [selectedRemovedEpIds, setSelectedRemovedEpIds] = useState(new Set());
  const [rescanActiveTab, setRescanActiveTab] = useState('all'); // 'all' | 'new' | 'removed'

  // File Manager Modal State
  const [showFileManagerModal, setShowFileManagerModal] = useState(false);
  const [fmTree, setFmTree] = useState(null);
  const [fmLoading, setFmLoading] = useState(false);
  const [fmCurrentPath, setFmCurrentPath] = useState('');
  const [fmNewFolderName, setFmNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [fmNewFileName, setFmNewFileName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [fmRenameTarget, setFmRenameTarget] = useState(null);
  const [fmNewName, setFmNewName] = useState('');
  const [fmMoveTarget, setFmMoveTarget] = useState(null);
  const [fmDestPath, setFmDestPath] = useState('');

  // Manual fetch YouTube qualities for player selection modal
  const handleFetchYtModalQualities = useCallback(() => {
    if (!promptPlayEp) return;
    const vId = promptPlayEp.youtubeId || promptPlayEp.filePath?.replace('youtube://', '');
    if (!vId) return;
    setYtModalLoadingQualities(true);
    fetch('/api/youtube/qualities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: vId })
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.qualities)) {
          setYtModalQualities(data.qualities);
          if (data.duration && (!promptPlayEp.durationSeconds || promptPlayEp.durationSeconds === 0)) {
            const updatedEp = { 
              ...promptPlayEp, 
              durationSeconds: data.duration,
              updatedAt: new Date().toISOString()
            };
            upsertLocalEpisode(animeId, updatedEp);
            setEpisodes(prev => prev.map(e => e.id === updatedEp.id ? { ...e, ...updatedEp } : e));
          }
        }
      })
      .catch(err => console.error(err))
      .finally(() => setYtModalLoadingQualities(false));
  }, [promptPlayEp, animeId]);

  // Manual fetch YouTube qualities for Media Controls widget
  const handleFetchYtWidgetQualities = useCallback(() => {
    if (!episodes || episodes.length === 0) return;
    const sampleEp = episodes[0];
    const vId = sampleEp.youtubeId || sampleEp.filePath?.replace('youtube://', '');
    if (!vId) return;
    setYtWidgetLoadingQualities(true);
    fetch('/api/youtube/qualities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: vId })
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.qualities)) {
          setYtWidgetQualities(data.qualities);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setYtWidgetLoadingQualities(false));
  }, [episodes]);

  // Reset modal selected quality when promptPlayEp opens
  useEffect(() => {
    if (promptPlayEp) {
      setYtModalSelectedQuality(promptPlayEp.selectedQuality || 'best');
    }
  }, [promptPlayEp]);

  
  // Search / Filters
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('unwatched'); // Default to unwatched filter

  // Expanded/Collapsed subfolder groups (initially closed)
  const [expandedFolders, setExpandedFolders] = useState({});

  // Dynamic Real-Time Progress Percent derived from active episode list
  const effectiveProgressPercent = useMemo(() => {
    if (episodes && episodes.length > 0) {
      const watchedCount = episodes.filter(e => !!e.isWatched).length;
      return Math.round((watchedCount / episodes.length) * 100);
    }
    return Math.round(anime?.progressPercent || 0);
  }, [episodes, anime?.progressPercent]);

  const [helperExpanded, setHelperExpanded] = useState(false);
  const [flagsExpanded, setFlagsExpanded] = useState(false);
  const [ratingExpanded, setRatingExpanded] = useState(true);
  const [fetchingMalRating, setFetchingMalRating] = useState(false);
  const [fetchRatingMessage, setFetchRatingMessage] = useState('');

  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseFloat(localStorage.getItem('watchanime_vlc_speed') || '1.0');
    }
    return 1.0;
  });

  const [playbackVolume, setPlaybackVolume] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('watchanime_vlc_volume') || '100');
    }
    return 100;
  });

  const [actionsCollapsed, setActionsCollapsed] = useState(true);

  // Stream Pairing & Playback Target state
  const [streamPairing, setStreamPairing] = useState(null);
  const [streamTarget, setStreamTarget] = useState('host'); // 'host' (Play on PC Host) or 'mobile' (Stream to Mobile)
  const [streamPlayerModalEp, setStreamPlayerModalEp] = useState(null);

  useEffect(() => {
    const checkPairingState = async () => {
      try {
        const stored = localStorage.getItem('watchanime_stream_pairing');
        if (stored) {
          setStreamPairing(JSON.parse(stored));
          setStreamTarget('mobile');
          return;
        }
        const res = await fetch('/api/stream/host');
        const data = await res.json();
        if (data.success && data.session && data.session.pairedDevicesCount > 0) {
          setStreamPairing({ hostUrl: data.session.baseUrl || `http://${data.session.hostIp}:${data.session.port}`, isHostPC: true, count: data.session.pairedDevicesCount });
        }
      } catch (e) {}
    };
    checkPairingState();
  }, []);



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

  const handleSaveRating = async (newRating) => {
    if (!anime || !animeId) return;
    const ratingStr = String(newRating);
    const update = { id: animeId, rating: ratingStr, updatedAt: new Date().toISOString() };
    
    // Update local cache
    upsertLocalAnime(update);
    setAnime(prev => prev ? { ...prev, rating: ratingStr } : prev);
    
    // Update remote Firestore database
    if (!isOffline && db && currentUser) {
      try {
        await updateDoc(doc(db, 'users', getUserId(), 'anime', animeId), {
          rating: ratingStr,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Failed to save rating remotely:", err);
        addToDirtyQueue({ type: 'SET_ANIME', dedupeKey: `SET_ANIME_${animeId}`, payload: update });
      }
    } else {
      addToDirtyQueue({ type: 'SET_ANIME', dedupeKey: `SET_ANIME_${animeId}`, payload: update });
    }
  };

  const handleFetchMalRating = async () => {
    if (!anime?.title || fetchingMalRating) return;

    setFetchingMalRating(true);
    setFetchRatingMessage('');

    try {
      const res = await fetch(`/api/anime-rating?q=${encodeURIComponent(anime.title)}`);
      const data = await res.json();

      if (data.success && data.rating) {
        const ratingStr = String(data.rating);
        const popularityStr = data.popularity ? `#${data.popularity}` : '';
        const membersCount = data.members || 0;
        const rankStr = data.rank ? `#${data.rank}` : '';
        const scoreStr = data.score ? String(data.score) : ratingStr;

        const update = {
          id: animeId,
          rating: ratingStr,
          malScore: scoreStr,
          malPopularity: popularityStr,
          malRank: rankStr,
          malMembers: membersCount,
          malUrl: data.url || '',
          updatedAt: new Date().toISOString()
        };

        // Update local store
        upsertLocalAnime(update);
        setAnime(prev => prev ? { ...prev, ...update } : prev);

        // Update Firestore
        if (!isOffline && db && currentUser) {
          try {
            await updateDoc(doc(db, 'users', getUserId(), 'anime', animeId), {
              rating: ratingStr,
              malScore: scoreStr,
              malPopularity: popularityStr,
              malRank: rankStr,
              malMembers: membersCount,
              malUrl: data.url || '',
              updatedAt: new Date().toISOString()
            });
          } catch (err) {
            console.error("Failed to update rating in Firestore:", err);
            addToDirtyQueue({ type: 'SET_ANIME', dedupeKey: `SET_ANIME_${animeId}`, payload: update });
          }
        } else {
          addToDirtyQueue({ type: 'SET_ANIME', dedupeKey: `SET_ANIME_${animeId}`, payload: update });
        }

        setFetchRatingMessage(`Updated: ${data.rating}/10 (${data.source}${data.popularity ? ` • Pop #${data.popularity}` : ''})`);
        setTimeout(() => setFetchRatingMessage(''), 5000);
      } else {
        alert(data.error || 'Could not fetch rating from internet.');
      }
    } catch (err) {
      console.error('Error fetching online rating:', err);
      alert('Failed to connect to rating service: ' + (err.message || 'Network error'));
    } finally {
      setFetchingMalRating(false);
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
    if (makeDefault && updateDefaultPlayer) {
      try {
        await updateDefaultPlayer(playerType);
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
          resumeTime: episode.lastPositionSeconds || 0,
          speed: typeof playbackSpeed === 'number' ? playbackSpeed : parseFloat(localStorage.getItem('watchanime_vlc_speed') || '1.0'),
          volume: typeof playbackVolume === 'number' ? playbackVolume : parseInt(localStorage.getItem('watchanime_vlc_volume') || '100', 10)
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
    const quality = ytModalSelectedQuality || episode.selectedQuality || ytWidgetSelectedQuality || 'best';
    if (onPlayEpisode) {
      onPlayEpisode(episode.id, episodes, 'builtin', {
        speed: playbackSpeed,
        volume: playbackVolume,
        quality
      });
    }
  };

  const playInArtPlayer = async (episode) => {
    setPromptPlayEp(null);
    await saveDefaultPlayerIfChecked('artplayer');
    const quality = ytModalSelectedQuality || episode.selectedQuality || ytWidgetSelectedQuality || 'best';
    if (onPlayEpisode) {
      onPlayEpisode(episode.id, episodes, 'artplayer', {
        speed: playbackSpeed,
        volume: playbackVolume,
        quality
      });
    }
  };

  const playInVideoJs = async (episode) => {
    setPromptPlayEp(null);
    await saveDefaultPlayerIfChecked('videojs');
    const quality = ytModalSelectedQuality || episode.selectedQuality || ytWidgetSelectedQuality || 'best';
    if (onPlayEpisode) {
      onPlayEpisode(episode.id, episodes, 'videojs', {
        speed: playbackSpeed,
        volume: playbackVolume,
        quality
      });
    }
  };

  const playInMediaServer = async (episode) => {
    setPromptPlayEp(null);
    await saveDefaultPlayerIfChecked('mediaserver');
    const quality = ytModalSelectedQuality || episode.selectedQuality || ytWidgetSelectedQuality || 'best';
    if (onPlayEpisode) {
      onPlayEpisode(episode.id, episodes, 'mediaserver', {
        speed: playbackSpeed,
        volume: playbackVolume,
        quality
      });
    }
  };

  const playInYoutube = async (episode) => {
    setPromptPlayEp(null);
    await saveDefaultPlayerIfChecked('youtube');
    if (onPlayEpisode) {
      onPlayEpisode(episode.id, episodes, 'youtube', {
        speed: playbackSpeed,
        volume: playbackVolume,
        quality: 'best' // Embed ignores our quality fetch, but we pass it anyway
      });
    }
  };

  const playInYtDlp = async (episode) => {
    setPromptPlayEp(null);
    await saveDefaultPlayerIfChecked('ytdlp');
    const quality = ytModalSelectedQuality || episode.selectedQuality || ytWidgetSelectedQuality || 'best';
    if (onPlayEpisode) {
      onPlayEpisode(episode.id, episodes, 'ytdlp', {
        speed: playbackSpeed,
        volume: playbackVolume,
        quality
      });
    }
  };

  // Fetch YouTube video duration if not already stored
  const ensureYtDuration = async (episode) => {
    if (episode.durationSeconds && episode.durationSeconds > 0) return episode;
    const isYt = episode.isYouTube || episode.filePath?.startsWith('youtube://');
    if (!isYt) return episode;

    const vId = episode.youtubeId || episode.filePath?.replace('youtube://', '');
    if (!vId) return episode;

    setFetchingDuration(true);
    try {
      const res = await fetch('/api/youtube/duration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: vId })
      });
      const data = await res.json();
      if (data.success && data.duration > 0) {
        const updatedEp = { ...episode, durationSeconds: data.duration };
        // Persist to Firestore
        if (currentUser) {
          try {
            const epRef = doc(db, 'users', currentUser.uid, 'anime', animeId, 'episodes', episode.id);
            await updateDoc(epRef, { durationSeconds: data.duration });
          } catch (e) { console.error('[duration save]', e); }
        }
        // Update local state
        upsertLocalEpisode(animeId, updatedEp);
        setEpisodes(prev => prev.map(e => e.id === episode.id ? { ...e, durationSeconds: data.duration } : e));
        setFetchingDuration(false);
        return updatedEp;
      }
    } catch (err) {
      console.error('[ensureYtDuration]', err);
    }
    setFetchingDuration(false);
    return episode;
  };

  // Bulk refetch durations for ALL YouTube episodes (force-refetch, ignores existing)
  const handleRefetchAllDurations = async () => {
    const ytEpisodes = episodes.filter(e => e.isYouTube || e.filePath?.startsWith('youtube://'));
    if (ytEpisodes.length === 0) return;

    setRefetchDurationProgress({ done: 0, total: ytEpisodes.length, current: '' });

    for (let i = 0; i < ytEpisodes.length; i++) {
      const ep = ytEpisodes[i];
      const vId = ep.youtubeId || ep.filePath?.replace('youtube://', '');
      if (!vId) {
        setRefetchDurationProgress(p => ({ ...p, done: i + 1, current: ep.fileName || `Episode ${ep.episodeNumber}` }));
        continue;
      }

      setRefetchDurationProgress(p => ({
        ...p,
        done: i,
        current: ep.fileName || `Episode ${ep.episodeNumber}`
      }));

      try {
        const res = await fetch('/api/youtube/duration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: vId })
        });
        const data = await res.json();
        if (data.success && data.duration > 0) {
          // Save to Firestore
          if (currentUser) {
            try {
              const epRef = doc(db, 'users', currentUser.uid, 'anime', animeId, 'episodes', ep.id);
              await updateDoc(epRef, { durationSeconds: data.duration });
            } catch (e) { console.error('[bulk duration save]', e); }
          }
          // Update local state
          setEpisodes(prev => prev.map(e => e.id === ep.id ? { ...e, durationSeconds: data.duration } : e));
        }
      } catch (err) {
        console.error('[bulk duration refetch]', ep.id, err);
      }

      setRefetchDurationProgress(p => ({ ...p, done: i + 1 }));
    }

    setRefetchDurationProgress(null);
  };

  // Trigger episode click options
  const handlePlayEpisode = async (episode) => {
    if (streamPairing && streamTarget === 'mobile') {
      setStreamPlayerModalEp(episode);
      return;
    }

    const defPlayer = currentUser?.defaultPlayer;
    const isYt = !!(
      episode.isYouTube ||
      episode.filePath?.startsWith('youtube://') ||
      anime?.isYouTube ||
      anime?.folderPath?.startsWith('http') ||
      anime?.folderPath?.startsWith('youtube://')
    );

    // Pre-fetch YouTube duration before launching any player
    const ep = isYt ? await ensureYtDuration(episode) : episode;

    // RULE 1: For YouTube playlist animes (Only YouTube Embed or YT-DLP)
    if (isYt) {
      if (defPlayer === 'youtube') {
        playInYoutube(ep);
      } else if (defPlayer === 'ytdlp') {
        playInYtDlp(ep);
      } else {
        // If defPlayer is 'mediaserver', 'vlc', 'ask', or unset -> give player selection modal (YouTube Embed, YT-DLP)
        setMakeDefault(false);
        setPromptPlayEp(ep);
      }
      return;
    }

    // RULE 2: For local storage episodes (Only Media Server or VLC, never YouTube)
    if (defPlayer === 'mediaserver') {
      playInMediaServer(ep);
    } else if (defPlayer === 'vlc') {
      playInVlc(ep);
    } else {
      // If defPlayer is 'youtube', 'ytdlp', 'ask', or unset -> give player selection modal (Media Server, VLC)
      setMakeDefault(false);
      setPromptPlayEp(ep);
    }
  };

  // Handle folder / playlist rescan (computes diff for preview & consent)
  const handleRescan = async (patternOverride) => {
    if (!anime) return;
    const pattern = (typeof patternOverride === 'string' && patternOverride.trim())
      ? patternOverride.trim()
      : (selectedNamingPattern || anime.namingPattern || 'Auto');

    setRescanStatus('scanning');
    setRescanMessage('Scanning folder / playlist for changes...');
    setShowRescanModal(true);

    try {
      const isYt = anime.isYouTube || anime.folderPath?.startsWith('http') || anime.folderPath?.startsWith('youtube://');
      let scannedCandidateEps = [];

      if (isYt) {
        setRescanMessage('Fetching YouTube playlist video list...');
        const res = await fetch('/api/youtube/playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: anime.folderPath })
        });
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch YouTube playlist');
        }

        const ytVideos = data.playlist?.videos || [];
        const existingEpMap = new Map(episodes.map(e => [e.id, e]));

        scannedCandidateEps = ytVideos.map((v, idx) => {
          const epId = getSafeDocId(`yt_${v.id}`);
          const existing = existingEpMap.get(epId);
          return {
            id: epId,
            animeId: animeId,
            episodeNumber: idx + 1,
            fileName: v.title || `Episode ${idx + 1}`,
            filePath: `youtube://${v.id}`,
            youtubeId: v.id,
            thumbnailUrl: v.thumbnail || '',
            durationSeconds: v.durationSeconds || 0,
            durationString: v.durationString || '',
            isYouTube: true,
            isWatched: existing ? existing.isWatched : false,
            watchedSeconds: existing ? existing.watchedSeconds : 0,
            lastPositionSeconds: existing ? existing.lastPositionSeconds : 0,
            flags: existing ? existing.flags : [],
            note: existing ? existing.note : '',
            updatedAt: new Date().toISOString()
          };
        });
      } else {
        setRescanMessage(`Scanning folder with pattern: ${pattern}...`);
        let scannedFiles = [];
        try {
          const res = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: anime.folderPath, namingPattern: pattern })
          });
          const data = await res.json();
          if (data.success) {
            scannedFiles = data.episodes || data.files || [];
          }
        } catch (err) {
          console.warn("Local scan API failed or directory not on disk:", err);
        }

        if (scannedFiles.length > 0) {
          const processed = processScannedFiles(scannedFiles, anime.folderPath, pattern);
          
          const existingById = new Map(episodes.map(e => [e.id, e]));
          const existingByPath = new Map(episodes.map(e => [(e.filePath || '').replace(/\\/g, '/').toLowerCase(), e]));
          const existingByName = new Map(episodes.map(e => [(e.fileName || e.name || '').toLowerCase(), e]));

          const findExisting = (pEp, epId) => {
            if (existingById.has(epId)) return existingById.get(epId);
            const normPath = (pEp.filePath || pEp.path || '').replace(/\\/g, '/').toLowerCase();
            if (normPath && existingByPath.has(normPath)) return existingByPath.get(normPath);
            const normName = (pEp.fileName || pEp.name || '').toLowerCase();
            if (normName && existingByName.has(normName)) return existingByName.get(normName);
            return null;
          };

          scannedCandidateEps = processed.map((pEp) => {
            const rawId = pEp.id || pEp.docId || getSafeDocId(pEp.filePath || pEp.fileName, anime.folderPath);
            const existing = findExisting(pEp, rawId);
            const epId = existing?.id || rawId;
            return {
              ...pEp,
              id: epId,
              animeId: animeId,
              isWatched: existing ? !!existing.isWatched : (pEp.isWatched || false),
              watchedSeconds: existing ? (existing.watchedSeconds || 0) : (pEp.watchedSeconds || 0),
              lastPositionSeconds: existing ? (existing.lastPositionSeconds || 0) : (pEp.lastPositionSeconds || 0),
              flags: existing ? (existing.flags || []) : (pEp.flags || []),
              note: existing ? (existing.note || '') : (pEp.note || ''),
              updatedAt: new Date().toISOString()
            };
          });
        } else {
          scannedCandidateEps = [];
        }
      }

      // Calculate Diff against current episodes
      const existingIdSet = new Set(episodes.map(e => e.id));
      const scannedIdSet = new Set(scannedCandidateEps.map(e => e.id));

      const newEpisodes = scannedCandidateEps.filter(ep => !existingIdSet.has(ep.id));
      const retainedEpisodes = scannedCandidateEps.filter(ep => existingIdSet.has(ep.id));
      const removedEpisodes = episodes.filter(ep => !scannedIdSet.has(ep.id));

      // Folder Diff
      const oldFolders = new Set(episodes.map(e => getSubfolder(e.filePath, anime?.folderPath || '')));
      const newFolders = new Set(scannedCandidateEps.map(e => getSubfolder(e.filePath, anime?.folderPath || '')));

      const addedFoldersList = Array.from(newFolders).filter(f => f && f !== '' && !oldFolders.has(f));
      const removedFoldersList = Array.from(oldFolders).filter(f => f && f !== '' && !newFolders.has(f));

      const mergedList = sortEpisodes([
        ...retainedEpisodes,
        ...newEpisodes
      ]);

      const diff = {
        newEpisodes,
        retainedEpisodes,
        removedEpisodes,
        addedFolders: addedFoldersList,
        removedFolders: removedFoldersList,
        pattern,
        allMergedEpisodes: mergedList,
        scannedCount: scannedCandidateEps.length
      };

      setRescanDiff(diff);

      // Initialize selection sets
      const allNewIds = new Set(newEpisodes.map(e => e.id));
      const allRemovedIds = new Set(removedEpisodes.map(e => e.id));
      setSelectedNewEpIds(allNewIds);
      setSelectedRemovedEpIds(allRemovedIds);

      // Smart default mode based on detected changes
      if (newEpisodes.length > 0 && removedEpisodes.length > 0) {
        setRescanSyncMode('normal');
      } else if (newEpisodes.length > 0) {
        setRescanSyncMode('new_only');
      } else if (removedEpisodes.length > 0) {
        setRescanSyncMode('deleted_only');
      } else {
        setRescanSyncMode('normal');
      }

      setRescanActiveTab('all');
      setRescanStatus('preview');
    } catch (err) {
      console.error('Error during rescan:', err);
      setRescanStatus('error');
      setRescanMessage(err.message || 'Error occurred while rescanning');
    }
  };

  // Switch Sync Mode handler
  const handleSelectSyncMode = (mode) => {
    setRescanSyncMode(mode);
    if (!rescanDiff) return;
    if (mode === 'normal') {
      setSelectedNewEpIds(new Set(rescanDiff.newEpisodes.map(e => e.id)));
      setSelectedRemovedEpIds(new Set(rescanDiff.removedEpisodes.map(e => e.id)));
    } else if (mode === 'new_only') {
      setSelectedNewEpIds(new Set(rescanDiff.newEpisodes.map(e => e.id)));
      setSelectedRemovedEpIds(new Set()); // Nothing deleted!
    } else if (mode === 'deleted_only') {
      setSelectedNewEpIds(new Set()); // Nothing added!
      setSelectedRemovedEpIds(new Set(rescanDiff.removedEpisodes.map(e => e.id)));
    }
  };

  // Toggle single new episode checkbox
  const handleToggleNewEpisode = (epId) => {
    setRescanSyncMode('custom');
    setSelectedNewEpIds(prev => {
      const next = new Set(prev);
      if (next.has(epId)) next.delete(epId);
      else next.add(epId);
      return next;
    });
  };

  // Toggle single removed episode checkbox (checked = will remove)
  const handleToggleRemovedEpisode = (epId) => {
    setRescanSyncMode('custom');
    setSelectedRemovedEpIds(prev => {
      const next = new Set(prev);
      if (next.has(epId)) next.delete(epId);
      else next.add(epId);
      return next;
    });
  };

  // Select all or deselect all new episodes
  const handleSelectAllNew = (select) => {
    if (!rescanDiff) return;
    setRescanSyncMode('custom');
    if (select) {
      setSelectedNewEpIds(new Set(rescanDiff.newEpisodes.map(e => e.id)));
    } else {
      setSelectedNewEpIds(new Set());
    }
  };

  // Select all or deselect all removed episodes
  const handleSelectAllRemoved = (select) => {
    if (!rescanDiff) return;
    setRescanSyncMode('custom');
    if (select) {
      setSelectedRemovedEpIds(new Set(rescanDiff.removedEpisodes.map(e => e.id)));
    } else {
      setSelectedRemovedEpIds(new Set());
    }
  };

  // Toggle entire subfolder for new episodes
  const handleToggleFolderNew = (folderName, selectAll) => {
    if (!rescanDiff) return;
    setRescanSyncMode('custom');
    const folderEpIds = rescanDiff.newEpisodes
      .filter(ep => getSubfolder(ep.filePath, anime?.folderPath || '') === folderName)
      .map(ep => ep.id);
    setSelectedNewEpIds(prev => {
      const next = new Set(prev);
      folderEpIds.forEach(id => {
        if (selectAll) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  // Toggle entire subfolder for removed episodes
  const handleToggleFolderRemoved = (folderName, selectAll) => {
    if (!rescanDiff) return;
    setRescanSyncMode('custom');
    const folderEpIds = rescanDiff.removedEpisodes
      .filter(ep => getSubfolder(ep.filePath, anime?.folderPath || '') === folderName)
      .map(ep => ep.id);
    setSelectedRemovedEpIds(prev => {
      const next = new Set(prev);
      folderEpIds.forEach(id => {
        if (selectAll) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  // Apply Rescan Changes Handler (respects chosen sync mode & selected items)
  const handleApplyRescanChanges = async () => {
    if (!rescanDiff || !anime) return;
    setRescanStatus('applying');
    setRescanMessage('Applying rescan changes to library and database...');

    try {
      const { newEpisodes, removedEpisodes, pattern } = rescanDiff;

      // Filter exact episodes to add & remove based on user's selected sets
      const episodesToAdd = newEpisodes.filter(ep => selectedNewEpIds.has(ep.id));
      const episodesToRemove = removedEpisodes.filter(ep => selectedRemovedEpIds.has(ep.id));

      // Build retained list: all currently existing episodes EXCEPT those selected for removal
      const removedIdSet = new Set(episodesToRemove.map(e => e.id));
      const retainedCurrentEpisodes = episodes.filter(ep => !removedIdSet.has(ep.id));

      // Build final merged episodes
      const allMergedEpisodes = sortEpisodes([
        ...retainedCurrentEpisodes,
        ...episodesToAdd
      ]);

      // Calculate new accurate progress percentage and last watched episode
      const total = allMergedEpisodes.length;
      const watched = allMergedEpisodes.filter(e => !!e.isWatched).length;
      const newProgressPercent = total > 0 ? Math.round((watched / total) * 100) : 0;
      let lastWatchedNum = anime.lastWatchedEpisode || '';
      let lastOpened = new Date(0);
      allMergedEpisodes.forEach(ep => {
        if (ep.lastPositionSeconds > 0 || ep.isWatched) {
          const t = new Date(ep.updatedAt || 0);
          if (t > lastOpened) {
            lastOpened = t;
            lastWatchedNum = `EP-${ep.episodeNumber || 1}`;
          }
        }
      });

      const updatedAnimeDoc = {
        ...anime,
        namingPattern: pattern,
        episodeCount: total,
        progressPercent: newProgressPercent,
        lastWatchedEpisode: lastWatchedNum,
        updatedAt: new Date().toISOString()
      };

      // 1. Immediately apply locally to state & storage
      episodesToAdd.forEach(ep => upsertLocalEpisode(animeId, ep));
      episodesToRemove.forEach(ep => deleteLocalEpisode(animeId, ep.id));

      setEpisodes(allMergedEpisodes);
      setLocalEpisodes(animeId, allMergedEpisodes);
      upsertLocalAnime(updatedAnimeDoc);
      setAnime(updatedAnimeDoc);

      // 2. Upload to Firestore if online
      if (!isOffline && db && currentUser) {
        const batch = writeBatch(db);

        // Upload ONLY newly added episodes!
        episodesToAdd.forEach(ep => {
          const epRef = doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', ep.id);
          batch.set(epRef, ep, { merge: true });
        });

        // Delete ONLY selected removed episodes
        episodesToRemove.forEach(ep => {
          const epRef = doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', ep.id);
          batch.delete(epRef);
        });

        // Update anime metadata with recalculated progressPercent and episodeCount
        const animeRef = doc(db, 'users', getUserId(), 'anime', animeId);
        batch.set(animeRef, {
          namingPattern: pattern,
          episodeCount: total,
          progressPercent: newProgressPercent,
          lastWatchedEpisode: lastWatchedNum,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        await batch.commit();
      } else {
        // Queue dirty ops for offline sync
        episodesToAdd.forEach(ep => {
          addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${ep.id}`, payload: { animeId, ...ep } });
        });
        episodesToRemove.forEach(ep => {
          addToDirtyQueue({ type: 'DELETE_EPISODE', dedupeKey: `DELETE_EPISODE_${animeId}_${ep.id}`, payload: { animeId, id: ep.id, episodeId: ep.id } });
        });
        addToDirtyQueue({
          type: 'SET_ANIME',
          dedupeKey: `SET_ANIME_${animeId}`,
          payload: {
            id: animeId,
            namingPattern: pattern,
            episodeCount: total,
            progressPercent: newProgressPercent,
            lastWatchedEpisode: lastWatchedNum,
            updatedAt: new Date().toISOString()
          }
        });
      }

      setRescanStatus('completed');
      let summaryText = 'Library updated successfully!';
      if (episodesToAdd.length > 0 && episodesToRemove.length > 0) {
        summaryText = `Added ${episodesToAdd.length} new episode(s) and removed ${episodesToRemove.length} missing item(s).`;
      } else if (episodesToAdd.length > 0) {
        summaryText = `Added ${episodesToAdd.length} new episode(s). Existing & missing items were kept untouched.`;
      } else if (episodesToRemove.length > 0) {
        summaryText = `Removed ${episodesToRemove.length} missing item(s) from library.`;
      } else {
        summaryText = `No episode changes applied. Library metadata refreshed.`;
      }
      setRescanMessage(`Rescan complete! ${summaryText} (${total} total episodes, ${watched} watched).`);
    } catch (err) {
      console.error("Error applying rescan changes:", err);
      setRescanStatus('error');
      setRescanMessage(err.message || 'Failed to apply rescan changes');
    }
  };

  // In-memory File Manager Tree Builder (built from Firestore episodes data)
  const buildTreeFromEpisodes = useCallback((epList, rootFolder, currentPath) => {
    const root = (rootFolder || 'Root').replace(/\\/g, '/').replace(/\/$/, '');
    const current = (currentPath || root).replace(/\\/g, '/').replace(/\/$/, '');

    const children = [];
    const folderSet = new Map();

    epList.forEach((ep) => {
      const rawPath = (ep.filePath || ep.fileName || ep.name || ep.title || '').replace(/\\/g, '/');
      let relPath = rawPath;

      if (current && rawPath.startsWith(current)) {
        relPath = rawPath.slice(current.length).replace(/^\//, '');
      } else if (root && rawPath.startsWith(root)) {
        relPath = rawPath.slice(root.length).replace(/^\//, '');
      }

      const parts = relPath.split('/').filter(Boolean);
      if (parts.length === 0) return;

      if (parts.length === 1) {
        if (parts[0] === '.keep' || parts[0] === '.folder_placeholder') return;
        children.push({
          name: ep.fileName || ep.name || ep.title || parts[0],
          isDirectory: false,
          path: ep.filePath || `${current}/${parts[0]}`,
          relativePath: parts[0],
          id: ep.id,
          size: ep.sizeBytes || 0,
          episode: ep
        });
      } else {
        const subFolderName = parts[0];
        const subFolderPath = `${current}/${subFolderName}`;
        if (!folderSet.has(subFolderName)) {
          folderSet.set(subFolderName, subFolderPath);
        }
      }
    });

    folderSet.forEach((fPath, fName) => {
      children.push({
        name: fName,
        isDirectory: true,
        path: fPath,
        relativePath: fName,
        children: []
      });
    });

    children.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return {
      name: current.split('/').pop() || 'Root',
      isDirectory: true,
      path: current,
      children
    };
  }, []);

  // Load File Manager directory contents from Firestore state
  const loadFileManagerTree = useCallback((targetPath) => {
    const queryPath = targetPath || anime?.folderPath || 'Root';
    setFmLoading(true);
    try {
      const tree = buildTreeFromEpisodes(episodes, anime?.folderPath, queryPath);
      setFmTree(tree);
      setFmCurrentPath(tree.path);
    } catch (err) {
      console.error("File manager tree build error:", err);
    } finally {
      setFmLoading(false);
    }
  }, [anime, episodes, buildTreeFromEpisodes]);

  // Auto refresh tree when episodes or path changes in modal
  useEffect(() => {
    if (showFileManagerModal) {
      const queryPath = fmCurrentPath || anime?.folderPath || 'Root';
      const tree = buildTreeFromEpisodes(episodes, anime?.folderPath, queryPath);
      setFmTree(tree);
    }
  }, [episodes, fmCurrentPath, anime, showFileManagerModal, buildTreeFromEpisodes]);

  const openFileManagerModal = () => {
    setShowFileManagerModal(true);
    loadFileManagerTree(anime?.folderPath);
  };

  const handleCreateSubfolder = async () => {
    if (!fmNewFolderName.trim() || !fmCurrentPath) return;
    const folderName = fmNewFolderName.trim();
    const cleanCurrent = fmCurrentPath.replace(/\\/g, '/').replace(/\/$/, '');
    const newFolderPath = `${cleanCurrent}/${folderName}`;
    try {
      setFmLoading(true);
      const placeholderId = getSafeDocId(`${folderName}_placeholder`, newFolderPath);
      const placeholderEp = {
        id: placeholderId,
        name: '.keep',
        fileName: '.keep',
        title: '.keep',
        filePath: `${newFolderPath}/.keep`,
        isWatched: false,
        durationSeconds: 0,
        watchedSeconds: 0,
        updatedAt: new Date().toISOString()
      };

      if (!isOffline && db && currentUser) {
        await setDoc(doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', placeholderId), placeholderEp);
      } else {
        addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${placeholderId}`, payload: { animeId, ...placeholderEp } });
      }
      upsertLocalEpisode(animeId, placeholderEp);
      setEpisodes(prev => sortEpisodes([...prev, placeholderEp]));

      setFmNewFolderName('');
      setShowNewFolderInput(false);
    } catch (err) {
      console.error("Error creating folder in Firestore:", err);
      alert("Error creating folder: " + err.message);
    } finally {
      setFmLoading(false);
    }
  };

  const handleCheckFile = async () => {
    if (!fmNewFileName.trim() || !fmCurrentPath) return;
    const fileName = fmNewFileName.trim();
    const cleanCurrent = fmCurrentPath.replace(/\\/g, '/').replace(/\/$/, '');
    const newFilePath = `${cleanCurrent}/${fileName}`;
    try {
      setFmLoading(true);
      const newEpId = getSafeDocId(fileName, cleanCurrent);
      const newEp = {
        id: newEpId,
        name: fileName,
        fileName: fileName,
        title: fileName.replace(/\.[^/.]+$/, ''),
        filePath: newFilePath,
        isWatched: false,
        durationSeconds: 0,
        watchedSeconds: 0,
        updatedAt: new Date().toISOString()
      };

      if (!isOffline && db && currentUser) {
        await setDoc(doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', newEpId), newEp);
      } else {
        addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${newEpId}`, payload: { animeId, ...newEp } });
      }
      upsertLocalEpisode(animeId, newEp);
      setEpisodes(prev => sortEpisodes([...prev, newEp]));

      alert(`Added "${fileName}" to Firestore database!`);
      setFmNewFileName('');
      setShowNewFileInput(false);
    } catch (err) {
      console.error("Error adding file to Firestore:", err);
      alert("Error adding file: " + err.message);
    } finally {
      setFmLoading(false);
    }
  };

  const handleRenameItem = async () => {
    if (!fmRenameTarget || !fmNewName.trim()) return;
    const newName = fmNewName.trim();
    try {
      setFmLoading(true);
      if (!fmRenameTarget.isDirectory) {
        const ep = fmRenameTarget.episode;
        if (!ep) return;

        const oldPath = (ep.filePath || fmRenameTarget.path || '').replace(/\\/g, '/');
        const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
        const newFilePath = parentDir ? `${parentDir}/${newName}` : newName;

        const updatedEp = {
          ...ep,
          name: newName,
          fileName: newName,
          title: newName.replace(/\.[^/.]+$/, ''),
          filePath: newFilePath,
          updatedAt: new Date().toISOString()
        };

        if (!isOffline && db && currentUser) {
          await updateDoc(doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', ep.id), updatedEp);
        } else {
          addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${ep.id}`, payload: { animeId, ...updatedEp } });
        }
        upsertLocalEpisode(animeId, updatedEp);
        setEpisodes(prev => prev.map(e => e.id === ep.id ? updatedEp : e));
      } else {
        const oldSubfolderPath = fmRenameTarget.path.replace(/\\/g, '/').replace(/\/$/, '');
        const parentDir = oldSubfolderPath.substring(0, oldSubfolderPath.lastIndexOf('/'));
        const newSubfolderPath = parentDir ? `${parentDir}/${newName}` : newName;

        const targetEps = episodes.filter(ep => {
          const epPath = (ep.filePath || '').replace(/\\/g, '/');
          return epPath.startsWith(oldSubfolderPath + '/') || epPath === oldSubfolderPath;
        });

        const updatedList = [];
        for (const ep of targetEps) {
          const oldEpPath = (ep.filePath || '').replace(/\\/g, '/');
          const newEpPath = oldEpPath.replace(oldSubfolderPath, newSubfolderPath);
          const updatedEp = {
            ...ep,
            filePath: newEpPath,
            updatedAt: new Date().toISOString()
          };
          if (!isOffline && db && currentUser) {
            await updateDoc(doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', ep.id), updatedEp);
          } else {
            addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${ep.id}`, payload: { animeId, ...updatedEp } });
          }
          upsertLocalEpisode(animeId, updatedEp);
          updatedList.push(updatedEp);
        }

        const mapById = new Map(updatedList.map(e => [e.id, e]));
        setEpisodes(prev => prev.map(e => mapById.get(e.id) || e));
      }

      setFmRenameTarget(null);
      setFmNewName('');
    } catch (err) {
      console.error("Error renaming item in Firestore:", err);
      alert("Error renaming item: " + err.message);
    } finally {
      setFmLoading(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!confirm(`Are you sure you want to delete "${item.name}" from Firestore library? This action cannot be undone.`)) return;
    try {
      setFmLoading(true);
      let updatedRemainingEps = [];
      if (!item.isDirectory) {
        const epId = item.id;
        if (!isOffline && db && currentUser) {
          await deleteDoc(doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', epId));
        } else {
          addToDirtyQueue({ type: 'DELETE_EPISODE', dedupeKey: `DELETE_EPISODE_${animeId}_${epId}`, payload: { animeId, id: epId, episodeId: epId } });
        }
        deleteLocalEpisode(animeId, epId);
        updatedRemainingEps = episodes.filter(ep => ep.id !== epId);
        setEpisodes(updatedRemainingEps);
      } else {
        const subfolderPathNorm = item.path.replace(/\\/g, '/').replace(/\/$/, '') + '/';
        const targetEps = episodes.filter(ep => {
          const epPathNorm = (ep.filePath || '').replace(/\\/g, '/');
          return epPathNorm.startsWith(subfolderPathNorm);
        });

        for (const ep of targetEps) {
          if (!isOffline && db && currentUser) {
            await deleteDoc(doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', ep.id));
          } else {
            addToDirtyQueue({ type: 'DELETE_EPISODE', dedupeKey: `DELETE_EPISODE_${animeId}_${ep.id}`, payload: { animeId, id: ep.id, episodeId: ep.id } });
          }
          deleteLocalEpisode(animeId, ep.id);
        }

        const targetIds = new Set(targetEps.map(e => e.id));
        updatedRemainingEps = episodes.filter(ep => !targetIds.has(ep.id));
        setEpisodes(updatedRemainingEps);
      }

      // Recalculate anime progress & episodeCount after deletion
      const total = updatedRemainingEps.length;
      const watched = updatedRemainingEps.filter(e => e.isWatched).length;
      const newProgressPercent = total > 0 ? Math.round((watched / total) * 100) : 0;
      let lastWatchedNum = anime?.lastWatchedEpisode || '';
      let lastOpened = new Date(0);
      updatedRemainingEps.forEach(ep => {
        if (ep.lastPositionSeconds > 0 || ep.isWatched) {
          const t = new Date(ep.updatedAt || 0);
          if (t > lastOpened) {
            lastOpened = t;
            lastWatchedNum = `EP-${ep.episodeNumber || 1}`;
          }
        }
      });

      const updatedAnimeDoc = {
        ...anime,
        episodeCount: total,
        progressPercent: newProgressPercent,
        lastWatchedEpisode: lastWatchedNum,
        updatedAt: new Date().toISOString()
      };

      upsertLocalAnime(updatedAnimeDoc);
      setAnime(prev => prev ? { ...prev, ...updatedAnimeDoc } : prev);

      if (!isOffline && db && currentUser) {
        await updateDoc(doc(db, 'users', getUserId(), 'anime', animeId), {
          episodeCount: total,
          progressPercent: newProgressPercent,
          lastWatchedEpisode: lastWatchedNum,
          updatedAt: new Date().toISOString()
        }).catch(() => {});
      } else {
        addToDirtyQueue({
          type: 'SET_ANIME',
          dedupeKey: `SET_ANIME_${animeId}`,
          payload: {
            id: animeId,
            episodeCount: total,
            progressPercent: newProgressPercent,
            lastWatchedEpisode: lastWatchedNum,
            updatedAt: new Date().toISOString()
          }
        });
      }
    } catch (err) {
      console.error("Error deleting item from Firestore:", err);
      alert("Error deleting item: " + err.message);
    } finally {
      setFmLoading(false);
    }
  };

  const handleMoveItem = async () => {
    if (!fmMoveTarget || !fmDestPath) return;
    const destFolder = fmDestPath.replace(/\\/g, '/').replace(/\/$/, '');
    try {
      setFmLoading(true);
      if (!fmMoveTarget.isDirectory) {
        const ep = fmMoveTarget.episode;
        if (!ep) return;
        const newFilePath = `${destFolder}/${ep.fileName || ep.name}`;
        const updatedEp = {
          ...ep,
          filePath: newFilePath,
          updatedAt: new Date().toISOString()
        };
        if (!isOffline && db && currentUser) {
          await updateDoc(doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', ep.id), updatedEp);
        } else {
          addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${ep.id}`, payload: { animeId, ...updatedEp } });
        }
        upsertLocalEpisode(animeId, updatedEp);
        setEpisodes(prev => prev.map(e => e.id === ep.id ? updatedEp : e));
      } else {
        const oldSubfolderPath = fmMoveTarget.path.replace(/\\/g, '/').replace(/\/$/, '');
        const folderName = fmMoveTarget.name;
        const newSubfolderPath = `${destFolder}/${folderName}`;

        const targetEps = episodes.filter(ep => {
          const epPath = (ep.filePath || '').replace(/\\/g, '/');
          return epPath.startsWith(oldSubfolderPath + '/') || epPath === oldSubfolderPath;
        });

        const updatedList = [];
        for (const ep of targetEps) {
          const oldEpPath = (ep.filePath || '').replace(/\\/g, '/');
          const newEpPath = oldEpPath.replace(oldSubfolderPath, newSubfolderPath);
          const updatedEp = {
            ...ep,
            filePath: newEpPath,
            updatedAt: new Date().toISOString()
          };
          if (!isOffline && db && currentUser) {
            await updateDoc(doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', ep.id), updatedEp);
          } else {
            addToDirtyQueue({ type: 'SET_EPISODE', dedupeKey: `SET_EPISODE_${animeId}_${ep.id}`, payload: { animeId, ...updatedEp } });
          }
          upsertLocalEpisode(animeId, updatedEp);
          updatedList.push(updatedEp);
        }
        const mapById = new Map(updatedList.map(e => [e.id, e]));
        setEpisodes(prev => prev.map(e => mapById.get(e.id) || e));
      }

      setFmMoveTarget(null);
      setFmDestPath('');
    } catch (err) {
      console.error("Error moving item in Firestore:", err);
      alert("Error moving item: " + err.message);
    } finally {
      setFmLoading(false);
    }
  };

  const handleSaveAndRescanFileManager = async () => {
    setShowFileManagerModal(false);
    await handleRescan();
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

  // Group filtered episodes by folder (for rendering)
  const groupedEpisodes = {};
  filteredEpisodes.forEach(ep => {
    const folder = getSubfolder(ep.filePath, anime?.folderPath || '');
    if (!groupedEpisodes[folder]) {
      groupedEpisodes[folder] = [];
    }
    groupedEpisodes[folder].push(ep);
  });

  // Group ALL episodes by folder (unfiltered, for stable numbering)
  // sortEpisodes already ran when setting state, so `episodes` is sorted
  const allGroupedEpisodes = {};
  episodes.forEach(ep => {
    const folder = getSubfolder(ep.filePath, anime?.folderPath || '');
    if (!allGroupedEpisodes[folder]) {
      allGroupedEpisodes[folder] = [];
    }
    allGroupedEpisodes[folder].push(ep);
  });

  const sortedFolderKeys = Object.keys(groupedEpisodes).sort(sortFolders);

  // Confirmation modal state for Mark All Complete
  const [showMarkCompleteConfirm, setShowMarkCompleteConfirm] = useState(false);

  /**
   * Returns the stable display label for an episode based on its true
   * position inside the full (unfiltered) folder list.
   * Off-pattern files get "SP 01" labels; regular episodes get "EP 01".
   */
  const getEpisodeDisplayNumber = (ep, folderKey) => {
    const fullFolderList = allGroupedEpisodes[folderKey] || [];
    const trueIndex = fullFolderList.findIndex(e => e.id === ep.id);
    if (trueIndex === -1) {
      // Fallback if not found (shouldn't happen)
      return ep.isOffPattern ? 'SP ??' : `EP ??`;
    }
    const offPatternBefore = fullFolderList.slice(0, trueIndex).filter(e => e.isOffPattern).length;
    if (ep.isOffPattern) {
      return `SP ${String(trueIndex + 1).padStart(2, '0')}`;
    }
    return `EP ${String(trueIndex + 1 - offPatternBefore).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen text-white bg-transparent">
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
                  {anime.isYouTube && (
                    <span className="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      YouTube
                    </span>
                  )}
                  <span className="text-xs text-gray-500 font-normal hidden sm:inline">
                    ({anime.totalSeasons ? `Season ${anime.totalSeasons} • ` : ''}
                    {anime.totalEpisodes ? (
                      anime.episodeCount && anime.episodeCount !== Number(anime.totalEpisodes)
                        ? `${anime.episodeCount}/${anime.totalEpisodes} Episodes`
                        : `${anime.totalEpisodes} Episodes`
                    ) : `${anime.episodeCount || 0} Episodes`})
                  </span>
                </h1>
                <p className="text-[10px] text-gray-500 line-clamp-1 max-w-md">
                  {anime.folderPath}
                </p>
              </div>
            </div>

            {/* Desktop Resume button & progress */}
            <div className="hidden md:flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
              <div className="text-right">
                <div className="text-xs text-gray-400 mb-1">
                  Library Progress: <span className="font-semibold text-white">{effectiveProgressPercent}%</span>
                </div>
                <div className="w-32 md:w-40 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-neon-gradient shadow-purple-glow rounded-full"
                    style={{ width: `${effectiveProgressPercent}%` }}
                  />
                </div>
              </div>

              {effectiveProgressPercent !== 100 && (
                <button
                  onClick={() => setShowMarkCompleteConfirm(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/40 hover:bg-emerald-500 text-emerald-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all shadow-inner whitespace-nowrap"
                >
                  <CheckCheck size={14} />
                  Mark Complete
                </button>
              )}

              <button
                onClick={() => handleRescan()}
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

            {/* Mobile Collapsible Actions Block */}
            <div className="flex md:hidden flex-col w-full gap-2 mt-2 bg-white/5 p-3.5 rounded-2xl border border-white/10 shadow-lg">
              <div 
                onClick={() => setActionsCollapsed(!actionsCollapsed)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex-1">
                  <div className="text-[11px] text-gray-400 mb-1 flex justify-between items-center pr-2">
                    <span>Watch Progress</span>
                    <span className="font-bold text-neonCyan">{effectiveProgressPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-neon-gradient shadow-purple-glow rounded-full"
                      style={{ width: `${effectiveProgressPercent}%` }}
                    />
                  </div>
                </div>
                <div className="p-1 text-gray-400 hover:text-white ml-3 shrink-0 transition-transform duration-200">
                  {actionsCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </div>
              </div>

              <AnimatePresence>
                {!actionsCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-col gap-2 pt-2 border-t border-white/5 overflow-hidden"
                  >
                    <button
                      onClick={handleResumeAnime}
                      className="w-full py-2.5 rounded-xl bg-neon-gradient hover:brightness-110 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-purple-glow"
                    >
                      <Play size={14} fill="currentColor" />
                      Resume Tracking
                    </button>

                    <button
                      onClick={() => handleRescan()}
                      className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 hover:text-neonCyan text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RefreshCw size={14} />
                      Rescan Folder
                    </button>

                    {effectiveProgressPercent !== 100 && (
                      <button
                        onClick={() => setShowMarkCompleteConfirm(true)}
                        className="w-full py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 hover:bg-emerald-500 text-emerald-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CheckCheck size={14} />
                        Mark Complete
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left column: Episode list */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Paired Playback Target Toggle (PC Host vs Mobile Stream) */}
          {streamPairing && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl shadow-lg">
              <div className="flex items-center gap-2">
                <Wifi size={16} className="text-neonCyan animate-pulse" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Playback Target:
                </span>
                <span className="text-[11px] text-gray-400 font-mono">
                  ({streamPairing.deviceName || 'Paired Local Hotspot'})
                </span>
              </div>

              <div className="flex items-center p-1 bg-black/60 rounded-xl border border-white/10 text-xs w-full sm:w-auto">
                <button
                  onClick={() => setStreamTarget('host')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold transition ${
                    streamTarget === 'host'
                      ? 'bg-gradient-to-r from-[#7c5cff] to-[#a855f7] text-white shadow-md'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Laptop size={14} /> Play on PC Host (VLC)
                </button>
                <button
                  onClick={() => setStreamTarget('mobile')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold transition ${
                    streamTarget === 'mobile'
                      ? 'bg-gradient-to-r from-[#7c5cff] to-[#a855f7] text-white shadow-md'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Smartphone size={14} /> Stream to Mobile
                </button>
              </div>
            </div>
          )}

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
                            // Stable display number — always based on the full unfiltered folder list
                            const displayNumber = getEpisodeDisplayNumber(ep, folderKey);
                            
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
                                        ep.isWatched ? 'text-emerald-400' : ep.isOffPattern ? 'text-amber-400' : 'text-neonCyan'
                                      }`}>
                                        {displayNumber}
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
            <div className="glass-panel p-6 rounded-2xl border border-white/5 text-gray-400 text-xs space-y-3">
              <button
                onClick={() => setHelperExpanded(!helperExpanded)}
                className="w-full flex items-center justify-between font-bold text-white uppercase tracking-wider text-[10px] text-left text-neonPurple hover:text-white transition cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Film size={14} />
                  Desktop Playback Helper
                </span>
                {helperExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {helperExpanded && (
                <div className="space-y-3 pt-2 border-t border-white/5 leading-relaxed">
                  <p>
                    Clicking the play button launches the episode in the native VLC media player on your machine.
                  </p>
                  <p>
                    <strong>Progress Syncing:</strong> As you watch, playback status is queried in the background and stored locally. Closing VLC automatically pushes your resume position to Firestore.
                  </p>
                  <p>
                    <strong>Auto-Complete:</strong> Once you watch past 90% of the video duration, the episode is marked as completed automatically.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quick flags list */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-3">
            <button
              onClick={() => setFlagsExpanded(!flagsExpanded)}
              className="w-full flex items-center justify-between font-bold text-white uppercase tracking-wider text-[10px] text-left text-neonPink hover:text-white transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Bookmark size={14} />
                Available Flags Info
              </span>
              {flagsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {flagsExpanded && (
              <div className="flex flex-col gap-2.5 pt-2 border-t border-white/5">
                {FLAG_TYPES.map(flag => {
                  const Icon = flag.icon;
                  return (
                    <div key={flag.name} className="flex items-center gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded border text-[9px] font-bold flex items-center gap-1 ${flag.color}`}>
                        <Icon size={8} />
                        {flag.name}
                      </span>
                      <span className="text-gray-500 text-[11px]">
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
            )}
          </div>

          {/* VLC Controls & Rating widget */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
            <button
              onClick={() => setRatingExpanded(!ratingExpanded)}
              className="w-full flex items-center justify-between font-bold text-white uppercase tracking-wider text-[10px] text-left text-neonPurple hover:text-white transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Star size={14} className="text-neonPurple animate-pulse" />
                Media Controls & Rating
              </span>
              {ratingExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {ratingExpanded && (
              <div className="space-y-4 pt-2 border-t border-white/5 text-xs text-gray-400">
                {/* VLC Controls */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-white text-[11px] uppercase tracking-wider">Media PLayer Setting</h4>
                  
                  {/* Playback Speed */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span>Playback Speed</span>
                      <span className="text-neonCyan font-bold">{playbackSpeed.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="5.0"
                      step="0.1"
                      value={playbackSpeed}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setPlaybackSpeed(val);
                        localStorage.setItem('watchanime_vlc_speed', String(val));
                      }}
                      className="w-full accent-neonCyan h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Playback Volume */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span>Initial Volume</span>
                      <span className="text-neonPink font-bold">{playbackVolume}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="5"
                      value={playbackVolume}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setPlaybackVolume(val);
                        localStorage.setItem('watchanime_vlc_volume', String(val));
                      }}
                      className="w-full accent-neonPink h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Default Media Player Selector */}
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="flex items-center gap-1 font-semibold text-white">
                        <Tv size={12} className="text-neonCyan" /> Default Media Player
                      </span>
                    </div>
                    <select
                      value={currentUser?.defaultPlayer || 'ask'}
                      onChange={(e) => updateDefaultPlayer && updateDefaultPlayer(e.target.value)}
                      className="w-full bg-white/10 border border-white/15 text-xs text-white rounded-xl p-2 font-semibold focus:outline-none focus:border-neonCyan cursor-pointer"
                    >
                      <option value="ask" className="bg-gray-900 text-white">Ask Every Time (Modal)</option>
                      <option value="mediaserver" className="bg-gray-900 text-white">Media Server Player (Windows Host)</option>
                      <option value="vlc" className="bg-gray-900 text-white">VLC Player (Desktop Host)</option>
                      <option value="youtube" className="bg-gray-900 text-white">YouTube Embed</option>
                    </select>
                  </div>
                  
                  {/* YouTube Quality Selector */}
                  {(anime?.isYouTube || episodes.some(e => e.isYouTube || e.filePath?.startsWith('youtube://'))) && (
                    <div className="space-y-1.5 pt-2 border-t border-white/5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="flex items-center gap-1 font-semibold text-red-400">
                          <Youtube size={12} /> YouTube Streaming Quality
                        </span>
                        <button
                          type="button"
                          onClick={handleFetchYtWidgetQualities}
                          disabled={ytWidgetLoadingQualities}
                          className="px-2 py-0.5 text-[9px] font-bold bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-lg transition cursor-pointer flex items-center gap-1"
                        >
                          <RefreshCw size={10} className={ytWidgetLoadingQualities ? 'animate-spin' : ''} />
                          {ytWidgetLoadingQualities ? 'Detecting...' : 'Fetch Formats'}
                        </button>
                      </div>
                      <select
                        value={ytWidgetSelectedQuality}
                        onChange={(e) => setYtWidgetSelectedQuality(e.target.value)}
                        className="w-full bg-white/10 border border-white/15 text-xs text-white rounded-xl p-2 font-semibold focus:outline-none focus:border-neonCyan cursor-pointer"
                      >
                        {ytWidgetQualities.map((q) => (
                          <option key={q.id} value={q.id} className="bg-gray-900 text-white">
                            {q.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Rating & Popularity Section */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-white text-[11px] uppercase tracking-wider">
                      Rating & Popularity
                    </h4>
                    <button
                      type="button"
                      onClick={handleFetchMalRating}
                      disabled={fetchingMalRating}
                      className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-gradient-to-r from-purple-600/30 to-indigo-600/30 hover:from-purple-600/50 hover:to-indigo-600/50 text-purple-200 border border-purple-500/30 hover:border-purple-400/50 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Fetch official rating and popularity from MyAnimeList / Jikan"
                    >
                      <RefreshCw size={11} className={fetchingMalRating ? 'animate-spin' : ''} />
                      {fetchingMalRating ? 'Fetching...' : 'Fetch from MAL / Jikan'}
                    </button>
                  </div>

                  {/* Rating display & info badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 font-extrabold text-xs">
                      <Star size={13} className="fill-amber-400" />
                      <span>{anime?.rating ? `${parseFloat(anime.rating).toFixed(1)} / 10` : 'Not Rated'}</span>
                    </div>

                    {(anime?.malPopularity || anime?.popularity) && (
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-bold text-[11px]">
                        <span>Popularity: {anime.malPopularity || anime.popularity}</span>
                      </div>
                    )}

                    {anime?.malRank && (
                      <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-pink-500/10 border border-pink-500/30 text-pink-300 font-bold text-[11px]">
                        <span>Rank: {anime.malRank}</span>
                      </div>
                    )}

                    {anime?.malMembers > 0 && (
                      <div className="text-[10px] text-gray-400">
                        ({(anime.malMembers / 1000).toFixed(0)}k members)
                      </div>
                    )}
                  </div>

                  {fetchRatingMessage && (
                    <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      <span>{fetchRatingMessage}</span>
                    </div>
                  )}

                  {/* Manual Rating Slider */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>Manual Adjust</span>
                      <span className="text-amber-400 font-semibold">{anime?.rating ? parseFloat(anime.rating).toFixed(1) : '8.0'}</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="10.0"
                      step="0.1"
                      value={anime?.rating ? parseFloat(anime.rating) : 8.0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        handleSaveRating(val);
                      }}
                      className="w-full accent-amber-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-gray-500 font-bold uppercase tracking-wider">
                      <span>1.0 min</span>
                      <span>5.0 avg</span>
                      <span>10.0 max</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Manage Folder Section */}
          <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4">
            <button
              onClick={() => setManageFolderExpanded(!manageFolderExpanded)}
              className="w-full flex items-center justify-between font-bold text-white uppercase tracking-wider text-[10px] text-left text-neonCyan hover:text-white transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <FolderTree size={14} className="text-neonCyan animate-pulse" />
                Manage Folder
              </span>
              {manageFolderExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {manageFolderExpanded && (
              <div className="space-y-4 pt-2 border-t border-white/5 text-xs text-gray-400">
                {/* 1. Manage Folder Button */}
                {!(anime?.isYouTube || anime?.folderPath?.startsWith('http')) && (
                  <button
                    onClick={openFileManagerModal}
                    className="w-full py-2.5 px-4 rounded-xl bg-neonCyan/10 border border-neonCyan/30 hover:bg-neonCyan/20 text-neonCyan hover:text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-lg"
                  >
                    <FolderPlus size={16} />
                    Manage Folder Files & Subfolders
                  </button>
                )}

                {/* 2. Rescan Folder with different Naming Pattern */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <h4 className="font-semibold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <RefreshCw size={12} className="text-neonPurple" />
                    Rescan with Naming Pattern
                  </h4>
                  <div className="space-y-2">
                    <select
                      value={selectedNamingPattern}
                      onChange={(e) => setSelectedNamingPattern(e.target.value)}
                      className="w-full bg-white/10 border border-white/15 text-xs text-white rounded-xl p-2 font-semibold focus:outline-none focus:border-neonCyan cursor-pointer"
                    >
                      <option value="Auto" className="bg-gray-900 text-white">Auto-Detect Pattern (Recommended)</option>
                      <option value="S01E01" className="bg-gray-900 text-white">Season / Episode (S01E01, S1E1)</option>
                      <option value="Episode 01" className="bg-gray-900 text-white">Episode Tag (Episode 01, Ep 01)</option>
                      <option value="01 - Title" className="bg-gray-900 text-white">Prefix Number (01 - Title, 01.Title)</option>
                      <option value="Numeric" className="bg-gray-900 text-white">Pure Numeric (1, 2, 3)</option>
                    </select>

                    <button
                      onClick={() => handleRescan(selectedNamingPattern)}
                      className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition"
                    >
                      <RefreshCw size={14} />
                      Rescan Folder
                    </button>
                  </div>
                </div>

                {/* 3. Refetch Duration for YouTube playlists */}
                {(anime?.isYouTube || episodes.some(e => e.isYouTube || e.filePath?.startsWith('youtube://'))) && (
                  <div className="space-y-2 pt-2 border-t border-white/5">
                    <h4 className="font-semibold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={12} className="text-yellow-400" />
                      YouTube Duration
                    </h4>
                    {refetchDurationProgress ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[10px] text-gray-400">
                          <span>Fetching {refetchDurationProgress.done}/{refetchDurationProgress.total}</span>
                          <span className="text-yellow-400 font-bold">{Math.round((refetchDurationProgress.done / refetchDurationProgress.total) * 100)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-yellow-500 to-orange-400 rounded-full transition-all duration-300"
                            style={{ width: `${(refetchDurationProgress.done / refetchDurationProgress.total) * 100}%` }}
                          />
                        </div>
                        {refetchDurationProgress.current && (
                          <p className="text-[10px] text-gray-500 truncate">{refetchDurationProgress.current}</p>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={handleRefetchAllDurations}
                        className="w-full py-2 px-3 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition"
                      >
                        <Clock size={14} />
                        Refetch Duration of All Videos
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
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

      {/* Fetching YouTube Duration Modal */}
      <AnimatePresence>
        {fetchingDuration && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-panel p-8 rounded-2xl border border-white/20 max-w-sm w-full text-center space-y-4"
            >
              <div className="mx-auto w-12 h-12 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
              <h3 className="text-white font-bold text-sm">Fetching Video Duration</h3>
              <p className="text-gray-400 text-xs">
                Getting the total duration for this YouTube video so the player shows accurate progress. This is a one-time fetch.
              </p>
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
              <p className="text-xs text-gray-400 truncate mt-3 mb-4 bg-white/5 p-2 rounded border border-white/5" title={promptPlayEp.fileName}>
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

              {/* Check if prompt episode is YouTube or local storage */}
              {(() => {
                const isPromptYt = !!(
                  promptPlayEp.isYouTube ||
                  promptPlayEp.filePath?.startsWith('youtube://') ||
                  anime?.isYouTube ||
                  anime?.folderPath?.startsWith('http') ||
                  anime?.folderPath?.startsWith('youtube://')
                );

                return (
                  <>
                    {/* Quality selector for YouTube */}
                    {isPromptYt && (
                      <div className="bg-black/40 p-3 rounded-xl border border-white/10 text-left space-y-1.5 mb-4">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                            <Youtube size={14} /> YouTube Streaming Quality
                          </label>
                          <button
                            type="button"
                            onClick={handleFetchYtModalQualities}
                            disabled={ytModalLoadingQualities}
                            className="px-2 py-0.5 text-[10px] font-bold bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-lg transition cursor-pointer flex items-center gap-1"
                          >
                            <RefreshCw size={10} className={ytModalLoadingQualities ? 'animate-spin' : ''} />
                            {ytModalLoadingQualities ? 'Detecting...' : 'Fetch Server Formats'}
                          </button>
                        </div>

                        <select
                          value={ytModalSelectedQuality}
                          onChange={(e) => setYtModalSelectedQuality(e.target.value)}
                          className="w-full bg-white/10 border border-white/15 text-xs text-white rounded-xl p-2 font-semibold focus:outline-none focus:border-neonCyan cursor-pointer"
                        >
                          {ytModalQualities.map((q) => (
                            <option key={q.id} value={q.id} className="bg-gray-900 text-white">
                              {q.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid gap-4 mb-6 grid-cols-1 sm:grid-cols-2 max-w-md mx-auto">
                      {isPromptYt ? (
                        <>
                          {/* 1. YouTube Embed Player */}
                          <button
                            type="button"
                            onClick={() => playInYoutube(promptPlayEp)}
                            className="p-6 rounded-2xl bg-red-500/10 border border-red-500/30 hover:border-red-400 text-red-300 hover:text-white hover:bg-red-500/20 transition-all duration-300 flex flex-col items-center justify-center gap-3 cursor-pointer group hover:shadow-[0_0_25px_rgba(239,68,68,0.35)]"
                          >
                            <div className="p-3.5 rounded-2xl bg-red-500/20 group-hover:bg-red-500/30 transition-colors">
                              <Youtube size={28} className="text-red-400" />
                            </div>
                            <div className="text-center">
                              <span className="text-xs font-black uppercase tracking-widest block text-white">YouTube Embed</span>
                              <span className="text-[10px] text-gray-400 font-medium">Native IFrame Player</span>
                            </div>
                          </button>

                          {/* 2. YT-DLP Player */}
                          <button
                            type="button"
                            onClick={() => playInYtDlp(promptPlayEp)}
                            className="p-6 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 hover:text-white hover:bg-cyan-500/20 transition-all duration-300 flex flex-col items-center justify-center gap-3 cursor-pointer group hover:shadow-[0_0_25px_rgba(6,182,212,0.35)]"
                          >
                            <div className="p-3.5 rounded-2xl bg-cyan-500/20 group-hover:bg-cyan-500/30 transition-colors">
                              <Server size={28} className="text-cyan-400" />
                            </div>
                            <div className="text-center">
                              <span className="text-xs font-black uppercase tracking-widest block text-white">YT-DLP Player</span>
                              <span className="text-[10px] text-gray-400 font-medium">Custom Media Engine</span>
                            </div>
                          </button>
                        </>
                      ) : (
                        <>
                          {/* 1. Media Server Player Card (Local Media) */}
                          <button
                            type="button"
                            onClick={() => playInMediaServer(promptPlayEp)}
                            className="p-6 rounded-2xl bg-purple-500/10 border border-purple-500/30 hover:border-purple-400 text-purple-300 hover:text-white hover:bg-purple-500/20 transition-all duration-300 flex flex-col items-center justify-center gap-3 cursor-pointer group hover:shadow-[0_0_25px_rgba(168,85,247,0.35)]"
                          >
                            <div className="p-3.5 rounded-2xl bg-purple-500/20 group-hover:bg-purple-500/30 transition-colors">
                              <Server size={28} className="text-purple-400" />
                            </div>
                            <div className="text-center">
                              <span className="text-xs font-black uppercase tracking-widest block text-white">Media Server Player</span>
                              <span className="text-[10px] text-gray-400 font-medium">Windows Media Streaming</span>
                            </div>
                          </button>

                          {/* 2. VLC Player Card (Local Media) */}
                          <button
                            type="button"
                            onClick={() => playInVlc(promptPlayEp)}
                            className="p-6 rounded-2xl bg-orange-500/10 border border-orange-500/30 hover:border-orange-400 text-orange-300 hover:text-white hover:bg-orange-500/20 transition-all duration-300 flex flex-col items-center justify-center gap-3 cursor-pointer group hover:shadow-[0_0_25px_rgba(249,115,22,0.35)]"
                          >
                            <div className="p-3.5 rounded-2xl bg-orange-500/20 group-hover:bg-orange-500/30 transition-colors">
                              <VLCIcon className="w-7 h-7" />
                            </div>
                            <div className="text-center">
                              <span className="text-xs font-black uppercase tracking-widest block text-white">VLC Player</span>
                              <span className="text-[10px] text-gray-400 font-medium">External Desktop Player</span>
                            </div>
                          </button>
                        </>
                      )}
                    </div>
                  </>
                );
              })()}

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

      {/* Folder Rescan Status & Multi-Option Sync Modal */}
      <AnimatePresence>
        {showRescanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-2xl glass-panel p-5 sm:p-6 rounded-2xl border border-white/15 shadow-neon-border text-left space-y-4 max-h-[92vh] flex flex-col my-auto"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-start border-b border-white/10 pb-3.5 shrink-0">
                <div>
                  <h2 className="text-base sm:text-lg font-black flex items-center gap-2 text-white">
                    <RefreshCw className={`text-neonCyan ${rescanStatus === 'scanning' || rescanStatus === 'applying' ? 'animate-spin' : ''}`} size={20} />
                    {rescanStatus === 'preview' ? 'Folder Rescan Results & Sync Options' : 'Rescan Folder & Playlist'}
                  </h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {rescanStatus === 'preview'
                      ? 'Review discovered changes and choose how your library should be updated.'
                      : 'Scanning your disk and checking for library differences...'}
                  </p>
                </div>
                {rescanStatus !== 'scanning' && rescanStatus !== 'applying' && (
                  <button
                    onClick={() => setShowRescanModal(false)}
                    className="p-1.5 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* Scanning / Applying State */}
              {(rescanStatus === 'scanning' || rescanStatus === 'applying') && (
                <div className="bg-black/40 border border-white/10 rounded-xl p-5 space-y-3 text-xs my-auto">
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="animate-spin text-neonCyan" size={18} />
                    <span className="font-bold text-gray-100 text-sm">
                      {rescanStatus === 'scanning' ? 'Scanning directory / playlist...' : 'Applying updates to library & cloud...'}
                    </span>
                  </div>
                  <div className="p-3 bg-black/60 rounded-lg border border-white/5 font-mono text-[11px] text-neonCyan/90">
                    {rescanMessage}
                  </div>
                </div>
              )}

              {/* Preview Diff & Multi-Option Sync State */}
              {rescanStatus === 'preview' && rescanDiff && (
                <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-2.5 text-center">
                      <span className="block text-xl font-black text-emerald-400">+{rescanDiff.newEpisodes.length}</span>
                      <span className="text-[10px] text-emerald-300/80 font-medium">New Episodes</span>
                    </div>

                    <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-xl p-2.5 text-center">
                      <span className="block text-xl font-black text-neonCyan">+{rescanDiff.addedFolders.length}</span>
                      <span className="text-[10px] text-cyan-300/80 font-medium">New Folders</span>
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/25 rounded-xl p-2.5 text-center">
                      <span className="block text-xl font-black text-blue-400">{rescanDiff.retainedEpisodes.length}</span>
                      <span className="text-[10px] text-blue-300/80 font-medium">Existing Kept</span>
                    </div>

                    <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-2.5 text-center">
                      <span className="block text-xl font-black text-red-400">-{rescanDiff.removedEpisodes.length}</span>
                      <span className="text-[10px] text-red-300/80 font-medium">Missing / Removed</span>
                    </div>
                  </div>

                  {/* Sync Mode Selection Options */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block flex items-center gap-1.5">
                      <SlidersHorizontal size={13} className="text-neonPurple" />
                      Select Sync Behavior:
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Option 1: Update Normally (Full Sync) */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('normal')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          rescanSyncMode === 'normal'
                            ? 'bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border-cyan-400/80 shadow-[0_0_15px_rgba(6,182,212,0.25)] text-white'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-black text-xs flex items-center gap-1.5 text-white">
                            <RefreshCw size={14} className={rescanSyncMode === 'normal' ? 'text-neonCyan animate-spin-slow' : 'text-gray-400'} />
                            Update Normally
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            Full Sync
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Add <span className="text-emerald-400 font-bold">+{rescanDiff.newEpisodes.length}</span> new episodes and clean <span className="text-red-400 font-bold">-{rescanDiff.removedEpisodes.length}</span> missing items.
                        </p>
                      </button>

                      {/* Option 2: Only Update New Episodes (Safe Add) */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('new_only')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          rescanSyncMode === 'new_only'
                            ? 'bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-emerald-400/80 shadow-[0_0_15px_rgba(16,185,129,0.25)] text-white'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-black text-xs flex items-center gap-1.5 text-white">
                            <PlusCircle size={14} className={rescanSyncMode === 'new_only' ? 'text-emerald-400' : 'text-gray-400'} />
                            Only New Episodes
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Safe Add
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Add <span className="text-emerald-400 font-bold">+{rescanDiff.newEpisodes.length}</span> new files. Keeps all <span className="text-gray-200 font-bold">{rescanDiff.removedEpisodes.length}</span> missing items untouched.
                        </p>
                      </button>

                      {/* Option 3: Only Update Deleted Items */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('deleted_only')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          rescanSyncMode === 'deleted_only'
                            ? 'bg-gradient-to-br from-red-500/20 to-rose-600/20 border-red-400/80 shadow-[0_0_15px_rgba(239,68,68,0.25)] text-white'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-black text-xs flex items-center gap-1.5 text-white">
                            <Trash2 size={14} className={rescanSyncMode === 'deleted_only' ? 'text-red-400' : 'text-gray-400'} />
                            Only Deleted Items
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/30">
                            Clean Only
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Remove <span className="text-red-400 font-bold">-{rescanDiff.removedEpisodes.length}</span> deleted items. Will <span className="text-gray-400 font-semibold">skip</span> adding new episodes.
                        </p>
                      </button>

                      {/* Option 4: Custom Granular Checkboxes */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('custom')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          rescanSyncMode === 'custom'
                            ? 'bg-gradient-to-br from-purple-500/20 to-indigo-600/20 border-purple-400/80 shadow-[0_0_15px_rgba(168,85,247,0.25)] text-white'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-black text-xs flex items-center gap-1.5 text-white">
                            <CheckSquare size={14} className={rescanSyncMode === 'custom' ? 'text-purple-400' : 'text-gray-400'} />
                            Custom Selection
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Checkboxes
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Manually select / unselect individual episodes and folders below.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Summary Live Calculation Pill */}
                  <div className="bg-black/50 border border-white/10 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400">Action Plan:</span>
                      <span className="text-emerald-400 font-bold">+{selectedNewEpIds.size} to add</span>
                      <span className="text-red-400 font-bold">-{selectedRemovedEpIds.size} to remove</span>
                    </div>
                    <div className="text-gray-300 font-medium">
                      Library Total: <span className="text-neonCyan font-bold">{episodes.length}</span> → <span className="text-white font-black">{episodes.length - selectedRemovedEpIds.size + selectedNewEpIds.size}</span> eps
                    </div>
                  </div>

                  {/* Interactive Details Filter Tabs */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setRescanActiveTab('all')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            rescanActiveTab === 'all' ? 'bg-white/20 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          All Items
                        </button>
                        <button
                          type="button"
                          onClick={() => setRescanActiveTab('new')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                            rescanActiveTab === 'new' ? 'bg-emerald-500/30 text-emerald-300 shadow-sm' : 'text-gray-400 hover:text-emerald-400'
                          }`}
                        >
                          <Sparkles size={12} />
                          New ({rescanDiff.newEpisodes.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRescanActiveTab('removed')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                            rescanActiveTab === 'removed' ? 'bg-red-500/30 text-red-300 shadow-sm' : 'text-gray-400 hover:text-red-400'
                          }`}
                        >
                          <Trash2 size={12} />
                          Missing ({rescanDiff.removedEpisodes.length})
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {rescanActiveTab === 'new' && rescanDiff.newEpisodes.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSelectAllNew(true)}
                              className="text-[10px] text-emerald-400 hover:underline font-semibold cursor-pointer"
                            >
                              Select All
                            </button>
                            <span className="text-gray-600">|</span>
                            <button
                              type="button"
                              onClick={() => handleSelectAllNew(false)}
                              className="text-[10px] text-gray-400 hover:text-white font-semibold cursor-pointer"
                            >
                              Deselect All
                            </button>
                          </>
                        )}
                        {rescanActiveTab === 'removed' && rescanDiff.removedEpisodes.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSelectAllRemoved(true)}
                              className="text-[10px] text-red-400 hover:underline font-semibold cursor-pointer"
                            >
                              Select All (Delete)
                            </button>
                            <span className="text-gray-600">|</span>
                            <button
                              type="button"
                              onClick={() => handleSelectAllRemoved(false)}
                              className="text-[10px] text-gray-400 hover:text-white font-semibold cursor-pointer"
                            >
                              Keep All (Don't Delete)
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Scrollable Item Breakdown List */}
                    <div className="max-h-[220px] overflow-y-auto bg-black/60 rounded-xl border border-white/10 p-3 space-y-3">
                      {/* Section: New Episodes */}
                      {(rescanActiveTab === 'all' || rescanActiveTab === 'new') && rescanDiff.newEpisodes.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400">
                            <span className="flex items-center gap-1.5">
                              <Sparkles size={13} /> New Episodes Discovered ({rescanDiff.newEpisodes.length}):
                            </span>
                            <div className="flex items-center gap-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => handleSelectAllNew(true)}
                                className="text-emerald-400 hover:underline cursor-pointer"
                              >
                                Check All
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectAllNew(false)}
                                className="text-gray-400 hover:text-white cursor-pointer"
                              >
                                Uncheck All
                              </button>
                            </div>
                          </div>

                          {/* New Folders Badges */}
                          {rescanDiff.addedFolders.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 py-1">
                              {rescanDiff.addedFolders.map(folder => (
                                <span key={folder} className="text-[10px] bg-cyan-500/20 text-neonCyan border border-cyan-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono">
                                  <FolderPlus size={10} /> New Folder: {folder}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="space-y-1">
                            {rescanDiff.newEpisodes.map(ep => {
                              const isChecked = selectedNewEpIds.has(ep.id);
                              const subf = getSubfolder(ep.filePath, anime?.folderPath || '');
                              return (
                                <div
                                  key={ep.id}
                                  onClick={() => handleToggleNewEpisode(ep.id)}
                                  className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer select-none text-[11px] ${
                                    isChecked
                                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                      : 'bg-white/5 border-white/5 text-gray-500 opacity-60 hover:opacity-90'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}} // Handled by container onClick
                                      className="accent-emerald-500 w-4 h-4 rounded cursor-pointer shrink-0"
                                    />
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white shrink-0">
                                      EP {ep.episodeNumber || '?'}
                                    </span>
                                    {subf && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-neonCyan truncate max-w-[120px]">
                                        📁 {subf}
                                      </span>
                                    )}
                                    <span className="truncate font-mono text-gray-200" title={ep.fileName}>
                                      {ep.fileName}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-bold text-emerald-400 shrink-0 ml-2">
                                    {isChecked ? '+ Will Add' : 'Skipped'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Section: Missing / Removed Episodes */}
                      {(rescanActiveTab === 'all' || rescanActiveTab === 'removed') && rescanDiff.removedEpisodes.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-white/5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-red-400">
                            <span className="flex items-center gap-1.5">
                              <Trash2 size={13} /> Missing / Deleted Items on PC ({rescanDiff.removedEpisodes.length}):
                            </span>
                            <div className="flex items-center gap-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => handleSelectAllRemoved(true)}
                                className="text-red-400 hover:underline cursor-pointer"
                              >
                                Select All (Delete)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectAllRemoved(false)}
                                className="text-gray-400 hover:text-white cursor-pointer"
                              >
                                Keep All
                              </button>
                            </div>
                          </div>

                          {/* Removed Folders Badges */}
                          {rescanDiff.removedFolders.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 py-1">
                              {rescanDiff.removedFolders.map(folder => (
                                <span key={folder} className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono">
                                  <FolderMinus size={10} /> Deleted Folder: {folder}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="space-y-1">
                            {rescanDiff.removedEpisodes.map(ep => {
                              const isChecked = selectedRemovedEpIds.has(ep.id);
                              const subf = getSubfolder(ep.filePath, anime?.folderPath || '');
                              return (
                                <div
                                  key={ep.id}
                                  onClick={() => handleToggleRemovedEpisode(ep.id)}
                                  className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer select-none text-[11px] ${
                                    isChecked
                                      ? 'bg-red-500/10 border-red-500/30 text-red-200'
                                      : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300/80'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}} // Handled by container onClick
                                      className="accent-red-500 w-4 h-4 rounded cursor-pointer shrink-0"
                                    />
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white shrink-0">
                                      EP {ep.episodeNumber || '?'}
                                    </span>
                                    {subf && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 truncate max-w-[120px]">
                                        📁 {subf}
                                      </span>
                                    )}
                                    <span className="truncate font-mono text-gray-300" title={ep.fileName}>
                                      {ep.fileName}
                                    </span>
                                    {ep.isWatched && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold shrink-0">
                                        Watched
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-bold shrink-0 ml-2">
                                    {isChecked ? (
                                      <span className="text-red-400">- Will Delete</span>
                                    ) : (
                                      <span className="text-emerald-400">🛡️ Keep in Library</span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Clean state / No changes */}
                      {rescanDiff.newEpisodes.length === 0 && rescanDiff.removedEpisodes.length === 0 && (
                        <div className="text-center py-6 text-gray-400 text-xs space-y-1">
                          <CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-1" />
                          <p className="font-bold text-gray-200">No file or folder changes detected.</p>
                          <p className="text-[11px] text-gray-500">Your WatchAnime library is 100% in sync with your local folder / playlist.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Consent & Action Buttons */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/10 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowRescanModal(false)}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold cursor-pointer transition text-center"
                    >
                      Cancel
                    </button>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleApplyRescanChanges}
                        disabled={selectedNewEpIds.size === 0 && selectedRemovedEpIds.size === 0 && (rescanDiff.newEpisodes.length > 0 || rescanDiff.removedEpisodes.length > 0)}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neon-gradient hover:brightness-110 text-white text-xs font-black uppercase tracking-wider shadow-purple-glow cursor-pointer flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {rescanSyncMode === 'normal' && (
                          <>
                            <RefreshCw size={14} />
                            Update Normally (+{selectedNewEpIds.size}, -{selectedRemovedEpIds.size})
                          </>
                        )}
                        {rescanSyncMode === 'new_only' && (
                          <>
                            <PlusCircle size={14} />
                            Add {selectedNewEpIds.size} New Only (Keep Missing)
                          </>
                        )}
                        {rescanSyncMode === 'deleted_only' && (
                          <>
                            <Trash2 size={14} />
                            Remove {selectedRemovedEpIds.size} Missing Only
                          </>
                        )}
                        {rescanSyncMode === 'custom' && (
                          <>
                            <Check size={14} />
                            Apply Custom Selection (+{selectedNewEpIds.size}, -{selectedRemovedEpIds.size})
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Completed / Error State */}
              {(rescanStatus === 'completed' || rescanStatus === 'error') && (
                <div className="space-y-4 my-auto">
                  <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3 text-xs">
                    <div className="flex items-center gap-2">
                      {rescanStatus === 'completed' ? (
                        <CheckCircle2 className="text-emerald-400" size={18} />
                      ) : (
                        <AlertTriangle className="text-red-400" size={18} />
                      )}
                      <span className="font-bold text-gray-100 text-sm">
                        {rescanStatus === 'completed' ? 'Rescan updates applied successfully!' : 'Rescan failed'}
                      </span>
                    </div>

                    <div className="p-3 bg-black/60 rounded-lg border border-white/5 font-mono text-[11px] text-gray-300">
                      {rescanMessage}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRescanModal(false)}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-neon-gradient text-white text-xs font-black uppercase tracking-wider hover:brightness-110 shadow-purple-glow cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* ── Mark All Complete Confirmation Modal ──────────────────────── */}
      <AnimatePresence>
        {showMarkCompleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.93, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full max-w-sm glass-panel p-6 rounded-2xl border border-emerald-500/20 shadow-neon-border"
            >
              {/* Icon + Title */}
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                  <CheckCheck className="text-emerald-400" size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base tracking-wide">Mark All as Watched?</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">This action affects all episodes</p>
                </div>
              </div>

              {/* Body */}
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 mb-5 space-y-2">
                <p className="text-sm text-gray-300 leading-relaxed">
                  All <span className="font-bold text-white">{anime?.episodeCount || episodes.length}</span> episodes
                  of <span className="font-bold text-emerald-400">{anime?.title}</span> will be marked as
                  watched and the library progress will be set to&nbsp;
                  <span className="font-bold text-white">100%</span>.
                </p>
                <p className="text-[11px] text-amber-400/80 flex items-center gap-1.5">
                  <AlertTriangle size={11} />
                  This cannot be undone in bulk — individual episodes can still be toggled.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowMarkCompleteConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-xs font-bold uppercase tracking-wider cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowMarkCompleteConfirm(false);
                    handleMarkAllWatched();
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold uppercase tracking-wider cursor-pointer transition shadow-inner"
                >
                  Yes, Mark All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Mobile Stream Player Choice Modal ────────────────────────────── */}
      <AnimatePresence>
        {streamPlayerModalEp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/20 flex flex-col items-center gap-4 text-center relative shadow-2xl"
            >
              <button
                onClick={() => setStreamPlayerModalEp(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-gray-300 hover:text-white transition"
              >
                <X size={18} />
              </button>

              <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-[#7c5cff] to-[#a855f7] text-white shadow-lg shadow-[#7c5cff]/30">
                <Smartphone size={28} />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Stream Episode to Mobile</h3>
                <p className="text-xs text-gray-400">
                  {streamPlayerModalEp.fileName || `Episode ${streamPlayerModalEp.episodeNumber}`}
                </p>
                <p className="text-[11px] text-[#a855f7] font-semibold pt-1">
                  Select player to begin mobile streaming:
                </p>
              </div>

              <div className="w-full flex flex-col gap-3 pt-2">
                {!(streamPlayerModalEp.isYouTube || streamPlayerModalEp.filePath?.startsWith('youtube://')) && (
                  <button
                    onClick={() => {
                      const ep = streamPlayerModalEp;
                      setStreamPlayerModalEp(null);
                      playInMediaServer(ep);
                    }}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 hover:brightness-110 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg cursor-pointer"
                  >
                    <Server size={16} className="text-violet-200" />
                    Media Server Player (Windows Host)
                  </button>
                )}

                {(streamPlayerModalEp.isYouTube || streamPlayerModalEp.filePath?.startsWith('youtube://')) && (
                  <button
                    onClick={() => {
                      const ep = streamPlayerModalEp;
                      setStreamPlayerModalEp(null);
                      playInYoutube(ep);
                    }}
                    className="w-full py-3 rounded-2xl bg-red-600/20 border border-red-500/30 hover:bg-red-600/40 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Youtube size={16} className="text-red-400" />
                    YouTube Embed Player
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* File Manager Modal */}
      <AnimatePresence>
        {showFileManagerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl max-h-[85vh] overflow-y-auto glass-panel p-6 rounded-2xl border border-white/15 shadow-neon-border flex flex-col space-y-4"
            >
              {/* Header */}
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-neonCyan/10 border border-neonCyan/20">
                    <FolderTree className="text-neonCyan" size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      Manage Folder & Files — {anime?.title}
                    </h2>
                    <p className="text-[11px] text-gray-400 font-mono line-clamp-1" title={fmCurrentPath}>
                      {fmCurrentPath}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFileManagerModal(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 p-3 rounded-xl border border-white/10">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadFileManagerTree(anime?.folderPath)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 border border-white/10 cursor-pointer"
                    title="Root Folder"
                  >
                    <HardDrive size={14} className="text-neonCyan" /> Root
                  </button>

                  <button
                    onClick={() => {
                      setShowNewFolderInput(false);
                      setShowNewFileInput(!showNewFileInput);
                    }}
                    className="px-3 py-1.5 bg-neonPink/10 hover:bg-neonPink/20 text-neonPink rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-neonPink/30 cursor-pointer"
                  >
                    <FilePlus size={14} /> Add File
                  </button>

                  <button
                    onClick={() => {
                      setShowNewFileInput(false);
                      setShowNewFolderInput(!showNewFolderInput);
                    }}
                    className="px-3 py-1.5 bg-neonCyan/10 hover:bg-neonCyan/20 text-neonCyan rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-neonCyan/30 cursor-pointer"
                  >
                    <FolderPlus size={14} /> New Sub-folder
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadFileManagerTree(fmCurrentPath)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-gray-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={14} className={fmLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>
              </div>

              {/* New Folder Form */}
              {showNewFolderInput && (
                <div className="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/10">
                  <input
                    type="text"
                    placeholder="Enter new sub-folder name..."
                    value={fmNewFolderName}
                    onChange={(e) => setFmNewFolderName(e.target.value)}
                    className="flex-1 bg-black/60 border border-white/15 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-neonCyan"
                  />
                  <button
                    onClick={handleCreateSubfolder}
                    className="px-3 py-1.5 bg-neonCyan text-black font-bold text-xs rounded-lg cursor-pointer hover:brightness-110"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowNewFolderInput(false)}
                    className="px-3 py-1.5 bg-white/5 text-gray-400 hover:text-white text-xs rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {/* New File Form */}
              {showNewFileInput && (
                <div className="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/10 mt-2">
                  <input
                    type="text"
                    placeholder="Enter full filename with extension (e.g. video.mp4)..."
                    value={fmNewFileName}
                    onChange={(e) => setFmNewFileName(e.target.value)}
                    className="flex-1 bg-black/60 border border-white/15 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-neonPink"
                  />
                  <button
                    onClick={handleCheckFile}
                    className="px-3 py-1.5 bg-neonPink text-white font-bold text-xs rounded-lg cursor-pointer hover:brightness-110"
                  >
                    Verify & Add
                  </button>
                  <button
                    onClick={() => setShowNewFileInput(false)}
                    className="px-3 py-1.5 bg-white/5 text-gray-400 hover:text-white text-xs rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Items Table */}
              <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[450px] border border-white/10 rounded-xl bg-black/30 p-2 space-y-1">
                {fmLoading ? (
                  <div className="h-full flex items-center justify-center gap-2 text-xs text-[#7c5cff] py-12">
                    <Loader2 className="animate-spin" size={20} /> Loading directory tree...
                  </div>
                ) : !fmTree || !fmTree.children || fmTree.children.length === 0 ? (
                  <div className="text-center py-12 text-xs text-gray-500">
                    No files or sub-folders found in this directory.
                  </div>
                ) : (
                  fmTree.children.map((item) => (
                    <div
                      key={item.path}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-xs transition"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                        {item.isDirectory ? (
                          <Folder className="text-amber-400 shrink-0" size={18} />
                        ) : (
                          <FileVideo className="text-neonCyan shrink-0" size={18} />
                        )}

                        <div className="flex-1 min-w-0">
                          {item.isDirectory ? (
                            <button
                              onClick={() => loadFileManagerTree(item.path)}
                              className="font-bold text-white hover:text-neonCyan text-left truncate block cursor-pointer"
                            >
                              {item.name}
                            </button>
                          ) : (
                            <span className="text-gray-200 truncate block font-medium">
                              {item.name}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500 font-mono block">
                            {item.isDirectory ? 'Sub-folder' : `${(item.size / (1024 * 1024)).toFixed(1)} MB`}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setFmRenameTarget(item);
                            setFmNewName(item.name);
                          }}
                          className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
                          title="Rename"
                        >
                          <Edit3 size={14} />
                        </button>

                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="p-1.5 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-400 transition cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between border-t border-white/10 pt-4">
                <span className="text-xs text-gray-400">
                  Save your folder changes and rescan anime episodes
                </span>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowFileManagerModal(false)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAndRescanFileManager}
                    className="px-5 py-2 bg-neon-gradient hover:brightness-110 rounded-xl text-xs font-bold text-white cursor-pointer shadow-purple-glow flex items-center gap-2"
                  >
                    <RefreshCw size={14} /> Save & Rescan Folder
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Prompt Sub-modal */}
      <AnimatePresence>
        {fmRenameTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-md glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
              <h3 className="text-sm font-bold text-white">Rename Item</h3>
              <input
                type="text"
                value={fmNewName}
                onChange={(e) => setFmNewName(e.target.value)}
                className="w-full bg-black/60 border border-white/15 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-neonCyan"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setFmRenameTarget(null)}
                  className="px-3 py-1.5 bg-white/5 rounded-lg text-xs font-bold text-gray-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRenameItem}
                  className="px-4 py-1.5 bg-neonCyan text-black font-bold text-xs rounded-lg cursor-pointer"
                >
                  Save Rename
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
