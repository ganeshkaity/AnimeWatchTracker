import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Volume1, Settings, Gauge, Maximize, Minimize, RotateCcw, RotateCw } from 'lucide-react';
import { doc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import 'video.js/dist/video-js.css';

// HTMLMediaElement prototype duration override for streaming chunked YouTube videos
let _protoPatched = false;
const patchPrototype = () => {
  if (typeof window === 'undefined' || _protoPatched) return;
  try {
    const proto = HTMLMediaElement.prototype;
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
    _protoPatched = true;
  } catch (e) { console.error('[proto patch]', e); }
};
if (typeof window !== 'undefined') patchPrototype();

const SPEED_OPTIONS = [0.25, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

export default function VideoJsContainer({ animeId, episodeId, episodes, onBack, initialSpeed = 1, initialVolume = 1 }) {
  const { currentUser } = useAuth();
  const [currentEpisodeId, setCurrentEpisodeId] = useState(episodeId);
  const [episode, setEpisode] = useState(null);

  const [loading, setLoading] = useState(true);
  const [audioTracks, setAudioTracks] = useState([]);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTopBar, setShowTopBar] = useState(true);
  const [portalTarget, setPortalTarget] = useState(null);
  const [seekToast, setSeekToast] = useState('');
  const toastTimeoutRef = useRef(null);

  const triggerToast = useCallback((msg) => {
    setSeekToast(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setSeekToast(''), 1000);
  }, []);

  // ── Pre-saved Playback Speed & Volume ──────────────────────────────────────
  const [playbackSpeed, setPlaybackSpeed] = useState(initialSpeed || 1.0);

  // Cap pre-saved volume at 100% for Video.js
  const [volume, setVolume] = useState(() => Math.round((initialVolume ?? 1) * 100));

  const [isMuted, setIsMuted] = useState(false);

  const videoNodeRef = useRef(null);
  const playerRef = useRef(null);
  const lastSavedTimeRef = useRef(0);

  const currentEpIndex = episodes.findIndex((e) => e.id === currentEpisodeId);
  const hasPrev = currentEpIndex > 0;
  const hasNext = currentEpIndex < episodes.length - 1;

  useEffect(() => {
    setCurrentEpisodeId(episodeId);
  }, [episodeId]);

  useEffect(() => {
    setEpisode(episodes.find((e) => e.id === currentEpisodeId) ?? null);
  }, [currentEpisodeId, episodes]);

  // ── Save Watch Progress ──────────────────────────────────────────────────
  const saveProgress = useCallback(
    async (time, dur) => {
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
        let total = snap.size,
          watched = 0,
          lastNum = '',
          lastOpened = new Date(0);
        snap.forEach((d) => {
          const data = d.data();
          if (data.isWatched) watched++;
          if (data.lastPositionSeconds > 0) {
            const t = new Date(data.updatedAt || 0);
            if (t > lastOpened) {
              lastOpened = t;
              lastNum = `EP-${data.episodeNumber}`;
            }
          }
        });
        await updateDoc(doc(db, 'users', currentUser.uid, 'anime', animeId), {
          progressPercent: total > 0 ? (watched / total) * 100 : 0,
          lastWatchedEpisode: lastNum,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error('[VideoJS saveProgress]', e);
      }
    },
    [currentUser, animeId, currentEpisodeId]
  );

  const forceSaveProgress = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const time = player.currentTime();
    const dur = player.duration();
    if (time > 0 && dur > 0) {
      saveProgress(time, dur);
    }
  }, [saveProgress]);

  // ── Episode Navigation ───────────────────────────────────────────────────
  const navigateToEpisode = useCallback(
    (index) => {
      if (index < 0 || index >= episodes.length) return;
      forceSaveProgress();
      setLoading(true);
      setCurrentEpisodeId(episodes[index].id);
      setSelectedAudio(null);
    },
    [episodes, forceSaveProgress]
  );

  // ── Video.js Initialization ──────────────────────────────────────────────
  useEffect(() => {
    if (!episode?.filePath || !videoNodeRef.current) return;

    let isMounted = true;
    let vjsPlayer = null;
    const sessionId = `yt_vjs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const initVideoJs = async () => {
      setLoading(true);
      try {
        const videojs = (await import('video.js')).default;
        if (!isMounted) return;

        const isYt = episode.isYouTube || episode.filePath?.startsWith('youtube://');

        if (!isYt) {
          // Fetch Metadata for audio tracks
          fetch(`/api/video/metadata?path=${encodeURIComponent(episode.filePath)}`)
            .then((r) => r.json())
            .then((meta) => {
              if (isMounted && meta.success) {
                setAudioTracks(meta.audioTracks || []);
              }
            })
            .catch(() => {});
        }

        const initialTime = episode.lastPositionSeconds || 0;
        let streamUrl = `/api/video/stream?path=${encodeURIComponent(episode.filePath)}`;
        if (isYt) {
          const vId = episode.youtubeId || episode.filePath.replace('youtube://', '');
          const quality = episode.selectedQuality || 'best';
          streamUrl = `/api/youtube/stream?videoId=${encodeURIComponent(vId)}&quality=${encodeURIComponent(quality)}&sessionId=${sessionId}`;
        }

        const options = {
          autoplay: true,
          controls: true,
          responsive: true,
          fluid: true,
          preload: 'auto',
          playbackRates: SPEED_OPTIONS,
          sources: [
            {
              src: streamUrl,
              type: (episode.filePath || '').toLowerCase().endsWith('.mkv') ? 'video/webm' : 'video/mp4',
            },
          ],
        };

        // Dispose previous player if exists
        if (playerRef.current) {
          playerRef.current.dispose();
          playerRef.current = null;
        }

        const container = videoNodeRef.current;
        container.innerHTML = '';
        const videoEl = document.createElement('video');
        videoEl.className = 'video-js vjs-big-play-centered vjs-theme-sea w-full h-full';
        if (episode?.durationSeconds > 0) {
          videoEl._fakeDuration = episode.durationSeconds;
        }
        container.appendChild(videoEl);

        vjsPlayer = videojs(videoEl, options, () => {
          if (!isMounted) return;
          setLoading(false);

          if (episode?.durationSeconds > 0) {
            vjsPlayer.duration = function() {
              return episode.durationSeconds;
            };
          }

          if (initialTime > 0) {
            vjsPlayer.currentTime(initialTime);
          }

          // Apply saved playback speed and volume (capped at 100%)
          if (playbackSpeed) {
            vjsPlayer.playbackRate(playbackSpeed);
          }
          if (volume !== undefined) {
            vjsPlayer.volume(Math.min(100, volume) / 100);
          }
        });

        if (vjsPlayer.el()) {
          setPortalTarget(vjsPlayer.el());
        }

        // Sync Video.js user activity with TopBar visibility
        vjsPlayer.on('useractive', () => setShowTopBar(true));
        vjsPlayer.on('userinactive', () => setShowTopBar(false));

        // Sync Video.js native playback rate changes back to state & localStorage
        vjsPlayer.on('ratechange', () => {
          if (!vjsPlayer) return;
          const rate = parseFloat(vjsPlayer.playbackRate().toFixed(2));
          setPlaybackSpeed(rate);
          if (typeof window !== 'undefined') {
            localStorage.setItem('watchanime_vlc_speed', rate.toString());
          }
        });

        // Sync Video.js native volume changes back to state & localStorage (capped at 100%)
        vjsPlayer.on('volumechange', () => {
          if (!vjsPlayer) return;
          const rawV = Math.round(vjsPlayer.volume() * 100);
          const v = Math.min(100, Math.max(0, rawV));
          const muted = vjsPlayer.muted();
          setVolume(v);
          setIsMuted(muted);
          if (typeof window !== 'undefined') {
            localStorage.setItem('watchanime_vlc_volume', v.toString());
          }
        });

        // Sync Video.js native fullscreen changes
        vjsPlayer.on('fullscreenchange', () => {
          if (!vjsPlayer) return;
          setIsFullscreen(vjsPlayer.isFullscreen());
        });

        // Timeupdate & progress save
        vjsPlayer.on('timeupdate', () => {
          if (!vjsPlayer) return;
          const t = vjsPlayer.currentTime();
          const d = vjsPlayer.duration();
          const now = Date.now();
          if (t > 0 && d > 0 && now - lastSavedTimeRef.current >= 10000) {
            saveProgress(t, d);
            lastSavedTimeRef.current = now;
          }
        });

        vjsPlayer.on('ended', () => {
          if (hasNext) {
            navigateToEpisode(currentEpIndex + 1);
          }
        });

        playerRef.current = vjsPlayer;
      } catch (err) {
        console.error('[Video.js Init Error]', err);
        if (isMounted) setLoading(false);
      }
    };

    initVideoJs();

    return () => {
      isMounted = false;
      setPortalTarget(null);
      if (vjsPlayer) {
        try {
          const t = vjsPlayer.currentTime();
          const d = vjsPlayer.duration();
          if (t > 0 && d > 0) saveProgress(t, d);
          vjsPlayer.dispose();
        } catch (e) {}
        playerRef.current = null;
      }
    };
  }, [episode, currentEpIndex, hasNext, navigateToEpisode, saveProgress]);

  // ── Switch Audio Track ───────────────────────────────────────────────────
  const handleAudioTrackChange = (audioIndex) => {
    setSelectedAudio(audioIndex);
    const player = playerRef.current;
    if (!player || !episode?.filePath) return;

    const currTime = player.currentTime();
    let url = `/api/video/stream?path=${encodeURIComponent(episode.filePath)}`;
    if (audioIndex !== null && audioIndex !== undefined) {
      url += `&audioIndex=${audioIndex}`;
    }

    player.src({
      src: url,
      type: episode.filePath.toLowerCase().endsWith('.mkv') ? 'video/webm' : 'video/mp4',
    });
    player.currentTime(currTime);
    player.play();
  };

  // ── Change Speed (-0.1 / +0.1) ───────────────────────────────────────────
  const handleSpeedChange = (newSpeed) => {
    const roundedSpeed = Math.min(5.0, Math.max(0.1, parseFloat(newSpeed.toFixed(2))));
    setPlaybackSpeed(roundedSpeed);
    if (typeof window !== 'undefined') {
      localStorage.setItem('watchanime_vlc_speed', roundedSpeed.toString());
    }
    if (playerRef.current) {
      playerRef.current.playbackRate(roundedSpeed);
    }
  };

  const stepSpeed = (delta) => {
    handleSpeedChange(playbackSpeed + delta);
  };

  // ── Change Volume (-5 / +5, max 100) ─────────────────────────────────────
  const handleVolumeChange = (newVol) => {
    const clampedVol = Math.min(100, Math.max(0, newVol));
    setVolume(clampedVol);
    if (typeof window !== 'undefined') {
      localStorage.setItem('watchanime_vlc_volume', clampedVol.toString());
    }
    if (playerRef.current) {
      playerRef.current.volume(clampedVol / 100);
      if (clampedVol > 0 && isMuted) {
        playerRef.current.muted(false);
        setIsMuted(false);
      }
    }
  };

  const stepVolume = (delta) => {
    handleVolumeChange(volume + delta);
  };

  const handleToggleMute = () => {
    if (!playerRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    playerRef.current.muted(nextMuted);
  };

  const handleToggleFullscreen = () => {
    if (playerRef.current) {
      if (playerRef.current.isFullscreen()) {
        playerRef.current.exitFullscreen();
        setIsFullscreen(false);
      } else {
        playerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } else if (typeof document !== 'undefined') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        setIsFullscreen(true);
      } else {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  // ── Keyboard Shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const player = playerRef.current;

      if (e.key === 'Escape') {
        forceSaveProgress();
        onBack();
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        if (player) {
          const curr = player.currentTime();
          player.currentTime(curr + 10);
          triggerToast('+10s');
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        if (player) {
          const curr = player.currentTime();
          player.currentTime(Math.max(0, curr - 10));
          triggerToast('-10s');
        }
      } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        if (player) {
          if (player.paused()) player.play();
          else player.pause();
          triggerToast(player.paused() ? 'Pause' : 'Play');
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        handleToggleFullscreen();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        stepVolume(5);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        stepVolume(-5);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [forceSaveProgress, onBack, triggerToast]);

  // ── Shared Overlay Content (header bar, settings, toast) ──────────────────
  const overlayContent = (
    <>
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 z-30 p-2 sm:p-4 bg-gradient-to-b from-black/95 via-black/60 to-transparent flex items-center justify-between gap-1.5 sm:gap-2 pointer-events-auto">
        {/* Left Side: Close + Title */}
        <div className="flex items-center gap-2 min-w-0 shrink">
          <button
            onClick={() => {
              forceSaveProgress();
              onBack();
            }}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition shrink-0 cursor-pointer"
            title="Close Player"
          >
            <X size={18} className="sm:w-5 sm:h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-white truncate max-w-[90px] min-[380px]:max-w-[140px] sm:max-w-md">
              {episode?.fileName || `Episode ${episode?.episodeNumber || ''}`}
            </h2>
            <span className="text-[9px] sm:text-[10px] font-bold text-neonCyan uppercase tracking-widest hidden min-[480px]:block truncate">
              Video.js ({playbackSpeed.toFixed(1)}x)
            </span>
          </div>
        </div>

        {/* Right Side: Action Buttons */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={() => {
              if (playerRef.current) {
                playerRef.current.currentTime(Math.max(0, playerRef.current.currentTime() - 10));
                triggerToast('-10s');
              }
            }}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="Rewind 10s"
          >
            <RotateCcw size={16} className="sm:w-4 sm:h-4" />
          </button>
          <button
            onClick={() => {
              if (playerRef.current) {
                playerRef.current.currentTime(playerRef.current.currentTime() + 10);
                triggerToast('+10s');
              }
            }}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="Forward 10s"
          >
            <RotateCw size={16} className="sm:w-4 sm:h-4" />
          </button>
          <button
            onClick={handleToggleMute}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX size={16} className="text-rose-400 sm:w-4 sm:h-4" />
            ) : volume > 50 ? (
              <Volume2 size={16} className="text-emerald-400 sm:w-4 sm:h-4" />
            ) : (
              <Volume1 size={16} className="text-emerald-400 sm:w-4 sm:h-4" />
            )}
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 sm:p-2.5 rounded-full transition cursor-pointer ${
              showSettings ? 'bg-[#7c5cff] text-white shadow-lg shadow-[#7c5cff]/40' : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
            title="Player Settings"
          >
            <Settings size={16} className="sm:w-4 sm:h-4" />
          </button>
          <button
            onClick={handleToggleFullscreen}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize size={16} className="sm:w-4 sm:h-4" /> : <Maximize size={16} className="sm:w-4 sm:h-4" />}
          </button>
          <button
            onClick={() => navigateToEpisode(currentEpIndex - 1)}
            disabled={!hasPrev}
            className={`p-2 sm:p-2.5 rounded-full bg-white/10 text-white transition ${
              !hasPrev ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/20 cursor-pointer'
            }`}
            title="Previous Episode"
          >
            <ChevronLeft size={18} className="sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={() => navigateToEpisode(currentEpIndex + 1)}
            disabled={!hasNext}
            className={`p-2 sm:p-2.5 rounded-full bg-white/10 text-white transition ${
              !hasNext ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/20 cursor-pointer'
            }`}
            title="Next Episode"
          >
            <ChevronRight size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Settings Dropdown */}
      {showSettings && (
        <div className="absolute top-14 sm:top-16 right-2 sm:right-4 w-72 max-w-[calc(100vw-16px)] max-h-[80vh] overflow-y-auto glass-panel p-3.5 sm:p-4 rounded-2xl border border-white/20 text-xs shadow-2xl space-y-3.5 z-40 no-scrollbar pointer-events-auto">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-bold text-white uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Settings size={14} className="text-[#a855f7]" /> Video.js Controls
            </span>
            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white cursor-pointer">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-300">
              <span className="flex items-center gap-1"><Gauge size={14} className="text-cyan-400" /> Speed:</span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => stepSpeed(-0.1)} className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-mono font-bold text-xs flex items-center justify-center cursor-pointer transition">-</button>
                <span className="text-neonCyan font-mono min-w-[42px] text-center font-extrabold">{playbackSpeed.toFixed(1)}x</span>
                <button onClick={() => stepSpeed(0.1)} className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-mono font-bold text-xs flex items-center justify-center cursor-pointer transition">+</button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto no-scrollbar">
              {SPEED_OPTIONS.map((speed) => (
                <button key={speed} onClick={() => handleSpeedChange(speed)}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition text-center cursor-pointer ${
                    Math.abs(playbackSpeed - speed) < 0.05 ? 'bg-gradient-to-r from-[#7c5cff] to-[#a855f7] text-white shadow-md' : 'bg-white/5 hover:bg-white/10 text-gray-300'
                  }`}>{speed}x</button>
              ))}
            </div>
          </div>
          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-300">
              <span className="flex items-center gap-1">
                {isMuted || volume === 0 ? <VolumeX size={14} className="text-rose-400" /> : <Volume2 size={14} className="text-emerald-400" />} Volume:
              </span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => stepVolume(-5)} className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-mono font-bold text-xs flex items-center justify-center cursor-pointer transition">-</button>
                <span className="text-emerald-400 font-mono min-w-[38px] text-center font-extrabold">{isMuted ? 'Muted' : `${volume}%`}</span>
                <button onClick={() => stepVolume(5)} className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 active:scale-95 text-white font-mono font-bold text-xs flex items-center justify-center cursor-pointer transition">+</button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleToggleMute} className="p-1 rounded-md bg-white/5 hover:bg-white/10 text-gray-300 cursor-pointer">
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <input type="range" min="0" max="100" value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#7c5cff]" />
            </div>
          </div>
          {audioTracks.length > 0 && (
            <div className="space-y-2 border-t border-white/10 pt-3">
              <span className="font-bold text-gray-300 block text-[11px]">Audio Tracks:</span>
              <div className="space-y-1 max-h-28 overflow-y-auto no-scrollbar">
                <button onClick={() => handleAudioTrackChange(null)}
                  className={`w-full text-left px-3 py-1.5 rounded-xl transition text-[11px] font-medium cursor-pointer ${
                    selectedAudio === null ? 'bg-[#7c5cff] text-white font-bold' : 'hover:bg-white/10 text-gray-300'
                  }`}>Default Audio</button>
                {audioTracks.map((tr, idx) => (
                  <button key={idx} onClick={() => handleAudioTrackChange(idx)}
                    className={`w-full text-left px-3 py-1.5 rounded-xl transition text-[11px] font-medium cursor-pointer ${
                      selectedAudio === idx ? 'bg-[#7c5cff] text-white font-bold' : 'hover:bg-white/10 text-gray-300'
                    }`}>{tr.title || tr.language || `Track ${idx + 1}`}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Seek Toast */}
      {seekToast && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="px-5 py-3 rounded-2xl bg-black/80 text-cyan-400 font-extrabold text-base border border-cyan-500/40 shadow-[0_0_30px_rgba(0,240,255,0.3)] backdrop-blur-md animate-bounce">
            {seekToast}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden">
      <style jsx global>{`
        /* Clamp the Video.js root to its container — no overflow */
        .video-js {
          width: 100% !important;
          height: 100% !important;
          max-width: 100% !important;
          max-height: 100% !important;
          overflow: hidden !important;
          position: absolute !important;
          top: 0 !important; left: 0 !important;
          right: 0 !important; bottom: 0 !important;
          background: #000 !important;
        }
        /* The actual <video> element — letterbox/pillarbox with black bars */
        .video-js .vjs-tech {
          position: absolute !important;
          top: 0 !important; left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
          background: #000 !important;
        }
        /* Control bar stays inside the player */
        .video-js .vjs-control-bar {
          max-width: 100% !important;
          box-sizing: border-box !important;
          z-index: 10 !important;
          background: linear-gradient(0deg, rgba(0,0,0,0.92) 0%, transparent 100%) !important;
        }
      `}</style>

      {/* Loading Spinner */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm gap-3">
          <div className="w-10 h-10 border-4 border-[#7c5cff] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs uppercase tracking-widest text-gray-400 font-bold">Spinning up Video.js...</span>
        </div>
      )}

      {/* Render overlay directly when no portalTarget (pre-init fallback) */}
      {!portalTarget && overlayContent}

      {/* Video.js Mount Point — position:relative so Video.js absolute-fills it */}
      <div className="w-full h-full relative overflow-hidden bg-black">
        <div ref={videoNodeRef} className="absolute inset-0 overflow-hidden" />
      </div>

      {/* Render overlay via portal into Video.js element (works in fullscreen) */}
      {portalTarget && createPortal(overlayContent, portalTarget)}
    </div>
  );
}


