"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film,
  X,
  Play,
  CheckCircle2,
  Edit3,
  HardDrive,
  Trash2,
  Eye,
  Volume2,
  VolumeX,
  Star,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useOffline } from '../../../context/OfflineContext';
import { getEffectiveRating } from '../../../utils/ratingUtils';

export default function MobileMediaActionSheet({
  activeMobileMenu,
  onClose,
  router,
  onSelectAnime,
  handleOpenEditModal,
  handleDeleteAnime,
  handleDeleteMovie,
  handleDeleteWebseries,
  handleDeleteManga,
  handleDeleteAudioStory,
  handleDeleteWatchlist,
  handleToggleAnimeComplete,
  setMovieCompleteConfirm,
  setWebseriesCompleteConfirm,
  setMangaCompleteConfirm,
  setAudioStoryCompleteConfirm,
  setWatchlistCompleteConfirm,
  setMovieEditing,
  setWebseriesEditing,
  setEditingWatchlistItem,
  setTransferringWatchlistItem,
}) {
  const { isOffline, isManualOffline, setManualOffline } = useOffline();

  const [trailerKey, setTrailerKey] = useState(null);
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [logoUrl, setLogoUrl] = useState(null);

  const item = activeMobileMenu?.item;
  const type = activeMobileMenu?.type;

  // Extract initial logo, trailer, and schedule the 0.5s playback delay
  useEffect(() => {
    if (!item) {
      setTrailerKey(null);
      setIsPlayingTrailer(false);
      setLogoUrl(null);
      return;
    }

    // 1. Initial logo from item
    const initialLogo =
      item.logoUrl ||
      item.logo ||
      item.images?.logos?.[0]?.url ||
      (item.images?.logos?.[0]?.filePath
        ? `https://image.tmdb.org/t/p/w500${item.images.logos[0].filePath}`
        : null);
    setLogoUrl(initialLogo);

    // 2. Initial trailer key from item
    let initialKey = null;
    if (item.youtubeId) {
      initialKey = item.youtubeId;
    } else if (item.youtubeUrl) {
      const match = item.youtubeUrl.match(
        /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
      );
      if (match) initialKey = match[1];
    } else if (Array.isArray(item.videos) && item.videos.length > 0) {
      const match =
        item.videos.find(
          (v) => (v.type === 'Trailer' || v.type === 'Teaser') && (v.site === 'YouTube' || !v.site)
        ) || item.videos[0];
      if (match?.key) initialKey = match.key;
    }

    setTrailerKey(initialKey);
    setIsPlayingTrailer(false);
    setIsMuted(true);

    let isCancelled = false;

    // Background enrichment if logo or trailer is missing
    const fetchEnrichedMedia = async () => {
      try {
        if (!initialKey || !initialLogo) {
          if (type === 'movie' && item.tmdbId) {
            const res = await fetch(`/api/movies/details?id=${encodeURIComponent(item.tmdbId)}`);
            const data = await res.json();
            if (data.success && data.movie && !isCancelled) {
              if (!initialLogo && data.movie.images?.logos?.[0]?.url) {
                setLogoUrl(data.movie.images.logos[0].url);
              }
              if (!initialKey && data.movie.videos?.length > 0) {
                const tr =
                  data.movie.videos.find(
                    (v) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
                  ) || data.movie.videos[0];
                if (tr?.key) setTrailerKey(tr.key);
              }
            }
          } else if ((type === 'watchlist' || type === 'webseries') && item.tmdbId) {
            const cType = type === 'webseries' ? 'tv' : item.contentType || 'movie';
            const res = await fetch(
              `/api/watchlist/details?id=${encodeURIComponent(item.tmdbId)}&type=${encodeURIComponent(cType)}`
            );
            const data = await res.json();
            if (data.success && data.details && !isCancelled) {
              if (!initialLogo && (data.details.logoUrl || data.details.images?.logos?.[0]?.url)) {
                setLogoUrl(data.details.logoUrl || data.details.images.logos[0].url);
              }
              if (!initialKey && data.details.videos?.length > 0) {
                const tr =
                  data.details.videos.find(
                    (v) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
                  ) || data.details.videos[0];
                if (tr?.key) setTrailerKey(tr.key);
              }
            }
          } else if (type === 'anime') {
            const queryTitle = item.title || item.name;
            if (queryTitle) {
              const res = await fetch(`/api/anime/details?q=${encodeURIComponent(queryTitle)}`);
              const data = await res.json();
              if (data.success && data.details && !isCancelled) {
                if (!initialLogo && (data.details.logoUrl || data.details.images?.logos?.[0]?.url)) {
                  setLogoUrl(data.details.logoUrl || data.details.images.logos[0].url);
                }
                if (!initialKey && data.details.videos?.length > 0) {
                  const tr =
                    data.details.videos.find(
                      (v) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
                    ) || data.details.videos[0];
                  if (tr?.key) setTrailerKey(tr.key);
                }
              }
            }
          }
        }
      } catch (_) {
        // Fallback silently to static backdrop
      }
    };

    fetchEnrichedMedia();

    // User requirement: "and wait 0.5 sec to play the trailer or teaser if available"
    const timer = setTimeout(() => {
      if (!isCancelled) {
        setIsPlayingTrailer(true);
      }
    }, 500);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [item, type]);

  if (!activeMobileMenu || !item) return null;

  const backdropImage =
    item.backdropUrl ||
    item.banner ||
    item.backdrop ||
    item.coverUrl ||
    item.posterUrl ||
    item.posterPath ||
    item.thumbnailBase64 ||
    (item.thumbnailPath ? `/api/image?path=${encodeURIComponent(item.thumbnailPath)}` : '') ||
    'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=800&auto=format&fit=crop';

  const badgeText =
    item.language ||
    item.originalLanguage ||
    (Array.isArray(item.genres) && item.genres[0]) ||
    (type === 'movie'
      ? 'Movie'
      : type === 'webseries'
      ? 'Web-Series'
      : type === 'anime'
      ? 'Anime'
      : type === 'manga'
      ? 'Manga'
      : type === 'audioStory'
      ? 'Audio'
      : 'Watchlist');

  const ratingObj = getEffectiveRating(item);
  const displayRating = ratingObj ? ratingObj.value : item.rating || null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#0f1422] border-t sm:border border-white/20 overflow-hidden shadow-2xl text-white pb-6 sm:pb-5 max-h-[92vh] overflow-y-auto no-scrollbar"
        >
          {/* Cover Photo & Trailer Preview Banner (Image 1 UI) */}
          <div className="relative aspect-video w-full bg-black overflow-hidden group select-none">
            {/* 1. Backdrop Image */}
            <img
              src={backdropImage}
              alt={item.title || 'Media preview'}
              className="w-full h-full object-cover"
            />

            {/* 2. Embedded Video Trailer Player (starts after 0.5 sec) */}
            {isPlayingTrailer && trailerKey && (
              <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
                <iframe
                  src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${isMuted ? '1' : '0'}&controls=0&loop=1&playlist=${trailerKey}&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3`}
                  title="Trailer / Teaser Preview"
                  className="w-full h-full scale-[1.38] object-cover pointer-events-none"
                  allow="autoplay; encrypted-media"
                />
              </div>
            )}

            {/* Top Vignette Gradient */}
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/75 to-transparent pointer-events-none z-20" />

            {/* Bottom Vignette Gradient */}
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0f1422] via-[#0f1422]/70 to-transparent pointer-events-none z-20" />

            {/* Top-Left Category / Language Badge (Image 1 style) */}
            <div className="absolute top-3 left-3 z-30">
              <span className="px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md text-white font-bold text-xs border border-white/20 tracking-wide uppercase shadow-lg select-none">
                {badgeText}
              </span>
            </div>

            {/* Top-Right Close Button with Glassmorphism */}
            <div className="absolute top-3 right-3 z-30">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/20 text-white shadow-xl transition-all active:scale-95 cursor-pointer"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Bottom-Left Title Logo / Stylized Title (Image 1 style) */}
            <div className="absolute bottom-3 left-3 z-30 max-w-[75%] pointer-events-none flex items-end">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={item.title || ''}
                  className="max-h-12 sm:max-h-14 w-auto max-w-full object-contain filter drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)]"
                />
              ) : (
                <h3 className="text-lg sm:text-xl font-black text-white tracking-wider uppercase drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] font-sans line-clamp-2">
                  {item.title}
                </h3>
              )}
            </div>

            {/* Bottom-Right Volume Toggle (if trailer is active) */}
            {isPlayingTrailer && trailerKey && (
              <div className="absolute bottom-3 right-3 z-30 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  className="p-1.5 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white shadow-lg transition active:scale-90 cursor-pointer"
                  title={isMuted ? 'Unmute Trailer' : 'Mute Trailer'}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </div>
            )}
          </div>

          {/* Metadata Sub-Bar */}
          <div className="px-5 pt-3 pb-1 flex items-center justify-between text-xs text-gray-400 border-b border-white/5">
            <div className="flex items-center gap-2 flex-wrap">
              {displayRating && (
                <span className="flex items-center gap-1 font-bold text-amber-400">
                  <Star size={12} className="fill-amber-400" />
                  <span>{displayRating}</span>
                </span>
              )}
              {item.year && <span>• {item.year}</span>}
              {item.totalEpisodes ? (
                <span>• {item.totalEpisodes} Ep</span>
              ) : item.runtime ? (
                <span>• {Math.floor(item.runtime / 60)}h {item.runtime % 60}m</span>
              ) : null}
            </div>

            <span className="text-[11px] uppercase font-bold text-gray-400 tracking-wider">
              {type === 'movie'
                ? 'Movie'
                : type === 'webseries'
                ? 'Web-Series'
                : type === 'anime'
                ? 'Anime'
                : type === 'manga'
                ? 'Manga'
                : type === 'audioStory'
                ? 'Audio Story'
                : 'Watchlist'}
            </span>
          </div>

          {/* Action Buttons List */}
          <div className="p-4 space-y-1.5 pt-2">
            {/* Play / Open Details (Primary Action) */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (type === 'movie') {
                  router.push(`/movies/${item.id}`);
                } else if (type === 'webseries') {
                  router.push(`/webseries/${item.id}`);
                } else if (type === 'anime') {
                  onSelectAnime(item.id);
                } else if (type === 'manga') {
                  router.push(`/manga/${item.id}`);
                } else if (type === 'audioStory') {
                  router.push(`/audio-story/${item.id}`);
                } else {
                  router.push(`/watchlist/${item.id}`);
                }
              }}
              className="w-full text-left px-3.5 py-3 rounded-2xl bg-gradient-to-r from-[#7c5cff] to-[#a855f7] hover:from-[#6b4ae0] hover:to-[#9333ea] text-white flex items-center gap-3 text-sm font-bold shadow-lg shadow-purple-500/20 transition active:scale-98 cursor-pointer"
            >
              <Play size={18} fill="currentColor" />
              <span>
                {type === 'anime'
                  ? 'Open Anime'
                  : type === 'movie'
                  ? 'Play Movie'
                  : type === 'webseries'
                  ? 'Play Series'
                  : type === 'manga'
                  ? 'Read Manga'
                  : type === 'audioStory'
                  ? 'Listen Audio'
                  : 'Open Details'}
              </span>
            </button>

            {/* Complete / Incomplete */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (type === 'movie') {
                  setMovieCompleteConfirm(item);
                } else if (type === 'webseries') {
                  setWebseriesCompleteConfirm(item);
                } else if (type === 'anime') {
                  handleToggleAnimeComplete(item);
                } else if (type === 'manga') {
                  setMangaCompleteConfirm(item);
                } else if (type === 'audioStory') {
                  setAudioStoryCompleteConfirm(item);
                } else {
                  setWatchlistCompleteConfirm(item);
                }
              }}
              className="w-full text-left px-3.5 py-2.5 rounded-2xl hover:bg-white/10 flex items-center gap-3 text-sm font-semibold text-white transition active:scale-98 cursor-pointer"
            >
              <CheckCircle2
                size={18}
                className={
                  item.watched ||
                  item.isWatched ||
                  item.status === 'Completed' ||
                  (item.progressPercent && item.progressPercent >= 100)
                    ? 'text-emerald-400'
                    : 'text-gray-400'
                }
              />
              <span>
                {item.watched ||
                item.isWatched ||
                item.status === 'Completed' ||
                (item.progressPercent && item.progressPercent >= 100)
                  ? 'Mark Incomplete'
                  : 'Mark as Completed'}
              </span>
            </button>

            {/* Edit */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (type === 'movie') {
                  setMovieEditing(item);
                } else if (type === 'webseries') {
                  setWebseriesEditing(item);
                } else if (type === 'anime') {
                  handleOpenEditModal(item);
                } else {
                  setEditingWatchlistItem(item);
                }
              }}
              className="w-full text-left px-3.5 py-2.5 rounded-2xl hover:bg-white/10 flex items-center gap-3 text-sm font-semibold text-white transition active:scale-98 cursor-pointer"
            >
              <Edit3 size={18} className="text-amber-400" />
              <span>Edit Details</span>
            </button>

            {/* Transfer (if watchlist) */}
            {type === 'watchlist' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setTransferringWatchlistItem(item);
                }}
                className="w-full text-left px-3.5 py-2.5 rounded-2xl hover:bg-white/10 flex items-center gap-3 text-sm font-semibold text-white transition active:scale-98 cursor-pointer"
              >
                <HardDrive size={18} className="text-cyan-400" />
                <span>Transfer to Active Library</span>
              </button>
            )}

            {/* Offline / Online Mode Toggle */}
            <button
              type="button"
              onClick={() => setManualOffline(!isManualOffline)}
              className="w-full text-left px-3.5 py-2.5 rounded-2xl hover:bg-white/10 flex items-center justify-between text-sm font-semibold text-white transition active:scale-98 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {isOffline ? (
                  <WifiOff size={18} className="text-amber-400" />
                ) : (
                  <Wifi size={18} className="text-emerald-400" />
                )}
                <span>{isManualOffline ? 'Switch to Online Mode' : 'Switch to Offline Mode'}</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  isOffline
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {isOffline ? 'Offline' : 'Online'}
              </span>
            </button>

            {/* View Full Details */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (type === 'movie') {
                  router.push(`/movies/${item.id}`);
                } else if (type === 'webseries') {
                  router.push(`/webseries/${item.id}`);
                } else if (type === 'anime') {
                  onSelectAnime(item.id);
                } else if (type === 'manga') {
                  router.push(`/manga/${item.id}`);
                } else if (type === 'audioStory') {
                  router.push(`/audio-story/${item.id}`);
                } else {
                  router.push(`/watchlist/${item.id}`);
                }
              }}
              className="w-full text-left px-3.5 py-2.5 rounded-2xl hover:bg-white/10 flex items-center gap-3 text-sm font-semibold text-gray-300 transition active:scale-98 cursor-pointer"
            >
              <Eye size={18} className="text-indigo-400" />
              <span>View Full Details</span>
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={(e) => {
                onClose();
                if (type === 'movie') {
                  handleDeleteMovie(item, e);
                } else if (type === 'webseries') {
                  handleDeleteWebseries(item, e);
                } else if (type === 'anime') {
                  handleDeleteAnime(item, e);
                } else if (type === 'manga') {
                  handleDeleteManga(item, e);
                } else if (type === 'audioStory') {
                  handleDeleteAudioStory(item, e);
                } else {
                  handleDeleteWatchlist(item, e);
                }
              }}
              className="w-full text-left px-3.5 py-2.5 rounded-2xl hover:bg-rose-500/20 text-rose-300 flex items-center gap-3 text-sm font-semibold transition active:scale-98 cursor-pointer"
            >
              <Trash2 size={18} className="text-rose-400" />
              <span>Delete</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
