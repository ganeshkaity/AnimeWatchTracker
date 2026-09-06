"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, RotateCw, SkipForward, SkipBack, Settings,
  AlertTriangle, RefreshCw, Subtitles, Check, Server,
  Sliders, Info, Activity, Radio, ChevronRight, ChevronLeft, X,
  Search, Menu, Lightbulb, CheckCircle2, Plus, FolderTree,
  Bookmark, Star, Sparkles, SlidersHorizontal, Clock,
  FileVideo, Percent, StickyNote, Zap, Gauge
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { upsertLocalAnime, getLocalEpisodes, setLocalEpisodes, getLocalAnime } from '../../utils/localStore';

// ── HTMLMediaElement Prototype Patch for Piped Remux Duration ────────────────
let _protoPatched = false;
const patchPrototype = () => {
  if (typeof window === 'undefined' || _protoPatched) return;
  try {
    const proto = window.HTMLMediaElement?.prototype;
    if (!proto) return;
    const dDesc = Object.getOwnPropertyDescriptor(proto, 'duration');
    if (dDesc?.get) {
      const origGet = dDesc.get;
      Object.defineProperty(proto, 'duration', {
        configurable: true,
        enumerable: true,
        get() {
          return (this._fakeDuration > 0) ? this._fakeDuration : origGet.call(this);
        },
      });
    }
    _protoPatched = true;
  } catch (e) {
    console.error('[proto patch error]', e);
  }
};
if (typeof window !== 'undefined') patchPrototype();

/**
 * Robust WebVTT / Subtitle timestamp parser
 * Handles HH:MM:SS.mmm, MM:SS.mmm, comma decimals, and trailing align tags
 */
