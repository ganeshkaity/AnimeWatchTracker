"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Play, Film, Star, Clock, Calendar, Globe,
  CheckCircle2, AlertTriangle, Trash2, Edit3, HardDrive,
  Sparkles, ExternalLink, RefreshCw, Bookmark, Share2,
  Server, Settings2, ChevronDown, Check, Tv,
  Users, Video, Image as ImageIcon, ChevronRight, X, Maximize2, Loader2, Copy, CheckCheck, Info, MoreVertical, Download, Youtube,
  Menu
} from 'lucide-react';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  getLocalMovie, upsertLocalMovie, deleteLocalMovie,
  addToDirtyQueue, getUserId
} from '../utils/localStore';
import EditMovieModal from '../components/EditMovieModal';
import { toFanartBigPreview } from '../lib/fanartUtils';

// Custom VLC Icon matching AnimeDetail
const VLCIcon = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M24 2L18 17H30L24 2Z" fill="#F47C20" />
    <path d="M17 19L13 29H35L31 19H17Z" fill="#F47C20" />
    <path d="M12 31L7 41H41L36 31H12Z" fill="#F47C20" />
    <path d="M4 43V45H44V43H4Z" fill="#F47C20" />
    <path d="M19.2 14H28.8L27.6 17H20.4L19.2 14Z" fill="white" />
    <path d="M14.8 25H33.2L32 29H16L14.8 25Z" fill="white" />
  </svg>
);

/**
 * Format seconds to HH:MM:SS or MM:SS
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
 * Format runtime minutes to Xh Ym
 */
function formatRuntime(minutes) {
  if (!minutes || isNaN(minutes) || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) {
    return `${h}h ${m > 0 ? `${m}m` : ''}`;
  }
  return `${m}m`;
}

/**
 * Gallery Image Item with Lazy Loading, Skeleton Loader & 3-Dot Artwork Action
 */
function GalleryImageCard({
  img,
  type,
  title,
  onClick,
  onOpenArtworkModal,
  isCurrentPoster,
  isCurrentBackdrop,
  isCurrentLogo,
}) {
  const [loaded, setLoaded] = useState(false);
  const isPoster = type === 'posters' || img.mediaType === 'poster';
  const isLogo = type === 'logos' || img.mediaType === 'logo';
  const isBackdrop = type === 'backdrops' || img.mediaType === 'backdrop' || (!isPoster && !isLogo);
  const canSetArtwork = isPoster || isBackdrop || isLogo;

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl bg-[#0e131f] border border-white/10 group cursor-pointer transition-all duration-300 hover:border-amber-500/50 hover:shadow-xl hover:shadow-black/70 ${isPoster ? 'aspect-[2/3]' : isLogo ? 'aspect-[16/9] p-3 flex items-center justify-center bg-black/40' : 'aspect-[16/9]'
        }`}
    >
      {!loaded && (
        <div className="absolute inset-0 bg-white/[0.04] animate-pulse flex items-center justify-center">
          <Loader2 size={16} className="text-gray-600 animate-spin" />
        </div>
      )}
      <img
        src={img.url}
        alt={title}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full ${isLogo ? 'object-contain' : 'object-cover'} group-hover:scale-105 transition-all duration-500 ${loaded ? 'opacity-100' : 'opacity-0'
          }`}
      />

      {/* Active Badges */}
      {isCurrentPoster && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-emerald-600/90 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-lg backdrop-blur-sm border border-emerald-400/30">
          <Check size={10} /> Active Poster
        </div>
      )}
      {isCurrentBackdrop && !isCurrentPoster && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-amber-500/90 text-black text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-lg backdrop-blur-sm border border-amber-300/30">
          <Check size={10} /> Active Backdrop
        </div>
      )}
      {isCurrentLogo && !isCurrentPoster && !isCurrentBackdrop && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-purple-600/90 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-lg backdrop-blur-sm border border-purple-400/30">
          <Check size={10} /> Active Logo
        </div>
      )}

      {/* Hover bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* Bottom Left Dimensions / Preview Badge */}
      <div className="absolute bottom-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] text-gray-200 font-mono flex items-center gap-1 border border-white/10 shadow">
          <Maximize2 size={10} className="text-amber-400" />
          {img.width && img.height ? `${img.width}×${img.height}` : 'Preview'}
        </span>
      </div>

      {/* Bottom Right 3-Dot Artwork Action Button */}
      {canSetArtwork && onOpenArtworkModal && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onOpenArtworkModal({ ...img, isPoster, isBackdrop, isLogo });
          }}
          className="absolute bottom-2 right-2 z-20 p-1.5 rounded-lg bg-black/75 hover:bg-amber-500 hover:text-black border border-white/20 text-gray-200 shadow-xl backdrop-blur-md transition-all duration-200 cursor-pointer active:scale-95 group-hover:scale-105"
          title={isPoster ? "Set as Poster..." : isLogo ? "Set as Logo..." : "Set as Backdrop..."}
        >
          <MoreVertical size={13} />
        </button>
      )}
    </div>
  );
}

