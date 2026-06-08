"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Artplayer from 'artplayer';
import { X } from 'lucide-react';
import { doc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

// ═══════════════════════════════════════════════════════════════════════════════
// HTMLMediaElement prototype overrides — run ONCE globally
// ═══════════════════════════════════════════════════════════════════════════════
let _protoPatched = false;
const patchPrototype = () => {
  if (typeof window === 'undefined' || _protoPatched) return;
  try {
    const proto = HTMLMediaElement.prototype;

    // duration → return spoofed value if set
    const dDesc = Object.getOwnPropertyDescriptor(proto, 'duration');
    if (dDesc?.get) {
      const origGet = dDesc.get;
      Object.defineProperty(proto, 'duration', {
        configurable: true, enumerable: true,
        get() {
          return (this._fakeDuration > 0) ? this._fakeDuration : origGet.call(this);
        },
      });
    }

    // currentTime → add offset on read, intercept seek on write
    const tDesc = Object.getOwnPropertyDescriptor(proto, 'currentTime');
    if (tDesc?.get && tDesc?.set) {
      const origGet = tDesc.get;
      const origSet = tDesc.set;
      Object.defineProperty(proto, 'currentTime', {
        configurable: true, enumerable: true,
        get() {
          const offset = this._timeOffset || 0;
          return offset + origGet.call(this);
        },
        set(v) {
          // During internal source-switch, pass through raw
          if (this._passThroughSeek) { origSet.call(this, v); return; }
          // Custom seek handler (fires our React seek logic)
          if (this._timeOffset !== undefined && this._seekHandler) {
            this._seekHandler(v);
          } else {
            origSet.call(this, v);
          }
        },
      });
    }
    _protoPatched = true;
  } catch (e) { console.error('[proto patch]', e); }
};
if (typeof window !== 'undefined') patchPrototype();


export default function ArtPlayerContainer({ animeId, episodeId, episodes, onBack }) {
  const { currentUser } = useAuth();
  const [currentEpisodeId, setCurrentEpisodeId] = useState(episodeId);
  const [episode, setEpisode] = useState(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioTracks, setAudioTracks] = useState([]);
  const [subtitleTracks, setSubtitleTracks] = useState([]);

  const [selectedSubtitle, setSelectedSubtitle] = useState(null);
  const [showTopBar, setShowTopBar] = useState(true);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const lastSavedTimeRef = useRef(0);

  // Mutable refs that survive across renders without triggering re-init
  const stateRef = useRef({
    duration: 0,
    streamOffset: 0,
    selectedAudio: null,
    isRemuxing: false,
    isSeeking: false,
  });

  const currentEpIndex = episodes.findIndex(e => e.id === currentEpisodeId);
  const hasPrev = currentEpIndex > 0;
  const hasNext = currentEpIndex < episodes.length - 1;

  useEffect(() => {
    setEpisode(episodes.find(e => e.id === currentEpisodeId) ?? null);
  }, [currentEpisodeId, episodes]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const buildStreamUrl = useCallback((filePath, audioIndex, startOffset) => {
    let url = `/api/video/stream?path=${encodeURIComponent(filePath)}`;
    if (audioIndex !== null && audioIndex !== undefined) url += `&audioIndex=${audioIndex}`;
    const isMkv = filePath.toLowerCase().endsWith('.mkv');
    const remuxing = !!(isMkv || audioIndex !== null);
    if (remuxing && startOffset > 0) url += `&ss=${(startOffset + 0.1).toFixed(3)}`;
    return url;
  }, []);

  // ── Save progress ──────────────────────────────────────────────────────────
  const saveProgress = useCallback(async (time, dur) => {
    if (!currentUser || !animeId || !currentEpisodeId || !dur) return;
    try {
      const epRef = doc(db, 'users', currentUser.uid, 'anime', animeId, 'episodes', currentEpisodeId);
      await updateDoc(epRef, {
        watchedSeconds: Math.floor(time),
        durationSeconds: Math.floor(dur),
        lastPositionSeconds: Math.floor(time),
        isWatched: time >= dur * 0.9,
        updatedAt: new Date().toISOString(),
      });
      const ref = collection(db, 'users', currentUser.uid, 'anime', animeId, 'episodes');
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
        progressPercent: total > 0 ? (watched / total) * 100 : 0,
        lastWatchedEpisode: lastNum,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) { console.error('[saveProgress]', e); }
  }, [currentUser, animeId, currentEpisodeId]);

  // ── Switch the stream URL (seek / audio change) WITHOUT recreating player ──
  const switchStream = useCallback(async (art, filePath, offset, audioIndex) => {
    if (!art || art.isDestroy) return;
    const s = stateRef.current;
    if (s.isSeeking) return;                       // debounce
    s.isSeeking = true;

    const url = buildStreamUrl(filePath, audioIndex, offset);

    try {
      const video = art.video;
      if (video) {
        video._passThroughSeek = true;             // let ArtPlayer set time=0 internally
        video._timeOffset = offset;                // new absolute offset
      }

      // Pause, switch source, then play
      art.pause();
      await art.switchUrl(url);

      if (video) {
        video._passThroughSeek = false;
      }
      art.play();
    } catch (e) {
      console.warn('[switchStream error]', e);
    } finally {
      s.isSeeking = false;
    }
  }, [buildStreamUrl]);

  // ── Perform seek (called from prototype override or UI) ────────────────────
  const performSeekRef = useRef(null);
  performSeekRef.current = (absTime) => {
    const art = playerRef.current;
    const ep = episode;
    if (!art || !ep?.filePath) return;

    const s = stateRef.current;
    const dur = s.duration || 1e9;
    const clamped = Math.max(0, Math.min(dur, absTime));
    const isMkv = ep.filePath.toLowerCase().endsWith('.mkv');
    const remuxing = !!(isMkv || s.selectedAudio !== null);

    if (!remuxing) {
      // Native seek — just set raw time
      const video = art.video;
      if (video) {
        video._passThroughSeek = true;
        video.currentTime = clamped;
        video._passThroughSeek = false;
      }
      setCurrentTime(clamped);
      return;
    }

    // MKV/remux seek → find keyframe then switch stream
    fetch(`/api/video/keyframe?path=${encodeURIComponent(ep.filePath)}&time=${clamped}`)
      .then(r => r.json())
      .then(data => {
        const kf = data.success ? data.keyframeTime : clamped;
        s.streamOffset = kf;
        setCurrentTime(kf);
        switchStream(art, ep.filePath, kf, s.selectedAudio);
      })
      .catch(() => {
        s.streamOffset = clamped;
        setCurrentTime(clamped);
        switchStream(art, ep.filePath, clamped, s.selectedAudio);
      });
  };

  // ── Switch audio track ─────────────────────────────────────────────────────
  const switchAudioRef = useRef(null);
  switchAudioRef.current = (trackIndex) => {
    const art = playerRef.current;
    const ep = episode;
    if (!art || !ep?.filePath) return;

    const s = stateRef.current;
    const absNow = art.video ? art.video.currentTime : s.streamOffset;

    s.selectedAudio = trackIndex;
    s.isRemuxing = true;

    fetch(`/api/video/keyframe?path=${encodeURIComponent(ep.filePath)}&time=${absNow}`)
      .then(r => r.json())
      .then(data => {
        const kf = data.success ? data.keyframeTime : absNow;
        s.streamOffset = kf;
        setCurrentTime(kf);
        switchStream(art, ep.filePath, kf, trackIndex);
      })
      .catch(() => {
        s.streamOffset = absNow;
        setCurrentTime(absNow);
        switchStream(art, ep.filePath, absNow, trackIndex);
      });
  };

  // ── Force-save progress (for navigation / close) ───────────────────────────
  const forceSaveProgress = useCallback(() => {
    const art = playerRef.current;
    if (!art?.video) return;
    const t = art.video.currentTime;
    saveProgress(t, stateRef.current.duration || art.video.duration);
  }, [saveProgress]);

  // ── Episode navigation ─────────────────────────────────────────────────────
  const navigateToEpisode = useCallback((index) => {
    if (index < 0 || index >= episodes.length) return;
    forceSaveProgress();
    setLoading(true);
    setCurrentEpisodeId(episodes[index].id);
    setSelectedSubtitle(null);
    setDuration(0);
    setCurrentTime(0);
    stateRef.current = { duration: 0, streamOffset: 0, selectedAudio: null, isRemuxing: false, isSeeking: false };
  }, [episodes, forceSaveProgress]);

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN INIT EFFECT — runs ONLY when episode changes (NOT on seek/audio)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!episode?.filePath) return;

    let art = null;
    let cancelled = false;

    const init = async () => {
      const s = stateRef.current;
      let metaDuration = 0;
      let metaAudioTracks = [];
      let metaSubtitleTracks = [];
      let resumeOffset = 0;

      // 1. Fetch metadata
      try {
        const res = await fetch(`/api/video/metadata?path=${encodeURIComponent(episode.filePath)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          metaAudioTracks = data.audioTracks || [];
          metaSubtitleTracks = data.subtitleTracks || [];
          setAudioTracks(metaAudioTracks);
          setSubtitleTracks(metaSubtitleTracks);
          if (data.duration > 4) {
            metaDuration = data.duration;
            setDuration(metaDuration);
            s.duration = metaDuration;
          }
        }
      } catch (e) { console.error('[metadata fetch]', e); }

      if (cancelled) return;

      // 2. Calculate resume position
      const isMkv = episode.filePath.toLowerCase().endsWith('.mkv');
      const resumePos = episode.lastPositionSeconds || 0;
      let pendingNativeSeek = null;

      if (isMkv && resumePos > 5 && metaDuration && resumePos < metaDuration - 10) {
        try {
          const kRes = await fetch(`/api/video/keyframe?path=${encodeURIComponent(episode.filePath)}&time=${resumePos}`);
          const kData = await kRes.json();
          if (!cancelled && kData.success) {
            resumeOffset = kData.keyframeTime;
            s.streamOffset = resumeOffset;
            setCurrentTime(resumeOffset);
          }
        } catch (e) { console.error('[keyframe fetch]', e); }
      } else if (!isMkv && resumePos > 5 && metaDuration && resumePos < metaDuration - 10) {
        pendingNativeSeek = resumePos;
      }

      if (cancelled) return;
      setLoading(false);

      s.isRemuxing = !!(isMkv || s.selectedAudio !== null);

      // 3. Build initial URL
      const videoSrc = buildStreamUrl(episode.filePath, s.selectedAudio, resumeOffset);

      if (!containerRef.current) return;

      // 4. Create ArtPlayer
      art = new Artplayer({
        container: containerRef.current,
        url: videoSrc,
        volume: 1.0,
        muted: false,
        autoplay: true,
        pip: true,
        autoSize: false,
        fullscreen: true,
        fullscreenWeb: true,
        setting: true,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        theme: '#00f0ff',
        moreVideoAttr: { crossOrigin: 'anonymous' },
        settings: [
          // Speed
          {
            html: 'Speed',
            tooltip: '1x',
            name: 'speed',
            selector: [
              { html: '0.25x', value: 0.25 },
              { html: '0.5x', value: 0.5 },
              { html: '0.75x', value: 0.75 },
              { default: true, html: '1x (Normal)', value: 1 },
              { html: '1.25x', value: 1.25 },
              { html: '1.5x', value: 1.5 },
              { html: '1.75x', value: 1.75 },
              { html: '2x', value: 2 },
              { html: '2.5x', value: 2.5 },
              { html: '3x', value: 3 },
            ],
            onSelect(item) { if (art) art.playbackRate = item.value; return item.html; },
          },
          // Audio tracks
          ...(metaAudioTracks.length > 0 ? [{
            html: 'Audio Track',
            tooltip: 'Default',
            name: 'audio',
            selector: [
              { default: true, html: 'Default (Original)', value: null },
              ...metaAudioTracks.map(t => ({
                html: `${t.title} · ${t.codec}`,
                value: t.index,
              })),
            ],
            onSelect(item) {
              if (switchAudioRef.current) switchAudioRef.current(item.value);
              return item.html;
            },
          }] : []),
          // Subtitle tracks
          ...(metaSubtitleTracks.length > 0 ? [{
            html: 'Subtitles',
            tooltip: 'Off',
            name: 'subtitle',
            selector: [
              { default: true, html: 'Off', value: 'none' },
              ...metaSubtitleTracks.map(t => ({
                html: `${t.title} · ${t.codec}${t.isImageBased ? ' (Image)' : ''}`,
                value: t.index,
              })),
            ],
            onSelect(item) {
              setSelectedSubtitle(item.value);
              return item.html;
            },
          }] : []),
        ],
      });

      playerRef.current = art;

      // 5. Patch the video element
      if (art.video) {
        art.video._fakeDuration = metaDuration;
        art.video._timeOffset = s.isRemuxing ? resumeOffset : 0;
        art.video._passThroughSeek = true;   // block custom seeks during initial load
        art.video._seekHandler = (absTime) => {
          if (performSeekRef.current) performSeekRef.current(absTime);
        };
      }

      // 6. Events
      art.on('video:loadedmetadata', () => {
        if (art.video) art.video._passThroughSeek = false;

        // If metadata didn't give us duration, use whatever the video reports
        if (!metaDuration && art.video?.duration) {
          metaDuration = art.video.duration;
          s.duration = metaDuration;
          setDuration(metaDuration);
        }

        // Native seek for mp4 resume
        if (pendingNativeSeek !== null) {
          art.video._passThroughSeek = true;
          art.video.currentTime = pendingNativeSeek;
          art.video._passThroughSeek = false;
          pendingNativeSeek = null;
        }
      });

      art.on('video:timeupdate', () => {
        if (!art.video) return;
        const abs = art.video.currentTime;
        setCurrentTime(abs);

        const now = Date.now();
        if (now - lastSavedTimeRef.current >= 10000) {
          saveProgress(abs, s.duration || art.video.duration);
          lastSavedTimeRef.current = now;
        }
      });

      art.on('control', (show) => setShowTopBar(show));
    };

    init();

    return () => {
      cancelled = true;
      if (art?.destroy) art.destroy(true);
      playerRef.current = null;
    };
  // Only re-run when EPISODE changes — NOT on seek/audio/offset changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode?.filePath]);

  // ── Subtitle loader ────────────────────────────────────────────────────────
  useEffect(() => {
    const art = playerRef.current;
    if (!art || !episode?.filePath) return;

    if (!selectedSubtitle || selectedSubtitle === 'none') {
      try { art.subtitle.show = false; } catch {}
      return;
    }

    const url = `/api/video/subtitles?path=${encodeURIComponent(episode.filePath)}&index=${selectedSubtitle}`;
    try {
      const result = art.subtitle.switch(url, { name: `Track ${selectedSubtitle}` });
      const applyStyle = () => {
        art.subtitle.show = true;
        art.subtitle.style({
          color: '#ffffff',
          fontSize: '24px',
          fontWeight: '600',
          textShadow: '0 0 8px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000',
        });
      };
      if (result?.then) result.then(applyStyle).catch(e => console.warn('[subtitle switch]', e));
      else applyStyle();
    } catch (e) { console.warn('[subtitle switch]', e); }
  }, [selectedSubtitle, episode?.filePath]);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { forceSaveProgress(); onBack(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [forceSaveProgress, onBack]);

  // ── Duration sync to video element ─────────────────────────────────────────
  useEffect(() => {
    const art = playerRef.current;
    if (art?.video) art.video._fakeDuration = duration;
    stateRef.current.duration = duration;
  }, [duration]);

  const formatTime = (secs) => {
    if (!secs) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#020208] flex items-center justify-center overflow-hidden select-none">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#020208]">
          <div className="w-12 h-12 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
          <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Spinning up ArtPlayer...</span>
        </div>
      )}

      {/* ArtPlayer container — always in DOM so ref is ready */}
      <div
        ref={containerRef}
        className="w-full h-full absolute inset-0 z-10"
        style={{ visibility: loading ? 'hidden' : 'visible' }}
      />

      {/* Top overlay bar */}
      {!loading && (
        <div
          className={`absolute top-0 left-0 right-0 z-20 pointer-events-none transition-opacity duration-300 ${
            showTopBar ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            className="pointer-events-auto flex items-center justify-between px-5 py-4"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => { forceSaveProgress(); onBack(); }}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:text-cyan-400 hover:bg-white/10 transition cursor-pointer"
                title="Back (Esc)"
              >
                <X size={18} />
              </button>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                  Episode {episode?.episodeNumber}
                </span>
                <h2 className="text-sm font-bold text-white mt-1 max-w-lg truncate" title={episode?.fileName}>
                  {episode?.fileName}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                <button
                  disabled={!hasPrev}
                  onClick={() => navigateToEpisode(currentEpIndex - 1)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] uppercase font-bold text-gray-300 hover:text-cyan-400 hover:bg-white/10 transition cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
                >
                  ◀ Prev
                </button>
                <button
                  disabled={!hasNext}
                  onClick={() => navigateToEpisode(currentEpIndex + 1)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] uppercase font-bold text-gray-300 hover:text-cyan-400 hover:bg-white/10 transition cursor-pointer disabled:opacity-20 disabled:pointer-events-none"
                >
                  Next ▶
                </button>
              </div>

              <div className="text-right hidden sm:block">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Watched</div>
                <div className="text-xs font-bold text-cyan-400">
                  {Math.round(duration ? (currentTime / duration) * 100 : 0)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
