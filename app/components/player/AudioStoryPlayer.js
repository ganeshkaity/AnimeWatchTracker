"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, RotateCw, SkipForward, SkipBack, Settings,
  AlertTriangle, RefreshCw, Subtitles, Check, Server,
  Sliders, Info, Activity, Radio, ChevronRight, ChevronLeft, X,
  Search, Menu, Lightbulb, CheckCircle2, Plus, FolderTree,
  Bookmark, Star, Sparkles, SlidersHorizontal, Clock,
  FileVideo, Percent, StickyNote, Zap, Gauge, Headphones,
  Image as ImageIcon, EyeOff, Eye, Moon, Sun, Music, Disc, Timer
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import {
  upsertLocalAudioStory,
  getLocalAudioTracks,
  setLocalAudioTracks,
  getLocalAudioStory
} from '../../utils/localStore';

function formatTime(seconds) {
  if (isNaN(seconds) || seconds === null || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function AudioStoryPlayer({
  storyId,
  track,
  tracks = [],
  onBack,
  onTrackChange,
  initialSpeed = 1,
  initialVolume = 1,
}) {
  const { currentUser } = useAuth();

  // ── Core Playback State ───────────────────────────────────────────────────
  const [playerState, setPlayerState] = useState('idle'); // idle | loading | playing | paused | buffering | error
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(() => track?.durationSeconds || track?.duration || 0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('watchanime_audio_player_volume');
      if (saved !== null) return parseFloat(saved);
    }
    return initialVolume;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(initialSpeed);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // ── Audio Story Specific Options ──────────────────────────────────────────
  // 1. Lights Off (Cinema / Focus Mode)
  const [lightsOff, setLightsOff] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('watchanime_audio_lights_off') === 'true';
    }
    return false;
  });

  // 2. Show / Don't Show Media Art
  const [showMediaArt, setShowMediaArt] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('watchanime_audio_show_media_art');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  // 3. For Video Format Audio Stories: Option to only play the audio
  const isVideoFile = useMemo(() => {
    if (!track) return false;
    if (track.isVideo) return true;
    const ext = String(track.filePath || track.fileName || track.name || '').toLowerCase();
    return /\.(mp4|mkv|webm|avi|mov|m4v|flv|wmv|ts)$/i.test(ext);
  }, [track]);

  const [videoAudioOnlyMode, setVideoAudioOnlyMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('watchanime_audio_video_audio_only');
      return saved !== null ? saved === 'true' : true; // Default to audio-only mode for audio stories!
    }
    return true;
  });

  // Sleep Timer state (minutes: 0 = Off, 15, 30, 45, 60, -1 = end of track)
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState(0);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState(null);
  const [showSleepMenu, setShowSleepMenu] = useState(false);

  // Server & Stream States
  const [mediaId, setMediaId] = useState('');
  const [serverHealth, setServerHealth] = useState('checking');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [trackSearch, setTrackSearch] = useState('');

  // Story Details
  const [storyDetails, setStoryDetails] = useState(null);

  // Refs
  const mediaElementRef = useRef(null);
  const playerWrapperRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const sleepTimerIntervalRef = useRef(null);
  const lastSavedTimeRef = useRef(0);

  // Load story details
  useEffect(() => {
    if (storyId) {
      const local = getLocalAudioStory(storyId);
      if (local) setStoryDetails(local);
    }
  }, [storyId]);

  // Persist preference states
  const handleToggleLightsOff = useCallback(() => {
    setLightsOff(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('watchanime_audio_lights_off', String(next));
      }
      return next;
    });
  }, []);

  const handleToggleShowMediaArt = useCallback(() => {
    setShowMediaArt(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('watchanime_audio_show_media_art', String(next));
      }
      return next;
    });
  }, []);

  const handleToggleVideoAudioOnly = useCallback(() => {
    setVideoAudioOnlyMode(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('watchanime_audio_video_audio_only', String(next));
      }
      return next;
    });
  }, []);

  // Sleep timer logic
  useEffect(() => {
    if (sleepTimerIntervalRef.current) clearInterval(sleepTimerIntervalRef.current);

    if (sleepTimerMinutes > 0) {
      setSleepTimerRemaining(sleepTimerMinutes * 60);
      sleepTimerIntervalRef.current = setInterval(() => {
        setSleepTimerRemaining(prev => {
          if (prev <= 1) {
            clearInterval(sleepTimerIntervalRef.current);
            if (mediaElementRef.current) mediaElementRef.current.pause();
            setPlayerState('paused');
            setSleepTimerMinutes(0);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (sleepTimerMinutes === -1) {
      // End of track mode
      setSleepTimerRemaining('End of Track');
    } else {
      setSleepTimerRemaining(null);
    }

    return () => {
      if (sleepTimerIntervalRef.current) clearInterval(sleepTimerIntervalRef.current);
    };
  }, [sleepTimerMinutes]);

  // Resolve media on media server
  useEffect(() => {
    if (!track) return;

    let isMounted = true;
    setPlayerState('loading');
    setErrorMessage('');
    setErrorDetails('');
    setMediaId('');
    setCurrentTime(0);

    const resolve = async () => {
      try {
        const healthRes = await fetch('/api/media/health');
        const healthData = await healthRes.json();
        if (healthData.success) setServerHealth('online');
        else setServerHealth('offline');
      } catch {
        setServerHealth('offline');
      }

      try {
        const res = await fetch('/api/media/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            animeId: storyId,
            episodeId: track.id,
            filePath: track.filePath,
            fileName: track.fileName || track.name,
          }),
        });

        const data = await res.json();
        if (!isMounted) return;

        if (data.success && data.mediaId) {
          setMediaId(data.mediaId);

          // Fetch metadata for duration
          fetch(`/media/${encodeURIComponent(data.mediaId)}/metadata`)
            .then(mRes => mRes.json())
            .then(mData => {
              if (!isMounted || !mData.success) return;
              if (mData.metadata.duration && mData.metadata.duration > 1) {
                setDuration(mData.metadata.duration);
              }
            })
            .catch(() => {});
        } else {
          setPlayerState('error');
          setErrorMessage('Audio Track Unavailable');
          setErrorDetails(data.error || 'The Windows media server could not resolve this audio track file.');
        }
      } catch (err) {
        if (!isMounted) return;
        setPlayerState('error');
        setErrorMessage('Media Server Connection Failed');
        setErrorDetails('Could not communicate with the Windows PC media server. Please verify the host server is active.');
      }
    };

    resolve();

    return () => {
      isMounted = false;
    };
  }, [storyId, track]);

  // Set media src
  useEffect(() => {
    if (!mediaId || !mediaElementRef.current) return;
    const media = mediaElementRef.current;
    const streamUrl = `/media/${encodeURIComponent(mediaId)}/stream`;
    if (media.src !== streamUrl) {
      media.src = streamUrl;
      media.playbackRate = playbackSpeed;
      media.volume = isMuted ? 0 : volume;
      media.load();
      media.play().then(() => {
        setPlayerState('playing');
      }).catch(err => {
        console.warn('Autoplay prevented or paused:', err.message);
        setPlayerState('paused');
      });
    }
  }, [mediaId]);

  // Progress sync to localStore and Firestore
  const syncProgressToStore = useCallback((currentTimeSec, durSec) => {
    if (!track || !storyId || !durSec || durSec <= 0) return;
    const pct = Math.min(100, Math.round((currentTimeSec / durSec) * 100));
    const isCompleted = pct >= 95;

    const allTracks = getLocalAudioTracks(storyId) || [];
    const updated = allTracks.map(t => {
      if (t.id === track.id) {
        return {
          ...t,
          progress: currentTimeSec,
          progressPercent: pct,
          isWatched: isCompleted || t.isWatched,
          updatedAt: new Date().toISOString(),
        };
      }
      return t;
    });

    setLocalAudioTracks(storyId, updated);

    // Update story doc progress
    const localStory = getLocalAudioStory(storyId);
    if (localStory) {
      const completedCount = updated.filter(t => t.isWatched).length;
      const totalPct = updated.length > 0 ? Math.round((completedCount / updated.length) * 100) : 0;
      upsertLocalAudioStory({
        ...localStory,
        lastPlayedTrackId: track.id,
        lastPlayedTrackName: track.name || track.title,
        progressPercent: totalPct,
        isWatched: totalPct === 100,
        updatedAt: new Date().toISOString(),
      });
    }

    if (currentUser?.uid && db) {
      const trackRef = doc(db, 'users', currentUser.uid, 'audioStories', storyId, 'tracks', track.id);
      updateDoc(trackRef, {
        progress: currentTimeSec,
        progressPercent: pct,
        isWatched: isCompleted,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }, [track, storyId, currentUser]);

  // Core Play / Pause
  const togglePlay = useCallback(() => {
    const media = mediaElementRef.current;
    if (!media) return;
    if (media.paused) {
      media.play().then(() => setPlayerState('playing')).catch(() => setPlayerState('paused'));
    } else {
      media.pause();
      setPlayerState('paused');
    }
  }, []);

  // Seek relative
  const seekRelative = useCallback((seconds) => {
    const media = mediaElementRef.current;
    if (!media) return;
    const target = Math.max(0, Math.min(duration || 0, media.currentTime + seconds));
    media.currentTime = target;
    setCurrentTime(target);
  }, [duration]);

  // Speed change
  const handleSpeedChange = useCallback((spd) => {
    setPlaybackSpeed(spd);
    if (mediaElementRef.current) {
      mediaElementRef.current.playbackRate = spd;
    }
    setSpeedMenuOpen(false);
  }, []);

  // Volume change
  const handleVolumeChange = useCallback((val) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolume(clamped);
    setIsMuted(clamped === 0);
    if (mediaElementRef.current) {
      mediaElementRef.current.volume = clamped;
      mediaElementRef.current.muted = clamped === 0;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('watchanime_audio_player_volume', String(clamped));
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      if (mediaElementRef.current) {
        mediaElementRef.current.volume = volume > 0 ? volume : 0.5;
        mediaElementRef.current.muted = false;
      }
    } else {
      setIsMuted(true);
      if (mediaElementRef.current) {
        mediaElementRef.current.muted = true;
      }
    }
  }, [isMuted, volume]);

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!playerWrapperRef.current) return;
    if (!document.fullscreenElement) {
      playerWrapperRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Auto-hide controls
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (playerState === 'playing') {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setSpeedMenuOpen(false);
        setShowSleepMenu(false);
      }, 3500);
    }
  }, [playerState]);

  // Next / Previous Track
  const currentIndex = useMemo(() => {
    return tracks.findIndex(t => t.id === track?.id);
  }, [tracks, track]);

  const handleNextTrack = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < tracks.length - 1) {
      onTrackChange?.(tracks[currentIndex + 1]);
    }
  }, [currentIndex, tracks, onTrackChange]);

  const handlePrevTrack = useCallback(() => {
    if (currentIndex > 0) {
      onTrackChange?.(tracks[currentIndex - 1]);
    }
  }, [currentIndex, tracks, onTrackChange]);

  // Media Event Handlers
  const handleTimeUpdate = useCallback(() => {
    const media = mediaElementRef.current;
    if (!media) return;
    const now = media.currentTime;
    setCurrentTime(now);

    // Sync progress every 5 seconds
    if (Math.abs(now - lastSavedTimeRef.current) >= 5) {
      lastSavedTimeRef.current = now;
      syncProgressToStore(now, media.duration || duration);
    }

    // Buffer range
    if (media.buffered.length > 0) {
      try {
        setBufferedEnd(media.buffered.end(media.buffered.length - 1));
      } catch {}
    }
  }, [duration, syncProgressToStore]);

  const handleEnded = useCallback(() => {
    setPlayerState('paused');
    if (track) {
      syncProgressToStore(duration, duration);
    }

    if (sleepTimerMinutes === -1) {
      // Sleep timer was "End of Track"
      setSleepTimerMinutes(0);
      return;
    }

    // Auto advance to next track
    if (currentIndex >= 0 && currentIndex < tracks.length - 1) {
      onTrackChange?.(tracks[currentIndex + 1]);
    }
  }, [track, duration, sleepTimerMinutes, currentIndex, tracks, onTrackChange, syncProgressToStore]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['input', 'textarea', 'select'].includes(e.target.tagName.toLowerCase())) return;
      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          e.preventDefault();
          seekRelative(-10);
          break;
        case 'ArrowRight':
        case 'KeyL':
          e.preventDefault();
          seekRelative(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleVolumeChange(volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolumeChange(volume - 0.05);
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyN':
          e.preventDefault();
          handleNextTrack();
          break;
        case 'KeyP':
          e.preventDefault();
          handlePrevTrack();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekRelative, handleVolumeChange, volume, toggleMute, toggleFullscreen, handleNextTrack, handlePrevTrack]);

  // Filtered tracks for left column
  const filteredTracks = useMemo(() => {
    if (!trackSearch.trim()) return tracks;
    const q = trackSearch.toLowerCase().trim();
    return tracks.filter(t => (t.title || t.name || '').toLowerCase().includes(q) || String(t.trackNumber).includes(q));
  }, [tracks, trackSearch]);

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferPercent = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;

  const coverImg = storyDetails?.thumbnailBase64 ||
    (storyDetails?.thumbnailPath ? `/api/image?path=${encodeURIComponent(storyDetails.thumbnailPath)}` : null);

  const isAudioOnlyActive = isVideoFile && videoAudioOnlyMode;

  return (
    <div
      className={`w-full min-h-screen text-white select-none transition-colors duration-500 ${
        lightsOff ? 'bg-[#030408]' : 'bg-[#07090f]'
      }`}
    >
      {/* ── Lights Off Full Theater Dimmer Overlay ─────────────────────────── */}
      {lightsOff && (
        <div
          onClick={handleToggleLightsOff}
          className="fixed inset-0 bg-black/90 z-10 cursor-pointer transition-opacity backdrop-blur-[2px]"
          title="Lights Off active. Click anywhere in background to turn Lights back On"
        />
      )}

      {/* Main Grid: Left Tracks Playlist + Right Player Stage ──────────────── */}
      <div className="max-w-[1700px] mx-auto p-2 sm:p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-20">

        {/* ── LEFT COLUMN: Tracks Playlist Selector (Glass Card) ──────────── */}
        <div className={`lg:col-span-4 xl:col-span-3 rounded-2xl p-3.5 sm:p-4 flex flex-col h-[650px] lg:h-[760px] relative overflow-hidden shadow-2xl transition-all duration-300 ${
          lightsOff ? 'bg-black/60 border border-white/5 opacity-50 hover:opacity-100' : 'transparent-liquid-glass'
        }`}>
          {/* Subtle Ambient Sheen */}
          <div className="absolute -top-16 -left-16 w-36 h-36 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="mb-3 flex items-center justify-between relative z-10">
            <h2 className="text-sm font-bold tracking-wide text-gray-100 flex items-center gap-1.5">
              <Headphones size={16} className="text-cyan-400" />
              <span>Tracklist:</span>
            </h2>
            <span className="text-[10px] text-cyan-300 font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
              {tracks.length} tracks
            </span>
          </div>

          {/* Search Input */}
          <div className="relative mb-3 z-10">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search track number or title..."
              value={trackSearch}
              onChange={(e) => setTrackSearch(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 rounded-xl liquid-glass-item text-xs text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400/60"
            />
            {trackSearch && (
              <button
                onClick={() => setTrackSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Scrollable Tracks List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-1.5 relative z-10">
            {filteredTracks.map((t, idx) => {
              const isActive = t.id === track?.id;
              const isWatched = Boolean(t.isWatched || (t.progressPercent && t.progressPercent >= 95));
              const isVideo = t.isVideo;

              return (
                <button
                  key={t.id || idx}
                  onClick={() => onTrackChange?.(t)}
                  className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between gap-2.5 group cursor-pointer border ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-500/40 text-white shadow-md'
                      : 'hover:bg-white/5 border-transparent text-gray-300 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                      isActive ? 'bg-cyan-500 text-black' : 'bg-white/10 text-gray-400 group-hover:text-white'
                    }`}>
                      {t.trackNumber || idx + 1}
                    </span>
                    <div className="truncate">
                      <p className={`text-xs font-semibold truncate ${isActive ? 'text-cyan-300 font-bold' : ''}`}>
                        {t.title || t.name}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <span className={`px-1 rounded text-[9px] font-mono ${isVideo ? 'bg-purple-500/20 text-purple-300' : 'bg-cyan-500/20 text-cyan-300'}`}>
                          {isVideo ? 'VIDEO' : (t.ext || 'AUDIO')}
                        </span>
                        {t.size ? <span>{(t.size / (1024 * 1024)).toFixed(1)} MB</span> : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)] animate-pulse" />
                    )}
                    {isWatched && (
                      <CheckCircle2 size={13} className="text-emerald-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bottom Info / Legend */}
          <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-gray-400">
            <span>Audio & Video Story</span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 size={10} /> Listened
              </span>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Player Stage + Options ─────────────────────────── */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col space-y-4">

          {/* 1. Main Player Surface */}
          <div
            ref={playerWrapperRef}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseMove}
            className={`relative w-full rounded-3xl overflow-hidden shadow-2xl border transition-all duration-300 ${
              lightsOff ? 'border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.15)] bg-black' : 'border-white/10 bg-[#0d1117]'
            } ${(!isVideoFile || isAudioOnlyActive) ? 'min-h-[420px] sm:min-h-[480px] flex flex-col justify-between' : 'aspect-video'}`}
          >
            {/* Native Video/Audio HTML Element */}
            <video
              ref={mediaElementRef}
              playsInline
              preload="metadata"
              crossOrigin="anonymous"
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
              onWaiting={() => setPlayerState('buffering')}
              onPlaying={() => setPlayerState('playing')}
              onPause={() => setPlayerState('paused')}
              onError={() => {
                setPlayerState('error');
                setErrorMessage('Playback Error');
                setErrorDetails('An error occurred during playback. Please try again.');
              }}
              className={`w-full h-full object-contain ${
                (isVideoFile && !isAudioOnlyActive) ? 'block cursor-pointer' : 'hidden'
              }`}
              onClick={togglePlay}
            />

            {/* ── Top Bar inside Player ───────────────────────────────────── */}
            <div className={`p-4 flex items-center justify-between z-30 transition-opacity duration-300 ${
              showControls || playerState !== 'playing' ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                  <Headphones size={13} />
                  <span>Audio Story</span>
                </span>

                {/* Video Format Badge & Audio Only Switcher */}
                {isVideoFile && (
                  <button
                    onClick={handleToggleVideoAudioOnly}
                    className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border shadow-sm ${
                      isAudioOnlyActive
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 border-purple-400 text-white'
                        : 'bg-white/10 border-white/20 text-gray-300 hover:text-white'
                    }`}
                    title="Toggle between Video playback and Audio Only listening"
                  >
                    {isAudioOnlyActive ? (
                      <>
                        <Headphones size={12} className="text-cyan-300 animate-pulse" />
                        <span>Mode: Audio Only</span>
                      </>
                    ) : (
                      <>
                        <FileVideo size={12} className="text-purple-300" />
                        <span>Mode: Video Playback</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Top Right Quick Controls: Lights Off, Show Media Art, Sleep Timer */}
              <div className="flex items-center gap-2">
                {/* Sleep Timer */}
                <div className="relative">
                  <button
                    onClick={() => setShowSleepMenu(!showSleepMenu)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                      sleepTimerMinutes !== 0
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:text-white'
                    }`}
                    title="Sleep Timer"
                  >
                    <Timer size={13} />
                    <span>
                      {sleepTimerMinutes === 0
                        ? 'Sleep'
                        : sleepTimerMinutes === -1
                        ? 'End of Track'
                        : `${Math.ceil((sleepTimerRemaining || 0) / 60)}m`}
                    </span>
                  </button>

                  {showSleepMenu && (
                    <div className="absolute right-0 mt-2 w-44 rounded-2xl glass-panel p-2 z-50 border border-white/10 shadow-2xl space-y-1 text-xs">
                      <span className="block px-2.5 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Sleep Timer
                      </span>
                      {[
                        { label: 'Off', val: 0 },
                        { label: '15 Minutes', val: 15 },
                        { label: '30 Minutes', val: 30 },
                        { label: '45 Minutes', val: 45 },
                        { label: '60 Minutes', val: 60 },
                        { label: 'End of Track', val: -1 },
                      ].map(opt => (
                        <button
                          key={opt.label}
                          onClick={() => {
                            setSleepTimerMinutes(opt.val);
                            setShowSleepMenu(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center justify-between ${
                            sleepTimerMinutes === opt.val
                              ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                              : 'text-gray-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {sleepTimerMinutes === opt.val && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Show / Hide Media Art Toggle */}
                <button
                  onClick={handleToggleShowMediaArt}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                    showMediaArt
                      ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                  }`}
                  title={showMediaArt ? 'Don’t Show Media Art' : 'Show Media Art'}
                >
                  {showMediaArt ? <ImageIcon size={13} /> : <EyeOff size={13} />}
                  <span className="hidden sm:inline">{showMediaArt ? 'Art: On' : 'Art: Off'}</span>
                </button>

                {/* Lights Off Toggle */}
                <button
                  onClick={handleToggleLightsOff}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                    lightsOff
                      ? 'bg-purple-600/30 border-purple-500 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:text-white'
                  }`}
                  title={lightsOff ? 'Turn Lights Back On' : 'Lights Off (Cinema Focus)'}
                >
                  {lightsOff ? <Sun size={13} className="text-amber-400" /> : <Moon size={13} />}
                  <span className="hidden sm:inline">{lightsOff ? 'Lights On' : 'Lights Off'}</span>
                </button>
              </div>
            </div>

            {/* ── Audio Center Stage (Visualizer + Cover Art) ─────────────── */}
            {(!isVideoFile || isAudioOnlyActive) && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 relative z-20">
                {/* Media Artwork (when showMediaArt is TRUE) */}
                {showMediaArt ? (
                  <div className="relative group/art">
                    {/* Ambient Glow behind cover */}
                    <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 to-purple-600/20 rounded-3xl blur-2xl group-hover/art:blur-3xl transition-all duration-500 pointer-events-none" />

                    <div className="relative w-44 h-44 sm:w-56 sm:h-56 rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-black/40 flex items-center justify-center">
                      {coverImg ? (
                        <img
                          src={coverImg}
                          alt={storyDetails?.title || 'Story Artwork'}
                          className={`w-full h-full object-cover transition-transform duration-700 ${
                            playerState === 'playing' ? 'scale-105' : 'scale-100'
                          }`}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-cyan-400 gap-2 bg-gradient-to-br from-cyan-950/40 via-purple-950/20 to-black">
                          <Disc size={48} className={playerState === 'playing' ? 'animate-spin' : ''} style={{ animationDuration: '6s' }} />
                          <span className="text-[10px] font-mono tracking-widest uppercase text-gray-400">Audio Story</span>
                        </div>
                      )}

                      {/* Playing Vinyl Badge */}
                      {playerState === 'playing' && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-mono text-cyan-300 flex items-center gap-1 shadow">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                          <span>PLAYING</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Minimalist Waveform / Minimal Info (when showMediaArt is FALSE) */
                  <div className="w-full max-w-md py-6 text-center space-y-4">
                    <div className="p-4 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 inline-block shadow-inner">
                      <Music size={32} className={playerState === 'playing' ? 'animate-bounce' : ''} />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">Distraction Free Audio</span>
                      <h3 className="text-lg font-bold text-white mt-1 line-clamp-1">
                        {track?.title || track?.name}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5 font-medium">
                        {storyDetails?.title || 'Audio Story'} • Track {track?.trackNumber || 1}
                      </p>
                    </div>
                  </div>
                )}

                {/* Animated Audio Equalizer / Visualizer Bars */}
                <div className="flex items-end justify-center gap-1.5 h-10 mt-6 pointer-events-none">
                  {[24, 38, 18, 42, 28, 36, 20, 44, 30, 26, 40, 22, 34, 16, 38, 28].map((h, i) => (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full transition-all duration-200 ${
                        playerState === 'playing'
                          ? 'bg-gradient-to-t from-cyan-400 to-purple-500 animate-pulse'
                          : 'bg-white/15'
                      }`}
                      style={{
                        height: playerState === 'playing' ? `${Math.max(8, (h + (i % 3) * 6))}px` : '6px',
                        animationDelay: `${i * 80}ms`,
                      }}
                    />
                  ))}
                </div>

                {/* Current Track Name & Story Title below art */}
                {showMediaArt && (
                  <div className="text-center mt-4 max-w-lg">
                    <h2 className="text-base sm:text-lg font-bold text-white line-clamp-1">
                      {track?.title || track?.name}
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {storyDetails?.title || 'Audio Story'} • Track {track?.trackNumber || 1} of {tracks.length}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Error or Buffering Display */}
            {playerState === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 z-30 text-center">
                <AlertTriangle size={48} className="text-red-500 mb-3" />
                <h3 className="text-base font-black text-white mb-1">{errorMessage}</h3>
                <p className="text-xs text-gray-400 max-w-md mb-5 leading-relaxed">{errorDetails}</p>
                <button
                  onClick={() => {
                    setPlayerState('loading');
                    const media = mediaElementRef.current;
                    if (media) {
                      media.load();
                      media.play().catch(() => {});
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-500 text-black text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:bg-cyan-400 cursor-pointer"
                >
                  <RefreshCw size={14} /> Retry Playback
                </button>
              </div>
            )}

            {/* ── Bottom Controls Bar ─────────────────────────────────────── */}
            <div className={`p-4 sm:p-5 bg-gradient-to-t from-black via-black/90 to-transparent z-30 transition-opacity duration-300 ${
              showControls || playerState !== 'playing' ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}>
              {/* Scrubber Progress Slider */}
              <div className="space-y-1 mb-3">
                <div
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickPct = (e.clientX - rect.left) / rect.width;
                    const newTime = clickPct * (duration || 0);
                    if (mediaElementRef.current) mediaElementRef.current.currentTime = newTime;
                    setCurrentTime(newTime);
                  }}
                  className="relative w-full h-2 rounded-full bg-white/10 hover:h-2.5 transition-all cursor-pointer overflow-hidden group"
                >
                  {/* Buffer Bar */}
                  <div
                    className="absolute inset-y-0 left-0 bg-white/20 rounded-full"
                    style={{ width: `${bufferPercent}%` }}
                  />
                  {/* Progress Bar */}
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-[11px] font-mono text-gray-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Main Controls Row */}
              <div className="flex items-center justify-between gap-3">
                {/* Left: Previous / Next Track */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevTrack}
                    disabled={currentIndex <= 0}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Previous Track (P)"
                  >
                    <SkipBack size={16} />
                  </button>

                  <button
                    onClick={() => seekRelative(-10)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition cursor-pointer"
                    title="Skip 10s Back (Left Arrow)"
                  >
                    <RotateCcw size={16} />
                  </button>

                  {/* Big Center Play / Pause */}
                  <button
                    onClick={togglePlay}
                    className="p-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-black font-extrabold shadow-lg shadow-cyan-500/25 transition cursor-pointer transform active:scale-95"
                    title={playerState === 'playing' ? 'Pause (Space)' : 'Play (Space)'}
                  >
                    {playerState === 'playing' ? (
                      <Pause size={20} fill="currentColor" />
                    ) : (
                      <Play size={20} fill="currentColor" className="translate-x-0.5" />
                    )}
                  </button>

                  <button
                    onClick={() => seekRelative(10)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition cursor-pointer"
                    title="Skip 10s Forward (Right Arrow)"
                  >
                    <RotateCw size={16} />
                  </button>

                  <button
                    onClick={handleNextTrack}
                    disabled={currentIndex >= tracks.length - 1}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                    title="Next Track (N)"
                  >
                    <SkipForward size={16} />
                  </button>
                </div>

                {/* Right: Volume, Speed, Fullscreen */}
                <div className="flex items-center gap-3">
                  {/* Volume Slider */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleMute}
                      className="p-2 text-gray-300 hover:text-white transition cursor-pointer"
                      title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                    >
                      {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-16 sm:w-24 accent-cyan-400 cursor-pointer h-1.5 rounded-lg bg-white/20"
                    />
                  </div>

                  {/* Playback Speed dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setSpeedMenuOpen(!speedMenuOpen)}
                      className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-gray-300 hover:text-white border border-white/10 transition cursor-pointer"
                      title="Playback Speed"
                    >
                      {playbackSpeed}x
                    </button>

                    {speedMenuOpen && (
                      <div className="absolute right-0 bottom-full mb-2 w-32 rounded-2xl glass-panel p-2 z-50 border border-white/10 shadow-2xl space-y-1 text-xs">
                        <span className="block px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          Speed
                        </span>
                        {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(spd => (
                          <button
                            key={spd}
                            onClick={() => handleSpeedChange(spd)}
                            className={`w-full text-left px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center justify-between ${
                              playbackSpeed === spd
                                ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                                : 'text-gray-300 hover:bg-white/10'
                            }`}
                          >
                            <span>{spd}x</span>
                            {playbackSpeed === spd && <Check size={12} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Fullscreen */}
                  <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                    title="Toggle Fullscreen (F)"
                  >
                    {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Below Player Card: Track & Story Information */}
          <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-white/10 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-white">
                    {track?.title || track?.name}
                  </h1>
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold">
                    Track {track?.trackNumber || 1}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Story: <span className="text-gray-200 font-medium">{storyDetails?.title || storyId}</span>
                  {track?.filePath && (
                    <span className="block text-[11px] font-mono text-gray-500 truncate max-w-xl mt-0.5">
                      {track.filePath}
                    </span>
                  )}
                </p>
              </div>

              {/* Status / Quick Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const allTracks = getLocalAudioTracks(storyId) || [];
                    const isCurrentlyCompleted = Boolean(track?.isWatched);
                    const updated = allTracks.map(t => (t.id === track?.id ? { ...t, isWatched: !isCurrentlyCompleted } : t));
                    setLocalAudioTracks(storyId, updated);
                    if (currentUser?.uid && db) {
                      updateDoc(doc(db, 'users', currentUser.uid, 'audioStories', storyId, 'tracks', track.id), {
                        isWatched: !isCurrentlyCompleted,
                        updatedAt: new Date().toISOString(),
                      }).catch(() => {});
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    track?.isWatched
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:text-white'
                  }`}
                >
                  <CheckCircle2 size={14} />
                  <span>{track?.isWatched ? 'Marked Completed' : 'Mark Completed'}</span>
                </button>

                <button
                  onClick={onBack}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-300 hover:text-white transition cursor-pointer"
                >
                  Back to Story
                </button>
              </div>
            </div>

            {/* Synopsis / Description if available */}
            {storyDetails?.synopsis && (
              <p className="text-xs text-gray-400 leading-relaxed pt-2 border-t border-white/5">
                {storyDetails.synopsis}
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