export default function MovieDetail({ movieId, onBack, onPlayMovie }) {
  const router = useRouter();
  const { currentUser, updateDefaultPlayer } = useAuth();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fileVerified, setFileVerified] = useState(null);
  const [verifyingFile, setVerifyingFile] = useState(false);

  // Player selection modal state
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMobileActionModal, setShowMobileActionModal] = useState(false);

  // Active VLC playback state & polling
  const [activeVlcPlayback, setActiveVlcPlayback] = useState(null);
  const pollIntervalRef = useRef(null);
  const lastSaveTimeRef = useRef(0);

  // Active Video Lightbox Modal (Trailers / Teasers)
  const [activeVideo, setActiveVideo] = useState(null);

  // Gallery Tab State ('all' | 'posters' | 'backdrops' | 'logos')
  const [imageTab, setImageTab] = useState('all');

  // Preview Image Lightbox Modal
  const [previewImage, setPreviewImage] = useState(null);

  // Artwork selection small modal state & saving
  const [artworkTargetImage, setArtworkTargetImage] = useState(null);
  const [artworkSaving, setArtworkSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Copy Path Feedback
  const [copiedPath, setCopiedPath] = useState(false);

  // Horizontal Scroll Refs
  const castScrollRef = useRef(null);
  const videosScrollRef = useRef(null);

  const scrollCast = (direction) => {
    if (castScrollRef.current) {
      const { scrollLeft, clientWidth } = castScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      castScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollVideos = (direction) => {
    if (videosScrollRef.current) {
      const { scrollLeft, clientWidth } = videosScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      videosScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleCopyPath = () => {
    if (!movie?.localFilePath) return;
    navigator.clipboard?.writeText(movie.localFilePath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  useEffect(() => {
    if (!movieId) return;

    const loadData = async () => {
      setLoading(true);
      try {
        let movieObj = null;
        const local = getLocalMovie(movieId);
        if (local) {
          movieObj = local;
        } else if (currentUser?.uid && db) {
          const snap = await getDoc(doc(db, 'users', currentUser.uid, 'movies', movieId));
          if (snap.exists()) {
            movieObj = { id: snap.id, ...snap.data() };
            upsertLocalMovie(movieObj);
          }
        }

        if (movieObj) {
          setMovie(movieObj);
          setLoading(false);
          verifyLocalFile(movieObj.localFilePath);

          // If movie lacks cast, images, or overview and has a tmdbId, auto-enrich in background
          if (movieObj.tmdbId && (!movieObj.cast || movieObj.cast.length === 0 || !movieObj.images || !movieObj.overview)) {
            fetch(`/api/movies/details?id=${encodeURIComponent(movieObj.tmdbId)}`)
              .then(res => res.json())
              .then(data => {
                if (data.success && data.movie) {
                  const m = data.movie;
                  setMovie(prev => {
                    if (!prev) return prev;
                    const enriched = {
                      ...prev,
                      cast: m.cast || [],
                      crew: m.crew || [],
                      images: m.images || { posters: [], backdrops: [], logos: [] },
                      videos: m.videos || [],
                      backdropUrl: prev.backdropUrl || m.backdropUrl || '',
                      overview: prev.overview || m.overview || '',
                      directors: m.directors || prev.directors || [],
                    };
                    upsertLocalMovie(enriched);
                    return enriched;
                  });
                }
              })
              .catch(e => console.error('[MovieDetail] Background enrich error:', e));
          }
          return;
        }
      } catch (err) {
        console.error('[MovieDetail] Load error:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [movieId, currentUser]);

  // Close preview modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (artworkTargetImage) setArtworkTargetImage(null);
        if (activeVideo) setActiveVideo(null);
        if (previewImage) setPreviewImage(null);
        if (showPlayerModal) setShowPlayerModal(false);
        if (showEditModal) setShowEditModal(false);
        if (showMobileActionModal) setShowMobileActionModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [artworkTargetImage, activeVideo, previewImage, showPlayerModal, showEditModal, showMobileActionModal]);

  const isYouTubeMovie = useMemo(() => {
    return Boolean(
      movie?.isYouTube ||
      movie?.youtubeUrl ||
      movie?.youtubeId ||
      movie?.localFilePath?.includes('youtube.com') ||
      movie?.localFilePath?.includes('youtu.be') ||
      movie?.localFilePath?.startsWith('youtube://')
    );
  }, [movie]);

  const verifyLocalFile = async (path, isYt) => {
    if (isYt || path?.includes('youtube.com') || path?.includes('youtu.be') || path?.startsWith('youtube://')) {
      setFileVerified(true);
      return;
    }
    if (!path) {
      setFileVerified(false);
      return;
    }
    setVerifyingFile(true);
    try {
      const res = await fetch('/api/movies/verify-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: path }),
      });
      const data = await res.json();
      setFileVerified(data.exists);
    } catch {
      setFileVerified(false);
    } finally {
      setVerifyingFile(false);
    }
  };

  // Helper to persist movie progress locally & to Firestore
  const saveMovieProgress = useCallback((timeSec, durSec) => {
    if (!movie) return;
    const roundTime = Math.floor(timeSec);
    const duration = durSec && durSec > 0 ? Math.floor(durSec) : (movie.duration || (movie.runtime ? movie.runtime * 60 : 0));
    const progressPct = duration > 0 ? Math.min(100, Math.round((roundTime / duration) * 100)) : 0;
    const isCompleted = progressPct >= 90;

    const updated = {
      ...movie,
      currentTime: roundTime,
      duration: duration > 0 ? duration : movie.duration,
      watchProgress: progressPct,
      watched: isCompleted,
      completed: isCompleted,
      watchStatus: isCompleted ? 'Completed' : (roundTime > 15 ? 'Watching' : 'Not Started'),
      lastWatchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setMovie(updated);
    upsertLocalMovie(updated);

    const targetUserId = getUserId();
    if (db && targetUserId) {
      const ref = doc(db, 'users', targetUserId, 'movies', movie.id);
      updateDoc(ref, {
        currentTime: roundTime,
        duration: duration > 0 ? duration : 0,
        watchProgress: progressPct,
        watched: isCompleted,
        completed: isCompleted,
        watchStatus: isCompleted ? 'Completed' : (roundTime > 15 ? 'Watching' : 'Not Started'),
        lastWatchedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).catch(err => {
        addToDirtyQueue({
          type: 'SET_MOVIE',
          dedupeKey: `SET_MOVIE_${movie.id}`,
          payload: { id: movie.id, ...updated },
        });
      });
    } else {
      addToDirtyQueue({
        type: 'SET_MOVIE',
        dedupeKey: `SET_MOVIE_${movie.id}`,
        payload: { id: movie.id, ...updated },
      });
    }
  }, [movie]);

  const saveDefaultPlayerIfChecked = async (playerType) => {
    if (makeDefault) {
      try {
        if (updateDefaultPlayer) await updateDefaultPlayer(playerType);
        localStorage.setItem('watchanime_movie_default_player', playerType);
      } catch (err) {
        console.error("Failed to save default player:", err);
      }
    }
  };

  // 1. Play in MediaServerPlayer (Windows Media Streaming web player)
  const playInMediaServer = async () => {
    setShowPlayerModal(false);
    await saveDefaultPlayerIfChecked('mediaserver');
    if (onPlayMovie) {
      onPlayMovie(movie, 'mediaserver');
    } else {
      router.push(`/player/mediaserver/${encodeURIComponent(movie.id)}?type=movie`);
    }
  };

  // 2. Play in PC's Desktop VLC Player
  const playInVlc = async () => {
    setShowPlayerModal(false);
    await saveDefaultPlayerIfChecked('vlc');

    if (!movie.localFilePath) {
      alert("No local file path configured for this movie.");
      return;
    }

    setActiveVlcPlayback({
      title: movie.title,
      filePath: movie.localFilePath,
      time: movie.currentTime || 0,
      length: movie.duration || (movie.runtime ? movie.runtime * 60 : 0),
      state: 'launching'
    });

    try {
      const res = await fetch('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: movie.localFilePath,
          customVlcPath: currentUser?.vlcPath || '',
          resumeTime: movie.currentTime || 0,
          speed: parseFloat(localStorage.getItem('watchanime_vlc_speed') || '1.0'),
          volume: parseInt(localStorage.getItem('watchanime_vlc_volume') || '100', 10)
        })
      });
      const data = await res.json();

      if (data.success) {
        // Touch movie timestamp
        const now = new Date().toISOString();
        const updated = { ...movie, lastWatchedAt: now, lastOpenedAt: now };
        setMovie(updated);
        upsertLocalMovie(updated);

        const targetUserId = getUserId();
        if (db && targetUserId) {
          updateDoc(doc(db, 'users', targetUserId, 'movies', movie.id), {
            lastWatchedAt: now,
            lastOpenedAt: now,
            updatedAt: now
          }).catch(() => {});
        }

        // Start polling VLC status
        startPollingVlc();
      } else {
        alert("Failed to launch VLC. Ensure VLC is installed, or configure its path in settings.\nError: " + data.error);
        setActiveVlcPlayback(null);
      }
    } catch (err) {
      console.error(err);
      alert("Error playing movie in VLC: " + err.message);
      setActiveVlcPlayback(null);
    }
  };

  // Poll Next.js proxy API endpoint to check VLC status
  const startPollingVlc = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    let failCount = 0;
    let lastTime = movie?.currentTime || 0;
    let lastLength = movie?.duration || 0;

    const poll = async () => {
      try {
        const response = await fetch('/api/vlc-status');
        const data = await response.json();

        if (data.success && data.state) {
          failCount = 0;
          lastTime = data.time;
          lastLength = data.length;

          setActiveVlcPlayback({
            title: movie.title,
            filePath: movie.localFilePath,
            time: data.time,
            length: data.length,
            state: data.state
          });

          // Save to localStore and Firestore every 15s or when paused
          const now = Date.now();
          if (data.state !== 'playing' || now - lastSaveTimeRef.current >= 15000) {
            lastSaveTimeRef.current = now;
            saveMovieProgress(data.time, data.length);
          }
        } else {
          failCount++;
          if (failCount >= 4) {
            stopPollingVlc(lastTime, lastLength);
          }
        }
      } catch (err) {
        failCount++;
        if (failCount >= 4) {
          stopPollingVlc(lastTime, lastLength);
        }
      }
    };

    pollIntervalRef.current = setInterval(poll, 1500);
  };

  const stopPollingVlc = (finalTime, finalLength) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (finalTime > 0) {
      saveMovieProgress(finalTime, finalLength);
    }
    setActiveVlcPlayback(null);
  };

  // Trigger main Play button: uses default preference if set, or opens player modal
  const handleMainPlay = () => {
    if (isYouTubeMovie) {
      router.push(`/player/youtube/${encodeURIComponent(movie.id)}?type=movie`);
      return;
    }
    const savedDefault = localStorage.getItem('watchanime_movie_default_player') || currentUser?.defaultPlayer;
    if (savedDefault === 'vlc') {
      playInVlc();
    } else if (savedDefault === 'mediaserver') {
      playInMediaServer();
    } else {
      setShowPlayerModal(true);
    }
  };

  const handleToggleCompleted = () => {
    if (!movie) return;
    const isNowCompleted = !movie.watched && movie.watchStatus !== 'Completed';
    const updated = {
      ...movie,
      watched: isNowCompleted,
      completed: isNowCompleted,
      watchStatus: isNowCompleted ? 'Completed' : 'Not Started',
      watchProgress: isNowCompleted ? 100 : 0,
      currentTime: isNowCompleted ? (movie.duration || 0) : 0,
      updatedAt: new Date().toISOString(),
    };

    setMovie(updated);
    upsertLocalMovie(updated);

    const targetUserId = getUserId();
    if (db && targetUserId) {
      const ref = doc(db, 'users', targetUserId, 'movies', movie.id);
      updateDoc(ref, {
        watched: isNowCompleted,
        completed: isNowCompleted,
        watchStatus: isNowCompleted ? 'Completed' : 'Not Started',
        watchProgress: isNowCompleted ? 100 : 0,
        currentTime: isNowCompleted ? (movie.duration || 0) : 0,
        updatedAt: new Date().toISOString(),
      }).catch(err => {
        addToDirtyQueue({
          type: 'SET_MOVIE',
          dedupeKey: `SET_MOVIE_${movie.id}`,
          payload: { id: movie.id, ...updated },
        });
      });
    } else {
      addToDirtyQueue({
        type: 'SET_MOVIE',
        dedupeKey: `SET_MOVIE_${movie.id}`,
        payload: { id: movie.id, ...updated },
      });
    }
  };

  const handleDelete = () => {
    if (!movie) return;
    if (!confirm(`Are you sure you want to stop tracking "${movie.title}"?`)) return;

    deleteLocalMovie(movie.id);
    const targetUserId = getUserId();
    if (db && targetUserId) {
      deleteDoc(doc(db, 'users', targetUserId, 'movies', movie.id)).catch(err => {
        addToDirtyQueue({
          type: 'DELETE_MOVIE',
          dedupeKey: `DELETE_MOVIE_${movie.id}`,
          payload: { id: movie.id, userId: targetUserId },
        });
      });
    } else {
      addToDirtyQueue({
        type: 'DELETE_MOVIE',
        dedupeKey: `DELETE_MOVIE_${movie.id}`,
        payload: { id: movie.id, userId: targetUserId },
      });
    }

    if (onBack) onBack();
    else router.push('/');
  };

  const handleSaveEditedMovie = async (updated) => {
    setMovie(updated);
    upsertLocalMovie(updated);
    const targetUserId = getUserId();
    if (db && targetUserId) {
      try {
        await updateDoc(doc(db, 'users', targetUserId, 'movies', updated.id), updated);
      } catch (err) {
        console.error('[MovieDetail] updateDoc error:', err);
        addToDirtyQueue({
          type: 'SET_MOVIE',
          dedupeKey: `SET_MOVIE_${updated.id}`,
          payload: { id: updated.id, ...updated },
        });
      }
    } else {
      addToDirtyQueue({
        type: 'SET_MOVIE',
        dedupeKey: `SET_MOVIE_${updated.id}`,
        payload: { id: updated.id, ...updated },
      });
    }
    setShowEditModal(false);
  };

  // Artwork Changers (Backdrop / Poster)
  const handleSetBackdrop = async (imageUrl) => {
    if (!movie || !imageUrl) return;
    setArtworkSaving(true);
    try {
      const updated = {
        ...movie,
        backdropUrl: imageUrl,
        updatedAt: new Date().toISOString(),
      };
      setMovie(updated);
      upsertLocalMovie(updated);
      const targetUserId = getUserId();
      if (db && targetUserId) {
        await updateDoc(doc(db, 'users', targetUserId, 'movies', movie.id), {
          backdropUrl: imageUrl,
          updatedAt: updated.updatedAt,
        }).catch(err => {
          addToDirtyQueue({
            type: 'SET_MOVIE',
            dedupeKey: `SET_MOVIE_${movie.id}`,
            payload: { id: movie.id, ...updated },
          });
        });
      } else {
        addToDirtyQueue({
          type: 'SET_MOVIE',
          dedupeKey: `SET_MOVIE_${movie.id}`,
          payload: { id: movie.id, ...updated },
        });
      }
      setArtworkTargetImage(null);
      showToast('Movie backdrop updated!');
    } catch (err) {
      console.error('[MovieDetail] handleSetBackdrop error:', err);
      alert('Failed to set backdrop: ' + err.message);
    } finally {
      setArtworkSaving(false);
    }
  };

  const handleSetPoster = async (imageUrl) => {
    if (!movie || !imageUrl) return;
    setArtworkSaving(true);
    try {
      const updated = {
        ...movie,
        posterUrl: imageUrl,
        updatedAt: new Date().toISOString(),
      };
      setMovie(updated);
      upsertLocalMovie(updated);
      const targetUserId = getUserId();
      if (db && targetUserId) {
        await updateDoc(doc(db, 'users', targetUserId, 'movies', movie.id), {
          posterUrl: imageUrl,
          updatedAt: updated.updatedAt,
        }).catch(err => {
          addToDirtyQueue({
            type: 'SET_MOVIE',
            dedupeKey: `SET_MOVIE_${movie.id}`,
            payload: { id: movie.id, ...updated },
          });
        });
      } else {
        addToDirtyQueue({
          type: 'SET_MOVIE',
          dedupeKey: `SET_MOVIE_${movie.id}`,
          payload: { id: movie.id, ...updated },
        });
      }
      setArtworkTargetImage(null);
      showToast('Movie poster updated!');
    } catch (err) {
      console.error('[MovieDetail] handleSetPoster error:', err);
      alert('Failed to set poster: ' + err.message);
    } finally {
      setArtworkSaving(false);
    }
  };

  const handleSetLogo = async (imageUrl) => {
    if (!movie || !imageUrl) return;
    setArtworkSaving(true);
    try {
      const updated = {
        ...movie,
        logoUrl: imageUrl,
        updatedAt: new Date().toISOString(),
      };
      setMovie(updated);
      upsertLocalMovie(updated);
      const targetUserId = getUserId();
      if (db && targetUserId) {
        await updateDoc(doc(db, 'users', targetUserId, 'movies', movie.id), {
          logoUrl: imageUrl,
          updatedAt: updated.updatedAt,
        }).catch(err => {
          addToDirtyQueue({
            type: 'SET_MOVIE',
            dedupeKey: `SET_MOVIE_${movie.id}`,
            payload: { id: movie.id, ...updated },
          });
        });
      } else {
        addToDirtyQueue({
          type: 'SET_MOVIE',
          dedupeKey: `SET_MOVIE_${movie.id}`,
          payload: { id: movie.id, ...updated },
        });
      }
      setArtworkTargetImage(null);
      showToast('Movie logo updated!');
    } catch (err) {
      console.error('[MovieDetail] handleSetLogo error:', err);
      alert('Failed to set logo: ' + err.message);
    } finally {
      setArtworkSaving(false);
    }
  };

  const handleDownloadImage = (url) => {
    if (!url) return;
    const safeTitle = (movie?.title || 'movie_artwork').replace(/[^a-zA-Z0-9]/g, '_');
    const ext = url.split('.').pop().split('?')[0] || 'jpg';
    const filename = `${safeTitle}_artwork.${ext}`;
    const downloadUrl = `/api/download-image?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Downloading image...');
  };

  // Memoized image lists for gallery - must always be called before any early return!
  const allImages = useMemo(() => {
    if (!movie?.images) return [];
    const backdrops = (movie.images.backdrops || []).map(img => ({ ...img, mediaType: 'backdrop' }));
    const posters = (movie.images.posters || []).map(img => ({ ...img, mediaType: 'poster' }));
    const logos = (movie.images.logos || []).map(img => ({ ...img, mediaType: 'logo' }));
    return [...backdrops, ...posters, ...logos];
  }, [movie?.images]);

  // Random 10 images from different types (posters, backdrops, logos) for the "Images" tab
  const randomMixedImages = useMemo(() => {
    if (!movie?.images) return [];
    const backdrops = (movie.images.backdrops || []).map(img => ({ ...img, mediaType: 'backdrop' }));
    const posters = (movie.images.posters || []).map(img => ({ ...img, mediaType: 'poster' }));
    const logos = (movie.images.logos || []).map(img => ({ ...img, mediaType: 'logo' }));

    const shuffle = (list) => {
      const arr = [...list];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const sBackdrops = shuffle(backdrops);
    const sPosters = shuffle(posters);
    const sLogos = shuffle(logos);

    const mixed = [];
    const maxItems = 10;
    let b = 0, p = 0, l = 0;

    while (mixed.length < maxItems && (b < sBackdrops.length || p < sPosters.length || l < sLogos.length)) {
      if (p < sPosters.length && mixed.length < maxItems) mixed.push(sPosters[p++]);
      if (b < sBackdrops.length && mixed.length < maxItems) mixed.push(sBackdrops[b++]);
      if (l < sLogos.length && mixed.length < maxItems) mixed.push(sLogos[l++]);
    }

    return mixed.slice(0, 10);
  }, [movie?.images, movie?.id]);

  const displayedImages = useMemo(() => {
    if (!movie?.images) return [];
    if (imageTab === 'backdrops') return (movie.images.backdrops || []).map(img => ({ ...img, mediaType: 'backdrop' }));
    if (imageTab === 'posters') return (movie.images.posters || []).map(img => ({ ...img, mediaType: 'poster' }));
    if (imageTab === 'logos') return (movie.images.logos || []).map(img => ({ ...img, mediaType: 'logo' }));
    return randomMixedImages;
  }, [movie?.images, imageTab, randomMixedImages]);

  const totalGalleryCount = allImages.length;
  const galleryHasImages = totalGalleryCount > 0;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-3 bg-[#07090f] text-white">
        <RefreshCw className="animate-spin text-amber-400" size={36} />
        <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">
          Loading Movie Details...
        </span>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#07090f] text-white text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-lg font-bold">Movie Not Found</h2>
        <p className="text-xs text-gray-400 max-w-sm">
          The requested movie record could not be loaded.
        </p>
        <button
          type="button"
          onClick={onBack || (() => router.push('/'))}
          className="px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold"
        >
          Back to Movies
        </button>
      </div>
    );
  }

  const isCompleted = Boolean(movie.watched || movie.completed || movie.watchStatus === 'Completed' || (movie.watchProgress && movie.watchProgress >= 95));
  const hasResume = Number(movie.currentTime || 0) > 5 && !isCompleted;
  const progressPct = movie.watchProgress || 0;
  const backdrop = movie.backdropUrl || (movie.posterUrl || null);
  const runtimeFormatted = formatRuntime(movie.runtime);
  const movieLogo = movie.logoUrl || movie.logo || (movie.images?.logos?.[0]?.url) || null;

  const getLogoSrc = (url) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return toFanartBigPreview(url);
    return `/api/image?path=${encodeURIComponent(url)}`;
  };

  return (
    <div className="min-h-screen bg-[#07090f] text-white flex flex-col relative pb-20 overflow-x-hidden">
      {/* ── Ambient Backdrop Image Layer (Extends from top-0 behind transparent header & hero) ── */}
      {backdrop && (
        <div className="absolute top-0 inset-x-0 h-[460px] sm:h-[540px] pointer-events-none overflow-hidden z-0">
          <img
            src={backdrop}
            alt={movie.title}
            className="w-full h-full object-cover object-top filter brightness-[0.40] blur-[1px] scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07090f] via-[#07090f]/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-[#07090f]/80" />
        </div>
      )}

      {/* ── Top Navigation Header (Completely Transparent - Background Visible Behind) ── */}
      <header className="relative z-30 h-14 md:h-16 px-4 md:px-8 flex items-center justify-between bg-transparent">
        <button
          type="button"
          onClick={onBack || (() => router.push('/'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/15 text-gray-200 hover:text-white text-xs font-semibold backdrop-blur-md transition cursor-pointer shadow-lg"
        >
          <ChevronLeft size={16} />
          <span>Dashboard</span>
        </button>

        {/* Desktop Action Buttons (sm and above) */}
        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/15 text-gray-300 hover:text-white text-xs font-bold backdrop-blur-md transition cursor-pointer shadow-lg"
            title="Edit movie information"
          >
            <Edit3 size={14} />
            <span>Edit</span>
          </button>

          <button
            type="button"
            onClick={handleToggleCompleted}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border backdrop-blur-md transition cursor-pointer shadow-lg ${isCompleted
              ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/35 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
              : 'bg-black/40 border-white/15 text-gray-300 hover:text-white hover:bg-black/60'
              }`}
          >
            <CheckCircle2 size={14} className={isCompleted ? 'text-emerald-400' : ''} />
            <span>{isCompleted ? 'Completed' : 'Mark Completed'}</span>
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 hover:text-red-200 text-xs font-bold backdrop-blur-md transition cursor-pointer shadow-lg"
            title="Remove movie"
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* Mobile Hamburger Menu Button (mobile only) */}
        <div className="flex sm:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMobileActionModal(true)}
            className="flex items-center justify-center p-2 rounded-xl bg-black/50 hover:bg-black/70 border border-white/15 text-gray-200 hover:text-white backdrop-blur-md transition cursor-pointer shadow-lg active:scale-95"
            aria-label="Open Actions Menu"
            title="Movie Actions"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* ── Hero Content (Poster + Movie Details) ── */}
      <div className="relative z-10 max-w-6xl w-full mx-auto px-4 md:px-6 pt-2 pb-8 sm:pb-10 border-b border-white/5">
        <div className="flex flex-col sm:flex-row gap-6 md:gap-8 items-start">
          {/* Movie Poster Card - Hidden on mobile / low-width devices */}
          <div className="hidden sm:block relative w-44 sm:w-52 md:w-60 shrink-0 rounded-2xl sm:rounded-3xl overflow-hidden glass-card border border-white/15 shadow-2xl bg-[#0d1117] group">
            {movie.posterUrl ? (
              <img
                src={movie.posterUrl}
                alt={movie.title}
                className="w-full h-auto aspect-[2/3] object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full aspect-[2/3] flex flex-col items-center justify-center text-amber-400/80 bg-gradient-to-br from-amber-950/30 to-black gap-2">
                <Film size={44} />
                <span className="text-[10px] font-mono uppercase tracking-wider">No Poster</span>
              </div>
            )}

            {/* Poster Badges */}
            <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
              {movie.rating ? (
                <span className="px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/15 text-amber-300 font-bold text-xs flex items-center gap-1 shadow">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  {movie.rating}
                </span>
              ) : null}
            </div>

            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-amber-500 text-black font-extrabold text-[9px] shadow uppercase tracking-wider">
              TMDB
            </div>
          </div>

          {/* Details & Action Header */}
          <div className="flex-1 space-y-4 w-full">
            <div>
              {/* Badges / Chips Row */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                  | Movie
                </span>
                {movie.rating && (
                  <span className="px-2.5 py-0.5 text-amber-300 text-[10px] font-bold flex items-center gap-1 sm:hidden">
                    <Star size={11} className="fill-amber-400 text-amber-400" />
                   | {movie.rating}
                  </span>
                )}
                {movie.year && (
                  <span className="px-2.5 py-0.5 text-gray-300 text-[10px] font-mono font-bold flex items-center gap-1">
                    <Calendar size={11} className="text-gray-400" />
                   | {movie.year}
                  </span>
                )}
                {runtimeFormatted && (
                  <span className="px-2.5 py-0.5 text-gray-300 text-[10px] font-mono font-bold flex items-center gap-1 uppercase">
                    <Clock size={11} className="text-gray-400" />
                    | {runtimeFormatted}
                  </span>
                )}
                {movie.language && (
                  <span className="px-2.5 py-0.5 text-gray-300 text-[10px] uppercase font-bold">
                    | {movie.language}
                  </span>
                )}
              </div>

              {/* Movie Logo Art */}
              {movieLogo && (
                <div className="py-1 max-w-[180px] sm:max-w-[220px] md:max-w-[260px]">
                  <img
                    src={getLogoSrc(movieLogo)}
                    alt={movie.title}
                    className="max-h-12 sm:max-h-14 md:max-h-16 w-auto object-contain filter drop-shadow-[0_3px_12px_rgba(0,0,0,0.9)]"
                  />
                </div>
              )}

              {/* Main Movie Title */}
              <h1 className={`${movieLogo ? 'text-lg sm:text-md md:text-sm' : 'text-xl sm:text-2xl md:text-3xl'} font-bold text-white tracking-tight drop-shadow-md`}>
                {movie.title}
              </h1>

              {/* Original / Native Title */}
              {movie.originalTitle && movie.originalTitle !== movie.title && (
                <p className="text-xs sm:text-sm text-gray-400 mt-1 italic">
                  {movie.originalTitle}
                </p>
              )}
            </div>
            {/* Genres */}
            {Array.isArray(movie.genres) && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {movie.genres.map((g) => (
                  <span
                    key={g}
                    className="px-3 py-0.5 text-gray-300 text-xs font-semibold"
                  >
                    | {g}
                  </span>
                ))}
              </div>
            )}

            {/* ── Player Action Buttons Area ────────────────────────────── */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Primary Play Button */}
                <div className="flex items-center rounded-2xl overflow-hidden shadow-lg shadow-amber-500/20 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 transition">
                  <button
                    type="button"
                    onClick={handleMainPlay}
                    className="px-5 py-2.5 sm:px-6 sm:py-3 text-black font-extrabold text-sm flex items-center gap-2 cursor-pointer active:scale-95 transition"
                  >
                    <Play size={18} fill="currentColor" />
                    <span>
                      {hasResume ? `Resume from ${formatTime(movie.currentTime)}` : isCompleted ? 'Watch Again' : 'Play Movie'}
                    </span>
                  </button>

                  {/* Change Player Options Trigger Modal */}
                  <button
                    type="button"
                    onClick={() => setShowPlayerModal(true)}
                    className="px-2.5 py-2.5 sm:py-3 border-l border-black/20 text-black/80 hover:text-black hover:bg-black/10 transition cursor-pointer"
                    title="Select Playback Method (Media Server / VLC)"
                  >
                    <ChevronDown size={17} />
                  </button>
                </div>

                {/* Play from Start (if resumed) */}
                {hasResume && (
                  <button
                    type="button"
                    onClick={() => {
                      const restarted = { ...movie, currentTime: 0, watchProgress: 0 };
                      setMovie(restarted);
                      upsertLocalMovie(restarted);
                      handleMainPlay();
                    }}
                    className="px-4 py-2.5 sm:py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition cursor-pointer border border-white/10"
                  >
                    Play From Start
                  </button>
                )}
              </div>

              {/* Active VLC Status Banner if currently playing */}
              {activeVlcPlayback && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-200 text-xs shadow-lg animate-in fade-in duration-300">
                  <div className="flex items-center gap-2.5">
                    <VLCIcon className="w-5 h-5 animate-pulse" />
                    <div>
                      <span className="font-bold text-white block sm:inline mr-2">VLC Active:</span>
                      <span className="font-mono text-orange-300">
                        {formatTime(activeVlcPlayback.time)} / {formatTime(activeVlcPlayback.length)}
                      </span>
                      <span className="ml-2 uppercase text-[9px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-extrabold">
                        {activeVlcPlayback.state}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => stopPollingVlc(activeVlcPlayback.time, activeVlcPlayback.length)}
                    className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition cursor-pointer"
                  >
                    Dismiss Tracking
                  </button>
                </div>
              )}
            </div>
            {/* Watch Status & Progress Bar */}
            <div className="p-3 sm:p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2 backdrop-blur-sm">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400 font-medium">Watch Status:</span>
                <span className={isCompleted ? "text-emerald-400 font-bold flex items-center gap-1" : hasResume ? "text-amber-400 font-bold" : "text-gray-300 font-semibold"}>
                  {isCompleted ? (
                    <>
                      <CheckCircle2 size={13} /> Completed
                    </>
                  ) : hasResume ? (
                    `Watching (${progressPct}%) • ${formatTime(movie.currentTime)} / ${formatTime(movie.duration || (movie.runtime ? movie.runtime * 60 : 0))}`
                  ) : (
                    'Not Started'
                  )}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${isCompleted
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-amber-500 to-rose-500'
                    }`}
                  style={{ width: `${isCompleted ? 100 : progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Detail Content Sections ────────────────────────────────────── */}
      <div className="relative z-20 max-w-6xl w-full mx-auto px-4 md:px-6 pt-6 sm:pt-8 pb-16 space-y-10">

        {/* 1. Overview Section (Clean, Unboxed Fluid Typography) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <Sparkles size={17} className="text-amber-400" /> Overview & Storyline
            </h2>
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="text-xs text-gray-400 hover:text-amber-300 transition flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer"
              title="Edit Movie Overview & Details"
            >
              <Edit3 size={12} />
              <span>Edit Details</span>
            </button>
          </div>
          <p className="text-sm sm:text-base md:text-lg text-gray-200/90 leading-relaxed font-normal max-w-4xl selection:bg-amber-500/30">
            {movie.overview || movie.description || movie.synopsis || "No overview available for this movie yet. Click 'Edit Details' to add a storyline summary or fetch from TMDB."}
          </p>
        </section>

        {/* 2. Cast / Actors / Crew Section (Horizontally Scrollable) */}
        {((movie.cast && movie.cast.length > 0) || (movie.crew && movie.crew.length > 0)) && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                  <Users size={17} className="text-amber-400" /> Cast & Actors
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => scrollCast('left')}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition cursor-pointer"
                  title="Scroll left"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollCast('right')}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition cursor-pointer"
                  title="Scroll right"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Horizontal Scroll Track */}
            <div
              ref={castScrollRef}
              className="flex items-stretch gap-3 overflow-x-auto no-scrollbar scroll-smooth py-1 px-0.5"
            >
              {movie.cast && movie.cast.map((actor) => (
                <div
                  key={`actor-${actor.id}-${actor.character}`}
                  className="w-28 sm:w-32 shrink-0 group flex flex-col cursor-default"
                >
                  <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden bg-[#111827] border border-white/10 group-hover:border-amber-500/50 shadow-lg relative transition-all duration-300 group-hover:scale-[1.03]">
                    {actor.profileUrl ? (
                      <img
                        src={actor.profileUrl}
                        alt={actor.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-[#1f1b2e] to-[#0f172a] text-amber-400/60 p-2 text-center">
                        <Users size={28} className="mb-1 text-gray-500" />
                        <span className="text-[9px] font-bold text-gray-400 leading-tight">No Photo</span>
                      </div>
                    )}
                  </div>
                  <div className="pt-2 px-1 text-left">
                    <h4 className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors" title={actor.name}>
                      {actor.name}
                    </h4>
                    {actor.character && (
                      <p className="text-[10px] text-amber-300/80 truncate mt-0.5 font-medium" title={actor.character}>
                        {actor.character}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 3. Videos & Trailers Section (Horizontally Scrollable, Click to Play in Modal) */}
        {movie.videos && movie.videos.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                  <Video size={17} className="text-rose-400" /> Videos & Trailers
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => scrollVideos('left')}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition cursor-pointer"
                  title="Scroll left"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollVideos('right')}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition cursor-pointer"
                  title="Scroll right"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Horizontal Videos Scroll Track */}
            <div
              ref={videosScrollRef}
              className="flex items-stretch gap-4 overflow-x-auto no-scrollbar scroll-smooth py-1 px-0.5"
            >
              {movie.videos.map((vid) => (
                <div
                  key={vid.id || vid.key}
                  onClick={() => setActiveVideo(vid)}
                  className="w-64 sm:w-72 shrink-0 group cursor-pointer rounded-2xl overflow-hidden bg-[#0e131f] border border-white/10 hover:border-amber-500/50 shadow-xl transition-all duration-300 hover:scale-[1.02]"
                >
                  <div className="aspect-[16/9] relative overflow-hidden bg-black/60">
                    <img
                      src={`https://img.youtube.com/vi/${vid.key}/hqdefault.jpg`}
                      alt={vid.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/35 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                      <div className="w-11 h-11 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-2xl group-hover:scale-110 group-hover:bg-red-500 transition-all">
                        <Play size={18} fill="currentColor" className="ml-0.5" />
                      </div>
                    </div>
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-bold text-amber-300 border border-white/15">
                        {vid.type || 'Trailer'}
                      </span>
                      {vid.official && (
                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/80 text-white text-[9px] font-bold">
                          Official
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-3">
                    <h4 className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors" title={vid.name}>
                      {vid.name}
                    </h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">Click to play video</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 4. More Images Section (Tabs: All Images, Posters, Backdrops, Logos with Lazy Loading & Skeletons) */}
        {galleryHasImages && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                  <ImageIcon size={17} className="text-cyan-400" /> More Images & Artwork
                </h2>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all', label: 'Images', count: randomMixedImages.length },
                  { id: 'backdrops', label: 'Backdrops', count: movie.images?.backdrops?.length || 0 },
                  { id: 'posters', label: 'Posters', count: movie.images?.posters?.length || 0 },
                  { id: 'logos', label: 'Logos', count: movie.images?.logos?.length || 0 },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setImageTab(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${imageTab === tab.id
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                      }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${imageTab === tab.id ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'}`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Images Grid / Masonry Layout (Eliminates gaps when aspect ratios differ) */}
            {imageTab === 'all' ? (
              <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3 [column-fill:_balance]">
                {displayedImages.map((img, idx) => (
                  <div key={`${img.filePath || img.url}-${idx}`} className="mb-3 break-inside-avoid">
                    <GalleryImageCard
                      img={img}
                      type={imageTab}
                      title={movie.title}
                      onClick={() => setPreviewImage(img)}
                      onOpenArtworkModal={(targetImg) => setArtworkTargetImage(targetImg)}
                      isCurrentPoster={movie.posterUrl === img.url}
                      isCurrentBackdrop={movie.backdropUrl === img.url}
                      isCurrentLogo={movie.logoUrl === img.url}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {displayedImages.map((img, idx) => (
                  <GalleryImageCard
                    key={`${img.filePath || img.url}-${idx}`}
                    img={img}
                    type={imageTab}
                    title={movie.title}
                    onClick={() => setPreviewImage(img)}
                    onOpenArtworkModal={(targetImg) => setArtworkTargetImage(targetImg)}
                    isCurrentPoster={movie.posterUrl === img.url}
                    isCurrentBackdrop={movie.backdropUrl === img.url}
                    isCurrentLogo={movie.logoUrl === img.url}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* 5. Remaining Movie Details & Metadata */}
        <section className="space-y-4 pt-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Info size={15} className="text-amber-400" /> Movie Information & Credits
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {movie.directors && movie.directors.length > 0 && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Director</span>
                <span className="font-semibold text-white">{movie.directors.join(', ')}</span>
              </div>
            )}
            {movie.releaseDate && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Theatrical Release</span>
                <span className="font-semibold text-white">{movie.releaseDate}</span>
              </div>
            )}
            {movie.language && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Original Language</span>
                <span className="font-semibold text-white uppercase">{movie.language}</span>
              </div>
            )}
            {movie.productionCountries && movie.productionCountries.length > 0 && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Production Country</span>
                <span className="font-semibold text-white">{movie.productionCountries.join(', ')}</span>
              </div>
            )}
            {movie.status && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Status</span>
                <span className="font-semibold text-emerald-400">{movie.status}</span>
              </div>
            )}
            {movie.rating ? (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">TMDB Rating</span>
                <span className="font-semibold text-amber-400 flex items-center gap-1">
                  <Star size={12} className="fill-amber-400" /> {movie.rating} / 10
                  {movie.voteCount ? <span className="text-gray-400 text-[10px]">({movie.voteCount} votes)</span> : null}
                </span>
              </div>
            ) : null}
          </div>
        </section>

        {/* 6. Media Source / File Reference (Unboxed, Clean & Minimalist) */}
        <section className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-300 flex items-center gap-2">
              {isYouTubeMovie ? (
                <>
                  <Youtube size={15} className="text-red-500" /> Video Reference: YouTube
                </>
              ) : (
                <>
                  <HardDrive size={15} className="text-amber-400" /> Local File Reference
                </>
              )}
            </h2>
            {isYouTubeMovie ? (
              <span className="px-2.5 py-0.5 rounded-lg bg-red-500/15 text-red-300 text-[11px] font-bold flex items-center gap-1 border border-red-500/30">
                <Youtube size={12} className="text-red-400" /> YouTube Stream Ready
              </span>
            ) : fileVerified === true ? (
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 text-[11px] font-bold flex items-center gap-1 border border-emerald-500/30">
                <CheckCircle2 size={12} /> Available on Disk
              </span>
            ) : fileVerified === false ? (
              <span className="px-2.5 py-0.5 rounded-lg bg-red-500/15 text-red-300 text-[11px] font-bold flex items-center gap-1 border border-red-500/30">
                <AlertTriangle size={12} /> File Missing
              </span>
            ) : null}
          </div>

          <div className="space-y-2 py-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
              <span className="text-gray-400 shrink-0 font-medium">
                {isYouTubeMovie ? 'Source:' : 'Local File Name:'}
              </span>
              <span className="font-mono text-gray-200 text-xs truncate max-w-lg">
                {movie.localFileName || movie.title}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 text-xs">
              <span className="text-gray-400 shrink-0 font-medium pt-0.5">
                {isYouTubeMovie ? 'Video Link / Path:' : 'Absolute Path:'}
              </span>
              <div className="flex items-center gap-2 max-w-xl">
                <span className="font-mono text-gray-400 text-[11px] break-all">
                  {movie.localFilePath || movie.youtubeUrl || 'Not specified'}
                </span>
                {(movie.localFilePath || movie.youtubeUrl) && (
                  <button
                    type="button"
                    onClick={handleCopyPath}
                    className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer shrink-0"
                    title="Copy path or URL"
                  >
                    {copiedPath ? <CheckCheck size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {!isYouTubeMovie && fileVerified === false && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-red-400" />
              <span>This movie file is no longer available locally. Check your drive connection or edit path.</span>
            </div>
          )}
        </section>

        {/* 7. TMDB Attribution */}
        <footer className="pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-gray-400 text-[11px]">
          <div className="flex items-center gap-2.5">
            <div className="px-2 py-1 rounded bg-[#01b4e4] text-[#0d253f] font-black text-xs tracking-wider">
              TMDB
            </div>
            <p>
              This product uses the TMDB API but is not endorsed or certified by TMDB.
            </p>
          </div>
          {movie.tmdbId && (
            <a
              href={`https://www.themoviedb.org/movie/${movie.tmdbId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 shrink-0 font-semibold"
            >
              <span>View on TMDB</span>
              <ExternalLink size={12} />
            </a>
          )}
        </footer>
      </div>

      {/* ── Playback Method Selection Modal (Matching AnimeDetail) ─────────── */}
      <AnimatePresence>
        {showPlayerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl bg-[#0d111a]"
            >
              <h2 className="text-lg font-bold mb-1 flex items-center gap-2 text-white">
                <Play className="text-amber-400 animate-pulse" size={18} fill="currentColor" />
                Select Playback Method
              </h2>
              <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                Movie
              </span>
              <p className="text-xs text-gray-400 truncate mt-3 mb-4 bg-white/5 p-2 rounded-xl border border-white/5 font-mono" title={movie.localFilePath}>
                {movie.localFileName || movie.title}
              </p>

              <div className="flex items-center gap-2.5 mb-6 px-1">
                <input
                  type="checkbox"
                  id="set-default-movie-player"
                  checked={makeDefault}
                  onChange={(e) => setMakeDefault(e.target.checked)}
                  className="rounded border-white/10 bg-white/5 text-amber-400 focus:ring-amber-400 cursor-pointer h-4 w-4"
                />
                <label htmlFor="set-default-movie-player" className="text-xs text-gray-300 cursor-pointer select-none">
                  Set selected player as default for future plays
                </label>
              </div>

              <div className="grid gap-4 mb-6 grid-cols-1 sm:grid-cols-2 max-w-md mx-auto">
                {isYouTubeMovie && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPlayerModal(false);
                      router.push(`/player/youtube/${encodeURIComponent(movie.id)}?type=movie`);
                    }}
                    className="p-5 rounded-2xl bg-red-500/10 border border-red-500/30 hover:border-red-400 text-red-300 hover:text-white hover:bg-red-500/20 transition-all duration-300 flex flex-col items-center justify-center gap-2 cursor-pointer group hover:shadow-[0_0_25px_rgba(239,68,68,0.35)] col-span-1 sm:col-span-2"
                  >
                    <div className="p-3 rounded-2xl bg-red-500/20 group-hover:bg-red-500/30 transition-colors">
                      <Youtube size={26} className="text-red-400" />
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-black uppercase tracking-widest block text-white">YouTube Embed Player</span>
                      <span className="text-[10px] text-gray-400 font-medium">Stream via YouTube Video Link</span>
                    </div>
                  </button>
                )}

                {/* 1. Media Server Player Card (Local Media) */}
                <button
                  type="button"
                  onClick={playInMediaServer}
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
                  onClick={playInVlc}
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
              </div>

              <div className="flex justify-end pt-4 mt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowPlayerModal(false)}
                  className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold cursor-pointer transition"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Edit Movie Details Modal ────────────────────────────────────────── */}
      {showEditModal && (
        <EditMovieModal
          isOpen={showEditModal}
          movie={movie}
          onClose={() => setShowEditModal(false)}
          onSaveMovie={handleSaveEditedMovie}
        />
      )}

      {/* ── Active Video Lightbox Modal (YouTube Trailer / Teaser Embed) ───── */}
      <AnimatePresence>
        {activeVideo && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/92 backdrop-blur-md overflow-hidden select-none"
            onClick={() => setActiveVideo(null)}
          >
            {/* Direct Close Button in Viewport Corner */}
            <button
              type="button"
              onClick={() => setActiveVideo(null)}
              className="fixed top-4 right-4 z-[60] p-2.5 sm:p-3 rounded-full bg-black/80 hover:bg-white/20 border border-white/20 text-white shadow-2xl transition cursor-pointer backdrop-blur-md"
              title="Close video (Esc)"
            >
              <X size={20} />
            </button>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0d1117] rounded-2xl sm:rounded-3xl border border-white/15 overflow-hidden shadow-2xl my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 p-3.5 sm:p-4 flex items-center justify-between border-b border-white/10 bg-[#111827]">
                <div className="flex items-center gap-2 truncate pr-4">
                  <span className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-black uppercase tracking-wider shrink-0">
                    {activeVideo.type || 'Trailer'}
                  </span>
                  <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                    {activeVideo.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveVideo(null)}
                  className="p-1.5 rounded-full bg-white/10 text-gray-300 hover:text-white hover:bg-white/20 transition cursor-pointer shrink-0"
                  title="Close (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="relative w-full aspect-video max-h-[calc(88vh-65px)] bg-black flex items-center justify-center">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${activeVideo.key}?autoplay=1&rel=0`}
                  title={activeVideo.name}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Preview Image Lightbox Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {previewImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/92 backdrop-blur-md select-none overflow-hidden"
            onClick={() => setPreviewImage(null)}
          >
            {/* Viewport Top-Right Close Button */}
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="fixed top-4 right-4 z-[60] p-2.5 sm:p-3 rounded-full bg-black/80 hover:bg-white/20 border border-white/20 text-white shadow-2xl transition cursor-pointer backdrop-blur-md"
              title="Close preview (Esc)"
            >
              <X size={20} />
            </button>

            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-[92vw] max-h-[88vh] flex flex-col items-center justify-center my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={previewImage.url}
                alt=""
                className="max-h-[78vh] max-w-[90vw] w-auto h-auto rounded-2xl object-contain border border-white/20 shadow-2xl bg-black/50"
              />
              <div className="shrink-0 mt-3 px-3.5 py-1.5 rounded-full bg-black/80 border border-white/10 text-[11px] font-mono text-gray-300 flex items-center gap-3 shadow-xl backdrop-blur-md">
                {previewImage.width && (
                  <span>{previewImage.width} × {previewImage.height} px</span>
                )}
                {previewImage.voteAverage ? (
                  <span className="text-amber-400 font-bold">★ {previewImage.voteAverage.toFixed(1)}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="text-gray-400 hover:text-white transition cursor-pointer flex items-center gap-1 pl-1 border-l border-white/15"
                >
                  <X size={13} />
                  <span>Close</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* ── Set Artwork Small Modal (Poster & Backdrop Changer) ───────────── */}
      <AnimatePresence>
        {artworkTargetImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none"
            onClick={() => !artworkSaving && setArtworkTargetImage(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-sm bg-[#0e131f] border border-white/15 rounded-3xl p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Set Movie Artwork</h3>
                    <p className="text-[10px] text-gray-400 capitalize">
                      {artworkTargetImage.isPoster ? 'Poster Image' : artworkTargetImage.isLogo ? 'Logo Artwork' : artworkTargetImage.isBackdrop ? 'Backdrop Image' : 'Artwork Image'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setArtworkTargetImage(null)}
                  disabled={artworkSaving}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Artwork Preview Thumbnail */}
              <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 flex items-center justify-center p-2">
                <img
                  src={artworkTargetImage.url}
                  alt="Artwork Preview"
                  className={`max-h-48 rounded-xl object-contain ${artworkTargetImage.isPoster ? 'aspect-[2/3] max-w-[130px]' : artworkTargetImage.isLogo ? 'max-w-[200px] py-2' : 'w-full aspect-[16/9] object-cover'
                    }`}
                />
                {artworkTargetImage.width && (
                  <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/80 border border-white/15 text-[10px] font-mono text-gray-300">
                    {artworkTargetImage.width} × {artworkTargetImage.height} px
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {artworkTargetImage.isBackdrop && (
                  <button
                    type="button"
                    disabled={artworkSaving || movie.backdropUrl === artworkTargetImage.url}
                    onClick={() => handleSetBackdrop(artworkTargetImage.url)}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-lg ${movie.backdropUrl === artworkTargetImage.url
                        ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 cursor-default'
                        : 'bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black active:scale-98'
                      }`}
                  >
                    {artworkSaving ? (
                      <Loader2 size={15} className="animate-spin text-black" />
                    ) : movie.backdropUrl === artworkTargetImage.url ? (
                      <>
                        <Check size={14} /> Current Backdrop
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Set as Movie Backdrop
                      </>
                    )}
                  </button>
                )}

                {artworkTargetImage.isPoster && (
                  <button
                    type="button"
                    disabled={artworkSaving || movie.posterUrl === artworkTargetImage.url}
                    onClick={() => handleSetPoster(artworkTargetImage.url)}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-lg ${movie.posterUrl === artworkTargetImage.url
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 cursor-default'
                        : 'bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black active:scale-98'
                      }`}
                  >
                    {artworkSaving ? (
                      <Loader2 size={15} className="animate-spin text-black" />
                    ) : movie.posterUrl === artworkTargetImage.url ? (
                      <>
                        <Check size={14} /> Current Poster
                      </>
                    ) : (
                      <>
                        <Film size={14} /> Set as Movie Poster
                      </>
                    )}
                  </button>
                )}

                {artworkTargetImage.isLogo && (
                  <button
                    type="button"
                    disabled={artworkSaving || movie.logoUrl === artworkTargetImage.url}
                    onClick={() => handleSetLogo(artworkTargetImage.url)}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-lg ${movie.logoUrl === artworkTargetImage.url
                        ? 'bg-purple-500/15 border border-purple-500/30 text-purple-300 cursor-default'
                        : 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white active:scale-98'
                      }`}
                  >
                    {artworkSaving ? (
                      <Loader2 size={15} className="animate-spin text-white" />
                    ) : movie.logoUrl === artworkTargetImage.url ? (
                      <>
                        <Check size={14} /> Current Logo
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Set as Movie Logo
                      </>
                    )}
                  </button>
                )}

                {/* Secondary flexible options */}
                {artworkTargetImage.isBackdrop && movie.posterUrl !== artworkTargetImage.url && (
                  <button
                    type="button"
                    disabled={artworkSaving}
                    onClick={() => handleSetPoster(artworkTargetImage.url)}
                    className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Film size={13} />
                    <span>Set as Poster Instead</span>
                  </button>
                )}
                {artworkTargetImage.isPoster && movie.backdropUrl !== artworkTargetImage.url && (
                  <button
                    type="button"
                    disabled={artworkSaving}
                    onClick={() => handleSetBackdrop(artworkTargetImage.url)}
                    className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Sparkles size={13} />
                    <span>Set as Backdrop Instead</span>
                  </button>
                )}
                {!artworkTargetImage.isLogo && movie.logoUrl !== artworkTargetImage.url && (
                  <button
                    type="button"
                    disabled={artworkSaving}
                    onClick={() => handleSetLogo(artworkTargetImage.url)}
                    className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-purple-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Sparkles size={13} className="text-purple-400" />
                    <span>Set as Movie Logo Instead</span>
                  </button>
                )}

                {/* Download Image Button (Requirement 1) */}
                <button
                  type="button"
                  onClick={() => handleDownloadImage(artworkTargetImage.url)}
                  className="w-full py-2.5 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
                >
                  <Download size={14} />
                  <span>Download Image</span>
                </button>

                <button
                  type="button"
                  onClick={() => setArtworkTargetImage(null)}
                  disabled={artworkSaving}
                  className="w-full py-2 px-3 rounded-xl bg-transparent hover:bg-white/5 text-gray-400 hover:text-gray-200 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Mobile Hamburger Action Modal (Edit, Complete, Delete) ─────────── */}
      <AnimatePresence>
        {showMobileActionModal && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md select-none"
            onClick={() => setShowMobileActionModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.98 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-sm bg-[#0e131f] border border-white/15 rounded-3xl p-5 shadow-2xl space-y-3.5 backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Pill handle */}
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto -mt-1 mb-1 sm:hidden" />

              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="min-w-0 pr-2">
                  <h3 className="text-sm font-bold text-white">Movie Actions</h3>
                  <p className="text-[11px] text-gray-400 truncate max-w-[240px]">{movie.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMobileActionModal(false)}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition cursor-pointer shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Action Buttons List */}
              <div className="space-y-2">
                {/* 1. Edit Action */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionModal(false);
                    setShowEditModal(true);
                  }}
                  className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-left transition cursor-pointer group active:scale-[0.98]"
                >
                  <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 group-hover:bg-amber-500/25 transition">
                    <Edit3 size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">Edit Movie</div>
                    <div className="text-[11px] text-gray-400">Update title, poster, links & metadata</div>
                  </div>
                  <ChevronRight size={16} className="text-gray-500 group-hover:text-gray-300 transition" />
                </button>

                {/* 2. Mark Complete / Incomplete Action */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionModal(false);
                    handleToggleCompleted();
                  }}
                  className={`w-full flex items-center gap-3.5 p-3 rounded-2xl border text-left transition cursor-pointer group active:scale-[0.98] ${isCompleted
                      ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10'
                    }`}
                >
                  <div className={`p-2.5 rounded-xl border transition ${isCompleted
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : 'bg-white/10 border-white/15 text-gray-300 group-hover:text-emerald-400'
                    }`}>
                    <CheckCircle2 size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {isCompleted ? 'Mark as Incomplete' : 'Mark as Completed'}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {isCompleted ? 'Reset watch status & progress' : 'Mark movie finished watching'}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-500 group-hover:text-gray-300 transition" />
                </button>

                {/* 3. Delete Action */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileActionModal(false);
                    handleDelete();
                  }}
                  className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-left transition cursor-pointer group active:scale-[0.98]"
                >
                  <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 group-hover:bg-red-500/30 transition">
                    <Trash2 size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-red-300">Delete Movie</div>
                    <div className="text-[11px] text-red-400/80">Remove from library completely</div>
                  </div>
                  <ChevronRight size={16} className="text-red-400/60 group-hover:text-red-300 transition" />
                </button>
              </div>

              {/* Cancel Button */}
              <button
                type="button"
                onClick={() => setShowMobileActionModal(false)}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold transition cursor-pointer text-center"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Toast Notification Pill ─────────────────────────────────────────── */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 inset-x-0 mx-auto w-fit z-50 px-4 py-2.5 rounded-2xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-2 shadow-2xl border border-emerald-400/30 backdrop-blur-md"
          >
            <CheckCircle2 size={16} />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
