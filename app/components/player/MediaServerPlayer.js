"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, RotateCw, SkipForward, SkipBack, Settings,
  AlertTriangle, RefreshCw, Subtitles, Check, Server,
  Sliders, Info, Activity, Radio, ChevronRight, X,
  Search, Menu, Lightbulb, CheckCircle2, Plus, FolderTree,
  Bookmark, Star, Sparkles, SlidersHorizontal, Clock,
  FileVideo, Percent, StickyNote
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [serverHealth, setServerHealth] = useState('unknown');

  // ── Watched Marker State ───────────────────────────────────────────────────
  const [isCurrentWatched, setIsCurrentWatched] = useState(() => !!episode?.isWatched);

  // Sync watched state when episode prop changes
  useEffect(() => {
    setIsCurrentWatched(!!episode?.isWatched);
  }, [episode?.id, episode?.isWatched]);

  // ── Quick Controls ─────────────────────────────────────────────────────────
  const [lightOn, setLightOn] = useState(true);
  const [autoPlay, setAutoPlay] = useState(true);
  const [autoNext, setAutoNext] = useState(true);
  const [autoSkipIntro, setAutoSkipIntro] = useState(false);

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

  // ── Scrubbing & Seeking ────────────────────────────────────────────────────
  const [isScrubbing, setIsScrubbing] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const videoRef = useRef(null);
  const videoWrapperRef = useRef(null); // Reference for fullscreen of the anime video only!
  const progressBarRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const lastSavedTimeRef = useRef(0);
  const metadataDurationRef = useRef(episode?.durationSeconds || 0);
  const isWatchedMarkedRef = useRef(false);
  const savedPositionRestoredRef = useRef(false);

  // Remux check
  const isRemuxing = useMemo(() => {
    return !!(episode?.filePath?.toLowerCase().endsWith('.mkv') || selectedAudioIndex !== null);
  }, [episode?.filePath, selectedAudioIndex]);

  // Derive adjacent episodes
  const currentIndex = useMemo(() => {
    return episodes.findIndex((e) => e.id === episode?.id);
  }, [episodes, episode?.id]);

  const prevEpisode = currentIndex > 0 ? episodes[currentIndex - 1] : null;
  const nextEpisode = currentIndex >= 0 && currentIndex < episodes.length - 1 ? episodes[currentIndex + 1] : null;

  // ── 1. Group Episodes Folder-Wise with Sequential Counting ─────────────────
  const folderGroups = useMemo(() => {
    if (!episodes || episodes.length === 0) return [];

    const localAnime = animeId ? getLocalAnime(animeId) : null;
    const rootPath = localAnime?.folderPath || '';

    const groupsMap = new Map();

    episodes.forEach((ep) => {
      const folder = getFolderForEp(ep, rootPath);
      if (!groupsMap.has(folder)) {
        groupsMap.set(folder, []);
      }
      groupsMap.get(folder).push(ep);
    });

    // Natural sort folders (e.g. Season 1, Season 2, etc.)
    const sortedFolders = Array.from(groupsMap.keys()).sort((a, b) => {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Compute continuous index across all folders
    let runningGlobalIndex = 1;

    return sortedFolders.map((folderName) => {
      const folderEps = groupsMap.get(folderName);
      
      const numberedEps = folderEps.map((ep, localIdx) => {
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
  }, [episodes, animeId]);

  // Determine active folder for currently selected episode
  useEffect(() => {
    if (!episode || folderGroups.length === 0) return;
    const activeGroup = folderGroups.find(g => g.episodes.some(e => e.id === episode.id));
    if (activeGroup) {
      setSelectedFolderKey(activeGroup.folderName);
    } else {
      setSelectedFolderKey(folderGroups[0].folderName);
    }
  }, [episode?.id, folderGroups]);

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

    let isMounted = true;
    setPlayerState('loading');
    setErrorMessage('');
    setErrorDetails('');
    setCurrentTime(0);
    setStreamStartOffset(0);
    setBufferedEnd(0);
    setBufferAhead(0);
    setMediaId('');
    setMetadata(null);
    setAudioTracks([]);
    setSubtitleTracks([]);
    setSubtitleCues([]);
    setCurrentSubtitleText('');
    isWatchedMarkedRef.current = false;
    savedPositionRestoredRef.current = false;

    // Use known episode duration while metadata fetches
    if (episode.durationSeconds && episode.durationSeconds > 4) {
      metadataDurationRef.current = episode.durationSeconds;
      setDuration(episode.durationSeconds);
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
    if (!animeId || !episode?.id) return;
    if (isNaN(time) || time < 0) return;

    const roundTime = Math.floor(time);
    lastSavedTimeRef.current = roundTime;

    const currentDuration = dur || duration || metadataDurationRef.current || episode.durationSeconds || 1;
    const progressPct = Math.min(100, Math.round((roundTime / currentDuration) * 100));
    const shouldMarkWatched = markWatched || progressPct >= 90;

    // Update Local Storage
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
      }

      upsertLocalAnime({
        id: animeId,
        lastWatchedEpisode: episode.episodeNumber || '',
        lastOpenedAt: new Date().toISOString(),
        progressPercent: progressPct,
      });
    } catch (e) {
      console.warn('[MediaServerPlayer] LocalStore sync error:', e);
    }

    // Remote Firestore sync
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
      } catch (err) {
        console.warn('[MediaServerPlayer] Firestore sync error:', err);
      }
    }
  }, [animeId, episode, duration, currentUser]);

  // Toggle Watched / Unwatched Handler
  const handleToggleWatched = () => {
    const nextWatched = !isCurrentWatched;
    setIsCurrentWatched(nextWatched);
    const effDur = duration > 4 ? duration : (metadataDurationRef.current || episode?.durationSeconds || 1);
    const newPos = nextWatched ? Math.floor(effDur) : 0;

    syncProgressToStore(newPos, effDur, nextWatched);

    // Update episode in active list
    if (episode) {
      episode.isWatched = nextWatched;
      episode.lastPositionSeconds = newPos;
    }
  };

  // Periodic Firestore Progress Save (every 8s)
  useEffect(() => {
    if (playerState !== 'playing') return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const absTime = isRemuxing ? (streamStartOffset + video.currentTime) : video.currentTime;
      if (Math.abs(absTime - lastSavedTimeRef.current) >= 8) {
        syncProgressToStore(absTime, duration);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [playerState, isRemuxing, streamStartOffset, duration, syncProgressToStore]);

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
  };

  const handlePause = () => {
    if (playerState !== 'ended' && playerState !== 'error') {
      setPlayerState('paused');
    }
    const video = videoRef.current;
    if (video) {
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
    const currentDur = duration || metadataDurationRef.current || episode?.durationSeconds;
    if (!isWatchedMarkedRef.current && currentDur > 0 && absNow >= currentDur * 0.9) {
      isWatchedMarkedRef.current = true;
      setIsCurrentWatched(true);
      syncProgressToStore(absNow, currentDur, true);
    }
  };

  const handleEnded = () => {
    setPlayerState('ended');
    const currentDur = duration || metadataDurationRef.current || episode?.durationSeconds;
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

  // ── 10. Playback & Seeking Controls ────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (playerState === 'playing') {
      video.pause();
    } else {
      video.play().catch(() => {});
    }
  }, [playerState]);

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
    performSeek(absNow + delta);
  }, [isRemuxing, streamStartOffset, performSeek]);

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

  // Playback Speed Change (Supports up to 10x!)
  const handleSpeedChange = (spd) => {
    const clamped = Math.max(0.25, Math.min(10.0, parseFloat(spd) || 1.0));
    setPlaybackSpeed(clamped);
    setCustomSpeedInput(String(clamped));
    if (videoRef.current) {
      videoRef.current.playbackRate = clamped;
    }
  };

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

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

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
  }, [togglePlay, seekRelative, volume, toggleMute]);

  // Auto-hide controls
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (playerState === 'playing') {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3500);
    }
  };

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

  // Effective duration for display
  const effectiveDuration = duration > 4 ? duration : (metadataDurationRef.current > 4 ? metadataDurationRef.current : (episode?.durationSeconds || 0));
  const progressPercent = effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const bufferPercent = effectiveDuration > 0 ? Math.min(100, (bufferedEnd / effectiveDuration) * 100) : 0;

  return (
    <div
      onMouseMove={handleMouseMove}
      className={`w-full min-h-screen bg-[#07090f] text-white select-none transition-colors duration-300 ${
        !lightOn ? 'bg-black' : ''
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

      {/* Subtitle Appearance Settings Modal */}
      {subSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111827] border border-white/15 rounded-3xl p-4 sm:p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <Subtitles size={18} className="text-[#f472b6]" />
                Subtitle Appearance & Sync Settings
              </h3>
              <button
                onClick={() => setSubSettingsOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            {/* Live Subtitle Preview */}
            <div className="p-4 rounded-2xl bg-black/80 border border-white/10 flex items-center justify-center min-h-[80px] relative overflow-hidden">
              <div
                style={{
                  fontSize: `${subFontSize}px`,
                  color: subTextColor,
                  backgroundColor: subBgColor === 'transparent' ? 'transparent' : `${subBgColor}${Math.round(subBgOpacity * 255).toString(16).padStart(2, '0')}`,
                  ...getSubOutlineStyle(),
                }}
                className={`font-bold px-4 py-1.5 rounded-xl text-center max-w-sm transition-all ${
                  subBoxBorder ? 'border border-white/20' : 'border-none'
                }`}
              >
                Sample Anime Subtitle (00:01:23)
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-gray-300">
                <span>Text Size</span>
                <span className="text-yellow-400">{subFontSize}px</span>
              </div>
              <div className="flex items-center gap-2">
                {[14, 16, 18, 22, 26, 32].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => {
                      setSubFontSize(sz);
                      updateSubSetting('fontsize', sz);
                    }}
                    className={`flex-1 py-1 rounded-xl text-xs font-bold transition border ${
                      subFontSize === sz
                        ? 'bg-[#f472b6] text-black border-[#f472b6]'
                        : 'bg-[#1e293b] text-gray-300 border-white/5 hover:text-white'
                    }`}
                  >
                    {sz}px
                  </button>
                ))}
              </div>
            </div>

            {/* Text Color */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-gray-300 block">Text Colour</span>
              <div className="flex items-center gap-2">
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
                    className={`flex-1 py-1 rounded-xl text-xs font-bold transition border flex items-center justify-center gap-1 ${
                      subTextColor === c.val
                        ? 'bg-white/20 border-white text-white'
                        : 'bg-[#1e293b] text-gray-300 border-white/5 hover:text-white'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: c.val }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Background Color & Opacity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-gray-300 block">Background Colour</span>
                <select
                  value={subBgColor}
                  onChange={(e) => {
                    setSubBgColor(e.target.value);
                    updateSubSetting('bgcolor', e.target.value);
                  }}
                  className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="#000000">Black</option>
                  <option value="#0f172a">Dark Navy</option>
                  <option value="#1e293b">Slate</option>
                  <option value="transparent">Transparent (None)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold text-gray-300">
                  <span>BG Opacity</span>
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
                  className="w-full accent-[#f472b6] cursor-pointer"
                />
              </div>
            </div>

            {/* Text Stroke / Outline Style (Simple solid black outline) */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-gray-300 block">Text Outline / Stroke</span>
              <div className="flex items-center gap-2">
                {[
                  { id: 'none', label: 'None' },
                  { id: 'shadow', label: 'Drop Shadow' },
                  { id: 'heavy', label: 'Black Outline' },
                  { id: 'glow', label: 'Neon Glow' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSubOutline(item.id);
                      updateSubSetting('outline', item.id);
                    }}
                    className={`flex-1 py-1 rounded-xl text-xs font-bold transition border ${
                      subOutline === item.id
                        ? 'bg-[#f472b6] text-black border-[#f472b6]'
                        : 'bg-[#1e293b] text-gray-300 border-white/5 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Box Outline (Border) Toggle */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-bold text-gray-300">
                <span>Subtitle Box Outline (Border)</span>
                <span className={subBoxBorder ? 'text-emerald-400' : 'text-gray-400'}>
                  {subBoxBorder ? 'On' : 'Off'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSubBoxBorder(false);
                    updateSubSetting('box_border', 'false');
                  }}
                  className={`flex-1 py-1 rounded-xl text-xs font-bold transition border ${
                    !subBoxBorder
                      ? 'bg-[#f472b6] text-black border-[#f472b6]'
                      : 'bg-[#1e293b] text-gray-300 border-white/5 hover:text-white'
                  }`}
                >
                  Turn Off Box Outline
                </button>
                <button
                  onClick={() => {
                    setSubBoxBorder(true);
                    updateSubSetting('box_border', 'true');
                  }}
                  className={`flex-1 py-1 rounded-xl text-xs font-bold transition border ${
                    subBoxBorder
                      ? 'bg-[#f472b6] text-black border-[#f472b6]'
                      : 'bg-[#1e293b] text-gray-300 border-white/5 hover:text-white'
                  }`}
                >
                  Turn On Box Outline
                </button>
              </div>
            </div>

            {/* Subtitle Sync Timing Offset */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-gray-300">Subtitle Sync Offset (Timing)</span>
                <span className={`font-mono ${subDelay !== 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                  {subDelay > 0 ? `+${subDelay.toFixed(2)}s` : `${subDelay.toFixed(2)}s`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSubDelay(d => Math.max(-5, d - 0.5))}
                  className="flex-1 py-1 rounded-lg bg-[#1e293b] hover:bg-white/10 text-xs font-bold text-gray-200 border border-white/5"
                >
                  -0.5s
                </button>
                <button
                  onClick={() => setSubDelay(d => Math.max(-5, d - 0.25))}
                  className="flex-1 py-1 rounded-lg bg-[#1e293b] hover:bg-white/10 text-xs font-bold text-gray-200 border border-white/5"
                >
                  -0.25s
                </button>
                <button
                  onClick={() => setSubDelay(0)}
                  className="flex-1 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-yellow-300 border border-white/10"
                >
                  Reset (0s)
                </button>
                <button
                  onClick={() => setSubDelay(d => Math.min(5, d + 0.25))}
                  className="flex-1 py-1 rounded-lg bg-[#1e293b] hover:bg-white/10 text-xs font-bold text-gray-200 border border-white/5"
                >
                  +0.25s
                </button>
                <button
                  onClick={() => setSubDelay(d => Math.min(5, d + 0.5))}
                  className="flex-1 py-1 rounded-lg bg-[#1e293b] hover:bg-white/10 text-xs font-bold text-gray-200 border border-white/5"
                >
                  +0.5s
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setSubSettingsOpen(false)}
                className="px-6 py-2 rounded-xl bg-[#f472b6] text-black font-extrabold text-xs uppercase tracking-wider hover:brightness-110 shadow-lg"
              >
                Apply & Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Left Episodes Column + Right Player & Controls Column */}
      <div className="max-w-[1700px] mx-auto p-2 sm:p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10">

        {/* ── LEFT COLUMN: Folder-Wise Episode Selector ─────────────────────── */}
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

          {/* Filter Row: Folder Selector Dropdown & Number of Ep Search */}
          <div className="flex items-center gap-2 mb-3.5">
            
            {/* Folder Dropdown (counts each folder starting from 1!) */}
            <div className="relative flex-1">
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#171e2e] border border-white/10 text-xs font-semibold text-gray-300">
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
                    <option key={grp.folderName} value={grp.folderName} className="bg-[#111827] text-white">
                      {grp.folderName} (1-{grp.count})
                    </option>
                  ))}
                  {folderGroups.length > 1 && (
                    <option value="ALL" className="bg-[#111827] text-white">
                      All Folders (1-{episodes.length})
                    </option>
                  )}
                  {folderGroups.length === 0 && (
                    <option value="" className="bg-[#111827] text-white">Episodes (1-{episodes.length})</option>
                  )}
                </select>
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

          {/* 5-Column Episode Grid with Folder-Relative Numbering & Coloured Dots */}
          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
            {visibleEpisodes.length > 0 ? (
              <div className="grid grid-cols-5 gap-1.5">
                {visibleEpisodes.map((ep) => {
                  const isActive = ep.id === episode?.id;
                  
                  // Display number: Folder-relative (1 to folder end) or continuous if ALL selected
                  const displayNum = selectedFolderKey === 'ALL'
                    ? (ep.continuousNum || ep.folderEpNum || ep.episodeNumber)
                    : (ep.folderEpNum || ep.episodeNumber);

                  const isWatched = !!ep.isWatched;
                  const isInProgress = !isWatched && (ep.lastPositionSeconds > 5);
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
                      className={`h-9 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer border relative ${
                        isActive
                          ? 'bg-[#f472b6] text-black border-[#f472b6] shadow-md scale-105 font-black z-10'
                          : 'bg-[#181f30] hover:bg-[#232c42] text-gray-300 border-white/5 hover:text-white hover:border-white/20'
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
              <div className="py-12 text-center text-gray-500 text-xs">
                No episodes found matching "{epSearch}"
              </div>
            )}
          </div>

          {/* Coloured Dots Legend & Stats */}
          <div className="pt-3 border-t border-white/5 space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between text-gray-400">
              <span className="truncate">{selectedFolderKey === 'ALL' ? 'All Episodes' : selectedFolderKey}</span>
              <span>{visibleEpisodes.length} Episodes</span>
            </div>
            {/* Status Legend */}
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

        {/* ── RIGHT COLUMN: Video Player + Controls + Options Below ─────────── */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col space-y-4">
          
          {/* 1. Video Player Container (Ref attached here for pure video-only Fullscreen!) */}
          <div
            ref={videoWrapperRef}
            className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 group"
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
                  className={`font-bold px-4 py-1.5 rounded-xl text-center max-w-2xl leading-relaxed select-none transition-all duration-150 ${
                    subBoxBorder ? 'border border-white/20' : 'border-none'
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

            {/* In-Video Overlay Controls */}
            <div
              className={`absolute inset-0 flex flex-col justify-end pointer-events-none transition-opacity duration-300 z-20 ${
                showControls || playerState !== 'playing' ? 'opacity-100' : 'opacity-0'
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

                    {/* Volume with Hover Slider */}
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
                        className="w-16 h-1 accent-[#ffd000] bg-white/20 rounded-lg appearance-none cursor-pointer hidden sm:inline-block"
                      />
                    </div>

                    {/* Accurate Video Duration: 01:36 / 23:39 */}
                    <div className="font-mono text-xs sm:text-sm font-semibold tracking-wider text-gray-300 ml-1">
                      <span>{formatTime(currentTime)}</span>
                      <span className="text-gray-500 mx-1.5">/</span>
                      <span className="text-gray-400">{formatTime(effectiveDuration)}</span>
                    </div>
                  </div>

                  {/* Right Controls: Rewind 10, Forward 10, CC, Sub Settings, PiP, Fullscreen */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* Rewind 10s */}
                    <button
                      onClick={() => seekRelative(-10)}
                      className="p-1 text-gray-300 hover:text-[#ffd000] transition cursor-pointer flex items-center justify-center relative"
                      title="Rewind 10s"
                    >
                      <RotateCcw size={19} />
                      <span className="absolute text-[8px] font-black top-2">10</span>
                    </button>

                    {/* Forward 10s */}
                    <button
                      onClick={() => seekRelative(10)}
                      className="p-1 text-gray-300 hover:text-[#ffd000] transition cursor-pointer flex items-center justify-center relative"
                      title="Forward 10s"
                    >
                      <RotateCw size={19} />
                      <span className="absolute text-[8px] font-black top-2">10</span>
                    </button>

                    {/* Closed Captions CC */}
                    <button
                      onClick={() => {
                        if (subtitleTracks.length > 0) {
                          setSelectedSubtitleIndex((prev) => (prev === -1 ? 0 : -1));
                        }
                      }}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-black border transition cursor-pointer ${
                        selectedSubtitleIndex !== -1
                          ? 'bg-[#ffd000] text-black border-[#ffd000]'
                          : 'bg-transparent text-gray-300 border-white/20 hover:text-white'
                      }`}
                      title={subtitleTracks.length > 0 ? 'Toggle Subtitles' : 'No subtitles found'}
                    >
                      CC
                    </button>

                    {/* Subtitle Appearance Settings */}
                    <button
                      onClick={() => setSubSettingsOpen(true)}
                      className="p-1 text-gray-300 hover:text-[#ffd000] transition cursor-pointer"
                      title="Subtitle Settings (Size, Colour, Opacity, Sync)"
                    >
                      <SlidersHorizontal size={18} />
                    </button>

                    {/* Picture-in-Picture */}
                    <button
                      onClick={togglePiP}
                      className="p-1 text-gray-300 hover:text-[#ffd000] transition cursor-pointer hidden sm:block"
                      title="Picture in Picture"
                    >
                      <Sliders size={18} />
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

          {/* 2. Below Video: Quick Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-gray-300">
            
            {/* Left Toggles: Light, Auto Play, Auto Next, Auto Skip Intro */}
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
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    selectedSubtitleIndex === -1
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
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        isSelected
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
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    selectedAudioIndex === null
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
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        isSelected
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
                      onClick={() => handleSpeedChange(spd)}
                      className={`px-2.5 py-0.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        isSelected
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

      </div>

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
                EP {hoveredEp.folderEpNum || hoveredEp.episodeNumber || 1}
              </span>
              {hoveredEp.folderName && (
                <span className="text-[10px] text-gray-400 font-medium truncate">
                  • {hoveredEp.folderName}
                </span>
              )}
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
                {calcEpPercentage(hoveredEp)}% ({formatTime(hoveredEp.lastPositionSeconds || (hoveredEp.isWatched ? hoveredEp.durationSeconds : 0))} / {formatTime(hoveredEp.durationSeconds || 0)})
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
