import React from 'react';
import { Star, Check, MoreVertical, Play, Film, Tv, BookOpen, Headphones } from 'lucide-react';
import CachedImage from '../../../utils/imageCache';
import { YoutubeLogo } from '../utils/dashboardHelpers';
import { getEffectiveRating } from '../../../utils/ratingUtils';
import { mapUsToIndianRating, normalizeIndianRating } from '../../../utils/ageRatingUtils';

export default function MediaCard({
  item,
  type = 'anime',
  coverImg,
  rating,
  isCompleted,
  pct = 0,
  subLeft,
  subRight,
  badgeMediaType,
  fallbackIcon,
  isYouTube = false,
  accentBorder = 'hover:border-amber-400/50',
  onClick,
  onMouseEnter,
  onMouseLeave,
  onMobileMenuToggle,
}) {
  const defaultFallbackIcon = () => {
    if (fallbackIcon) return fallbackIcon;
    switch (type) {
      case 'movie': return <Film size={28} />;
      case 'webseries': return <Tv size={28} />;
      case 'manga': return <BookOpen size={28} />;
      case 'audioStory': return <Headphones size={28} />;
      default: return <Play size={28} />;
    }
  };

  const effectiveRatingObj = getEffectiveRating(item);
  const displayRating = effectiveRatingObj ? effectiveRatingObj.value : (rating && !isNaN(parseFloat(rating)) ? parseFloat(rating).toFixed(1) : null);
  const itemAgeRating = item?.ageRating || item?.contentRating || item?.certification || (item?.omdb?.rated ? (mapUsToIndianRating(item.omdb.rated) || normalizeIndianRating(item.omdb.rated)) : null);

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group relative flex-none w-32 sm:w-36 md:w-40 rounded-lg overflow-hidden bg-[#0d121f] border border-white/10 ${accentBorder} hover:shadow-2xl hover:shadow-black/80 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-black/60">
        <CachedImage
          src={coverImg}
          alt={item?.title || 'Media poster'}
          title={item?.title || ''}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Top Vignette Gradient Overlay for Maximum Readability on White/Light Posters */}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none z-[5]" />

        {/* Liquid Glass Rating Badge (Top-Left) */}
        {displayRating && (
          <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-[10px] font-black text-white flex items-center gap-1 shadow-[0_4px_16px_rgba(0,0,0,0.8)] backdrop-saturate-150 pointer-events-none">
            <Star size={10} className="fill-amber-400 text-amber-400 shrink-0" />
            <span className="leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{displayRating}</span>
          </div>
        )}

        {/* Red YouTube Logo Badge if YouTube folder */}
        {isYouTube && (
          <div className={`absolute top-2 ${onMobileMenuToggle ? 'right-9 md:right-2' : 'right-2'} z-10 p-1 bg-black/70 rounded-md flex items-center justify-center shadow-lg border border-red-500/40 backdrop-blur-md pointer-events-none`}>
            <YoutubeLogo size={14} />
          </div>
        )}

        {/* Liquid Glass Indian Age Rating Badge (Top-Right) */}
        {itemAgeRating && (
          <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xl border border-white/20 text-[9px] font-black text-white flex items-center shadow-[0_4px_16px_rgba(0,0,0,0.8)] backdrop-saturate-150 pointer-events-none tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {itemAgeRating}
          </div>
        )}

        {/* 3-Dot Options Button with Glassmorphism Effect (Mobile devices only, positioned at bottom right) */}
        {onMobileMenuToggle && (
          <div className="absolute bottom-2 right-2 z-20 md:hidden">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMobileMenuToggle(e);
              }}
              className="p-1 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-xl border border-white/25 text-white shadow-[0_4px_16px_rgba(0,0,0,0.8)] backdrop-saturate-150 transition-all duration-200 active:scale-90 hover:scale-110 cursor-pointer"
              title="Media Options"
            >
              <MoreVertical size={11} />
            </button>
          </div>
        )}

        {/* Green Small Tick in Bottom-Left Side if watched (Request 2) */}
        {isCompleted && (
          <div className="absolute bottom-2 left-2 z-20 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-950/50 pointer-events-none">
            <Check size={10} strokeWidth={3} className="text-black" />
          </div>
        )}

        {/* Watch Track Bar at Bottom (Original gradient color, 100% width if completed) */}
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
