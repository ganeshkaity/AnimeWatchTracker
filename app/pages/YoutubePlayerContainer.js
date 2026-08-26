"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ChevronLeft, Play, Pause, Volume2, VolumeX, Maximize,
  SkipForward, SkipBack, RotateCw, Lightbulb, CheckCircle2,
  FolderTree, Search, Menu, Youtube, Info, AlertTriangle,
  Bookmark, Clock, FileVideo, Percent, StickyNote
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { getLocalAnime, getLocalEpisodes, setLocalEpisodes, upsertLocalAnime } from '../utils/localStore';

export default function YoutubePlayerContainer({
  animeId,
  episodeId,
  episodes = [],
  onBack,
  initialSpeed = 1,
}) {
  const { currentUser } = useAuth();
  const [currentEpisodeId, setCurrentEpisodeId] = useState(episodeId);
  const [animeDetails, setAnimeDetails] = useState(null);

  // ── YouTube Player State ───────────────────────────────────────────────────
  const [lightOn, setLightOn] = useState(true);
  const [autoPlay, setAutoPlay] = useState(true);
  const [autoNext, setAutoNext] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('watchanime_yt_speed');
      if (saved) return parseFloat(saved);
    }
    return initialSpeed;
  });
  const [customSpeedInput, setCustomSpeedInput] = useState(String(playbackSpeed));
  const [epSearch, setEpSearch] = useState('');
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  const ytPlayerRef = useRef(null);
  const containerId = useMemo(() => `yt-player-${Math.random().toString(36).substr(2, 9)}`, []);

  // ── Hover Tooltip State for Episode Details ────────────────────────────────
  const [hoveredEp, setHoveredEp] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const updateTooltipPos = useCallback((e) => {
    if (typeof window === 'undefined') return;
    const cardWidth = 270;
    const cardHeight = 220;
    let x = e.clientX + 14;
    let y = e.clientY + 18;

    if (x + cardWidth > window.innerWidth - 12) {
      x = e.clientX - cardWidth - 14;
    }
    if (y + cardHeight > window.innerHeight - 12) {
      y = e.clientY - cardHeight - 14;
    }
    setTooltipPos({ x: Math.max(10, x), y: Math.max(10, y) });
  }, []);

  const handleEpMouseEnter = useCallback((ep, e) => {
    setHoveredEp(ep);
    updateTooltipPos(e);
  }, [updateTooltipPos]);

  const handleEpMouseMove = useCallback((e) => {
    updateTooltipPos(e);
  }, [updateTooltipPos]);

  const handleEpMouseLeave = useCallback(() => {
    setHoveredEp(null);
  }, []);

  const calcEpPercentage = (ep) => {
    if (!ep) return 0;
    if (ep.isWatched) return 100;
    const dur = ep.durationSeconds || 0;
    const pos = ep.lastPositionSeconds || ep.watchedSeconds || 0;
    if (!dur || dur <= 0 || !pos) return 0;
    return Math.min(100, Math.round((pos / dur) * 100));
  };

  const formatEpDuration = (sec) => {
    if (!sec || isNaN(sec) || sec <= 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // ── 1. ALWAYS SORT EPISODES STRICTLY IN NUMERICAL ORDER (1, 2, 3, ... N) ───
  const sortedEpisodes = useMemo(() => {
    if (!episodes || episodes.length === 0) return [];
    return [...episodes].sort((a, b) => {
      const numA = parseFloat(a.episodeNumber) || 0;
      const numB = parseFloat(b.episodeNumber) || 0;
      if (numA !== numB) return numA - numB;
      return String(a.fileName || a.title || '').localeCompare(
        String(b.fileName || b.title || ''),
        undefined,
        { numeric: true, sensitivity: 'base' }
      );
    });
  }, [episodes]);

  // Sync current episode ID on prop change
  useEffect(() => {
    setCurrentEpisodeId(episodeId);
  }, [episodeId]);

  // Load anime details for header
  useEffect(() => {
    if (animeId) {
      const local = getLocalAnime(animeId);
      if (local) setAnimeDetails(local);
    }
  }, [animeId]);

  const currentIndex = useMemo(() => {
    return sortedEpisodes.findIndex((e) => e.id === currentEpisodeId);
  }, [sortedEpisodes, currentEpisodeId]);

  const currentEpisode = currentIndex !== -1 ? sortedEpisodes[currentIndex] : sortedEpisodes[0];
  const prevEpisode = currentIndex > 0 ? sortedEpisodes[currentIndex - 1] : null;
  const nextEpisode = currentIndex >= 0 && currentIndex < sortedEpisodes.length - 1 ? sortedEpisodes[currentIndex + 1] : null;

  const isCurrentWatched = !!currentEpisode?.isWatched;

  // Extract YouTube ID
  const youtubeId = useMemo(() => {
    if (!currentEpisode) return '';
    return currentEpisode.youtubeId || currentEpisode.filePath?.replace('youtube://', '') || '';
  }, [currentEpisode]);

  // ── Filtered Episodes for 5-Column Grid (From strictly sorted list) ────────
  const visibleEpisodes = useMemo(() => {
    if (!epSearch.trim()) return sortedEpisodes;
    const q = epSearch.trim().toLowerCase();
    return sortedEpisodes.filter((ep, idx) => {
      const numStr = String(ep.episodeNumber || idx + 1);
      const titleStr = String(ep.fileName || ep.title || '').toLowerCase();
      return numStr === q || numStr.includes(q) || titleStr.includes(q);
    });
  }, [sortedEpisodes, epSearch]);

  // ── Change Speed Function: player.setPlaybackRate(xxx) ─────────────────────
  const handleSpeedChange = useCallback((spd) => {
    const rate = parseFloat(spd) || 1.0;
    const clamped = Math.max(0.25, Math.min(2.0, rate));
    setPlaybackSpeed(clamped);
    setCustomSpeedInput(String(clamped));

    if (typeof window !== 'undefined') {
      localStorage.setItem('watchanime_yt_speed', String(clamped));
    }

    // Direct invocation of YouTube API player.setPlaybackRate(xxx)
    if (ytPlayerRef.current && typeof ytPlayerRef.current.setPlaybackRate === 'function') {
      try {
        ytPlayerRef.current.setPlaybackRate(clamped);
      } catch (err) {
        console.warn('Error setting YouTube playback rate:', err);
      }
    }
  }, []);

  // ── Force Preset Playback Speed on Page Load & Video State Transitions ────
  useEffect(() => {
    if (isPlayerReady && ytPlayerRef.current) {
      handleSpeedChange(playbackSpeed);
      const t1 = setTimeout(() => handleSpeedChange(playbackSpeed), 300);
      const t2 = setTimeout(() => handleSpeedChange(playbackSpeed), 1000);
      const t3 = setTimeout(() => handleSpeedChange(playbackSpeed), 2000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [isPlayerReady, currentEpisodeId, playbackSpeed, handleSpeedChange]);

  // ── YouTube IFrame API Initialization ─────────────────────────────────────
  useEffect(() => {
    if (!youtubeId) return;

    let destroyed = false;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player || destroyed) return;

      // If player already exists, load new video directly
      if (ytPlayerRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
        try {
          ytPlayerRef.current.loadVideoById({
            videoId: youtubeId,
            startSeconds: currentEpisode?.lastPositionSeconds || 0,
          });
          // Force preset speed immediately on episode change
          handleSpeedChange(playbackSpeed);
          setTimeout(() => handleSpeedChange(playbackSpeed), 400);
          return;
        } catch (e) {
          console.warn('Error loading video by ID, re-initializing player:', e);
        }
      }

      try {
        ytPlayerRef.current = new window.YT.Player(containerId, {
          videoId: youtubeId,
          playerVars: {
            autoplay: autoPlay ? 1 : 0,
            rel: 0,
            modestbranding: 1,
            controls: 1,
            start: currentEpisode?.lastPositionSeconds || 0,
          },
          events: {
            onReady: (event) => {
              if (destroyed) return;
              setIsPlayerReady(true);
              
              // Force preset speed immediately after page/player loaded!
              handleSpeedChange(playbackSpeed);

              if (autoPlay) {
                try { event.target.playVideo(); } catch (e) {}
              }

              // Re-enforce speed after 400ms and 1200ms once stream starts
              setTimeout(() => handleSpeedChange(playbackSpeed), 400);
              setTimeout(() => handleSpeedChange(playbackSpeed), 1200);
            },
            onStateChange: (event) => {
              if (destroyed) return;
              // When video starts playing (1) or buffering (3), YouTube resets playback speed.
              // Force preset playback speed again so it ALWAYS plays fast!
              if (event.data === 1 || event.data === 3) {
                handleSpeedChange(playbackSpeed);
              }
              // YT.PlayerState.ENDED is 0
              if (event.data === 0) {
                handleToggleWatched(true);
                if (autoNext && nextEpisode) {
                  setCurrentEpisodeId(nextEpisode.id);
                }
              }
            },
          },
        });
      } catch (err) {
        console.error('Failed to create YouTube player:', err);
      }
    };

    // Check if YouTube API is already loaded in window
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      // Inject YouTube IFrame API script tag
      const existingScript = document.getElementById('youtube-iframe-api');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }

      const prevOnReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevOnReady) prevOnReady();
        initPlayer();
      };
    }

    return () => {
      destroyed = true;
    };
  }, [youtubeId, containerId]);

  // ── Watched Marker Toggle ──────────────────────────────────────────────────
  const handleToggleWatched = (overrideState) => {
    if (!currentEpisode) return;
    const nextWatched = typeof overrideState === 'boolean' ? overrideState : !isCurrentWatched;

    // Update LocalStore
    try {
      const stored = getLocalEpisodes(animeId) || [];
      const updated = stored.map((e) =>
        e.id === currentEpisode.id ? { ...e, isWatched: nextWatched } : e
      );
      setLocalEpisodes(animeId, updated);
      upsertLocalAnime({
        id: animeId,
        lastWatchedEpisode: currentEpisode.episodeNumber || '',
        lastOpenedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('LocalStore error:', e);
    }

    // Update Firestore
    if (currentUser?.uid && db) {
      try {
        const epRef = doc(db, 'users', currentUser.uid, 'anime', animeId, 'episodes', currentEpisode.id);
        updateDoc(epRef, {
          isWatched: nextWatched,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      } catch (err) {}
    }

    // Directly update episode object
    currentEpisode.isWatched = nextWatched;
  };

  return (
    <div className={`min-h-screen bg-[#07090f] text-white flex flex-col transition-colors duration-300 ${!lightOn ? 'bg-black' : ''}`}>
      
      {/* Light Off theater backdrop overlay */}
      {!lightOn && (
        <div
          onClick={() => setLightOn(true)}
          className="fixed inset-0 bg-black/85 z-20 cursor-pointer pointer-events-auto transition-opacity"
          title="Click anywhere to turn lights back On"
        />
      )}

      {/* ── Top Header Navigation Bar ────────────────────────────────────────── */}
      <header className="h-14 px-4 md:px-6 bg-[#0c101c]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between z-10 shrink-0 sticky top-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold transition cursor-pointer border border-white/5"
          >
            <ChevronLeft size={16} />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
              <Youtube size={12} className="text-red-400" />
              YouTube Player
            </span>
            <span className="text-gray-600 hidden sm:inline">•</span>
            <span className="text-xs font-bold text-gray-200 truncate max-w-[200px] md:max-w-md">
              {animeDetails?.title || currentEpisode?.title || animeId}
            </span>
          </div>
        </div>

        <div className="text-xs font-semibold text-gray-400 hidden sm:block font-mono">
          Episode {currentEpisode?.episodeNumber || (currentIndex + 1)} of {sortedEpisodes.length}
        </div>
      </header>

      {/* ── Main Grid: Left Episode Selector + Right Player & Controls ───────── */}
      <main className="flex-1 w-full max-w-[1700px] mx-auto p-2 sm:p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10">

        {/* ── LEFT COLUMN: Ordered 5-Column Episode Grid ─────────────────────── */}
        <div className="lg:col-span-4 xl:col-span-3 bg-[#0d111d] rounded-2xl border border-white/10 p-3.5 sm:p-4 flex flex-col h-[650px] lg:h-[760px] shadow-2xl">
          
          {/* Header Title */}
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-wide text-gray-200 flex items-center gap-1.5">
              <FolderTree size={15} className="text-purple-400" />
              List of episodes:
            </h2>
            <span className="text-[10px] text-gray-400 font-mono">
              {visibleEpisodes.length} eps
            </span>
          </div>

          {/* Filter Row: Playlist Dropdown & Number of Ep Search */}
          <div className="flex items-center gap-2 mb-3.5">
            <div className="relative flex-1">
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#171e2e] border border-white/10 text-xs font-semibold text-gray-300">
                <Menu size={13} className="text-gray-400 shrink-0" />
                <span className="truncate text-xs font-bold text-white">
                  Playlist (1-{sortedEpisodes.length})
                </span>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Number of Ep"
                value={epSearch}
                onChange={(e) => setEpSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-xl bg-[#171e2e] border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />
              {epSearch && (
                <button
                  onClick={() => setEpSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* 5-Column Episode Buttons Grid: STRICT NUMERICAL ORDER (1, 2, 3... 54) */}
          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {visibleEpisodes.length > 0 ? (
              <div className="grid grid-cols-5 gap-1.5">
                {visibleEpisodes.map((ep, idx) => {
                  const isActive = ep.id === currentEpisode?.id;
                  const displayNum = ep.episodeNumber || (idx + 1);
                  const isWatched = !!ep.isWatched;
                  const isInProgress = !isWatched && (ep.lastPositionSeconds > 5);
                  const isFlagged = !!(ep.isFlagged || (ep.flags && ep.flags.length > 0));

                  return (
                    <button
                      key={ep.id}
                      onClick={() => {
                        if (!isActive) setCurrentEpisodeId(ep.id);
                      }}
                      onMouseEnter={(e) => handleEpMouseEnter(ep, e)}
                      onMouseMove={(e) => handleEpMouseMove(e)}
                      onMouseLeave={handleEpMouseLeave}
                      className={`h-9 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer border relative ${
                        isActive
                          ? 'bg-[#f472b6] text-black border-[#f472b6] shadow-md scale-105 font-black z-10'
                          : 'bg-[#181f30] hover:bg-[#232c42] text-gray-300 border-white/5 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <span>{displayNum}</span>

                      {/* Status Dots */}
                      <div className="absolute top-1 right-1 flex items-center gap-0.5 pointer-events-none">
                        {isFlagged && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.9)]"
                            title="Marked"
                          />
                        )}
                        {isInProgress && !isActive && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.9)] animate-pulse"
                            title="In Progress"
                          />
                        )}
                        {isWatched && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.9)]"
                            title="Completed"
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-gray-500 text-xs">
                No episodes found matching "{epSearch}"
              </div>
            )}
          </div>

          {/* Status Legend */}
          <div className="pt-3 border-t border-white/5 space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between text-gray-400">
              <span>YouTube Playlist</span>
              <span>{visibleEpisodes.length} Episodes</span>
            </div>
            <div className="flex items-center gap-3 text-gray-400 pt-0.5">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> Completed
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" /> Progress
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Marked
              </span>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: YouTube Video Player + MediaServer Style Controls ── */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col space-y-4">
          
          {/* 1. Video Player Container (Aspect-Video, Rounded, Shadow) */}
          <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
            {youtubeId ? (
              <div className="w-full h-full relative">
                <div id={containerId} className="w-full h-full" />
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                <AlertTriangle size={40} className="text-red-400 mb-2" />
                <h3 className="text-sm font-bold text-white">Invalid YouTube ID</h3>
                <p className="text-xs text-gray-500 mt-1">This episode is missing a valid YouTube link.</p>
              </div>
            )}
          </div>

          {/* 2. Below Video: Quick Controls Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-gray-300">
            
            {/* Left Toggles */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Light On / Off */}
              <button
                onClick={() => setLightOn((prev) => !prev)}
                className="flex items-center gap-1.5 hover:text-white transition cursor-pointer font-medium"
              >
                <Lightbulb size={15} className={lightOn ? 'text-yellow-400' : 'text-gray-500'} />
                <span>Light</span>
                <span className={`font-bold ${lightOn ? 'text-[#f472b6]' : 'text-gray-400'}`}>
                  {lightOn ? 'On' : 'Off'}
                </span>
              </button>

              {/* Auto Play */}
              <button
                onClick={() => setAutoPlay((prev) => !prev)}
                className="flex items-center gap-1 hover:text-white transition cursor-pointer font-medium"
              >
                <span>Auto Play</span>
                <span className={`font-bold ${autoPlay ? 'text-[#f472b6]' : 'text-gray-400'}`}>
                  {autoPlay ? 'On' : 'Off'}
                </span>
              </button>

              {/* Auto Next */}
              <button
                onClick={() => setAutoNext((prev) => !prev)}
                className="flex items-center gap-1 hover:text-white transition cursor-pointer font-medium"
              >
                <span>Auto Next</span>
                <span className={`font-bold ${autoNext ? 'text-[#f472b6]' : 'text-gray-400'}`}>
                  {autoNext ? 'On' : 'Off'}
                </span>
              </button>
            </div>

            {/* Right Buttons: Prev, Next, Watched Toggle */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => prevEpisode && setCurrentEpisodeId(prevEpisode.id)}
                disabled={!prevEpisode}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#181f30] hover:bg-[#252f48] text-white font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <SkipBack size={13} fill="currentColor" />
                <span>Prev</span>
              </button>

              <button
                onClick={() => nextEpisode && setCurrentEpisodeId(nextEpisode.id)}
                disabled={!nextEpisode}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#181f30] hover:bg-[#252f48] text-white font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Next</span>
                <SkipForward size={13} fill="currentColor" />
              </button>

              {/* Watched / Unwatched Toggle Marker */}
              <button
                onClick={() => handleToggleWatched()}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold transition cursor-pointer border ${
                  isCurrentWatched
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-[#181f30] hover:bg-[#252f48] text-gray-300 border-white/10 hover:text-white'
                }`}
                title={isCurrentWatched ? 'Click to mark as Unwatched' : 'Click to mark as Watched'}
              >
                <CheckCircle2 size={14} className={isCurrentWatched ? 'text-emerald-400' : 'text-gray-400'} />
                <span>{isCurrentWatched ? 'Watched' : 'Mark Watched'}</span>
              </button>
            </div>

          </div>

          {/* 3. Pink Banner: "You are watching Episode X" + SPEED Controls */}
          <div className="bg-[#0d111d] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center gap-5 shadow-xl">
            
            {/* Left Pink Card */}
            <div className="bg-[#fbcfe8] text-gray-900 px-5 py-3 rounded-2xl shrink-0 shadow-md">
              <div className="text-[11px] font-semibold tracking-wide text-gray-700">
                You are watching
              </div>
              <div className="text-base sm:text-lg font-black text-black">
                Episode {currentEpisode?.episodeNumber || (currentIndex + 1)}
              </div>
            </div>

            {/* Right Options: SOURCE & SPEED */}
            <div className="flex-1 space-y-3 w-full">
              
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="font-extrabold text-gray-300 uppercase tracking-wider text-[11px]">
                  SOURCE:
                </span>
                <span className="px-2.5 py-0.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-1.5">
                  <Youtube size={13} className="text-red-400" />
                  YouTube Video Stream
                </span>
              </div>

              {/* SPEED Options: Presets + Custom Speed (invokes player.setPlaybackRate) */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-extrabold text-gray-300 flex items-center gap-1 shrink-0 uppercase tracking-wider text-[11px]">
                  <RotateCw size={14} className="text-amber-400" />
                  SPEED:
                </span>

                {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((spd) => {
                  const isSelected = playbackSpeed === spd;
                  return (
                    <button
                      key={spd}
                      onClick={() => handleSpeedChange(spd)}
                      className={`px-2.5 py-0.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        isSelected
                          ? 'bg-amber-400 text-black border-amber-400 shadow'
                          : 'bg-[#181f30] text-gray-300 border-white/10 hover:text-white'
                      }`}
                    >
                      {spd === 1 || spd === 2 ? `${spd}x` : `${spd.toFixed(2)}x`}
                    </button>
                  );
                })}

                {/* Custom Speed Input up to 2x (YouTube natively supports 0.25 to 2.0x) */}
                <div className="flex items-center gap-1 bg-[#181f30] border border-white/10 rounded-xl px-2 py-0.5">
                  <span className="text-gray-400 text-[10px] font-semibold">Custom:</span>
                  <input
                    type="number"
                    min="0.25"
                    max="2.0"
                    step="0.25"
                    value={customSpeedInput}
                    onChange={(e) => {
                      setCustomSpeedInput(e.target.value);
                      const parsed = parseFloat(e.target.value);
                      if (!isNaN(parsed) && parsed >= 0.25 && parsed <= 2.0) {
                        handleSpeedChange(parsed);
                      }
                    }}
                    className="w-12 bg-transparent text-white font-bold text-xs focus:outline-none text-center"
                    placeholder="1.0"
                  />
                  <span className="text-gray-400 text-xs">x</span>
                </div>
              </div>

            </div>

          </div>

        </div>

      </main>

      {/* ── Episode Hover Details Floating Card (Follows cursor) ───────────── */}
      {hoveredEp && (
        <div
          style={{
            position: 'fixed',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            zIndex: 9999,
          }}
          className="w-72 bg-[#0c101c]/95 backdrop-blur-xl border border-white/20 rounded-2xl p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.85)] pointer-events-none text-xs text-white space-y-2.5 animate-in fade-in zoom-in-95 duration-100 select-none"
        >
          {/* Header: Ep Number & Watched Status */}
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
            <div className="font-black text-sm text-white flex items-center gap-1.5 truncate">
              <span className="text-[#f472b6]">
                EP {hoveredEp.episodeNumber || 1}
              </span>
              <span className="text-[10px] text-red-400 font-medium flex items-center gap-1">
                <Youtube size={10} /> YouTube
              </span>
            </div>

            {hoveredEp.isWatched ? (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 shrink-0">
                <CheckCircle2 size={10} className="text-emerald-400" />
                Watched
              </span>
            ) : (hoveredEp.lastPositionSeconds > 5) ? (
              <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1 shrink-0">
                <Clock size={10} className="text-cyan-400 animate-pulse" />
                In Progress
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-gray-400 text-[10px] font-medium shrink-0">
                Unwatched
              </span>
            )}
          </div>

          {/* File Name / Video Title */}
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
              <FileVideo size={11} className="text-purple-400" />
              Episode Title / Name
            </span>
            <p className="text-[11px] font-medium text-gray-200 line-clamp-2 break-all bg-black/40 px-2 py-1 rounded-lg border border-white/5 font-mono">
              {hoveredEp.fileName || hoveredEp.title || `Episode ${hoveredEp.episodeNumber}`}
            </p>
          </div>

          {/* Watching Progress & Percentage */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-400 font-medium">
              <span className="flex items-center gap-1">
                <Percent size={10} className="text-yellow-400" /> Progress:
              </span>
              <span className="font-mono text-gray-300">
                {calcEpPercentage(hoveredEp)}% ({formatEpDuration(hoveredEp.lastPositionSeconds || (hoveredEp.isWatched ? hoveredEp.durationSeconds : 0))} / {formatEpDuration(hoveredEp.durationSeconds || 0)})
              </span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  hoveredEp.isWatched
                    ? 'bg-emerald-400'
                    : (hoveredEp.lastPositionSeconds > 5)
                    ? 'bg-gradient-to-r from-cyan-400 to-[#f472b6]'
                    : 'bg-transparent'
                }`}
                style={{ width: `${calcEpPercentage(hoveredEp)}%` }}
              />
            </div>
          </div>

          {/* Flags / Bookmarks */}
          {(hoveredEp.flags?.length > 0 || hoveredEp.isFlagged) && (
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-amber-400 flex items-center gap-1">
                <Bookmark size={10} /> Flags & Tags
              </span>
              <div className="flex flex-wrap gap-1">
                {hoveredEp.flags && hoveredEp.flags.length > 0 ? (
                  hoveredEp.flags.map((flag, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9px] font-bold"
                    >
                      {flag}
                    </span>
                  ))
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[9px] font-bold">
                    Marked / Bookmarked
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {hoveredEp.note && (
            <div className="space-y-0.5 bg-yellow-400/10 border border-yellow-400/20 rounded-lg p-1.5 text-[10px]">
              <span className="font-bold text-yellow-300 flex items-center gap-1">
                <StickyNote size={10} /> Personal Note:
              </span>
              <p className="text-gray-300 line-clamp-2 italic">
                "{hoveredEp.note}"
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
