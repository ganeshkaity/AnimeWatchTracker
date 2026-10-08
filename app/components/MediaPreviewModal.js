"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, CheckCircle2, Edit3, Trash2, HardDrive } from 'lucide-react';

/**
 * Maps language ISO codes to their full readable names
 */
export const getFullLanguageName = (codeOrName) => {
  if (!codeOrName || typeof codeOrName !== 'string') return null;
  const cleaned = codeOrName.trim().toLowerCase();

  const map = {
    hi: 'Hindi',
    hin: 'Hindi',
    hindi: 'Hindi',
    en: 'English',
    eng: 'English',
    english: 'English',
    ja: 'Japanese',
    jpn: 'Japanese',
    japanese: 'Japanese',
    ko: 'Korean',
    kor: 'Korean',
    korean: 'Korean',
    te: 'Telugu',
    tel: 'Telugu',
    telugu: 'Telugu',
    ta: 'Tamil',
    tam: 'Tamil',
    tamil: 'Tamil',
    ml: 'Malayalam',
    mal: 'Malayalam',
    malayalam: 'Malayalam',
    kn: 'Kannada',
    kan: 'Kannada',
    kannada: 'Kannada',
    bn: 'Bengali',
    ben: 'Bengali',
    bengali: 'Bengali',
    mr: 'Marathi',
    mar: 'Marathi',
    marathi: 'Marathi',
    pa: 'Punjabi',
    pan: 'Punjabi',
    punjabi: 'Punjabi',
    gu: 'Gujarati',
    guj: 'Gujarati',
    gujarati: 'Gujarati',
    ur: 'Urdu',
    urd: 'Urdu',
    urdu: 'Urdu',
    es: 'Spanish',
    spa: 'Spanish',
    spanish: 'Spanish',
    fr: 'French',
    fra: 'French',
    fre: 'French',
    french: 'French',
    de: 'German',
    deu: 'German',
    ger: 'German',
    german: 'German',
    zh: 'Chinese',
    zho: 'Chinese',
    chi: 'Chinese',
    chinese: 'Chinese',
    it: 'Italian',
    ita: 'Italian',
    italian: 'Italian',
    pt: 'Portuguese',
    por: 'Portuguese',
    portuguese: 'Portuguese',
    ru: 'Russian',
    rus: 'Russian',
    russian: 'Russian',
    ar: 'Arabic',
    ara: 'Arabic',
    arabic: 'Arabic',
    th: 'Thai',
    tha: 'Thai',
    thai: 'Thai',
    vi: 'Vietnamese',
    vie: 'Vietnamese',
    vietnamese: 'Vietnamese',
    id: 'Indonesian',
    ind: 'Indonesian',
    indonesian: 'Indonesian',
    tr: 'Turkish',
    tur: 'Turkish',
    turkish: 'Turkish',
  };

  if (map[cleaned]) return map[cleaned];
  // If multiple comma-separated
  if (codeOrName.includes(',')) {
    return codeOrName
      .split(',')
      .map(c => map[c.trim().toLowerCase()] || c.trim())
      .slice(0, 2)
      .join(', ');
  }
  return codeOrName.charAt(0).toUpperCase() + codeOrName.slice(1);
};

/**
 * Extracts 11-character YouTube video ID from various formats
 */
export const extractYouTubeId = (urlOrKey) => {
  if (!urlOrKey || typeof urlOrKey !== 'string') return null;
  const trimmed = urlOrKey.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/))([\w-]{11})/i);
  if (match && match[1]) {
    return match[1];
  }
  return null;
};

/**
 * Resolves teaser or trailer YouTube ID for a movie or watchlist item.
 * Priority:
 * 1. Explicitly selected / direct playable video (youtubeUrl / youtubeId / trailerUrl / trailerKey)
 * 2. Teaser in videos array (first priority among fetched videos)
 * 3. Trailer in videos array
 * 4. Any YouTube video in videos array
 */
