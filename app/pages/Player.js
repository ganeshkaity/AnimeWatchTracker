"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Settings, Volume1, RotateCcw, RotateCw, SkipForward, SkipBack, X, Check,
  AlertTriangle
} from 'lucide-react';
import { doc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

// ─── Inline VTT parser (no external dep) ───────────────────────────────────────
function parseVTT(vttText) {
  const cues = [];
  const blocks = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/);
  const toSec = (t) => {
    const parts = t.trim().split(':').map(Number);
    return parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];
  };
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const tIdx = lines.findIndex(l => l.includes('-->'));
    if (tIdx === -1) continue;
    const [startStr, endStr] = lines[tIdx].split('-->');
    const text = lines
      .slice(tIdx + 1)
      .join('\n')
      .replace(/\{[^}]*\}/g, '')   // strip ASS override tags
      .replace(/<[^>]+>/g, '')      // strip html tags
      .trim();
    if (!text) continue;
    cues.push({ start: toSec(startStr.split(' ')[0]), end: toSec(endStr.trim().split(' ')[0]), text });
  }
  return cues;
}

// ─── Main Player Component ──────────────────────────────────────────────────────
export default function Player({ animeId, episodeId, episodes, onBack, initialSpeed = 1, initialVolume = 1 }) {
  const { currentUser } = useAuth();

  // ── Episode navigation ────────────────────────────────────────────────────
  const [currentEpisodeId, setCurrentEpisodeId] = useState(episodeId);
  useEffect(() => { setCurrentEpisodeId(episodeId); }, [episodeId]);

  const currentEpIndex = episodes.findIndex(e => e.id === currentEpisodeId);
  const episode = episodes[currentEpIndex];

  // ── Track selection ───────────────────────────────────────────────────────
  const [audioTracks, setAudioTracks]       = useState([]);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [selectedAudio, setSelectedAudio]   = useState(null);     // null = default
  const [selectedSubtitle, setSelectedSubtitle] = useState(null); // null|'none'|index

  // ── Derive remux flag AFTER states are declared ───────────────────────────
  const isRemuxing = !!(episode?.filePath?.toLowerCase().endsWith('.mkv') || selectedAudio !== null);

  // ── Stream seek-start offset (only for remux) ─────────────────────────────
  const [streamStartOffset, setStreamStartOffset] = useState(0);

  // ── Core playback state ───────────────────────────────────────────────────
  const videoRef         = useRef(null);
  const containerRef     = useRef(null);
  const progressBarRef   = useRef(null);
  const lastSavedTimeRef = useRef(0);
  const controlsTimeoutRef = useRef(null);
  // pendingSeekAfterLoad: if set, seek video.currentTime to (value - streamStartOffset) after load
  const pendingSeekAfterLoad = useRef(null);

  const [isPlaying,      setIsPlaying]      = useState(false);
  const [currentTime,    setCurrentTime]    = useState(0);
  const [duration,       setDuration]       = useState(0);
  const [volume,         setVolume]         = useState(initialVolume);
  const [isMuted,        setIsMuted]        = useState(false);
  const [playbackSpeed,  setPlaybackSpeed]  = useState(initialSpeed);
  const [isFullscreen,   setIsFullscreen]   = useState(false);
  const [showControls,   setShowControls]   = useState(true);
  const [errorMsg,       setErrorMsg]       = useState('');
  const [isBuffering,    setIsBuffering]    = useState(false);

  // ── Subtitle state ────────────────────────────────────────────────────────
  const [subtitleCues,       setSubtitleCues]       = useState([]);
  const [currentSubtitleText, setCurrentSubtitleText] = useState('');
  const [subtitleSize,       setSubtitleSize]       = useState(22);

  // ── Settings menu ─────────────────────────────────────────────────────────
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [settingsTab,      setSettingsTab]      = useState('main');

  // ── Scrubbing state ───────────────────────────────────────────────────────
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [hoverTime,   setHoverTime]   = useState(null);
  const [hoverX,      setHoverX]      = useState(0);
  // During remux scrubbing we preview the position without changing the stream:
  const scrubDisplayTimeRef = useRef(null); // holds the abs-time the user dragged to
  const sessionIdRef = useRef('');

  useEffect(() => {
    sessionIdRef.current = `yt_session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const session = sessionIdRef.current;
    return () => {
      if (session) {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon('/api/youtube/close-stream', JSON.stringify({ sessionId: session }));
        } else {
          fetch(`/api/youtube/close-stream?sessionId=${session}`, { keepalive: true }).catch(() => {});
        }
      }
    };
  }, [episode?.id]);

  const buildVideoStreamUrl = useCallback(() => {
    if (!episode) return '';
    if (episode.isYouTube || episode?.filePath?.startsWith('youtube://')) {
      const vId = episode.youtubeId || episode.filePath.replace('youtube://', '');
      const quality = episode.selectedQuality || 'best';
      return `/api/youtube/stream?videoId=${encodeURIComponent(vId)}&quality=${encodeURIComponent(quality)}&sessionId=${sessionIdRef.current}`;
    }
    if (!episode?.filePath) return '';
    let url = `/api/video/stream?path=${encodeURIComponent(episode.filePath)}`;
    if (selectedAudio !== null) url += `&audioIndex=${selectedAudio}`;
    if (isRemuxing && streamStartOffset > 0) {
      // Add a small 0.1s offset so FFmpeg's keyframe search lands exactly on the keyframe
      url += `&ss=${(streamStartOffset + 0.1).toFixed(3)}`;
    }
    return url;
  }, [episode, selectedAudio, isRemuxing, streamStartOffset]);

  // ── 1. Fetch metadata when episode changes ────────────────────────────────
  useEffect(() => {
    if (!episode?.filePath) return;
    setSelectedAudio(null);
    setSelectedSubtitle(null);
    setSubtitleCues([]);
    setCurrentSubtitleText('');
    setErrorMsg('');
    setCurrentTime(0);
    setDuration(episode?.durationSeconds || 0);
    setStreamStartOffset(0);
    pendingSeekAfterLoad.current = null;

    if (episode.isYouTube || episode.filePath.startsWith('youtube://')) {
      return;
    }

    const run = async () => {
      try {
        const res  = await fetch(`/api/video/metadata?path=${encodeURIComponent(episode.filePath)}`);
        const data = await res.json();
        if (data.success) {
          setAudioTracks(data.audioTracks || []);
          setSubtitleTracks(data.subtitleTracks || []);
          const dur = data.duration || 0;
          if (dur > 4) setDuration(dur);

          // Resume position on initial load for remuxing
          const isMkv = episode?.filePath?.toLowerCase().endsWith('.mkv');
          const resumePos = episode?.lastPositionSeconds || 0;
          if (isMkv && resumePos > 5 && dur && resumePos < dur - 10) {
            const kRes = await fetch(`/api/video/keyframe?path=${encodeURIComponent(episode.filePath)}&time=${resumePos}`);
            const kData = await kRes.json();
            if (kData.success) {
              setStreamStartOffset(kData.keyframeTime);
              setCurrentTime(kData.keyframeTime);
            }
          }
        }
      } catch (e) { console.error('[metadata]', e); }
    };
    run();
  }, [episode?.filePath]);

  // ── 2. Load subtitle cues when selection changes ──────────────────────────
  useEffect(() => {
    if (!selectedSubtitle || selectedSubtitle === 'none') {
      setSubtitleCues([]); setCurrentSubtitleText(''); return;
    }
    const run = async () => {
      try {
        const url = `/api/video/subtitles?path=${encodeURIComponent(episode.filePath)}&index=${selectedSubtitle}`;
        const res  = await fetch(url);
        if (!res.ok) throw new Error(`subtitle fetch ${res.status}`);
        setSubtitleCues(parseVTT(await res.text()));
      } catch (e) {
        console.error('[subtitles]', e);
        setSubtitleCues([]);
      }
    };
    run();
  }, [selectedSubtitle, episode?.filePath]);

  // ── 3. Update active subtitle cue from currentTime ────────────────────────
  useEffect(() => {
    if (!subtitleCues.length) { setCurrentSubtitleText(''); return; }
    const cue = subtitleCues.find(c => currentTime >= c.start && currentTime <= c.end);
    setCurrentSubtitleText(cue ? cue.text : '');
  }, [currentTime, subtitleCues]);

  // ── 4. Handle video metadata loaded ──────────────────────────────────────
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Resolve duration — prefer ffprobe but accept HTMLVideoElement.duration
    if (!duration || duration <= 4) {
      if (video.duration && isFinite(video.duration) && video.duration > 4) {
        setDuration(video.duration);
      }
    }

    // Restore playback speed
    video.playbackRate = playbackSpeed;

    if (pendingSeekAfterLoad.current !== null) {
      // A seek was queued (e.g. after audio-track switch or remux seek)
      const relTime = pendingSeekAfterLoad.current - streamStartOffset;
      if (relTime > 0 && isFinite(relTime)) {
        try { video.currentTime = relTime; } catch {}
      }
      pendingSeekAfterLoad.current = null;
    } else if (!isRemuxing) {
      // Native playback: resume from last saved position
      const resumePos = episode?.lastPositionSeconds || 0;
      const dur = duration || video.duration;
      if (resumePos > 5 && dur && resumePos < dur - 10) {
        try { video.currentTime = resumePos; } catch {}
      }
    }
    // For remux: ffmpeg already started at streamStartOffset (via ?ss=), so currentTime 0 = correct abs position
  }, [duration, isRemuxing, episode, playbackSpeed, streamStartOffset]);

  // ── 5. Time update ────────────────────────────────────────────────────────
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || isScrubbing) return; // don't override scrub display
    const absTime = isRemuxing ? streamStartOffset + video.currentTime : video.currentTime;
    setCurrentTime(absTime);

    const now = Date.now();
    if (now - lastSavedTimeRef.current >= 10000) {
      saveProgress(absTime, duration || video.duration);
      lastSavedTimeRef.current = now;
    }
  }, [isRemuxing, streamStartOffset, duration, isScrubbing]);

  // ── 6. Progress saving ────────────────────────────────────────────────────
  const saveProgress = async (time, videoDuration) => {
    if (!currentUser || !animeId || !currentEpisodeId || !videoDuration) return;
    try {
      const epRef = doc(db, 'users', currentUser.uid, 'anime', animeId, 'episodes', currentEpisodeId);
      await updateDoc(epRef, {
        watchedSeconds:      Math.floor(time),
        durationSeconds:     Math.floor(videoDuration),
        lastPositionSeconds: Math.floor(time),
        isWatched:           time >= videoDuration * 0.9,
        updatedAt:           new Date().toISOString(),
      });
      updateOverallProgress();
    } catch (e) { console.error('[saveProgress]', e); }
  };

  const updateOverallProgress = async () => {
    if (!currentUser || !animeId) return;
    try {
      const ref  = collection(db, 'users', currentUser.uid, 'anime', animeId, 'episodes');
      const snap = await getDocs(ref);
      let total = snap.size, watched = 0, lastNum = '', lastOpened = new Date(0);
      snap.forEach(d => {
        const data = d.data();
        if (data.isWatched) watched++;
        if (data.lastPositionSeconds > 0) {
          const t = new Date(data.updatedAt || 0);
          if (t > lastOpened) { lastOpened = t; lastNum = `EP-${data.episodeNumber}`; }
        }
      });
      await updateDoc(doc(db, 'users', currentUser.uid, 'anime', animeId), {
        progressPercent:   total > 0 ? (watched / total) * 100 : 0,
        lastWatchedEpisode: lastNum,
        updatedAt:         new Date().toISOString(),
      });
    } catch (e) { console.error('[overallProgress]', e); }
  };

  const forceSaveProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const absTime = isRemuxing ? streamStartOffset + video.currentTime : video.currentTime;
    saveProgress(absTime, duration || video.duration);
  }, [isRemuxing, streamStartOffset, duration]);

  // ── 7. Core seek ──────────────────────────────────────────────────────────
  /**
   * performSeek(absTime): seek to an absolute timestamp.
   *  - Native: direct video.currentTime assignment (instant, no reload).
   *  - Remux:  update streamStartOffset so the new URL restarts ffmpeg at the
   *            right keyframe. `pendingSeekAfterLoad` fine-tunes within the
   *            GOP once the new segment loads.
   */
  const performSeek = useCallback((absTime) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(duration || 1e9, absTime));

    if (!isRemuxing) {
      video.currentTime = clamped;
      setCurrentTime(clamped);
    } else {
      // Fetch keyframe time first to align streams and subtitles perfectly
      fetch(`/api/video/keyframe?path=${encodeURIComponent(episode.filePath)}&time=${clamped}`)
        .then(res => res.json())
        .then(data => {
          const keyframeTime = data.success ? data.keyframeTime : clamped;
          // Snap playback directly to the keyframe time to ensure 100% video/audio/subtitle sync
          pendingSeekAfterLoad.current = null;
          setStreamStartOffset(keyframeTime);
          setCurrentTime(keyframeTime);
        })
        .catch(err => {
          console.error('[keyframe fetch error]', err);
          pendingSeekAfterLoad.current = null;
          setStreamStartOffset(clamped);
          setCurrentTime(clamped);
        });
    }
  }, [isRemuxing, duration, episode?.filePath]);

  // ── 8. Relative seek (±seconds) ───────────────────────────────────────────
  const seek = useCallback((seconds) => {
    const video = videoRef.current;
    if (!video) return;
    const absNow = isRemuxing ? streamStartOffset + video.currentTime : video.currentTime;
    performSeek(absNow + seconds);
    resetControlsTimeout();
  }, [isRemuxing, streamStartOffset, performSeek]);

  // ── 9. Audio track switch (preserve position) ─────────────────────────────
  const switchAudio = useCallback((trackIndex) => {
    const video = videoRef.current;
    if (!video) return;
    const absNow = isRemuxing ? streamStartOffset + video.currentTime : video.currentTime;

    fetch(`/api/video/keyframe?path=${encodeURIComponent(episode.filePath)}&time=${absNow}`)
      .then(res => res.json())
      .then(data => {
        const keyframeTime = data.success ? data.keyframeTime : absNow;
        // Snap to keyframe
        pendingSeekAfterLoad.current = null;
        setStreamStartOffset(keyframeTime);
        setCurrentTime(keyframeTime);
        setSelectedAudio(trackIndex);
        setSettingsTab('main');
      })
      .catch(err => {
        console.error('[switch audio keyframe error]', err);
        pendingSeekAfterLoad.current = null;
        setStreamStartOffset(absNow);
        setCurrentTime(absNow);
        setSelectedAudio(trackIndex);
        setSettingsTab('main');
      });
  }, [isRemuxing, streamStartOffset, episode?.filePath]);

  // ── 10. Playback controls ─────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause(); setIsPlaying(false); forceSaveProgress();
    } else {
      video.play().then(() => setIsPlaying(true)).catch(console.error);
    }
    resetControlsTimeout();
  }, [isPlaying, forceSaveProgress]);

  const adjustVolume = (delta) => {
    const video = videoRef.current; if (!video) return;
    const next = Math.max(0, Math.min(1, video.volume + delta));
    video.volume = next; video.muted = next === 0;
    setVolume(next); setIsMuted(next === 0);
    resetControlsTimeout();
  };

  const toggleMute = () => {
    const video = videoRef.current; if (!video) return;
    const next = !isMuted;
    video.muted = next; setIsMuted(next);
    resetControlsTimeout();
  };

  const toggleFullscreen = () => {
    const c = containerRef.current; if (!c) return;
    if (!document.fullscreenElement) {
      c.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
    resetControlsTimeout();
  };

  // ── 11. Controls auto-hide ────────────────────────────────────────────────
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false); setShowSettingsMenu(false);
      }, 3000);
    }
  }, [isPlaying]);

  useEffect(() => {
    resetControlsTimeout();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [isPlaying]);

  // ── 12. Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': case 'l': e.preventDefault(); seek(10); break;
        case 'ArrowLeft':  case 'j': e.preventDefault(); seek(-10); break;
        case 'ArrowUp':    e.preventDefault(); adjustVolume(0.1); break;
        case 'ArrowDown':  e.preventDefault(); adjustVolume(-0.1); break;
        case 'f': e.preventDefault(); toggleFullscreen(); break;
        case 'm': e.preventDefault(); toggleMute(); break;
        case 'Escape':
          if (isFullscreen) toggleFullscreen();
          else { forceSaveProgress(); onBack(); }
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, togglePlay, seek, forceSaveProgress]);

  // ── 13. Episode navigation ────────────────────────────────────────────────
  const navigateToEpisode = (index) => {
    if (index < 0 || index >= episodes.length) return;
    forceSaveProgress(); setIsPlaying(false);
    setCurrentEpisodeId(episodes[index].id);
  };

  // ── 14. Timeline scrubbing ────────────────────────────────────────────────
  const getTimeFromMouseEvent = useCallback((e) => {
    const bar = progressBarRef.current; if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const pos  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return pos * (duration || 1);
  }, [duration]);

  const handleTimelineMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsScrubbing(true);
    const t = getTimeFromMouseEvent(e);
    setHoverTime(t);
    if (!isRemuxing) {
      // Native: seek live during drag
      performSeek(t);
    } else {
      // Remux: only update display during drag; commit on mouseUp
      scrubDisplayTimeRef.current = t;
      setCurrentTime(t);
    }
  }, [isRemuxing, getTimeFromMouseEvent, performSeek]);

  // Global mouse events for drag-outside-bar scrubbing
  useEffect(() => {
    if (!isScrubbing) return;

    const onMove = (e) => {
      const bar  = progressBarRef.current; if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const pos  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const t    = pos * (duration || 1);
      setHoverX(e.clientX - rect.left);
      setHoverTime(t);
      if (!isRemuxing) {
        performSeek(t);   // native: live seek
      } else {
        scrubDisplayTimeRef.current = t;
        setCurrentTime(t); // remux: display only
      }
    };

    const onUp = () => {
      if (isRemuxing && scrubDisplayTimeRef.current !== null) {
        performSeek(scrubDisplayTimeRef.current); // commit actual seek
        scrubDisplayTimeRef.current = null;
      } else {
        forceSaveProgress();
      }
      setIsScrubbing(false);
      setHoverTime(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [isScrubbing, isRemuxing, duration, performSeek, forceSaveProgress]);

  // ── 15. Helpers ───────────────────────────────────────────────────────────
  const formatTime = (secs) => {
    if (!secs || isNaN(secs) || !isFinite(secs)) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const p = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
  };

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const hasNext = currentEpIndex < episodes.length - 1;
  const hasPrev = currentEpIndex > 0;

  // ── 16. Settings menu ─────────────────────────────────────────────────────
  const renderSettingsMenu = () => {
    if (!showSettingsMenu) return null;
    const menuItems = [
      { label: 'Audio Track',    value: selectedAudio !== null ? `Track ${selectedAudio}` : 'Default', tab: 'audio' },
      { label: 'Subtitles',      value: (selectedSubtitle && selectedSubtitle !== 'none') ? `Track ${selectedSubtitle}` : 'Off', tab: 'subtitle' },
      { label: 'Subtitle Size',  value: `${subtitleSize}px`, tab: 'size' },
      { label: 'Playback Speed', value: `${playbackSpeed}x`, tab: 'speed' },
    ];

    return (
      <div
        className="absolute bottom-16 right-0 w-72 z-40 rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl bg-[#050514]/85 transition-all duration-300"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-3 space-y-1">

          {settingsTab === 'main' && (
            <>
              <p className="text-[9px] font-black uppercase tracking-widest text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-md mb-2 text-center">Player Settings</p>
              {menuItems.map(item => (
                <button key={item.tab} onClick={() => setSettingsTab(item.tab)}
                  className="w-full flex justify-between items-center py-2.5 px-3 hover:bg-cyan-500/10 hover:text-cyan-300 rounded-xl text-gray-200 transition-all duration-200 text-sm">
                  <span className="font-semibold">{item.label}</span>
                  <span className="text-gray-400 text-xs font-medium flex items-center gap-1">
                    {item.value}
                    <span className="text-gray-600 font-bold">›</span>
                  </span>
                </button>
              ))}
            </>
          )}

          {settingsTab === 'audio' && (
            <>
              <SubMenuHeader title="Audio Track" onBack={() => setSettingsTab('main')} />
              <button onClick={() => switchAudio(null)}
                className="w-full flex justify-between items-center py-2.5 px-3 hover:bg-cyan-500/10 hover:text-cyan-300 rounded-xl text-gray-200 transition-all duration-200 text-sm text-left">
                <span className={selectedAudio === null ? 'text-cyan-300 font-semibold' : ''}>Default (Original)</span>
                {selectedAudio === null && <Check size={14} className="text-cyan-400 shrink-0" />}
              </button>
              {audioTracks.map(t => (
                <button key={t.index} onClick={() => switchAudio(t.index)}
                  className="w-full flex justify-between items-center py-2.5 px-3 hover:bg-cyan-500/10 hover:text-cyan-300 rounded-xl text-gray-200 transition-all duration-200 text-sm text-left">
                  <span className={`truncate mr-2 ${selectedAudio === t.index ? 'text-cyan-300 font-semibold' : ''}`}>{t.title} · {t.codec}</span>
                  {selectedAudio === t.index && <Check size={14} className="text-cyan-400 shrink-0" />}
                </button>
              ))}
              {audioTracks.length === 0 && <p className="py-4 text-center text-gray-500 text-xs font-semibold">No alternate audio tracks</p>}
            </>
          )}

          {settingsTab === 'subtitle' && (
            <>
              <SubMenuHeader title="Subtitles" onBack={() => setSettingsTab('main')} />
              <button onClick={() => { setSelectedSubtitle('none'); setSettingsTab('main'); }}
                className="w-full flex justify-between items-center py-2.5 px-3 hover:bg-cyan-500/10 hover:text-cyan-300 rounded-xl text-gray-200 transition-all duration-200 text-sm text-left">
                <span className={(!selectedSubtitle || selectedSubtitle === 'none') ? 'text-cyan-300 font-semibold' : ''}>Off</span>
                {(!selectedSubtitle || selectedSubtitle === 'none') && <Check size={14} className="text-cyan-400 shrink-0" />}
              </button>
              {subtitleTracks.map(t => (
                <button key={t.index} onClick={() => { setSelectedSubtitle(t.index); setSettingsTab('main'); }}
                  className="w-full flex justify-between items-center py-2.5 px-3 hover:bg-cyan-500/10 hover:text-cyan-300 rounded-xl text-gray-200 transition-all duration-200 text-sm text-left">
                  <span className={`flex items-center gap-1.5 truncate mr-2 ${selectedSubtitle === t.index ? 'text-cyan-300 font-semibold' : ''}`}>
                    {t.title} · {t.codec}
                    {t.isImageBased && (
                      <AlertTriangle size={13} className="text-amber-500 inline shrink-0" title="Image-based subtitle (may not render correctly)" />
                    )}
                  </span>
                  {selectedSubtitle === t.index && <Check size={14} className="text-cyan-400 shrink-0" />}
                </button>
              ))}
              {subtitleTracks.length === 0 && <p className="py-4 text-center text-gray-500 text-xs font-semibold">No embedded subtitles</p>}
            </>
          )}

          {settingsTab === 'size' && (
            <>
              <SubMenuHeader title="Subtitle Size" onBack={() => setSettingsTab('main')} />
              <div className="flex items-center justify-between gap-4 py-3 px-2">
                <button onClick={() => setSubtitleSize(p => Math.max(12, p - 2))}
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:text-cyan-400 font-bold text-xl transition-all duration-200 cursor-pointer flex items-center justify-center">−</button>
                <span className="font-extrabold text-lg text-cyan-400">{subtitleSize}px</span>
                <button onClick={() => setSubtitleSize(p => Math.min(54, p + 2))}
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:text-cyan-400 font-bold text-xl transition-all duration-200 cursor-pointer flex items-center justify-center">+</button>
              </div>
            </>
          )}

          {settingsTab === 'speed' && (
            <>
              <SubMenuHeader title="Playback Speed" onBack={() => setSettingsTab('main')} />
              <div className="max-h-60 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                  <button key={speed} onClick={() => {
                    setPlaybackSpeed(speed);
                    if (videoRef.current) videoRef.current.playbackRate = speed;
                    setSettingsTab('main');
                  }}
                    className="w-full flex justify-between items-center py-2.5 px-3 hover:bg-cyan-500/10 hover:text-cyan-300 rounded-xl text-gray-200 transition-all duration-200 text-sm text-left">
                    <span className={playbackSpeed === speed ? 'text-cyan-300 font-semibold' : ''}>{speed}x {speed === 1 ? '(Normal)' : ''}</span>
                    {playbackSpeed === speed && <Check size={14} className="text-cyan-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!episode) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <span className="text-gray-500 font-bold">No episode found.</span>
      </div>
    );
  }

  const videoSrc = buildVideoStreamUrl();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden select-none"
      style={{ cursor: showControls ? 'default' : 'none' }}
    >

      {/* ── Video ──────────────────────────────────────── */}
      {/* key forces a full remount when the src URL changes (needed for remux seek / audio switch) */}
      <video
        key={videoSrc}
        ref={videoRef}
        src={videoSrc}
        className="w-full h-full object-contain"
        autoPlay
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onClick={togglePlay}
        onError={(e) => {
          console.error('[video error]', e);
          setErrorMsg('Playback error — file may be unsupported or corrupted.');
          setIsBuffering(false);
        }}
      />

      {/* ── Buffering Spinner ────────────────────────── */}
      {isBuffering && !errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-14 h-14 rounded-full border-4 border-white/10 border-t-cyan-400 animate-spin" />
        </div>
      )}

      {/* ── Subtitle Overlay ─────────────────────────── */}
      {currentSubtitleText && (
        <div
          className="absolute z-20 left-1/2 -translate-x-1/2 pointer-events-none text-center px-6 py-1.5 max-w-5xl transition-all duration-300"
          style={{
            bottom: showControls ? '130px' : '28px',
            fontSize: `${subtitleSize}px`,
            color: '#fff',
            fontWeight: 600,
            lineHeight: 1.4,
            textShadow: '0 0 8px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
          }}
        >
          {currentSubtitleText.split('\n').map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      {/* ── Error Overlay ────────────────────────────── */}
      {errorMsg && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 z-40 p-8">
          <p className="text-red-400 font-semibold text-center text-sm max-w-sm">{errorMsg}</p>
          <button
            onClick={() => { setErrorMsg(''); }}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm font-bold transition"
          >Dismiss</button>
        </div>
      )}

      {/* ── Controls Overlay ─────────────────────────── */}
      <div
        className={`absolute inset-0 flex flex-col justify-between pointer-events-none transition-opacity duration-300 z-30 ${showControls ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Top bar */}
        <div className="pointer-events-auto flex items-center justify-between px-5 py-4"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { forceSaveProgress(); onBack(); }}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:text-cyan-400 hover:bg-white/10 transition"
              title="Back (Esc)"
            ><X size={18} /></button>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                Episode {episode.episodeNumber}
              </span>
              <h2 className="text-sm font-bold text-white mt-1 max-w-lg truncate">{episode.fileName}</h2>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Watched</div>
            <div className="text-xs font-bold text-cyan-400">{Math.round(progressPct)}%</div>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom controls */}
        <div
          className="pointer-events-auto px-5 pb-5 pt-3 space-y-2"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92), transparent)' }}
        >
          {/* ── Timeline ── */}
          <div
            className="relative py-2.5 group/tl cursor-pointer"
            onMouseMove={(e) => {
              if (isScrubbing) return;
              const bar  = progressBarRef.current; if (!bar) return;
              const rect = bar.getBoundingClientRect();
              const pos  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setHoverTime(pos * (duration || 1));
              setHoverX(e.clientX - rect.left);
            }}
            onMouseLeave={() => { if (!isScrubbing) setHoverTime(null); }}
          >
            <div
              ref={progressBarRef}
              onMouseDown={handleTimelineMouseDown}
              className="relative w-full h-1.5 group-hover/tl:h-2.5 bg-white/10 rounded-full transition-all duration-150 overflow-visible"
            >
              {/* Played bar */}
              <div
                className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
                style={{
                  width: `${progressPct}%`,
                  background: 'linear-gradient(90deg, #bd00ff, #00f0ff)',
                  boxShadow: '0 0 10px rgba(0,240,255,0.45)',
                }}
              />
              {/* Scrub thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-cyan-400 opacity-0 group-hover/tl:opacity-100 pointer-events-none transition-opacity"
                style={{
                  left: `calc(${progressPct}% - 8px)`,
                  boxShadow: '0 0 10px rgba(0,240,255,0.8)',
                }}
              />
              {/* Hover tooltip */}
              {hoverTime !== null && (
                <div
                  className="absolute -top-9 -translate-x-1/2 px-2 py-0.5 rounded-lg bg-black/90 border border-cyan-400/30 text-cyan-400 text-[10px] font-bold whitespace-nowrap pointer-events-none"
                  style={{ left: hoverX }}
                >
                  {formatTime(hoverTime)}
                </div>
              )}
            </div>
          </div>

          {/* ── Controls Row ── */}
          <div className="flex items-center justify-between">
            {/* Left */}
            <div className="flex items-center gap-2">
              <button onClick={() => navigateToEpisode(currentEpIndex - 1)} disabled={!hasPrev}
                className="p-2 rounded-lg text-gray-400 hover:text-white disabled:opacity-20 transition" title="Previous Episode">
                <SkipBack size={16} />
              </button>
              <button onClick={() => seek(-10)}
                className="p-2 rounded-lg text-gray-400 hover:text-cyan-400 transition" title="Rewind 10s (J / ←)">
                <RotateCcw size={16} />
              </button>
              <button
                onClick={togglePlay}
                className="p-3.5 rounded-full text-white hover:scale-105 transition shadow-[0_0_14px_rgba(0,240,255,0.4)]"
                style={{ background: 'linear-gradient(135deg, #bd00ff 0%, #00f0ff 100%)' }}
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying
                  ? <Pause size={18} fill="currentColor" />
                  : <Play  size={18} fill="currentColor" />}
              </button>
              <button onClick={() => seek(10)}
                className="p-2 rounded-lg text-gray-400 hover:text-cyan-400 transition" title="Forward 10s (L / →)">
                <RotateCw size={16} />
              </button>
              <button onClick={() => navigateToEpisode(currentEpIndex + 1)} disabled={!hasNext}
                className="p-2 rounded-lg text-gray-400 hover:text-white disabled:opacity-20 transition" title="Next Episode">
                <SkipForward size={16} />
              </button>

              <span className="text-xs text-gray-400 font-semibold ml-1 tabular-nums">
                {formatTime(currentTime)}{' '}
                <span className="text-gray-600">/</span>{' '}
                {formatTime(duration)}
              </span>
            </div>

            {/* Right */}
            <div className="flex items-center gap-2 relative">
              {/* Volume */}
              <div className="flex items-center gap-1.5 group/vol">
                <button onClick={toggleMute}
                  className="p-2 rounded-lg text-gray-400 hover:text-white transition" title="Mute (M)">
                  {isMuted ? <VolumeX size={15} /> : volume > 0.5 ? <Volume2 size={15} /> : <Volume1 size={15} />}
                </button>
                <input
                  type="range" min="0" max="1" step="0.02"
                  value={isMuted ? 0 : volume}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
                    setVolume(v); setIsMuted(v === 0);
                  }}
                  className="w-0 group-hover/vol:w-20 h-1 rounded overflow-hidden bg-white/20 accent-cyan-400 transition-all duration-300"
                />
              </div>

              {/* Mark Watched */}
              <button
                onClick={() => saveProgress(duration || videoRef.current?.duration || 0, duration || videoRef.current?.duration || 0)}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase hover:bg-emerald-500 hover:text-black transition whitespace-nowrap"
              >✓ Watched</button>

              {/* Settings */}
              <div className="relative">
                <button
                  onClick={() => { setShowSettingsMenu(p => !p); setSettingsTab('main'); }}
                  className="p-2 rounded-lg text-gray-400 hover:text-cyan-400 transition" title="Settings">
                  <Settings size={15} />
                </button>
                {renderSettingsMenu()}
              </div>

              {/* Fullscreen */}
              <button onClick={toggleFullscreen}
                className="p-2 rounded-lg text-gray-400 hover:text-white transition"
                title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}>
                {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tiny reusable sub-menu header ─────────────────────────────────────────────
function SubMenuHeader({ title, onBack }) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-2 border-b border-white/5">
      <button onClick={onBack} className="text-gray-400 hover:text-white text-xl leading-none transition">‹</button>
      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500">{title}</p>
    </div>
  );
}
