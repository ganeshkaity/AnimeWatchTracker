"use client";

import React, { memo } from 'react';
import { Star, Check, Play, Film, Tv, BookOpen, Headphones, MoreVertical } from 'lucide-react';
import CachedImage from '../../../utils/imageCache';
import { toFanartBigPreview } from '../../../lib/fanartUtils';
import { getEffectiveRating } from '../../../utils/ratingUtils';

function ContinueWatchingCard({
  item,
  mediaType = 'anime',
  backdropImg,
  logoUrl,
  title,
  subText,
  rating,
  pct = 0,
  isCompleted = false,
  fallbackIcon,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onMobileMenuToggle,
}) {
  const defaultFallbackIcon = () => {
    if (fallbackIcon) return fallbackIcon;
    switch (mediaType) {
      case 'movie': return <Film size={28} />;
      case 'webseries': return <Tv size={28} />;
      case 'manga': return <BookOpen size={28} />;
      case 'audioStory': return <Headphones size={28} />;
      default: return <Play size={28} />;
    }
  };

  const effectiveRatingObj = getEffectiveRating(item);
  const displayRating = effectiveRatingObj ? effectiveRatingObj.value : (rating && !isNaN(parseFloat(rating)) ? parseFloat(rating).toFixed(1) : null);

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="group relative flex-none w-44 sm:w-52 md:w-60 lg:w-64 aspect-[16/9] rounded-lg overflow-hidden bg-[#0d121f] border border-white/10 hover:border-amber-400/50 hover:shadow-2xl hover:shadow-black/90 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col select-none will-change-transform"
      style={{ transform: 'translateZ(0)' }}
    >
      <div className="relative w-full h-full overflow-hidden bg-black/60">
        {backdropImg ? (
          <CachedImage
            src={backdropImg}
            alt={title || 'Media backdrop'}
            title={title || ''}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-1.5 p-3">
            {defaultFallbackIcon()}
            <span className="text-[11px] font-bold text-white/90 line-clamp-1 text-center">{title}</span>
          </div>
        )}

        {/* Ambient Gradient Overlay for text and logo contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/80 via-black/35 to-transparent pointer-events-none z-[5]" />

        {/* Liquid Glass Rating Badge (Top-Left) */}
        {displayRating && (
          <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-black/80 sm:bg-black/60 sm:backdrop-blur-xl border border-white/20 text-[10px] font-black text-white flex items-center gap-1 shadow-[0_4px_16px_rgba(0,0,0,0.8)] sm:backdrop-saturate-150 pointer-events-none">
            <Star size={10} className="fill-amber-400 text-amber-400 shrink-0" />
            <span className="leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{displayRating}</span>
          </div>
        )}

        {/* 3-Dot Options Button (Mobile devices only) */}
        {onMobileMenuToggle && (
          <div className="absolute top-2 right-2 z-20 md:hidden">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMobileMenuToggle(e);
              }}
              className="p-1.5 rounded-full bg-black/80 hover:bg-black border border-white/30 text-white shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-all duration-200 active:scale-90 hover:scale-110 cursor-pointer"
              title="Media Options"
            >
              <MoreVertical size={13} />
            </button>
          </div>
        )}

        {/* Hover Center Play Button Action */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-black/70 sm:backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl group-hover:scale-110 transition-transform">
            <Play size={18} className="fill-white translate-x-0.5" />
          </div>
        </div>

        {/* Logo or Title in bottom-left */}
        <div className="absolute bottom-2.5 left-2.5 z-10 max-w-[75%] pointer-events-none">
          {logoUrl ? (
            <img
              src={logoUrl.startsWith('http') || logoUrl.startsWith('data:') ? toFanartBigPreview(logoUrl) : `/api/image?path=${encodeURIComponent(logoUrl)}`}
              alt={title}
              loading="lazy"
              decoding="async"
              className="max-h-7 sm:max-h-9 w-auto max-w-full object-contain object-left drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"
            />
          ) : (
            <span className="text-xs sm:text-sm font-black text-white line-clamp-1 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
              {title}
            </span>
          )}
          {subText && (
            <span className="text-[10px] text-amber-300/90 font-medium block mt-0.5 line-clamp-1 drop-shadow">
              {subText}
            </span>
          )}
        </div>

        {/* Green Small Tick in Bottom-Right Side if watched */}
        {isCompleted && (
          <div className="absolute bottom-2.5 right-2.5 z-20 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-950/50 pointer-events-none">
            <Check size={10} strokeWidth={3} className="text-black" />
          </div>
        )}

        {/* Progress Track Bar */}
        {(isCompleted || pct > 0) && (
          <div className="absolute bottom-0 inset-x-0 h-1 sm:h-1.5 bg-black/60 z-20 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 transition-all duration-300"
              style={{ width: `${isCompleted ? 100 : Math.min(100, Math.max(3, pct))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ContinueWatchingCard);