function parseVttTimestamp(rawStr) {
  if (!rawStr) return 0;
  const s = rawStr.trim().replace(',', '.').split(' ')[0];
  const parts = s.split(':').map(p => parseFloat(p) || 0);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
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

/**
 * Extract subfolder name from file path
 */
function getFolderForEp(ep, rootPath) {
  if (ep.folderName) return ep.folderName;
  if (!ep.filePath) return 'Main Episodes';

  const normFile = String(ep.filePath).replace(/\\/g, '/');
  if (rootPath) {
    const normRoot = String(rootPath).replace(/\\/g, '/');
    if (normFile.startsWith(normRoot)) {
      const rel = normFile.slice(normRoot.length).replace(/^\//, '');
      const parts = rel.split('/');
      if (parts.length > 1) return parts[0];
    }
  }

  // Fallback: parent directory name
  const parts = normFile.split('/');
  if (parts.length >= 2) {
    const parent = parts[parts.length - 2];
    if (parent && !parent.includes(':')) return parent;
  }
  return 'Main Episodes';
}

/**
 * Extract natural episode number from filename / path for natural sorting
 */
function extractEpNumber(ep) {
  if (!ep) return null;
  const name = String(ep.fileName || ep.name || ep.title || ep.filePath || '');
  // Match patterns: E05, EP 05, EP-05, Episode 5, S01E05, #05, - 05, [05]
  const m = name.match(/(?:[Ee][Pp][Ii][Ss][Oo][Dd][Ee]|[Ee][Pp]|[Ss]\d{1,2}[Ee]|\b[Ee]|\b#)\s*(\d+(?:\.\d+)?)/i)
    || name.match(/\[(\d+(?:\.\d+)?)\]/)
    || name.match(/(?:^|\s|-|_|v\d)(\d{1,4})(?:\s|-|_|\.|\))/);
  if (m && m[1]) {
    const p = parseFloat(m[1]);
    if (!isNaN(p)) return p;
  }
  const rawNum = typeof ep.episodeNumber === 'number' ? ep.episodeNumber : parseFloat(ep.episodeNumber);
  if (!isNaN(rawNum)) return rawNum;
  return null;
}

export default function MediaServerPlayer({
  animeId,
  episode,
  episodes = [],
  onBack,
  onEpisodeChange,
  initialSpeed = 1,
  initialVolume = 1,
}) {
  const { currentUser } = useAuth();

  // ── State Machine ──────────────────────────────────────────────────────────
  const [playerState, setPlayerState] = useState('idle');

  // ── Core Playback States ───────────────────────────────────────────────────
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(() => episode?.durationSeconds || 0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [bufferAhead, setBufferAhead] = useState(0);
  const [streamStartOffset, setStreamStartOffset] = useState(0);

  const [volume, setVolume] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('watchanime_media_player_volume');
      if (saved !== null) return parseFloat(saved);
    }
    return initialVolume;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(initialSpeed);
  const [customSpeedInput, setCustomSpeedInput] = useState(String(initialSpeed));
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [serverHealth, setServerHealth] = useState('unknown');

  // ── In-Memory Synced Episodes State ────────────────────────────────────────
  const [localEpisodes, setLocalEpisodesState] = useState(() => {
    if (typeof window !== 'undefined' && animeId) {
      const stored = getLocalEpisodes(animeId);
      if (stored && stored.length > 0) {
        return episodes.map((ep) => {
          const s = stored.find((x) => x.id === ep.id);
          return s ? { ...ep, ...s } : ep;
        });
      }
    }
    return episodes;
  });

  useEffect(() => {
    if (episodes && episodes.length > 0) {
      if (typeof window !== 'undefined' && animeId) {
        const stored = getLocalEpisodes(animeId);
        if (stored && stored.length > 0) {
          const merged = episodes.map((ep) => {
            const s = stored.find((x) => x.id === ep.id);
            return s ? { ...ep, ...s } : ep;
          });
          setLocalEpisodesState(merged);
          return;
        }
      }
      setLocalEpisodesState(episodes);
    }
  }, [episodes, animeId]);

  // ── Active Episode Refs for Robust Tracking ─────────────────────────────────
  const activeEpisodeIdRef = useRef(episode?.id);
  const activeEpisodeRef = useRef(episode);

  useEffect(() => {
    activeEpisodeIdRef.current = episode?.id;
    activeEpisodeRef.current = episode;
  }, [episode?.id, episode]);

  // ── Watched Marker State ───────────────────────────────────────────────────
  const [isCurrentWatched, setIsCurrentWatched] = useState(() => !!episode?.isWatched);

  // Sync watched state when episode prop changes
  useEffect(() => {
    setIsCurrentWatched(!!episode?.isWatched);
  }, [episode?.id, episode?.isWatched]);

  // ── Quick Controls ─────────────────────────────────────────────────────────
  const [lightOn, setLightOn] = useState(true);
  const [ambientMode, setAmbientMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('watchanime_ambient_mode');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  const [autoPlay, setAutoPlay] = useState(true);
  const [autoNext, setAutoNext] = useState(true);
  const [autoSkipIntro, setAutoSkipIntro] = useState(false);

  const toggleAmbientMode = () => {
    setAmbientMode((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('watchanime_ambient_mode', String(next));
      }
      return next;
    });
  };

  // ── Resolved Media Info ────────────────────────────────────────────────────
  const [mediaId, setMediaId] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [audioTracks, setAudioTracks] = useState([]);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [selectedAudioIndex, setSelectedAudioIndex] = useState(null); // null = default
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(-1); // will default to English
  const [subtitleCues, setSubtitleCues] = useState([]);
  const [currentSubtitleText, setCurrentSubtitleText] = useState('');

  // ── Subtitle Customization Appearance Options ─────────────────────────────
  const [subSettingsOpen, setSubSettingsOpen] = useState(false);
  const [subFontSize, setSubFontSize] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('watchanime_sub_fontsize') || '18', 10);
    }
    return 18;
  });
  const [subTextColor, setSubTextColor] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('watchanime_sub_textcolor') || '#facc15';
    }
    return '#facc15';
  });
  const [subBgColor, setSubBgColor] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('watchanime_sub_bgcolor') || '#000000';
    }
    return '#000000';
  });
  const [subBgOpacity, setSubBgOpacity] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseFloat(localStorage.getItem('watchanime_sub_bgopacity') || '0.25');
    }
    return 0.25;
  });
  const [subOutline, setSubOutline] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('watchanime_sub_outline') || 'heavy';
    }
    return 'heavy';
  });
  const [subBoxBorder, setSubBoxBorder] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('watchanime_sub_box_border');
      return saved !== null ? saved === 'true' : false;
    }
    return false;
  });
  const [subDelay, setSubDelay] = useState(0); // in seconds, +/- 5s

  // Save subtitle customization to localStorage
  const updateSubSetting = (key, val) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`watchanime_sub_${key}`, String(val));
    }
  };

  // ── Folder-Wise Episode Grouping ───────────────────────────────────────────
  const [selectedFolderKey, setSelectedFolderKey] = useState('');
  const [epSearch, setEpSearch] = useState('');

  // ── Hover Tooltip State for Episode Details ────────────────────────────────
  const [hoveredEp, setHoveredEp] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // ── Scrubbing & Seeking ────────────────────────────────────────────────────
  const [isScrubbing, setIsScrubbing] = useState(false);

  // ── Overlay Feedback Animations (Seek, Play/Pause, Speed) ──────────────────
  const [seekFeedback, setSeekFeedback] = useState(null); // { side: 'left' | 'right', text: '10s', key: number }
  const [playPauseFeedback, setPlayPauseFeedback] = useState(null); // { isPlaying: boolean, key: number }
  const [speedToast, setSpeedToast] = useState(null); // { speed: number, key: number }

  const seekFeedbackTimeoutRef = useRef(null);
  const playPauseFeedbackTimeoutRef = useRef(null);
  const speedToastTimeoutRef = useRef(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const videoRef = useRef(null);
  const videoWrapperRef = useRef(null); // Reference for fullscreen of the anime video only!
  const ambientCanvasA = useRef(null);
  const ambientCanvasB = useRef(null);
  const activeAmbientLayerRef = useRef('A');
  const ambientTransitionTimeoutRef = useRef(null);
  const progressBarRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const lastSavedTimeRef = useRef(0);
  const metadataDurationRef = useRef(episode?.durationSeconds || 0);
  const isWatchedMarkedRef = useRef(false);
  const savedPositionRestoredRef = useRef(false);
  const lastEpisodeIdRef = useRef(null);

  // ── Derived Values & Callbacks ─────────────────────────────────────────────
  const effectiveDuration = duration > 4 ? duration : (metadataDurationRef.current || episode?.durationSeconds || 0);

  const calcEpPercentage = useCallback((ep) => {
    if (!ep) return 0;
    const isCurrent = ep.id === episode?.id;
    const isWatched = isCurrent ? (isCurrentWatched || ep.isWatched) : ep.isWatched;
    if (isWatched) return 100;

    const dur = (isCurrent ? (effectiveDuration > 4 ? effectiveDuration : (metadataDurationRef.current || ep.durationSeconds)) : ep.durationSeconds) || 0;
    const pos = (isCurrent ? currentTime : (ep.lastPositionSeconds || ep.watchedSeconds)) || 0;

    if (!dur || dur <= 0) {
      return pos > 5 ? 10 : 0;
    }
    return Math.min(100, Math.max(0, Math.round((pos / dur) * 100)));
  }, [episode?.id, isCurrentWatched, effectiveDuration, currentTime]);

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

  // ── YouTube-Style Two-Layer Ambient Crossfade (Flicker-Free Ping-Pong) ────
  useEffect(() => {
    if (!ambientMode || isFullscreen) return;

    const cA = ambientCanvasA.current;
    const cB = ambientCanvasB.current;
    const video = videoRef.current;
    if (!cA || !cB || !video) return;

    const ctxA = cA.getContext('2d', { alpha: false, willReadFrequently: false });
    const ctxB = cB.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!ctxA || !ctxB) return;

    // Reset initial layer states: Layer A visible, Layer B hidden
    cA.style.transition = 'none';
    cB.style.transition = 'none';
    cA.style.opacity = '1';
    cA.style.zIndex = '1';
    cB.style.opacity = '0';
    cB.style.zIndex = '1';
    activeAmbientLayerRef.current = 'A';

    let intervalTimer = null;
    let isTransitioning = false;

    const crossfadeToNewFrame = () => {
      if (!video || video.ended || video.readyState < 2 || isTransitioning) return;

      const isCurrentA = activeAmbientLayerRef.current === 'A';
      const hiddenCanvas = isCurrentA ? cB : cA;
      const visibleCanvas = isCurrentA ? cA : cB;
      const hiddenCtx = isCurrentA ? ctxB : ctxA;

      try {
        // 1. Render new downscaled frame completely into the hidden layer first (16x9 px for minimal CPU & RAM usage)
        hiddenCtx.drawImage(video, 0, 0, 16, 9);

        // 2. Prepare hidden layer on top (zIndex: 2, opacity: 0) while keeping visible layer underneath solid (zIndex: 1, opacity: 1)
        hiddenCanvas.style.transition = 'none';
        hiddenCanvas.style.opacity = '0';
        hiddenCanvas.style.zIndex = '2';
        visibleCanvas.style.zIndex = '1';

        // Force reflow so zero opacity is committed before transition starts
        void hiddenCanvas.offsetHeight;

        // 3. Smoothly fade in hidden layer over 600ms (visible layer underneath stays at opacity: 1, preventing any brightness dip or gap)
        isTransitioning = true;
        hiddenCanvas.style.transition = 'opacity 600ms ease-in-out';
        hiddenCanvas.style.opacity = '1';

        // 4. When crossfade completes, reset previous layer to opacity 0 behind the top layer
        if (ambientTransitionTimeoutRef.current) clearTimeout(ambientTransitionTimeoutRef.current);
        ambientTransitionTimeoutRef.current = setTimeout(() => {
          visibleCanvas.style.transition = 'none';
          visibleCanvas.style.opacity = '0';
          visibleCanvas.style.zIndex = '1';
          hiddenCanvas.style.zIndex = '1';
          activeAmbientLayerRef.current = isCurrentA ? 'B' : 'A';
          isTransitioning = false;
        }, 620);
      } catch (e) {
        // Silently ignore cross-origin or video decoding errors
      }
    };

    if (playerState === 'playing') {
      crossfadeToNewFrame();
      intervalTimer = setInterval(crossfadeToNewFrame, 700);
    } else if (playerState === 'ready' || playerState === 'paused') {
      crossfadeToNewFrame();
    }

    return () => {
      if (intervalTimer) clearInterval(intervalTimer);
      if (ambientTransitionTimeoutRef.current) clearTimeout(ambientTransitionTimeoutRef.current);
    };
  }, [ambientMode, playerState, isFullscreen]);

  // Remux check
  const isRemuxing = useMemo(() => {
    return !!(episode?.filePath?.toLowerCase().endsWith('.mkv') || selectedAudioIndex !== null);
  }, [episode?.filePath, selectedAudioIndex]);

  // Derive adjacent episodes
  const currentIndex = useMemo(() => {
    return localEpisodes.findIndex((e) => e.id === episode?.id);
  }, [localEpisodes, episode?.id]);

  const prevEpisode = currentIndex > 0 ? localEpisodes[currentIndex - 1] : null;
  const nextEpisode = currentIndex >= 0 && currentIndex < localEpisodes.length - 1 ? localEpisodes[currentIndex + 1] : null;

  // ── 1. Group Episodes Folder-Wise with Sequential Counting & Natural Sort ─
  const folderGroups = useMemo(() => {
    if (!localEpisodes || localEpisodes.length === 0) return [];

    const localAnime = animeId ? getLocalAnime(animeId) : null;
    const rootPath = localAnime?.folderPath || '';

    const groupsMap = new Map();

    localEpisodes.forEach((ep) => {
      const folder = getFolderForEp(ep, rootPath);
      if (!groupsMap.has(folder)) {
        groupsMap.set(folder, []);
      }
      groupsMap.get(folder).push(ep);
    });

    // Natural sort folders (e.g. Main Episodes first, then Season 1, Season 2, Part 1, Part 2, etc.)
    const sortedFolders = Array.from(groupsMap.keys()).sort((a, b) => {
      if (a === 'Main Episodes' && b !== 'Main Episodes') return -1;
      if (b === 'Main Episodes' && a !== 'Main Episodes') return 1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Compute continuous index across all folders (First folder Ep 1 = 1, Last folder Ep End = Total)
    let runningGlobalIndex = 1;

    return sortedFolders.map((folderName) => {
      const rawFolderEps = groupsMap.get(folderName) || [];

      // Naturally sort episodes within this folder by parsed episode number or filename
      const sortedFolderEps = [...rawFolderEps].sort((a, b) => {
        const numA = extractEpNumber(a);
        const numB = extractEpNumber(b);
        if (numA !== null && numB !== null && numA !== numB) {
          return numA - numB;
        }
        const nameA = String(a.fileName || a.name || a.filePath || a.title || '');
        const nameB = String(b.fileName || b.name || b.filePath || b.title || '');
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      });

      const numberedEps = sortedFolderEps.map((ep, localIdx) => {
        const folderEpNum = localIdx + 1; // 1 to folder end
        const continuousNum = runningGlobalIndex++; // 1 to total anime end
        return {
          ...ep,
          folderEpNum,
          continuousNum,
          folderName,
        };
      });

      return {
        folderName: folderName || 'Main Episodes',
        episodes: numberedEps,
        count: numberedEps.length,
      };
    });
  }, [localEpisodes, animeId]);

  // Determine active folder ONLY when the episode ID actually changes or on initial load
  useEffect(() => {
    if (!episode?.id || folderGroups.length === 0) return;
    if (lastEpisodeIdRef.current !== episode.id) {
      lastEpisodeIdRef.current = episode.id;
      const activeGroup = folderGroups.find(g => g.episodes.some(e => e.id === episode.id));
      if (activeGroup) {
        setSelectedFolderKey(activeGroup.folderName);
      } else if (!selectedFolderKey) {
        setSelectedFolderKey(folderGroups[0].folderName);
      }
    }
  }, [episode?.id]);

  // Fallback initial selection on first render
  useEffect(() => {
    if (!selectedFolderKey && folderGroups.length > 0) {
      const activeGroup = folderGroups.find(g => g.episodes.some(e => e.id === episode?.id));
      setSelectedFolderKey(activeGroup ? activeGroup.folderName : folderGroups[0].folderName);
    }
  }, [folderGroups, episode?.id, selectedFolderKey]);

  // Current active folder's episodes (or all if 'ALL' selected)
  const visibleEpisodes = useMemo(() => {
    let list = [];
    if (selectedFolderKey === 'ALL') {
      list = folderGroups.flatMap(g => g.episodes);
    } else {
      const group = folderGroups.find(g => g.folderName === selectedFolderKey) || folderGroups[0];
      list = group?.episodes || [];
    }

    if (!epSearch.trim()) return list;

    const query = epSearch.trim().toLowerCase();
    return list.filter(ep => {
      const numStr = String(ep.folderEpNum || '');
      const contStr = String(ep.continuousNum || '');
      const rawNum = String(ep.episodeNumber || '');
      const fName = String(ep.fileName || '').toLowerCase();
      return numStr === query || contStr === query || rawNum.includes(query) || fName.includes(query);
    });
  }, [folderGroups, selectedFolderKey, epSearch]);

  // ── 2. Fullscreen Listener on Document (Only fullscreens video wrapper) ────
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // ── 3. Resolve Media ID on Windows Server ──────────────────────────────────
  useEffect(() => {
    if (!episode) return;

    activeEpisodeIdRef.current = episode.id;
    activeEpisodeRef.current = episode;

    let isMounted = true;
    setPlayerState('loading');
    setErrorMessage('');
    setErrorDetails('');
    setStreamStartOffset(0);
    setBufferedEnd(0);
    setBufferAhead(0);
    setMediaId('');
    setMetadata(null);
    setAudioTracks([]);
    setSubtitleTracks([]);
    setSubtitleCues([]);
    setCurrentSubtitleText('');

    // Stop and pause previous video immediately to prevent old video tick events from firing
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } catch {}
    }

    const initPos = episode.lastPositionSeconds || 0;
    setCurrentTime(initPos);
    lastSavedTimeRef.current = initPos;
    isWatchedMarkedRef.current = !!episode.isWatched;
    setIsCurrentWatched(!!episode.isWatched);
    savedPositionRestoredRef.current = false;

    // Use known episode duration while metadata fetches
    if (episode.durationSeconds && episode.durationSeconds > 4) {
      metadataDurationRef.current = episode.durationSeconds;
      setDuration(episode.durationSeconds);
    } else {
      metadataDurationRef.current = 0;
      setDuration(0);
    }

    const resolve = async () => {
      try {
        // Pre-flight health check
        try {
          const healthRes = await fetch('/health', { signal: AbortSignal.timeout(3000) });
          if (healthRes.ok) setServerHealth('online');
          else setServerHealth('offline');
        } catch {
          setServerHealth('offline');
        }

        // Register media file on server to obtain clean media ID
        const res = await fetch('/api/media/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            animeId,
            episodeId: episode.id,
            filePath: episode.filePath,
            fileName: episode.fileName,
          }),
        });

        const data = await res.json();
        if (!isMounted) return;

        if (data.success && data.mediaId) {
          setMediaId(data.mediaId);

          // Fetch metadata non-blocking to get exact duration, audio tracks, and subtitle tracks
          fetch(`/media/${encodeURIComponent(data.mediaId)}/metadata`)
            .then((mRes) => mRes.json())
            .then((mData) => {
              if (!isMounted || !mData.success) return;
              setMetadata(mData.metadata);

              if (mData.metadata.audioTracks?.length) {
                setAudioTracks(mData.metadata.audioTracks);
              }

              // Subtitle track processing: ALWAYS DEFAULT TO ENGLISH SUBTITLES!
              if (mData.metadata.subtitleTracks?.length) {
                setSubtitleTracks(mData.metadata.subtitleTracks);

                const engTrack = mData.metadata.subtitleTracks.find((t) => {
                  const lang = (t.language || '').toLowerCase();
                  const title = (t.title || '').toLowerCase();
                  return (
                    lang === 'eng' ||
                    lang === 'en' ||
                    lang === 'english' ||
                    title.includes('eng') ||
                    title.includes('english')
                  );
                });

                if (engTrack) {
                  setSelectedSubtitleIndex(engTrack.index);
                } else {
                  // Default to first track if English is not explicitly tagged
                  setSelectedSubtitleIndex(mData.metadata.subtitleTracks[0].index);
                }
              }

              if (mData.metadata.duration && mData.metadata.duration > 4) {
                metadataDurationRef.current = mData.metadata.duration;
                setDuration(mData.metadata.duration);
                if (videoRef.current) {
                  videoRef.current._fakeDuration = mData.metadata.duration;
                }
              }
            })
            .catch((mErr) => {
              console.warn('[MediaServerPlayer] Metadata fetch notice:', mErr);
            });

        } else {
          setPlayerState('error');
          setErrorMessage('Episode Unavailable');
          setErrorDetails(data.error || 'The Windows media server could not resolve this episode file.');
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
  }, [animeId, episode?.id, episode?.filePath]);

  // ── 4. Handle Video Source & Audio Track Switching ─────────────────────────
  useEffect(() => {
    if (!mediaId || !videoRef.current) return;

    let finalSrc = `/media/${encodeURIComponent(mediaId)}/stream`;
    const params = [];
    if (selectedAudioIndex !== null) {
      params.push(`audioIndex=${selectedAudioIndex}`);
    }
    if (isRemuxing && streamStartOffset > 0) {
      params.push(`ss=${streamStartOffset.toFixed(3)}`);
    }
    if (params.length > 0) {
      finalSrc += `?${params.join('&')}`;
    }

    const video = videoRef.current;
    if (video.src !== finalSrc) {
      video.src = finalSrc;
      video.load();
      if (playerState === 'playing' || autoPlay) {
        video.play().catch(() => {});
      }
    }
  }, [mediaId, selectedAudioIndex, isRemuxing, streamStartOffset]);

  // ── 5. Subtitle Cue Loading with Robust Timestamp Parsing ──────────────────
  useEffect(() => {
    if (!mediaId || selectedSubtitleIndex === -1) {
      setSubtitleCues([]);
      setCurrentSubtitleText('');
      return;
    }

    let isCancelled = false;
    const fetchSubtitles = async () => {
      try {
        const res = await fetch(`/media/${encodeURIComponent(mediaId)}/subtitles?index=${selectedSubtitleIndex}`);
        if (!res.ok) throw new Error('Subtitles not available');
        const vttText = await res.text();
        if (isCancelled) return;

        const cues = [];
        const blocks = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/);

        for (const block of blocks) {
          const lines = block.trim().split('\n');
          const tIdx = lines.findIndex((l) => l.includes('-->'));
          if (tIdx === -1) continue;

          const [startRaw, endRaw] = lines[tIdx].split('-->');
          const startSec = parseVttTimestamp(startRaw);
          const endSec = parseVttTimestamp(endRaw);

          const text = lines
            .slice(tIdx + 1)
            .join('\n')
            .replace(/\{[^}]*\}/g, '') // clean ASS formatting tags
            .replace(/<[^>]+>/g, '') // clean html tags
            .trim();

          if (!text || isNaN(startSec) || isNaN(endSec) || endSec <= startSec) continue;

          cues.push({
            start: startSec,
            end: endSec,
            text,
          });
        }

        // Sort cues by start time for consistent binary search
        cues.sort((a, b) => a.start - b.start);
        setSubtitleCues(cues);
      } catch (err) {
        console.warn('[MediaServerPlayer] Subtitle error:', err.message);
        setSubtitleCues([]);
      }
    };

    fetchSubtitles();
    return () => {
      isCancelled = true;
    };
  }, [mediaId, selectedSubtitleIndex]);

  // ── 6. Track Current Subtitle by Time (with sync offset support) ───────────
  useEffect(() => {
    if (subtitleCues.length === 0) {
      if (currentSubtitleText) setCurrentSubtitleText('');
      return;
    }

    const effectiveTime = currentTime + subDelay;
    const activeCue = subtitleCues.find(
      (c) => effectiveTime >= c.start && effectiveTime <= c.end
    );
    setCurrentSubtitleText(activeCue ? activeCue.text : '');
  }, [currentTime, subDelay, subtitleCues]);

  // ── 7. Buffer Monitoring ───────────────────────────────────────────────────
  const updateBufferMetrics = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const cur = isRemuxing ? (streamStartOffset + video.currentTime) : video.currentTime;
    let maxBuf = 0;

    for (let i = 0; i < video.buffered.length; i++) {
      const bStart = (isRemuxing ? streamStartOffset : 0) + video.buffered.start(i);
      const bEnd = (isRemuxing ? streamStartOffset : 0) + video.buffered.end(i);
      if (bStart <= cur && bEnd >= cur) {
        maxBuf = bEnd;
        break;
      }
      if (bEnd > maxBuf) {
        maxBuf = bEnd;
      }
    }

    setBufferedEnd(maxBuf);
    setBufferAhead(Math.max(0, maxBuf - cur));
  }, [isRemuxing, streamStartOffset]);

  // ── 8. Debounced Firestore Progress Sync ──────────────────────────────────
  const syncProgressToStore = useCallback((time, dur, markWatched = false) => {
    const currentEp = activeEpisodeRef.current || episode;
    const currentEpId = activeEpisodeIdRef.current || currentEp?.id;
    if (!animeId || !currentEpId) return;
    if (isNaN(time) || time < 0) return;

    const roundTime = Math.floor(time);
    lastSavedTimeRef.current = roundTime;

    const currentDuration = dur || duration || metadataDurationRef.current || currentEp?.durationSeconds || 1;
    const progressPct = currentDuration > 0 ? Math.min(100, Math.round((roundTime / currentDuration) * 100)) : 0;
    const shouldMarkWatched = markWatched || progressPct >= 90 || isWatchedMarkedRef.current;

    if (shouldMarkWatched) {
      setIsCurrentWatched(true);
      isWatchedMarkedRef.current = true;
    }

    // Update in-memory localEpisodes state immediately so UI/sidebar/tooltip reflects changes in real-time
    setLocalEpisodesState((prev) =>
      prev.map((e) =>
        e.id === currentEpId
          ? {
            ...e,
            lastPositionSeconds: roundTime,
            durationSeconds: Math.floor(currentDuration) > 0 ? Math.floor(currentDuration) : e.durationSeconds,
            isWatched: shouldMarkWatched,
          }
          : e
      )
    );

    // Update Local Storage
    try {
      const storedEps = getLocalEpisodes(animeId) || [];
      let found = false;
      const updated = storedEps.map((e) => {
        if (e.id === currentEpId) {
          found = true;
          return {
            ...e,
            lastPositionSeconds: roundTime,
            durationSeconds: Math.floor(currentDuration) > 0 ? Math.floor(currentDuration) : e.durationSeconds,
            isWatched: shouldMarkWatched,
          };
        }
        return e;
      });

      if (!found && currentEp) {
        updated.push({
          ...currentEp,
          lastPositionSeconds: roundTime,
          durationSeconds: Math.floor(currentDuration),
          isWatched: shouldMarkWatched,
        });
      }

      setLocalEpisodes(animeId, updated);

      const totalAnimeEps = updated.length;
      const watchedAnimeEps = updated.filter((e) => e.isWatched).length;
      const animeProgressPercent = totalAnimeEps > 0 ? Math.round((watchedAnimeEps / totalAnimeEps) * 100) : 0;

      upsertLocalAnime({
        id: animeId,
        lastWatchedEpisode: currentEp?.episodeNumber ? `EP-${currentEp.episodeNumber}` : '',
        lastOpenedAt: new Date().toISOString(),
        progressPercent: animeProgressPercent,
      });
    } catch (e) {
      console.warn('[MediaServerPlayer] LocalStore sync error:', e);
    }

    // Remote Firestore sync
    if (currentUser && db) {
      try {
        const epRef = doc(db, 'users', currentUser.uid, 'anime', animeId, 'episodes', currentEpId);
        updateDoc(epRef, {
          watchedSeconds: roundTime,
          durationSeconds: Math.floor(currentDuration),
          lastPositionSeconds: roundTime,
          isWatched: shouldMarkWatched,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});

        const animeRef = doc(db, 'users', currentUser.uid, 'anime', animeId);
        const storedEps = getLocalEpisodes(animeId) || [];
        const totalAnimeEps = storedEps.length;
        const watchedAnimeEps = storedEps.filter((e) => e.isWatched).length;
        const animeProgressPercent = totalAnimeEps > 0 ? Math.round((watchedAnimeEps / totalAnimeEps) * 100) : 0;
        updateDoc(animeRef, {
          progressPercent: animeProgressPercent,
          lastWatchedEpisode: currentEp?.episodeNumber ? `EP-${currentEp.episodeNumber}` : '',
          lastOpenedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      } catch (err) {
        console.warn('[MediaServerPlayer] Firestore sync error:', err);
      }
    }
  }, [animeId, episode, duration, currentUser]);

  // Toggle Watched / Unwatched Handler
  const handleToggleWatched = () => {
    const nextWatched = !isCurrentWatched;
    setIsCurrentWatched(nextWatched);
    isWatchedMarkedRef.current = nextWatched;

    const effDur = duration > 4 ? duration : (metadataDurationRef.current || episode?.durationSeconds || 1);
    const newPos = nextWatched ? Math.floor(effDur) : 0;

    syncProgressToStore(newPos, effDur, nextWatched);
  };

  // Periodic Firestore Progress Save (every 6s)
  useEffect(() => {
    if (playerState !== 'playing' || !mediaId) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended) return;
      const absTime = isRemuxing ? (streamStartOffset + video.currentTime) : video.currentTime;
      if (Math.abs(absTime - lastSavedTimeRef.current) >= 6) {
        syncProgressToStore(absTime, duration);
      }
    }, 6000);

    return () => clearInterval(interval);
  }, [playerState, mediaId, isRemuxing, streamStartOffset, duration, syncProgressToStore]);

  // Page Exit Sync
  useEffect(() => {
    const handleBeforeUnload = () => {
      const video = videoRef.current;
      if (video) {
        const absTime = isRemuxing ? (streamStartOffset + video.currentTime) : video.currentTime;
        if (absTime > 0) {
          syncProgressToStore(absTime, duration);
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRemuxing, streamStartOffset, duration, syncProgressToStore]);

  // ── 9. Native Media Event Handlers ─────────────────────────────────────────
  const handleLoadStart = () => {
    setPlayerState('loading');
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    const vidDuration = video.duration;
    // CRITICAL: Remuxed piped streams return 1s or Infinity. Ignore values <= 4!
    if (!isNaN(vidDuration) && vidDuration > 4 && isFinite(vidDuration)) {
      setDuration(vidDuration);
      video._fakeDuration = vidDuration;
    } else if (metadataDurationRef.current > 4) {
      setDuration(metadataDurationRef.current);
      video._fakeDuration = metadataDurationRef.current;
    } else if (episode?.durationSeconds > 4) {
      setDuration(episode.durationSeconds);
      video._fakeDuration = episode.durationSeconds;
    }

    // Resume saved playback position
    if (!savedPositionRestoredRef.current) {
      savedPositionRestoredRef.current = true;
      const savedPos = episode?.lastPositionSeconds || 0;
      const targetDur = duration || metadataDurationRef.current || episode?.durationSeconds || 0;
      if (savedPos > 5 && targetDur && savedPos < targetDur - 10) {
        if (isRemuxing) {
          setStreamStartOffset(savedPos);
          setCurrentTime(savedPos);
        } else {
          video.currentTime = savedPos;
          setCurrentTime(savedPos);
        }
      }
    }

    video.playbackRate = playbackSpeed;
    video.volume = volume;
    video.muted = isMuted;

    setPlayerState('ready');
  };

  const handleCanPlay = () => {
    if (playerState === 'loading' || playerState === 'buffering') {
      setPlayerState('ready');
    }
    if (autoPlay && playerState !== 'playing' && playerState !== 'paused') {
      videoRef.current?.play().catch(() => {});
    }
  };

  const handleWaiting = () => {
    setPlayerState('buffering');
    updateBufferMetrics();
  };

  const handlePlaying = () => {
    setPlayerState('playing');
    updateBufferMetrics();
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      setSpeedMenuOpen(false);
    }, 3000);
  };

  const handlePause = () => {
    if (playerState !== 'ended' && playerState !== 'error') {
      setPlayerState('paused');
    }
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    const video = videoRef.current;
    if (video && mediaId) {
      const absTime = isRemuxing ? (streamStartOffset + video.currentTime) : video.currentTime;
      syncProgressToStore(absTime, duration);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || isScrubbing) return;

    const absNow = isRemuxing ? (streamStartOffset + video.currentTime) : video.currentTime;
    setCurrentTime(absNow);
    updateBufferMetrics();

    // Watched check >= 90%
    const currentDur = duration || metadataDurationRef.current || episode?.durationSeconds || 0;
    if (currentDur > 10 && absNow >= currentDur * 0.9) {
      if (!isWatchedMarkedRef.current || !isCurrentWatched) {
        isWatchedMarkedRef.current = true;
        setIsCurrentWatched(true);
        syncProgressToStore(absNow, currentDur, true);
      }
    }
  };

  const handleEnded = () => {
    setPlayerState('ended');
    const currentDur = duration || metadataDurationRef.current || episode?.durationSeconds || 1;
    isWatchedMarkedRef.current = true;
    setIsCurrentWatched(true);
    syncProgressToStore(currentDur, currentDur, true);

    // Auto next transition
    if (autoNext && nextEpisode && onEpisodeChange) {
      onEpisodeChange(nextEpisode);
    }
  };

  const handleError = () => {
    setPlayerState('error');
    setErrorMessage('Playback Interrupted');
    setErrorDetails('An error occurred during video decoding or streaming. Click Retry below.');
  };

  // ── Overlay Feedback Triggers ─────────────────────────────────────────────
  const triggerSpeedToast = useCallback((spd) => {
    if (speedToastTimeoutRef.current) clearTimeout(speedToastTimeoutRef.current);
    setSpeedToast({ speed: spd, key: Date.now() });
    speedToastTimeoutRef.current = setTimeout(() => {
      setSpeedToast(null);
    }, 850);
  }, []);

  const triggerSeekAnimation = useCallback((side, text = '10s') => {
    if (seekFeedbackTimeoutRef.current) clearTimeout(seekFeedbackTimeoutRef.current);
    setSeekFeedback({ side, text, key: Date.now() });
    seekFeedbackTimeoutRef.current = setTimeout(() => {
      setSeekFeedback(null);
    }, 700);
  }, []);

  const triggerPlayPauseAnimation = useCallback((isPlaying) => {
    if (playPauseFeedbackTimeoutRef.current) clearTimeout(playPauseFeedbackTimeoutRef.current);
    setPlayPauseFeedback({ isPlaying, key: Date.now() });
    playPauseFeedbackTimeoutRef.current = setTimeout(() => {
      setPlayPauseFeedback(null);
    }, 700);
  }, []);

  // ── 10. Playback & Seeking Controls ────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (playerState === 'playing') {
      video.pause();
      triggerPlayPauseAnimation(false);
    } else {
      video.play().catch(() => {});
      triggerPlayPauseAnimation(true);
    }
  }, [playerState, triggerPlayPauseAnimation]);

  const performSeek = useCallback((targetSeconds) => {
    const video = videoRef.current;
    if (!video) return;

    const dur = duration || metadataDurationRef.current || episode?.durationSeconds || 1;
    const clamped = Math.max(0, Math.min(dur, targetSeconds));

    if (isRemuxing) {
      setStreamStartOffset(clamped);
      setCurrentTime(clamped);
      let finalSrc = `/media/${encodeURIComponent(mediaId)}/stream?ss=${clamped.toFixed(3)}`;
      if (selectedAudioIndex !== null) {
        finalSrc += `&audioIndex=${selectedAudioIndex}`;
      }
      video.src = finalSrc;
      video.load();
      video.play().catch(() => {});
    } else {
      video.currentTime = clamped;
      setCurrentTime(clamped);
    }
  }, [duration, episode?.durationSeconds, isRemuxing, mediaId, selectedAudioIndex]);

  const seekRelative = useCallback((delta) => {
    const video = videoRef.current;
    if (!video) return;
    const absNow = isRemuxing ? (streamStartOffset + video.currentTime) : video.currentTime;

    // Trigger side vignette animation (left for 10s back, right for 10s next) with no box outline
    triggerSeekAnimation(delta > 0 ? 'right' : 'left', `${Math.abs(delta)}s`);

    performSeek(absNow + delta);
  }, [isRemuxing, streamStartOffset, performSeek, triggerSeekAnimation]);

  // Scrubbing on Seekbar
  const handleSeekbarClick = (e) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetDur = duration || metadataDurationRef.current || episode?.durationSeconds || 1;
    performSeek(pos * targetDur);
  };

  // Volume slider
  const handleVolumeChange = (newVol) => {
    const v = Math.max(0, Math.min(1, newVol));
    setVolume(v);
    setIsMuted(v === 0);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('watchanime_media_player_volume', String(v));
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (videoRef.current) {
      videoRef.current.muted = nextMute;
    }
  };

  // Playback Speed Change (Supports up to 10x with optional toast)
  const handleSpeedChange = useCallback((spd, showToast = false) => {
    const clamped = Math.max(0.25, Math.min(10.0, Math.round((parseFloat(spd) || 1.0) * 100) / 100));
    setPlaybackSpeed(clamped);
    setCustomSpeedInput(String(clamped));
    if (videoRef.current) {
      videoRef.current.playbackRate = clamped;
    }
    if (showToast) {
      triggerSpeedToast(clamped);
    }
  }, [triggerSpeedToast]);

  // ── ONLY FULLSCREEN THE VIDEO WRAPPER ───────────────────────────────────────
  const toggleFullscreen = () => {
    const el = videoWrapperRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Picture in Picture
  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP error:', e);
    }
  };

  // Keyboard Shortcuts (Space/K for Play/Pause, ArrowLeft/J for -10s, ArrowRight/L for +10s, Shift+>/Shift+< for 0.5x speed)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

      // Speed Up: Shift + > or > (Shift + . on standard US keyboards)
      const isSpeedUp = (e.shiftKey && (e.key === '>' || e.key === '.' || e.code === 'Period')) || e.key === '>';
      // Speed Down: Shift + < or < (Shift + , on standard US keyboards)
      const isSpeedDown = (e.shiftKey && (e.key === '<' || e.key === ',' || e.code === 'Comma')) || e.key === '<';

      if (isSpeedUp) {
        e.preventDefault();
        const nextSpeed = Math.min(10.0, Math.round((playbackSpeed + 0.5) * 10) / 10);
        handleSpeedChange(nextSpeed, true);
        return;
      }

      if (isSpeedDown) {
        e.preventDefault();
        const nextSpeed = Math.max(0.25, Math.round((playbackSpeed - 0.5) * 10) / 10);
        handleSpeedChange(nextSpeed, true);
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          seekRelative(-10);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
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
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekRelative, volume, toggleMute, playbackSpeed, handleSpeedChange]);

  // Auto-hide controls
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    const video = videoRef.current;
    const isPlaying = video ? !video.paused : playerState === 'playing';
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setSpeedMenuOpen(false);
      }, 3000);
    }
  }, [playerState]);

  const handleRetry = () => {
    setPlayerState('loading');
    setErrorMessage('');
    const video = videoRef.current;
    if (video) {
      video.load();
      video.play().catch(() => {});
    }
  };

  // Subtitle Outline Styling
  // Subtitle Outline Styling: Simple clean solid black outline (no dotted or jagged shadow)
  const getSubOutlineStyle = () => {
    switch (subOutline) {
      case 'none':
        return {};
      case 'heavy':
      case 'outline':
        return {
          WebkitTextStroke: '1.5px #000000',
          paintOrder: 'stroke fill',
          textShadow: '0 2px 4px rgba(0,0,0,0.85)',
        };
      case 'glow':
        return {
          textShadow: `0 0 8px ${subTextColor}, 0 0 16px rgba(0,0,0,0.95)`,
        };
      case 'shadow':
      default:
        return {
          textShadow: '0 2px 4px rgba(0,0,0,0.95)',
        };
    }
  };

  const progressPercent = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const bufferPercent = effectiveDuration > 0 ? Math.min(100, (bufferedEnd / effectiveDuration) * 100) : 0;

  return (
    <div
      className={`w-full min-h-screen bg-[#07090f] text-white select-none transition-colors duration-300 ${!lightOn ? 'bg-black' : ''
        }`}
    >
      {/* Light Off theater backdrop overlay */}
      {!lightOn && (
        <div
          onClick={() => setLightOn(true)}
          className="fixed inset-0 bg-black/85 z-20 cursor-pointer pointer-events-auto transition-opacity"
          title="Click anywhere to turn lights back On"
        />
      )}

      {/* Main Grid: Left Episodes Column + Right Player & Controls Column */}
      <div className="max-w-[1700px] mx-auto p-2 sm:p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10">

        {/* ── LEFT COLUMN: Folder-Wise Episode Selector (Transparent Liquid Glass) ─────────────────────── */}
        <div className="lg:col-span-4 xl:col-span-3 transparent-liquid-glass rounded-2xl p-3.5 sm:p-4 flex flex-col h-[650px] lg:h-[760px] relative overflow-hidden shadow-2xl">

          {/* Subtle Ambient Liquid Sheen Reflections */}
          <div className="absolute -top-16 -left-16 w-36 h-36 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header Title */}
          <div className="mb-3 flex items-center justify-between relative z-10">
            <h2 className="text-sm font-bold tracking-wide text-gray-100 flex items-center gap-1.5">
              <FolderTree size={15} className="text-purple-400" />
              List of episodes:
            </h2>
            <span className="text-[10px] text-gray-300 font-mono px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-sm">
              {visibleEpisodes.length} eps
            </span>
          </div>

          {/* Filter Row: Folder Selector Dropdown & Number of Ep Search */}
          <div className="flex items-center gap-2 mb-3.5 relative z-10">

            {/* Folder Dropdown (counts each folder starting from 1!) */}
            <div className="relative flex-1">
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl liquid-glass-item text-xs font-semibold text-gray-200">
                <Menu size={13} className="text-gray-400 shrink-0" />
                <select
                  value={selectedFolderKey}
                  onChange={(e) => {
                    setSelectedFolderKey(e.target.value);
                    setEpSearch('');
                  }}
                  className="bg-transparent text-xs font-bold text-white focus:outline-none w-full cursor-pointer truncate pr-1"
                >
                  {folderGroups.map((grp) => (
                    <option key={grp.folderName} value={grp.folderName} className="bg-[#0e1628] text-white">
                      {grp.folderName} (1-{grp.count})
                    </option>
                  ))}
                  {folderGroups.length > 1 && (
                    <option value="ALL" className="bg-[#0e1628] text-white">
                      All Folders (1-{episodes.length})
                    </option>
                  )}
                  {folderGroups.length === 0 && (
                    <option value="" className="bg-[#0e1628] text-white">Episodes (1-{episodes.length})</option>
                  )}
                </select>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Number of Ep"
                value={epSearch}
                onChange={(e) => setEpSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 rounded-xl liquid-glass-item text-xs text-white placeholder-gray-400 focus:outline-none focus:border-purple-400/60 focus:bg-white/[0.08]"
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

          {/* 5-Column Episode Grid with Folder-Relative Numbering & Coloured Dots */}
          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar relative z-10">
            {visibleEpisodes.length > 0 ? (
              <div className="grid grid-cols-5 gap-1.5">
                {visibleEpisodes.map((ep) => {
                  const isActive = ep.id === episode?.id;

                  // Display number: Folder-relative (1 to folder end) or continuous if ALL selected
                  const displayNum = selectedFolderKey === 'ALL'
                    ? (ep.continuousNum || ep.folderEpNum || ep.episodeNumber)
                    : (ep.folderEpNum || ep.episodeNumber);

                  const isWatched = isActive ? (isCurrentWatched || !!ep.isWatched) : !!ep.isWatched;
                  const isInProgress = !isWatched && (isActive ? currentTime > 5 : (ep.lastPositionSeconds > 5));
                  const isFlagged = !!(ep.isFlagged || (ep.flags && ep.flags.length > 0));

                  return (
                    <button
                      key={ep.id}
                      onClick={() => {
                        if (onEpisodeChange && !isActive) {
                          onEpisodeChange(ep);
                        }
                      }}
                      onMouseEnter={(e) => handleEpMouseEnter(ep, e)}
                      onMouseMove={(e) => handleEpMouseMove(e)}
                      onMouseLeave={handleEpMouseLeave}
                      className={`h-9 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center cursor-pointer border relative ${isActive
                        ? 'bg-gradient-to-tr from-[#f472b6] to-[#ec4899] text-black border-white/60 shadow-[0_0_20px_rgba(244,114,182,0.65),inset_0_1px_1px_rgba(255,255,255,0.8)] scale-105 font-black z-10'
                        : 'liquid-glass-item text-gray-200 hover:text-white hover:border-white/25 hover:scale-[1.03]'
                        }`}
                    >
                      <span>{displayNum}</span>

                      {/* Coloured Status Dots: Marked, In-Progress, Completed */}
                      <div className="absolute top-1 right-1 flex items-center gap-0.5 pointer-events-none">
                        {isFlagged && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.9)]"
                            title="Marked / Bookmarked"
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
              <div className="py-12 text-center text-gray-400 text-xs">
                No episodes found matching "{epSearch}"
              </div>
            )}
          </div>

          {/* Coloured Dots Legend & Stats */}
          <div className="pt-3 border-t border-white/10 space-y-1.5 text-[10px] relative z-10">
            <div className="flex items-center justify-between text-gray-300">
              <span className="truncate font-medium">{selectedFolderKey === 'ALL' ? 'All Episodes' : selectedFolderKey}</span>
              <span className="font-mono text-purple-300/90">{visibleEpisodes.length} Episodes</span>
            </div>
            {/* Status Legend */}
            <div className="flex items-center gap-3 text-gray-400 pt-0.5">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] inline-block" /> Completed
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)] inline-block" /> Progress
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)] inline-block" /> Marked
              </span>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Video Player + Controls + Options Below ─────────── */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col space-y-4">

          {/* 1. Video Player Container with Ambient Light Glow */}
          <div className="relative w-full aspect-video">
            {/* Ambient Glow Canvas Backdrop (YouTube Style Two-Layer Ping-Pong Crossfade) */}
            {ambientMode && (
              <div
                className="absolute -top-8 sm:-top-14 -inset-x-4 sm:-inset-x-8 -bottom-4 sm:-bottom-8 pointer-events-none -z-10 rounded-3xl overflow-hidden transition-opacity duration-700 ease-out"
                style={{
                  opacity: playerState === 'playing' ? 0.75 : 0.3,
                  filter: 'blur(50px) saturate(2.0)',
                  transform: 'scale(1.08)',
                }}
              >
                <canvas
                  ref={ambientCanvasA}
                  width={16}
                  height={9}
                  className="absolute inset-0 w-full h-full object-cover will-change-[opacity]"
                  style={{ opacity: 1, zIndex: 1 }}
                />
                <canvas
                  ref={ambientCanvasB}
                  width={16}
                  height={9}
                  className="absolute inset-0 w-full h-full object-cover will-change-[opacity]"
                  style={{ opacity: 0, zIndex: 1 }}
                />
              </div>
            )}

            <div
              ref={videoWrapperRef}
              onClick={(e) => {
                if (e.target.closest('button, input, select, [role="slider"], [role="menu"], .custom-scrollbar')) return;
                togglePlay();
              }}
              onMouseMove={handleMouseMove}
              onMouseEnter={handleMouseMove}
              onMouseLeave={() => {
                const video = videoRef.current;
                if (video && !video.paused) {
                  if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
                  setShowControls(false);
                  setSpeedMenuOpen(false);
                }
              }}
              className="relative w-full h-full bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 group"
            >

              {/* HTML5 Native Video Tag */}
              <video
                ref={videoRef}
                playsInline
                preload="metadata"
                crossOrigin="anonymous"
                onClick={togglePlay}
                onLoadStart={handleLoadStart}
                onLoadedMetadata={handleLoadedMetadata}
                onCanPlay={handleCanPlay}
                onWaiting={handleWaiting}
                onPlaying={handlePlaying}
                onPause={handlePause}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
                onError={handleError}
                className="w-full h-full object-contain cursor-pointer"
              />

              {/* Subtitle Cue Overlay (Customizable size, color, background, opacity, and outline) */}
              {selectedSubtitleIndex !== -1 && currentSubtitleText && (
                <div className="absolute bottom-14 inset-x-0 flex justify-center pointer-events-none z-20 px-4">
                  <div
                    style={{
                      fontSize: `${subFontSize}px`,
                      color: subTextColor,
                      backgroundColor: subBgColor === 'transparent' ? 'transparent' : `${subBgColor}${Math.round(subBgOpacity * 255).toString(16).padStart(2, '0')}`,
                      ...getSubOutlineStyle(),
                    }}
                    className={`font-bold px-4 py-1.5 rounded-xl text-center max-w-2xl leading-relaxed select-none transition-all duration-150 ${subBoxBorder ? 'border border-white/20' : 'border-none'
                      }`}
                  >
                    {currentSubtitleText}
                  </div>
                </div>
              )}

              {/* Buffering Indicator */}
              {playerState === 'buffering' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-20">
                  <div className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-black/80 border border-white/10 shadow-2xl">
                    <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold text-gray-300 tracking-wider">Buffering Stream...</span>
                  </div>
                </div>
              )}

              {/* Error Overlay */}
              {playerState === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 z-30 text-center">
                  <AlertTriangle size={48} className="text-red-500 mb-3" />
                  <h3 className="text-base font-black text-white mb-1">{errorMessage}</h3>
                  <p className="text-xs text-gray-400 max-w-md mb-5 leading-relaxed">{errorDetails}</p>
                  <button
                    onClick={handleRetry}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <RefreshCw size={14} />
                    Retry Stream
                  </button>
                </div>
              )}

              {/* ── Visual Overlays & Animations ─────────────────────────────── */}
              {/* Left-side Rewind 10s Vignette & Chevron Animation (No box outline) */}
              {seekFeedback && seekFeedback.side === 'left' && (
                <div
                  key={`seek-left-${seekFeedback.key}`}
                  className="absolute inset-y-0 left-0 w-2/5 sm:w-1/3 pointer-events-none z-30 flex items-center justify-start pl-6 sm:pl-12 animate-seek-left overflow-hidden"
                  style={{
                    background: 'radial-gradient(ellipse 100% 100% at 0% 50%, rgba(255, 208, 0, 0.22) 0%, rgba(255, 208, 0, 0.06) 50%, transparent 100%)',
                  }}
                >
                  <div className="flex flex-col items-center gap-1 text-white select-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                    <div className="flex items-center text-[#ffd000]">
                      <ChevronLeft size={32} strokeWidth={3} className="animate-chevron-left-3 -mr-3.5" />
                      <ChevronLeft size={32} strokeWidth={3} className="animate-chevron-left-2 -mr-3.5" />
                      <ChevronLeft size={32} strokeWidth={3} className="animate-chevron-left-1" />
                    </div>
                    <span className="text-xs sm:text-sm font-black tracking-wider uppercase font-mono text-[#ffd000] drop-shadow-md">
                      {seekFeedback.text}
                    </span>
                  </div>
                </div>
              )}

              {/* Right-side Forward 10s Vignette & Chevron Animation (No box outline) */}
              {seekFeedback && seekFeedback.side === 'right' && (
                <div
                  key={`seek-right-${seekFeedback.key}`}
                  className="absolute inset-y-0 right-0 w-2/5 sm:w-1/3 pointer-events-none z-30 flex items-center justify-end pr-6 sm:pr-12 animate-seek-right overflow-hidden"
                  style={{
                    background: 'radial-gradient(ellipse 100% 100% at 100% 50%, rgba(255, 208, 0, 0.22) 0%, rgba(255, 208, 0, 0.06) 50%, transparent 100%)',
                  }}
                >
                  <div className="flex flex-col items-center gap-1 text-white select-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                    <div className="flex items-center text-[#ffd000]">
                      <ChevronRight size={32} strokeWidth={3} className="animate-chevron-right-1 -mr-3.5" />
                      <ChevronRight size={32} strokeWidth={3} className="animate-chevron-right-2 -mr-3.5" />
                      <ChevronRight size={32} strokeWidth={3} className="animate-chevron-right-3" />
                    </div>
                    <span className="text-xs sm:text-sm font-black tracking-wider uppercase font-mono text-[#ffd000] drop-shadow-md">
                      {seekFeedback.text}
                    </span>
                  </div>
                </div>
              )}

              {/* In-Video Center Play / Pause Feedback Badge */}
              {playPauseFeedback && (
                <div
                  key={playPauseFeedback.key}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-in fade-in zoom-in-75 duration-200"
                >
                  <div className="p-5 rounded-full bg-black/75 backdrop-blur-md border border-white/20 text-white shadow-2xl shadow-black/80 scale-125">
                    {playPauseFeedback.isPlaying ? (
                      <Play size={36} fill="white" className="text-white translate-x-0.5" />
                    ) : (
                      <Pause size={36} fill="white" className="text-white" />
                    )}
                  </div>
                </div>
              )}

              {/* In-Video Speed Feedback Toast */}
              {speedToast && (
                <div
                  key={speedToast.key}
                  className="absolute top-16 right-6 pointer-events-none z-30 animate-in fade-in slide-in-from-top-3 duration-200"
                >
                  <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-black/80 backdrop-blur-md border border-[#f472b6]/40 text-[#f472b6] shadow-xl shadow-black/80">
                    <Gauge size={16} />
                    <span className="text-xs sm:text-sm font-black tracking-wide font-mono">
                      {speedToast.speed}x Speed
                    </span>
                  </div>
                </div>
              )}

              {/* Top Bar Vignette: File Name, Prev/Next Ep, Mark Complete */}
              <div
                className={`absolute top-0 inset-x-0 pt-3 pb-8 px-3 sm:px-5 bg-gradient-to-b from-black/20 via-black/5 to-transparent transition-opacity duration-300 z-30 flex items-center justify-between gap-3 pointer-events-none ${showControls || playerState === 'paused' || playerState === 'idle'
                  ? 'opacity-100'
                  : 'opacity-0'
                  }`}
              >
                {/* Left: Back (if onBack) + Episode Info & File Name */}
                <div className="flex items-center gap-2.5 min-w-0 pointer-events-auto">
                  {onBack && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBack();
                      }}
                      className="p-1.5 rounded-xl liquid-glass-item text-white transition cursor-pointer flex items-center gap-1 text-xs font-bold shrink-0"
                      title="Back"
                    >
                      <ChevronLeft size={16} />
                      <span className="hidden sm:inline">Back</span>
                    </button>
                  )}

                  <div className="min-w-0 flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-black text-white truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
                        Episode {visibleEpisodes.find(e => e.id === episode?.id)?.folderEpNum || episode?.episodeNumber || (currentIndex + 1)}
                      </span>
                      {episode?.folderName && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold truncate hidden md:inline-block backdrop-blur-md">
                          {episode.folderName}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-200 truncate max-w-xs sm:max-w-md md:max-w-lg font-mono drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                      {episode?.fileName || episode?.title || `Episode ${episode?.episodeNumber || 1}`}
                    </span>
                  </div>
                </div>

                {/* Right: Prev, Next, Mark Watched */}
                <div className="flex items-center gap-2 pointer-events-auto shrink-0">
                  {/* Prev Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (prevEpisode && onEpisodeChange) onEpisodeChange(prevEpisode);
                    }}
                    disabled={!prevEpisode}
                    className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl liquid-glass-item text-white text-xs font-bold transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title={prevEpisode ? `Previous Episode (${prevEpisode.episodeNumber || ''})` : 'No Previous Episode'}
                  >
                    <SkipBack size={13} fill="currentColor" />
                    <span className="hidden sm:inline">Prev</span>
                  </button>

                  {/* Next Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (nextEpisode && onEpisodeChange) onEpisodeChange(nextEpisode);
                    }}
                    disabled={!nextEpisode}
                    className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl liquid-glass-item text-white text-xs font-bold transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title={nextEpisode ? `Next Episode (${nextEpisode.episodeNumber || ''})` : 'No Next Episode'}
                  >
                    <span className="hidden sm:inline">Next</span>
                    <SkipForward size={13} fill="currentColor" />
                  </button>

                  {/* Mark Watched Toggle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleWatched();
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border backdrop-blur-md ${isCurrentWatched
                      ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                      : 'liquid-glass-item text-gray-300 hover:text-white'
                      }`}
                    title={isCurrentWatched ? 'Mark as Unwatched' : 'Mark as Watched'}
                  >
                    <CheckCircle2 size={14} className={isCurrentWatched ? 'text-emerald-400' : 'text-gray-400'} />
                    <span className="hidden sm:inline">{isCurrentWatched ? 'Watched' : 'Mark Watched'}</span>
                  </button>
                </div>
              </div>

              {/* In-Video Overlay Controls */}
              <div
                className={`absolute inset-0 flex flex-col justify-end transition-opacity duration-300 z-20 pointer-events-none ${showControls || playerState === 'paused' || playerState === 'idle'
                  ? 'opacity-100'
                  : 'opacity-0'
                  }`}
              >
                {/* Dark Gradient Backdrop */}
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none" />

                {/* Player Bottom Bar */}
                <div className="relative z-10 px-3 sm:px-5 pb-3 pt-1 space-y-2 pointer-events-auto">

                  {/* Yellow Seekbar */}
                  <div
                    ref={progressBarRef}
                    onClick={handleSeekbarClick}
                    className="relative h-1.5 hover:h-2.5 bg-white/20 rounded-full cursor-pointer transition-all duration-150 flex items-center"
                  >
                    {/* Buffer Line */}
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-white/40 rounded-full pointer-events-none"
                      style={{ width: `${bufferPercent}%` }}
                    />
                    {/* Yellow Active Progress Line */}
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-[#ffd000] rounded-full pointer-events-none shadow-[0_0_8px_rgba(255,208,0,0.8)]"
                      style={{ width: `${progressPercent}%` }}
                    />
                    {/* Scrubber Knob */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-[#ffd000] rounded-full shadow-md pointer-events-none"
                      style={{ left: `calc(${progressPercent}% - 7px)` }}
                    />
                  </div>

                  {/* Controls Row */}
                  <div className="flex items-center justify-between text-white">

                    {/* Left Controls: Play/Pause, Volume, Time (01:36 / 23:39) */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={togglePlay}
                        className="p-1 text-white hover:text-[#ffd000] transition cursor-pointer"
                        title={playerState === 'playing' ? 'Pause' : 'Play'}
                      >
                        {playerState === 'playing' ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                      </button>

                      {/* Volume with Hover Slider & Colored Percentage Fill */}
                      <div className="flex items-center gap-1.5 group/vol">
                        <button
                          onClick={toggleMute}
                          className="p-1 text-white hover:text-[#ffd000] transition cursor-pointer"
                        >
                          {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={isMuted ? 0 : volume}
                          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                          style={{
                            background: `linear-gradient(to right, #ffd000 ${(isMuted ? 0 : volume) * 100}%, rgba(255, 255, 255, 0.2) ${(isMuted ? 0 : volume) * 100}%)`,
                          }}
                          className="w-16 sm:w-20 h-1.5 accent-[#ffd000] rounded-full appearance-none cursor-pointer hidden sm:inline-block"
                        />
                      </div>

                      {/* Accurate Video Duration: 01:36 / 23:39 */}
                      <div className="font-mono text-xs sm:text-sm font-semibold tracking-wider text-gray-300 ml-1">
                        <span>{formatTime(currentTime)}</span>
                        <span className="text-gray-500 mx-1.5">/</span>
                        <span className="text-gray-400">{formatTime(effectiveDuration)}</span>
                      </div>
                    </div>

                    {/* Right Controls: Rewind 10, Forward 10, Speed Menu, CC, Sub Settings, PiP, Fullscreen */}
                    <div className="flex items-center gap-2 sm:gap-3">
                      {/* Rewind 10s */}
                      <button
                        onClick={() => seekRelative(-10)}
                        className="p-1 text-gray-300 hover:text-[#ffd000] transition cursor-pointer flex items-center justify-center relative"
                        title="Rewind 10s (ArrowLeft / J)"
                      >
                        <RotateCcw size={19} />
                        <span className="absolute text-[8px] font-black top-2">10</span>
                      </button>

                      {/* Forward 10s */}
                      <button
                        onClick={() => seekRelative(10)}
                        className="p-1 text-gray-300 hover:text-[#ffd000] transition cursor-pointer flex items-center justify-center relative"
                        title="Forward 10s (ArrowRight / L)"
                      >
                        <RotateCw size={19} />
                        <span className="absolute text-[8px] font-black top-2">10</span>
                      </button>

                      {/* Speed Selector (Presets with 0.5 gap + Slider) */}
                      <div className="relative group/speedmenu">
                        <button
                          onClick={() => setSpeedMenuOpen((prev) => !prev)}
                          className={`px-2 py-0.5 rounded text-xs font-mono font-bold border transition cursor-pointer flex items-center gap-1 ${playbackSpeed !== 1.0
                            ? 'bg-amber-400 text-black border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)] font-black'
                            : 'bg-transparent text-gray-300 border-white/20 hover:text-white hover:border-white/40'
                            }`}
                          title="Playback Speed (Presets & Slider)"
                        >
                          <Gauge size={13} className={playbackSpeed !== 1.0 ? 'text-black' : 'text-amber-400'} />
                          <span>{playbackSpeed}x</span>
                        </button>

                        {/* Dropdown Menu Popup for Speed */}
                        {speedMenuOpen && (
                          <div className="absolute bottom-full right-0 mb-3 w-56 bg-[#0c101c]/95 backdrop-blur-xl border border-white/20 rounded-2xl p-3 shadow-2xl z-40 space-y-3 animate-in fade-in zoom-in-95 duration-150 text-xs">
                            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                              <span className="text-[11px] font-black uppercase tracking-wider text-gray-300 flex items-center gap-1">
                                <Gauge size={13} className="text-amber-400" />
                                Playback Speed
                              </span>
                              <span className="font-mono font-bold text-amber-400">
                                {playbackSpeed}x
                              </span>
                            </div>

                            {/* Presets with 0.5x gap: 0.5x, 1x, 1.5x, 2x, 2.5x, 3x */}
                            <div className="space-y-1">
                              <span className="text-[10px] text-gray-400 font-semibold block">Presets (0.5x step)</span>
                              <div className="grid grid-cols-3 gap-1.5">
                                {[0.5, 1.0, 1.5, 2.0, 2.5, 3.0].map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => {
                                      handleSpeedChange(s, true);
                                    }}
                                    className={`py-1 rounded-lg text-xs font-bold transition border cursor-pointer ${playbackSpeed === s
                                      ? 'bg-amber-400 text-black border-amber-400 shadow font-black'
                                      : 'bg-[#181f30] text-gray-300 border-white/10 hover:text-white hover:bg-[#252f48]'
                                      }`}
                                  >
                                    {s}x
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Smooth Speed Slider (0.25x - 4.0x) */}
                            <div className="space-y-1.5 pt-1 border-t border-white/5">
                              <div className="flex justify-between text-[10px] font-bold text-gray-300">
                                <span>Custom Slider</span>
                                <span className="text-amber-400 font-mono">{playbackSpeed.toFixed(2)}x</span>
                              </div>
                              <input
                                type="range"
                                min="0.25"
                                max="4.0"
                                step="0.05"
                                value={playbackSpeed}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  handleSpeedChange(val, true);
                                }}
                                className="w-full accent-amber-400 bg-white/20 h-1 rounded-lg cursor-pointer"
                              />
                              <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                                <span>0.25x</span>
                                <button
                                  onClick={() => handleSpeedChange(1.0, true)}
                                  className="text-amber-400 hover:underline font-bold cursor-pointer"
                                >
                                  Reset (1x)
                                </button>
                                <span>4.0x</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Closed Captions CC */}
                      <button
                        onClick={() => {
                          if (subtitleTracks.length > 0) {
                            setSelectedSubtitleIndex((prev) => (prev === -1 ? 0 : -1));
                          }
                        }}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-black border transition cursor-pointer ${selectedSubtitleIndex !== -1
                          ? 'bg-[#ffd000] text-black border-[#ffd000]'
                          : 'bg-transparent text-gray-300 border-white/20 hover:text-white'
                          }`}
                        title={subtitleTracks.length > 0 ? 'Toggle Subtitles' : 'No subtitles found'}
                      >
                        CC
                      </button>

                      {/* Subtitle Appearance Settings Popover */}
                      <div className="relative group/subsettings">
                        <button
                          onClick={() => {
                            setSubSettingsOpen((prev) => !prev);
                            setSpeedMenuOpen(false);
                          }}
                          className={`p-1 transition cursor-pointer rounded ${subSettingsOpen
                            ? 'text-[#ffd000] bg-white/10'
                            : 'text-gray-300 hover:text-[#ffd000]'
                            }`}
                          title="Subtitle Settings (Size, Colour, Opacity, Outline, Sync)"
                        >
                          <SlidersHorizontal size={18} />
                        </button>

                        {subSettingsOpen && (
                          <div className="absolute bottom-full right-0 mb-3 w-72 sm:w-80 bg-[#0c101c]/95 backdrop-blur-xl border border-white/20 rounded-2xl p-3.5 shadow-2xl z-40 space-y-3 animate-in fade-in zoom-in-95 duration-150 text-xs max-h-[65vh] overflow-y-auto custom-scrollbar">
                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                              <span className="text-[11px] font-black uppercase tracking-wider text-gray-200 flex items-center gap-1.5">
                                <Subtitles size={14} className="text-[#f472b6]" />
                                Subtitle Appearance & Sync
                              </span>
                              <button
                                onClick={() => setSubSettingsOpen(false)}
                                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer"
                              >
                                <X size={14} />
                              </button>
                            </div>

                            {/* Live Preview */}
                            <div className="p-3 rounded-xl bg-black/80 border border-white/10 flex items-center justify-center min-h-[50px] relative overflow-hidden">
                              <div
                                style={{
                                  fontSize: `${subFontSize}px`,
                                  color: subTextColor,
                                  backgroundColor: subBgColor === 'transparent' ? 'transparent' : `${subBgColor}${Math.round(subBgOpacity * 255).toString(16).padStart(2, '0')}`,
                                  ...getSubOutlineStyle(),
                                }}
                                className={`font-bold px-3 py-1 rounded-lg text-center max-w-full text-[11px] leading-tight select-none transition-all ${subBoxBorder ? 'border border-white/20' : 'border-none'
                                  }`}
                              >
                                Sample Anime Subtitle
                              </div>
                            </div>

                            {/* Font Size */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] font-bold text-gray-300">
                                <span>Text Size</span>
                                <span className="text-yellow-400">{subFontSize}px</span>
                              </div>
                              <div className="grid grid-cols-6 gap-1">
                                {[14, 16, 18, 22, 26, 32].map((sz) => (
                                  <button
                                    key={sz}
                                    onClick={() => {
                                      setSubFontSize(sz);
                                      updateSubSetting('fontsize', sz);
                                    }}
                                    className={`py-1 rounded-lg text-[10px] font-bold transition border cursor-pointer ${subFontSize === sz
                                      ? 'bg-[#f472b6] text-black border-[#f472b6] font-black'
                                      : 'bg-[#181f30] text-gray-300 border-white/10 hover:text-white hover:bg-[#252f48]'
                                      }`}
                                  >
                                    {sz}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Text Colour */}
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-gray-300 block">Text Colour</span>
                              <div className="grid grid-cols-5 gap-1">
                                {[
                                  { name: 'Yellow', val: '#facc15' },
                                  { name: 'White', val: '#ffffff' },
                                  { name: 'Cyan', val: '#22d3ee' },
                                  { name: 'Green', val: '#4ade80' },
                                  { name: 'Pink', val: '#f472b6' },
                                ].map((c) => (
                                  <button
                                    key={c.val}
                                    onClick={() => {
                                      setSubTextColor(c.val);
                                      updateSubSetting('textcolor', c.val);
                                    }}
                                    className={`py-1 rounded-lg text-[10px] font-bold transition border flex items-center justify-center gap-1 cursor-pointer ${subTextColor === c.val
                                      ? 'bg-white/20 border-white text-white'
                                      : 'bg-[#181f30] text-gray-300 border-white/10 hover:text-white'
                                      }`}
                                  >
                                    <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: c.val }} />
                                    <span className="truncate">{c.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Background Colour & Opacity */}
                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-gray-300 block">Background</span>
                                <select
                                  value={subBgColor}
                                  onChange={(e) => {
                                    setSubBgColor(e.target.value);
                                    updateSubSetting('bgcolor', e.target.value);
                                  }}
                                  className="w-full bg-[#181f30] border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none cursor-pointer"
                                >
                                  <option value="#000000">Black</option>
                                  <option value="#0f172a">Dark Navy</option>
                                  <option value="#1e293b">Slate</option>
                                  <option value="transparent">None (Transparent)</option>
                                </select>
                              </div>

                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px] font-bold text-gray-300">
                                  <span>Opacity</span>
                                  <span className="text-yellow-400">{Math.round(subBgOpacity * 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={subBgOpacity}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setSubBgOpacity(val);
                                    updateSubSetting('bgopacity', val);
                                  }}
                                  className="w-full accent-[#f472b6] cursor-pointer h-1 bg-white/20 rounded"
                                />
                              </div>
                            </div>

                            {/* Outline / Stroke Style */}
                            <div className="space-y-1 pt-1 border-t border-white/5">
                              <span className="text-[10px] font-bold text-gray-300 block">Outline / Stroke</span>
                              <div className="grid grid-cols-4 gap-1">
                                {[
                                  { id: 'none', label: 'None' },
                                  { id: 'shadow', label: 'Shadow' },
                                  { id: 'heavy', label: 'Outline' },
                                  { id: 'glow', label: 'Glow' },
                                ].map((item) => (
                                  <button
                                    key={item.id}
                                    onClick={() => {
                                      setSubOutline(item.id);
                                      updateSubSetting('outline', item.id);
                                    }}
                                    className={`py-1 rounded-lg text-[10px] font-bold transition border cursor-pointer ${subOutline === item.id
                                      ? 'bg-[#f472b6] text-black border-[#f472b6] font-black'
                                      : 'bg-[#181f30] text-gray-300 border-white/10 hover:text-white'
                                      }`}
                                  >
                                    {item.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Box Border Toggle */}
                            <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-bold text-gray-300">
                              <span>Subtitle Box Border</span>
                              <button
                                onClick={() => {
                                  const next = !subBoxBorder;
                                  setSubBoxBorder(next);
                                  updateSubSetting('box_border', next ? 'true' : 'false');
                                }}
                                className={`px-2.5 py-0.5 rounded-lg font-bold border transition cursor-pointer ${subBoxBorder ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-[#181f30] text-gray-400 border-white/10'
                                  }`}
                              >
                                {subBoxBorder ? 'Enabled' : 'Disabled'}
                              </button>
                            </div>

                            {/* Subtitle Sync Timing Offset */}
                            <div className="p-2 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                              <div className="flex items-center justify-between text-[10px] font-bold">
                                <span className="text-gray-300">Subtitle Sync Offset</span>
                                <span className={`font-mono ${subDelay !== 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                                  {subDelay > 0 ? `+${subDelay.toFixed(2)}s` : `${subDelay.toFixed(2)}s`}
                                </span>
                              </div>
                              <div className="grid grid-cols-5 gap-1">
                                {[-0.5, -0.1, 0, 0.1, 0.5].map((val) => (
                                  <button
                                    key={val}
                                    onClick={() => {
                                      const next = val === 0 ? 0 : Math.round((subDelay + val) * 10) / 10;
                                      setSubDelay(next);
                                      updateSubSetting('delay', next);
                                    }}
                                    className={`py-1 rounded-lg text-[10px] font-bold transition border cursor-pointer ${val === 0
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                      : 'bg-[#181f30] text-gray-300 border-white/10 hover:text-white'
                                      }`}
                                  >
                                    {val === 0 ? 'Reset' : val > 0 ? `+${val}s` : `${val}s`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Picture-in-Picture (Real PiP SVG Icon) */}
                      <button
                        onClick={togglePiP}
                        className="p-1 text-gray-300 hover:text-[#ffd000] transition cursor-pointer hidden sm:flex items-center justify-center"
                        title="Picture in Picture"
                      >
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                          <rect x="12" y="10" width="8" height="7" rx="1" fill="currentColor" fillOpacity="0.35" />
                        </svg>
                      </button>

                      {/* Fullscreen (Anime video only!) */}
                      <button
                        onClick={toggleFullscreen}
                        className="p-1 text-gray-300 hover:text-[#ffd000] transition cursor-pointer"
                        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen (F)'}
                      >
                        {isFullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
                      </button>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Below Video: Quick Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-gray-300">

            {/* Left Toggles: Light, Ambient, Auto Play, Auto Next, Auto Skip Intro */}
            <div className="flex flex-wrap items-center gap-4">

              {/* Light On / Off Toggle */}
              <button
                onClick={() => setLightOn(prev => !prev)}
                className="flex items-center gap-1.5 hover:text-white transition cursor-pointer font-medium"
              >
                <Lightbulb size={15} className={lightOn ? 'text-yellow-400' : 'text-gray-500'} />
                <span>Light</span>
                <span className={`font-bold ${lightOn ? 'text-[#f472b6]' : 'text-gray-400'}`}>
                  {lightOn ? 'On' : 'Off'}
                </span>
              </button>

              {/* Ambient Light Mode Toggle (YouTube Style) */}
              <button
                onClick={toggleAmbientMode}
                className="flex items-center gap-1.5 hover:text-white transition cursor-pointer font-medium"
                title="Toggle YouTube-style Ambient Canvas Glow"
              >
                <Sparkles size={15} className={ambientMode ? 'text-amber-300 animate-pulse' : 'text-gray-500'} />
                <span>Ambient</span>
                <span className={`font-bold ${ambientMode ? 'text-amber-300' : 'text-gray-400'}`}>
                  {ambientMode ? 'On' : 'Off'}
                </span>
              </button>

              {/* Auto Play */}
              <button
                onClick={() => setAutoPlay(prev => !prev)}
                className="flex items-center gap-1 hover:text-white transition cursor-pointer font-medium"
              >
                <span>Auto Play</span>
                <span className={`font-bold ${autoPlay ? 'text-[#f472b6]' : 'text-gray-400'}`}>
                  {autoPlay ? 'On' : 'Off'}
                </span>
              </button>

              {/* Auto Next */}
              <button
                onClick={() => setAutoNext(prev => !prev)}
                className="flex items-center gap-1 hover:text-white transition cursor-pointer font-medium"
              >
                <span>Auto Next</span>
                <span className={`font-bold ${autoNext ? 'text-[#f472b6]' : 'text-gray-400'}`}>
                  {autoNext ? 'On' : 'Off'}
                </span>
              </button>

              {/* Auto Skip Intro (+85s) */}
              <button
                onClick={() => {
                  if (autoSkipIntro) {
                    setAutoSkipIntro(false);
                  } else {
                    setAutoSkipIntro(true);
                    seekRelative(85);
                  }
                }}
                className="flex items-center gap-1 hover:text-white transition cursor-pointer font-medium"
              >
                <span>Auto Skip Intro</span>
                <span className={`font-bold ${autoSkipIntro ? 'text-[#f472b6]' : 'text-gray-400'}`}>
                  {autoSkipIntro ? 'On' : 'Off'}
                </span>
              </button>
            </div>

            {/* Right Buttons: Prev, Next, Watched/Unwatched Marker */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => prevEpisode && onEpisodeChange && onEpisodeChange(prevEpisode)}
                disabled={!prevEpisode}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#181f30] hover:bg-[#252f48] text-white font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <SkipBack size={13} fill="currentColor" />
                <span>Prev</span>
              </button>

              <button
                onClick={() => nextEpisode && onEpisodeChange && onEpisodeChange(nextEpisode)}
                disabled={!nextEpisode}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#181f30] hover:bg-[#252f48] text-white font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Next</span>
                <SkipForward size={13} fill="currentColor" />
              </button>

              {/* Watched / Unwatched Toggle Marker */}
              <button
                onClick={handleToggleWatched}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold transition cursor-pointer border ${isCurrentWatched
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-[#181f30] hover:bg-[#252f48] text-gray-300 border-white/10 hover:text-white'
                  }`}
                title={isCurrentWatched ? 'Click to mark as Unwatched' : 'Click to mark as Watched'}
              >
                <CheckCircle2 size={14} className={isCurrentWatched ? 'text-emerald-400' : 'text-gray-400'} />
                <span>{isCurrentWatched ? 'Watched' : 'Mark Watched'}</span>
              </button>

              {/* Host Health Indicator */}
              <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-gray-400">
                <span className={`w-2 h-2 rounded-full ${serverHealth === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                Windows Host
              </span>
            </div>

          </div>

          {/* 3. Pink Banner: "You are watching Episode X" + SUB, AUDIO, SPEED Options */}
          <div className="bg-[#0d111d] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center gap-5 shadow-xl">

            {/* Left Pink Card: "You are watching Episode X" */}
            <div className="bg-[#fbcfe8] text-gray-900 px-5 py-3 rounded-2xl shrink-0 shadow-md">
              <div className="text-[11px] font-semibold tracking-wide text-gray-700">
                You are watching
              </div>
              <div className="text-base sm:text-lg font-black text-black">
                Episode {visibleEpisodes.find(e => e.id === episode?.id)?.folderEpNum || episode?.episodeNumber || (currentIndex + 1)}
              </div>
            </div>

            {/* Right Controls: SUB, AUDIO, SPEED Pills */}
            <div className="flex-1 space-y-3 w-full">

              {/* SUBTITLE Options */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-extrabold text-gray-300 flex items-center gap-1 shrink-0 uppercase tracking-wider text-[11px]">
                  <Subtitles size={14} className="text-[#f472b6]" />
                  SUB:
                </span>

                <button
                  onClick={() => setSelectedSubtitleIndex(-1)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${selectedSubtitleIndex === -1
                    ? 'bg-[#f472b6] text-black border-[#f472b6] shadow'
                    : 'bg-[#181f30] text-gray-300 border-white/10 hover:text-white'
                    }`}
                >
                  Off
                </button>

                {subtitleTracks.map((track) => {
                  const isSelected = selectedSubtitleIndex === track.index;
                  return (
                    <button
                      key={track.index}
                      onClick={() => setSelectedSubtitleIndex(track.index)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${isSelected
                        ? 'bg-[#f472b6] text-black border-[#f472b6] shadow'
                        : 'bg-[#181f30] text-gray-300 border-white/10 hover:text-white'
                        }`}
                    >
                      {track.title || `Track ${track.index + 1}`}
                    </button>
                  );
                })}

                {/* Subtitle Appearance Settings Button */}
                <button
                  onClick={() => setSubSettingsOpen(true)}
                  className="px-2.5 py-1 rounded-xl text-xs font-bold bg-[#181f30] hover:bg-[#252f48] text-gray-300 hover:text-white border border-white/10 flex items-center gap-1 transition cursor-pointer"
                  title="Subtitle Style & Sync Settings"
                >
                  <SlidersHorizontal size={13} className="text-[#f472b6]" />
                  <span>Style & Sync</span>
                </button>

                {subtitleTracks.length === 0 && (
                  <span className="text-gray-500 text-[11px] italic">No embedded subtitles</span>
                )}
              </div>

              {/* AUDIO Options */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-extrabold text-gray-300 flex items-center gap-1 shrink-0 uppercase tracking-wider text-[11px]">
                  <Volume2 size={14} className="text-cyan-400" />
                  AUDIO:
                </span>

                <button
                  onClick={() => setSelectedAudioIndex(null)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${selectedAudioIndex === null
                    ? 'bg-cyan-400 text-black border-cyan-400 shadow'
                    : 'bg-[#181f30] text-gray-300 border-white/10 hover:text-white'
                    }`}
                >
                  Default
                </button>

                {audioTracks.map((track) => {
                  const isSelected = selectedAudioIndex === track.index;
                  return (
                    <button
                      key={track.index}
                      onClick={() => setSelectedAudioIndex(track.index)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${isSelected
                        ? 'bg-cyan-400 text-black border-cyan-400 shadow'
                        : 'bg-[#181f30] text-gray-300 border-white/10 hover:text-white'
                        }`}
                    >
                      {track.title || `Audio ${track.index}`}
                    </button>
                  );
                })}
              </div>

              {/* SPEED Options (Presets + Custom Speed up to 10x!) */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-extrabold text-gray-300 flex items-center gap-1 shrink-0 uppercase tracking-wider text-[11px]">
                  <RotateCw size={14} className="text-amber-400" />
                  SPEED:
                </span>

                {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 5.0, 10.0].map((spd) => {
                  const isSelected = playbackSpeed === spd;
                  return (
                    <button
                      key={spd}
                      onClick={() => handleSpeedChange(spd, true)}
                      className={`px-2.5 py-0.5 rounded-xl text-xs font-bold transition cursor-pointer border ${isSelected
                        ? 'bg-amber-400 text-black border-amber-400 shadow'
                        : 'bg-[#181f30] text-gray-300 border-white/10 hover:text-white'
                        }`}
                    >
                      {spd === 1 || spd === 2 || spd === 3 || spd === 5 || spd === 10 ? `${spd}x` : `${spd.toFixed(2)}x`}
                    </button>
                  );
                })}

                {/* Custom Speed Input up to 10x */}
                <div className="flex items-center gap-1 bg-[#181f30] border border-white/10 rounded-xl px-2 py-0.5">
                  <span className="text-gray-400 text-[10px] font-semibold">Custom:</span>
                  <input
                    type="number"
                    min="0.25"
                    max="10.0"
                    step="0.25"
                    value={customSpeedInput}
                    onChange={(e) => {
                      setCustomSpeedInput(e.target.value);
                      const parsed = parseFloat(e.target.value);
                      if (!isNaN(parsed) && parsed >= 0.25 && parsed <= 10.0) {
                        handleSpeedChange(parsed, true);
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

      </div>

      {/* ── Episode Hover Details Floating Card (Follows cursor) ───────────── */}
      {hoveredEp && (() => {
        const isCurrent = hoveredEp.id === episode?.id;
        const isWatched = isCurrent ? (isCurrentWatched || hoveredEp.isWatched) : hoveredEp.isWatched;
        const dur = (isCurrent ? (effectiveDuration > 4 ? effectiveDuration : (metadataDurationRef.current || hoveredEp.durationSeconds)) : hoveredEp.durationSeconds) || 0;
        const pos = isWatched ? (dur || hoveredEp.durationSeconds || hoveredEp.lastPositionSeconds || 0) : (isCurrent ? currentTime : (hoveredEp.lastPositionSeconds || hoveredEp.watchedSeconds || 0));
        const pct = isWatched ? 100 : (dur > 0 ? Math.min(100, Math.round((pos / dur) * 100)) : (pos > 5 ? 10 : 0));
        const isInProgress = !isWatched && pos > 5;

        return (
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
                  EP {hoveredEp.folderEpNum || hoveredEp.episodeNumber || 1}
                </span>
                {hoveredEp.folderName && (
                  <span className="text-[10px] text-gray-400 font-medium truncate">
                    • {hoveredEp.folderName}
                  </span>
                )}
              </div>

              {isWatched ? (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 shrink-0">
                  <CheckCircle2 size={10} className="text-emerald-400" />
                  Watched
                </span>
              ) : isInProgress ? (
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

            {/* File Name */}
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
                <FileVideo size={11} className="text-purple-400" />
                File Name
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
                  {pct}% ({formatTime(pos)} / {formatTime(dur)})
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${isWatched
                    ? 'bg-emerald-400'
                    : isInProgress
                      ? 'bg-gradient-to-r from-cyan-400 to-[#f472b6]'
                      : 'bg-transparent'
                    }`}
                  style={{ width: `${pct}%` }}
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
                <p className="text-gray-300 italic line-clamp-2">"{hoveredEp.note}"</p>
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}