export const getTeaserOrTrailerVideo = (item) => {
  if (!item) return null;
  const videos = Array.isArray(item.videos) ? item.videos : [];

  // 1. Explicit direct YouTube URL or ID set by user
  const directYt = extractYouTubeId(item.youtubeId || item.youtubeUrl || item.trailerUrl || item.trailerKey || item.youtubeTrailer);
  if (directYt) {
    return { id: directYt, type: 'TRAILER' };
  }

  // 2. Teaser from videos list
  const teaser = videos.find(v => {
    const type = (v.type || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    return (type === 'teaser' || name.includes('teaser')) && (v.key || v.url || v.id);
  });
  if (teaser) {
    const id = extractYouTubeId(teaser.key || teaser.url || teaser.id);
    if (id) return { id, type: 'Teaser', name: teaser.name };
  }

  // 3. Direct teaser property
  const directTeaserId = extractYouTubeId(item.teaserUrl || item.teaserKey || item.teaser);
  if (directTeaserId) return { id: directTeaserId, type: 'Teaser' };

  // 4. Trailer from videos list
  const trailer = videos.find(v => {
    const type = (v.type || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    return (type === 'trailer' || name.includes('trailer')) && (v.key || v.url || v.id);
  });
  if (trailer) {
    const id = extractYouTubeId(trailer.key || trailer.url || trailer.id);
    if (id) return { id, type: 'Trailer', name: trailer.name };
  }

  // 5. Any valid YouTube video
  const anyVid = videos.find(v => (v.key || v.url) && (v.site?.toLowerCase() === 'youtube' || !v.site));
  if (anyVid) {
    const id = extractYouTubeId(anyVid.key || anyVid.url || anyVid.id);
    if (id) return { id, type: anyVid.type || 'Video', name: anyVid.name };
  }

  // 6. YouTube path fallback
  if (item.isYouTube && item.localFilePath) {
    const fallbackId = extractYouTubeId(item.localFilePath);
    if (fallbackId) return { id: fallbackId, type: 'YouTube' };
  }

  return null;
};

export default function MediaPreviewModal({
  isOpen,
  item,
  type = 'movie',
  cardRect,
  onClose,
  onMouseEnter,
  onMouseLeave,
  onOpenDetails,
  onAskComplete,
  onEdit,
  onDelete,
  onTransfer,
}) {
  const [showVideo, setShowVideo] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 330 });
  const iframeRef = useRef(null);
  const videoTimerRef = useRef(null);

  // Extract video info
  const videoInfo = useMemo(() => getTeaserOrTrailerVideo(item), [item]);

  // Compute fixed position anchored over the card
  useEffect(() => {
    if (!cardRect || typeof window === 'undefined') return;

    const modalWidth = Math.min(340, Math.max(300, window.innerWidth - 32));
    const margin = 16;

    // Center horizontally over card
    let left = cardRect.left + (cardRect.width / 2) - (modalWidth / 2);
    if (left < margin) {
      left = margin;
    } else if (left + modalWidth > window.innerWidth - margin) {
      left = window.innerWidth - modalWidth - margin;
    }

    // Align vertically with slight top lift
    let top = cardRect.top - 24;
    if (top < margin) {
      top = margin;
    }
    const estimatedHeight = 390;
    if (top + estimatedHeight > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - estimatedHeight - margin);
    }

    setPos({ top, left, width: modalWidth });
  }, [cardRect]);

  // Handle 3-4s video autoplay timer
  useEffect(() => {
    setShowVideo(false);
    setIsMuted(true);
    if (videoTimerRef.current) {
      clearTimeout(videoTimerRef.current);
      videoTimerRef.current = null;
    }

    if (isOpen && videoInfo?.id) {
      videoTimerRef.current = setTimeout(() => {
        setShowVideo(true);
      }, 3500);
    }

    return () => {
      if (videoTimerRef.current) {
        clearTimeout(videoTimerRef.current);
        videoTimerRef.current = null;
      }
    };
  }, [isOpen, videoInfo, item?.id]);

  // Handle Mute / Unmute via YouTube postMessage
  const toggleMute = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;

    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    const command = nextMuted ? 'mute' : 'unMute';
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: command, args: [] }),
      '*'
    );
  };

  if (!isOpen || !item) return null;

  // Resolved attributes
  const title = (item.title || item.name || 'Untitled').toString();
  const logoUrl = item.logoUrl || item.images?.logos?.[0]?.url || null;
  const backdropImg =
    item.backdropUrl ||
    item.bannerUrl ||
    item.posterUrl ||
    item.posterPath ||
    item.images?.backdrops?.[0]?.url ||
    item.images?.posters?.[0]?.url ||
    (item.thumbnailBase64 || null);

  const isCompleted = Boolean(
    item.watched ||
    item.completed ||
    item.watchStatus === 'Completed' ||
    item.status === 'Completed' ||
    (item.watchProgress && item.watchProgress >= 95)
  );

  const year = item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : '');
  const ratingText = item.rating ? `★ ${parseFloat(item.rating).toFixed(1)}` : null;
  const runtimeStr = item.runtime
    ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m`
    : item.episodeCount
    ? `${item.episodeCount} Episodes`
    : item.duration
    ? `${Math.round(item.duration / 60)}m`
    : item.contentType || null;

  const rawGenre = Array.isArray(item.genres)
    ? item.genres.filter(g => g !== 'All').slice(0, 2).join(' • ')
    : typeof item.genres === 'string'
    ? item.genres.split(',').slice(0, 2).join(' • ')
    : type === 'movie'
    ? 'Movie'
    : type === 'webseries'
    ? 'Web-series'
    : 'Watchlist';

  // Full language name resolution (e.g., "hi" -> "Hindi")
  const rawLang = item.language || (item.spokenLanguages?.[0]?.name || item.spokenLanguages?.[0]?.english_name || null);
  const fullLanguageStr = getFullLanguageName(rawLang);

  // Description truncated up to 200 characters
  const rawDesc = (item.description || item.overview || item.synopsis || '').trim();
  const description =
    rawDesc.length > 200
      ? `${rawDesc.slice(0, 197).trim()}...`
      : rawDesc;

  return (
    <AnimatePresence>
      <motion.div
        key={`preview-modal-${item.id}`}
        initial={{ opacity: 0, scale: 0.94, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 4 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        style={{
          position: 'fixed',
          top: `${pos.top}px`,
          left: `${pos.left}px`,
          width: `${pos.width}px`,
          zIndex: 60,
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onClick={() => onOpenDetails(item)}
        className="rounded-2xl overflow-hidden border border-black bg-[#111622] text-white shadow-[0_25px_70px_rgba(0,0,0,1)] cursor-pointer select-none flex flex-col group"
      >
        {/* ── 1. Media Backdrop Banner / Autoplay YouTube Video ── */}
        <div className="relative aspect-[16/9] w-full bg-black overflow-hidden">
          {showVideo && videoInfo?.id ? (
            <div className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
              <iframe
                ref={iframeRef}
                src={`https://www.youtube-nocookie.com/embed/${videoInfo.id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoInfo.id}&playsinline=1&enablejsapi=1&rel=0&iv_load_policy=3&modestbranding=1`}
                title={`${title} teaser`}
                className="w-[140%] h-[140%] min-w-[140%] min-h-[140%] absolute inset-[-20%] object-cover pointer-events-none scale-110"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />

              {/* Plain Speaker SVG button to mute/unmute */}
              <button
                type="button"
                onClick={toggleMute}
                className="absolute top-2.5 right-2.5 z-30 p-2 rounded-full bg-black/80 hover:bg-black text-white border border-white/20 shadow-lg backdrop-blur-md transition-all active:scale-95 cursor-pointer"
                title={isMuted ? 'Unmute Teaser' : 'Mute Teaser'}
              >
                {isMuted ? (
                  /* Plain speaker with mute cross */
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-gray-200"
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" fillOpacity="0.2" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  /* Plain speaker with sound waves */
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-white"
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" fillOpacity="0.2" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>

              {/* Video Playing Badge */}
              <div className="absolute top-2.5 left-2.5 z-20 px-2 py-0.5 rounded-md bg-red-600/90 text-white font-extrabold text-[9px] uppercase tracking-wider shadow">
                {videoInfo.type || 'Teaser'}
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full bg-[#151a27]">
              {backdropImg ? (
                <img
                  src={backdropImg}
                  alt={title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-950/40 via-purple-950/20 to-black text-gray-500 text-xs">
                  {title}
                </div>
              )}

              {/* Top Full Language Word Badge (e.g. Hindi, English) */}
              {fullLanguageStr && (
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md text-[10px] font-bold text-gray-200 border border-white/10 shadow">
                  {fullLanguageStr}
                </div>
              )}
            </div>
          )}

          {/* Black vignette overlay at the bottom blending into panel */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#111622] via-[#111622]/40 to-transparent pointer-events-none" />

          {/* Logo or Stylized Title in the bottom-left of the banner image */}
          <div className="absolute bottom-2.5 left-3.5 right-12 z-20 pointer-events-none">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={title}
                className="max-h-11 sm:max-h-12 max-w-[190px] object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"
              />
            ) : (
              <h3 className="text-sm sm:text-base font-black tracking-wide text-white uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] line-clamp-2">
                {title}
              </h3>
            )}
          </div>
        </div>

        {/* ── 2. Content & Actions Panel ── */}
        <div className="p-3.5 space-y-3 bg-[#111622] border-t border-black">
          {/* Action Buttons Row */}
          <div className="flex items-center gap-2">
            {/* Primary Watch Now button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails(item);
              }}
              className="flex-1 py-2 px-3.5 rounded-xl bg-white hover:bg-gray-200 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md transition active:scale-95 cursor-pointer"
            >
              <Play size={13} fill="currentColor" />
              <span>{item.currentTime ? 'Resume' : 'Watch Now'}</span>
            </button>

            {/* Mark Complete / Incomplete button with check circle icon */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAskComplete(item);
              }}
              className={`w-9 h-9 rounded-xl flex items-center justify-center border transition shadow active:scale-95 cursor-pointer ${
                isCompleted
                  ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/40'
                  : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
              }`}
              title={isCompleted ? 'Mark Incomplete' : 'Mark as Completed'}
            >
              <CheckCircle2
                size={17}
                className={isCompleted ? 'text-emerald-400 fill-emerald-500/20' : 'text-gray-300'}
              />
            </button>

            {/* Edit button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center transition shadow active:scale-95 cursor-pointer"
              title="Edit"
            >
              <Edit3 size={14} />
            </button>

            {/* Transfer to active library (for watchlist items) */}
            {type === 'watchlist' && onTransfer && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTransfer(item);
                }}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-cyan-600/30 border border-white/20 text-cyan-300 flex items-center justify-center transition shadow active:scale-95 cursor-pointer"
                title="Transfer to Active Library"
              >
                <HardDrive size={14} />
              </button>
            )}

            {/* Delete button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item);
              }}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-rose-600/30 border border-white/20 text-gray-300 hover:text-rose-300 flex items-center justify-center transition shadow active:scale-95 cursor-pointer"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Metadata Row: 2024 • A • 1h 46m • 4 Languages • Action */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-gray-300">
            {year && <span>{year}</span>}
            {year && ratingText && <span className="text-gray-500">•</span>}
            {ratingText && (
              <span className="px-1.5 py-0.2 rounded border border-amber-400/30 bg-amber-500/10 text-[10px] text-amber-300 font-bold">
                {ratingText}
              </span>
            )}
            {(year || ratingText) && runtimeStr && <span className="text-gray-500">•</span>}
            {runtimeStr && <span>{runtimeStr}</span>}
            {rawGenre && <span className="text-gray-500">•</span>}
            {rawGenre && <span className="text-gray-400">{rawGenre}</span>}
          </div>

          {/* Description up to 200 characters */}
          {description && (
            <p className="text-[11px] leading-relaxed text-gray-400 line-clamp-3">
              {description}
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
