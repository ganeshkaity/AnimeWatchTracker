"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, RotateCw, SkipForward, SkipBack, Settings,
  AlertTriangle, RefreshCw, Subtitles, Check, Server,
  Sliders, Info, Activity, Radio, ChevronRight, ChevronLeft, X,
  Search, Menu, Lightbulb, CheckCircle2, Plus, FolderTree,
  Bookmark, Star, Sparkles, SlidersHorizontal, Clock,
  FileVideo, Percent, StickyNote, Youtube, Zap
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
 * Robust WebVTT / Subtitle timestamp parser
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
 * Extract YouTube ID from episode
 */
function getYouTubeId(ep) {
  if (!ep) return '';
  if (ep.youtubeId) return ep.youtubeId;
  if (ep.filePath?.startsWith('youtube://')) return ep.filePath.replace('youtube://', '');
  if (ep.filePath?.includes('v=')) {
    const match = ep.filePath.match(/[?&]v=([^&]+)/);
    if (match) return match[1];
  }
  if (ep.filePath?.includes('youtu.be/')) {
    const match = ep.filePath.match(/youtu\.be\/([^?&]+)/);
    if (match) return match[1];
  }
  return ep.filePath || '';
}

/**
 * Extract folder or playlist group
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

export default function YtDlpPlayer({
  animeId,
  episode,
  episodes = [],
  onBack,
  onEpisodeChange,
  initialSpeed = 1,
  initialVolume = 1,
}) {
  const { currentUser } = useAuth();

  // ── Playback State ────────────────────────────────────────────────────────
  const [playerState, setPlayerState] = useState('loading'); // idle, loading, playing, paused, error
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(() => episode?.durationSeconds || 0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [bufferAhead, setBufferAhead] = useState(0);

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorDetails, setErrorDetails] = useState('');

  // ── Quality & Session ─────────────────────────────────────────────────────
  const [selectedQuality, setSelectedQuality] = useState(() => episode?.selectedQuality || 'best');
  const [availableQualities, setAvailableQualities] = useState(['best', '1080p', '720p', '480p', '360p']);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const sessionIdRef = useRef(`ytdlp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

  // ── Watched Marker State ───────────────────────────────────────────────────
  const [isCurrentWatched, setIsCurrentWatched] = useState(() => !!episode?.isWatched);

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

  // ── Subtitles ─────────────────────────────────────────────────────────────
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitleCues, setSubtitleCues] = useState([]);
  const [currentSubtitleText, setCurrentSubtitleText] = useState('');
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
  const [subDelay, setSubDelay] = useState(0);

  const updateSubSetting = (key, val) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`watchanime_sub_${key}`, String(val));
    }
  };

  // ── Folder / Episode Grouping ──────────────────────────────────────────────
  const [selectedFolderKey, setSelectedFolderKey] = useState('');
  const [epSearch, setEpSearch] = useState('');

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

  // ── Overlay Feedback Animations (Seek, Play/Pause, Speed) ──────────────────
  const [seekFeedback, setSeekFeedback] = useState(null); // { side: 'left' | 'right', text: '10s', key: number }
  const [playPauseFeedback, setPlayPauseFeedback] = useState(null); // { isPlaying: boolean, key: number }
  const [speedToast, setSpeedToast] = useState(null); // { speed: number, key: number }

  const seekFeedbackTimeoutRef = useRef(null);
  const playPauseFeedbackTimeoutRef = useRef(null);
  const speedToastTimeoutRef = useRef(null);

  // ── DOM References ─────────────────────────────────────────────────────────
  const videoRef = useRef(null);
  const videoContainerRef = useRef(null);
  const ambientCanvasA = useRef(null);
  const ambientCanvasB = useRef(null);
  const activeAmbientLayerRef = useRef('A');
  const ambientTransitionTimeoutRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const lastSavedTimeRef = useRef(0);
  const isWatchedMarkedRef = useRef(false);
  const savedPositionRestoredRef = useRef(false);
  const lastEpisodeIdRef = useRef(null);
  const knownDurationRef = useRef(episode?.durationSeconds || 0);

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
        // Silently ignore cross-origin or decode errors
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

  // Close remote YT-DLP stream on unmount or episode change
  const closeCurrentStream = useCallback(() => {
    const session = sessionIdRef.current;
    if (session) {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/youtube/close-stream', JSON.stringify({ sessionId: session }));
      } else {
        fetch(`/api/youtube/close-stream?sessionId=${session}`, { keepalive: true }).catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      closeCurrentStream();
    };
  }, [closeCurrentStream]);

  // ── Compute Grouped Episodes with Natural Sorting ──────────────────────────
  const folderGroups = useMemo(() => {
    if (!episodes || episodes.length === 0) return [];

    let rootPath = '';
    if (typeof window !== 'undefined') {
      const anime = getLocalAnime(animeId);
      rootPath = anime?.folderPath || '';
    }

    const groupsMap = new Map();
    episodes.forEach((ep) => {
      const folderName = getFolderForEp(ep, rootPath);
      if (!groupsMap.has(folderName)) {
        groupsMap.set(folderName, []);
      }
      groupsMap.get(folderName).push(ep);
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
        const folderEpNum = localIdx + 1;
        const continuousNum = runningGlobalIndex++;
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
  }, [episodes, animeId]);

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

  // ── Fullscreen Listener ────────────────────────────────────────────────────
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // ── Fetch YouTube Duration & Formats ───────────────────────────────────────
  useEffect(() => {
    if (!episode) return;
    const vId = getYouTubeId(episode);
    if (!vId) return;

    // Fetch accurate duration
    if (!episode.durationSeconds || episode.durationSeconds <= 4) {
      fetch(`/api/youtube/duration?videoId=${encodeURIComponent(vId)}`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.durationSeconds > 4) {
            knownDurationRef.current = data.durationSeconds;
            setDuration(data.durationSeconds);
            if (videoRef.current) {
              videoRef.current._fakeDuration = data.durationSeconds;
            }
          }
        })
        .catch(() => {});
    } else {
      knownDurationRef.current = episode.durationSeconds;
      setDuration(episode.durationSeconds);
      if (videoRef.current) {
        videoRef.current._fakeDuration = episode.durationSeconds;
      }
    }

    // Fetch available stream qualities
    fetch(`/api/youtube/qualities?videoId=${encodeURIComponent(vId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.qualities) && data.qualities.length > 0) {
          const qLabels = data.qualities.map(q => q.id || q);
          setAvailableQualities(['best', ...qLabels.filter(q => q !== 'best')]);
        }
      })
      .catch(() => {});
  }, [episode?.id]);

  // ── Stream URL Assembly & Video Source Loading ─────────────────────────────
  useEffect(() => {
    if (!episode) return;
    const video = videoRef.current;
    if (!video) return;

    setPlayerState('loading');
    setErrorMessage('');
    setErrorDetails('');
    setCurrentTime(0);
    setBufferedEnd(0);
    setBufferAhead(0);
    savedPositionRestoredRef.current = false;
    isWatchedMarkedRef.current = false;

    // Generate fresh session ID for this playback stream
    sessionIdRef.current = `ytdlp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const vId = getYouTubeId(episode);
    if (!vId) {
      setPlayerState('error');
      setErrorMessage('Invalid YouTube Video ID');
      setErrorDetails('The episode is missing a valid YouTube video ID or link.');
      return;
    }

    const streamUrl = `/api/youtube/stream?videoId=${encodeURIComponent(vId)}&quality=${encodeURIComponent(selectedQuality)}&sessionId=${sessionIdRef.current}`;

    video.src = streamUrl;
    video.load();

    if (autoPlay) {
      video.play().catch(() => {});
    }
  }, [episode?.id, selectedQuality]);

  // ── Subtitle Cues Tracking ─────────────────────────────────────────────────
  useEffect(() => {
    if (subtitleCues.length === 0 || !subtitlesEnabled) {
      if (currentSubtitleText) setCurrentSubtitleText('');
      return;
    }

    const effectiveTime = currentTime + subDelay;
    const activeCue = subtitleCues.find(
      (c) => effectiveTime >= c.start && effectiveTime <= c.end
    );

    const newText = activeCue ? activeCue.text : '';
    if (newText !== currentSubtitleText) {
      setCurrentSubtitleText(newText);
    }
  }, [currentTime, subDelay, subtitleCues, subtitlesEnabled, currentSubtitleText]);

  // ── Buffer Calculation ─────────────────────────────────────────────────────
  const updateBufferMetrics = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.buffered.length) return;

    const cur = video.currentTime;
    let maxBuf = 0;

    for (let i = 0; i < video.buffered.length; i++) {
      const bStart = video.buffered.start(i);
      const bEnd = video.buffered.end(i);
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
  }, []);

  // ── Sync Progress to Store & Firestore ─────────────────────────────────────
  const syncProgressToStore = useCallback((time, dur, markWatched = false) => {
    if (!animeId || !episode?.id) return;
    if (isNaN(time) || time < 0) return;

    const roundTime = Math.floor(time);
    lastSavedTimeRef.current = roundTime;

    const currentDuration = dur || duration || knownDurationRef.current || episode.durationSeconds || 1;
    const progressPct = Math.min(100, Math.round((roundTime / currentDuration) * 100));
    const shouldMarkWatched = markWatched || progressPct >= 90;

    try {
      const storedEps = getLocalEpisodes(animeId);
      if (storedEps && storedEps.length > 0) {
        const updated = storedEps.map((e) =>
          e.id === episode.id
            ? {
                ...e,
                lastPositionSeconds: roundTime,
                isWatched: shouldMarkWatched,
              }
            : e
        );
        setLocalEpisodes(animeId, updated);

        const totalAnimeEps = updated.length;
        const watchedAnimeEps = updated.filter((e) => e.isWatched).length;
        const animeProgressPercent = totalAnimeEps > 0 ? Math.round((watchedAnimeEps / totalAnimeEps) * 100) : 0;

        upsertLocalAnime({
          id: animeId,
          lastWatchedEpisode: episode.episodeNumber ? `EP-${episode.episodeNumber}` : '',
          lastOpenedAt: new Date().toISOString(),
          progressPercent: animeProgressPercent,
        });
      }
    } catch (e) {
      console.warn('[YtDlpPlayer] LocalStore sync error:', e);
    }

    if (currentUser && db) {
      try {
        const epRef = doc(db, 'users', currentUser.uid, 'anime', animeId, 'episodes', episode.id);
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
          lastWatchedEpisode: episode.episodeNumber ? `EP-${episode.episodeNumber}` : '',
          lastOpenedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      } catch (err) {
        console.warn('[YtDlpPlayer] Firestore sync error:', err);
      }
    }
  }, [animeId, episode, duration, currentUser]);

  // Toggle Watched Marker
  const handleToggleWatched = () => {
    const nextWatched = !isCurrentWatched;
    setIsCurrentWatched(nextWatched);
    const effDur = duration > 4 ? duration : (knownDurationRef.current || episode?.durationSeconds || 1);
    const newPos = nextWatched ? Math.floor(effDur) : 0;

    syncProgressToStore(newPos, effDur, nextWatched);

    if (episode) {
      episode.isWatched = nextWatched;
      episode.lastPositionSeconds = newPos;
    }
  };

  // Periodic Save (every 8s)
  useEffect(() => {
    if (playerState !== 'playing') return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      if (Math.abs(video.currentTime - lastSavedTimeRef.current) >= 8) {
        syncProgressToStore(video.currentTime, duration);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [playerState, duration, syncProgressToStore]);

  // ── Native Media Events ────────────────────────────────────────────────────
  const handleLoadStart = () => {
    setPlayerState('loading');
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    const vidDuration = video.duration;
    if (!isNaN(vidDuration) && vidDuration > 4 && isFinite(vidDuration)) {
      setDuration(vidDuration);
      video._fakeDuration = vidDuration;
    } else if (knownDurationRef.current > 4) {
      setDuration(knownDurationRef.current);
      video._fakeDuration = knownDurationRef.current;
    }

    // Restore saved playback position
    if (!savedPositionRestoredRef.current) {
      savedPositionRestoredRef.current = true;
      const savedPos = episode?.lastPositionSeconds || 0;
      const targetDur = duration || knownDurationRef.current || 0;
      if (savedPos > 5 && targetDur && savedPos < targetDur - 10) {
        video.currentTime = savedPos;
        setCurrentTime(savedPos);
      }
    }

    video.playbackRate = playbackSpeed;
    video.volume = isMuted ? 0 : volume;
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const cur = video.currentTime;
    setCurrentTime(cur);

    if (video.duration > 4 && isFinite(video.duration)) {
      setDuration(video.duration);
    }

    // Auto skip intro (from 0s to 85s if enabled)
    if (autoSkipIntro && cur < 85 && cur >= 2) {
      video.currentTime = 85;
      setCurrentTime(85);
    }

    // Mark Watched threshold (90%)
    const targetDur = duration || knownDurationRef.current;
    if (targetDur && targetDur > 10 && !isWatchedMarkedRef.current) {
      const pct = (cur / targetDur) * 100;
      if (pct >= 90) {
        isWatchedMarkedRef.current = true;
        setIsCurrentWatched(true);
        syncProgressToStore(cur, targetDur, true);
      }
    }

    updateBufferMetrics();
  };

  const handleProgress = () => {
    updateBufferMetrics();
  };

  const handlePlay = () => {
    setPlayerState('playing');
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      setSpeedMenuOpen(false);
    }, 3000);
  };

  const handlePause = () => {
    setPlayerState('paused');
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (videoRef.current) {
      syncProgressToStore(videoRef.current.currentTime, duration);
    }
  };

  const handleWaiting = () => {
    setPlayerState('loading');
  };

  const handleCanPlay = () => {
    if (playerState === 'loading') {
      setPlayerState(videoRef.current?.paused ? 'paused' : 'playing');
    }
  };

  const handleEnded = () => {
    setPlayerState('paused');
    setIsCurrentWatched(true);
    syncProgressToStore(duration, duration, true);

    if (autoNext) {
      handleNextEpisode();
    }
  };

  const handleError = () => {
    const video = videoRef.current;
    const err = video?.error;
    console.error('[YtDlpPlayer] Native video error:', err);
    setPlayerState('error');
    setErrorMessage('Playback Error via YT-DLP Stream');
    setErrorDetails(
      err?.message ||
        'The yt-dlp media stream encountered an issue or the remote video is unavailable.'
    );
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

  // ── Playback Controls ──────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
      triggerPlayPauseAnimation(true);
    } else {
      video.pause();
      triggerPlayPauseAnimation(false);
    }
  }, [triggerPlayPauseAnimation]);

  const handleSeek = useCallback((newTime) => {
    const video = videoRef.current;
    if (!video) return;

    const clamped = Math.max(0, Math.min(newTime, duration || 999999));
    video.currentTime = clamped;
    setCurrentTime(clamped);
  }, [duration]);

  const skipSeconds = useCallback((delta) => {
    const video = videoRef.current;
    if (!video) return;

    triggerSeekAnimation(delta > 0 ? 'right' : 'left', `${Math.abs(delta)}s`);
    handleSeek(video.currentTime + delta);
  }, [handleSeek, triggerSeekAnimation]);

  const handleSpeedChange = useCallback((speed, showToast = false) => {
    const clamped = Math.max(0.25, Math.min(10.0, Math.round((parseFloat(speed) || 1.0) * 100) / 100));
    setPlaybackSpeed(clamped);
    setCustomSpeedInput(String(clamped));
    if (videoRef.current) {
      videoRef.current.playbackRate = clamped;
    }
    if (showToast) {
      triggerSpeedToast(clamped);
    }
  }, [triggerSpeedToast]);

  const handleCustomSpeedSubmit = (e) => {
    e?.preventDefault();
    const parsed = parseFloat(customSpeedInput);
    if (!isNaN(parsed) && parsed >= 0.1 && parsed <= 10) {
      handleSpeedChange(parsed, true);
    }
  };

  const handleVolumeChange = (newVol) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('watchanime_media_player_volume', String(newVol));
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      setIsMuted(false);
      video.muted = false;
      video.volume = volume || 1;
    } else {
      setIsMuted(true);
      video.muted = true;
    }
  };

  // Fullscreen only video wrapper
  const toggleFullscreen = () => {
    const container = videoContainerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch((err) => {
        console.error('[YtDlpPlayer] Fullscreen failed:', err);
      });
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
      console.warn('[YtDlpPlayer] PiP error:', e);
    }
  };

  // Next / Previous Episode Navigation
  const currentEpIndex = episodes.findIndex((e) => e.id === episode?.id);
  const hasNext = currentEpIndex !== -1 && currentEpIndex < episodes.length - 1;
  const hasPrev = currentEpIndex > 0;

  const handleNextEpisode = () => {
    if (hasNext && onEpisodeChange) {
      onEpisodeChange(episodes[currentEpIndex + 1]);
    }
  };

  const handlePrevEpisode = () => {
    if (hasPrev && onEpisodeChange) {
      onEpisodeChange(episodes[currentEpIndex - 1]);
    }
  };

  // Controls Visibility Auto-Hide
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    const video = videoRef.current;
    const isPlaying = video ? !video.paused : playerState === 'playing';
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setSpeedMenuOpen(false);
      }, 3000);
    }
  }, [playerState]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      // Speed Up: Shift + > or >
      const isSpeedUp = (e.shiftKey && (e.key === '>' || e.key === '.' || e.code === 'Period')) || e.key === '>';
      // Speed Down: Shift + < or <
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

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          skipSeconds(-10);
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          skipSeconds(10);
          break;
        case 'arrowup':
          e.preventDefault();
          handleVolumeChange(Math.min(1, volume + 0.05));
          break;
        case 'arrowdown':
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 0.05));
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'c':
          e.preventDefault();
          setSubtitlesEnabled((prev) => !prev);
          break;
        case 'n':
          if (hasNext) handleNextEpisode();
          break;
        case 'p':
          if (hasPrev) handlePrevEpisode();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skipSeconds, volume, playbackSpeed, handleSpeedChange, hasNext, hasPrev]);

  // Scrubber percentage
  const currentPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercentage = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      className={`min-h-screen flex flex-col lg:flex-row bg-[#07090f] text-white select-none transition-colors duration-500 ${
        lightOn ? '' : 'bg-black'
      }`}
    >
      {/* ── Ambient Glowing Backdrop ────────────────────────────────────────── */}
      {lightOn && (
        <div
          className="fixed inset-0 pointer-events-none opacity-20 blur-[140px] transition-all duration-1000 -z-10"
          style={{
            background: `radial-gradient(circle at 60% 40%, #06b6d4 0%, transparent 60%), radial-gradient(circle at 20% 60%, #3b82f6 0%, transparent 50%)`,
          }}
        />
      )}

      {/* ── LEFT PANEL: Folder-Wise Episode Grouping & Selection ────────────── */}
      <aside className="w-full lg:w-80 xl:w-96 bg-[#0c101c]/90 backdrop-blur-xl border-r border-white/5 flex flex-col shrink-0 h-auto lg:h-[calc(100vh-3.5rem)] order-2 lg:order-1">
        {/* Header & Search */}
        <div className="p-4 border-b border-white/5 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Youtube size={16} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-white">YT-DLP Playlist</h3>
                <span className="text-[10px] text-gray-400 font-medium">
                  {episodes.length} streamable {episodes.length === 1 ? 'episode' : 'episodes'}
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              YT-DLP
            </span>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={epSearch}
              onChange={(e) => setEpSearch(e.target.value)}
              placeholder="Search episode number or title..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition"
            />
            {epSearch && (
              <button
                onClick={() => setEpSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Folder Tabs */}
          {folderGroups.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1">
              <button
                onClick={() => setSelectedFolderKey('ALL')}
                className={`px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition whitespace-nowrap cursor-pointer ${
                  selectedFolderKey === 'ALL'
                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                    : 'bg-white/5 hover:bg-white/10 text-gray-400 border border-white/5'
                }`}
              >
                All Folders ({episodes.length})
              </button>
              {folderGroups.map((g) => (
                <button
                  key={g.folderName}
                  onClick={() => setSelectedFolderKey(g.folderName)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition whitespace-nowrap cursor-pointer ${
                    selectedFolderKey === g.folderName
                      ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                      : 'bg-white/5 hover:bg-white/10 text-gray-400 border border-white/5'
                  }`}
                >
                  {g.folderName} ({g.count})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable Episode List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 no-scrollbar">
          {visibleEpisodes.map((ep) => {
            const isActive = ep.id === episode?.id;
            const pct = calcEpPercentage(ep);
            const isDone = ep.isWatched || pct >= 90;

            return (
              <button
                key={ep.id}
                onClick={() => onEpisodeChange && onEpisodeChange(ep)}
                onMouseEnter={(e) => handleEpMouseEnter(ep, e)}
                onMouseMove={handleEpMouseMove}
                onMouseLeave={handleEpMouseLeave}
                className={`w-full p-2.5 rounded-xl text-left transition flex items-center justify-between group cursor-pointer border ${
                  isActive
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-white shadow-lg shadow-cyan-500/10'
                    : 'bg-white/[0.02] hover:bg-white/5 border-white/5 text-gray-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Status Dot */}
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      isDone
                        ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                        : pct > 0
                        ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
                        : 'bg-white/20'
                    }`}
                  />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-white">
                        Ep {selectedFolderKey === 'ALL' ? (ep.continuousNum || ep.folderEpNum || ep.episodeNumber || 1) : (ep.folderEpNum || ep.episodeNumber || 1)}
                      </span>
                      {ep.folderEpNum && selectedFolderKey === 'ALL' && folderGroups.length > 1 && (
                        <span className="text-[10px] text-gray-500 font-bold">
                          ({ep.folderName}: #{ep.folderEpNum})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate max-w-[180px] group-hover:text-gray-200 transition">
                      {ep.fileName || `Episode ${ep.episodeNumber || 1}`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {pct > 0 && !isDone && (
                    <span className="text-[10px] font-extrabold text-amber-400 font-mono">
                      {pct}%
                    </span>
                  )}
                  {isDone && (
                    <CheckCircle2 size={14} className="text-emerald-400" />
                  )}
                  <span className="text-[10px] text-gray-500 font-mono">
                    {formatTime(ep.durationSeconds || 0)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── RIGHT MAIN AREA: Video Viewport & Floating Controls ──────────────── */}
      <main className="flex-1 flex flex-col order-1 lg:order-2 overflow-hidden relative">
        {/* Ambient Glow Canvas Backdrop (YouTube Style Two-Layer Ping-Pong Crossfade) */}
        {ambientMode && !isFullscreen && (
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

        {/* Fullscreenable Video Wrapper */}
        <div
          ref={videoContainerRef}
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
          className="relative flex-1 flex items-center justify-center bg-black overflow-hidden group"
          style={{ minHeight: isFullscreen ? '100vh' : '58vh' }}
        >
          <video
            ref={videoRef}
            playsInline
            crossOrigin="anonymous"
            onClick={togglePlay}
            onLoadStart={handleLoadStart}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onProgress={handleProgress}
            onPlay={handlePlay}
            onPause={handlePause}
            onWaiting={handleWaiting}
            onCanPlay={handleCanPlay}
            onEnded={handleEnded}
            onError={handleError}
            className="w-full h-full object-contain cursor-pointer"
          />

          {/* Subtitle Overlay */}
          {subtitlesEnabled && currentSubtitleText && (
            <div
              className="absolute bottom-20 inset-x-8 text-center pointer-events-none z-20 flex justify-center"
            >
              <span
                style={{
                  fontSize: `${subFontSize}px`,
                  color: subTextColor,
                  backgroundColor: `${subBgColor}${Math.round(subBgOpacity * 255).toString(16).padStart(2, '0')}`,
                  border: subBoxBorder ? `1px solid ${subTextColor}55` : 'none',
                  textShadow:
                    subOutline === 'heavy'
                      ? '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000'
                      : subOutline === 'light'
                      ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                      : 'none',
                }}
                className="px-3 py-1.5 rounded-lg max-w-2xl font-bold leading-relaxed transition-all duration-150 inline-block backdrop-blur-[1px]"
              >
                {currentSubtitleText}
              </span>
            </div>
          )}

          {/* Buffering Spinner */}
          {playerState === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none z-30">
              <div className="w-12 h-12 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin mb-3" />
              <span className="text-xs font-black uppercase tracking-widest text-cyan-300">
                Buffering via YT-DLP...
              </span>
            </div>
          )}

          {/* Error Message */}
          {playerState === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center z-30">
              <div className="p-3.5 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 mb-3">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">{errorMessage}</h3>
              <p className="text-xs text-gray-400 max-w-md mb-4">{errorDetails}</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const video = videoRef.current;
                    if (video) {
                      video.load();
                      video.play().catch(() => {});
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-cyan-500 text-black font-bold text-xs hover:bg-cyan-400 transition cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw size={14} /> Retry Stream
                </button>
                <button
                  onClick={onBack}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
                >
                  Go Back
                </button>
              </div>
            </div>
          )}

          {/* ── Visual Overlays & Animations ─────────────────────────────── */}
          {/* Left-side Rewind 10s Vignette & Chevron Animation */}
          {seekFeedback && seekFeedback.side === 'left' && (
            <div
              key={`yt-seek-left-${seekFeedback.key}`}
              className="absolute inset-y-0 left-0 w-2/5 sm:w-1/3 pointer-events-none z-30 flex items-center justify-start pl-6 sm:pl-12 animate-seek-left overflow-hidden"
              style={{
                background: 'radial-gradient(ellipse 100% 100% at 0% 50%, rgba(0, 240, 255, 0.25) 0%, rgba(0, 240, 255, 0.08) 50%, transparent 100%)',
              }}
            >
              <div className="flex flex-col items-center gap-1 text-white select-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
                <div className="flex items-center text-cyan-300">
                  <ChevronLeft size={30} strokeWidth={3} className="animate-chevron-left-3 -mr-3" />
                  <ChevronLeft size={30} strokeWidth={3} className="animate-chevron-left-2 -mr-3" />
                  <ChevronLeft size={30} strokeWidth={3} className="animate-chevron-left-1" />
                </div>
                <span className="text-xs sm:text-sm font-black tracking-wider uppercase bg-black/60 px-3 py-0.5 rounded-full border border-cyan-400/30 text-cyan-300 shadow-md">
                  {seekFeedback.text}
                </span>
              </div>
            </div>
          )}

          {/* Right-side Forward 10s Vignette & Chevron Animation */}
          {seekFeedback && seekFeedback.side === 'right' && (
            <div
              key={`yt-seek-right-${seekFeedback.key}`}
              className="absolute inset-y-0 right-0 w-2/5 sm:w-1/3 pointer-events-none z-30 flex items-center justify-end pr-6 sm:pr-12 animate-seek-right overflow-hidden"
              style={{
                background: 'radial-gradient(ellipse 100% 100% at 100% 50%, rgba(0, 240, 255, 0.25) 0%, rgba(0, 240, 255, 0.08) 50%, transparent 100%)',
              }}
            >
              <div className="flex flex-col items-center gap-1 text-white select-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
                <div className="flex items-center text-cyan-300">
                  <ChevronRight size={30} strokeWidth={3} className="animate-chevron-right-1 -mr-3" />
                  <ChevronRight size={30} strokeWidth={3} className="animate-chevron-right-2 -mr-3" />
                  <ChevronRight size={30} strokeWidth={3} className="animate-chevron-right-3" />
                </div>
                <span className="text-xs sm:text-sm font-black tracking-wider uppercase bg-black/60 px-3 py-0.5 rounded-full border border-cyan-400/30 text-cyan-300 shadow-md">
                  {seekFeedback.text}
                </span>
              </div>
            </div>
          )}

          {/* Center Screen Play / Pause Pop Animation Feedback */}
          {playPauseFeedback && (
            <div
              key={`yt-playpause-${playPauseFeedback.key}`}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 select-none"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/65 backdrop-blur-md border border-cyan-400/30 flex items-center justify-center text-white shadow-[0_0_40px_rgba(0,0,0,0.8)] animate-play-pause-pop">
                {playPauseFeedback.isPlaying ? (
                  <Play size={32} fill="white" className="translate-x-0.5 text-white" />
                ) : (
                  <Pause size={32} fill="white" className="text-white" />
                )}
              </div>
            </div>
          )}

          {/* Top-Center Playback Speed Indicator Toast */}
          {speedToast && (
            <div
              key={`yt-speed-${speedToast.key}`}
              className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none z-30 select-none animate-speed-toast"
            >
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-amber-400/40 text-amber-300 shadow-[0_0_25px_rgba(251,191,36,0.35)]">
                <Zap size={14} className="text-amber-400 fill-amber-400 animate-pulse" />
                <span className="text-xs sm:text-sm font-black tracking-wide font-mono">
                  {speedToast.speed}x Speed
                </span>
              </div>
            </div>
          )}

          {/* Top Quick Bar (Lights, Intro Skip, Next, Ambient) */}
          <div
            className={`absolute top-4 inset-x-4 flex items-center justify-between pointer-events-none transition-opacity duration-300 z-30 ${
              showControls || playerState === 'paused' || playerState === 'idle' ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={onBack}
                className="px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md hover:bg-white/20 text-white text-xs font-bold transition border border-white/10 flex items-center gap-1.5 cursor-pointer"
              >
                <ChevronRight size={14} className="rotate-180" /> Back
              </button>

              <span className="px-2.5 py-1 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-black uppercase tracking-wider hidden sm:inline-flex items-center gap-1">
                <Youtube size={12} /> Ep {episode?.episodeNumber || 1}
              </span>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              {/* Watched Marker Button */}
              <button
                onClick={handleToggleWatched}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border flex items-center gap-1.5 cursor-pointer backdrop-blur-md ${
                  isCurrentWatched
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-black/70 text-gray-300 border-white/10 hover:bg-white/10'
                }`}
                title={isCurrentWatched ? 'Mark as Unwatched' : 'Mark as Watched'}
              >
                <CheckCircle2 size={14} className={isCurrentWatched ? 'text-emerald-400' : 'text-gray-400'} />
                <span>{isCurrentWatched ? 'Watched' : 'Mark Watched'}</span>
              </button>

              {/* Ambient Lights */}
              <button
                onClick={() => setLightOn((l) => !l)}
                className={`p-2 rounded-xl backdrop-blur-md transition cursor-pointer border ${
                  lightOn
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-black/70 text-gray-400 border-white/10 hover:text-white'
                }`}
                title="Toggle Ambient Light"
              >
                <Lightbulb size={16} />
              </button>
            </div>
          </div>

          {/* ── Floating Controls Bar ────────────────────────────────────────── */}
          <div
            className={`absolute bottom-4 inset-x-4 max-w-5xl mx-auto rounded-2xl bg-black/80 backdrop-blur-xl border border-white/10 p-3 flex flex-col gap-2 shadow-2xl transition-all duration-300 z-30 ${
              showControls || playerState === 'paused' || playerState === 'idle'
                ? 'opacity-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          >
            {/* Scrubber Timeline */}
            <div className="relative w-full flex items-center group/scrubber cursor-pointer py-1">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer z-10"
              />
              <div className="w-full h-1.5 group-hover/scrubber:h-2.5 bg-white/15 rounded-full overflow-hidden relative transition-all">
                {/* Buffered bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-white/25 transition-all duration-200 rounded-full"
                  style={{ width: `${bufferedPercentage}%` }}
                />
                {/* Played bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-cyan-500 to-blue-500 transition-all rounded-full"
                  style={{ width: `${currentPercentage}%` }}
                />
              </div>
            </div>

            {/* Bottom Controls Row */}
            <div className="flex items-center justify-between text-xs pt-1">
              {/* Left Actions (Play, Skip, Next, Time) */}
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="p-2 rounded-xl bg-white/10 hover:bg-cyan-500 hover:text-black text-white transition cursor-pointer"
                  title="Play/Pause (Space)"
                >
                  {playerState === 'playing' ? <Pause size={18} /> : <Play size={18} />}
                </button>

                <button
                  onClick={() => skipSeconds(-10)}
                  className="p-2 rounded-xl hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                  title="Rewind 10s (J or Left Arrow)"
                >
                  <RotateCcw size={16} />
                </button>

                <button
                  onClick={() => skipSeconds(10)}
                  className="p-2 rounded-xl hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                  title="Forward 10s (L or Right Arrow)"
                >
                  <RotateCw size={16} />
                </button>

                <button
                  onClick={handleNextEpisode}
                  disabled={!hasNext}
                  className={`p-2 rounded-xl transition cursor-pointer ${
                    hasNext ? 'hover:bg-white/10 text-gray-300 hover:text-white' : 'opacity-30 cursor-not-allowed text-gray-600'
                  }`}
                  title="Next Episode"
                >
                  <SkipForward size={16} />
                </button>

                {/* Volume Slider with Colored Fill */}
                <div className="flex items-center gap-1.5 group/vol">
                  <button
                    onClick={toggleMute}
                    className="p-2 rounded-xl hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                  >
                    {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    style={{
                      background: `linear-gradient(to right, #00f0ff ${(isMuted ? 0 : volume) * 100}%, rgba(255, 255, 255, 0.2) ${(isMuted ? 0 : volume) * 100}%)`,
                    }}
                    className="w-16 sm:w-20 h-1.5 accent-cyan-400 rounded-full cursor-pointer hidden sm:block appearance-none"
                  />
                </div>

                {/* Time Display */}
                <div className="text-[11px] font-mono text-gray-400 select-none">
                  <span className="text-white font-bold">{formatTime(currentTime)}</span> / {formatTime(duration)}
                </div>
              </div>

              {/* Right Actions (Quality, Speed, Subtitles, Ambient, PiP, Fullscreen) */}
              <div className="flex items-center gap-2">
                {/* Quality Selector */}
                <div className="relative">
                  <button
                    onClick={() => setQualityMenuOpen((q) => !q)}
                    className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-[11px] font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-1"
                  >
                    <span>{selectedQuality}</span>
                  </button>

                  {qualityMenuOpen && (
                    <div className="absolute bottom-full right-0 mb-2 w-32 bg-[#0c101c] border border-white/10 rounded-xl p-1.5 shadow-2xl z-40 space-y-1">
                      <div className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-gray-400 border-b border-white/5">
                        Stream Quality
                      </div>
                      {availableQualities.map((q) => (
                        <button
                          key={q}
                          onClick={() => {
                            setSelectedQuality(q);
                            setQualityMenuOpen(false);
                          }}
                          className={`w-full px-2 py-1 rounded-lg text-left text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                            selectedQuality === q ? 'bg-cyan-500/20 text-cyan-300' : 'hover:bg-white/10 text-gray-300'
                          }`}
                        >
                          <span>{q}</span>
                          {selectedQuality === q && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Subtitles Toggle & In-Player Settings Popover */}
                <div className="relative group/subsettings flex items-center gap-1">
                  <button
                    onClick={() => setSubtitlesEnabled((s) => !s)}
                    className={`p-2 rounded-xl transition cursor-pointer border ${
                      subtitlesEnabled
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                        : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
                    }`}
                    title="Toggle Subtitles (C)"
                  >
                    <Subtitles size={16} />
                  </button>

                  <button
                    onClick={() => setSubSettingsOpen((o) => !o)}
                    className={`p-2 rounded-xl border transition cursor-pointer ${
                      subSettingsOpen
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-400 hover:text-white'
                    }`}
                    title="Subtitle Settings (Size, Colors, Opacity, Sync)"
                  >
                    <Settings size={15} />
                  </button>

                  {/* Subtitle In-Player Popover Menu */}
                  {subSettingsOpen && (
                    <div className="absolute bottom-full right-0 mb-3 w-72 sm:w-80 bg-[#0c101c]/95 backdrop-blur-xl border border-white/20 rounded-2xl p-3.5 shadow-2xl z-40 space-y-3 animate-in fade-in zoom-in-95 duration-150 text-xs max-h-[65vh] overflow-y-auto custom-scrollbar text-left">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-gray-200 flex items-center gap-1.5">
                          <Subtitles size={14} className="text-cyan-400" />
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
                      <div className="p-3 rounded-xl bg-black/80 border border-white/10 flex items-center justify-center min-h-[48px] relative overflow-hidden">
                        <span
                          style={{
                            fontSize: `${subFontSize}px`,
                            color: subTextColor,
                            backgroundColor:
                              subBgColor === 'transparent'
                                ? 'transparent'
                                : `${subBgColor}${Math.round(subBgOpacity * 255).toString(16).padStart(2, '0')}`,
                            textShadow: '0 2px 4px rgba(0,0,0,0.9)',
                          }}
                          className={`font-bold px-3 py-1 rounded-lg text-center max-w-full text-[11px] leading-tight select-none transition-all ${
                            subBoxBorder ? 'border border-white/20' : 'border-none'
                          }`}
                        >
                          Sample YouTube Anime Subtitle
                        </span>
                      </div>

                      {/* Font Size */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-gray-300">
                          <span>Font Size</span>
                          <span className="text-cyan-400 font-mono">{subFontSize}px</span>
                        </div>
                        <input
                          type="range"
                          min={12}
                          max={36}
                          value={subFontSize}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setSubFontSize(val);
                            updateSubSetting('fontsize', val);
                          }}
                          className="w-full accent-cyan-400 h-1 bg-white/20 rounded cursor-pointer"
                        />
                      </div>

                      {/* Colors */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-300 block">Text Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={subTextColor}
                              onChange={(e) => {
                                setSubTextColor(e.target.value);
                                updateSubSetting('textcolor', e.target.value);
                              }}
                              className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                            />
                            <span className="text-[10px] font-mono text-gray-300">{subTextColor}</span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-300 block">Background</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={subBgColor}
                              onChange={(e) => {
                                setSubBgColor(e.target.value);
                                updateSubSetting('bgcolor', e.target.value);
                              }}
                              className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                            />
                            <span className="text-[10px] font-mono text-gray-300">{subBgColor}</span>
                          </div>
                        </div>
                      </div>

                      {/* Background Opacity */}
                      <div className="space-y-1 pt-1 border-t border-white/5">
                        <div className="flex justify-between text-[10px] font-bold text-gray-300">
                          <span>BG Opacity</span>
                          <span className="text-cyan-400 font-mono">{Math.round(subBgOpacity * 100)}%</span>
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
                          className="w-full accent-cyan-400 h-1 bg-white/20 rounded cursor-pointer"
                        />
                      </div>

                      {/* Box Border Toggle */}
                      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-bold text-gray-300">
                        <span>Box Outline (Border)</span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = !subBoxBorder;
                            setSubBoxBorder(next);
                            updateSubSetting('box_border', next);
                          }}
                          className={`px-2.5 py-0.5 rounded-lg font-bold border transition cursor-pointer ${
                            subBoxBorder ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40' : 'bg-[#181f30] text-gray-400 border-white/10'
                          }`}
                        >
                          {subBoxBorder ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>

                      {/* Sync Delay */}
                      <div className="p-2 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-gray-300">Subtitle Sync Offset</span>
                          <span className={`font-mono ${subDelay !== 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                            {subDelay > 0 ? `+${subDelay.toFixed(1)}s` : `${subDelay.toFixed(1)}s`}
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
                              className={`py-1 rounded-lg text-[10px] font-bold transition border cursor-pointer ${
                                val === 0
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

                {/* Speed Selector (Presets + Custom Slider up to 4x/10x) */}
                <div className="relative group/speed">
                  <button className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-[11px] font-mono font-bold transition cursor-pointer">
                    {playbackSpeed}x
                  </button>

                  <div className="absolute bottom-full right-0 mb-2 w-52 bg-[#0c101c]/95 backdrop-blur-xl border border-white/20 rounded-2xl p-3 shadow-2xl hidden group-hover/speed:block z-40 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-gray-300">
                        Playback Speed
                      </span>
                      <span className="font-mono font-bold text-cyan-400 text-xs">
                        {playbackSpeed}x
                      </span>
                    </div>

                    {/* Presets with 0.5x gap */}
                    <div className="grid grid-cols-3 gap-1">
                      {[0.5, 1.0, 1.5, 2.0, 2.5, 3.0].map((s) => (
                        <button
                          key={s}
                          onClick={() => handleSpeedChange(s, true)}
                          className={`py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            playbackSpeed === s
                              ? 'bg-cyan-500 text-black font-black'
                              : 'bg-white/5 hover:bg-white/10 text-gray-300'
                          }`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>

                    {/* Smooth Slider */}
                    <div className="space-y-1 pt-1.5 border-t border-white/5">
                      <div className="flex justify-between text-[10px] text-gray-400 font-semibold">
                        <span>Speed Slider</span>
                        <span className="text-cyan-400 font-mono">{playbackSpeed.toFixed(2)}x</span>
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
                        className="w-full accent-cyan-400 bg-white/20 h-1 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Ambient Light Mode Toggle (YouTube Style) */}
                <button
                  onClick={toggleAmbientMode}
                  className={`p-2 rounded-xl transition cursor-pointer border flex items-center gap-1 ${
                    ambientMode
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                      : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
                  }`}
                  title={ambientMode ? 'Disable YouTube Ambient Glow' : 'Enable YouTube Ambient Glow'}
                >
                  <Sparkles size={16} className={ambientMode ? 'text-cyan-300 animate-pulse' : 'text-gray-400'} />
                </button>

                {/* Picture-in-Picture (Real PiP SVG Icon) */}
                <button
                  onClick={togglePiP}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer hidden sm:flex items-center justify-center"
                  title="Picture in Picture"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <rect x="12" y="10" width="8" height="7" rx="1" fill="currentColor" fillOpacity="0.35" />
                  </svg>
                </button>

                {/* Fullscreen Button */}
                <button
                  onClick={toggleFullscreen}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                  title="Toggle Fullscreen (F)"
                >
                  {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
      {hoveredEp && (
        <div
          className="fixed pointer-events-none z-50 w-64 p-3 rounded-2xl bg-[#0c101c]/95 border border-white/15 shadow-2xl backdrop-blur-xl space-y-2 text-left"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
          }}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="text-xs font-black text-white">
              Episode {hoveredEp.continuousNum || hoveredEp.episodeNumber || 1}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                hoveredEp.isWatched || calcEpPercentage(hoveredEp) >= 90
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : calcEpPercentage(hoveredEp) > 0
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-white/10 text-gray-400'
              }`}
            >
              {hoveredEp.isWatched || calcEpPercentage(hoveredEp) >= 90
                ? '✓ Watched'
                : calcEpPercentage(hoveredEp) > 0
                ? '⏱ In Progress'
                : 'Unwatched'}
            </span>
          </div>

          <div className="text-[11px] text-gray-300 line-clamp-2 font-medium">
            {hoveredEp.fileName || `Episode ${hoveredEp.episodeNumber || 1}`}
          </div>

          {/* Progress Bar */}
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[10px] text-gray-400 font-mono">
              <span>Progress</span>
              <span className="text-white font-bold">{calcEpPercentage(hoveredEp)}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all rounded-full"
                style={{ width: `${calcEpPercentage(hoveredEp)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
